# agentshield-mcp-proxy

A stdio MCP server that launches one downstream MCP server and enforces AgentShield decisions on every tool call:
evaluate, wait for human review when needed, redeem the one-time decision, call the tool, then inspect the output before
the model sees it. Fail closed on any gateway error.

```bash
scripts/setup-mcp-demo.sh                     # agent, tool, grant, ~/.agentshield-mcp/env, venv, wrapper
claude mcp add --scope user --transport stdio agentshield-filesystem -- ~/.agentshield-mcp/run-proxy.sh
mcp-proxy/.venv/bin/python -m pytest -q mcp-proxy
```

Configuration, behaviour, the demo script and limitations: [docs/mcp-proxy.md](../docs/mcp-proxy.md).
