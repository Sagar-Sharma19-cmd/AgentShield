"""
Risk Engine API Tests — Phase 1
================================
HTTP-level tests for the FastAPI /score and /health endpoints.

Detailed scoring behavior is covered by test_scoring.py; these tests only
verify that the HTTP layer wires requests/responses to the scoring core
correctly.
"""

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_health():
    """The /health endpoint should return 200 with status ok."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_score_ordinary_read_is_low_risk():
    payload = {"action": "READ", "resource": "src/main/App.java"}
    response = client.post("/score", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["risk_score"] == 5
    assert data["risk_tier"] == "LOW"
    assert isinstance(data["factors"], list)
    assert "reason" in data


def test_score_sensitive_production_delete_is_critical():
    payload = {"action": "DELETE", "resource": "production/credentials.json"}
    response = client.post("/score", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["risk_tier"] in ("HIGH", "CRITICAL")
    factor_names = {factor["name"] for factor in data["factors"]}
    assert "RESOURCE_SENSITIVITY" in factor_names
    assert "PRODUCTION_ADMIN_CONTEXT" in factor_names
    assert "COMPOUNDING_RISK" in factor_names


def test_score_rejects_invalid_action():
    payload = {"action": "FOO", "resource": "some/resource"}
    response = client.post("/score", json=payload)
    assert response.status_code == 422


def test_score_rejects_missing_resource():
    payload = {"action": "READ"}
    response = client.post("/score", json=payload)
    assert response.status_code == 422
