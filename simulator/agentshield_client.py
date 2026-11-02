"""
Minimal AgentShield gateway client (Python standard library only).

Talks to POST /api/v1/gateway/evaluate using the exact request/response contract defined by
backend/.../dto/EvaluationRequest.java and backend/.../dto/EvaluationResponse.java.

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
import socket
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Callable, Dict, Mapping, Optional

GATEWAY_PATH = "/api/v1/gateway/evaluate"
DEFAULT_TIMEOUT_SECONDS = 10.0

ENV_GATEWAY_URL = "AGENTSHIELD_GATEWAY_URL"
ENV_AGENT_ID = "AGENTSHIELD_AGENT_ID"
ENV_AGENT_API_KEY = "AGENTSHIELD_AGENT_API_KEY"

VALID_DECISIONS = frozenset({"ALLOW", "REVIEW", "DENY"})
VALID_ACTIONS = frozenset({"READ", "WRITE", "DELETE", "EXECUTE", "EXTERNAL_REQUEST"})


class GatewayError(Exception):
    """Base class. Every subclass means the operation must NOT execute."""


class ConfigError(GatewayError):
    """Required configuration is missing or invalid."""


class GatewayUnavailable(GatewayError):
    """The gateway could not be reached, or the request timed out."""


class GatewayRejected(GatewayError):
    """The gateway answered with a non-2xx HTTP status (for example 401)."""

    def __init__(self, status: int):
        super().__init__(f"gateway returned HTTP {status}")
        self.status = status


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
        body = json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            self._config.gateway_url + GATEWAY_PATH,
            data=body,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
                "X-Agent-API-Key": self._config.api_key,
            },
        )

        try:
            with self._opener(request, self._timeout) as response:
                status = getattr(response, "status", 200)
                raw = response.read()
        except urllib.error.HTTPError as error:
            # HTTPError is a subclass of URLError, so it must be caught first.
            status_code = error.code
            error.close()
            raise GatewayRejected(status_code) from None
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

        return parse_evaluation(raw, expected_action=action, expected_resource=resource)


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
