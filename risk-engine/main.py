"""
AgentShield Risk Engine
=======================
A FastAPI service that receives an agent action request and returns a risk score.

Status: Skeleton — implementation planned for Phase 3.
"""

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(
    title="AgentShield Risk Engine",
    description="Computes a risk score for AI agent tool requests.",
    version="0.1.0",
)


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class ScoreRequest(BaseModel):
    agentId: str
    action: str
    resource: str
    metadata: dict = {}


class ScoreResponse(BaseModel):
    riskScore: int
    factors: list[str]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    """Health check endpoint."""
    return {"status": "ok", "service": "agentshield-risk-engine"}


@app.post("/score", response_model=ScoreResponse)
def score(request: ScoreRequest) -> ScoreResponse:
    """
    Compute a risk score for an agent action request.

    Returns a score between 0 (low risk) and 100 (critical risk).

    NOTE: This is a stub implementation that returns a fixed score.
          Real scoring logic will be added in Phase 3.
    """
    # Stub: return a placeholder score
    return ScoreResponse(
        riskScore=0,
        factors=["stub — scoring not yet implemented"],
    )
