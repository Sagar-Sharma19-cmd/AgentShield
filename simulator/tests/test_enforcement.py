"""
Enforcement tests. HTTP is replaced by an injected fake opener; no live backend is needed.

The key property under test: a mock tool executor is called only when the parsed decision is ALLOW.
"""

from __future__ import annotations

import io
import json
import socket
import unittest
import urllib.error
from unittest.mock import MagicMock

from agentshield_client import AgentShieldClient, GatewayConfig
from enforcement import Operation, Outcome, run_operation, run_pipeline

FAKE_KEY = "agk_live_FAKE_TEST_KEY_NOT_REAL_0123456789"
REQUEST_ID = "11111111-2222-3333-4444-555555555555"
REVIEW_ID = "66666666-7777-8888-9999-000000000000"

CONFIG = GatewayConfig(gateway_url="http://gateway.test", agent_id="ci-devops-agent", api_key=FAKE_KEY)

READ_OP = Operation("github.read_build_info", "github", "READ", "agentshield/repo/build-info", "Read build info")
EXEC_OP = Operation("jenkins.trigger_build", "jenkins", "EXECUTE", "jenkins/job/agentshield-build", "Trigger build")


class FakeResponse:
    def __init__(self, status: int, body: bytes):
        self.status = status
        self._body = body

    def read(self) -> bytes:
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *exc_info):
        return False


def gateway_body(decision, *, action="READ", resource="agentshield/repo/build-info",
                 authorization="AUTHORIZED", review_id=None):
    return {
        "requestId": REQUEST_ID,
        "agentId": "ci-devops-agent",
        "sessionId": "ci-test-session",
        "action": action,
        "resource": resource,
        "decision": decision,
        "reason": "test reason",
        "riskScore": 10,
        "authorizationResult": authorization,
        "riskTier": "LOW",
        "riskEngineAvailable": True,
        "reviewRequestId": review_id,
        "timestamp": "2026-11-02T10:00:00Z",
    }


def opener_returning(body_bytes: bytes, status: int = 200):
    def opener(request, timeout):
        return FakeResponse(status, body_bytes)
    return opener


def opener_raising(exception: BaseException):
    def opener(request, timeout):
        raise exception
    return opener


def client_with(opener) -> AgentShieldClient:
    return AgentShieldClient(CONFIG, opener=opener)


def executors_for(*operations):
    return {op.name: MagicMock(return_value="mock ok") for op in operations}


class AllowExecutesTests(unittest.TestCase):
    def test_allow_executes_mock_tool_exactly_once(self):
        body = json.dumps(gateway_body("ALLOW")).encode()
        executors = executors_for(READ_OP)

        step = run_operation(client_with(opener_returning(body)), "ci-test-session", READ_OP, executors)

        self.assertEqual(step.outcome, Outcome.EXECUTED)
        executors[READ_OP.name].assert_called_once_with(READ_OP)
        self.assertEqual(step.execution_output, "mock ok")


class ReviewNeverExecutesTests(unittest.TestCase):
    def test_review_does_not_execute_and_shows_review_id(self):
        body = json.dumps(gateway_body("REVIEW", action="EXECUTE", resource=EXEC_OP.resource,
                                       review_id=REVIEW_ID)).encode()
        executors = executors_for(EXEC_OP)

        step = run_operation(client_with(opener_returning(body)), "ci-test-session", EXEC_OP, executors)

        self.assertEqual(step.outcome, Outcome.WAITING_FOR_REVIEW)
        executors[EXEC_OP.name].assert_not_called()
        self.assertIn(REVIEW_ID, step.message)
        self.assertIn("not executed", step.message.lower())


class DenyNeverExecutesTests(unittest.TestCase):
    def test_deny_does_not_execute(self):
        body = json.dumps(gateway_body("DENY", authorization="AUTHORIZED")).encode()
        executors = executors_for(READ_OP)

        step = run_operation(client_with(opener_returning(body)), "ci-test-session", READ_OP, executors)

        self.assertEqual(step.outcome, Outcome.BLOCKED)
        executors[READ_OP.name].assert_not_called()
        self.assertIn("test reason", step.message)

    def test_http_200_with_deny_body_is_not_treated_as_allow(self):
        body = json.dumps(gateway_body("DENY", authorization="UNAUTHORIZED")).encode()
        executors = executors_for(READ_OP)

        step = run_operation(client_with(opener_returning(body, status=200)), "s", READ_OP, executors)

        self.assertNotEqual(step.outcome, Outcome.EXECUTED)
        executors[READ_OP.name].assert_not_called()


