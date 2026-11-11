"""SDK client tests against a local stub HTTP server (standard library only). Nothing real is contacted."""

import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from agentshield import (
    AgentShieldClient,
    ConfigError,
    GatewayConfig,
    GatewayRejected,
    GatewayUnavailable,
    MalformedResponse,
    load_config,
    parse_evaluation,
)

FAKE_KEY = "agk_live_FAKE_SDK_TEST_KEY_NOT_REAL_000000"
FAKE_TOKEN = "eyJhbGciOiJIUzI1NiJ9.FAKE-SDK-TOKEN.not-a-real-signature"
REQUEST_ID = "11111111-2222-3333-4444-555555555555"
REVIEW_ID = "77777777-7777-7777-7777-777777777777"


def evaluation(decision, **extra):
    body = {"requestId": REQUEST_ID, "agentId": "a", "sessionId": "s", "action": "WRITE", "resource": "image:demo",
            "decision": decision, "reason": "because", "riskScore": 10,
            "authorizationResult": "AUTHORIZED" if decision != "DENY" else "UNAUTHORIZED", "riskTier": "LOW",
            "reviewRequestId": REVIEW_ID if decision == "REVIEW" else None}
    if decision == "ALLOW":
        body["decisionToken"] = FAKE_TOKEN
    body.update(extra)
    return body


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        payload = json.loads(self.rfile.read(length).decode()) if length else None
        self.server.requests.append((self.path, payload, self.headers.get("X-Agent-API-Key")))
        status, body = self.server.answers.get(self.path, (404, {"message": "not found"}))
        raw = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


class ClientTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.server.daemon_threads = True
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.config = GatewayConfig(gateway_url=f"http://127.0.0.1:{cls.server.server_address[1]}", agent_id="a",
                                   api_key=FAKE_KEY)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        self.server.requests = []
        self.server.answers = {}
        self.client = AgentShieldClient(self.config, timeout=5.0)

    def test_allow_carries_the_token_and_repr_hides_it(self):
        self.server.answers["/api/v1/gateway/evaluate"] = (200, evaluation("ALLOW"))
        result = self.client.evaluate(session_id="s", action="WRITE", resource="image:demo", tool="docker")
        self.assertEqual(result.decision, "ALLOW")
        self.assertEqual(result.decision_token, FAKE_TOKEN)
        self.assertNotIn(FAKE_TOKEN, repr(result))
        path, payload, key = self.server.requests[0]
        self.assertEqual(payload, {"agentId": "a", "sessionId": "s", "action": "WRITE", "resource": "image:demo",
                                   "tool": "docker"})
        self.assertEqual(key, FAKE_KEY)

    def test_review_and_deny_have_no_token(self):
        for decision in ("REVIEW", "DENY"):
            self.server.answers["/api/v1/gateway/evaluate"] = (200, evaluation(decision))
            result = self.client.evaluate(session_id="s", action="WRITE", resource="image:demo", tool="docker")
            self.assertIsNone(result.decision_token)

    def test_token_without_allow_is_contradictory(self):
        with self.assertRaises(MalformedResponse):
            parse_evaluation(json.dumps(evaluation("REVIEW", decisionToken=FAKE_TOKEN)).encode(),
                             expected_action="WRITE", expected_resource="image:demo")

    def test_redeem_sends_token_and_operation(self):
        self.server.answers["/api/v1/gateway/decisions/redeem"] = (200, {"requestId": REQUEST_ID,
                                                                         "redeemedAt": "2026-11-11T10:00:00Z"})
        redemption = self.client.redeem(token=FAKE_TOKEN, tool="docker", action="WRITE", resource="image:demo",
                                        expected_request_id=REQUEST_ID)
        self.assertEqual(redemption.request_id, REQUEST_ID)
        path, payload, key = self.server.requests[0]
        self.assertEqual(path, "/api/v1/gateway/decisions/redeem")
        self.assertEqual(payload, {"token": FAKE_TOKEN, "tool": "docker", "action": "WRITE", "resource": "image:demo"})
        self.assertEqual(key, FAKE_KEY)

    def test_redeem_refusals_raise_with_status_and_never_the_token(self):
        for status in (401, 403, 409):
            self.server.answers["/api/v1/gateway/decisions/redeem"] = (status, {"message": f"refused {status}"})
            with self.assertRaises(GatewayRejected) as ctx:
                self.client.redeem(token=FAKE_TOKEN, tool="docker", action="WRITE", resource="image:demo")
            self.assertEqual(ctx.exception.status, status)
            self.assertNotIn(FAKE_TOKEN, str(ctx.exception))

    def test_redeem_for_another_request_is_malformed(self):
        self.server.answers["/api/v1/gateway/decisions/redeem"] = (200, {"requestId": "other",
                                                                         "redeemedAt": "2026-11-11T10:00:00Z"})
        with self.assertRaises(MalformedResponse):
            self.client.redeem(token=FAKE_TOKEN, tool="docker", action="WRITE", resource="image:demo",
                               expected_request_id=REQUEST_ID)

    def test_redeem_without_token_sends_nothing(self):
        with self.assertRaises(MalformedResponse):
            self.client.redeem(token="", tool="docker", action="WRITE", resource="image:demo")
        self.assertEqual(self.server.requests, [])

    def test_claim_carries_token_and_repr_hides_it(self):
        self.server.answers[f"/api/v1/gateway/reviews/{REVIEW_ID}/claim"] = (200, {
            "reviewId": REVIEW_ID, "requestId": REQUEST_ID, "tool": "docker", "action": "WRITE",
            "resource": "image:demo", "reviewer": "alice", "decisionToken": FAKE_TOKEN})
        claim = self.client.claim_review(REVIEW_ID)
        self.assertEqual(claim.decision_token, FAKE_TOKEN)
        self.assertNotIn(FAKE_TOKEN, repr(claim))

    def test_gateway_down_is_unavailable(self):
        client = AgentShieldClient(GatewayConfig(gateway_url="http://127.0.0.1:9", agent_id="a", api_key=FAKE_KEY),
                                   timeout=2.0)
        with self.assertRaises(GatewayUnavailable):
            client.redeem(token=FAKE_TOKEN, tool="docker", action="WRITE", resource="image:demo")


class ConfigTests(unittest.TestCase):
    def test_missing_variables_are_named_never_valued(self):
        with self.assertRaises(ConfigError) as ctx:
            load_config({"AGENTSHIELD_AGENT_API_KEY": FAKE_KEY})
        self.assertIn("AGENTSHIELD_GATEWAY_URL", str(ctx.exception))
        self.assertNotIn(FAKE_KEY, str(ctx.exception))

    def test_repr_hides_the_key(self):
        config = load_config({"AGENTSHIELD_GATEWAY_URL": "http://x", "AGENTSHIELD_AGENT_ID": "a",
                              "AGENTSHIELD_AGENT_API_KEY": FAKE_KEY})
        self.assertNotIn(FAKE_KEY, repr(config))


if __name__ == "__main__":
    unittest.main()
