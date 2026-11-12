"""
Per-call enforcement. For each tools/call:

1. Map the downstream tool to an AgentShield action (unmapped -> EXECUTE on "tool:<name>").
2. Canonicalize every resource path; a path outside the root is rejected with no gateway or downstream call.
3. For each resource, get a decision: evaluate (or, for a retry of the same call, check the review it created).
   DENY -> blocked. ALLOW -> one-time token. REVIEW -> wait up to reviewWaitSeconds; APPROVED -> claim (token);
   REJECTED / expired -> blocked; still pending -> held, with the review id to approve.
   Multi-path calls need every resource to be allowed or approved.
4. Redeem every token with the same tool, action, resource and arguments. Any failure: no downstream call.
5. Call the downstream server with the canonical arguments.
6. Send the text output to the gateway's output inspection: DENY -> withheld, REVIEW -> redacted, CLEAN -> as is.

Any gateway error (unreachable, timeout, non-2xx, malformed reply) fails closed. Logs (stderr) carry tool names,
actions, root-relative resources, decisions and ids, never arguments, outputs, tokens or keys.
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Awaitable, Callable, Dict, List, Optional, Sequence, Tuple, Union

import anyio
import mcp_types as types

from .config import UNMAPPED_ACTION, ProxyConfig, ToolMapping
from .gateway import sdk
from .paths import PathRejected, canonicalize

log = logging.getLogger("agentshield.mcp_proxy")

# The gateway accepts at most this many UTF-16 code units (Java characters) of output to inspect.
MAX_INSPECT_CHARS = 256 * 1024
REVIEW_POLL_SECONDS = 3.0
# Used until the gateway reports the review's real expiry (agentshield.review.ttl-minutes defaults to 30).
DEFAULT_REVIEW_TTL_SECONDS = 30 * 60

DownstreamCall = Callable[[str, Dict[str, Any]], Awaitable[types.CallToolResult]]
Progress = Callable[[str], Awaitable[None]]


def text_result(text: str, *, is_error: bool = True) -> types.CallToolResult:
    return types.CallToolResult(content=[types.TextContent(text=text)], is_error=is_error)


def utf16_length(text: str) -> int:
    return len(text.encode("utf-16-le")) // 2


def operation_key(tool: str, downstream_tool: str, action: str, resource: str, arguments: Dict[str, Any]) -> str:
    """sha256 over the operation and its canonical arguments: a retry of the same call has the same key."""
    canonical = json.dumps([tool, downstream_tool, action, resource, arguments], sort_keys=True,
                           separators=(",", ":"), ensure_ascii=False, default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def describe_findings(findings: Sequence[Any]) -> List[str]:
    """One line per finding: category, type, location and the gateway's redacted preview (never a raw value)."""
    return [f"- {f.category} {f.type} at {f.location}: {f.preview}" for f in findings]


