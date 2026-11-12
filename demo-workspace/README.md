# AgentShield MCP demo workspace

This folder is the only directory the AgentShield MCP proxy demo exposes to an AI agent
(`mcp-proxy/configs/filesystem.yaml`). See `docs/mcp-proxy.md` for the demo script.

**Every value in this folder is fake.** `.env` holds made-up placeholders, and `config/app.yaml` holds AWS's
publicly documented example access key (`AKIA` + `IOSFODNN7EXAMPLE`), which is not a working credential. They exist
so the demo can show AgentShield blocking a secret file by policy and withholding secret-bearing tool output.

| File | What the demo shows |
| --- | --- |
| `notes/plan.md` | an ordinary read: ALLOW |
| `.env` | a secret file: DENY by policy, the agent never sees it |
| `config/app.yaml` | an allowed read whose output contains a key: the output is withheld |
