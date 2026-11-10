#!/usr/bin/env python3
"""
AgentShield CI/CD runtime security simulator (M4.1).

Simulates an AI DevOps agent in a CI/CD pipeline. Every mock tool operation is first sent to
the AgentShield gateway. A mock tool runs only when the gateway decision is ALLOW.

Configuration (environment variables only; values are never printed):
  AGENTSHIELD_GATEWAY_URL    e.g. http://localhost:8081 (no default; set it explicitly)
  AGENTSHIELD_AGENT_ID       registered agent name or UUID
  AGENTSHIELD_AGENT_API_KEY  the agent's API key, shown once when the agent is registered

Usage:
  python3 simulator.py --list
  python3 simulator.py --scenario deployment_pipeline
  python3 simulator.py --scenario deployment_pipeline --continue-on-block
  python3 simulator.py --scenario deployment_pipeline --wait-for-review [--review-timeout 300]

With --wait-for-review, a REVIEW decision is not the end of the step: the simulator polls its review
request every 3 s and prints each status change. APPROVED: it claims the approval once, checks the
claimed tool/action/resource equal the operation, runs the mock and continues. REJECTED: BLOCKED,
with the reviewer and note. Timeout, expiry or any error: FAILED_CLOSED. Without the flag a REVIEW
halts the step as before.

Exit codes: 0 pipeline completed (every step executed); 1 pipeline halted or had steps that did
not execute; 2 configuration error.
"""

from __future__ import annotations

import argparse
import sys
from typing import List, Optional

from agentshield_client import AgentShieldClient, ConfigError, ReviewStatus, load_config
from enforcement import (DEFAULT_REVIEW_TIMEOUT_SECONDS, Outcome, PipelineResult, ReviewWait, StepResult,
                         run_pipeline)
from mock_tools import MockDevOps
from scenarios import SCENARIOS

EXIT_COMPLETED = 0
EXIT_HALTED = 1
EXIT_CONFIG_ERROR = 2

RULE = "-" * 78

STATUS_LABEL = {
    Outcome.EXECUTED: "EXECUTED (mock)",
    Outcome.WAITING_FOR_REVIEW: "WAITING FOR ADMINISTRATOR REVIEW - not executed",
    Outcome.BLOCKED: "BLOCKED - not executed",
    Outcome.FAILED_CLOSED: "FAILED CLOSED - not executed",
    Outcome.EXECUTION_ERROR: "MOCK ERROR",
}


def _print_header(scenario_name: str, description: str, gateway_url: str, agent_id: str, run_dir: str) -> None:
    print(RULE)
    print("AgentShield CI/CD runtime security simulator (M4.1)")
    print(RULE)
    print(f"Scenario : {scenario_name}")
    print(f"About    : {description}")
    print(f"Gateway  : {gateway_url}")
    print(f"Agent    : {agent_id}   (API key: configured, not shown)")
    print(f"Mock run : {run_dir}")
    print(RULE)


def _print_step(index: int, total: int, step: StepResult) -> None:
    op = step.operation
    print(f"[{index}/{total}] {op.description}")
    print(f"      Tool/action : {op.tool} {op.action} -> {op.resource}")
    if step.evaluation is not None:
        ev = step.evaluation
        tier = f"{ev.risk_tier} ({ev.risk_score})" if ev.risk_tier else f"score {ev.risk_score}"
        print(f"      AgentShield : {ev.decision}  risk {tier}  request {ev.request_id}")
        print(f"      Reason      : {ev.reason}")
        if ev.review_request_id:
            print(f"      Review ID   : {ev.review_request_id}")
    print(f"      Status      : {STATUS_LABEL[step.outcome]}")
    if step.outcome == Outcome.FAILED_CLOSED or step.review is not None:
        print(f"      Detail      : {step.message}")
    if step.execution_output:
        print(f"      Mock output : {step.execution_output}")
    print()


def _print_review_status(review: ReviewStatus) -> None:
    """Printed as each status change is seen while waiting, so the operator sees progress live."""
    # Printed before the step's own block (the step finishes after the wait), so the line names the review
    # and the operation under review.
    line = (f"  ... review {review.review_id} ({review.tool} {review.action} -> {review.resource}): "
            f"{review.status}")
    if review.reviewer:
        line += f" by {review.reviewer}"
    if review.note:
        line += f" - {review.note}"
    if review.status in ("PENDING", "IN_REVIEW") and review.expires_at:
        line += f"   (expires {review.expires_at})"
    print(line, flush=True)


