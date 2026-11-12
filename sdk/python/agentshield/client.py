"""
AgentShield gateway client (Python standard library only). Shared by the CI/CD simulator and the
agentshield-guard CLI.

Talks to POST /api/v1/gateway/evaluate using the exact request/response contract defined by
backend/.../dto/EvaluationRequest.java and backend/.../dto/EvaluationResponse.java, to the agent's
own review endpoints (Phase B3): GET /api/v1/gateway/reviews/{id} (AgentReviewResponse) and
POST /api/v1/gateway/reviews/{id}/claim (ReviewClaimResponse), to
POST /api/v1/gateway/decisions/redeem (Phase E1, DecisionRedeemRequest/DecisionRedeemResponse), and to
POST /api/v1/gateway/inspect (Phase V13, output scanning).

Content inspection (Phase V13): evaluate() and redeem() take an optional `arguments` value (a str, list or dict:
what the agent is about to send to the tool). The gateway inspects it for secrets (DENY), PII and prompt injection
(REVIEW), and signs its hash into the decision token, so redeem() must be given the same arguments. Leave it out
(None) to keep the pre-V13 behaviour. Arguments are sent only in the request body and never printed or logged here.

Enforcement contract (Phase E1): an ALLOW, or a successful claim, carries a one-time decision token.
The caller must redeem it with the exact tool, action and resource BEFORE running the operation, and
must not run it if redeem raises. The token is opaque here: it is never decoded, printed or logged,
and it is left out of every repr.

Fail-closed rules:
- Any transport failure (connection refused, timeout) raises GatewayUnavailable.
- Any non-2xx HTTP status raises GatewayRejected.
- Any body that is not a JSON object with a known decision, a matching echo of the request,
  and a consistent authorization result raises MalformedResponse.
- HTTP 200 alone is never treated as permission. Callers must read Evaluation.decision.

API keys are read once from the environment, never printed, and never included in exception
messages.
"""

from __future__ import annotations

import http.client
import json
import os
import re
import socket
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Mapping, Optional, Tuple

GATEWAY_PATH = "/api/v1/gateway/evaluate"
REVIEWS_PATH = "/api/v1/gateway/reviews"
REDEEM_PATH = "/api/v1/gateway/decisions/redeem"
INSPECT_PATH = "/api/v1/gateway/inspect"
DEFAULT_TIMEOUT_SECONDS = 10.0

ENV_GATEWAY_URL = "AGENTSHIELD_GATEWAY_URL"
ENV_AGENT_ID = "AGENTSHIELD_AGENT_ID"
ENV_AGENT_API_KEY = "AGENTSHIELD_AGENT_API_KEY"

VALID_DECISIONS = frozenset({"ALLOW", "REVIEW", "DENY"})
VALID_ACTIONS = frozenset({"READ", "WRITE", "DELETE", "EXECUTE", "EXTERNAL_REQUEST"})
VALID_REVIEW_STATUSES = frozenset({"PENDING", "IN_REVIEW", "APPROVED", "REJECTED"})
VALID_VERDICTS = frozenset({"CLEAN", "REVIEW", "DENY"})

_UUID_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
# Server error messages are shown to the operator; keep them short.
_MAX_DETAIL = 300


class GatewayError(Exception):
    """Base class. Every subclass means the operation must NOT execute."""


class ConfigError(GatewayError):
    """Required configuration is missing or invalid."""


class GatewayUnavailable(GatewayError):
    """The gateway could not be reached, or the request timed out."""


class GatewayRejected(GatewayError):
    """The gateway answered with a non-2xx HTTP status (for example 401, or 409 for a claim)."""

    def __init__(self, status: int, detail: Optional[str] = None):
        message = f"gateway returned HTTP {status}"
        super().__init__(f"{message}: {detail}" if detail else message)
        self.status = status
        # The backend's ErrorResponse.message, if any. It never contains the API key.
        self.detail = detail


class MalformedResponse(GatewayError):
    """The gateway answered 2xx, but the body cannot be trusted as a decision."""


