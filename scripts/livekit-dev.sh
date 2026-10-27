#!/usr/bin/env bash
# Starts LiveKit for development. Uses infra/bin/livekit-server if present,
# otherwise the Docker image (compose profile "media").
set -euo pipefail
cd "$(dirname "$0")/.."
CFG=infra/livekit/livekit.dev.yaml
[ -f "$CFG" ] || { echo "Execute 'pnpm setup' primeiro"; exit 1; }
if [ -x infra/bin/livekit-server ]; then
  exec infra/bin/livekit-server --config "$CFG"
else
  exec docker compose -f infra/docker-compose.dev.yml --env-file .env --profile media up livekit
fi
