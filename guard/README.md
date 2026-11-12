# agentshield-guard

Runs a real command only after AgentShield allows it and the gateway accepts the one-time decision token.
Standard library only; the HTTP client is the shared SDK in `../sdk/python`.

```
agentshield-guard run   --tool T --action A --resource R [--session S] [--wait-for-review] [--review-timeout N] -- <command...>
agentshield-guard check --tool T --action A --resource R [--session S]
```

`run` does the following:

1. Calls `POST /api/v1/gateway/evaluate`.
2. On `ALLOW`, calls `POST /api/v1/gateway/decisions/redeem` with the decision token.
3. Runs the command only if the redeem returns `200`.

The command is run with `subprocess.run(argv, shell=False)`. It gets the guard's stdin, stdout and stderr, and the guard exits with the command's exit code. Guard messages go to stderr with the prefix `agentshield-guard:`. The API key, the decision token and the command's arguments are never printed. Only the program name is shown.

`check` only evaluates and prints the decision. It never redeems the token, so the token simply expires.

**Arguments (V13).** `run` sends the command's argv (everything after `--`) as `arguments` on both evaluate and redeem, so the gateway can inspect it for secrets, personal data and prompt injection, and the decision token is bound to those exact arguments. A secret in the argv is a DENY (exit 3). Personal data or an injection phrase is held for REVIEW. Pass `--no-send-args` to send no arguments; then only the `--resource` string is inspected (V13.1), and the token has no `args` claim. `check` sends no arguments.

## Install

From the repository root:

```bash
pip install -e sdk/python -e guard
```

From a checkout, `python3 -m agentshield_guard` (run from `guard/`) also works without installing. It finds the SDK in `../sdk/python`.

## Configuration

| Variable | Meaning |
|---|---|
| `AGENTSHIELD_GATEWAY_URL` | For example `http://localhost:8081` |
| `AGENTSHIELD_AGENT_ID` | The registered agent name |
| `AGENTSHIELD_AGENT_API_KEY` | The agent's key (never printed) |

`scripts/demo.sh setup` writes all three to `~/.agentshield-demo/env`.

The session ID defaults to the first match below:

1. `$BUILD_TAG` (Jenkins).
2. `gh-$GITHUB_RUN_ID-$GITHUB_JOB` (GitHub Actions).
3. `guard-<12 hex>`.

It is capped at 255 characters.

## Exit codes

| Code | Meaning | Command ran? |
|---|---|---|
| `0` (or the command's own code) | `ALLOW` and redeemed, then the command ran. With `check`, `0` means ALLOW | yes (`run`) |
| `3` | `DENY`, or a review that was `REJECTED` (reviewer and note shown) | no |
| `4` | `REVIEW` and `--wait-for-review` was not given (review ID shown) | no |
| `5` | Any of the following (fail closed): the gateway is unreachable or returns an error, the redeem is refused (401/403/409), the configuration is missing, an ALLOW has no token, the claimed operation differs from the one requested, the review expired, or `--review-timeout` (default 300 s) passed | no |
| `127` | The program could not be started | no |
| `2` | Usage error (for example, no command after `--`) | no |

With `--wait-for-review`, the guard handles a REVIEW like this:

1. It polls the review every 3 s.
2. When the review is `APPROVED`, it claims it once.
3. It checks that the claimed tool, action and resource match the request.
4. It redeems the claim's token, then runs the command.

## Examples

These use the demo agent from `scripts/demo.sh setup`. Its grants are:

- docker: WRITE, EXTERNAL_REQUEST
- kubernetes: WRITE, DELETE
- jenkins and shell: EXECUTE
- github: READ
- filesystem: READ, WRITE
- curl: EXTERNAL_REQUEST

```bash
source ~/.agentshield-demo/env

# Ask only
agentshield-guard check --tool docker --action WRITE --resource image:agentshield-demo; echo "exit $?"

# Run a real build only if allowed and redeemed
agentshield-guard run --tool docker --action WRITE --resource image:agentshield-demo -- docker build -t agentshield-demo ./backend

# Not granted -> DENY, exit 3, nothing runs
agentshield-guard run --tool shell --action DELETE --resource /tmp/build-cache -- rm -rf /tmp/build-cache; echo "exit $?"

# Exit-code passthrough
agentshield-guard run --tool shell --action EXECUTE --resource ci/smoke -- python3 -c "import sys; sys.exit(7)"; echo "exit $?"

# Wait for an operator (approve it in the dashboard's Reviews page)
agentshield-guard run --tool kubernetes --action DELETE --resource k8s/staging/old-job --wait-for-review -- kubectl delete job old-job -n staging
```

Which of these are ALLOW, REVIEW or DENY depends on the policy and the risk engine. These examples do not promise a particular decision.

## What this enforces, and what it does not

- **Enforced:** a command run through the guard needs all of the following:
  - a decision that the gateway signed;
  - issued to this agent;
  - for this exact tool, action and resource;
  - not expired (default 60 s);
  - never redeemed before.

  The redeem is a primary-key insert, so a token works once.
- **Not enforced:** anyone who runs `docker` or `kubectl` directly, without the guard. The target systems do not check AgentShield tokens. Keeping the deploy credentials only in the CI step that runs the guard is a deployment control, not something the guard can do.
- **Not checked:** whether the command actually touches only the declared `--resource`. The guard does not parse commands. Content inspection looks at the argv text for sensitive values; it does not understand what the command does.

## In Jenkins

The root `Jenkinsfile` runs every side-effecting stage through the guard; setup and expected results are in
[`ci/jenkins/README.md`](../ci/jenkins/README.md). The default session id is `BUILD_TAG`, so one build is one session.

## Tests

```bash
cd guard && python3 -m unittest discover -s tests -t .
```

The tests use a local stub gateway. They cover these cases:

- The command runs only after ALLOW plus a successful redeem.
- DENY, REVIEW, a redeem failure, a down gateway and a missing token never run the command.
- The review wait flows.
- A real subprocess run, showing the exit-code passthrough and no shell interpretation.
- No key or token ever appears in the output.
