"""
agentshield-guard: a command guard that enforces AgentShield decisions on real commands (stdlib only).

    agentshield-guard run   --tool T --action A --resource R [--session S] [--wait-for-review]
                            [--review-timeout N] -- <command...>
    agentshield-guard check --tool T --action A --resource R [--session S]

run:   evaluate -> ALLOW: redeem the one-time decision token, then run the command (argv list, no shell,
       inherited stdio) and exit with its exit code.
       REVIEW: exit 4 with the review id, or with --wait-for-review poll it every 3 s, claim it when APPROVED,
       redeem the claim's token and run the command. REJECTED exits 3 (reviewer and note shown); no decision
       in time, or an expired review, exits 5.
       DENY exits 3 with the reason. Any gateway or redeem error exits 5 and the command never runs.
check: evaluate only and print the decision: exit 0 (ALLOW), 3 (DENY), 4 (REVIEW), 5 (error). An ALLOW from
       check is not redeemed; its token simply expires.

Configuration: AGENTSHIELD_GATEWAY_URL, AGENTSHIELD_AGENT_ID, AGENTSHIELD_AGENT_API_KEY. The API key and the
decision token are never printed or logged. Guard messages go to stderr; the command keeps stdout/stderr.

What this enforces and what it does not: the command runs only through this process, after a decision that
the gateway signed and recorded as redeemed. It cannot stop someone from running the same command without
the guard; that remains a deployment control (only the CI job's guard step holds the credentials it needs).
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
import uuid
from typing import Callable, List, Mapping, Optional, Sequence, TextIO


def _import_sdk():
    """The shared SDK, installed (pip install -e sdk/python) or from this repository checkout."""
    try:
        import agentshield  # noqa: F401
    except ImportError:
        here = os.path.dirname(os.path.abspath(__file__))
        sys.path.insert(0, os.path.normpath(os.path.join(here, os.pardir, os.pardir, "sdk", "python")))
    import agentshield
    return agentshield


sdk = _import_sdk()

EXIT_OK = 0
EXIT_DENIED = 3        # DENY, or a REVIEW that was REJECTED
EXIT_REVIEW = 4        # REVIEW and not waiting
EXIT_ERROR = 5         # gateway/redeem/config error, review timeout or expiry: fail closed
EXIT_NOT_FOUND = 127   # the command itself could not be started (after a successful redeem)

ACTIONS = ("READ", "WRITE", "DELETE", "EXECUTE", "EXTERNAL_REQUEST")
REVIEW_POLL_SECONDS = 3.0
DEFAULT_REVIEW_TIMEOUT_SECONDS = 300.0
MAX_SESSION_LENGTH = 255

Runner = Callable[[List[str]], int]
ClientFactory = Callable[[object], object]


def default_session_id(environ: Mapping[str, str]) -> str:
    """Jenkins BUILD_TAG, else GitHub Actions GITHUB_RUN_ID + GITHUB_JOB, else guard-<12 hex>."""
    if environ.get("BUILD_TAG"):
        session = environ["BUILD_TAG"]
    elif environ.get("GITHUB_RUN_ID"):
        session = "gh-" + environ["GITHUB_RUN_ID"] + ("-" + environ["GITHUB_JOB"] if environ.get("GITHUB_JOB") else "")
    else:
        session = "guard-" + uuid.uuid4().hex[:12]
    return session[:MAX_SESSION_LENGTH]


def run_command(argv: List[str]) -> int:
    """Runs argv directly (never through a shell), with this process's stdin/stdout/stderr."""
    completed = subprocess.run(argv, shell=False, check=False)
    code = completed.returncode
    return 128 - code if code < 0 else code  # killed by signal N -> 128+N, like a shell


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="agentshield-guard",
                                     description="Run a command only after AgentShield allows it.")
    commands = parser.add_subparsers(dest="command", required=True)
    for name, help_text in (("run", "evaluate, redeem, then run the command after --"),
                            ("check", "evaluate only and print the decision")):
        sub = commands.add_parser(name, help=help_text)
        sub.add_argument("--tool", required=True, help="registered AgentShield tool name")
        sub.add_argument("--action", required=True, choices=ACTIONS)
        sub.add_argument("--resource", required=True, help="resource sent to the gateway unchanged")
        sub.add_argument("--session", help="session id (default: from CI variables, else guard-<12 hex>)")
        if name == "run":
            sub.add_argument("--wait-for-review", action="store_true",
                             help="on REVIEW, wait for an operator decision instead of exiting 4")
            sub.add_argument("--review-timeout", type=float, default=DEFAULT_REVIEW_TIMEOUT_SECONDS,
                             help="seconds to wait for a review decision (default 300)")
    return parser


def split_command(argv: Sequence[str]) -> tuple:
    """Everything after the first "--" is the command, passed through untouched."""
    argv = list(argv)
    if "--" in argv:
        index = argv.index("--")
        return argv[:index], argv[index + 1:]
    return argv, []


