"""
Minimal AgentShield gateway client (Python standard library only).

Talks to POST /api/v1/gateway/evaluate using the exact request/response contract defined by
backend/.../dto/EvaluationRequest.java and backend/.../dto/EvaluationResponse.java, and to the
agent's own review endpoints (Phase B3): GET /api/v1/gateway/reviews/{id} (AgentReviewResponse) and
POST /api/v1/gateway/reviews/{id}/claim (ReviewClaimResponse).

Fail-closed rules:
- Any transport failure (connection refused, timeout) raises GatewayUnavailable.
- Any non-2xx HTTP status raises GatewayRejected.
- Any body that is not a JSON object with a known decision, a matching echo of the request,
  and a consistent authorization result raises MalformedResponse.
- HTTP 200 alone is never treated as permission. Callers must read Evaluation.decision.

API keys are read once from the environment, never printed, and never included in exception
messages.
"""

from __future__ import annotations

import http.client
import json
import os
import re
import socket
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Callable, Dict, Mapping, Optional

GATEWAY_PATH = "/api/v1/gateway/evaluate"
REVIEWS_PATH = "/api/v1/gateway/reviews"
DEFAULT_TIMEOUT_SECONDS = 10.0

ENV_GATEWAY_URL = "AGENTSHIELD_GATEWAY_URL"
ENV_AGENT_ID = "AGENTSHIELD_AGENT_ID"
ENV_AGENT_API_KEY = "AGENTSHIELD_AGENT_API_KEY"

VALID_DECISIONS = frozenset({"ALLOW", "REVIEW", "DENY"})
VALID_ACTIONS = frozenset({"READ", "WRITE", "DELETE", "EXECUTE", "EXTERNAL_REQUEST"})
VALID_REVIEW_STATUSES = frozenset({"PENDING", "IN_REVIEW", "APPROVED", "REJECTED"})

_UUID_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
# Server error messages are shown to the operator; keep them short.
_MAX_DETAIL = 300


class GatewayError(Exception):
    """Base class. Every subclass means the operation must NOT execute."""


class ConfigError(GatewayError):
    """Required configuration is missing or invalid."""


class GatewayUnavailable(GatewayError):
    """The gateway could not be reached, or the request timed out."""


class GatewayRejected(GatewayError):
    """The gateway answered with a non-2xx HTTP status (for example 401, or 409 for a claim)."""

    def __init__(self, status: int, detail: Optional[str] = None):
        message = f"gateway returned HTTP {status}"
        super().__init__(f"{message}: {detail}" if detail else message)
        self.status = status
        # The backend's ErrorResponse.message, if any. It never contains the API key.
        self.detail = detail


class MalformedResponse(GatewayError):
    """The gateway answered 2xx, but the body cannot be trusted as a decision."""


@dataclass(frozen=True)
class GatewayConfig:
    gateway_url: str
    agent_id: str
    api_key: str

    def __repr__(self) -> str:  # never reveal the key, even in debugging output
        return f"GatewayConfig(gateway_url={self.gateway_url!r}, agent_id={self.agent_id!r}, api_key=<hidden>)"


@dataclass(frozen=True)
class Evaluation:
    """Parsed, validated EvaluationResponse."""

    request_id: str
    decision: str
    reason: str
    risk_score: int
    authorization_result: str
    risk_tier: Optional[str]
    review_request_id: Optional[str]


@dataclass(frozen=True)
class ReviewStatus:
    """Parsed AgentReviewResponse: the agent's view of its own review request."""

    review_id: str
    request_id: str
    status: str
    reviewer: Optional[str]
    note: Optional[str]
    expires_at: Optional[str]
    expired: bool
    consumed: bool
    tool: str
    action: str
    resource: str


@dataclass(frozen=True)
class ReviewClaim:
    """Parsed ReviewClaimResponse: the one operation the approval allows, exactly as approved."""

    review_id: str
    request_id: str
    tool: str
    action: str
    resource: str
    reviewer: Optional[str]


def load_config(environ: Mapping[str, str] = os.environ) -> GatewayConfig:
    """Reads configuration from environment variables. Error messages name variables, never values."""
    missing = [name for name in (ENV_GATEWAY_URL, ENV_AGENT_ID, ENV_AGENT_API_KEY) if not environ.get(name)]
    if missing:
        raise ConfigError("missing required environment variable(s): " + ", ".join(missing))

    gateway_url = environ[ENV_GATEWAY_URL].strip().rstrip("/")
    if not (gateway_url.startswith("http://") or gateway_url.startswith("https://")):
        raise ConfigError(f"{ENV_GATEWAY_URL} must start with http:// or https://")

    return GatewayConfig(
        gateway_url=gateway_url,
        agent_id=environ[ENV_AGENT_ID].strip(),
        api_key=environ[ENV_AGENT_API_KEY].strip(),
    )


