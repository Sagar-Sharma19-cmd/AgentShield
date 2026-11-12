"""
Test doubles: a scripted gateway (same interface as agentshield.AgentShieldClient) and an in-process downstream MCP
server. The proxy runs as a real MCP Server, reached through a real MCP Client (in-process, no subprocess).
"""

from __future__ import annotations

import contextlib
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

import mcp_types as types
import pytest
from mcp import Client
from mcp.server import Server

from agentshield_mcp_proxy.config import ProxyConfig, ToolMapping
from agentshield_mcp_proxy.enforcer import Enforcer
from agentshield_mcp_proxy.gateway import sdk
from agentshield_mcp_proxy.server import build_server

TOKEN = "tok-SECRET-DECISION-TOKEN-0000"
API_KEY = "ask_SECRET-AGENT-KEY-0000"
REVIEW_ID = "11111111-2222-3333-4444-555555555555"

FS_TOOLS = {
    "read_text_file": ToolMapping("READ", ("path",)),
    "read_multiple_files": ToolMapping("READ", ("paths",)),
    "list_directory": ToolMapping("READ", ("path",)),
    "list_allowed_directories": ToolMapping("READ", ()),
    "write_file": ToolMapping("WRITE", ("path",)),
    "move_file": ToolMapping("WRITE", ("source", "destination")),
}


@pytest.fixture
def anyio_backend():
    return "asyncio"


def evaluation(decision: str, resource: str, action: str = "READ", *, request_id: str = "req-1",
               reason: str = "", review_id: Optional[str] = None, findings=()) -> Any:
    return sdk.Evaluation(
        request_id=request_id, decision=decision, reason=reason or f"{decision} by test",
        risk_score={"ALLOW": 10, "REVIEW": 60, "DENY": 90}[decision],
        authorization_result="AUTHORIZED", risk_tier=None,
        review_request_id=review_id if decision == "REVIEW" else None,
        decision_token=TOKEN if decision == "ALLOW" else None,
        inspection_verdict=None, inspection_findings=tuple(findings))


def review_status(status: str = "PENDING", *, expired=False, consumed=False, resource=".env", action="WRITE",
                  reviewer=None, note=None, review_id=REVIEW_ID) -> Any:
    return sdk.ReviewStatus(review_id=review_id, request_id="req-review", status=status, reviewer=reviewer, note=note,
                            expires_at="2099-01-01T00:00:00Z", expired=expired, consumed=consumed, tool="filesystem",
                            action=action, resource=resource)


@dataclass
class FakeGateway:
    """Scripted gateway. `decide(resource, action, arguments)` -> Evaluation; `reviews` is read by get_review."""

    decide: Callable[[str, str, Any], Any] = lambda resource, action, args: evaluation("ALLOW", resource, action)
    reviews: List[Any] = field(default_factory=list)      # successive get_review answers (last one repeats)
    verdict: Callable[[str], Any] = None                  # content -> OutputInspection
    redeem_error: Optional[Exception] = None
    evaluate_error: Optional[Exception] = None
    inspect_error: Optional[Exception] = None
    calls: List[tuple] = field(default_factory=list)

    def evaluate(self, *, session_id, action, resource, tool, arguments=None):
        self.calls.append(("evaluate", tool, action, resource, arguments, session_id))
        if self.evaluate_error:
            raise self.evaluate_error
        return self.decide(resource, action, arguments)

    def get_review(self, review_id):
        self.calls.append(("get_review", review_id))
        return self.reviews.pop(0) if len(self.reviews) > 1 else self.reviews[0]

    def claim_review(self, review_id):
        self.calls.append(("claim", review_id))
        current = self.reviews[0]
        return sdk.ReviewClaim(review_id=review_id, request_id="req-review", tool=current.tool,
                               action=current.action, resource=current.resource, reviewer="sagar",
                               decision_token=TOKEN)

    def redeem(self, *, token, tool, action, resource, expected_request_id=None, arguments=None):
        self.calls.append(("redeem", tool, action, resource, arguments, token))
        if self.redeem_error:
            raise self.redeem_error
        return sdk.Redemption(request_id=expected_request_id or "req-1", redeemed_at="2026-11-12T00:00:00Z")

    def inspect_output(self, *, session_id, tool, content):
        self.calls.append(("inspect", tool, content))
        if self.inspect_error:
            raise self.inspect_error
        if self.verdict is None:
            return sdk.OutputInspection(request_id="req-out", verdict="CLEAN", findings=(), redacted_content=content)
        return self.verdict(content)

    def kinds(self) -> List[str]:
        return [call[0] for call in self.calls]

    def of(self, kind: str) -> List[tuple]:
        return [call for call in self.calls if call[0] == kind]


class FakeDownstream:
    """In-process MCP server that records calls. `reply(name, args)` -> CallToolResult."""

    def __init__(self, reply: Optional[Callable[[str, Dict[str, Any]], types.CallToolResult]] = None):
        self.calls: List[tuple] = []
        self.reply = reply or (lambda name, args: types.CallToolResult(
            content=[types.TextContent(text=f"{name} ok")], structured_content={"content": f"{name} ok"}))

        async def on_list_tools(ctx, params):
            schema = {"type": "object", "properties": {"path": {"type": "string"}}}
            return types.ListToolsResult(tools=[
                types.Tool(name=name, input_schema=schema, output_schema={"type": "object"})
                for name in [*FS_TOOLS, "read_media_file"]])

        async def on_call_tool(ctx, params):
            self.calls.append((params.name, dict(params.arguments or {})))
            return self.reply(params.name, dict(params.arguments or {}))

        self.server = Server("fake-downstream", on_list_tools=on_list_tools, on_call_tool=on_call_tool)


def make_config(root, wait: float = 0.0) -> ProxyConfig:
    import os
    return ProxyConfig(command="unused", args=(), root=os.path.realpath(str(root)), tool="filesystem",
                       review_wait_seconds=wait, tools=dict(FS_TOOLS))


class Clock:
    """Fake monotonic clock advanced by the fake sleep."""

    def __init__(self):
        self.now = 0.0

    def monotonic(self):
        return self.now

    async def sleep(self, seconds):
        self.now += seconds


@contextlib.asynccontextmanager
async def proxy(root, gateway, downstream: Optional[FakeDownstream] = None, *, wait: float = 0.0,
                config_error: Optional[str] = None):
    """Yields (client connected to the proxy, enforcer, downstream)."""
    downstream = downstream or FakeDownstream()
    clock = Clock()
    async with Client(downstream.server, cache=None) as down:
        async def call(name, arguments):
            return await down.call_tool(name, arguments)

        enforcer = Enforcer(make_config(root, wait), gateway, "mcp-0123456789ab", call, config_error=config_error,
                            sleep=clock.sleep, monotonic=clock.monotonic, poll_seconds=3.0)
        async with Client(build_server(down, enforcer), cache=None) as client:
            yield client, enforcer, downstream


def text_of(result: types.CallToolResult) -> str:
    return "\n".join(block.text for block in result.content if isinstance(block, types.TextContent))
