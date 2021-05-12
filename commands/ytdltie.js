/*
Start of an object wrapper for the ytdl class
and a queue system for a nodeJS music bot.
*/

const ytdl = require('ytdl-core');
const ytSearch = require('yt-search');

module.exports = class ytdltie {
    constructor(Discord, client){
        this.client = client;
        this.Discord = Discord;
        this.queue = new Map(); // Main queue for the entire scope of the bot
    }

    async getSong(songname) { // Takes a string song name or string link
        if(ytdl.validateURL(songname)) { // This will return a null if a song is not found, other wise a song object.
            const song_info = await ytdl.getInfo(songname);
            return { title: song_info.videoDetails.title, url: song_info.videoDetails.video_url };
        } else {
            const videoFinder = async (query) => {
                const videoResult = await ytSearch(query);
                return (videoResult.videos.length > 1) ? videoResult.videos[0] : null; // Return first song or null
            }
            const video = await videoFinder(songname);
            if(video) // More info can be returned from here if desired.
                return { title: video.title, url: video.url};
            else
                return null;
        }
    }

    async play(message,song) { // Takes a message and a song object to play the song.
        const voiceChannel = message.member.voice.channel;
        if(!voiceChannel) return message.channel.send("Please join a voice channel first.");
        const server_queue = this.queue.get(message.guild.id);
        if(!server_queue){
            const queue_constructor = {
                voice_channel: voiceChannel,
                text_channel: message.channel,
                connection: null,
                songs: []
            }
            this.queue.set(message.guild.id, queue_constructor);
            queue_constructor.songs.push(song);

            try {
                const connection = await voiceChannel.join()
                queue_constructor.connection = connection;
                this.video_player(message.guild, queue_constructor.songs[0]);
            } catch (err) {
                this.queue.delete(message.guild.id);
                console.log(err)
                //throw new Error("Connection failed, or invalid queue.")
            }
        } else {
            if(server_queue.voice_channel != voiceChannel) return message.channel.send("Please join the same voice channel as me.");
            server_queue.songs.push(song);
            return message.channel.send(`**${song.title}** added to queue!`); // Customizable
        }        
    }

    async skip(message,amount = 1) { // Needs tons of error checking
        const voiceChannel = message.member.voice.channel;
        const song_queue = this.queue.get(message.guild.id);
        if(!song_queue) return message.channel.send("Nothing playing!"); // Check for empty queue first.
        if(song_queue.voice_channel != voiceChannel || !voiceChannel) return message.channel.send("Please join the same voice channel as me.");
        amount--;
        while(amount > 0){
            song_queue.songs.shift();
            amount--;
        }
        song_queue.connection.dispatcher.end();
    }

    async viewQueue(message, page = 1) {
        // Still need to adjust user page by -1 and handle too big and too small.
        const song_queue = this.queue.get(message.guild.id);
        if(!song_queue) return message.channel.send("Nothing playing.")
        const songlist = song_queue.songs;
        const pages = [];
        let current = "";
        for(let i = 0; i < songlist.length; i++){
            if(i == 0){
                current = current + "Now Playing: " + songlist[i]['title'] + '\n';
            } else if(i % 10 == 0){
                current = current + songlist[i]['title'] + '\n';
                pages.push(current)
                current = "";
            } else {
                current += songlist[i]["title"] + '\n';
            }
        }
        pages.push(current);
        // Create the embed package to send.
        const embed = new this.Discord.MessageEmbed();
            embed.setTitle("Queue");
            embed.setDescription(pages[page - 1]);
            embed.setFooter("Page: " + page + "/" + pages.length);
        message.channel.send(embed);
        
    }

    video_player = async(guild, song) => {
        const song_queue = this.queue.get(guild.id);
        if(!song) { // This will need some modification. A null song is an error. look into how big of one
            song_queue.voice_channel.leave();
            this.queue.delete(guild.id);
            return;
        }
        const stream = ytdl(song.url, {filter: 'audioonly'});
        song_queue.connection.play(stream, {seek: 0, volume: 0.5 })
        .on('finish', () => {
            song_queue.songs.shift();
            this.video_player(guild, song_queue.songs[0])
        })
        await song_queue.text_channel.send(`Now playing **${song.title}**`); // Customizable
    }

}