def _expiry_epoch(expires_at: Optional[str]) -> Optional[float]:
    if not expires_at:
        return None
    try:
        return datetime.fromisoformat(expires_at.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


@dataclass(frozen=True)
class Operation:
    downstream_tool: str
    tool: str
    action: str
    resource: str
    arguments: Dict[str, Any]
    key: str


@dataclass(frozen=True)
class Granted:
    token: Optional[str]
    request_id: Optional[str]
    how: str  # "allowed" or "approved"


@dataclass(frozen=True)
class Blocked:
    message: str


@dataclass(frozen=True)
class Pending:
    review_id: str


Outcome = Union[Granted, Blocked, Pending]


@dataclass
class _ReviewEntry:
    review_id: str
    expires: float


class Enforcer:
    def __init__(self, config: ProxyConfig, client: Any, session_id: str, downstream: DownstreamCall, *,
                 config_error: Optional[str] = None, sleep: Callable[[float], Awaitable[None]] = anyio.sleep,
                 monotonic: Callable[[], float] = time.monotonic, clock: Callable[[], float] = time.time,
                 poll_seconds: float = REVIEW_POLL_SECONDS):
        self.config = config
        self.client = client
        self.session_id = session_id
        self.downstream = downstream
        self.config_error = config_error
        self.sleep = sleep
        self.monotonic = monotonic
        self.clock = clock
        self.poll_seconds = poll_seconds
        # operation key -> the review it created, until that review expires (retry checks it instead of re-asking).
        self.reviews: Dict[str, _ReviewEntry] = {}

    # ------------------------------------------------------------------ entry point

    async def call(self, name: str, arguments: Optional[Dict[str, Any]],
                   progress: Optional[Progress] = None) -> types.CallToolResult:
        arguments = dict(arguments or {})
        if self.client is None:
            log.info("call %s: not run, AgentShield is not configured", name)
            return text_result(f"Blocked: AgentShield is not configured ({self.config_error}). "
                               "Nothing was run. Set the AgentShield environment variables and restart the proxy.")

        mapping = self.config.tools.get(name)
        try:
            operations, call_arguments = self._operations(name, mapping, arguments)
        except PathRejected as error:
            log.info("call %s: rejected before evaluation (%s)", name, error)
            return text_result(f"Blocked by AgentShield proxy: {error}. Only paths inside the allowed directory "
                               "can be used. Nothing was run.")

        try:
            granted = await self._authorize(operations, progress)
            if not isinstance(granted, list):
                return granted
            for op, grant in zip(operations, granted):
                await self._redeem(op, grant)
        except sdk.GatewayError as error:
            log.info("call %s: gateway error %s, not run (fail closed)", name, type(error).__name__)
            return text_result(f"Blocked: the AgentShield gateway could not be used ({type(error).__name__}: "
                               f"{error}). Nothing was run (fail closed).")

        log.info("call %s: decision redeemed, calling the downstream server", name)
        try:
            result = await self.downstream(name, call_arguments)
        except Exception as error:  # noqa: BLE001 - any downstream failure becomes a tool error
            log.info("call %s: downstream call failed (%s)", name, type(error).__name__)
            return text_result(f"The {name} call was allowed, but the downstream server failed "
                               f"({type(error).__name__}).")
        return await self._inspect_output(name, result)

    # ------------------------------------------------------------------ operations

    def _operations(self, name: str, mapping: Optional[ToolMapping],
                    arguments: Dict[str, Any]) -> Tuple[List[Operation], Dict[str, Any]]:
        """One operation per resource, and the arguments the downstream server will receive."""
        if mapping is None:
            resources = [f"tool:{name}"]
            action = UNMAPPED_ACTION
            call_arguments = arguments
        elif not mapping.resource_from:
            resources = ["."]
            action = mapping.action
            call_arguments = arguments
        else:
            action = mapping.action
            call_arguments = dict(arguments)
            resources = []
            for arg in mapping.resource_from:
                value = arguments.get(arg)
                if isinstance(value, list):
                    if not value:
                        raise PathRejected(f"argument '{arg}' is an empty list")
                    canon = [canonicalize(self.config.root, item) for item in value]
                    call_arguments[arg] = [c.absolute for c in canon]
                    resources.extend(c.relative for c in canon)
                else:
                    if value is None:
                        raise PathRejected(f"argument '{arg}' is missing")
                    canon_one = canonicalize(self.config.root, value)
                    call_arguments[arg] = canon_one.absolute
                    resources.append(canon_one.relative)
            if not resources:
                raise PathRejected("no resource path was given")
        # The gateway inspects exactly what the downstream server will receive, and binds it to the token.
        ops = []
        seen = set()
        for resource in resources:
            if resource in seen:
                continue
            seen.add(resource)
            ops.append(Operation(downstream_tool=name, tool=self.config.tool, action=action, resource=resource,
                                 arguments=call_arguments,
                                 key=operation_key(self.config.tool, name, action, resource, call_arguments)))
        return ops, call_arguments

    # ------------------------------------------------------------------ decisions

    async def _authorize(self, operations: List[Operation],
                         progress: Optional[Progress]) -> Union[List[Granted], types.CallToolResult]:
        outcomes: List[Outcome] = []
        for op in operations:
            outcome = await self._decide(op)
            if isinstance(outcome, Blocked):
                return text_result(outcome.message)
            outcomes.append(outcome)

        deadline = self.monotonic() + self.config.review_wait_seconds
        held: List[str] = []
        granted: List[Granted] = []
        for op, outcome in zip(operations, outcomes):
            if isinstance(outcome, Pending):
                outcome = await self._wait(op, outcome.review_id, deadline, progress)
                if isinstance(outcome, Blocked):
                    return text_result(outcome.message)
                if isinstance(outcome, Pending):
                    held.append(outcome.review_id)
                    continue
            granted.append(outcome)
        if held:
            ids = ", ".join(held)
            noun, it = ("review", "it") if len(held) == 1 else ("reviews", "them")
            log.info("call %s: held for %s %s", operations[0].downstream_tool, noun, ids)
            return text_result(f"Held for human {noun} {ids}. Approve {it} in the AgentShield console, then ask me "
                               "to retry this exact action.")
        return granted

    def _known_review(self, key: str) -> Optional[str]:
        now = self.clock()
        for stale in [k for k, entry in self.reviews.items() if entry.expires <= now]:
            del self.reviews[stale]
        entry = self.reviews.get(key)
        return entry.review_id if entry else None

    async def _decide(self, op: Operation) -> Outcome:
        review_id = self._known_review(op.key)
        if review_id is not None:
            outcome = await self._check_known_review(op, review_id)
            if outcome is not None:
                return outcome

        evaluation = await anyio.to_thread.run_sync(lambda: self.client.evaluate(
            session_id=self.session_id, action=op.action, resource=op.resource, tool=op.tool,
            arguments=op.arguments))
        log.info("evaluate %s %s %s -> %s (request %s)", op.tool, op.action, op.resource, evaluation.decision,
                 evaluation.request_id)
        if evaluation.decision == "DENY":
            lines = [f"Blocked by AgentShield: {evaluation.reason}"]
            if evaluation.inspection_findings:
                lines.append("Findings (redacted previews):")
                lines.extend(describe_findings(evaluation.inspection_findings))
            lines.append(f"Resource: {op.resource}. Request {evaluation.request_id}. Nothing was run.")
            return Blocked("\n".join(lines))
        if evaluation.decision == "ALLOW":
            if not evaluation.decision_token:
                return Blocked("Blocked: the gateway allowed the call but returned no decision token. "
                               "Nothing was run (fail closed).")
            return Granted(evaluation.decision_token, evaluation.request_id, "allowed")
        # REVIEW
        if not evaluation.review_request_id:
            return Blocked("Blocked: the gateway asked for review but returned no review id. Nothing was run.")
        self.reviews[op.key] = _ReviewEntry(evaluation.review_request_id,
                                            self.clock() + DEFAULT_REVIEW_TTL_SECONDS)
        return Pending(evaluation.review_request_id)

    async def _check_known_review(self, op: Operation, review_id: str) -> Optional[Outcome]:
        """A retry of a held call: the review it created decides. None: start over with a new evaluation."""
        try:
            review = await anyio.to_thread.run_sync(lambda: self.client.get_review(review_id))
        except sdk.GatewayRejected as error:
            if error.status == 404:
                self.reviews.pop(op.key, None)
                return None
            raise
        log.info("retry %s %s %s: review %s is %s", op.tool, op.action, op.resource, review_id, review.status)
        if review.status == "APPROVED" and review.consumed:
            self.reviews.pop(op.key, None)
            return None
        return await self._review_outcome(op, review)

    async def _review_outcome(self, op: Operation, review: Any) -> Outcome:
        """Blocked, Granted (claimed), or Pending for one read of a review."""
        expires = _expiry_epoch(review.expires_at)
        if expires is not None and op.key in self.reviews:
            self.reviews[op.key].expires = expires
        if review.expired:
            self.reviews.pop(op.key, None)
            return Blocked(f"Blocked: review {review.review_id} expired before it was approved and used. "
                           "Nothing was run. Ask again to create a new review.")
        if review.status == "REJECTED":
            self.reviews.pop(op.key, None)
            who = review.reviewer or "an operator"
            return Blocked(f"Blocked by AgentShield: review {review.review_id} was rejected by {who}"
                           f"{': ' + review.note if review.note else ''}. Nothing was run.")
        if review.status == "APPROVED":
            if review.consumed:
                self.reviews.pop(op.key, None)
                return Blocked(f"Blocked: the approval of review {review.review_id} was already used. "
                               "Nothing was run.")
            claim = await anyio.to_thread.run_sync(lambda: self.client.claim_review(review.review_id))
            self.reviews.pop(op.key, None)
            if (claim.tool, claim.action, claim.resource) != (op.tool, op.action, op.resource):
                return Blocked("Blocked: the approved operation does not match this call. Nothing was run.")
            log.info("review %s approved and claimed (request %s)", review.review_id, claim.request_id)
            return Granted(claim.decision_token, claim.request_id, "approved")
        return Pending(review.review_id)

    async def _wait(self, op: Operation, review_id: str, deadline: float,
                    progress: Optional[Progress]) -> Outcome:
        while True:
            review = await anyio.to_thread.run_sync(lambda: self.client.get_review(review_id))
            outcome = await self._review_outcome(op, review)
            if not isinstance(outcome, Pending):
                return outcome
            remaining = deadline - self.monotonic()
            if remaining <= 0:
                return outcome
            if progress is not None:
                await progress(f"Waiting for human review {review_id} in the AgentShield console")
            await self.sleep(min(self.poll_seconds, remaining))

    async def _redeem(self, op: Operation, grant: Granted) -> None:
        if not grant.token:
            raise sdk.MalformedResponse("the gateway returned no decision token")
        await anyio.to_thread.run_sync(lambda: self.client.redeem(
            token=grant.token, tool=op.tool, action=op.action, resource=op.resource,
            expected_request_id=grant.request_id, arguments=op.arguments))
        log.info("redeemed %s decision for %s %s %s (request %s)", grant.how, op.tool, op.action, op.resource,
                 grant.request_id)

    # ------------------------------------------------------------------ output

    async def _inspect_output(self, name: str, result: types.CallToolResult) -> types.CallToolResult:
        texts: List[str] = []
        others: List[Any] = []
        for block in result.content:
            if isinstance(block, types.TextContent):
                texts.append(block.text)
            elif isinstance(block, types.EmbeddedResource) and isinstance(block.resource, types.TextResourceContents):
                texts.append(block.resource.text)
            else:
                others.append(block)
        if result.structured_content is not None:
            # Structured content would reach the model without inspection, so it is never forwarded.
            log.info("call %s: structured content dropped (only inspected content blocks are forwarded)", name)
        if others:
            log.info("call %s: %d non-text content block(s) passed through WITHOUT inspection", name, len(others))
        if not texts:
            return types.CallToolResult(content=list(result.content), is_error=result.is_error)

        content = "\n".join(texts)
        size = utf16_length(content)
        if size > MAX_INSPECT_CHARS:
            log.info("call %s: output withheld, %d characters is over the inspection limit", name, size)
            return text_result(f"Output withheld by AgentShield: the {name} output is {size} characters, more than "
                               f"the {MAX_INSPECT_CHARS} that can be inspected. The call did run. Ask for a smaller "
                               "part (for example with head or tail).")
        try:
            inspection = await anyio.to_thread.run_sync(lambda: self.client.inspect_output(
                session_id=self.session_id, tool=self.config.tool, content=content))
        except sdk.GatewayError as error:
            log.info("call %s: output inspection failed (%s), output withheld", name, type(error).__name__)
            return text_result(f"Output withheld by AgentShield: the {name} call ran, but its output could not be "
                               f"inspected ({type(error).__name__}).")
        log.info("output of %s -> %s (request %s, %d finding(s))", name, inspection.verdict,
                 inspection.request_id, len(inspection.findings))
        if inspection.verdict == "DENY":
            kinds = ", ".join(sorted({f.type for f in inspection.findings})) or "sensitive content"
            return text_result(f"Output withheld by AgentShield: contained {kinds}. "
                               f"Request {inspection.request_id}.")
        if inspection.verdict == "REVIEW":
            kinds = ", ".join(sorted({f.type for f in inspection.findings})) or "sensitive content"
            note = types.TextContent(text=f"[AgentShield redacted {kinds} from this output. "
                                          f"Request {inspection.request_id}.]")
            return types.CallToolResult(content=[types.TextContent(text=inspection.redacted_content), *others, note],
                                        is_error=result.is_error)
        return types.CallToolResult(content=list(result.content), is_error=result.is_error)
