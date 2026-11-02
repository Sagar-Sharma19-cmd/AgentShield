"""
Enforcement gate: the only code path that can execute a simulated tool operation.

Invariant: an executor is called only when the parsed AgentShield decision is ALLOW.
REVIEW, DENY, any gateway failure and any malformed response all stop before execution.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Callable, List, Optional, Sequence

from agentshield_client import AgentShieldClient, Evaluation, GatewayError


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


def new_session_id(pipeline_name: str) -> str:
    """Traceable per-run identity, for example ci-deploy-staging-3f9c2a1b8d4e. Max 64 characters."""
    slug = "".join(ch if ch.isalnum() else "-" for ch in pipeline_name.lower()).strip("-")[:32] or "pipeline"
    return f"ci-{slug}-{uuid.uuid4().hex[:12]}"


def run_operation(client: AgentShieldClient, session_id: str, operation: Operation,
                  executors: dict) -> StepResult:
    """Evaluates one operation through AgentShield and executes it only on ALLOW."""
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
        executor = executors[operation.name]
        try:
            output = executor(operation)
        except Exception as error:  # the mock failed; the decision was still ALLOW
            return StepResult(operation, Outcome.EXECUTION_ERROR, evaluation,
                              f"Mock tool raised {type(error).__name__}.")
        return StepResult(operation, Outcome.EXECUTED, evaluation,
                          "Executed (mock).", execution_output=output)

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


def run_pipeline(client: AgentShieldClient, pipeline_name: str, operations: Sequence[Operation],
                 executors: dict, stop_on_block: bool = True,
                 on_step: Optional[Callable[[int, int, StepResult], None]] = None) -> PipelineResult:
    """
    Runs operations in order. With stop_on_block (the default), the first step that is not
    executed halts the pipeline (fail closed), and later steps are not evaluated or executed.
    """
    session_id = new_session_id(pipeline_name)
    result = PipelineResult(pipeline_name=pipeline_name, session_id=session_id)

    for index, operation in enumerate(operations, start=1):
        step = run_operation(client, session_id, operation, executors)
        result.steps.append(step)
        if on_step is not None:
            on_step(index, len(operations), step)
        if step.outcome != Outcome.EXECUTED and stop_on_block:
            result.halted_at = index
            break

    return result