@dataclass(frozen=True)
class GatewayConfig:
    gateway_url: str
    agent_id: str
    api_key: str

    def __repr__(self) -> str:  # never reveal the key, even in debugging output
        return f"GatewayConfig(gateway_url={self.gateway_url!r}, agent_id={self.agent_id!r}, api_key=<hidden>)"


@dataclass(frozen=True)
class Finding:
    """One redacted content finding (Phase V13). Never holds the raw value, only a preview such as 'AKIA… (20 chars)'."""

    category: str   # SECRET, PII or PROMPT_INJECTION
    type: str       # for example AWS_ACCESS_KEY or EMAIL
    location: str   # for example arguments[3], arguments.body.to, resource, content
    preview: str


@dataclass(frozen=True)
class Evaluation:
    """Parsed, validated EvaluationResponse."""

    request_id: str
    decision: str
    reason: str
    risk_score: int
    authorization_result: str
    risk_tier: Optional[str]
    review_request_id: Optional[str]
    # One-time decision token, present only on ALLOW. Never shown in repr.
    decision_token: Optional[str] = field(default=None, repr=False)
    # Content inspection of the resource and arguments (V13, V13.1): None only when inspection did not run.
    inspection_verdict: Optional[str] = None
    inspection_findings: Tuple[Finding, ...] = ()


@dataclass(frozen=True)
class OutputInspection:
    """Parsed InspectOutputResponse: the verdict, redacted findings and the content with each finding replaced."""

    request_id: str
    verdict: str
    findings: Tuple[Finding, ...]
    redacted_content: str = field(repr=False)


@dataclass(frozen=True)
class ReviewStatus:
    """Parsed AgentReviewResponse: the agent's view of its own review request."""

    review_id: str
    request_id: str
    status: str
    reviewer: Optional[str]
    note: Optional[str]
    expires_at: Optional[str]
    expired: bool
    consumed: bool
    tool: str
    action: str
    resource: str


@dataclass(frozen=True)
class ReviewClaim:
    """Parsed ReviewClaimResponse: the one operation the approval allows, exactly as approved."""

    review_id: str
    request_id: str
    tool: str
    action: str
    resource: str
    reviewer: Optional[str]
    # One-time decision token (src REVIEW_APPROVED) for the approved operation. Never shown in repr.
    decision_token: Optional[str] = field(default=None, repr=False)


@dataclass(frozen=True)
class Redemption:
    """Parsed DecisionRedeemResponse: the decision was redeemed (once) and the operation may run now."""

    request_id: str
    redeemed_at: str


def load_config(environ: Mapping[str, str] = os.environ) -> GatewayConfig:
    """Reads configuration from environment variables. Error messages name variables, never values."""
    missing = [name for name in (ENV_GATEWAY_URL, ENV_AGENT_ID, ENV_AGENT_API_KEY) if not environ.get(name)]
    if missing:
        raise ConfigError("missing required environment variable(s): " + ", ".join(missing))

    gateway_url = environ[ENV_GATEWAY_URL].strip().rstrip("/")
    if not (gateway_url.startswith("http://") or gateway_url.startswith("https://")):
        raise ConfigError(f"{ENV_GATEWAY_URL} must start with http:// or https://")

    return GatewayConfig(
        gateway_url=gateway_url,
        agent_id=environ[ENV_AGENT_ID].strip(),
        api_key=environ[ENV_AGENT_API_KEY].strip(),
    )


# Opener signature: (request, timeout) -> response object with .status and .read().
Opener = Callable[[urllib.request.Request, float], Any]


def _default_opener(request: urllib.request.Request, timeout: float) -> Any:
    return urllib.request.urlopen(request, timeout=timeout)


