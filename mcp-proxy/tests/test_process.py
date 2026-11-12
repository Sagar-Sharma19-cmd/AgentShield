"""
The real console entry point as a subprocess, over stdio: stdout carries only MCP (the client could not talk to it
otherwise), the downstream never receives the agent key, and stderr never holds arguments, outputs or keys.
"""

from __future__ import annotations

import os
import sys
import textwrap

import pytest
from mcp import Client
from mcp.client.stdio import StdioServerParameters, stdio_client

from .conftest import text_of

pytestmark = pytest.mark.anyio

HERE = os.path.dirname(os.path.abspath(__file__))
SECRET_KEY = "ask_PROCESS-LEVEL-SECRET-KEY"
SECRET_ARG = "PROCESS-LEVEL-ARGUMENT-SECRET"


def write_config(tmp_path):
    root = tmp_path / "ws"
    root.mkdir()
    (root / "a.txt").write_text("x")
    config = tmp_path / "proxy.yaml"
    config.write_text(textwrap.dedent(f"""\
        downstream:
          command: {sys.executable}
          args: ["{os.path.join(HERE, 'fake_downstream_server.py')}"]
        root: ws
        agentshield:
          tool: filesystem
        tools:
          read_text_file: {{ action: READ, resourceFrom: path }}
        """))
    return config


async def run_proxy(tmp_path, env):
    config = write_config(tmp_path)
    stderr_path = tmp_path / "stderr.log"
    params = StdioServerParameters(command=sys.executable, args=["-m", "agentshield_mcp_proxy", "--config", str(config)],
                                   env=env)
    with open(stderr_path, "w") as errlog:
        async with Client(stdio_client(params, errlog=errlog), cache=None) as client:
            listing = await client.list_tools()
            result = await client.call_tool("read_text_file", {"path": "a.txt", "content": SECRET_ARG})
    return listing, result, stderr_path.read_text()


async def test_missing_credentials_start_and_fail_closed(tmp_path):
    listing, result, stderr = await run_proxy(tmp_path, {})
    assert [tool.name for tool in listing.tools] == ["read_text_file"]
    assert result.is_error and "not configured" in text_of(result)
    assert "AGENTSHIELD_AGENT_API_KEY" in text_of(result)
    assert "every tool call will be blocked" in stderr


async def test_unreachable_gateway_fails_closed_without_leaking(tmp_path):
    env = {"AGENTSHIELD_GATEWAY_URL": "http://127.0.0.1:9", "AGENTSHIELD_AGENT_ID": "claude-mcp-agent",
           "AGENTSHIELD_AGENT_API_KEY": SECRET_KEY}
    listing, result, stderr = await run_proxy(tmp_path, env)
    assert result.is_error and "GatewayUnavailable" in text_of(result)
    assert "DOWNSTREAM-OUTPUT-MARKER" not in text_of(result)
    assert "session mcp-" in stderr
    for forbidden in (SECRET_KEY, SECRET_ARG, "DOWNSTREAM-OUTPUT-MARKER"):
        assert forbidden not in stderr