class GatewayFailureNeverExecutesTests(unittest.TestCase):
    def assert_fail_closed(self, opener):
        executors = executors_for(READ_OP)
        step = run_operation(client_with(opener), "s", READ_OP, executors)
        self.assertEqual(step.outcome, Outcome.FAILED_CLOSED)
        executors[READ_OP.name].assert_not_called()
        return step

    def test_gateway_unavailable_never_executes(self):
        self.assert_fail_closed(opener_raising(urllib.error.URLError(ConnectionRefusedError())))

    def test_connection_reset_never_executes(self):
        self.assert_fail_closed(opener_raising(ConnectionResetError()))

    def test_timeout_never_executes(self):
        step = self.assert_fail_closed(opener_raising(socket.timeout("timed out")))
        self.assertIn("timed out", step.message)

    def test_wrapped_timeout_never_executes(self):
        self.assert_fail_closed(opener_raising(urllib.error.URLError(socket.timeout("timed out"))))

    def test_http_500_never_executes(self):
        error = urllib.error.HTTPError("http://gateway.test", 500, "Internal", {}, io.BytesIO(b""))
        self.assert_fail_closed(opener_raising(error))

    def test_http_401_never_executes(self):
        error = urllib.error.HTTPError("http://gateway.test", 401, "Unauthorized", {}, io.BytesIO(b""))
        step = self.assert_fail_closed(opener_raising(error))
        self.assertIn("401", step.message)


class MalformedResponseNeverExecutesTests(unittest.TestCase):
    def assert_not_executed(self, body: bytes, status: int = 200):
        executors = executors_for(READ_OP)
        step = run_operation(client_with(opener_returning(body, status)), "s", READ_OP, executors)
        self.assertEqual(step.outcome, Outcome.FAILED_CLOSED)
        executors[READ_OP.name].assert_not_called()

    def test_non_json_body(self):
        self.assert_not_executed(b"<html>not json</html>")

    def test_json_array_instead_of_object(self):
        self.assert_not_executed(b"[]")

    def test_missing_decision(self):
        body = gateway_body("ALLOW")
        del body["decision"]
        self.assert_not_executed(json.dumps(body).encode())

    def test_unknown_decision_value(self):
        self.assert_not_executed(json.dumps(gateway_body("PERMIT")).encode())

    def test_lowercase_decision_is_not_accepted(self):
        self.assert_not_executed(json.dumps(gateway_body("allow")).encode())

    def test_action_mismatch_is_not_accepted(self):
        body = gateway_body("ALLOW", action="WRITE")
        self.assert_not_executed(json.dumps(body).encode())

    def test_resource_mismatch_is_not_accepted(self):
        body = gateway_body("ALLOW", resource="something/else")
        self.assert_not_executed(json.dumps(body).encode())

    def test_allow_without_authorized_result_is_contradictory(self):
        body = gateway_body("ALLOW", authorization="UNAUTHORIZED")
        self.assert_not_executed(json.dumps(body).encode())

    def test_missing_request_id(self):
        body = gateway_body("ALLOW")
        del body["requestId"]
        self.assert_not_executed(json.dumps(body).encode())

    def test_boolean_risk_score_is_rejected(self):
        body = gateway_body("ALLOW")
        body["riskScore"] = True
        self.assert_not_executed(json.dumps(body).encode())

    def test_empty_body(self):
        self.assert_not_executed(b"")


class PipelineHaltTests(unittest.TestCase):
    def test_pipeline_halts_at_first_review_and_later_steps_are_not_evaluated(self):
        allow_body = json.dumps(gateway_body("ALLOW")).encode()
        review_body = json.dumps(gateway_body("REVIEW", review_id=REVIEW_ID, action="EXECUTE",
                                              resource=EXEC_OP.resource)).encode()
        responses = iter([allow_body, review_body, allow_body])
        calls = []

        def opener(request, timeout):
            calls.append(json.loads(request.data.decode()))
            return FakeResponse(200, next(responses))

        third = Operation("github.list_builds", "github", "READ", "agentshield/repo/build-info", "third")
        executors = executors_for(READ_OP, EXEC_OP, third)

        result = run_pipeline(client_with(opener), "unit-pipeline", [READ_OP, EXEC_OP, third], executors)

        self.assertEqual(len(calls), 2, "the third operation must not be sent to the gateway")
        self.assertEqual(result.halted_at, 2)
        self.assertFalse(result.completed)
        executors[READ_OP.name].assert_called_once()
        executors[EXEC_OP.name].assert_not_called()
        executors[third.name].assert_not_called()

    def test_session_id_is_shared_by_all_steps_in_a_run(self):
        allow_body = json.dumps(gateway_body("ALLOW")).encode()
        sessions = []

        def opener(request, timeout):
            sessions.append(json.loads(request.data.decode())["sessionId"])
            return FakeResponse(200, allow_body)

        executors = executors_for(READ_OP, READ_OP)
        result = run_pipeline(client_with(opener), "unit-pipeline", [READ_OP, READ_OP], executors)

        self.assertTrue(result.completed)
        self.assertEqual(len(set(sessions)), 1)
        self.assertEqual(sessions[0], result.session_id)
        self.assertTrue(result.session_id.startswith("ci-unit-pipeline-"))
        self.assertLessEqual(len(result.session_id), 64)


if __name__ == "__main__":
    unittest.main()
