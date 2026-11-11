#!/usr/bin/env bash
# Local infrastructure for the guarded Jenkins pipeline: a Docker registry (registry:2) on localhost:5001.
# Local development use only. Safe to run again: it reuses a running or stopped registry container.
#
#   ci/jenkins/setup-local-infra.sh
#
# Port 5001, not 5000: macOS uses 5000 for AirPlay Receiver. Docker treats localhost registries as insecure-allowed,
# so no daemon configuration is needed. The port is bound to 127.0.0.1 only.
set -euo pipefail

NAME="agentshield-registry"
PORT="${AGENTSHIELD_REGISTRY_PORT:-5001}"
IMAGE="registry:2"

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not reachable. Start Docker Desktop and try again." >&2
  exit 1
fi

state=$(docker container inspect --format '{{.State.Running}}' "$NAME" 2>/dev/null || echo "missing")
case "$state" in
  true)
    echo "Registry $NAME is already running."
    ;;
  false)
    echo "Starting the existing registry container $NAME..."
    docker start "$NAME" >/dev/null
    ;;
  *)
    if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
      echo "Port $PORT is already in use by another process. Free it or set AGENTSHIELD_REGISTRY_PORT." >&2
      exit 1
    fi
    echo "Starting $IMAGE as $NAME on 127.0.0.1:$PORT..."
    docker run -d --name "$NAME" --restart unless-stopped -p "127.0.0.1:$PORT:5000" "$IMAGE" >/dev/null
    ;;
esac

for _ in $(seq 1 15); do
  if curl -fsS "http://localhost:$PORT/v2/" >/dev/null 2>&1; then
    echo "Registry ready: localhost:$PORT (catalog: http://localhost:$PORT/v2/_catalog)"
    exit 0
  fi
  sleep 1
done
echo "The registry did not answer on http://localhost:$PORT/v2/ within 15 s. Check: docker logs $NAME" >&2
exit 1
