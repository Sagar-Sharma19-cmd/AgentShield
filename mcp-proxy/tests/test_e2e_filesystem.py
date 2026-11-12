"""
End to end: the real @modelcontextprotocol/server-filesystem (through npx) behind the proxy, against a temp
directory, with a scripted gateway that mimics the backend's rules (.env -> DENY by policy, PII in arguments ->
REVIEW, an AWS key in output -> DENY). Skipped, with the reason, when npx is missing or the package cannot be fetched.
"""

from __future__ import annotations

import os
import shutil
import subprocess

import pytest
from mcp import Client
from mcp.client.stdio import StdioServerParameters

from agentshield_mcp_proxy.config import load_proxy_config
from agentshield_mcp_proxy.enforcer import Enforcer
from agentshield_mcp_proxy.gateway import sdk
from agentshield_mcp_proxy.server import build_server

from .conftest import REVIEW_ID, FakeGateway, evaluation, review_status, text_of

pytestmark = [pytest.mark.anyio, pytest.mark.e2e]

HERE = os.path.dirname(os.path.abspath(__file__))
SHIPPED = os.path.join(HERE, os.pardir, "configs", "filesystem.yaml")
AWS_EXAMPLE_KEY = "AKIA" + "IOSFODNN7EXAMPLE"  # AWS's documented example key, split so scanners skip it


@pytest.fixture(scope="module")
def npx_package():
    if shutil.which("npx") is None:
        pytest.skip("npx is not installed: the end-to-end filesystem test needs Node.js")
    config = load_proxy_config(SHIPPED)
    package = next(arg for arg in config.args if arg.startswith("@modelcontextprotocol/"))
    try:  # fetch into the npx cache once; the server prints usage and exits without a directory
        fetched = subprocess.run(["npx", "-y", package], capture_output=True, text=True, timeout=180, check=False)
    except (OSError, subprocess.TimeoutExpired) as error:
        pytest.skip(f"could not fetch {package} with npx ({type(error).__name__})")
    if "Usage" not in fetched.stderr + fetched.stdout:
        pytest.skip(f"could not fetch {package} with npx (offline or registry unavailable)")
    return config


def mimic_backend(resource, action, args):
    if resource.lower().endswith(".env"):
        return evaluation("DENY", resource, action, reason="Access to credential or secret resource is denied by policy.")
    if action == "WRITE" and "@" in str(args):
        return evaluation("REVIEW", resource, action, review_id=REVIEW_ID)
    return evaluation("ALLOW", resource, action)


def inspect_like_backend(content):
    if AWS_EXAMPLE_KEY in content:
        finding = sdk.Finding("SECRET", "AWS_ACCESS_KEY", "content", "AKIA… (20 chars)")
        return sdk.OutputInspection("req-out", "DENY", (finding,), content.replace(AWS_EXAMPLE_KEY, "[REDACTED]"))
    return sdk.OutputInspection("req-out", "CLEAN", (), content)


async def test_real_filesystem_server_through_the_proxy(npx_package, tmp_path):
    root = tmp_path / "ws"
    (root / "notes").mkdir(parents=True)
    (root / "config").mkdir()
    (root / "notes" / "plan.md").write_text("# Plan\nShip the MCP proxy.\n")
    (root / ".env").write_text("FAKE_PASSWORD=not-a-real-password\n")
    (root / "config" / "app.yaml").write_text(f"aws_access_key_id: {AWS_EXAMPLE_KEY}\n")
    (tmp_path / "outside.txt").write_text("outside")

    base = npx_package
    config = type(base)(command=base.command, args=base.args, root=os.path.realpath(root), tool=base.tool,
                        session_prefix=base.session_prefix, review_wait_seconds=0, tools=base.tools)
    gateway = FakeGateway(decide=mimic_backend, verdict=inspect_like_backend,
                          reviews=[review_status("PENDING", resource="notes/contact.txt")])
    params = StdioServerParameters(command=config.command, args=config.downstream_args(), cwd=config.root)

    async with Client(params, cache=None) as downstream:
        async def call(name, arguments):
            return await downstream.call_tool(name, arguments)

        enforcer = Enforcer(config, gateway, "mcp-e2e000000000", call)
        async with Client(build_server(downstream, enforcer), cache=None) as client:
            tools = {tool.name for tool in (await client.list_tools()).tools}
            assert set(config.tools) <= tools, "a mapped tool is missing from the pinned server"

            listing = await client.call_tool("list_directory", {"path": "."})
            assert not listing.is_error and "notes" in text_of(listing)

            plan = await client.call_tool("read_text_file", {"path": "notes/plan.md"})
            assert not plan.is_error and "Ship the MCP proxy." in text_of(plan)
            assert plan.structured_content is None

            env = await client.call_tool("read_text_file", {"path": ".env"})
            assert env.is_error and text_of(env).startswith("Blocked by AgentShield: Access to credential")

            app = await client.call_tool("read_text_file", {"path": "config/app.yaml"})
            assert app.is_error and "Output withheld by AgentShield: contained AWS_ACCESS_KEY" in text_of(app)
            assert AWS_EXAMPLE_KEY not in text_of(app)

            write_args = {"path": "notes/contact.txt", "content": "Mail ops@example.com, card 4111 1111 1111 1111"}
            held = await client.call_tool("write_file", write_args)
            assert "Held for human review" in text_of(held)
            assert not (root / "notes" / "contact.txt").exists()
            gateway.reviews[:] = [review_status("APPROVED", resource="notes/contact.txt", reviewer="sagar")]
            done = await client.call_tool("write_file", write_args)
            assert not done.is_error, text_of(done)
            assert (root / "notes" / "contact.txt").read_text() == write_args["content"]

            traversal = await client.call_tool("read_text_file", {"path": "docs/../.env"})
            assert traversal.is_error and "Blocked by AgentShield" in text_of(traversal)

            outside = await client.call_tool("read_text_file", {"path": "../outside.txt"})
            assert outside.is_error and "outside the allowed directory" in text_of(outside)

    evaluated = [(c[2], c[3]) for c in gateway.of("evaluate")]
    assert evaluated == [("READ", "."), ("READ", "notes/plan.md"), ("READ", ".env"), ("READ", "config/app.yaml"),
                         ("WRITE", "notes/contact.txt"), ("READ", ".env")]
