"""
Proxy configuration (YAML, --config). Example (configs/filesystem.yaml):

    downstream:
      command: npx
      args: ["-y", "@modelcontextprotocol/server-filesystem@2.1.0", "{root}"]
    root: ../../demo-workspace          # relative to this file; --root overrides it
    agentshield:
      tool: filesystem                  # the registered AgentShield tool name
      sessionPrefix: "mcp-"
      reviewWaitSeconds: 90
    tools:
      read_text_file: { action: READ,  resourceFrom: path }
      move_file:      { action: WRITE, resourceFrom: [source, destination] }

"{root}" in downstream.args is replaced by the canonical root. A tool that is not listed under "tools" is
evaluated as EXECUTE on the resource "tool:<name>": never a silent ALLOW.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import yaml

ACTIONS = ("READ", "WRITE", "DELETE", "EXECUTE", "EXTERNAL_REQUEST")
UNMAPPED_ACTION = "EXECUTE"
DEFAULT_SESSION_PREFIX = "mcp-"
DEFAULT_REVIEW_WAIT_SECONDS = 90.0
MAX_REVIEW_WAIT_SECONDS = 600.0
ROOT_PLACEHOLDER = "{root}"

_PREFIX_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,31}$")
_NAME_RE = re.compile(r"^[A-Za-z0-9_.:-]{1,255}$")


class ConfigFileError(Exception):
    """The configuration file is missing or invalid. The proxy does not start."""


@dataclass(frozen=True)
class ToolMapping:
    action: str
    # Names of the arguments that hold resource paths. Empty: the resource is the root itself (".").
    resource_from: Tuple[str, ...] = ()


@dataclass(frozen=True)
class ProxyConfig:
    command: str
    args: Tuple[str, ...]
    root: str                      # canonical (realpath) allowed root
    tool: str                      # AgentShield tool name
    session_prefix: str = DEFAULT_SESSION_PREFIX
    review_wait_seconds: float = DEFAULT_REVIEW_WAIT_SECONDS
    tools: Dict[str, ToolMapping] = field(default_factory=dict)

    def downstream_args(self) -> List[str]:
        return [arg.replace(ROOT_PLACEHOLDER, self.root) for arg in self.args]


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise ConfigFileError(message)


def _mapping(name: str, raw) -> ToolMapping:
    _require(isinstance(raw, dict), f"tools.{name} must be a mapping with action and resourceFrom")
    unknown = set(raw) - {"action", "resourceFrom"}
    _require(not unknown, f"tools.{name} has unknown keys: {', '.join(sorted(unknown))}")
    action = raw.get("action")
    _require(action in ACTIONS, f"tools.{name}.action must be one of {', '.join(ACTIONS)}")
    source = raw.get("resourceFrom")
    if source is None:
        names: Tuple[str, ...] = ()
    elif isinstance(source, str):
        names = (source,)
    elif isinstance(source, list) and source and all(isinstance(item, str) for item in source):
        names = tuple(source)
    else:
        raise ConfigFileError(f"tools.{name}.resourceFrom must be an argument name or a list of names")
    _require(all(item for item in names), f"tools.{name}.resourceFrom has an empty name")
    return ToolMapping(action=action, resource_from=names)


def load_proxy_config(path: str, root_override: Optional[str] = None) -> ProxyConfig:
    try:
        with open(path, encoding="utf-8") as handle:
            data = yaml.safe_load(handle)
    except OSError as error:
        raise ConfigFileError(f"cannot read config {path}: {error.strerror}") from None
    except yaml.YAMLError:
        raise ConfigFileError(f"config {path} is not valid YAML") from None
    _require(isinstance(data, dict), "config must be a mapping")

    downstream = data.get("downstream")
    _require(isinstance(downstream, dict), "downstream must be a mapping with command and args")
    command = downstream.get("command")
    _require(isinstance(command, str) and command.strip() != "", "downstream.command is required")
    args = downstream.get("args", [])
    _require(isinstance(args, list) and all(isinstance(arg, str) for arg in args),
             "downstream.args must be a list of strings")

    raw_root = root_override if root_override is not None else data.get("root")
    _require(isinstance(raw_root, str) and raw_root.strip() != "", "root is required (or pass --root)")
    root = os.path.expanduser(os.path.expandvars(raw_root))
    if not os.path.isabs(root) and root_override is None:
        root = os.path.join(os.path.dirname(os.path.abspath(path)), root)
    root = os.path.realpath(root)
    _require(os.path.isdir(root), f"root {root} is not a directory")

    shield = data.get("agentshield")
    _require(isinstance(shield, dict), "agentshield must be a mapping with tool")
    tool = shield.get("tool")
    _require(isinstance(tool, str) and _NAME_RE.match(tool) is not None, "agentshield.tool must be a tool name")
    prefix = shield.get("sessionPrefix", DEFAULT_SESSION_PREFIX)
    _require(isinstance(prefix, str) and prefix.endswith("-") and _PREFIX_RE.match(prefix) is not None,
             "agentshield.sessionPrefix must be lower-case letters, digits and '-', ending in '-'")
    wait = shield.get("reviewWaitSeconds", DEFAULT_REVIEW_WAIT_SECONDS)
    _require(isinstance(wait, (int, float)) and not isinstance(wait, bool) and 0 <= wait <= MAX_REVIEW_WAIT_SECONDS,
             f"agentshield.reviewWaitSeconds must be a number from 0 to {MAX_REVIEW_WAIT_SECONDS:g}")

    raw_tools = data.get("tools") or {}
    _require(isinstance(raw_tools, dict), "tools must be a mapping")
    tools = {str(name): _mapping(str(name), raw) for name, raw in raw_tools.items()}

    return ProxyConfig(command=command, args=tuple(args), root=root, tool=tool, session_prefix=prefix,
                       review_wait_seconds=float(wait), tools=tools)
