# ---------- BUILD STAGE ----------
# Compiles native deps (@discordjs/opus needs node-gyp → python3 + build tools)
# and fetches the yt-dlp / ffmpeg binaries into node_modules.
FROM node:20-bookworm-slim AS builder

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        python3 \
        build-essential \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /MusicBot
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---------- RUNTIME STAGE ----------
# python3 is required at runtime: yt-dlp-exec ships the yt-dlp zipapp, which runs
# under Python. ffmpeg comes from the ffmpeg-static npm package (in node_modules).
FROM node:20-bookworm-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        python3 \
        ca-certificates \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /MusicBot

COPY --from=builder /MusicBot/node_modules ./node_modules
COPY . .

RUN mkdir -p Playlists Logs && \
    groupadd -g 999 basicuser && useradd -r -u 999 -g basicuser basicuser && \
    chown -R basicuser:basicuser /MusicBot

USER basicuser

# config.json is bind-mounted at runtime (see run.sh); it is never baked in.
CMD ["node", "index.js"]
