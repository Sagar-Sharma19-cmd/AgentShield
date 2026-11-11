# Real CI/CD with Jenkins, guarded by AgentShield (E2)

The root `Jenkinsfile` builds, tests, pushes and deploys the risk-engine image on this Mac. Every command with a side effect runs through `agentshield-guard`. The guard does three things in order:

1. It asks the AgentShield gateway.
2. It redeems the one-time decision token.
3. Only after that does it run the command (an argv list, no shell).

If the gateway denies the step, the step still needs a review, or the gateway or redeem fails, the guard does not run the command and the stage fails.

```
Jenkins (localhost:8080)                          AgentShield (localhost:8081)
 Setup            venv: sdk/python + guard
 Build and test   guard docker WRITE ───────────► ALLOW → redeem → docker build --target test (pytest)
                  guard docker WRITE ───────────► ALLOW → redeem → docker build (final, non-root)
 Attack*          guard filesystem READ .env ───► DENY (policy) → nothing runs, build fails
 Push             guard docker EXTERNAL_REQUEST ► REVIEW … operator approves in console → claim → redeem → docker push
 Deploy staging   guard docker WRITE ───────────► ALLOW → redeem → ci/jenkins/deploy-staging.sh (port 8100)
 Smoke test       guard http READ ──────────────► ALLOW → redeem → curl http://localhost:8100/health
 * only with ATTACK=true
```

One build is one AgentShield session (`jenkins-<job>-<build>`, from `BUILD_TAG`). In the console, it appears under **CI/CD → Jenkins · jenkins-ci-agent → Real pipeline runs**.

Local development only. The agent key lives in Jenkins' credential store and in `~/.agentshield-ci/env` (mode 0600). It is never printed.

---

## Prerequisites

- **Docker Desktop is running.** `docker info` works in a terminal.
- **The AgentShield backend is on `http://localhost:8081`**, with `AGENTSHIELD_DECISION_TOKEN_SECRET` set (E1). Check it with `curl -s localhost:8081/actuator/health`.
- **The risk engine is on 8000** (optional). Without it, the gateway still decides on policy alone.
- **Jenkins LTS is on `http://localhost:8080`** (Homebrew: `brew services start jenkins-lts`) with these plugins: Pipeline, Git, Credentials Binding. They come with the suggested plugins.
- **The branch is pushed to GitHub.** Jenkins checks out the repository from GitHub, so it sees only committed and pushed files: the `Jenkinsfile`, `guard/`, `sdk/python/` and `ci/jenkins/`.

## One-time setup

### 1. Create the CI identity in AgentShield

From the repository root:

```bash
set -a && source .env && set +a          # AGENTSHIELD_ADMIN_API_KEY
scripts/setup-ci-agent.sh
```

The script does the following:

- Registers `jenkins-ci-agent`. If the agent already exists, it rotates the agent's key instead.
- Reuses or creates the tools `docker`, `http` and `filesystem`.
- Grants exactly these actions:
  - `docker`: `WRITE`, `EXTERNAL_REQUEST`
  - `http`: `READ`
  - `filesystem`: `READ`
- Writes the key to `~/.agentshield-ci/env`.

`filesystem READ` is granted on purpose. With the grant in place, the ATTACK stage is denied by **policy** (secret resource), not by a missing permission.

### 2. Add the key to Jenkins as a credential

1. Copy the key to the clipboard without showing it:

   ```bash
   ( . ~/.agentshield-ci/env && printf %s "$AGENTSHIELD_AGENT_API_KEY" | pbcopy )
   ```

2. In Jenkins, go to **Manage Jenkins → Credentials → System → Global credentials (unrestricted) → Add Credentials**.
   - **Kind:** Secret text
   - **Scope:** Global
   - **Secret:** paste the key
   - **ID:** `agentshield-ci-agent-key` (exactly this; the Jenkinsfile uses it)
   - **Description:** AgentShield jenkins-ci-agent key
3. Clear the clipboard: `printf '' | pbcopy`.

Running `setup-ci-agent.sh` again rotates the key. When that happens, open the credential, choose **Update**, and paste the new key.

### 3. Start the local registry

```bash
ci/jenkins/setup-local-infra.sh
```

This starts `registry:2` as `agentshield-registry` on `127.0.0.1:5001`. It uses 5001 because macOS AirPlay takes 5000. The script is safe to run again.

### 4. Create the job

1. **New Item.** Name it `agentshield-guarded-deploy`, choose **Pipeline**, then **OK**.
2. In the **Pipeline** section, set:
   - **Definition:** Pipeline script from SCM
   - **SCM:** Git
   - **Repository URL:** `https://github.com/Sagar-Sharma19-cmd/AgentShield.git` (if the repository is private, add GitHub credentials)
   - **Branch Specifier:** `*/feature/real-enforcement` (the branch that holds this work)
   - **Script Path:** `Jenkinsfile`
3. Click **Save**.

### 5. First run

Jenkins learns the job's parameters from the Jenkinsfile during the first build. So:

1. Click **Build Now** once. That build runs with the defaults: `ATTACK=false`, `REVIEW_TIMEOUT=600`.
2. From then on, the button is **Build with Parameters**.

---

## Expected results per stage

