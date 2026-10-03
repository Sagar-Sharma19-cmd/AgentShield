"""
AgentShield Risk Engine
=======================
A FastAPI service that receives an agent action context and returns a
deterministic, explainable risk assessment.

Status: Phase 1 — deterministic, rule-based scoring only.
Not yet integrated with the Spring Boot gateway. ML-based and
trajectory/behavioral risk analysis are future phases; see docs/risk-engine.md.

This service is a RISK SIGNAL. It does not authorize or deny actions and
must never be treated as an authorization or permission engine.
"""

from fastapi import FastAPI

from scoring import RiskAssessmentRequest, RiskAssessmentResponse, assess_risk

app = FastAPI(
    title="AgentShield Risk Engine",
    description="Computes a deterministic, explainable risk assessment for AI agent tool requests.",
    version="0.2.0",
)


@app.get("/health")
def health():
    """Health check endpoint."""
    return {"status": "ok", "service": "agentshield-risk-engine"}


@app.post("/score", response_model=RiskAssessmentResponse)
def score(request: RiskAssessmentRequest) -> RiskAssessmentResponse:
    """
    Compute a deterministic risk assessment for an agent action.

    Returns a risk_score (0-100, capped), a risk_tier classification, the
    individual contributing factors, and a human-readable reason.
    """
    return assess_risk(request)
