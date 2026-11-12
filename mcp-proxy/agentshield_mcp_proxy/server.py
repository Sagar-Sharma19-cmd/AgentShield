"""
agentshield-mcp-proxy: a stdio MCP server that launches ONE downstream MCP server as a subprocess and proxies
tools/list and tools/call through AgentShield (see enforcer.py).

    agentshield-mcp-proxy --config configs/filesystem.yaml [--root DIR]

Stdout carries only the MCP protocol. Every log line goes to stderr. Credentials come from AGENTSHIELD_GATEWAY_URL,
AGENTSHIELD_AGENT_ID and AGENTSHIELD_AGENT_API_KEY. When they are missing, the proxy still starts and lists tools,
but every call fails closed with a message that names the missing variables.

The downstream server gets the MCP SDK's minimal default environment (HOME, PATH, ...), so the agent API key is
never passed to it.
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
import uuid
from typing import Any, Mapping, Optional, Sequence

import anyio
import mcp_types as types
from mcp import Client
from mcp.client.stdio import StdioServerParameters
from mcp.server import Server, ServerRequestContext
from mcp.server.stdio import stdio_server

from . import __version__
from .config import ConfigFileError, ProxyConfig, load_proxy_config
from .enforcer import Enforcer, text_result
from .gateway import sdk

log = logging.getLogger("agentshield.mcp_proxy")

EXIT_CONFIG = 2


def new_session_id(prefix: str) -> str:
    """One session per proxy process: "<prefix><12 hex>", for example "mcp-0123456789ab"."""
    return f"{prefix}{uuid.uuid4().hex[:12]}"


def strip_output_schema(tool: types.Tool) -> types.Tool:
    """Structured content is never forwarded (it would bypass inspection), so no tool may promise it."""
    return tool.model_copy(update={"output_schema": None}) if tool.output_schema is not None else tool


def build_server(downstream: Client, enforcer: Enforcer) -> Server:
    async def on_list_tools(ctx: ServerRequestContext, params: Optional[types.PaginatedRequestParams]
                            ) -> types.ListToolsResult:
        listing = await downstream.list_tools(cursor=params.cursor if params else None)
        return types.ListToolsResult(tools=[strip_output_schema(tool) for tool in listing.tools],
                                     next_cursor=listing.next_cursor)

    async def on_call_tool(ctx: ServerRequestContext, params: types.CallToolRequestParams) -> types.CallToolResult:
        step = 0

        async def progress(message: str) -> None:
            nonlocal step
            step += 1
            try:
                await ctx.session.report_progress(step, None, message)
            except Exception:  # noqa: BLE001 - progress is best effort
                pass

        try:
            return await enforcer.call(params.name, params.arguments, progress)
        except Exception as error:  # noqa: BLE001 - never crash the session; fail closed
            log.error("call %s: unexpected %s, not run (fail closed)", params.name, type(error).__name__)
            return text_result(f"Blocked: the AgentShield proxy hit an unexpected error ({type(error).__name__}). "
                               "Nothing was run (fail closed).")

    return Server("agentshield-mcp-proxy", version=__version__,
                  instructions="Tool calls pass through AgentShield. A blocked or held call explains why; a held "
                               "call can be retried after a human approves it in the AgentShield console.",
                  on_list_tools=on_list_tools, on_call_tool=on_call_tool)


def gateway_client(environ: Mapping[str, str]):
    """(client, None) or (None, reason). The reason names variables, never values."""
    try:
        return sdk.AgentShieldClient(sdk.load_config(environ)), None
    except sdk.ConfigError as error:
        return None, str(error)


def configure_logging() -> None:
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(logging.Formatter("agentshield-mcp-proxy: %(message)s"))
    log.addHandler(handler)
    log.setLevel(logging.INFO)
    log.propagate = False
    # Library debug logs could include message bodies (arguments, outputs); keep them at WARNING.
    logging.getLogger("mcp").setLevel(logging.WARNING)


async def serve(config: ProxyConfig, environ: Mapping[str, str]) -> None:
    client, config_error = gateway_client(environ)
    session_id = new_session_id(config.session_prefix)
    if client is None:
        log.warning("AgentShield is not configured (%s): every tool call will be blocked", config_error)
    log.info("session %s, AgentShield tool %s, root %s", session_id, config.tool, config.root)

    params = StdioServerParameters(command=config.command, args=config.downstream_args(), cwd=config.root)
    async with Client(params, cache=None) as downstream:
        async def call(name: str, arguments: dict) -> types.CallToolResult:
            return await downstream.call_tool(name, arguments)

        enforcer = Enforcer(config, client, session_id, call, config_error=config_error)
        server = build_server(downstream, enforcer)
        async with stdio_server() as (read_stream, write_stream):
            await server.run(read_stream, write_stream, server.create_initialization_options())


def main(argv: Optional[Sequence[str]] = None, environ: Mapping[str, str] = os.environ) -> int:
    parser = argparse.ArgumentParser(prog="agentshield-mcp-proxy",
                                     description="Put one stdio MCP server behind AgentShield.")
    parser.add_argument("--config", required=True, help="proxy configuration (YAML)")
    parser.add_argument("--root", help="allowed root directory (overrides root in the config)")
    args = parser.parse_args(argv)
    configure_logging()
    try:
        config = load_proxy_config(args.config, args.root)
    except ConfigFileError as error:
        log.error("configuration error: %s", error)
        return EXIT_CONFIG
    try:
        anyio.run(serve, config, environ)
    except KeyboardInterrupt:
        return 0
    except Exception as error:  # noqa: BLE001 - report the type only: messages could carry protocol data
        log.error("stopped: %s", type(error).__name__)
        return 1
    return 0


def console_main() -> None:
    sys.exit(main())
