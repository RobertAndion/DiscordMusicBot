const ytdltie = require('./commands/ytdltie.js');
const Discord = require('discord.js');
const fs = require('fs');
const today = new Date();
const {
    prefix,
    token,
} = require('./config.json');
/*
Main file for running the bot, contains the command handler, ytdltie object (MusicHandler) and error handling.
*/
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
    commandHandler(command,args,message)
});

async function commandHandler(command,args,message){
    try {
        if(command == 'queue' || command == 'q'){
            if(args.length > 0)
                await MusicHandler.viewQueue(message,args[0])
            else
                await MusicHandler.viewQueue(message)
        }
        else if(command == 'play' || command == 'p') { // make this into a function later with more error and permission handling.
            if(args.length == 0) return message.channel.send("No song name given.");
            try{
                song = await MusicHandler.getSong(args.join(' '))
                if(!song)
                    message.channel.send("No song with that name/link was found.")
                else
                    await MusicHandler.play(message,song)
            } catch(err) {
                message.channel.send("Video unavailable.")
                throw err;
            }
        }else if(command == 'skip') {
            if(args.length > 0)
                await MusicHandler.skip(message, args[0]) // Given skip amount
            else
                await MusicHandler.skip(message) // Default to 1
        } else if(command == 'shuffle'){
            await MusicHandler.shuffle(message);
        } else if(command == 'pause' || command == 'ps'){
            await MusicHandler.pause(message);
        } else if (command == 'unpause' || command == 'up'){
            await MusicHandler.unpause(message);
        } else if(command == 'help' || command == 'h') {
            await MusicHandler.help(message);
        } else {
            message.channel.send("Erm.. what?");
        }
    } catch(err) {
        var date = today.getFullYear() + '-' + (today.getMonth() + 1) + '-' + today.getDate();
        var time = today.getHours() + ':' + today.getMinutes() + ':' + today.getSeconds();
        var serverInfo = "Author: " + message.author + " " + "Server: " + message.guild.id;
        var authorArgs = "Command: " + command + " " + ' Args: ' + args;
        var error = '\n' + date + " " + time + ' ' + serverInfo + '\n' + authorArgs + '\n' + err + '\n';

        //the following code is ensuring the Logs directory exists
        const dirName = './Logs';
        if (!fs.existsSync(dirName)) { //check if the directory exists 
            fs.mkdir(dirName, (err) => { //creates directory
                if (err) { //Error only thrown if directory already exists-> shouldn't happen
                    throw err;
                }
            });
        }
        
        fs.appendFile('./Logs/' + date + '.txt', error, function (err2) {
            if (err2) console.log("Log failed to log..." + err2);
            else console.log("Error handled and saved to log at: " + date + " " + time);
        });
    }
}
