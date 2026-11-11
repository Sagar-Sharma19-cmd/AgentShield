#!/usr/bin/env bash
# Deploys the risk-engine image to the local "staging" container. Run by the Jenkinsfile through
# agentshield-guard (docker WRITE deploy/staging/risk-engine). The guard runs argv without a shell, so the
# shell logic lives here.
#
#   ci/jenkins/deploy-staging.sh localhost:5001/agentshield-risk-engine:<build>
#
# Pulls the image from the local registry (so the deploy uses what the Push stage published), replaces the
# container agentshield-risk-engine-staging, maps 127.0.0.1:8100 -> 8000 and waits for /health.
set -euo pipefail

IMAGE="${1:?usage: deploy-staging.sh <image>}"
NAME="agentshield-risk-engine-staging"
PORT="${AGENTSHIELD_STAGING_PORT:-8100}"

case "$IMAGE" in
  localhost:5001/agentshield-risk-engine:*) ;;
  *) echo "deploy-staging: refusing unexpected image '$IMAGE'." >&2; exit 2 ;;
esac

echo "deploy-staging: pulling $IMAGE from the local registry"
docker pull --quiet "$IMAGE" >/dev/null

if docker container inspect "$NAME" >/dev/null 2>&1; then
  echo "deploy-staging: replacing the existing $NAME container"
  docker rm -f "$NAME" >/dev/null
fi

docker run -d --name "$NAME" --restart unless-stopped -p "127.0.0.1:$PORT:8000" \
  --label "org.agentshield.deployed-by=jenkins" "$IMAGE" >/dev/null

for _ in $(seq 1 30); do
  if curl -fsS "http://localhost:$PORT/health" >/dev/null 2>&1; then
    echo "deploy-staging: $NAME is up on http://localhost:$PORT"
    exit 0
  fi
  sleep 1
done
echo "deploy-staging: $NAME did not become healthy within 30 s. Last log lines:" >&2
docker logs --tail 20 "$NAME" >&2 || true
exit 1