class Guard:
    def __init__(self, client, out: TextIO, runner: Runner, sleep: Callable[[float], None],
                 monotonic: Callable[[], float]):
        self.client = client
        self.out = out
        self.runner = runner
        self.sleep = sleep
        self.monotonic = monotonic

    def say(self, message: str) -> None:
        print(f"agentshield-guard: {message}", file=self.out, flush=True)

    def check(self, args) -> int:
        evaluation = self.client.evaluate(session_id=args.session, action=args.action, resource=args.resource,
                                          tool=args.tool)
        self.say(f"{evaluation.decision} (request {evaluation.request_id}): {evaluation.reason}")
        if evaluation.decision == "ALLOW":
            return EXIT_OK
        if evaluation.decision == "REVIEW":
            self.say(f"review {evaluation.review_request_id or 'not provided'} is waiting for an operator.")
            return EXIT_REVIEW
        return EXIT_DENIED

    def run(self, args, command: List[str]) -> int:
        evaluation = self.client.evaluate(session_id=args.session, action=args.action, resource=args.resource,
                                          tool=args.tool)
        if evaluation.decision == "DENY":
            self.say(f"DENY (request {evaluation.request_id}): {evaluation.reason} Not run.")
            return EXIT_DENIED
        if evaluation.decision == "REVIEW":
            return self._review(args, command, evaluation)
        self.say(f"ALLOW (request {evaluation.request_id}).")
        return self._redeem_and_run(args, command, evaluation.decision_token, evaluation.request_id)

    def _review(self, args, command: List[str], evaluation) -> int:
        review_id = evaluation.review_request_id
        if not args.wait_for_review:
            self.say(f"REVIEW (request {evaluation.request_id}): {evaluation.reason} "
                     f"Review {review_id or 'not provided'} needs an operator decision. Not run.")
            return EXIT_REVIEW
        if not review_id:
            self.say("REVIEW without a review id: nothing to wait for. Not run.")
            return EXIT_ERROR
        self.say(f"REVIEW: waiting up to {args.review_timeout:g} s for review {review_id}.")
        deadline = self.monotonic() + args.review_timeout
        last_status = None
        while True:
            review = self.client.get_review(review_id)
            if review.status != last_status:
                last_status = review.status
                self.say(f"review {review_id}: {review.status}")
            if review.expired:
                self.say(f"review {review_id} expired before it was claimed. Not run.")
                return EXIT_ERROR
            if review.status == "REJECTED":
                self.say(f"REJECTED by {review.reviewer or 'an operator'}: {review.note or 'no note'} Not run.")
                return EXIT_DENIED
            if review.status == "APPROVED":
                claim = self.client.claim_review(review_id)
                approved = (claim.tool, claim.action, claim.resource)
                if approved != (args.tool, args.action, args.resource):
                    self.say("the approved operation does not match the requested one. Not run.")
                    return EXIT_ERROR
                self.say(f"APPROVED by {claim.reviewer or review.reviewer or 'an operator'}; approval claimed.")
                return self._redeem_and_run(args, command, claim.decision_token, claim.request_id)
            remaining = deadline - self.monotonic()
            if remaining <= 0:
                self.say(f"no decision on review {review_id} within {args.review_timeout:g} s "
                         f"(last status {review.status}). Not run.")
                return EXIT_ERROR
            self.sleep(min(REVIEW_POLL_SECONDS, remaining))

    def _redeem_and_run(self, args, command: List[str], token: Optional[str], request_id: Optional[str]) -> int:
        if not token:
            self.say("the gateway returned no decision token. Not run.")
            return EXIT_ERROR
        self.client.redeem(token=token, tool=args.tool, action=args.action, resource=args.resource,
                           expected_request_id=request_id)
        # Only the program name: arguments can hold secrets (for example a registry password).
        self.say(f"decision redeemed; running {os.path.basename(command[0])}.")
        try:
            return self.runner(list(command))
        except (FileNotFoundError, PermissionError) as error:
            self.say(f"could not start {command[0]!r} ({type(error).__name__}).")
            return EXIT_NOT_FOUND


def main(argv: Optional[Sequence[str]] = None, *, environ: Mapping[str, str] = os.environ,
         client_factory: Optional[ClientFactory] = None, runner: Runner = run_command,
         sleep: Callable[[float], None] = time.sleep, monotonic: Callable[[], float] = time.monotonic,
         out: TextIO = sys.stderr) -> int:
    options, command = split_command(sys.argv[1:] if argv is None else argv)
    args = build_parser().parse_args(options)
    if args.command == "run" and not command:
        print("agentshield-guard: run needs a command after --", file=out)
        return 2
    if args.command == "check" and command:
        print("agentshield-guard: check does not run a command", file=out)
        return 2
    args.session = (args.session or default_session_id(environ))[:MAX_SESSION_LENGTH]

    guard = None
    try:
        config = sdk.load_config(environ)
        client = (client_factory or sdk.AgentShieldClient)(config)
        guard = Guard(client, out, runner, sleep, monotonic)
        if args.command == "check":
            return guard.check(args)
        return guard.run(args, command)
    except sdk.GatewayError as error:
        # Messages name statuses and variables, never the key or the token.
        print(f"agentshield-guard: {type(error).__name__}: {error}. Not run (fail closed).", file=out)
        return EXIT_ERROR


def console_main() -> None:
    sys.exit(main())


if __name__ == "__main__":
    console_main()
