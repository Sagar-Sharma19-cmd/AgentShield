from __future__ import annotations

import os
import textwrap

import pytest

from agentshield_mcp_proxy.config import ConfigFileError, load_proxy_config
from agentshield_mcp_proxy.paths import PathRejected, canonicalize

HERE = os.path.dirname(os.path.abspath(__file__))
SHIPPED = os.path.join(HERE, os.pardir, "configs", "filesystem.yaml")


def test_shipped_filesystem_config_loads_and_points_at_the_demo_workspace():
    config = load_proxy_config(SHIPPED)
    assert config.root == os.path.realpath(os.path.join(HERE, os.pardir, os.pardir, "demo-workspace"))
    assert config.tool == "filesystem" and config.session_prefix == "mcp-" and config.review_wait_seconds == 45
    reads = {"read_text_file", "read_file", "read_multiple_files", "list_directory", "directory_tree",
             "search_files", "get_file_info"}
    writes = {"write_file", "edit_file", "create_directory", "move_file"}
    assert {name for name, m in config.tools.items() if m.action == "READ"} >= reads
    assert {name for name, m in config.tools.items() if m.action == "WRITE"} == writes
    assert config.tools["read_multiple_files"].resource_from == ("paths",)
    assert config.tools["move_file"].resource_from == ("source", "destination")
    assert "read_media_file" not in config.tools
    assert config.downstream_args()[-1] == config.root


def write(tmp_path, body: str):
    (tmp_path / "ws").mkdir(exist_ok=True)
    path = tmp_path / "c.yaml"
    path.write_text(textwrap.dedent(body))
    return str(path)


BASE = """\
downstream: {command: npx, args: ["{root}"]}
root: ws
agentshield: {tool: filesystem}
"""


@pytest.mark.parametrize("extra, message", [
    ("tools: {x: {action: SUDO}}", "action must be one of"),
    ("tools: {x: {action: READ, resourceFrom: 3}}", "resourceFrom"),
    ("tools: {x: {action: READ, oops: 1}}", "unknown keys"),
])
def test_invalid_tool_mappings_are_rejected(tmp_path, extra, message):
    with pytest.raises(ConfigFileError, match=message):
        load_proxy_config(write(tmp_path, BASE + extra))


def test_invalid_prefix_and_wait_are_rejected(tmp_path):
    with pytest.raises(ConfigFileError, match="sessionPrefix"):
        load_proxy_config(write(tmp_path, BASE.replace("{tool: filesystem}", "{tool: filesystem, sessionPrefix: MCP}")))
    with pytest.raises(ConfigFileError, match="reviewWaitSeconds"):
        load_proxy_config(write(tmp_path, BASE.replace("{tool: filesystem}", "{tool: f, reviewWaitSeconds: -1}")))


def test_missing_root_directory_is_rejected(tmp_path):
    with pytest.raises(ConfigFileError, match="not a directory"):
        load_proxy_config(write(tmp_path, BASE.replace("root: ws", "root: nope")))


def test_root_override_and_placeholder(tmp_path):
    other = tmp_path / "other"
    other.mkdir()
    config = load_proxy_config(write(tmp_path, BASE), root_override=str(other))
    assert config.root == os.path.realpath(other)
    assert config.downstream_args() == [config.root]


def test_canonicalize(tmp_path):
    root = os.path.realpath(tmp_path)
    assert canonicalize(root, "docs/../.env").relative == ".env"
    assert canonicalize(root, ".").relative == "."
    assert canonicalize(root, root + "/a/b").relative == "a/b"
    assert canonicalize(root, "a/./b/../c").absolute == os.path.join(root, "a", "c")
    for bad in ("..", "../x", "/", "a/../../x", "a\x00b", "  "):
        with pytest.raises(PathRejected):
            canonicalize(root, bad)
    # a sibling directory that shares the root's name as a prefix is outside
    with pytest.raises(PathRejected):
        canonicalize(root, root + "-evil/x")
