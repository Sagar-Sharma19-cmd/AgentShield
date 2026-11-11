"""
agentshield-guard tests against a local stub gateway (standard library only). The command runs only after an
ALLOW (or a claimed approval) and a successful redeem; every other path exits without running it.
"""

import io
import json
import os
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(__file__), os.pardir))

from agentshield_guard import cli  # noqa: E402

FAKE_KEY = "agk_live_FAKE_GUARD_TEST_KEY_NOT_REAL_0000"
FAKE_TOKEN = "eyJhbGciOiJIUzI1NiJ9.FAKE-GUARD-TOKEN.not-a-real-signature"
CLAIM_TOKEN = "eyJhbGciOiJIUzI1NiJ9.FAKE-CLAIM-TOKEN.not-a-real-signature"
REQUEST_ID = "11111111-2222-3333-4444-555555555555"
REVIEW_ID = "77777777-7777-7777-7777-777777777777"
TOOL, ACTION, RESOURCE = "docker", "WRITE", "image:agentshield-demo"


def evaluation(decision):
    body = {"requestId": REQUEST_ID, "agentId": "guard-agent", "sessionId": "s", "action": ACTION,
            "resource": RESOURCE, "decision": decision, "reason": f"stub {decision.lower()} reason", "riskScore": 10,
            "authorizationResult": "AUTHORIZED", "riskTier": "LOW",
            "reviewRequestId": REVIEW_ID if decision == "REVIEW" else None}
    if decision == "ALLOW":
        body["decisionToken"] = FAKE_TOKEN
    return body


def review(status, **extra):
    body = {"id": REVIEW_ID, "requestId": REQUEST_ID, "status": status, "reviewer": None, "note": None,
            "expiresAt": "2026-11-11T11:00:00Z", "expired": False, "consumed": False, "tool": TOOL, "action": ACTION,
            "resource": RESOURCE}
    body.update(extra)
    return body


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _reply(self, status, body):
        raw = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        s = self.server
        s.log.append(("GET", self.path, None))
        s.gets += 1
        status, body = s.reviews[min(s.gets - 1, len(s.reviews) - 1)]
        self._reply(status, body)

    def do_POST(self):
        s = self.server
        length = int(self.headers.get("Content-Length", "0"))
        payload = json.loads(self.rfile.read(length).decode()) if length else None
        s.log.append(("POST", self.path, payload))
        s.keys.append(self.headers.get("X-Agent-API-Key"))
        if self.path == "/api/v1/gateway/evaluate":
            return self._reply(*s.evaluate)
        if self.path == f"/api/v1/gateway/reviews/{REVIEW_ID}/claim":
            return self._reply(*s.claim)
        if self.path == "/api/v1/gateway/decisions/redeem":
            return self._reply(*s.redeem)
        return self._reply(404, {"message": "not found"})


class Recorder:
    """Stands in for run_command and records argv. Asserts it is called with a list, never a string."""

    def __init__(self, code=0):
        self.code = code
        self.calls = []

    def __call__(self, argv):
        assert isinstance(argv, list), "argv must be a list (no shell)"
        self.calls.append(argv)
        return self.code


class FakeTime:
    def __init__(self):
        self.now = 0.0
        self.sleeps = []

    def monotonic(self):
        return self.now

    def sleep(self, seconds):
        self.sleeps.append(seconds)
        self.now += seconds


class GuardTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.server.daemon_threads = True
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.env = {"AGENTSHIELD_GATEWAY_URL": f"http://127.0.0.1:{cls.server.server_address[1]}",
                   "AGENTSHIELD_AGENT_ID": "guard-agent", "AGENTSHIELD_AGENT_API_KEY": FAKE_KEY}

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        s = self.server
        s.evaluate = (200, evaluation("ALLOW"))
        s.claim = (200, {"reviewId": REVIEW_ID, "requestId": REQUEST_ID, "tool": TOOL, "action": ACTION,
                         "resource": RESOURCE, "reviewer": "alice", "decisionToken": CLAIM_TOKEN})
        s.redeem = (200, {"requestId": REQUEST_ID, "redeemedAt": "2026-11-11T10:00:00Z"})
        s.reviews = [(200, review("PENDING"))]
        s.gets = 0
        s.log = []
        s.keys = []
        self.runner = Recorder()
        self.time = FakeTime()
        self.out = io.StringIO()

    def guard(self, *extra, sub="run", command=("echo", "hello world"), env=None):
        argv = [sub, "--tool", TOOL, "--action", ACTION, "--resource", RESOURCE, "--session", "test-session", *extra]
        if command:
            argv += ["--", *command]
        code = cli.main(argv, environ=env or self.env, runner=self.runner, sleep=self.time.sleep,
                        monotonic=self.time.monotonic, out=self.out)
        output = self.out.getvalue()
        self.assertNotIn(FAKE_KEY, output)
        self.assertNotIn(FAKE_TOKEN, output)
        self.assertNotIn(CLAIM_TOKEN, output)
        return code, output

    def paths(self):
        return [path for _, path, _ in self.server.log]

    # ------------------------------------------------------------------ ALLOW

    def test_allow_redeems_then_runs_the_argv_list(self):
        self.runner.code = 7
        code, output = self.guard()
        self.assertEqual(code, 7, "exits with the command's exit code")
        self.assertEqual(self.runner.calls, [["echo", "hello world"]], "argv passed as a list, unsplit")
        self.assertEqual(self.paths(), ["/api/v1/gateway/evaluate", "/api/v1/gateway/decisions/redeem"])
        evaluate, redeem = self.server.log[0][2], self.server.log[1][2]
        self.assertEqual(evaluate, {"agentId": "guard-agent", "sessionId": "test-session", "action": ACTION,
                                    "resource": RESOURCE, "tool": TOOL})
        self.assertEqual(redeem, {"token": FAKE_TOKEN, "tool": TOOL, "action": ACTION, "resource": RESOURCE})
        self.assertEqual(set(self.server.keys), {FAKE_KEY})
        self.assertNotIn("hello world", output, "command arguments are not echoed")

    def test_redeem_failure_never_runs(self):
        for status in (401, 403, 409, 500):
            with self.subTest(status=status):
                self.setUp()
                self.server.redeem = (status, {"message": f"refused {status}"})
                code, output = self.guard()
                self.assertEqual(code, cli.EXIT_ERROR)
                self.assertEqual(self.runner.calls, [])
                self.assertIn(str(status), output)

    def test_allow_without_token_never_runs(self):
        body = evaluation("ALLOW")
        del body["decisionToken"]
        self.server.evaluate = (200, body)
        code, _ = self.guard()
        self.assertEqual(code, cli.EXIT_ERROR)
        self.assertEqual(self.runner.calls, [])
        self.assertNotIn("/api/v1/gateway/decisions/redeem", self.paths())

    # ------------------------------------------------------------------ DENY / REVIEW / errors

    def test_deny_exits_3_with_the_reason(self):
        self.server.evaluate = (200, evaluation("DENY"))
        code, output = self.guard()
        self.assertEqual(code, cli.EXIT_DENIED)
        self.assertIn("stub deny reason", output)
        self.assertEqual(self.runner.calls, [])

    def test_review_without_wait_exits_4_with_the_review_id(self):
        self.server.evaluate = (200, evaluation("REVIEW"))
        code, output = self.guard()
        self.assertEqual(code, cli.EXIT_REVIEW)
        self.assertIn(REVIEW_ID, output)
        self.assertEqual(self.runner.calls, [])
        self.assertEqual(self.paths(), ["/api/v1/gateway/evaluate"])

    def test_gateway_down_exits_5_and_never_runs(self):
        env = dict(self.env, AGENTSHIELD_GATEWAY_URL="http://127.0.0.1:9")
        code, output = self.guard(env=env)
        self.assertEqual(code, cli.EXIT_ERROR)
        self.assertEqual(self.runner.calls, [])
        self.assertIn("fail closed", output)

    def test_gateway_error_status_exits_5(self):
        self.server.evaluate = (401, {"message": "Invalid or missing agent API key"})
        code, _ = self.guard()
        self.assertEqual(code, cli.EXIT_ERROR)
        self.assertEqual(self.runner.calls, [])

    def test_missing_config_exits_5_naming_variables_only(self):
        code, output = self.guard(env={"AGENTSHIELD_AGENT_API_KEY": FAKE_KEY})
        self.assertEqual(code, cli.EXIT_ERROR)
        self.assertIn("AGENTSHIELD_GATEWAY_URL", output)
        self.assertEqual(self.server.log, [])

    # ------------------------------------------------------------------ --wait-for-review

    def test_wait_approved_claims_redeems_and_runs(self):
        self.server.evaluate = (200, evaluation("REVIEW"))
        self.server.reviews = [(200, review("PENDING")), (200, review("IN_REVIEW")),
                               (200, review("APPROVED", reviewer="alice"))]
        code, output = self.guard("--wait-for-review")
        self.assertEqual(code, 0)
        self.assertEqual(self.runner.calls, [["echo", "hello world"]])
        self.assertEqual(self.time.sleeps, [3.0, 3.0], "polls every 3 s")
        self.assertEqual(self.paths()[-2:], [f"/api/v1/gateway/reviews/{REVIEW_ID}/claim",
                                             "/api/v1/gateway/decisions/redeem"])
        self.assertEqual(self.server.log[-1][2]["token"], CLAIM_TOKEN)
        self.assertIn("alice", output)

    def test_wait_rejected_exits_3_with_reviewer_and_note(self):
        self.server.evaluate = (200, evaluation("REVIEW"))
        self.server.reviews = [(200, review("REJECTED", reviewer="bob", note="Not from CI."))]
        code, output = self.guard("--wait-for-review")
        self.assertEqual(code, cli.EXIT_DENIED)
        self.assertIn("bob", output)
        self.assertIn("Not from CI.", output)
        self.assertEqual(self.runner.calls, [])

    def test_wait_timeout_exits_5(self):
        self.server.evaluate = (200, evaluation("REVIEW"))
        code, output = self.guard("--wait-for-review", "--review-timeout", "7")
        self.assertEqual(code, cli.EXIT_ERROR)
        self.assertEqual(self.time.sleeps, [3.0, 3.0, 1.0])
        self.assertIn("no decision", output)
        self.assertEqual(self.runner.calls, [])

    def test_wait_expired_exits_5(self):
        self.server.evaluate = (200, evaluation("REVIEW"))
        self.server.reviews = [(200, review("APPROVED", expired=True))]
        code, _ = self.guard("--wait-for-review")
        self.assertEqual(code, cli.EXIT_ERROR)
        self.assertEqual(self.runner.calls, [])

    def test_wait_approved_but_redeem_refused_never_runs(self):
        self.server.evaluate = (200, evaluation("REVIEW"))
        self.server.reviews = [(200, review("APPROVED", reviewer="alice"))]
        self.server.redeem = (409, {"message": "This decision was already redeemed."})
        code, _ = self.guard("--wait-for-review")
        self.assertEqual(code, cli.EXIT_ERROR)
        self.assertEqual(self.runner.calls, [])

    def test_wait_claim_for_a_different_operation_never_runs(self):
        self.server.evaluate = (200, evaluation("REVIEW"))
        self.server.reviews = [(200, review("APPROVED", reviewer="alice"))]
        self.server.claim = (200, {"reviewId": REVIEW_ID, "requestId": REQUEST_ID, "tool": TOOL, "action": ACTION,
                                   "resource": "image:something-else", "decisionToken": CLAIM_TOKEN})
        code, _ = self.guard("--wait-for-review")
        self.assertEqual(code, cli.EXIT_ERROR)
        self.assertEqual(self.runner.calls, [])
        self.assertNotIn("/api/v1/gateway/decisions/redeem", self.paths())

    # ------------------------------------------------------------------ check, usage, session

    def test_check_exit_codes_and_never_redeems(self):
        for decision, expected in (("ALLOW", 0), ("DENY", 3), ("REVIEW", 4)):
            with self.subTest(decision=decision):
                self.setUp()
                self.server.evaluate = (200, evaluation(decision))
                code, output = self.guard(sub="check", command=())
                self.assertEqual(code, expected)
                self.assertIn(decision, output)
                self.assertEqual(self.paths(), ["/api/v1/gateway/evaluate"])
                self.assertEqual(self.runner.calls, [])

    def test_run_without_command_is_a_usage_error(self):
        code, _ = self.guard(command=())
        self.assertEqual(code, 2)
        self.assertEqual(self.server.log, [])

    def test_default_session_ids(self):
        self.assertEqual(cli.default_session_id({"BUILD_TAG": "jenkins-agentshield-42"}), "jenkins-agentshield-42")
        self.assertEqual(cli.default_session_id({"GITHUB_RUN_ID": "987", "GITHUB_JOB": "build"}), "gh-987-build")
        self.assertEqual(cli.default_session_id({"GITHUB_RUN_ID": "987"}), "gh-987")
        generated = cli.default_session_id({})
        self.assertRegex(generated, r"^guard-[0-9a-f]{12}$")
        self.assertEqual(len(cli.default_session_id({"BUILD_TAG": "x" * 400})), 255)

    def test_session_from_ci_is_sent(self):
        env = dict(self.env, GITHUB_RUN_ID="555", GITHUB_JOB="deploy")
        argv = ["run", "--tool", TOOL, "--action", ACTION, "--resource", RESOURCE, "--", "true"]
        cli.main(argv, environ=env, runner=self.runner, out=self.out)
        self.assertEqual(self.server.log[0][2]["sessionId"], "gh-555-deploy")


class RealSubprocessTests(unittest.TestCase):
    """run_command really executes argv without a shell and returns its exit code."""

    def test_exit_code_passthrough(self):
        self.assertEqual(cli.run_command([sys.executable, "-c", "import sys; sys.exit(7)"]), 0 + 7)

    def test_no_shell_interpretation(self):
        # With a shell, "$HOME; exit 9" would expand and exit 9. Without one it is a single literal argument.
        code = cli.run_command([sys.executable, "-c",
                                "import sys; sys.exit(0 if sys.argv[1] == '$HOME; exit 9' else 1)", "$HOME; exit 9"])
        self.assertEqual(code, 0)

    def test_missing_program_raises_file_not_found(self):
        with self.assertRaises(FileNotFoundError):
            cli.run_command(["agentshield-guard-no-such-program-xyz"])


if __name__ == "__main__":
    unittest.main()
