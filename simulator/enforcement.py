"""
Enforcement gate: the only code path that can execute a simulated tool operation.

Invariant: an executor is called only when the parsed AgentShield decision is ALLOW, or (with
--wait-for-review) when a REVIEW was APPROVED by an operator, the approval was claimed exactly once,
and the claimed tool/action/resource equal the operation. In both cases the one-time decision token
(Phase E1) must then be redeemed for exactly this operation, and the executor runs only after the
gateway accepts the redemption. DENY, REJECTED, any gateway failure, timeout, expiry, mismatch, a
missing token, a refused redemption and any malformed response all stop before execution.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Callable, List, Optional, Sequence

from agentshield_client import AgentShieldClient, Evaluation, GatewayError, ReviewStatus


class Outcome(str, Enum):
    EXECUTED = "EXECUTED"                 # ALLOW, mock tool ran
    WAITING_FOR_REVIEW = "WAITING"        # REVIEW, mock tool did not run
    BLOCKED = "BLOCKED"                   # DENY, mock tool did not run
    FAILED_CLOSED = "FAILED_CLOSED"       # gateway error or malformed response, mock tool did not run
    EXECUTION_ERROR = "EXECUTION_ERROR"   # ALLOW, but the mock tool itself raised


@dataclass(frozen=True)
class Operation:
    """One tool operation requested by the simulated pipeline."""

    name: str          # for example "docker.push_image"; also the key into the mock executor table
    tool: str          # registered AgentShield tool name
    action: str        # ActionType: READ, WRITE, DELETE, EXECUTE or EXTERNAL_REQUEST
    resource: str      # resource string sent to the gateway unchanged
    description: str   # human-readable purpose, shown in the CLI


@dataclass(frozen=True)
class StepResult:
    operation: Operation
    outcome: Outcome
    evaluation: Optional[Evaluation]
    message: str
    execution_output: Optional[str] = None
    # Final state of the review request, when the step waited for one (--wait-for-review).
    review: Optional[ReviewStatus] = None


@dataclass
class PipelineResult:
    pipeline_name: str
    session_id: str
    steps: List[StepResult] = field(default_factory=list)
    halted_at: Optional[int] = None  # 1-based index of the step that stopped the pipeline

    def count(self, outcome: Outcome) -> int:
        return sum(1 for step in self.steps if step.outcome == outcome)

    @property
    def completed(self) -> bool:
        return self.halted_at is None and all(step.outcome == Outcome.EXECUTED for step in self.steps)


Executor = Callable[[Operation], str]

DEFAULT_REVIEW_TIMEOUT_SECONDS = 300.0
DEFAULT_REVIEW_POLL_SECONDS = 3.0


@dataclass(frozen=True)
class ReviewWait:
    """
    How to wait for a human decision on a REVIEW. sleep and monotonic are injectable so tests can
    run the timeout path without waiting. on_status is called once per observed status change.
    """

    timeout_seconds: float = DEFAULT_REVIEW_TIMEOUT_SECONDS
    poll_seconds: float = DEFAULT_REVIEW_POLL_SECONDS
    sleep: Callable[[float], None] = time.sleep
    monotonic: Callable[[], float] = time.monotonic
    on_status: Optional[Callable[[ReviewStatus], None]] = None


def new_session_id(pipeline_name: str) -> str:
    """Traceable per-run identity, for example ci-deploy-staging-3f9c2a1b8d4e. Max 64 characters."""
    slug = "".join(ch if ch.isalnum() else "-" for ch in pipeline_name.lower()).strip("-")[:32] or "pipeline"
    return f"ci-{slug}-{uuid.uuid4().hex[:12]}"


def run_operation(client: AgentShieldClient, session_id: str, operation: Operation,
                  executors: dict, review_wait: Optional[ReviewWait] = None) -> StepResult:
    """
    Evaluates one operation through AgentShield and executes it only on ALLOW. With review_wait, a
    REVIEW is polled until an operator decides; see wait_for_review.
    """
    try:
        evaluation = client.evaluate(
            session_id=session_id,
            action=operation.action,
            resource=operation.resource,
            tool=operation.tool,
        )
    except GatewayError as error:
        return StepResult(operation, Outcome.FAILED_CLOSED, None,
                          f"Gateway did not return a usable decision ({error}). Not executed.")

    if evaluation.decision == "ALLOW":
        return _execute(client, operation, evaluation, executors, "Executed (mock).",
                        token=evaluation.decision_token, request_id=evaluation.request_id)

    if evaluation.decision == "REVIEW" and review_wait is not None:
        return wait_for_review(client, operation, evaluation, executors, review_wait)

    if evaluation.decision == "REVIEW":
        review = evaluation.review_request_id or "not provided"
        return StepResult(
            operation, Outcome.WAITING_FOR_REVIEW, evaluation,
            f"Requires administrator review (reviewRequestId {review}). Not executed; "
            "execution is waiting for administrator action.",
        )

    # DENY (validated as one of ALLOW/REVIEW/DENY by the client).
    return StepResult(operation, Outcome.BLOCKED, evaluation,
                      f"Denied by AgentShield: {evaluation.reason} Not executed.")


def _execute(client: AgentShieldClient, operation: Operation, evaluation: Evaluation, executors: dict,
             message: str, review: Optional[ReviewStatus] = None, *, token: Optional[str],
             request_id: Optional[str]) -> StepResult:
    """Redeems the one-time decision token for exactly this operation, then (and only then) runs the mock."""
    if not token:
        return StepResult(operation, Outcome.FAILED_CLOSED, evaluation,
                          "The gateway returned no decision token to redeem. Not executed.", review=review)
    try:
        client.redeem(token=token, tool=operation.tool, action=operation.action, resource=operation.resource,
                      expected_request_id=request_id)
    except GatewayError as error:  # 401 expired/invalid, 403 mismatch/other agent, 409 replay, outage...
        return StepResult(operation, Outcome.FAILED_CLOSED, evaluation,
                          f"Could not redeem the decision ({error}). Not executed.", review=review)
    executor = executors[operation.name]
    try:
        output = executor(operation)
    except Exception as error:  # the mock failed; the decision was still ALLOW / a claimed approval
        return StepResult(operation, Outcome.EXECUTION_ERROR, evaluation,
                          f"Mock tool raised {type(error).__name__}.", review=review)
    return StepResult(operation, Outcome.EXECUTED, evaluation, message, execution_output=output, review=review)


def wait_for_review(client: AgentShieldClient, operation: Operation, evaluation: Evaluation,
                    executors: dict, wait: ReviewWait) -> StepResult:
    """
    Polls the agent's own review request until an operator decides, then:
    - APPROVED: claims it (once), checks the claimed tool/action/resource equal this operation, and
      only then executes the mock. Any mismatch fails closed.
    - REJECTED: BLOCKED, with the reviewer and note.
    - expired, timed out, already consumed, or any gateway error: FAILED_CLOSED.
    """
    review_id = evaluation.review_request_id
    if not review_id:
        return StepResult(operation, Outcome.FAILED_CLOSED, evaluation,
                          "REVIEW without a reviewRequestId: nothing to wait for. Not executed.")

    def failed(message: str, review: Optional[ReviewStatus] = None) -> StepResult:
        return StepResult(operation, Outcome.FAILED_CLOSED, evaluation, message + " Not executed.", review=review)

    deadline = wait.monotonic() + wait.timeout_seconds
    last_status: Optional[str] = None
    review: Optional[ReviewStatus] = None

    while True:
        try:
            review = client.get_review(review_id)
        except GatewayError as error:
            return failed(f"Could not read review {review_id} ({error}).", review)

        if review.status != last_status:
            last_status = review.status
            if wait.on_status is not None:
                wait.on_status(review)

        if review.expired:
            return failed(f"Review {review_id} expired before it was claimed.", review)

        if review.status == "REJECTED":
            note = review.note or "no note"
            return StepResult(operation, Outcome.BLOCKED, evaluation,
                              f"Rejected by {review.reviewer or 'an operator'}: {note} Not executed.", review=review)

        if review.status == "APPROVED":
            if review.consumed:
                return failed(f"Approval for review {review_id} was already used.", review)
            try:
                claim = client.claim_review(review_id)
            except GatewayError as error:
                return failed(f"Could not claim review {review_id} ({error}).", review)
            approved = (claim.tool, claim.action, claim.resource)
            requested = (operation.tool, operation.action, operation.resource)
            if approved != requested:
                return failed("The approved operation " + " ".join(approved)
                              + " does not match the requested " + " ".join(requested) + ".", review)
            return _execute(client, operation, evaluation, executors,
                            f"Approved by {claim.reviewer or review.reviewer or 'an operator'}; "
                            "approval claimed, redeemed and executed (mock).", review=review,
                            token=claim.decision_token, request_id=claim.request_id)

        remaining = deadline - wait.monotonic()
        if remaining <= 0:
            return failed(f"No decision on review {review_id} within {wait.timeout_seconds:g} s "
                          f"(last status {review.status}).", review)
        wait.sleep(min(wait.poll_seconds, remaining))


def run_pipeline(client: AgentShieldClient, pipeline_name: str, operations: Sequence[Operation],
                 executors: dict, stop_on_block: bool = True,
                 on_step: Optional[Callable[[int, int, StepResult], None]] = None,
                 review_wait: Optional[ReviewWait] = None) -> PipelineResult:
    """
    Runs operations in order. With stop_on_block (the default), the first step that is not
    executed halts the pipeline (fail closed), and later steps are not evaluated or executed.
    """
    session_id = new_session_id(pipeline_name)
    result = PipelineResult(pipeline_name=pipeline_name, session_id=session_id)

    for index, operation in enumerate(operations, start=1):
        step = run_operation(client, session_id, operation, executors, review_wait)
        result.steps.append(step)
        if on_step is not None:
            on_step(index, len(operations), step)
        if step.outcome != Outcome.EXECUTED and stop_on_block:
            result.halted_at = index
            break

    return result
