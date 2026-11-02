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

Exit codes: 0 pipeline completed (every step executed); 1 pipeline halted or had steps that did
not execute; 2 configuration error.
"""

from __future__ import annotations

import argparse
import sys
from typing import List, Optional

from agentshield_client import AgentShieldClient, ConfigError, load_config
from enforcement import Outcome, PipelineResult, StepResult, run_pipeline
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
    if step.outcome == Outcome.FAILED_CLOSED:
        print(f"      Detail      : {step.message}")
    if step.execution_output:
        print(f"      Mock output : {step.execution_output}")
    print()


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
    result = run_pipeline(
        client,
        scenario.pipeline_name,
        scenario.operations,
        mocks.executors(),
        stop_on_block=not args.continue_on_block,
        on_step=lambda index, count, step: _print_step(index, count, step),
    )
    _print_summary(result, total)
    return EXIT_COMPLETED if result.completed else EXIT_HALTED


if __name__ == "__main__":
    sys.exit(main())
