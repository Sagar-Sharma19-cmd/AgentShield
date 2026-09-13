"""
Risk Engine Tests
=================
Status: Placeholder — unit tests will be added in Phase 3
alongside scoring logic implementation.
"""

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_health():
    """The /health endpoint should return 200 with status ok."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_score_stub():
    """The /score endpoint should return a valid ScoreResponse (stub values)."""
    payload = {
        "agentId": "test-agent",
        "action": "READ",
        "resource": "repository",
        "metadata": {}
    }
    response = client.post("/score", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "riskScore" in data
    assert "factors" in data
    assert isinstance(data["riskScore"], int)
