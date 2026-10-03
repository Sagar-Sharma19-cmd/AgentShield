"""
Risk Engine Scoring Tests — Phase 1
===================================
Unit tests for the deterministic scoring core in scoring.py.

All test resources/credentials below are synthetic placeholders used only
to exercise pattern matching; none are real secrets.
"""

import pytest
from pydantic import ValidationError

from scoring import (
    ActionType,
    ResourceSensitivity,
    RiskAssessmentRequest,
    RiskTier,
    assess_risk,
    classify_tier,
)


def _assess(action: str, resource: str):
    return assess_risk(RiskAssessmentRequest(action=action, resource=resource))


def _factor_names(result) -> set[str]:
    return {factor.name for factor in result.factors}


# ---------------------------------------------------------------------------
# Normal actions — no sensitive/production context
# ---------------------------------------------------------------------------

def test_read_ordinary_resource_is_low_risk():
    result = _assess("READ", "src/main/App.java")
    assert result.risk_tier == RiskTier.LOW
    assert result.risk_score == 5


def test_write_ordinary_resource_is_low_risk():
    result = _assess("WRITE", "src/main/App.java")
    assert result.risk_tier == RiskTier.LOW
    assert result.risk_score == 10


# ---------------------------------------------------------------------------
# Factor C — action base risk
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "action,expected_score",
    [
        ("READ", 5),
        ("WRITE", 10),
        ("DELETE", 30),
        ("EXECUTE", 30),
        ("EXTERNAL_REQUEST", 25),
    ],
)
def test_action_base_risk_scores(action, expected_score):
    result = _assess(action, "ordinary/resource.txt")
    assert result.risk_score == expected_score
    assert "ACTION_BASE_RISK" in _factor_names(result)


# ---------------------------------------------------------------------------
# Factor A — sensitive resource patterns
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "resource",
    [
        ".env",
        ".env.production",
        "secrets/api-key",
        "credentials.json",
        "database-password",
        "server.pem",
        "private.key",
    ],
)
def test_sensitive_resources_trigger_resource_sensitivity_factor(resource):
    result = _assess("READ", resource)
    assert "RESOURCE_SENSITIVITY" in _factor_names(result)


def test_ordinary_resource_does_not_trigger_resource_sensitivity_factor():
    result = _assess("READ", "src/main/App.java")
    assert "RESOURCE_SENSITIVITY" not in _factor_names(result)


def test_caller_supplied_resource_sensitivity_is_not_used_and_not_double_counted():
    """resource_sensitivity is accepted for API-vocabulary compatibility only;
    it must never add to or otherwise influence the score."""
    without_field = assess_risk(
        RiskAssessmentRequest(action=ActionType.READ, resource="src/main/App.java")
    )
    with_critical = assess_risk(
        RiskAssessmentRequest(
            action=ActionType.READ,
            resource="src/main/App.java",
            resource_sensitivity=ResourceSensitivity.CRITICAL,
        )
    )
    assert with_critical.risk_score == without_field.risk_score
    assert "RESOURCE_SENSITIVITY" not in _factor_names(with_critical)


# ---------------------------------------------------------------------------
# Factor B — production / admin context
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "resource",
    [
        "production/database",
        "prod/config",
        "admin/users",
        "protected/resource",
    ],
)
def test_production_admin_resources_trigger_factor(resource):
    result = _assess("READ", resource)
    assert "PRODUCTION_ADMIN_CONTEXT" in _factor_names(result)


def test_ordinary_resource_does_not_trigger_production_admin_factor():
    result = _assess("READ", "src/main/App.java")
    assert "PRODUCTION_ADMIN_CONTEXT" not in _factor_names(result)


# ---------------------------------------------------------------------------
# Factor D — compounding risk
# ---------------------------------------------------------------------------

def test_delete_on_production_resource_triggers_compounding():
    result = _assess("DELETE", "production/database")
    assert "COMPOUNDING_RISK" in _factor_names(result)


def test_execute_on_admin_resource_triggers_compounding():
    result = _assess("EXECUTE", "admin/users")
    assert "COMPOUNDING_RISK" in _factor_names(result)


def test_read_on_production_resource_does_not_trigger_compounding():
    result = _assess("READ", "production/database")
    assert "COMPOUNDING_RISK" not in _factor_names(result)


def test_write_on_admin_resource_does_not_trigger_compounding():
    result = _assess("WRITE", "admin/users")
    assert "COMPOUNDING_RISK" not in _factor_names(result)


# ---------------------------------------------------------------------------
# Score cap
# ---------------------------------------------------------------------------

def test_score_is_capped_at_100():
    # sensitivity(50) + production_admin(40) + DELETE base(30) + compounding(20) = 140
    result = _assess("DELETE", "secrets/admin/prod-credentials-password.pem")
    assert result.risk_score == 100
    assert result.risk_tier == RiskTier.CRITICAL


# ---------------------------------------------------------------------------
# Tier boundaries (synthetic, exercising classify_tier directly)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "score,expected_tier",
    [
        (0, RiskTier.LOW),
        (29, RiskTier.LOW),
        (30, RiskTier.MEDIUM),
        (59, RiskTier.MEDIUM),
        (60, RiskTier.HIGH),
        (79, RiskTier.HIGH),
        (80, RiskTier.CRITICAL),
        (100, RiskTier.CRITICAL),
    ],
)
def test_tier_boundaries(score, expected_tier):
    assert classify_tier(score) == expected_tier


# ---------------------------------------------------------------------------
# Invalid actions
# ---------------------------------------------------------------------------

def test_invalid_action_fails_validation():
    with pytest.raises(ValidationError):
        RiskAssessmentRequest(action="FOO", resource="some/resource")


def test_blank_resource_fails_validation():
    with pytest.raises(ValidationError):
        RiskAssessmentRequest(action=ActionType.READ, resource="   ")


# ---------------------------------------------------------------------------
# Determinism
# ---------------------------------------------------------------------------

def test_same_input_produces_identical_output():
    request = RiskAssessmentRequest(action=ActionType.DELETE, resource="production/database")
    first = assess_risk(request)
    second = assess_risk(request)
    assert first.model_dump() == second.model_dump()


# ---------------------------------------------------------------------------
# Explainability
# ---------------------------------------------------------------------------

def test_response_exposes_triggered_factors_with_reasons():
    result = _assess("DELETE", "production/database")
    assert len(result.factors) >= 3
    for factor in result.factors:
        assert factor.name
        assert factor.reason
        assert isinstance(factor.score, int)
    assert result.reason