class AgentShieldClient:
    def __init__(self, config: GatewayConfig, timeout: float = DEFAULT_TIMEOUT_SECONDS,
                 opener: Optional[Opener] = None):
        self._config = config
        self._timeout = timeout
        self._opener = opener or _default_opener

    @property
    def agent_id(self) -> str:
        return self._config.agent_id

    def evaluate(self, *, session_id: str, action: str, resource: str, tool: str,
                 arguments: Any = None) -> Evaluation:
        """
        Sends one evaluation request. Raises a GatewayError subclass on any failure. With `arguments` (a str, list or
        dict), the gateway inspects them and binds their hash to the decision token: pass the same value to redeem().
        """
        payload = {
            "agentId": self._config.agent_id,
            "sessionId": session_id,
            "action": action,
            "resource": resource,
            "tool": tool,
        }
        if arguments is not None:
            payload["arguments"] = _check_arguments(arguments)
        status, raw = self._send("POST", GATEWAY_PATH, payload)
        return parse_evaluation(raw, expected_action=action, expected_resource=resource)

    def get_review(self, review_id: str) -> ReviewStatus:
        """Reads this agent's own review request. Another agent's review is a 404 (GatewayRejected)."""
        status, raw = self._send("GET", f"{REVIEWS_PATH}/{_require_uuid(review_id)}", None)
        return parse_review(raw, expected_review_id=review_id)

    def claim_review(self, review_id: str) -> ReviewClaim:
        """
        Claims an APPROVED review once. Returns the approved tool/action/resource. The gateway answers
        409 (GatewayRejected) when it is not approved, has expired or was already claimed.
        """
        status, raw = self._send("POST", f"{REVIEWS_PATH}/{_require_uuid(review_id)}/claim", None)
        return parse_claim(raw, expected_review_id=review_id)

    def redeem(self, *, token: str, tool: str, action: str, resource: str,
               expected_request_id: Optional[str] = None, arguments: Any = None) -> Redemption:
        """
        Redeems a decision token once, for exactly this operation. Run the operation only if this returns.
        The gateway answers 401 (invalid or expired), 403 (another agent's token, a different operation,
        or an agent that is not active) or 409 (already redeemed); each raises GatewayRejected. If the decision was
        made with `arguments`, pass exactly the same value here (a different or missing value is a 403).
        """
        if not isinstance(token, str) or not token:
            raise MalformedResponse("no decision token to redeem")
        payload = {"token": token, "tool": tool, "action": action, "resource": resource}
        if arguments is not None:
            payload["arguments"] = _check_arguments(arguments)
        status, raw = self._send("POST", REDEEM_PATH, payload)
        return parse_redemption(raw, expected_request_id=expected_request_id)

    def inspect_output(self, *, session_id: str, tool: str, content: str) -> OutputInspection:
        """
        Scans tool output before it is handed to a model (Phase V13). Returns the verdict (CLEAN, REVIEW or DENY), the
        redacted findings and the content with each finding replaced by [REDACTED:<TYPE>]. Use redacted_content,
        never the original, whenever the verdict is not CLEAN.
        """
        if not isinstance(content, str):
            raise TypeError("content must be a str")
        status, raw = self._send("POST", INSPECT_PATH, {"sessionId": session_id, "tool": tool, "content": content})
        return parse_output_inspection(raw)

    def _send(self, method: str, path: str, payload: Optional[dict]) -> tuple:
        """
        One authenticated request. Returns (status, body bytes) for a 2xx answer and raises a
        GatewayError subclass otherwise. The key is sent only in the X-Agent-API-Key header.
        """
        body = json.dumps(payload).encode("utf-8") if payload is not None else None
        headers = {"Accept": "application/json", "X-Agent-API-Key": self._config.api_key}
        if body is not None:
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(self._config.gateway_url + path, data=body, method=method, headers=headers)

        try:
            with self._opener(request, self._timeout) as response:
                status = getattr(response, "status", 200)
                raw = response.read()
        except urllib.error.HTTPError as error:
            # HTTPError is a subclass of URLError, so it must be caught first.
            status_code = error.code
            detail = _error_detail(error)
            error.close()
            raise GatewayRejected(status_code, detail) from None
        except (socket.timeout, TimeoutError):
            raise GatewayUnavailable("request to the gateway timed out") from None
        except urllib.error.URLError as error:
            if isinstance(error.reason, (socket.timeout, TimeoutError)):
                raise GatewayUnavailable("request to the gateway timed out") from None
            raise GatewayUnavailable("could not connect to the gateway") from None
        except (http.client.HTTPException, OSError):
            raise GatewayUnavailable("connection to the gateway failed") from None

        if not (200 <= int(status) < 300):
            raise GatewayRejected(int(status))
        return int(status), raw


