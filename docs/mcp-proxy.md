# AgentShield MCP proxy (M1)

`agentshield-mcp-proxy` (`mcp-proxy/`) puts one stdio MCP server behind AgentShield. An MCP client (Claude Code,
Claude Desktop, or any other) talks to the proxy. The proxy launches the real server as a subprocess, forwards
`tools/list`, and sends every `tools/call` through the gateway before the real server sees it. The shipped
configuration wraps the official filesystem server (`@modelcontextprotocol/server-filesystem`, pinned to 2.1.0) and
exposes only `demo-workspace/`.

It is built on the official MCP Python SDK (`mcp` 2.3, low-level `Server` plus `Client`) and the shared AgentShield
SDK (`sdk/python`).

```
 Claude ──stdio──► agentshield-mcp-proxy ──stdio──► server-filesystem (subprocess, minimal env: no AgentShield key)
                    │
                    ├─ map tool -> action, canonicalize paths (reject outside root: no gateway or downstream call)
                    ├─ POST /gateway/evaluate        tool=filesystem action resource=<root-relative path> arguments
                    │    DENY   ─► "Blocked by AgentShield: <reason>" + redacted findings
                    │    REVIEW ─► poll GET /gateway/reviews/{id} (up to 90 s) ─► APPROVED: POST …/claim
                    │              still pending ─► "Held for human review <id> …"  (retry claims the same review)
                    │    ALLOW / claimed ─► POST /gateway/decisions/redeem (same tool, action, resource, arguments)
                    ├─ tools/call on the real server with the canonical absolute paths
                    └─ POST /gateway/inspect (text output, ≤ 262,144 characters)
                         DENY ─► "Output withheld by AgentShield: contained <types>"
                         REVIEW ─► redacted content      CLEAN ─► unchanged
```

## Setup and connecting a client

Requirements: the backend running (default `http://localhost:8081`), `AGENTSHIELD_ADMIN_API_KEY` in the
environment, Python 3.10+, and Node.js with `npx`. The pinned filesystem server declares Node ≥ 24; it ran on
Node 20.20 in our tests with only an `EBADENGINE` warning.

```bash
set -a && source .env && set +a
scripts/setup-mcp-demo.sh            # add --rotate to issue a new key for an existing agent
```

The script registers the agent `claude-mcp-agent`, or reuses it if the name is taken. A reused agent keeps the key
already saved in `~/.agentshield-mcp/env` unless you pass `--rotate`. The script also registers the tool
`filesystem` if it is missing and grants **READ and WRITE only**. It writes `~/.agentshield-mcp/env` (mode 0600; the
key is never printed), creates `mcp-proxy/.venv` with `sdk/python` and `mcp-proxy` installed, and writes the wrapper
`~/.agentshield-mcp/run-proxy.sh`. The wrapper loads the env file, adds the directory that holds `npx` to `PATH`
(GUI apps start with a minimal `PATH`) and starts the proxy. No client configuration ever holds the key.

**Claude Code** (user scope, stdio):

```bash
claude mcp add --scope user --transport stdio agentshield-filesystem -- ~/.agentshield-mcp/run-proxy.sh
```

**Claude Desktop**: add the server to `~/Library/Application Support/Claude/claude_desktop_config.json` and restart
the app. Use the absolute wrapper path that the setup script prints:

```json
{
  "mcpServers": {
    "agentshield-filesystem": {
      "command": "/Users/<you>/.agentshield-mcp/run-proxy.sh"
    }
  }
}
```

Run it by hand: `mcp-proxy/.venv/bin/agentshield-mcp-proxy --config mcp-proxy/configs/filesystem.yaml [--root DIR]`,
with `AGENTSHIELD_GATEWAY_URL`, `AGENTSHIELD_AGENT_ID` and `AGENTSHIELD_AGENT_API_KEY` set. If any of them is missing,
the proxy still starts and lists tools, but every call fails closed with a message that names the missing variables.

## Configuration (`mcp-proxy/configs/filesystem.yaml`)

