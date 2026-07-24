# Automated Deployment: GitHub Actions → your server

Continuous deployment for your **own fork** of JukeBot. Every push to `main` (or
a manual run from the **Actions** tab) SSHes into your server, syncs the code,
rebuilds the Docker image, and restarts the bot. The Discord token lives in
**GitHub Actions secrets** and is written to `config.json` on the server at
deploy time — it is never committed.

Works on **any SSH-accessible Linux server** — a DigitalOcean droplet (the
example here), any VPS, or a home server. All you need is Docker and SSH.

```
push to main ──► GitHub Actions ──native ssh (live logs)──► server
                                                             ├─ git reset --hard origin/main
                                                             └─ deploy/deploy.sh
                                                                 ├─ write config.json from secrets
                                                                 ├─ docker build  (discord-music-bot-node:<sha> + :latest)
                                                                 ├─ run.sh        (stop old → start new)
                                                                 └─ prune old images
```

No Lavalink/Java here — audio is handled in-process by `@discordjs/voice` +
`yt-dlp` + `ffmpeg-static`, so there's **no listening port** and nothing to
conflict with other services.

## Contents

1. [Running alongside the Python bot](#running-alongside-the-python-bot)
2. [Step 1 — Provision & bootstrap the server](#step-1--provision--bootstrap-the-server)
3. [Step 2 — SSH key for GitHub Actions](#step-2--ssh-key-for-github-actions)
4. [Step 3 — GitHub Actions secrets](#step-3--github-actions-secrets)
5. [Step 4 — Deploy](#step-4--deploy)
6. [Persistent playlists with Block Storage](#persistent-playlists-with-block-storage)
7. [Day-to-day operations](#day-to-day-operations)
8. [Troubleshooting](#troubleshooting)

---

## Running alongside the Python bot

This bot is designed to share a droplet with the Python
[Discord_Music_Bot](https://github.com/RobertAndion/Discord_Music_Bot) without
collisions — everything is namespaced separately:

| Resource | This bot (Node) | Python bot |
| --- | --- | --- |
| Deploy path | `/opt/musicbot-node` | `/opt/musicbot` |
| Docker image | `discord-music-bot-node` | `discord-music-bot` |
| Container name | `musicbot-node` | `musicbot` |
| Named volumes | `musicbot-node-playlists`, `musicbot-node-logs` | `musicbot-playlists`, … |
| Block-storage mount | `/mnt/musicbot-node-data` | `/mnt/musicbot-data` |
| Listening port | none | Lavalink on `2333` (localhost) |

They **share** the droplet's Docker install, the `deploy` user, and the swapfile
— all created idempotently by whichever bot's `setup-droplet.sh` runs first. Each
repo has its **own** GitHub Actions secrets (its own `DISCORD_TOKEN`, its own
`DEPLOY_PATH`). Use a **separate** block-storage volume per bot.

---

## Step 1 — Provision & bootstrap the server

`deploy/setup-droplet.sh` does the one-time setup and is **safe to re-run**. It
installs Docker, adds a 2 GB swapfile (so the build isn't OOM-killed on small
droplets), creates the `deploy` user, installs its SSH key, and clones the repo
to `/opt/musicbot-node`. On a droplet already running the Python bot, the shared
pieces are detected and skipped.

On the server as root:

```bash
curl -fsSL https://raw.githubusercontent.com/RobertAndion/DiscordMusicBot/main/deploy/setup-droplet.sh -o setup-droplet.sh
sudo bash setup-droplet.sh
```

Configurable via env vars: `REPO_URL`, `DEPLOY_USER` (`deploy`), `DEPLOY_PATH`
(`/opt/musicbot-node`), `AUTHORIZED_KEY`, `SWAP_SIZE` (`2G`, `0` to skip).

> **Private repo?** Add a read-only
> [deploy key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys)
> to the server and set `REPO_URL` to the `git@github.com:...` SSH URL.

---

## Step 2 — SSH key for GitHub Actions

GitHub Actions logs in **as the `deploy` user**, so the public key matching your
`SSH_PRIVATE_KEY` secret must be in `deploy`'s `authorized_keys`.

If the Python bot already set this droplet up, **the same key already works** —
reuse it. Otherwise generate a dedicated keypair (never a personal one):

```bash
ssh-keygen -t ed25519 -C "github-actions-jukebot" -f gha_deploy -N ""
```

- Public half → `AUTHORIZED_KEY="$(cat gha_deploy.pub)"` when running the
  bootstrap, or append it to `~deploy/.ssh/authorized_keys` by hand (`700` on
  `~/.ssh`, `600` on the file).
- Private half → the `SSH_PRIVATE_KEY` secret below.

Test: `ssh -i gha_deploy deploy@<server-ip>` logs in without a password.

---

## Step 3 — GitHub Actions secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Required | Example / notes |
| --- | --- | --- |
| `DROPLET_HOST` | ✅ | Server public IP |
| `DROPLET_USER` | ✅ | `deploy` |
| `SSH_PRIVATE_KEY` | ✅ | Full contents of the `gha_deploy` private key |
| `DISCORD_TOKEN` | ✅ | Your Discord bot token |
| `BOT_PREFIX` | ⬜ | Command prefix; defaults to `!` |
| `DEPLOY_PATH` | ⬜ | Defaults to `/opt/musicbot-node` |
| `DROPLET_SSH_PORT` | ⬜ | Defaults to `22` |
| `MUSICBOT_DATA_DIR` | ⬜ | Block-storage mount point for playlists/logs (see below). Empty = Docker named volumes. |

> Sharing a droplet with the Python bot? `DROPLET_HOST`, `DROPLET_USER`, and
> `SSH_PRIVATE_KEY` are the same values in both repos; `DISCORD_TOKEN`,
> `DEPLOY_PATH`, and `MUSICBOT_DATA_DIR` are per-bot.

---

## Step 4 — Deploy

- **Automatic:** merge/push to `main`.
- **Manual:** Actions tab → *Deploy to DigitalOcean* → **Run workflow**.

The deploy step uses **native `ssh -tt`**, so the remote output — `git` sync,
`docker build --progress=plain`, container restart — **streams live** into the
Actions log. On the server:

```bash
docker ps --filter name=musicbot-node
docker logs -f musicbot-node
```

Each build is tagged `discord-music-bot-node:<git-sha>` and `:latest`; older tags
are pruned automatically after a successful deploy.

---

## Persistent playlists with Block Storage

By default, playlists and logs live in **Docker named volumes**
(`musicbot-node-playlists`, `musicbot-node-logs`). They survive deploys but sit
on the droplet's boot disk — lost if the droplet is rebuilt. A **DigitalOcean
Block Storage volume** puts them on a separate, durable disk. This is opt-in:
nothing changes until you set `MUSICBOT_DATA_DIR`.

1. **Create & attach** a Volume in the DO panel (use a *different* volume than the
   Python bot's). 1 GB is plenty.
2. **Prepare it** (once, as root) — formats a blank volume only, mounts it at
   `/mnt/musicbot-node-data` via `/etc/fstab`, and creates `Playlists`/`Logs`
   owned by the container user (uid 999):
   ```bash
   ls -l /dev/disk/by-id/ | grep -i DO_Volume
   DEVICE=/dev/disk/by-id/scsi-0DO_Volume_<name> bash /opt/musicbot-node/deploy/setup-volume.sh
   ```
3. **Confirm it stays mounted** (this is what auto-remounts it on every boot):
   ```bash
   umount /mnt/musicbot-node-data && mount -a    # no error = fstab is valid
   findmnt /mnt/musicbot-node-data
   ls -ln /mnt/musicbot-node-data                # Playlists/Logs owned by 999 999
   ```
4. **Migrate existing playlists** (only if you already had some):
   ```bash
   docker run --rm -v musicbot-node-playlists:/src -v /mnt/musicbot-node-data/Playlists:/dst \
     alpine sh -c 'cp -a /src/. /dst/ && chown -R 999:999 /dst'
   ```
5. **Switch deploys onto it** — set the secret `MUSICBOT_DATA_DIR = /mnt/musicbot-node-data`
   and redeploy. Confirm:
   ```bash
   docker inspect musicbot-node --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}'
   # expect: /mnt/musicbot-node-data/Playlists -> /MusicBot/Playlists
   ```

To roll back, remove the secret and redeploy.

> ⚠️ **Mount-before-Docker matters.** If the volume isn't mounted at deploy time,
> Docker silently bind-mounts the empty boot-disk directory instead and playlists
> look "gone." `UUID` + `nofail` + the `mount -a` check above prevent this.

---

## Day-to-day operations

```bash
docker logs -f musicbot-node          # logs
docker restart musicbot-node          # restart
docker ps --filter name=musicbot-node # status
```

- **Rotate the token / change the prefix** — update `DISCORD_TOKEN` / `BOT_PREFIX`
  in GitHub, then re-run the workflow; `config.json` is rewritten every deploy.
- **Deploy a different branch** — edit `DEPLOY_BRANCH` and `on.push.branches` in
  `.github/workflows/deploy.yml`.

The workflow's `git reset --hard` discards uncommitted changes on the server
(except `config.json`). Git is the source of truth; playlists live in the volume.

---

## Troubleshooting

**Deploy ends with `Process exited with status 255` mid-`docker build`.**
The SSH session was OOM-killed — ensure swap exists (`free -h`, `swapon --show`).
Re-run `setup-droplet.sh` (it adds 2 GB) or add a swapfile manually.

**Build fails compiling `@discordjs/opus`.**
It's a native module needing `python3` + `build-essential` — both are in the
Dockerfile's build stage. If you changed the base image, keep those.

**Bot starts then exits — `Cannot find module './config.json'` or bad token.**
`config.json` is written by `deploy/deploy.sh` from the `DISCORD_TOKEN` secret and
bind-mounted read-only. Check the secret is set, and that
`docker inspect musicbot-node` shows `config.json` mounted.

**`no space left on device`.** Clear old build cruft: `docker system prune -af`.

**Logs only appear at the end, not live.** Make sure the workflow on `main` uses
the native `ssh -tt` step (this repo's version does).

**First deploy is slow.** Normal — it compiles native deps and downloads the
yt-dlp/ffmpeg binaries into the image.
