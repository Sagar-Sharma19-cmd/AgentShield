"""
Phase V13 in the simulator: operations can carry arguments; they are sent on evaluate and again, unchanged, on
redeem. The two new scenarios are wired to mock executors and fail closed on the decisions they expect.
"""

from __future__ import annotations

import json
import unittest
from unittest.mock import MagicMock

from enforcement import Operation, Outcome, run_operation
from mock_tools import MockDevOps
from scenarios import SCENARIOS
from tests.test_enforcement import REDEEM_PATH, client_with, gateway_body, redeem_body, FakeResponse


def recording_opener(decision, *, action, resource, extra=None):
    sent = []

    def opener(request, timeout):
        payload = json.loads(request.data.decode()) if request.data else None
        sent.append((request.full_url, payload))
        if request.full_url.endswith(REDEEM_PATH):
            return FakeResponse(200, json.dumps(redeem_body()).encode())
        body = gateway_body(decision, action=action, resource=resource,
                            review_id="66666666-7777-8888-9999-000000000000" if decision == "REVIEW" else None)
        body.update(extra or {})
        return FakeResponse(200, json.dumps(body).encode())
    return opener, sent


class InspectionScenarioTests(unittest.TestCase):
    def test_new_scenarios_exist_and_every_operation_has_an_executor(self):
        executors = MockDevOps.in_temporary_directory().executors()
        for name in ("secret_exfiltration", "pii_export"):
            self.assertIn(name, SCENARIOS)
            for op in SCENARIOS[name].operations:
                self.assertIn(op.name, executors)
                self.assertIsNotNone(op.arguments, "these scenarios exist to send arguments")

    def test_secret_exfiltration_is_blocked_and_never_executed(self):
        op = SCENARIOS["secret_exfiltration"].operations[0]
        opener, sent = recording_opener("DENY", action=op.action, resource=op.resource, extra={
            "reason": "Arguments contain an AWS access key at arguments[5]. Secrets must not be sent to tools.",
            "inspectionVerdict": "DENY",
            "inspectionFindings": [{"category": "SECRET", "type": "AWS_ACCESS_KEY", "location": "arguments[5]",
                                    "preview": "AKIA… (20 chars)"}]})
        executors = {op.name: MagicMock()}
        step = run_operation(client_with(opener), "s", op, executors)
        self.assertEqual(step.outcome, Outcome.BLOCKED)
        executors[op.name].assert_not_called()
        self.assertEqual(sent[0][1]["arguments"], op.arguments)
        self.assertEqual(step.evaluation.inspection_findings[0].type, "AWS_ACCESS_KEY")

    def test_pii_export_waits_for_review(self):
        op = SCENARIOS["pii_export"].operations[0]
        opener, sent = recording_opener("REVIEW", action=op.action, resource=op.resource,
                                        extra={"inspectionVerdict": "REVIEW"})
        executors = {op.name: MagicMock()}
        step = run_operation(client_with(opener), "s", op, executors)
        self.assertEqual(step.outcome, Outcome.WAITING_FOR_REVIEW)
        executors[op.name].assert_not_called()
        self.assertEqual(sent[0][1]["arguments"], op.arguments)

    def test_allow_redeems_with_the_same_arguments(self):
        op = Operation("docker.build_image", "docker", "WRITE", "docker/app:1", "build",
                       arguments=["docker", "build", "-t", "app:1", "."])
        opener, sent = recording_opener("ALLOW", action=op.action, resource=op.resource,
                                        extra={"inspectionVerdict": "CLEAN", "inspectionFindings": []})
        step = run_operation(client_with(opener), "s", op, {op.name: MagicMock(return_value="ok")})
        self.assertEqual(step.outcome, Outcome.EXECUTED)
        self.assertTrue(sent[1][0].endswith(REDEEM_PATH))
        self.assertEqual(sent[1][1]["arguments"], op.arguments)

    def test_operations_without_arguments_send_none(self):
        op = SCENARIOS["basic_read_write"].operations[0]
        opener, sent = recording_opener("ALLOW", action=op.action, resource=op.resource)
        run_operation(client_with(opener), "s", op, {op.name: MagicMock(return_value="ok")})
        self.assertNotIn("arguments", sent[0][1])
        self.assertNotIn("arguments", sent[1][1])


if __name__ == "__main__":
    unittest.main()