| Key | Meaning |
| --- | --- |
| `downstream.command`, `downstream.args` | The MCP server to launch. `{root}` is replaced by the canonical root. |
| `root` | The only directory calls may touch. Relative paths are resolved from the config file; `--root` overrides it. |
| `agentshield.tool` | Registered AgentShield tool name (`filesystem`). |
| `agentshield.sessionPrefix` | `mcp-`. One session id per proxy process: `mcp-<12 hex>`. |
| `agentshield.reviewWaitSeconds` | How long a call waits for a human decision (default 90, max 600). |
| `tools.<name>` | `{ action, resourceFrom }`. `resourceFrom` names the argument (or list of arguments) that holds the path. Without it, the resource is the root (`.`). |

The filesystem mapping:

- **READ:** `read_text_file`, `read_file`, `read_multiple_files`, `list_directory`, `list_directory_with_sizes`,
  `directory_tree`, `search_files`, `get_file_info` and `list_allowed_directories`.
- **WRITE:** `write_file`, `edit_file`, `create_directory`, and `move_file` (both source and destination).

Any tool that is not mapped is evaluated as **EXECUTE** on `tool:<name>`; it is never a silent ALLOW. This includes
`read_media_file`, which is left unmapped on purpose. With the READ/WRITE-only grant, the permission engine denies
EXECUTE, so an unmapped tool is blocked rather than sent to review. If you grant EXECUTE, the policy engine sends it
to review.

## Behaviour per call

1. **Paths.** Each path argument is canonicalized before the gateway sees it. Relative paths resolve against the
   root, `~` is expanded, `..` is collapsed and symlinks are resolved. A path outside the root is rejected with a tool
   error, and neither the gateway nor the server is called. The gateway sees the root-relative path, so
   `docs/../.env` is evaluated as `.env`. The server receives the canonical absolute path, so what was evaluated is
   exactly what runs.
2. **Evaluate.** `evaluate(tool, action, resource, arguments=<the arguments the server will receive>,
   sessionId)`. The gateway inspects those arguments and binds their hash to the decision token. A multi-path call is
   evaluated once per distinct path, and every path must be allowed or approved before anything runs.
3. **DENY.** The call returns `isError: true` with `Blocked by AgentShield: <reason>`, the redacted finding
   previews, and the request id. The server is not called.
4. **REVIEW.** The proxy polls the review every 3 s, up to the wait time, and sends MCP progress notifications when
   the client asked for them.
   - **APPROVED:** the proxy claims the review (checking that the approved tool, action and resource match),
     redeems it, and runs the call.
   - **REJECTED or expired:** the call is blocked.
   - **Still pending:** the call returns `Held for human review <id>. Approve it in the AgentShield console, then ask
     me to retry this exact action.`

   The proxy keeps an in-memory map from sha256(tool, action, canonical resource, canonical arguments) to the review
   id until the review expires. A retry of the same call therefore checks and claims that review instead of
   creating a new one.
5. **ALLOW.** The proxy redeems the token with the same arguments, then calls the server. A failed redeem (401, 403
   or 409) means no call.
6. **Fail closed.** An unreachable gateway, a timeout, a non-2xx answer or a malformed reply blocks the call, and
   the server is not called. An unexpected error in the proxy also blocks the call.
7. **Output.** Text content blocks and embedded text resources are joined and sent to `inspect_output`.
   - **DENY:** the output is replaced with `Output withheld by AgentShield: contained <types>`.
   - **REVIEW:** the redacted content is returned, plus a note naming the redacted types.
   - **CLEAN:** the output passes through unchanged.
   - **Too large:** output over 262,144 UTF-16 code units (the gateway's limit) is withheld, not passed through
     uninspected.
   - **Inspection fails:** the output is withheld. The call itself has already run.

**Not inspected, by design (documented limits):**

- *Images, audio and blobs* pass through unchanged. The proxy writes a stderr line saying so.
- *`structuredContent`* is never forwarded, because it would reach the model without inspection. The proxy also
  removes `outputSchema` from `tools/list`, so clients do not expect it.

**Logs.** Logs go to stderr only; stdout carries only the MCP protocol. They name tools, actions, root-relative
resources, decisions and request/review ids. They never contain arguments, outputs, tokens or keys. Library loggers
(`mcp`) are kept at WARNING. The downstream server's own stderr is passed through (the filesystem server prints a
startup line).

