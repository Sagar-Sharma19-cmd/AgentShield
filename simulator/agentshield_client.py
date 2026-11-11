"""
Compatibility shim. The gateway client now lives in the shared SDK, sdk/python/agentshield/client.py, which
the agentshield-guard CLI uses too. The simulator keeps importing `agentshield_client`, so its code and tests
are unchanged; this module puts the repository's SDK on the path (unless an installed copy is importable)
and re-exports it.
"""

import os
import sys

_SDK = os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir, "sdk", "python")
try:  # an installed SDK (pip install -e sdk/python) wins
    import agentshield.client  # noqa: F401
except ImportError:
    sys.path.insert(0, os.path.normpath(_SDK))

from agentshield.client import *  # noqa: E402,F401,F403
from agentshield.client import (  # noqa: E402,F401  explicit, for readers and linters
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
)
