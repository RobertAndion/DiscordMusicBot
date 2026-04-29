# JukeBot — Discord Music Bot

A Discord music bot built with Node.js that plays YouTube audio in voice channels with a full queue and playlist system.

---

## Requirements

- **Node.js 18 or later** (20 LTS recommended)
- **npm**
- A Discord bot account (see setup below)

---

## Discord Developer Portal Setup

Before running the bot you need a Discord application and bot account. Follow these steps exactly — skipping the intent toggles is the most common reason the bot stops responding.

### 1. Create the Application

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Click **New Application**, give it a name, and confirm.

### 2. Create the Bot Account

1. In the left sidebar click **Bot**.
2. Click **Add Bot** → **Yes, do it!**
3. Under **Token**, click **Reset Token** and copy it — you will paste this into `config.json`. Keep it secret; anyone with this token controls the bot.

### 3. Enable Privileged Gateway Intents

Still on the **Bot** page, scroll down to **Privileged Gateway Intents** and enable **all three**:

| Intent | Why it's needed |
|---|---|
| **Presence Intent** | Recommended on; harmless to leave on |
| **Server Members Intent** | Required for member-related checks |
| **Message Content Intent** | **Critical** — without this the bot cannot read any command you type and will silently ignore all messages |

Click **Save Changes**.

### 4. Invite the Bot to Your Server

1. In the left sidebar click **OAuth2** → **URL Generator**.
2. Under **Scopes** check `bot`.
3. Under **Bot Permissions** check:
   - `Read Messages / View Channels`
   - `Send Messages`
   - `Embed Links`
   - `Attach Files`
   - `Read Message History`
   - `Connect`
   - `Speak`
4. Copy the generated URL at the bottom and open it in your browser to invite the bot to your server.

---

## Installation

```bash
# Clone or download the repository
git clone https://github.com/RobertAndion/DiscordMusicBotNode.git
cd DiscordMusicBotNode

# Install dependencies
npm install
```

### Configuration

Copy the sample config and add your bot token:

```bash
cp config.sample.json config.json
```

Open `config.json` and fill in your token:

```json
{
    "prefix": "!",
    "token": "YOUR_BOT_TOKEN_HERE"
}
```

The prefix can be changed to any character or string you prefer.

---

## Running the Bot

```bash
node index.js
```

Or using the npm script:

```bash
npm start
```

You should see `Bot is live.` in the terminal when it connects.

---

## Commands

The default prefix is `!`. Aliases are listed in parentheses.

### Music

| Command | Alias | Description |
|---|---|---|
| `!play <song name or URL>` | `!p` | Join your voice channel and play a song. Adds to queue if already playing. |
| `!skip [amount]` | — | Skip the current song, or skip multiple songs with an optional number. |
| `!queue [page]` | `!q` | Show the current queue. Use a page number for long queues. |
| `!pause` | `!ps` | Pause the current song. |
| `!unpause` | `!up` | Resume a paused song. |
| `!shuffle` | — | Shuffle all songs in the queue (keeps the current song in place). |
| `!clear` | `!c` | Clear the entire queue and stop playback. |
| `!help` | `!h` | Show the command list in chat. |
| `!help playlist` | — | Show playlist command list in chat. |

### Playlists

Playlists are stored per user. Each user's playlists are saved in the `Playlists/` folder.

| Command | Alias | Description |
|---|---|---|
| `!createplaylist <name>` | `!cpl` | Create a new playlist with the currently playing song. |
| `!addtoplaylist <name>` | `!atp` | Add the currently playing song to an existing playlist. |
| `!addqueuetoplaylist <name>` | `!aqtp` | Add the entire current queue to a playlist. |
| `!playfromlist <name>` | `!pl`, `!playl` | Load a playlist into the queue and start playing. |
| `!listplaylists [page]` | `!lpl` | List all your playlists. |
| `!viewplaylist <name>` | `!vpl` | View the songs inside a playlist. |
| `!deletefromlist <#> <name>` | `!dfl`, `!delsong` | Remove song number `#` from a playlist. |
| `!deleteplaylist <name>` | `!dl`, `!deletelist` | Delete an entire playlist. |
| `!renameplaylist <old> <new>` | `!rl`, `!rename` | Rename a playlist. |
| `!getplaylist <name>` | `!gl`, `!getlist` | DM you the playlist as a `.json` file for sharing or backup. |
| `!uploadplaylist` | `!uplist` | Attach a `.json` playlist file to the message to import it. |
| `!backupplaylists` | `!bups` | DM you a zip of all playlist files (Docker use — see below). |

---

## Docker

The `Docker/` folder contains a Dockerfile for running the bot in a container.

### Folder Structure

On your server, create a build directory with this layout before building:

```
musicbot-build/
├── Dockerfile              ← copy from Docker/Dockerfile in this repo
├── Bot/
│   ├── index.js
│   ├── package.json
│   ├── package-lock.json
│   ├── config.json         ← create from config.sample.json (add your token)
│   ├── commands/
│   │   ├── ytdltie.js
│   │   └── commandHandler.js
│   ├── Playlists/          ← leave empty or restore from a previous backup
│   └── Logs/               ← leave empty
```

Files you do **not** need to copy:
- `node_modules/` — created by `npm install` inside the container during build
- `startup.sh` — obsolete; the Dockerfile's `CMD` starts the bot directly
- `Docker/musicbotstart.sh` — goes on the **host**, not inside `Bot/`
- `tests/` — not needed at runtime

### Build

From inside `musicbot-build/` (where the Dockerfile sits):

```bash
docker build -t musicbot .
```

### First Run

Run once to create and start the named container:

```bash
docker run -d --name musicbot -m 2G --cpuset-cpus 0-1 --security-opt=no-new-privileges musicbot
```

- `-d` runs it detached (in the background) — the bot starts automatically via the `CMD` in the Dockerfile
- `--name musicbot` names the container so the startup script can find it
- `-m` and `--cpuset-cpus` are optional resource limits; `--security-opt=no-new-privileges` is recommended

### Stop the Bot

```bash
docker stop musicbot
```

### Start After a Manual Stop

```bash
docker container start musicbot
```

### Automatic Startup on Host Reboot

`musicbotstart.sh` restarts the named container after a system reboot. Place it on the host and add to the host's crontab (`crontab -e`):

```
@reboot sh /path/to/musicbotstart.sh
```

The script waits 30 seconds for Docker to be ready before issuing the start command. This only works after the **First Run** above has been done at least once (so the named container exists).

### Updating the Bot in Docker

You cannot update files inside a running container. Use `!backupplaylists` to receive a zip of your playlist files before rebuilding. Place the `.json` files back in the `Playlists/` folder before building the new image so they are included automatically.
