"""Loads the shared AgentShield SDK (sdk/python), installed or from this repository checkout."""

from __future__ import annotations

import os
import sys


def import_sdk():
    try:
        import agentshield  # noqa: F401
    except ImportError:
        here = os.path.dirname(os.path.abspath(__file__))
        sys.path.insert(0, os.path.normpath(os.path.join(here, os.pardir, os.pardir, "sdk", "python")))
    import agentshield
    return agentshield


sdk = import_sdk()