# Opener signature: (request, timeout) -> response object with .status and .read().
Opener = Callable[[urllib.request.Request, float], Any]


def _default_opener(request: urllib.request.Request, timeout: float) -> Any:
    return urllib.request.urlopen(request, timeout=timeout)


class AgentShieldClient:
    def __init__(self, config: GatewayConfig, timeout: float = DEFAULT_TIMEOUT_SECONDS,
                 opener: Optional[Opener] = None):
        self._config = config
        self._timeout = timeout
        self._opener = opener or _default_opener

    @property
    def agent_id(self) -> str:
        return self._config.agent_id

    def evaluate(self, *, session_id: str, action: str, resource: str, tool: str) -> Evaluation:
        """Sends one evaluation request. Raises a GatewayError subclass on any failure."""
        payload = {
            "agentId": self._config.agent_id,
            "sessionId": session_id,
            "action": action,
            "resource": resource,
            "tool": tool,
        }
        status, raw = self._send("POST", GATEWAY_PATH, payload)
        return parse_evaluation(raw, expected_action=action, expected_resource=resource)

    def get_review(self, review_id: str) -> ReviewStatus:
        """Reads this agent's own review request. Another agent's review is a 404 (GatewayRejected)."""
        status, raw = self._send("GET", f"{REVIEWS_PATH}/{_require_uuid(review_id)}", None)
        return parse_review(raw, expected_review_id=review_id)

    def claim_review(self, review_id: str) -> ReviewClaim:
        """
        Claims an APPROVED review once. Returns the approved tool/action/resource. The gateway answers
        409 (GatewayRejected) when it is not approved, has expired or was already claimed.
        """
        status, raw = self._send("POST", f"{REVIEWS_PATH}/{_require_uuid(review_id)}/claim", None)
        return parse_claim(raw, expected_review_id=review_id)

    def _send(self, method: str, path: str, payload: Optional[dict]) -> tuple:
        """
        One authenticated request. Returns (status, body bytes) for a 2xx answer and raises a
        GatewayError subclass otherwise. The key is sent only in the X-Agent-API-Key header.
        """
        body = json.dumps(payload).encode("utf-8") if payload is not None else None
        headers = {"Accept": "application/json", "X-Agent-API-Key": self._config.api_key}
        if body is not None:
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(self._config.gateway_url + path, data=body, method=method, headers=headers)

        try:
            with self._opener(request, self._timeout) as response:
                status = getattr(response, "status", 200)
                raw = response.read()
        except urllib.error.HTTPError as error:
            # HTTPError is a subclass of URLError, so it must be caught first.
            status_code = error.code
            detail = _error_detail(error)
            error.close()
            raise GatewayRejected(status_code, detail) from None
        except (socket.timeout, TimeoutError):
            raise GatewayUnavailable("request to the gateway timed out") from None
        except urllib.error.URLError as error:
            if isinstance(error.reason, (socket.timeout, TimeoutError)):
                raise GatewayUnavailable("request to the gateway timed out") from None
            raise GatewayUnavailable("could not connect to the gateway") from None
        except (http.client.HTTPException, OSError):
            raise GatewayUnavailable("connection to the gateway failed") from None

        if not (200 <= int(status) < 300):
            raise GatewayRejected(int(status))
        return int(status), raw


def _require_uuid(value: str) -> str:
    """Review ids go into the URL path, so only a canonical UUID is accepted."""
    if not isinstance(value, str) or not _UUID_RE.match(value):
        raise MalformedResponse("review id is not a UUID")
    return value


def _error_detail(error: urllib.error.HTTPError) -> Optional[str]:
    """The backend's ErrorResponse.message, if the error body has one."""
    try:
        data = json.loads(error.read().decode("utf-8"))
    except Exception:  # any unreadable body: no detail
        return None
    message = data.get("message") if isinstance(data, dict) else None
    if not isinstance(message, str) or not message:
        return None
    return message[:_MAX_DETAIL]


