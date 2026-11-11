"""AgentShield Python SDK: the gateway client shared by the simulator and agentshield-guard (stdlib only)."""

from .client import (  # noqa: F401
    DEFAULT_TIMEOUT_SECONDS,
    ENV_AGENT_API_KEY,
    ENV_AGENT_ID,
    ENV_GATEWAY_URL,
    AgentShieldClient,
    ConfigError,
    Evaluation,
    GatewayConfig,
    GatewayError,
    GatewayRejected,
    GatewayUnavailable,
    MalformedResponse,
    Redemption,
    ReviewClaim,
    ReviewStatus,
    load_config,
    parse_claim,
    parse_evaluation,
    parse_redemption,
    parse_review,
)

__version__ = "0.1.0"
