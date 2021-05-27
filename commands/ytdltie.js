const ytdl = require('ytdl-core');
const ytSearch = require('yt-search');
const fs = require('fs');
const { title } = require('process');
/*
Start of an object wrapper for the ytdl class and a queue system for a nodeJS music bot.
This is a core file for the bot but also acts as an interface to the ytdl code and simplifies it in
the main index page.
*/


/*ffmpeg_options = { // Keep bot from dying if it cuts out, could pass this in play, hard coded for now.
    'options': '-vn',
    "before_options": "-reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5"
}*/

module.exports = class ytdltie {
    constructor(Discord, client){
        this.client = client;
        this.Discord = Discord;
        this.queue = new Map(); // Main queue for the entire scope of the bot
    }

    async getSong(songname) { // Takes a string song name or string link
        if(ytdl.validateURL(songname)) { // This will return a null if a song is not found, other wise a song object.
            const song_info = await ytdl.getInfo(songname);
            return { title: song_info.videoDetails.title, url: song_info.videoDetails.video_url, flag: false };
        } else {
            const videoFinder = async (query) => {
                const videoResult = await ytSearch(query);
                return (videoResult.videos.length > 1) ? videoResult.videos[0] : null; // Return first song or null
            }
            const video = await videoFinder(songname);
            if(video) // More info can be returned from here if desired.
                return { title: video.title, url: video.url, flag: false};
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
                message.channel.send(`Now playing **${song.title}**`); // Customizable
            } catch (err) {
                this.queue.delete(message.guild.id);
                console.log(err)
                return message.channel.send("Failed to connect and play.");
                //throw new Error("Connection failed, or invalid queue.")
            }
        } else {
            if(server_queue.voice_channel != voiceChannel) return message.channel.send("Please join the same voice channel as me.");
            server_queue.songs.push(song);
            if(!song.flag)
                return message.channel.send(`**${song.title}** added to queue!`); // Customizable
        }        
    }

    async skip(message,amount = 1) { // Needs tons of error checking
        const voiceChannel = message.member.voice.channel;
        const song_queue = this.queue.get(message.guild.id);
        if(!song_queue) return message.channel.send("Nothing playing!"); // Check for empty queue first.
        if(song_queue.voice_channel != voiceChannel || !voiceChannel) return message.channel.send("Please join the same voice channel as me.");
        if(isNaN(amount)) return message.channel.send("Please enter a valid integer (no decimals or characters).");
        if(amount <= 0) return message.channel.send("Please enter a valid skip amount. (>=1)");
        amount--;
        while(amount > 0){
            song_queue.songs.shift();
            amount--;
        }
        try{
            song_queue.connection.dispatcher.end();
        }
        catch(err) { // Clear the buffer if we have trouble ending the queue.
            song_queue.voice_channel.leave();
            this.queue.delete(message.guild.id);
            return;
        }
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
                current = current + "**Now Playing:** " + songlist[i]['title'] + '\n';
            } else if(i % 10 == 0){
                pages.push(current)
                current = "";
                current += i + ": " +songlist[i]["title"] + '\n';
            } else {
                current += i + ": " +songlist[i]["title"] + '\n';
            }
        }
        if(current.length > 0)
            pages.push(current);
        
        // Create the embed package to send.
        let pageSafe = 0;
        if (page >= 1 && page <= pages.length)
            pageSafe = page;
        else if (page < 1)
            pageSafe = 1;
        else if (page > pages.length)
            pageSafe = pages.length;

        const embed = new this.Discord.MessageEmbed();
            embed.setTitle("Queue");
            embed.setDescription(pages[pageSafe - 1]);
            embed.setFooter("Page: " + pageSafe + "/" + pages.length);
        message.channel.send(embed);
        
    }

    async shuffle(message) {
        const voiceChannel = message.member.voice.channel;
        const server_queue = this.queue.get(message.guild.id);
        if(!server_queue) return message.channel.send("Nothing is currently playing.");
        if(!voiceChannel || server_queue.voice_channel != voiceChannel) return message.channel.send("Please join a voice channel first.");
        const songlist = server_queue.songs;
        for(let i = 1; i < songlist.length; i++) {
            let temp = songlist[i];
            let randIndex = Math.floor((Math.random() * (songlist.length - 1)) + 1);
            songlist[i] = songlist[randIndex];
            songlist[randIndex] = temp;
        }
        message.channel.send("Shuffle Complete.");
    }

    async pause(message) {
        const voiceChannel = message.member.voice.channel;
        const server_queue = this.queue.get(message.guild.id);
        if(!server_queue) return message.channel.send("Nothing is currently playing.");
        if(!voiceChannel || server_queue.voice_channel != voiceChannel) return message.channel.send("Please join a voice channel first.");
        if(server_queue.connection.dispatcher.pausedSince) return message.channel.send("Song is already paused!"); // Handle double pause

        server_queue.connection.dispatcher.pause();
        message.channel.send("⏸️ Paused the song!");
    }

    async unpause(message) {
        const voiceChannel = message.member.voice.channel;
        const server_queue = this.queue.get(message.guild.id);
        if(!server_queue) return message.channel.send("Nothing is currently playing.");
        if(!voiceChannel || server_queue.voice_channel != voiceChannel) return message.channel.send("Please join a voice channel first.");
        if(!server_queue.connection.dispatcher.pausedSince) return message.channel.send("No music is currently paused"); // Handle call on unpaused.
        // This is a weird but required work around for the unpause situation on Node version 12 (supposed to be fixed on 14 but we do not want to migrate)
        server_queue.connection.dispatcher.pause(true);
        server_queue.connection.dispatcher.resume();
        server_queue.connection.dispatcher.resume();

        message.channel.send("▶️ Unpaused the song!");
    }

    async clear(message) {
        //Clears the current queue entirely
        const song_queue = this.queue.get(message.guild.id);
        if(!song_queue) return message.channel.send("Nothing is currently playing.");
        const voiceChannel = message.member.voice.channel;
        
        if(!voiceChannel || song_queue.voice_channel != voiceChannel) return message.channel.send("Please join a voice channel first");

        const songlist = song_queue.songs; //songs in queue
        songlist.splice(0, songlist.length);
        try{
            song_queue.connection.dispatcher.end();
            message.channel.send("Queue is cleared.");
        }
        catch(err) { // Clear the buffer if we have trouble ending the queue.
            song_queue.voice_channel.leave();
            this.queue.delete(message.guild.id);
            return;
        }
    }

    async create_playlist(message,playlistname) { // For now lets save by title only and worry about optimization later.
        const server_queue = this.queue.get(message.guild.id);
        if(!server_queue) return message.channel.send("Nothing is currently playing.");
        const dirName = './Playlists/';
        fs.readFile(dirName + message.author + '.json','utf8',(err,data) => { // See if we can declare playlist outside of here to resolve the scope issue.(if we had it outside of here then modified it it wouldnt work.)
            if(err) {
                var playlist = new Map();
                playlist[playlistname] = [server_queue.songs[0].title];
                this.writePlaylist(dirName,message,playlist);
                message.channel.send("Successfully created " + playlistname +"!");
            } else { // existing playlist file
                var playlist = JSON.parse(data);
                playlist[playlistname] = [server_queue.songs[0].title];
                this.writePlaylist(dirName,message,playlist);
                message.channel.send("Successfully created " + playlistname +"!");
            }
        }); 
    }

    async add_to_playlist(message,playlistname) { // For now lets save by title only and worry about optimization later. WORK IN PROGRESS !!!
        const server_queue = this.queue.get(message.guild.id);
        if(!server_queue) return message.channel.send("Nothing is currently playing.");
        const dirName = './Playlists/';
        fs.readFile(dirName + message.author + '.json','utf8',(err,data) => { // See if we can declare playlist outside of here to resolve the scope issue.
            if(err) {
                return message.channel.send("You do not have any playlists, create one with createplaylist");
            } else { // existing playlist file
                var playlists = JSON.parse(data);
                try{
                    var playlist = playlists[playlistname];
                    playlist.push(server_queue.songs[0].title);
                    playlists[playlistname] = playlist;
                    this.writePlaylist(dirName,message,playlists);
                    return message.channel.send(server_queue.songs[0].title + " was added to " + playlistname + "!");
                } catch{
                    return message.channel.send("Playlist: " + playlistname +" does not exist.");
                }
            }
        }); 
    }

    async list_playlists(message, page = 1) { // For now lets save by title only and worry about optimization later. WORK IN PROGRESS !!!
        const dirName = './Playlists/';
        fs.readFile(dirName + message.author + '.json','utf8',(err,data) => { // See if we can declare playlist outside of here to resolve the scope issue.
            if(err) {
                return message.channel.send("You do not have any playlists, create one with createplaylist");
            } else { // existing playlist file
                var playlists = JSON.parse(data);
                const pages = [];
                let current = "";
                let pnames = Object.keys(playlists);
                if(pnames.length == 0)
                    return message.channel.send("You do not have any playlists, create one with createplaylist");
                for(let i = 0; i < pnames.length; i++){
                    
                    if(i % 10 == 0 && i != 0){
                        pages.push(current)
                        current = "";
                        current += (i + 1) + ": " +pnames[i] + '\n';
                    } else {
                        current += (i + 1) + ": " +pnames[i] + '\n';
                    }
                }
                if(current.length > 0)
                    pages.push(current);
                
                // Create the embed package to send.
                let pageSafe = 0;
                if (page >= 1 && page <= pages.length)
                    pageSafe = page;
                else if (page < 1)
                    pageSafe = 1;
                else if (page > pages.length)
                    pageSafe = pages.length;
        
                const embed = new this.Discord.MessageEmbed();
                    const name = message.member.user.tag.split('#');
                    embed.setTitle(name[0] + "'s Playlists");
                    embed.setDescription(pages[pageSafe - 1]);
                    embed.setFooter("Page: " + pageSafe + "/" + pages.length);
                message.channel.send(embed);


               /* for(const key in playlists) { // add wrapping system like in queue later. Maybe build paged embed function that returns an embed.. for now reuse code.
                    out += key + '\n';
                }*/
                //return message.channel.send(out);
            }
        }); 
    }

    async view_playlist(message, playlist) { // For now lets save by title only and worry about optimization later. WORK IN PROGRESS !!!
        const dirName = './Playlists/';
        fs.readFile(dirName + message.author + '.json','utf8',(err,data) => { // See if we can declare playlist outside of here to resolve the scope issue.
            if(err) {
                return message.channel.send("You do not have any playlists, create one with createplaylist");
            } else { // existing playlist file
                var playlists = JSON.parse(data);
                try {
                    let songs = playlists[playlist];
                    let current = "";
                    let i = 0; // Changed scope to outer so that we can access it in the final if
                    for(; i < songs.length; i++){
                        if(i % 10 == 0 && i != 0){
                            // Create the embed package to send.
                            const embed = new this.Discord.MessageEmbed();
                                const name = message.member.user.tag.split('#');
                                if(i == 10)
                                    embed.setTitle(playlist);
                                embed.setDescription(current);
                                embed.setFooter("JukeBot 🎶");
                            message.channel.send(embed);
                            current = "";
                            current += (i + 1) + ": " +songs[i] + '\n';
                        } else {
                            current += (i + 1) + ": " +songs[i] + '\n';
                        }
                    }
                    if(current.length > 0){ // Final page flush
                        // Create the embed package to send.
                        const embed = new this.Discord.MessageEmbed();
                            const name = message.member.user.tag.split('#');
                            if(i < 10)
                                embed.setTitle(playlist);
                            embed.setDescription(current);
                            embed.setFooter("JukeBot 🎶");
                        message.channel.send(embed);
                    }
                } catch (err) {
                    return message.channel.send("Sorry you don't have a playlist named: " + playlist);
                }
            }
        }); 
    }

    async play_from_list(message, playlist) { // For now lets save by title only and worry about optimization later. WORK IN PROGRESS !!!
        const dirName = './Playlists/';
        const myScope = this;
        const voiceChannel = message.member.voice.channel;
        if(!voiceChannel) return message.channel.send("Please join a voice channel first.");
        fs.readFile(dirName + message.author + '.json','utf8',async function(err,data) { // See if we can declare playlist outside of here to resolve the scope issue. (if we had it outside of here then modified it it wouldnt work.)
            if(err) {
                return message.channel.send("You do not have any playlists, create one with createplaylist");
            } else { // existing playlist file
                var playlists = JSON.parse(data);
                try {
                    let stringSongs = playlists[playlist]; // psongs = playlist songs, not queue songs.
                    message.channel.send("Adding playlist to queue now. Please be patient for larger playlists.");
                    let psongs = []; // Generate an array of song objects
                    for(let i = 0; i < stringSongs.length; i++){
                        let song = await myScope.getSong(stringSongs[i])
                        if(i == 0 && song != null){
                            song.flag = true;
                            await myScope.play(message,song);
                            continue;
                        }
                        if(song != null)
                            psongs.push(song)
                        else 
                            message.channel.send("Failed to find song for: " + stringSongs[i]);
                    }
                    const server_queue = myScope.queue.get(message.guild.id);
                    if(!server_queue){ // More complicated part.
                        const queue_constructor = {
                            voice_channel: voiceChannel,
                            text_channel: message.channel,
                            connection: null,
                            songs: []
                        }
                        myScope.queue.set(message.guild.id, queue_constructor);
                        queue_constructor.songs.push(psongs[0]); // Eventually worry about case where there is no songs, outer try catch will handle for now.
            
                        try {
                            const connection = await voiceChannel.join() 
                            queue_constructor.connection = connection;
                            myScope.video_player(message.guild, queue_constructor.songs[0]);
                            const server_queue_inner = myScope.queue.get(message.guild.id);
                            psongs.shift();
                            server_queue_inner.songs.push(...psongs); // after playing the first song add the rest to queue
                            return message.channel.send(`**${playlist}** now playing!`); // Customizable
                        } catch (err) {
                            myScope.queue.delete(message.guild.id);
                            return message.channel.send("Failed to connect and play.");
                        }
                    } else {
                        if(server_queue.voice_channel != voiceChannel) return message.channel.send("Please join the same voice channel as me.");
                        server_queue.songs.push(...psongs);
                        return message.channel.send(`**${playlist}** added to queue!`); // Customizable
                    }                
                } catch (err) {
                    return message.channel.send("Sorry you don't have a playlist named: " + playlist);
                }
            }
        }); 
    }

    async del_from_list(message, songnumber, playlistname) {
        const dirName = './Playlists/';
        const myScope = this;
        fs.readFile(dirName + message.author + '.json','utf8',async function(err,data) { // See if we can declare playlist outside of here to resolve the scope issue. (if we had it outside of here then modified it it wouldnt work.)
            if(err) 
                return message.channel.send("You do not have any playlists, create one with createplaylist");
            else {
                var playlists = JSON.parse(data); //parse user's data file
                try {
                    let stringSongs = playlists[playlistname];
                    if(stringSongs.length < songnumber) return message.channel.send("This playlist is not that long!"); //prevents out of bounds
                    var removedSong = stringSongs.splice(songnumber-1, 1); //TODO: unsure if this is the most effective way of doing this
                    playlists[playlistname] = stringSongs;
                    myScope.writePlaylist(dirName,message,playlists);
                    return message.channel.send(removedSong + " was removed from " + playlistname + "!");
                } catch (err) {
                    return message.channel.send("Sorry you don't have a playlist named: " + playlistname);
                }
            }
        });
    }

    async delete_playlist(message, playlistname) {
        const dirName = './Playlists/';
        const myScope = this;
        fs.readFile(dirName + message.author + '.json','utf8',async function(err,data) { // See if we can declare playlist outside of here to resolve the scope issue. (if we had it outside of here then modified it it wouldnt work.)
            if(err) 
                return message.channel.send("You do not have any playlists, create one with createplaylist");
            else {
                var playlists = JSON.parse(data); //parse user's data file
                try {
                    delete playlists[playlistname]
                    myScope.writePlaylist(dirName,message,playlists);
                    return message.channel.send(playlistname + " was removed from from your playlists!");
                } catch (err) {
                    return message.channel.send("Sorry you don't have a playlist named: " + playlistname);
                }
            }
        });
    }

    async rename_playlist(message, oldplaylistname, newplaylistname) {
        //Potential todo error check: if old and new playlistname are the same
        const dirName = './Playlists/';
        const myScope = this;
        fs.readFile(dirName + message.author + '.json','utf8',async function(err,data) { // See if we can declare playlist outside of here to resolve the scope issue. (if we had it outside of here then modified it it wouldnt work.)
            if(err) 
                return message.channel.send("You do not have any playlists, create one with createplaylist");
            else {
                var playlists = JSON.parse(data); //parse user's data file
                try {
                    //Error check: if newplaylistname exists already, return error
                    let newStringSongs = playlists[newplaylistname];
                    if(newStringSongs)
                        return message.channel.send(newplaylistname + " already exists! Rename to something that doesn't exist to not lose that playlist.");
                    let stringSongs = playlists[oldplaylistname];
                    delete playlists[oldplaylistname]
                    playlists[newplaylistname] = stringSongs;
                    //push in a loop
                    myScope.writePlaylist(dirName,message,playlists);
                    return message.channel.send(oldplaylistname + " playlist has been renamed to " + newplaylistname);
                } catch (err) {

                    return message.channel.send("Sorry you don't have a playlist named: " + oldplaylistname);
                }
            }
        });
    }

    //only skeleton created
    async add_queue_to_playlist(message, playlistname) {
        //Adds the current queue to the specific playlist
        const dirName = './Playlists/';
        const myScope = this;
        fs.readFile(dirName + message.author + '.json','utf8',async function(err,data) { 
            if(err) 
                return message.channel.send("You do not have any playlists, create one with createplaylist");
            else {
                var playlists = JSON.parse(data); //parse user's data file
                try {
                    var playlist = playlists[playlistname];
                    const song_queue = myScope.queue.get(message.guild.id);
                    if(!song_queue) return message.channel.send("Nothing playing."); 
                    const songlist = song_queue.songs; //songs in queue

                    for(let i = 0; i < songlist.length; i++){ //loops through every song in queue- including now playing (can change to index 1)
                        playlist.push(songlist[i]["title"]); 
                    }
                    playlists[playlistname] = playlist;
                    myScope.writePlaylist(dirName,message,playlists); //rewrite file
                    //after writing, give feedback
                    message.channel.send("Successfully added the queue to playlist " + playlistname);
                } catch (err) {
                    console.log(err);
                    return message.channel.send("Sorry you don't have a playlist named: " + playlistname);
                }
            }
        });
    }
    
    async writePlaylist(dirName,message,playlist) { // Helper function to write out to json
        fs.writeFile(dirName + message.author + '.json', JSON.stringify(playlist, null, 4), function (err) { // Write the map to a JSON file.
            if (err) throw new Error("Failed to write to playlist, Error: " + err);
        });
    } // Could have this return bool and check it. If bool is false we know we failed, optional.

    async video_player(guild, song)  { // Helper/main music loop
        const song_queue = this.queue.get(guild.id);
        if(!song) { 
            song_queue.voice_channel.leave();
            this.queue.delete(guild.id);
            return;
        }
        const stream = ytdl(song.url, {filter: 'audioonly',options: '-vn', before_options: "-reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5", highWaterMark: 1<<25, maxReconnect: 10});
        // highWaterMark is in bytes, 32MB to load up front(Excessive but effective?), maxReconnect tells it to try 10 times on failure. before_options also tell it to try and reconnect.
        // Each song gets its own new Stream, so in theory 10 should be enough unless the song is super long.
        song_queue.connection.play(stream, {seek: 0, volume: 0.5})
        .on('finish', () => {
            song_queue.songs.shift();
            this.video_player(guild, song_queue.songs[0])
        })
      //  await song_queue.text_channel.send(`Now playing **${song.title}**`); // Removed here to avoid tons of prints.
    }

    async help(message, args) {
        //Should probably work from any voice channel- therefore I didn't include the check
        const playlistEmbed = new this.Discord.MessageEmbed();
            playlistEmbed.setTitle("JukeBot Playlist Commands");
            playlistEmbed.setDescription("! tells me you're talking to me :)");
            playlistEmbed.addField("!createplaylist (playlistname) or cpl", "Creates a playlist, with currently playing song");
            playlistEmbed.addField("!playfromlist (playlistname)  or playl or pl", "Add a playlist to the current queue or start playing");
            playlistEmbed.addField("!addtoplaylist (playlistname)  or atp", "Adds currently playing song to playlist")
            playlistEmbed.addField("!addqueuetoplaylist (playlistname) or aqtp", "Adds entire current queue to playlist");
            playlistEmbed.addField("!listplaylists or lpl", "List all of your playlists");
            playlistEmbed.addField("!viewplaylist (playlistname) or vpl", "View the songs in a playlist");
            playlistEmbed.addField("!deletefromlist (song number) (playlistname) or delsong or dfl", "Deletes song # from playlist x");
            playlistEmbed.addField("!deleteplaylist (playlistname) or deletelist or dl", "Deletes an entire playlist");
            playlistEmbed.addField("!renameplaylist (oldplaylist) (newplaylist) or !rename or !rl", "Renames a playlist.");
            playlistEmbed.setFooter("JukeBot 🎶")

        if(args == "playlist") {
            message.channel.send(playlistEmbed)
            return;
        }
        
        const embed = new this.Discord.MessageEmbed();
            embed.setTitle("JukeBot Regular Commands");
            embed.setDescription("! tells me you're talking to me :)");
            embed.addField("!play (song name) or !p", "Play a song. Extra songs will be added to a queue", false);
            embed.addField("!skip (OPTIONAL number of songs)", "Skips the next song, or an optional amount of songs");
            embed.addField("!queue or !q", "Displays the current songs in queue");
            embed.addField("!clear or !c", "Clears the entire current queue");
            embed.addField("!shuffle", "Shuffles the current queue");
            embed.addField("!pause or !ps", "Pauses the current song");
            embed.addField("!unpause or !up", "Unpauses the current song");
            embed.addField("!help", "Call me again! :)");
            embed.addField("!help playlist", "More information on playlists");
            embed.setFooter("JukeBot 🎶")


        
        message.channel.send(embed);
        message.channel.send(playlistEmbed)
    }
}



/* 
TODO:
make better error handling and logging
completely fix the disconnect issue - Seems to be fixed.
(See if we can get the ytdl errors to show in console so we can see exactly what failed)
Add pause and unpause - DONE!
add playlist features, play from playlist, create playlist, add to playlist, delete playlist, add queue to playlist etc.

**Idea from forum and its a good one:**
It's my understanding that the higher the highWaterMark, the more it downloads, so maybe just double the value. 
There might be a way to use the info return value to calculate the video size so when you go to download it with the highWaterMark, 
you can give an accurate value.
*/