## Demo script

Ask Claude, connected through `agentshield-filesystem`, to do the following in order. Watch **Activity** in the
console: these rows carry the **MCP proxy** label, and output checks read **Output check** with their verdict.

| # | Ask Claude to … | Expected |
| - | --- | --- |
| 1 | list the files in the workspace (`list_directory .`) | ALLOW; Claude sees `.env`, `README.md`, `config`, `notes` |
| 2 | read `notes/plan.md` | ALLOW; output check Clean |
| 3 | read `.env` | DENY by policy ("Access to credential or secret resource is denied by policy."); nothing is read |
| 4 | read `config/app.yaml` | ALLOW, but the output check is Deny: `Output withheld by AgentShield: contained AWS_ACCESS_KEY` |
| 5 | write `notes/contact.txt` containing an email address and a card number (for example `4111 1111 1111 1111`) | REVIEW (inspection: PII). Approve it in **Reviews** within 90 s and the same call runs; otherwise Claude reports it as held. Approve it and ask Claude to retry the exact action, and the write runs. |
| 6 | read `docs/../.env` | DENY: evaluated as `.env` |

Also try `../README.md`: the proxy rejects it before it reaches the gateway ("outside the allowed directory").

**Verified live on 12 Nov 2026** against the local backend, through the real wrapper
(`~/.agentshield-mcp/run-proxy.sh`) and filesystem server 2.1.0, driven by an MCP client script:

- Steps 1 to 4 and 6 gave exactly the results above.
- Step 5 ran both ways: approved while the call waited (the call ran after 3 s), and held after 90 s, then approved
  and retried, after which the retry claimed the same review and the write ran.
- The proxy's stderr contained no arguments, output, email address, card number or key.

Every value in `demo-workspace/` is fake (see its README). `config/app.yaml` holds AWS's documented example key
(`AKIA` + `IOSFODNN7EXAMPLE`); Trivy's built-in allow rule skips that example key, and a full `trivy fs` secret
scan of the repository passes.

## What this enforces, and what it does not

- **Enforced:** every tool call that goes through the proxy is evaluated, redeemed once, and run with the exact
  canonical arguments that were evaluated. Its text output is inspected before the model sees it.
- **Cooperative:** a client configured to use the filesystem server directly, or another MCP server, is not
  protected. The proxy holds the agent key; the downstream server does not.
- **Time of check vs time of use:** a symlink created between canonicalization and the server's own access is not
  seen. The server re-checks that paths stay inside its allowed directory, which bounds this to the root.
- **Client timeouts:** some MCP clients time out tool calls before 90 s. The proxy then reports nothing, but the
  review stays open, and a retry of the same call claims it. Lower `reviewWaitSeconds` if your client times out.
- **Memory:** the retry map lives in the process. After a restart, a retry creates a new review.
- **Trajectory:** all calls of one proxy process share a session, so trajectory analysis can escalate a later ALLOW
  to REVIEW after several denials. That is the gateway working as designed.
- **Pattern-based inspection:** inspection matches known secret and PII patterns. It is not a guarantee.

## Tests

`mcp-proxy/tests`, run with `mcp-proxy/.venv/bin/python -m pytest -q mcp-proxy`:

- `test_proxy.py`: every branch, through real in-process MCP sessions with a scripted gateway and a fake downstream
  server.
- `test_process.py`: the console entry point as a subprocess over stdio: missing credentials, an unreachable
  gateway, and no secrets in stderr.
- `test_config.py`: the shipped config, invalid configs and canonicalization.
- `test_e2e_filesystem.py`: the real filesystem server through `npx` against a temp directory with a scripted
  gateway. It is skipped, with the reason, when `npx` is missing or the package cannot be fetched.