| Stage | Decision | What you see |
|---|---|---|
| Setup | — | Checks Docker, the backend and the registry; creates `.venv`; prints `Session: jenkins-agentshield-guarded-deploy-<n>` |
| Build and test | ALLOW ×2 | `agentshield-guard: ALLOW …`, `decision redeemed; running docker.`, then the pytest output from the test stage and the final image build |
| Push | REVIEW → (approved) | `REVIEW … waiting for an operator`. The build **pauses**. In the console's **Reviews** page, approve the `docker.external_request` request. The guard then claims the approval, redeems it, and runs `docker push localhost:5001/agentshield-risk-engine:<n>` |
| Deploy staging | ALLOW | `deploy-staging: agentshield-risk-engine-staging is up on http://localhost:8100` |
| Smoke test | ALLOW | `{"status":"ok","service":"agentshield-risk-engine"}` |

On the console's **CI/CD** page, pick **Jenkins · jenkins-ci-agent**. The build appears as a real pipeline run, and its steps update live:

- While the push waits for review, the run shows **Waiting for review**, and the step links to the review.
- When every recorded step was allowed, the run shows **Authorized**.

AgentShield records decisions. Whether each command then succeeded is shown in Jenkins.

If an operator **rejects** the push, the stage fails with `Blocked by AgentShield (denied or rejected): Push`, and nothing is pushed or deployed. If nobody decides within `REVIEW_TIMEOUT` seconds, it fails with `AgentShield could not authorize (fail closed): Push`.

### Showing a DENY (ATTACK)

Click **Build with Parameters** and tick **ATTACK**. After Build and test, the stage **Attack: read secrets** runs:

```
agentshield-guard run --tool filesystem --action READ --resource $WORKSPACE/.env -- cat $WORKSPACE/.env
```

The following happens:

1. PolicyEngine denies every `*.env` resource.
2. The guard exits 3 without running `cat`.
3. The build fails with **`Blocked by AgentShield (denied or rejected): Attack: read secrets`**.
4. Nothing is pushed or deployed.

In the console, the step shows **Blocked** at the **Policy** gate. The agent holds `filesystem READ`, so this is policy at work, not a missing grant.

### How guard exit codes become stage messages

| Guard exit | Stage fails with |
|---|---|
| 3 (DENY or rejected review) | `Blocked by AgentShield (denied or rejected): <stage>` |
| 4 (REVIEW without wait), 5 (gateway or redeem error, timeout, expired) | `AgentShield could not authorize (fail closed): <stage>` |
| 127 | `<stage>: the command could not be started (exit 127)…` |
| other non-zero | `<stage>: authorized by AgentShield, but the command failed (exit N).` |

When the command does run, the guard returns the command's own exit code. A command that itself exits 3, 4 or 5 would be reported as an AgentShield failure. The guard's own `agentshield-guard:` lines in the console log show which case it was.

---

## Troubleshooting

- **`docker: command not found`, or `docker-credential-desktop` not found.** Jenkins under `brew services` gets launchd's minimal PATH. The Jenkinsfile prepends `/opt/homebrew/bin`, `/usr/local/bin` and `/Applications/Docker.app/Contents/Resources/bin`. If Docker is installed elsewhere, add that directory to `PATH` in the Jenkinsfile's `environment` block. You can find the directory with `which docker`.
- **`Cannot connect to the Docker daemon` or `permission denied … docker.sock`.**
  - Docker Desktop must be running, and Jenkins must run as your macOS user (`brew services` does this).
  - Check with `ls -l ~/.docker/run/docker.sock`.
  - If Jenkins runs as a different user, give that user access to the socket, or run Jenkins as your user.
- **`Local registry not reachable on localhost:5001`.** Run `ci/jenkins/setup-local-infra.sh`. If port 5001 is taken, `lsof -nP -iTCP:5001 -sTCP:LISTEN` shows which process has it.
- **`AgentShield backend not reachable`.** Start the backend on 8081.
- **Every step fails with exit 5 and `401`.**
  - The credential is wrong or out of date (for example, after a key rotation). Update `agentshield-ci-agent-key`.
  - If the message is about the decision token, the backend is missing `AGENTSHIELD_DECISION_TOKEN_SECRET` or is running an older build without E1.
- **Every step is DENY with `AGENT_SUSPENDED`.** Reactivate `jenkins-ci-agent` in the console (Agents).
- **`python3 -m venv` or pip fails.**
  - `python3` must be 3.9 or newer on Jenkins' PATH.
  - The first `pip install -e` downloads `setuptools` from PyPI to build the two local packages, so the machine needs network access once.
- **Port 8100 is in use.** Another process holds it, so the staging container cannot bind. Stop that process, or set `AGENTSHIELD_STAGING_PORT` for `deploy-staging.sh` and change the smoke-test URL to match.
- **Lint the Jenkinsfile.** This needs a Jenkins API token from your user page:

  ```bash
  curl -s -u "<jenkins-user>:<api-token>" -X POST -F "jenkinsfile=<Jenkinsfile" http://localhost:8080/pipeline-model-converter/validate
  ```

## Cleaning up

```bash
docker rm -f agentshield-risk-engine-staging agentshield-registry
docker image ls 'localhost:5001/agentshield-risk-engine' -q | xargs -r docker image rm
```

## What this does and does not enforce

- **Enforced:** every guarded stage runs its command only after the following:
  - a decision that AgentShield signed;
  - for this agent;
  - for this exact tool, action and resource;
  - within 60 s;
  - redeemed exactly once.

  The push additionally needs a human approval.
- **Not enforced:**
  - Commands that the Jenkinsfile runs **without** the guard: the Setup checks, the venv install and the post-build image cleanup. They have no external effect.
  - Anything someone runs on this Mac directly. Docker and the registry do not check AgentShield tokens.
  - Whether a command touches only its declared resource. The guard does not parse commands.

  Protecting the Jenkinsfile itself (branch protection, code review) is what keeps guarded stages guarded.