def _check_arguments(arguments: Any) -> Any:
    """The gateway accepts a JSON string, array or object. Anything else is a caller bug, not a gateway answer."""
    if isinstance(arguments, tuple):
        arguments = list(arguments)
    if not isinstance(arguments, (str, list, dict)):
        raise TypeError("arguments must be a str, list or dict")
    return arguments


def _parse_findings(value: Any, what: str) -> Tuple[Finding, ...]:
    if value is None:
        return ()
    if not isinstance(value, list):
        raise MalformedResponse(f"{what} has findings that are not a list")
    findings = []
    for item in value:
        if not isinstance(item, dict):
            raise MalformedResponse(f"{what} has a finding that is not an object")
        findings.append(Finding(
            category=_required_str(item, "category", what),
            type=_required_str(item, "type", what),
            location=_required_str(item, "location", what),
            preview=_required_str(item, "preview", what),
        ))
    return tuple(findings)


def parse_output_inspection(raw: bytes) -> OutputInspection:
    """Validates an InspectOutputResponse. Raises MalformedResponse on anything unexpected."""
    what = "inspect response"
    data = _load_object(raw, what)
    verdict = data.get("verdict")
    if verdict not in VALID_VERDICTS:
        raise MalformedResponse("inspect response has no recognised verdict")
    redacted = data.get("redactedContent")
    if not isinstance(redacted, str):
        raise MalformedResponse("inspect response has no redactedContent")
    return OutputInspection(
        request_id=_required_str(data, "requestId", what),
        verdict=verdict,
        findings=_parse_findings(data.get("findings"), what),
        redacted_content=redacted,
    )


def _require_uuid(value: str) -> str:
    """Review ids go into the URL path, so only a canonical UUID is accepted."""
    if not isinstance(value, str) or not _UUID_RE.match(value):
        raise MalformedResponse("review id is not a UUID")
    return value


def _error_detail(error: urllib.error.HTTPError) -> Optional[str]:
    """The backend's ErrorResponse.message, if the error body has one."""
    try:
        data = json.loads(error.read().decode("utf-8"))
    except Exception:  # any unreadable body: no detail
        return None
    message = data.get("message") if isinstance(data, dict) else None
    if not isinstance(message, str) or not message:
        return None
    return message[:_MAX_DETAIL]


def _load_object(raw: bytes, what: str) -> dict:
    try:
        data = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        raise MalformedResponse(f"{what} is not valid JSON") from None
    if not isinstance(data, dict):
        raise MalformedResponse(f"{what} is not a JSON object")
    return data


def _required_str(data: dict, key: str, what: str) -> str:
    value = data.get(key)
    if not isinstance(value, str) or not value:
        raise MalformedResponse(f"{what} has no {key}")
    return value


def _optional_str(data: dict, key: str) -> Optional[str]:
    value = data.get(key)
    return value if isinstance(value, str) and value else None


def parse_review(raw: bytes, *, expected_review_id: str) -> ReviewStatus:
    """Validates an AgentReviewResponse. Raises MalformedResponse on anything unexpected."""
    what = "review response"
    data = _load_object(raw, what)
    if data.get("id") != expected_review_id:
        raise MalformedResponse("review response is for a different review")
    status = data.get("status")
    if status not in VALID_REVIEW_STATUSES:
        raise MalformedResponse("review response has no recognised status")
    action = _required_str(data, "action", what)
    if action not in VALID_ACTIONS:
        raise MalformedResponse("review response has no recognised action")
    for flag in ("expired", "consumed"):
        if not isinstance(data.get(flag), bool):
            raise MalformedResponse(f"review response has no boolean {flag}")
    return ReviewStatus(
        review_id=expected_review_id,
        request_id=_required_str(data, "requestId", what),
        status=status,
        reviewer=_optional_str(data, "reviewer"),
        note=_optional_str(data, "note"),
        expires_at=_optional_str(data, "expiresAt"),
        expired=data["expired"],
        consumed=data["consumed"],
        tool=_required_str(data, "tool", what),
        action=action,
        resource=_required_str(data, "resource", what),
    )


