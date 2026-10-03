"""
AgentShield Risk Engine — Deterministic Scoring Core
=====================================================
Phase 1: a deterministic, explainable, rule-based risk assessment.

This module contains no FastAPI, network, or database dependencies so it can
be unit-tested in complete isolation from the HTTP layer.

The Risk Engine is a RISK SIGNAL only. It does not authorize or deny
anything — it does not grant permissions and must never override an
authentication or permission decision made elsewhere in AgentShield.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field, field_validator


# ---------------------------------------------------------------------------
# Domain enums
# ---------------------------------------------------------------------------
# Kept consistent with the Java domain model:
#   backend/src/main/java/com/agentshield/model/ActionType.java
#   backend/src/main/java/com/agentshield/model/ResourceSensitivity.java

class ActionType(str, Enum):
    READ = "READ"
    WRITE = "WRITE"
    DELETE = "DELETE"
    EXECUTE = "EXECUTE"
    EXTERNAL_REQUEST = "EXTERNAL_REQUEST"


class ResourceSensitivity(str, Enum):
    PUBLIC = "PUBLIC"
    INTERNAL = "INTERNAL"
    SENSITIVE = "SENSITIVE"
    CRITICAL = "CRITICAL"


class RiskTier(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


# ---------------------------------------------------------------------------
# Risk factor weights (Phase 1 — deterministic, substring/rule based)
# ---------------------------------------------------------------------------

SENSITIVE_RESOURCE_PATTERNS: tuple[str, ...] = (
    ".env",
    "secret",
    "secrets",
    "credential",
    "credentials",
    "password",
    ".pem",
    ".key",
)
RESOURCE_SENSITIVITY_WEIGHT = 50

PRODUCTION_ADMIN_PATTERNS: tuple[str, ...] = (
    "prod",
    "production",
    "admin",
    "protected",
)
PRODUCTION_ADMIN_WEIGHT = 40

ACTION_BASE_RISK: dict[ActionType, int] = {
    ActionType.READ: 5,
    ActionType.WRITE: 10,
    ActionType.DELETE: 30,
    ActionType.EXECUTE: 30,
    ActionType.EXTERNAL_REQUEST: 25,
}

COMPOUNDING_WEIGHT = 20
COMPOUNDING_ACTIONS: tuple[ActionType, ...] = (ActionType.DELETE, ActionType.EXECUTE)

MAX_RISK_SCORE = 100

RISK_TIER_THRESHOLDS: tuple[tuple[int, RiskTier], ...] = (
    (29, RiskTier.LOW),
    (59, RiskTier.MEDIUM),
    (79, RiskTier.HIGH),
    (MAX_RISK_SCORE, RiskTier.CRITICAL),
)


# ---------------------------------------------------------------------------
# Input / output models
# ---------------------------------------------------------------------------

class RiskAssessmentRequest(BaseModel):
    """Minimum input required to produce a risk assessment."""

    action: ActionType
    resource: str = Field(min_length=1)

    # Accepted for API-vocabulary consistency with AgentShield's Java domain
    # model (ResourceSensitivity enum) and as a reserved extension point.
    # Intentionally NOT an independent scoring input in Phase 1, and NOT
    # double-counted: Factor A ("RESOURCE_SENSITIVITY") derives sensitivity
    # exclusively from the `resource` string. No current caller supplies this
    # field — Java's ResourceSensitivity is always a value PolicyEngine
    # derives internally, never an input it receives, and the documented
    # future Risk Engine integration contract (docs/product-requirements.md,
    # Part 6) does not include it either. Reconciling a caller-supplied
    # classification with Factor A, if ever justified, is future work.
    resource_sensitivity: ResourceSensitivity | None = None

    @field_validator("resource")
    @classmethod
    def _resource_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("resource must not be blank")
        return value


class RiskFactor(BaseModel):
    name: str
    score: int
    reason: str


class RiskAssessmentResponse(BaseModel):
    risk_score: int
    risk_tier: RiskTier
    factors: list[RiskFactor]
    reason: str


# ---------------------------------------------------------------------------
# Pattern matching helpers
# ---------------------------------------------------------------------------

def _matches_any_pattern(resource: str, patterns: tuple[str, ...]) -> bool:
    """Case-insensitive substring match against a fixed pattern list."""
    resource_lower = resource.lower()
    return any(pattern in resource_lower for pattern in patterns)


# ---------------------------------------------------------------------------
# Individual risk factors (Phase 1 — exactly four, per design)
# ---------------------------------------------------------------------------

def _resource_sensitivity_factor(resource: str) -> RiskFactor | None:
    """Factor A — sensitive resource pattern (.env, secret, credential, ...)."""
    if _matches_any_pattern(resource, SENSITIVE_RESOURCE_PATTERNS):
        return RiskFactor(
            name="RESOURCE_SENSITIVITY",
            score=RESOURCE_SENSITIVITY_WEIGHT,
            reason="Resource matches a sensitive-resource pattern "
                   "(e.g. secret, credential, password, or key material).",
        )
    return None


def _production_admin_factor(resource: str) -> RiskFactor | None:
    """Factor B — production/admin elevated-impact context."""
    if _matches_any_pattern(resource, PRODUCTION_ADMIN_PATTERNS):
        return RiskFactor(
            name="PRODUCTION_ADMIN_CONTEXT",
            score=PRODUCTION_ADMIN_WEIGHT,
            reason="Resource matches a production/admin elevated-impact pattern.",
        )
    return None


def _action_base_risk_factor(action: ActionType) -> RiskFactor:
    """Factor C — base risk inherent to the action type itself."""
    score = ACTION_BASE_RISK[action]
    return RiskFactor(
        name="ACTION_BASE_RISK",
        score=score,
        reason=f"{action.value} action carries a base risk of {score}.",
    )


def _compounding_factor(action: ActionType, production_admin_triggered: bool) -> RiskFactor | None:
    """Factor D — destructive/executable actions against elevated-impact resources."""
    if action in COMPOUNDING_ACTIONS and production_admin_triggered:
        return RiskFactor(
            name="COMPOUNDING_RISK",
            score=COMPOUNDING_WEIGHT,
            reason=f"{action.value} action targets a production/admin context, "
                   "compounding its impact.",
        )
    return None


# ---------------------------------------------------------------------------
# Aggregation / classification
# ---------------------------------------------------------------------------

def classify_tier(risk_score: int) -> RiskTier:
    """Map a 0-100 risk score to its risk tier using fixed thresholds."""
    for upper_bound, tier in RISK_TIER_THRESHOLDS:
        if risk_score <= upper_bound:
            return tier
    return RiskTier.CRITICAL


def _build_reason(factors: list[RiskFactor], tier: RiskTier) -> str:
    """Deterministic, human-readable summary of the triggered factors."""
    elevated = [f for f in factors if f.name != "ACTION_BASE_RISK"]

    if not elevated:
        return f"{tier.value} risk based on routine action risk only."
    if len(elevated) == 1:
        return f"{tier.value} risk: {elevated[0].reason}"
    triggered_names = ", ".join(f.name for f in elevated)
    return f"{tier.value} risk: multiple risk factors were detected ({triggered_names})."


def assess_risk(request: RiskAssessmentRequest) -> RiskAssessmentResponse:
    """Compute a deterministic, explainable risk assessment for one action."""
    factors: list[RiskFactor] = []

    sensitivity_factor = _resource_sensitivity_factor(request.resource)
    if sensitivity_factor is not None:
        factors.append(sensitivity_factor)

    production_admin_factor = _production_admin_factor(request.resource)
    if production_admin_factor is not None:
        factors.append(production_admin_factor)

    factors.append(_action_base_risk_factor(request.action))

    compounding_factor = _compounding_factor(
        request.action, production_admin_triggered=production_admin_factor is not None
    )
    if compounding_factor is not None:
        factors.append(compounding_factor)

    raw_score = sum(factor.score for factor in factors)
    risk_score = min(raw_score, MAX_RISK_SCORE)
    risk_tier = classify_tier(risk_score)
    reason = _build_reason(factors, risk_tier)

    return RiskAssessmentResponse(
        risk_score=risk_score,
        risk_tier=risk_tier,
        factors=factors,
        reason=reason,
    )
