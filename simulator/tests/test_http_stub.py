"""
Real-socket tests against an in-process stub gateway on 127.0.0.1 (not the AgentShield backend).

These exercise the actual urllib path (real HTTP status codes, real timeouts) that the
opener-injection tests cannot reach. The stub returns decisions chosen by the requested resource.
"""

from __future__ import annotations

import json
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import MagicMock

from agentshield_client import AgentShieldClient, GatewayConfig, GatewayRejected, GatewayUnavailable
from enforcement import Operation, Outcome, run_operation

from tests.test_enforcement import FAKE_KEY, FAKE_TOKEN, gateway_body, redeem_body

RESPONSES = {
    "allow-me": ("ALLOW", 200),
    "review-me": ("REVIEW", 200),
    "deny-me": ("DENY", 200),
    "unauthorised": ("HTTP401", 401),
    "server-error": ("HTTP500", 500),
    "slow": ("SLOW", 200),
    "garbage": ("GARBAGE", 200),
}


class StubHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):  # keep test output quiet
        pass

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        payload = json.loads(self.rfile.read(length).decode())
        if self.path == "/api/v1/gateway/decisions/redeem":
            # Phase E1: accept the redemption only for the token the stub issued.
            if payload.get("token") != FAKE_TOKEN:
                return self._send(401, b'{"message":"The decision token is not valid."}')
            return self._send(200, json.dumps(redeem_body()).encode())
        mode, status = RESPONSES.get(payload["resource"], ("ALLOW", 200))

        if mode == "SLOW":
            time.sleep(1.5)  # longer than the client timeout used below
            return self._send(200, b"{}")
        if mode == "GARBAGE":
            return self._send(200, b"not json at all")
        if mode.startswith("HTTP"):
            return self._send(status, b'{"error":"stub"}')

        body = gateway_body(mode, action=payload["action"], resource=payload["resource"],
                            review_id="77777777-7777-7777-7777-777777777777" if mode == "REVIEW" else None)
        return self._send(status, json.dumps(body).encode())

    def _send(self, status, body):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class StubGatewayTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), StubHandler)
        cls.server.daemon_threads = True
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.config = GatewayConfig(
            gateway_url=f"http://127.0.0.1:{cls.server.server_address[1]}",
            agent_id="ci-devops-agent",
            api_key=FAKE_KEY,
        )

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def run_with(self, resource, timeout=5.0):
        client = AgentShieldClient(self.config, timeout=timeout)
        op = Operation(f"op.{resource}", "github", "READ", resource, "stub operation")
        executors = {op.name: MagicMock(return_value="mock ok")}
        step = run_operation(client, "ci-stub-session", op, executors)
        return step, executors[op.name]

    def test_allow_over_real_http_executes(self):
        step, executor = self.run_with("allow-me")
        self.assertEqual(step.outcome, Outcome.EXECUTED)
        executor.assert_called_once()

    def test_review_over_real_http_does_not_execute(self):
        step, executor = self.run_with("review-me")
        self.assertEqual(step.outcome, Outcome.WAITING_FOR_REVIEW)
        executor.assert_not_called()

    def test_deny_over_real_http_does_not_execute(self):
        step, executor = self.run_with("deny-me")
        self.assertEqual(step.outcome, Outcome.BLOCKED)
        executor.assert_not_called()

    def test_real_http_401_fails_closed(self):
        client = AgentShieldClient(self.config, timeout=5.0)
        with self.assertRaises(GatewayRejected) as ctx:
            client.evaluate(session_id="s", action="READ", resource="unauthorised", tool="github")
        self.assertEqual(ctx.exception.status, 401)

    def test_real_http_500_fails_closed(self):
        step, executor = self.run_with("server-error")
        self.assertEqual(step.outcome, Outcome.FAILED_CLOSED)
        executor.assert_not_called()

    def test_real_timeout_fails_closed(self):
        step, executor = self.run_with("slow", timeout=0.3)
        self.assertEqual(step.outcome, Outcome.FAILED_CLOSED)
        self.assertIn("timed out", step.message)
        executor.assert_not_called()

    def test_real_garbage_body_fails_closed(self):
        step, executor = self.run_with("garbage")
        self.assertEqual(step.outcome, Outcome.FAILED_CLOSED)
        executor.assert_not_called()

    def test_connection_refused_fails_closed(self):
        # Port 9 (discard) is closed on this machine; nothing is contacted beyond a refused connect.
        config = GatewayConfig(gateway_url="http://127.0.0.1:9", agent_id="ci-devops-agent", api_key=FAKE_KEY)
        client = AgentShieldClient(config, timeout=2.0)
        with self.assertRaises(GatewayUnavailable):
            client.evaluate(session_id="s", action="READ", resource="x", tool="github")


if __name__ == "__main__":
    unittest.main()
