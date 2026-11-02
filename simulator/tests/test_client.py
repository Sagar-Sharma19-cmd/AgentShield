"""Client and configuration tests. No network access: the opener is injected."""

from __future__ import annotations

import io
import json
import unittest
from contextlib import redirect_stdout

from agentshield_client import (
    AgentShieldClient,
    ConfigError,
    GatewayConfig,
    GatewayRejected,
    GatewayUnavailable,
    MalformedResponse,
    load_config,
)
from enforcement import Operation, run_operation
from unittest.mock import MagicMock

from tests.test_enforcement import FakeResponse, FAKE_KEY, gateway_body

ENV = {
    "AGENTSHIELD_GATEWAY_URL": "http://gateway.test:9999/",
    "AGENTSHIELD_AGENT_ID": "ci-devops-agent",
    "AGENTSHIELD_AGENT_API_KEY": FAKE_KEY,
}


class ConfigTests(unittest.TestCase):
    def test_loads_all_values_and_strips_trailing_slash(self):
        config = load_config(ENV)
        self.assertEqual(config.gateway_url, "http://gateway.test:9999")
        self.assertEqual(config.agent_id, "ci-devops-agent")
        self.assertEqual(config.api_key, FAKE_KEY)

    def test_missing_variables_are_named_but_values_are_not_shown(self):
        env = dict(ENV)
        del env["AGENTSHIELD_AGENT_API_KEY"]
        with self.assertRaises(ConfigError) as ctx:
            load_config(env)
        message = str(ctx.exception)
        self.assertIn("AGENTSHIELD_AGENT_API_KEY", message)
        self.assertNotIn(FAKE_KEY, message)

    def test_no_default_gateway_url(self):
        env = dict(ENV)
        del env["AGENTSHIELD_GATEWAY_URL"]
        with self.assertRaises(ConfigError):
            load_config(env)

    def test_rejects_non_http_scheme(self):
        env = dict(ENV, AGENTSHIELD_GATEWAY_URL="ftp://gateway.test")
        with self.assertRaises(ConfigError):
            load_config(env)

    def test_config_repr_hides_key(self):
        config = load_config(ENV)
        self.assertNotIn(FAKE_KEY, repr(config))
        self.assertIn("<hidden>", repr(config))


class RequestContractTests(unittest.TestCase):
    def test_sends_exact_contract_and_key_header(self):
        captured = {}

        def opener(request, timeout):
            captured["url"] = request.full_url
            captured["method"] = request.get_method()
            captured["headers"] = {k.lower(): v for k, v in request.header_items()}
            captured["body"] = json.loads(request.data.decode())
            captured["timeout"] = timeout
            return FakeResponse(200, json.dumps(gateway_body("ALLOW")).encode())

        client = AgentShieldClient(load_config(ENV), timeout=3.5, opener=opener)
        client.evaluate(session_id="ci-s-1", action="READ", resource="agentshield/repo/build-info", tool="github")

        self.assertEqual(captured["url"], "http://gateway.test:9999/api/v1/gateway/evaluate")
        self.assertEqual(captured["method"], "POST")
        self.assertEqual(captured["timeout"], 3.5)
        self.assertEqual(captured["headers"]["x-agent-api-key"], FAKE_KEY)
        self.assertEqual(captured["body"], {
            "agentId": "ci-devops-agent",
            "sessionId": "ci-s-1",
            "action": "READ",
            "resource": "agentshield/repo/build-info",
            "tool": "github",
        })


class ErrorMessageSecrecyTests(unittest.TestCase):
    def test_http_error_message_does_not_contain_key(self):
        import urllib.error

        def opener(request, timeout):
            raise urllib.error.HTTPError(request.full_url, 401, "Unauthorized", {}, io.BytesIO(b""))

        client = AgentShieldClient(load_config(ENV), opener=opener)
        with self.assertRaises(GatewayRejected) as ctx:
            client.evaluate(session_id="s", action="READ", resource="r", tool="github")
        self.assertNotIn(FAKE_KEY, str(ctx.exception))
        self.assertEqual(ctx.exception.status, 401)

    def test_unavailable_message_does_not_contain_key(self):
        def opener(request, timeout):
            raise ConnectionRefusedError()

        client = AgentShieldClient(load_config(ENV), opener=opener)
        with self.assertRaises(GatewayUnavailable) as ctx:
            client.evaluate(session_id="s", action="READ", resource="r", tool="github")
        self.assertNotIn(FAKE_KEY, str(ctx.exception))


class ParsingTests(unittest.TestCase):
    def test_review_carries_review_request_id(self):
        body = gateway_body("REVIEW", action="EXECUTE", resource="jenkins/job/x", review_id="abc-123")
        client = AgentShieldClient(load_config(ENV),
                                   opener=lambda r, t: FakeResponse(200, json.dumps(body).encode()))
        evaluation = client.evaluate(session_id="s", action="EXECUTE", resource="jenkins/job/x", tool="jenkins")
        self.assertEqual(evaluation.decision, "REVIEW")
        self.assertEqual(evaluation.review_request_id, "abc-123")

    def test_non_2xx_is_rejected_even_if_body_says_allow(self):
        body = json.dumps(gateway_body("ALLOW")).encode()
        client = AgentShieldClient(load_config(ENV),
                                   opener=lambda r, t: FakeResponse(503, body))
        with self.assertRaises(GatewayRejected):
            client.evaluate(session_id="s", action="READ", resource="agentshield/repo/build-info", tool="github")

    def test_malformed_json_raises_malformed(self):
        client = AgentShieldClient(load_config(ENV), opener=lambda r, t: FakeResponse(200, b"{oops"))
        with self.assertRaises(MalformedResponse):
            client.evaluate(session_id="s", action="READ", resource="agentshield/repo/build-info", tool="github")


class NoSecretOutputTests(unittest.TestCase):
    def test_fail_closed_output_never_contains_key(self):
        def opener(request, timeout):
            raise ConnectionRefusedError()

        client = AgentShieldClient(load_config(ENV), opener=opener)
        executors = {"github.read_build_info": MagicMock()}
        op = Operation("github.read_build_info", "github", "READ", "agentshield/repo/build-info", "read")

        buffer = io.StringIO()
        with redirect_stdout(buffer):
            step = run_operation(client, "s", op, executors)
            print(step.message)

        self.assertNotIn(FAKE_KEY, buffer.getvalue())
        self.assertNotIn(FAKE_KEY, step.message)
        executors["github.read_build_info"].assert_not_called()


if __name__ == "__main__":
    unittest.main()
