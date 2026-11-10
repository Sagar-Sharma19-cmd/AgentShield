"""
--wait-for-review tests against an in-process stub gateway on 127.0.0.1 (not the AgentShield backend),
in the style of test_http_stub.py. The stub scripts the review's status over successive GETs and the
claim response. Time is faked (sleep/monotonic are injected), so no test actually waits.
"""

from __future__ import annotations

import io
import json
import re
import threading
import unittest
from contextlib import redirect_stdout
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import MagicMock

from agentshield_client import AgentShieldClient, GatewayConfig, GatewayRejected, MalformedResponse
from enforcement import Operation, Outcome, ReviewWait, run_operation

from tests.test_enforcement import FAKE_KEY, gateway_body

REVIEW_ID = "77777777-7777-7777-7777-777777777777"
REQUEST_ID = "11111111-2222-3333-4444-555555555555"
OPERATION = Operation("k8s.delete_pod", "kubernetes", "DELETE", "k8s/staging/pod/api-7f9", "Delete a staging pod")


def review_body(status, *, reviewer=None, note=None, expired=False, consumed=False,
                tool=OPERATION.tool, action=OPERATION.action, resource=OPERATION.resource):
    return {
        "id": REVIEW_ID, "requestId": REQUEST_ID, "status": status, "reviewer": reviewer, "note": note,
        "expiresAt": "2026-11-10T12:30:00Z", "expired": expired, "consumed": consumed,
        "tool": tool, "action": action, "resource": resource,
    }


def claim_body(*, tool=OPERATION.tool, action=OPERATION.action, resource=OPERATION.resource):
    return {"reviewId": REVIEW_ID, "requestId": REQUEST_ID, "sessionId": "ci-s", "tool": tool, "action": action,
            "resource": resource, "reviewer": "alice", "consumedAt": "2026-11-10T12:05:00Z"}


class ScriptedHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def do_POST(self):
        server = self.server
        server.seen_keys.append(self.headers.get("X-Agent-API-Key"))
        if self.path == "/api/v1/gateway/evaluate":
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode())
            body = gateway_body("REVIEW", action=payload["action"], resource=payload["resource"], review_id=REVIEW_ID)
            return self._send(200, body)
        if self.path == f"/api/v1/gateway/reviews/{REVIEW_ID}/claim":
            server.claims += 1
            status, body = server.claim_response
            return self._send(status, body)
        return self._send(404, {"message": "Review request not found."})

    def do_GET(self):
        server = self.server
        server.seen_keys.append(self.headers.get("X-Agent-API-Key"))
        if self.path != f"/api/v1/gateway/reviews/{REVIEW_ID}":
            return self._send(404, {"message": "Review request not found."})
        server.gets += 1
        # Advance through the script; the last entry repeats.
        status, body = server.script[min(server.gets - 1, len(server.script) - 1)]
        return self._send(status, body)

    def _send(self, status, body):
        raw = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


class FakeTime:
    def __init__(self):
        self.now = 0.0
        self.sleeps = []

    def monotonic(self):
        return self.now

    def sleep(self, seconds):
        self.sleeps.append(seconds)
        self.now += seconds


class WaitForReviewTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), ScriptedHandler)
        cls.server.daemon_threads = True
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.config = GatewayConfig(gateway_url=f"http://127.0.0.1:{cls.server.server_address[1]}",
                                   agent_id="ci-devops-agent", api_key=FAKE_KEY)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        self.server.script = [(200, review_body("PENDING"))]
        self.server.claim_response = (200, claim_body())
        self.server.gets = 0
        self.server.claims = 0
        self.server.seen_keys = []
        self.time = FakeTime()
        self.statuses = []

    def run_step(self, timeout=300.0):
        client = AgentShieldClient(self.config, timeout=5.0)
        executor = MagicMock(return_value="mock ok")
        wait = ReviewWait(timeout_seconds=timeout, poll_seconds=3.0, sleep=self.time.sleep,
                          monotonic=self.time.monotonic, on_status=lambda r: self.statuses.append(r.status))
        step = run_operation(client, "ci-s", OPERATION, {OPERATION.name: executor}, review_wait=wait)
        return step, executor

    def assert_key_never_leaked(self, step):
        self.assertTrue(self.server.seen_keys)
        self.assertTrue(all(key == FAKE_KEY for key in self.server.seen_keys), "key sent in its header only")
        self.assertNotIn(FAKE_KEY, step.message)

    # -------------------------------------------------------------------------------- outcomes

    def test_approved_is_claimed_once_and_executed(self):
        self.server.script = [(200, review_body("PENDING")), (200, review_body("IN_REVIEW")),
                              (200, review_body("APPROVED", reviewer="alice"))]
        step, executor = self.run_step()
        self.assertEqual(step.outcome, Outcome.EXECUTED)
        executor.assert_called_once_with(OPERATION)
        self.assertEqual(self.server.claims, 1)
        self.assertEqual(self.statuses, ["PENDING", "IN_REVIEW", "APPROVED"])
        self.assertEqual(self.time.sleeps, [3.0, 3.0], "polls every 3 s until decided")
        self.assertIn("Approved by alice", step.message)
        self.assert_key_never_leaked(step)

    def test_rejected_is_blocked_with_reviewer_and_note(self):
        self.server.script = [(200, review_body("IN_REVIEW")),
                              (200, review_body("REJECTED", reviewer="bob", note="Pod serves live traffic."))]
        step, executor = self.run_step()
        self.assertEqual(step.outcome, Outcome.BLOCKED)
        executor.assert_not_called()
        self.assertEqual(self.server.claims, 0)
        self.assertIn("bob", step.message)
        self.assertIn("Pod serves live traffic.", step.message)
        self.assertEqual(step.review.status, "REJECTED")

    def test_timeout_fails_closed(self):
        step, executor = self.run_step(timeout=10.0)
        self.assertEqual(step.outcome, Outcome.FAILED_CLOSED)
        executor.assert_not_called()
        self.assertEqual(self.server.claims, 0)
        self.assertIn("within 10 s", step.message)
        self.assertEqual(sum(self.time.sleeps), 10.0, "waited exactly the timeout, in fake time")
        self.assertEqual(self.statuses, ["PENDING"], "an unchanged status is printed once")

    def test_claimed_operation_mismatch_fails_closed(self):
        self.server.script = [(200, review_body("APPROVED", reviewer="alice"))]
        self.server.claim_response = (200, claim_body(resource="k8s/production/pod/api-7f9"))
        step, executor = self.run_step()
        self.assertEqual(step.outcome, Outcome.FAILED_CLOSED)
        executor.assert_not_called()
        self.assertIn("does not match", step.message)

    def test_claimed_action_mismatch_fails_closed(self):
        self.server.script = [(200, review_body("APPROVED", reviewer="alice"))]
        self.server.claim_response = (200, claim_body(action="EXECUTE"))
        step, executor = self.run_step()
        self.assertEqual(step.outcome, Outcome.FAILED_CLOSED)
        executor.assert_not_called()

    def test_expired_fails_closed_without_claiming(self):
        self.server.script = [(200, review_body("APPROVED", reviewer="alice", expired=True))]
        step, executor = self.run_step()
        self.assertEqual(step.outcome, Outcome.FAILED_CLOSED)
        executor.assert_not_called()
        self.assertEqual(self.server.claims, 0)
        self.assertIn("expired", step.message)

    def test_already_consumed_fails_closed_without_claiming(self):
        self.server.script = [(200, review_body("APPROVED", reviewer="alice", consumed=True))]
        step, executor = self.run_step()
        self.assertEqual(step.outcome, Outcome.FAILED_CLOSED)
        executor.assert_not_called()
        self.assertEqual(self.server.claims, 0)

    def test_claim_conflict_fails_closed_with_server_message(self):
        self.server.script = [(200, review_body("APPROVED", reviewer="alice"))]
        self.server.claim_response = (409, {"message": "This approval was already claimed."})
        step, executor = self.run_step()
        self.assertEqual(step.outcome, Outcome.FAILED_CLOSED)
        executor.assert_not_called()
        self.assertIn("409", step.message)
        self.assertIn("already claimed", step.message)

    def test_review_read_error_fails_closed(self):
        self.server.script = [(200, review_body("PENDING")), (500, {"message": "boom"})]
        step, executor = self.run_step()
        self.assertEqual(step.outcome, Outcome.FAILED_CLOSED)
        executor.assert_not_called()

    def test_malformed_review_fails_closed(self):
        self.server.script = [(200, {"id": REVIEW_ID, "status": "MAYBE"})]
        step, executor = self.run_step()
        self.assertEqual(step.outcome, Outcome.FAILED_CLOSED)
        executor.assert_not_called()

    def test_without_the_flag_review_still_waits_and_does_not_poll(self):
        client = AgentShieldClient(self.config, timeout=5.0)
        executor = MagicMock()
        step = run_operation(client, "ci-s", OPERATION, {OPERATION.name: executor})
        self.assertEqual(step.outcome, Outcome.WAITING_FOR_REVIEW)
        executor.assert_not_called()
        self.assertEqual(self.server.gets, 0)


class ReviewClientTests(unittest.TestCase):
    """get_review / claim_review input and response validation, without a server."""

    def setUp(self):
        self.client = AgentShieldClient(GatewayConfig("http://gateway.test", "a", FAKE_KEY),
                                        opener=MagicMock(side_effect=AssertionError("must not send")))

    def test_non_uuid_review_id_is_refused_before_sending(self):
        for bad in ("../agents", "77777777-7777-7777-7777-777777777777/claim", "", "x" * 36):
            with self.assertRaises(MalformedResponse):
                self.client.get_review(bad)
            with self.assertRaises(MalformedResponse):
                self.client.claim_review(bad)

    def test_rejected_error_carries_detail_but_never_the_key(self):
        error = GatewayRejected(409, "already claimed")
        self.assertIn("already claimed", str(error))
        self.assertNotIn(FAKE_KEY, str(error))


class CliOutputTests(unittest.TestCase):
    def test_status_line_names_review_and_operation(self):
        import simulator
        from agentshield_client import ReviewStatus
        buffer = io.StringIO()
        with redirect_stdout(buffer):
            simulator._print_review_status(ReviewStatus(REVIEW_ID, REQUEST_ID, "REJECTED", "bob", "no", None, False,
                                                        False, "kubernetes", "DELETE", "k8s/staging/pod/api-7f9"))
        line = buffer.getvalue()
        self.assertTrue(re.search(r"review 7777.*kubernetes DELETE -> k8s/staging/pod/api-7f9\): REJECTED by bob - no",
                                  line), line)

    def test_review_timeout_must_be_positive(self):
        import simulator
        with redirect_stdout(io.StringIO()), self.assertRaises(SystemExit):
            import contextlib
            with contextlib.redirect_stderr(io.StringIO()):
                simulator.build_parser().parse_args(["--scenario", "review_required", "--review-timeout", "0"])
        args = simulator.build_parser().parse_args(["--scenario", "review_required", "--wait-for-review"])
        self.assertTrue(args.wait_for_review)
        self.assertEqual(args.review_timeout, 300.0)


if __name__ == "__main__":
    unittest.main()
