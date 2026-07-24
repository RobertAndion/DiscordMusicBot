#!/bin/bash
set -euo pipefail

# Persistent data (playlists + logs):
#   MUSICBOT_DATA_DIR set   -> bind-mount subdirs of that path, e.g. a mounted
#                              DigitalOcean Block Storage volume. Create and chown
#                              them first with deploy/setup-volume.sh (owned by the
#                              container user, uid 999).
#   MUSICBOT_DATA_DIR unset -> Docker named volumes (default).
if [[ -n "${MUSICBOT_DATA_DIR:-}" ]]; then
    PLAYLISTS_MOUNT="${MUSICBOT_DATA_DIR}/Playlists"
    LOGS_MOUNT="${MUSICBOT_DATA_DIR}/Logs"
else
    PLAYLISTS_MOUNT="musicbot-node-playlists"
    LOGS_MOUNT="musicbot-node-logs"
fi

# config.json is written by deploy/deploy.sh in the repo root and mounted read-only.
docker run -d \
  --name musicbot-node \
  --restart unless-stopped \
  --init \
  --memory=1g \
  --cpus=1 \
  --pids-limit=200 \
  --log-driver=json-file \
  --log-opt max-size=10m \
  --log-opt max-file=3 \
  --cap-drop=ALL \
  --security-opt no-new-privileges \
  -v "$(pwd)/config.json:/MusicBot/config.json:ro" \
  -v "${PLAYLISTS_MOUNT}:/MusicBot/Playlists" \
  -v "${LOGS_MOUNT}:/MusicBot/Logs" \
  discord-music-bot-node:latest
