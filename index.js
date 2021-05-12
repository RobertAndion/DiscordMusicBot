/*
packages:
discord.js
@discordjs/opus
ffmpeg-static
yt-search
ytdl-core

*/
const ytdltie = require('./commands/ytdltie.js');
const Discord = require('discord.js');
const {
    prefix,
    token,
} = require('./config.json');
const client = new Discord.Client();
const MusicHandler = new ytdltie(Discord,client);
client.login(token);

client.on('ready', () =>{
    console.log('Bot is live.');
});

client.on('message', async message => { // Main event handler for all messages.
    if(message.author.bot || !message.content.startsWith(prefix)) return;
    const args = message.content.slice(prefix.length).split(/ +/);
    const command = args.shift().toLowerCase();


    /*if(command == 'play') {
        client.commands.get('play').execute(message, command, args, client, Discord)
    } else if (command == 'derp') {*/
    if(command == 'queue'){
        if(args.length > 0)
            await MusicHandler.viewQueue(message,args[0])
        else
            await MusicHandler.viewQueue(message)
    }
    else if(command == 'play') { // make this into a function later with more error and permission handling.
        if(args.length == 0) return message.channel.send("No song name given.");
        song = await MusicHandler.getSong(args.join(' '))
        if(!song)
            message.channel.send("failed to play the song.")
        else
        await MusicHandler.play(message,song)
    }else if(command == 'skip') {
        if(args.length > 0)
            MusicHandler.skip(message, args[0])
        else
            MusicHandler.skip(message)
    }
   /* } else if (comand = 'leave') {

    }*/

});