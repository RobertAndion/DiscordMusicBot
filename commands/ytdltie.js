const fetch = require('node-fetch');
const ytdlp = require('yt-dlp-exec');
const ffmpegPath = require('ffmpeg-static');
const fs = require('fs');
const AdmZip = require('adm-zip');
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    StreamType,
    getVoiceConnection,
} = require('@discordjs/voice');

module.exports = class ytdltie {
    constructor(client) {
        this.client = client;
        this.queue = new Map();
    }

    async getSong(songname) {
        const isUrl = /^https?:\/\/(www\.)?(youtube\.com\/watch|youtu\.be\/)/.test(songname);
        const info = await ytdlp(isUrl ? songname : `ytsearch1:${songname}`, {
            dumpSingleJson: true,
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: true,
        });
        if (!info || !info.title) return null;
        return { title: info.title, url: info.webpage_url, flag: false };
    }

    async play(message, song) {
        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) return message.channel.send("Please join a voice channel first.");
        const server_queue = this.queue.get(message.guild.id);
        if (!server_queue) {
            const queue_constructor = {
                voice_channel: voiceChannel,
                text_channel: message.channel,
                connection: null,
                player: null,
                songs: []
            };
            this.queue.set(message.guild.id, queue_constructor);
            queue_constructor.songs.push(song);

            try {
                const connection = joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: message.guild.id,
                    adapterCreator: message.guild.voiceAdapterCreator,
                });
                const player = createAudioPlayer();
                player.on('error', error => console.error('Audio player error:', error.message));
                connection.subscribe(player);
                queue_constructor.connection = connection;
                queue_constructor.player = player;
                await this.video_player(message.guild, queue_constructor.songs[0]);
                message.channel.send(`Now playing **${song.title}**`);
            } catch (err) {
                this.queue.delete(message.guild.id);
                console.log(err);
                return message.channel.send("Failed to connect and play.");
            }
        } else {
            if (server_queue.voice_channel.id != voiceChannel.id)
                return message.channel.send("Please join the same voice channel as me.");
            server_queue.songs.push(song);
            if (!song.flag)
                return message.channel.send(`**${song.title}** added to queue!`);
        }
    }

    async skip(message, amount = 1) {
        const voiceChannel = message.member.voice.channel;
        const song_queue = this.queue.get(message.guild.id);
        if (!song_queue) return message.channel.send("Nothing playing!");
        if (!voiceChannel || song_queue.voice_channel.id != voiceChannel.id)
            return message.channel.send("Please join the same voice channel as me.");
        if (isNaN(amount)) return message.channel.send("Please enter a valid integer (no decimals or characters).");
        if (amount <= 0) return message.channel.send("Please enter a valid skip amount. (>=1)");
        amount--;
        while (amount > 0) {
            song_queue.songs.shift();
            amount--;
        }
        try {
            song_queue.player.stop();
        } catch (err) {
            const connection = getVoiceConnection(message.guild.id);
            if (connection) connection.destroy();
            this.queue.delete(message.guild.id);
        }
    }

    async viewQueue(message, page = 1) {
        const song_queue = this.queue.get(message.guild.id);
        if (!song_queue) return message.channel.send("Nothing playing.");
        const songlist = song_queue.songs;
        const pages = [];
        let current = "";
        for (let i = 0; i < songlist.length; i++) {
            if (i == 0) {
                current += "**Now Playing:** " + songlist[i]['title'] + '\n';
            } else if (i % 10 == 0) {
                pages.push(current);
                current = i + ": " + songlist[i]["title"] + '\n';
            } else {
                current += i + ": " + songlist[i]["title"] + '\n';
            }
        }
        if (current.length > 0) pages.push(current);

        let pageSafe = Math.max(1, Math.min(page, pages.length));

        const embed = new EmbedBuilder()
            .setTitle("Queue")
            .setDescription(pages[pageSafe - 1])
            .setFooter({ text: "Page: " + pageSafe + "/" + pages.length });
        message.channel.send({ embeds: [embed] });
    }

    async shuffle(message) {
        const voiceChannel = message.member.voice.channel;
        const server_queue = this.queue.get(message.guild.id);
        if (!server_queue) return message.channel.send("Nothing is currently playing.");
        if (!voiceChannel || server_queue.voice_channel.id != voiceChannel.id)
            return message.channel.send("Please join a voice channel first.");
        const songlist = server_queue.songs;
        for (let i = 1; i < songlist.length; i++) {
            let randIndex = Math.floor((Math.random() * (songlist.length - 1)) + 1);
            [songlist[i], songlist[randIndex]] = [songlist[randIndex], songlist[i]];
        }
        message.channel.send("Shuffle Complete.");
    }

    async pause(message) {
        const voiceChannel = message.member.voice.channel;
        const server_queue = this.queue.get(message.guild.id);
        if (!server_queue) return message.channel.send("Nothing is currently playing.");
        if (!voiceChannel || server_queue.voice_channel.id != voiceChannel.id)
            return message.channel.send("Please join a voice channel first.");
        if (server_queue.player.state.status === AudioPlayerStatus.Paused)
            return message.channel.send("Song is already paused!");
        server_queue.player.pause();
        message.channel.send("⏸️ Paused the song!");
    }

    async unpause(message) {
        const voiceChannel = message.member.voice.channel;
        const server_queue = this.queue.get(message.guild.id);
        if (!server_queue) return message.channel.send("Nothing is currently playing.");
        if (!voiceChannel || server_queue.voice_channel.id != voiceChannel.id)
            return message.channel.send("Please join a voice channel first.");
        if (server_queue.player.state.status !== AudioPlayerStatus.Paused)
            return message.channel.send("No music is currently paused.");
        server_queue.player.unpause();
        message.channel.send("▶️ Unpaused the song!");
    }

    async create_playlist(message, playlistname) {
        const server_queue = this.queue.get(message.guild.id);
        if (!server_queue) return message.channel.send("Nothing is currently playing.");
        const dirName = './Playlists/';
        fs.readFile(dirName + message.author.id + '.json', 'utf8', (err, data) => {
            var playlist = err ? {} : JSON.parse(data);
            playlist[playlistname] = [server_queue.songs[0].title];
            this.writePlaylist(dirName, message, playlist);
            message.channel.send("Successfully created " + playlistname + "!");
        });
    }

    async add_to_playlist(message, playlistname) {
        const server_queue = this.queue.get(message.guild.id);
        if (!server_queue) return message.channel.send("Nothing is currently playing.");
        const dirName = './Playlists/';
        fs.readFile(dirName + message.author.id + '.json', 'utf8', (err, data) => {
            if (err) return message.channel.send("You do not have any playlists, create one with createplaylist");
            var playlists = JSON.parse(data);
            try {
                playlists[playlistname].push(server_queue.songs[0].title);
                this.writePlaylist(dirName, message, playlists);
                return message.channel.send(server_queue.songs[0].title + " was added to " + playlistname + "!");
            } catch {
                return message.channel.send("Playlist: " + playlistname + " does not exist.");
            }
        });
    }

    async list_playlists(message, page = 1) {
        const dirName = './Playlists/';
        fs.readFile(dirName + message.author.id + '.json', 'utf8', (err, data) => {
            if (err) return message.channel.send("You do not have any playlists, create one with createplaylist");
            var playlists = JSON.parse(data);
            const pnames = Object.keys(playlists);
            if (pnames.length == 0)
                return message.channel.send("You do not have any playlists, create one with createplaylist");

            const pages = [];
            let current = "";
            for (let i = 0; i < pnames.length; i++) {
                if (i % 10 == 0 && i != 0) {
                    pages.push(current);
                    current = (i + 1) + ": " + pnames[i] + '\n';
                } else {
                    current += (i + 1) + ": " + pnames[i] + '\n';
                }
            }
            if (current.length > 0) pages.push(current);

            let pageSafe = Math.max(1, Math.min(page, pages.length));

            const embed = new EmbedBuilder()
                .setTitle(message.author.username + "'s Playlists")
                .setDescription(pages[pageSafe - 1])
                .setFooter({ text: "Page: " + pageSafe + "/" + pages.length });
            message.channel.send({ embeds: [embed] });
        });
    }

    async view_playlist(message, playlist) {
        const dirName = './Playlists/';
        fs.readFile(dirName + message.author.id + '.json', 'utf8', (err, data) => {
            if (err) return message.channel.send("You do not have any playlists, create one with createplaylist");
            var playlists = JSON.parse(data);
            try {
                let songs = playlists[playlist];
                let current = "";
                let i = 0;
                for (; i < songs.length; i++) {
                    if (i % 10 == 0 && i != 0) {
                        const embed = new EmbedBuilder()
                            .setDescription(current)
                            .setFooter({ text: "JukeBot 🎶" });
                        if (i == 10) embed.setTitle(playlist);
                        message.channel.send({ embeds: [embed] });
                        current = (i + 1) + ": " + songs[i] + '\n';
                    } else {
                        current += (i + 1) + ": " + songs[i] + '\n';
                    }
                }
                if (current.length > 0) {
                    const embed = new EmbedBuilder()
                        .setDescription(current)
                        .setFooter({ text: "JukeBot 🎶" });
                    if (i < 10) embed.setTitle(playlist);
                    message.channel.send({ embeds: [embed] });
                }
            } catch (err) {
                return message.channel.send("Sorry you don't have a playlist named: " + playlist);
            }
        });
    }

    async play_from_list(message, playlist) {
        const dirName = './Playlists/';
        const myScope = this;
        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) return message.channel.send("Please join a voice channel first.");
        fs.readFile(dirName + message.author.id + '.json', 'utf8', async function (err, data) {
            if (err) return message.channel.send("You do not have any playlists, create one with createplaylist");
            var playlists = JSON.parse(data);
            try {
                let stringSongs = [...playlists[playlist]];
                let i = 0;
                while (stringSongs.length !== 0) {
                    let song = await myScope.getSong(stringSongs[i]);
                    if (song !== null) {
                        song.flag = true;
                        await myScope.play(message, song);
                        stringSongs.shift();
                        break;
                    }
                    i++;
                }
                const server_queue = myScope.queue.get(message.guild.id);
                for (i = 0; i < stringSongs.length; i++) {
                    let song = await myScope.getSong(stringSongs[i]);
                    if (song !== null)
                        server_queue.songs.push(song);
                    else
                        message.channel.send("Failed to find song for: " + stringSongs[i]);
                }
                message.channel.send(playlist + ' was added successfully');
            } catch (err) {
                return message.channel.send("Sorry you don't have a playlist named: " + playlist);
            }
        });
    }

    async del_from_list(message, songnumber, playlistname) {
        const dirName = './Playlists/';
        const myScope = this;
        fs.readFile(dirName + message.author.id + '.json', 'utf8', async function (err, data) {
            if (err) return message.channel.send("You do not have any playlists, create one with createplaylist");
            var playlists = JSON.parse(data);
            try {
                let stringSongs = playlists[playlistname];
                if (stringSongs.length < songnumber) return message.channel.send("This playlist is not that long!");
                var removedSong = stringSongs.splice(songnumber - 1, 1);
                playlists[playlistname] = stringSongs;
                myScope.writePlaylist(dirName, message, playlists);
                return message.channel.send(removedSong + " was removed from " + playlistname + "!");
            } catch (err) {
                return message.channel.send("Sorry you don't have a playlist named: " + playlistname);
            }
        });
    }

    async delete_playlist(message, playlistname) {
        const dirName = './Playlists/';
        const myScope = this;
        fs.readFile(dirName + message.author.id + '.json', 'utf8', async function (err, data) {
            if (err) return message.channel.send("You do not have any playlists, create one with createplaylist");
            var playlists = JSON.parse(data);
            try {
                delete playlists[playlistname];
                myScope.writePlaylist(dirName, message, playlists);
                return message.channel.send(playlistname + " was removed from your playlists!");
            } catch (err) {
                return message.channel.send("Sorry you don't have a playlist named: " + playlistname);
            }
        });
    }

    async rename_playlist(message, oldplaylistname, newplaylistname) {
        const dirName = './Playlists/';
        const myScope = this;
        fs.readFile(dirName + message.author.id + '.json', 'utf8', async function (err, data) {
            if (err) return message.channel.send("You do not have any playlists, create one with createplaylist");
            var playlists = JSON.parse(data);
            try {
                if (!playlists[oldplaylistname])
                    return message.channel.send("Sorry you don't have a playlist named: " + oldplaylistname);
                if (playlists[newplaylistname])
                    return message.channel.send(newplaylistname + " already exists! Rename to something that doesn't exist to not lose that playlist.");
                playlists[newplaylistname] = playlists[oldplaylistname];
                delete playlists[oldplaylistname];
                myScope.writePlaylist(dirName, message, playlists);
                return message.channel.send(oldplaylistname + " playlist has been renamed to " + newplaylistname);
            } catch (err) {
                return message.channel.send("Sorry you don't have a playlist named: " + oldplaylistname);
            }
        });
    }

    async add_queue_to_playlist(message, playlistname) {
        const dirName = './Playlists/';
        const myScope = this;
        fs.readFile(dirName + message.author.id + '.json', 'utf8', async function (err, data) {
            if (err) return message.channel.send("You do not have any playlists, create one with createplaylist");
            var playlists = JSON.parse(data);
            try {
                const song_queue = myScope.queue.get(message.guild.id);
                if (!song_queue) return message.channel.send("Nothing playing.");
                for (const song of song_queue.songs) {
                    playlists[playlistname].push(song.title);
                }
                myScope.writePlaylist(dirName, message, playlists);
                message.channel.send("Successfully added the queue to playlist " + playlistname);
            } catch (err) {
                console.log(err);
                return message.channel.send("Sorry you don't have a playlist named: " + playlistname);
            }
        });
    }

    writePlaylist(dirName, message, playlist) {
        fs.writeFile(dirName + message.author.id + '.json', JSON.stringify(playlist, null, 4), function (err) {
            if (err) throw new Error("Failed to write to playlist, Error: " + err);
        });
    }

    async video_player(guild, song) {
        const song_queue = this.queue.get(guild.id);
        if (!song) {
            const connection = getVoiceConnection(guild.id);
            if (connection) connection.destroy();
            this.queue.delete(guild.id);
            return;
        }
        const proc = ytdlp.exec(song.url, {
            output: '-',
            quiet: true,
            format: 'bestaudio/best',
            noCheckCertificates: true,
            ffmpegLocation: ffmpegPath,
        });
        const resource = createAudioResource(proc.stdout, { inputType: StreamType.Arbitrary });
        song_queue.player.play(resource);
        song_queue.player.once(AudioPlayerStatus.Idle, () => {
            song_queue.songs.shift();
            this.video_player(guild, song_queue.songs[0]).catch(err => {
                console.error('video_player error:', err.message);
                const connection = getVoiceConnection(guild.id);
                if (connection) connection.destroy();
                this.queue.delete(guild.id);
            });
        });
    }

    async get_playlist(message, playlistname) {
        const dirName = './Playlists/';
        fs.readFile(dirName + message.author.id + '.json', 'utf8', async function (err, data) {
            if (err) return message.channel.send("You do not have any playlists, create one with createplaylist");
            var playlists = JSON.parse(data);
            try {
                var playlist = playlists[playlistname];
                const attachment = new AttachmentBuilder(
                    Buffer.from(JSON.stringify(playlist, null, 4)),
                    { name: playlistname + '.json' }
                );
                message.author.send({ files: [attachment] });
            } catch (err) {
                console.log(err);
                return message.channel.send("Sorry you don't have a playlist named: " + playlistname);
            }
        });
    }

    async backup_playlists(message) {
        const dirName = './Playlists/';
        const permittedIds = Array.from(this.client.users.cache.keys());
        if (!permittedIds.includes(message.author.id)) return;
        const file = new AdmZip();
        file.addLocalFolder(dirName);
        file.writeZip('backup.zip', (err) => { if (err) console.log(err); });
        message.author.send({ files: ['./backup.zip'] });
    }

    async upload_playlist(message) {
        const dirName = './Playlists/';
        if (message.attachments.size === 0)
            return message.channel.send("Please attach a file to use this command");
        const messageContent = message.attachments.first();
        if (!messageContent.name.includes('.json'))
            return message.channel.send("Please only upload json files");

        const playListNameFromFile = messageContent.name.replace('.json', '');

        fetch(messageContent.url)
            .then(res => res.json())
            .then(data => {
                if (!data.length > 0)
                    return message.channel.send("The file you are sending does not have any songs.");
                fs.readFile(dirName + message.author.id + '.json', 'utf8', (err, dataOfAuthor) => {
                    var playlists = err ? {} : JSON.parse(dataOfAuthor);
                    playlists[playListNameFromFile] = data;
                    this.writePlaylist(dirName, message, playlists);
                    message.channel.send("Successfully created " + playListNameFromFile + "!");
                });
            });
    }

    async help(message, args) {
        if (args == "playlist") {
            const playlistEmbed = new EmbedBuilder()
                .setTitle("JukeBot Playlist Commands")
                .setDescription("! tells me you're talking to me :)")
                .addFields(
                    { name: "!createplaylist (playlistname) or cpl", value: "Creates a playlist, with currently playing song" },
                    { name: "!playfromlist (playlistname) or playl or pl", value: "Add a playlist to the current queue or start playing" },
                    { name: "!addtoplaylist (playlistname) or atp", value: "Adds currently playing song to playlist" },
                    { name: "!addqueuetoplaylist (playlistname) or aqtp", value: "Adds entire current queue to playlist" },
                    { name: "!listplaylists or lpl", value: "List all of your playlists" },
                    { name: "!viewplaylist (playlistname) or vpl", value: "View the songs in a playlist" },
                    { name: "!deletefromlist (song number) (playlistname) or delsong or dfl", value: "Deletes song # from playlist x" },
                    { name: "!deleteplaylist (playlistname) or deletelist or dl", value: "Deletes an entire playlist" },
                    { name: "!renameplaylist (oldplaylist) (newplaylist) or rename or rl", value: "Renames a playlist." },
                    { name: "!getplaylist (playlistname) or getlist or gl", value: "Sends given playlist content to user for sharing" },
                    { name: "!uploadplaylist or uplist", value: "Upload a file and give this command as the upload comment" },
                )
                .setFooter({ text: "JukeBot 🎶" });
            message.channel.send({ embeds: [playlistEmbed] });
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle("JukeBot Regular Commands")
            .setDescription("! tells me you're talking to me :)")
            .addFields(
                { name: "!play (song name) or !p", value: "Play a song. Extra songs will be added to a queue", inline: false },
                { name: "!skip (OPTIONAL number of songs)", value: "Skips the next song, or an optional amount of songs" },
                { name: "!queue or !q", value: "Displays the current songs in queue" },
                { name: "!clear or !c", value: "Clears the entire current queue" },
                { name: "!shuffle", value: "Shuffles the current queue" },
                { name: "!pause or !ps", value: "Pauses the current song" },
                { name: "!unpause or !up", value: "Unpauses the current song" },
                { name: "!help", value: "Call me again! :)" },
                { name: "!help playlist", value: "More information on playlists" },
            )
            .setFooter({ text: "JukeBot 🎶" });
        message.channel.send({ embeds: [embed] });
    }
};
