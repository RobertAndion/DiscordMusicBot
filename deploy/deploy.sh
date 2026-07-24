#!/usr/bin/env bash
#
# Runs ON the server. Invoked by the GitHub Actions deploy workflow after the
# repo has been synced to the target commit. Writes config.json from environment
# variables (populated from GitHub secrets), builds the image, and restarts the
# container via run.sh.
#
# Required env: DISCORD_TOKEN
# Optional env: BOT_PREFIX (defaults to "!"), MUSICBOT_DATA_DIR
#
set -euo pipefail

# Always operate from the repo root (this script lives in deploy/).
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${DISCORD_TOKEN:-}" ]]; then
    echo "ERROR: DISCORD_TOKEN is not set." >&2
    exit 1
fi

echo "==> Writing config.json"
# 0644 so the container user (uid 999) can read the bind-mounted file.
umask 022
cat > config.json <<EOF
{
    "prefix": "${BOT_PREFIX:-!}",
    "token": "${DISCORD_TOKEN}"
}
EOF

IMAGE_NAME="discord-music-bot-node"
GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo latest)"

echo "==> Building image (${IMAGE_NAME}:${GIT_SHA})"
# --progress=plain gives line-oriented output that streams cleanly over SSH.
docker build -f Docker/Dockerfile --progress=plain \
    -t "${IMAGE_NAME}:${GIT_SHA}" \
    -t "${IMAGE_NAME}:latest" \
    .

echo "==> Restarting container"
docker stop musicbot-node 2>/dev/null || true
docker rm musicbot-node 2>/dev/null || true
./run.sh

echo "==> Cleaning up old ${IMAGE_NAME} images"
# Remove every tag of this image except the two we just built.
docker images "${IMAGE_NAME}" --format '{{.Repository}}:{{.Tag}}' | while read -r ref; do
    case "$ref" in
        "${IMAGE_NAME}:latest"|"${IMAGE_NAME}:${GIT_SHA}") ;;   # keep current build
        *) echo "    removing ${ref}"; docker rmi -f "$ref" >/dev/null 2>&1 || true ;;
    esac
done
docker image prune -f >/dev/null 2>&1 || true

echo "==> Deploy complete"
docker ps --filter "name=musicbot-node" --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"