def parse_claim(raw: bytes, *, expected_review_id: str) -> ReviewClaim:
    """Validates a ReviewClaimResponse. Raises MalformedResponse on anything unexpected."""
    what = "claim response"
    data = _load_object(raw, what)
    if data.get("reviewId") != expected_review_id:
        raise MalformedResponse("claim response is for a different review")
    action = _required_str(data, "action", what)
    if action not in VALID_ACTIONS:
        raise MalformedResponse("claim response has no recognised action")
    return ReviewClaim(
        review_id=expected_review_id,
        request_id=_required_str(data, "requestId", what),
        tool=_required_str(data, "tool", what),
        action=action,
        resource=_required_str(data, "resource", what),
        reviewer=_optional_str(data, "reviewer"),
        decision_token=_optional_str(data, "decisionToken"),
    )


def parse_redemption(raw: bytes, *, expected_request_id: Optional[str] = None) -> Redemption:
    """Validates a DecisionRedeemResponse. Raises MalformedResponse on anything unexpected."""
    what = "redeem response"
    data = _load_object(raw, what)
    request_id = _required_str(data, "requestId", what)
    if expected_request_id is not None and request_id != expected_request_id:
        raise MalformedResponse("redeem response is for a different request")
    return Redemption(request_id=request_id, redeemed_at=_required_str(data, "redeemedAt", what))


def parse_evaluation(raw: bytes, *, expected_action: str, expected_resource: str) -> Evaluation:
    """Validates an EvaluationResponse body. Raises MalformedResponse on anything unexpected."""
    try:
        data = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        raise MalformedResponse("gateway response is not valid JSON") from None

    if not isinstance(data, dict):
        raise MalformedResponse("gateway response is not a JSON object")

    decision = data.get("decision")
    if decision not in VALID_DECISIONS:
        raise MalformedResponse("gateway response has no recognised decision")

    if data.get("action") != expected_action or data.get("resource") != expected_resource:
        raise MalformedResponse("gateway response does not echo the submitted action and resource")

    request_id = data.get("requestId")
    if not isinstance(request_id, str) or not request_id:
        raise MalformedResponse("gateway response has no requestId")

    reason = data.get("reason")
    if not isinstance(reason, str):
        raise MalformedResponse("gateway response has no reason")

    risk_score = data.get("riskScore")
    if not isinstance(risk_score, int) or isinstance(risk_score, bool):
        raise MalformedResponse("gateway response has no integer riskScore")

    authorization_result = data.get("authorizationResult")
    if not isinstance(authorization_result, str) or not authorization_result:
        raise MalformedResponse("gateway response has no authorizationResult")

    # An ALLOW must be backed by an AUTHORIZED result. Anything else is contradictory: fail closed.
    if decision == "ALLOW" and authorization_result != "AUTHORIZED":
        raise MalformedResponse("gateway response is contradictory: ALLOW without AUTHORIZED")

    risk_tier = data.get("riskTier")
    review_request_id = data.get("reviewRequestId")
    token = data.get("decisionToken")
    # Only an ALLOW may carry a token. A token on REVIEW or DENY contradicts the contract: fail closed.
    if token is not None and decision != "ALLOW":
        raise MalformedResponse("gateway response is contradictory: decision token without ALLOW")
    verdict = data.get("inspectionVerdict")
    if verdict is not None and verdict not in VALID_VERDICTS:
        raise MalformedResponse("gateway response has an unrecognised inspectionVerdict")
    # A DENY verdict can only come with a DENY decision: inspection DENY is final.
    if verdict == "DENY" and decision != "DENY":
        raise MalformedResponse("gateway response is contradictory: inspection DENY without DENY")
    return Evaluation(
        request_id=request_id,
        decision=decision,
        reason=reason,
        risk_score=risk_score,
        authorization_result=authorization_result,
        risk_tier=risk_tier if isinstance(risk_tier, str) else None,
        review_request_id=review_request_id if isinstance(review_request_id, str) else None,
        decision_token=token if isinstance(token, str) and token else None,
        inspection_verdict=verdict,
        inspection_findings=_parse_findings(data.get("inspectionFindings"), "gateway response"),
    )