def _load_object(raw: bytes, what: str) -> dict:
    try:
        data = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        raise MalformedResponse(f"{what} is not valid JSON") from None
    if not isinstance(data, dict):
        raise MalformedResponse(f"{what} is not a JSON object")
    return data


def _required_str(data: dict, key: str, what: str) -> str:
    value = data.get(key)
    if not isinstance(value, str) or not value:
        raise MalformedResponse(f"{what} has no {key}")
    return value


def _optional_str(data: dict, key: str) -> Optional[str]:
    value = data.get(key)
    return value if isinstance(value, str) and value else None


def parse_review(raw: bytes, *, expected_review_id: str) -> ReviewStatus:
    """Validates an AgentReviewResponse. Raises MalformedResponse on anything unexpected."""
    what = "review response"
    data = _load_object(raw, what)
    if data.get("id") != expected_review_id:
        raise MalformedResponse("review response is for a different review")
    status = data.get("status")
    if status not in VALID_REVIEW_STATUSES:
        raise MalformedResponse("review response has no recognised status")
    action = _required_str(data, "action", what)
    if action not in VALID_ACTIONS:
        raise MalformedResponse("review response has no recognised action")
    for flag in ("expired", "consumed"):
        if not isinstance(data.get(flag), bool):
            raise MalformedResponse(f"review response has no boolean {flag}")
    return ReviewStatus(
        review_id=expected_review_id,
        request_id=_required_str(data, "requestId", what),
        status=status,
        reviewer=_optional_str(data, "reviewer"),
        note=_optional_str(data, "note"),
        expires_at=_optional_str(data, "expiresAt"),
        expired=data["expired"],
        consumed=data["consumed"],
        tool=_required_str(data, "tool", what),
        action=action,
        resource=_required_str(data, "resource", what),
    )


def parse_claim(raw: bytes, *, expected_review_id: str) -> ReviewClaim:
    """Validates a ReviewClaimResponse. Raises MalformedResponse on anything unexpected."""
    what = "claim response"
    data = _load_object(raw, what)
    if data.get("reviewId") != expected_review_id:
        raise MalformedResponse("claim response is for a different review")
    action = _required_str(data, "action", what)
    if action not in VALID_ACTIONS:
        raise MalformedResponse("claim response has no recognised action")
    return ReviewClaim(
        review_id=expected_review_id,
        request_id=_required_str(data, "requestId", what),
        tool=_required_str(data, "tool", what),
        action=action,
        resource=_required_str(data, "resource", what),
        reviewer=_optional_str(data, "reviewer"),
    )


def parse_evaluation(raw: bytes, *, expected_action: str, expected_resource: str) -> Evaluation:
    """Validates an EvaluationResponse body. Raises MalformedResponse on anything unexpected."""
    try:
        data = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        raise MalformedResponse("gateway response is not valid JSON") from None

    if not isinstance(data, dict):
        raise MalformedResponse("gateway response is not a JSON object")

    decision = data.get("decision")
    if decision not in VALID_DECISIONS:
        raise MalformedResponse("gateway response has no recognised decision")

    if data.get("action") != expected_action or data.get("resource") != expected_resource:
        raise MalformedResponse("gateway response does not echo the submitted action and resource")

    request_id = data.get("requestId")
    if not isinstance(request_id, str) or not request_id:
        raise MalformedResponse("gateway response has no requestId")

    reason = data.get("reason")
    if not isinstance(reason, str):
        raise MalformedResponse("gateway response has no reason")

    risk_score = data.get("riskScore")
    if not isinstance(risk_score, int) or isinstance(risk_score, bool):
        raise MalformedResponse("gateway response has no integer riskScore")

    authorization_result = data.get("authorizationResult")
    if not isinstance(authorization_result, str) or not authorization_result:
        raise MalformedResponse("gateway response has no authorizationResult")

    # An ALLOW must be backed by an AUTHORIZED result. Anything else is contradictory: fail closed.
    if decision == "ALLOW" and authorization_result != "AUTHORIZED":
        raise MalformedResponse("gateway response is contradictory: ALLOW without AUTHORIZED")

    risk_tier = data.get("riskTier")
    review_request_id = data.get("reviewRequestId")
    return Evaluation(
        request_id=request_id,
        decision=decision,
        reason=reason,
        risk_score=risk_score,
        authorization_result=authorization_result,
        risk_tier=risk_tier if isinstance(risk_tier, str) else None,
        review_request_id=review_request_id if isinstance(review_request_id, str) else None,
    )