def _positive_seconds(value: str) -> float:
    seconds = float(value)
    if not seconds > 0:
        raise argparse.ArgumentTypeError("must be a positive number of seconds")
    return seconds


def _print_summary(result: PipelineResult, total_steps: int) -> None:
    print(RULE)
    print("Pipeline summary")
    print(RULE)
    print(f"Pipeline : {result.pipeline_name}")
    print(f"Session  : {result.session_id}   (traceable identity for this run)")
    print(f"Steps    : {len(result.steps)} of {total_steps} evaluated")
    print(f"Executed : {result.count(Outcome.EXECUTED)}")
    print(f"Waiting  : {result.count(Outcome.WAITING_FOR_REVIEW)} (administrator review)")
    print(f"Blocked  : {result.count(Outcome.BLOCKED)} (DENY)")
    print(f"Failed   : {result.count(Outcome.FAILED_CLOSED) + result.count(Outcome.EXECUTION_ERROR)}")
    if result.completed:
        print("Result   : COMPLETED - every step was allowed and executed.")
    elif result.halted_at is not None:
        print(f"Result   : HALTED at step {result.halted_at} - later steps were not evaluated or executed.")
    else:
        print("Result   : INCOMPLETE - some steps did not execute (see above).")
    print(RULE)


def _list_scenarios() -> None:
    for scenario in SCENARIOS.values():
        print(f"{scenario.name:<22} {scenario.description}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="AgentShield CI/CD runtime security simulator (M4.1).")
    parser.add_argument("--scenario", choices=sorted(SCENARIOS), help="pipeline to run")
    parser.add_argument("--list", action="store_true", help="list available scenarios and exit")
    parser.add_argument("--continue-on-block", action="store_true",
                        help="keep evaluating later steps after a step is not executed "
                             "(default: halt the pipeline at the first such step)")
    parser.add_argument("--wait-for-review", action="store_true",
                        help="on REVIEW, poll the review request until an operator approves or rejects it; "
                             "an approval is claimed once and must match the operation exactly")
    parser.add_argument("--review-timeout", type=_positive_seconds, default=DEFAULT_REVIEW_TIMEOUT_SECONDS,
                        metavar="SECONDS",
                        help=f"with --wait-for-review, give up and fail closed after this long "
                             f"(default {DEFAULT_REVIEW_TIMEOUT_SECONDS:g})")
    return parser


def main(argv: Optional[List[str]] = None) -> int:
    args = build_parser().parse_args(argv)

    if args.list:
        _list_scenarios()
        return EXIT_COMPLETED

    if not args.scenario:
        print("error: choose a scenario with --scenario (or use --list)", file=sys.stderr)
        return EXIT_CONFIG_ERROR

    try:
        config = load_config()
    except ConfigError as error:
        print(f"configuration error: {error}", file=sys.stderr)
        return EXIT_CONFIG_ERROR

    scenario = SCENARIOS[args.scenario]
    client = AgentShieldClient(config)
    mocks = MockDevOps.in_temporary_directory()

    _print_header(scenario.name, scenario.description, config.gateway_url, config.agent_id, mocks.run_dir)

    total = len(scenario.operations)
    review_wait = (ReviewWait(timeout_seconds=args.review_timeout, on_status=_print_review_status)
                   if args.wait_for_review else None)
    if review_wait is not None:
        print(f"Reviews  : waiting up to {args.review_timeout:g} s for an operator decision on each REVIEW")
        print(RULE)
    result = run_pipeline(
        client,
        scenario.pipeline_name,
        scenario.operations,
        mocks.executors(),
        stop_on_block=not args.continue_on_block,
        on_step=lambda index, count, step: _print_step(index, count, step),
        review_wait=review_wait,
    )
    _print_summary(result, total)
    return EXIT_COMPLETED if result.completed else EXIT_HALTED


if __name__ == "__main__":
    sys.exit(main())
