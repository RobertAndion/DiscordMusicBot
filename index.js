const ytdltie = require('./commands/ytdltie.js');
const Discord = require('discord.js');
const fs = require('fs');
const today = new Date();
const {
    prefix,
    token,
} = require('./config.json');
const { createContext } = require('vm');

const client = new Discord.Client();
const MusicHandler = new ytdltie(Discord, client);
client.login(token);

client.on('ready', () => {
    console.log('Bot is live.');
});

client.on('message', async message => {
    if (message.author.bot || !message.content.startsWith(prefix)) return;
    const args = message.content.slice(prefix.length).split(/ +/);
    const command = args.shift().toLowerCase();
    commandHandler(command, args, message)
});

async function commandHandler(command, args, message) {
    try {
        if (command == 'queue' || command == 'q') {
            if (args.length > 0)
                await MusicHandler.viewQueue(message, args[0])
            else
                await MusicHandler.viewQueue(message)
        }
        else if (command == 'play' || command == 'p') {
            if (args.length == 0) return message.channel.send("No song name given.");
            try {
                song = await MusicHandler.getSong(args.join(' '))
                if (!song)
                    message.channel.send("No song with that name/link was found.")
                else
                    await MusicHandler.play(message, song)
            } catch (err) {
                message.channel.send("Video unavailable.")
                throw err;
            }
        } else if (command == 'skip') {
            if (args.length > 0)
                await MusicHandler.skip(message, args[0])
            else
                await MusicHandler.skip(message)
        } else if (command == 'shuffle') {
            await MusicHandler.shuffle(message);
        } else if (command == 'pause' || command == 'ps') {
            await MusicHandler.pause(message);
        } else if (command == 'unpause' || command == 'up') {
            await MusicHandler.unpause(message);
        } else if (command == 'clear' || command == 'c') {
            await MusicHandler.skip(message, 10000);
        } else if (command == 'createplaylist' || command == 'cpl') {
            if (args.length > 0)
                await MusicHandler.create_playlist(message, args.join(' '));
            else
                message.channel.send("Please enter a playlist name");
        } else if (command == 'addtoplaylist' || command == 'atp') {
            if (args.length > 0)
                await MusicHandler.add_to_playlist(message, args.join(' '));
            else
                message.channel.send("Please enter a playlist name");
        } else if (command == 'listplaylists' || command == 'lpl') {
            if (args.length > 0)
                await MusicHandler.list_playlists(message, args[0]);
            else
                await MusicHandler.list_playlists(message);
        } else if (command == 'viewplaylist' || command == 'vpl') {
            if (args.length > 0)
                await MusicHandler.view_playlist(message, args.join(' '));
            else
                return message.channel.send("Please specify the name of the playlist.");
        } else if (command == 'playfromlist' || command == 'playl' || command == 'pl') {
            if (args.length > 0)
                await MusicHandler.play_from_list(message, args.join(' '));
            else
                return message.channel.send("Please specify the name of the playlist.");
        } else if (command == 'deletefromlist' || command == 'delsong' || command == 'dfl') {
            if (args.length > 1) {
                if (!isNaN(args[0]) && args[0] > 0)
                    await MusicHandler.del_from_list(message, args[0], args[1]);
                else
                    return message.channel.send("Please specify command in the format: dfl #songnumber playlistname. The song number must be > 0.");
            }
            else
                return message.channel.send("Please specify the song number and name of the playlist");
        } else if (command == 'deleteplaylist' || command == 'deletelist' || command == 'dl') {
            if (args.length > 0)
                await MusicHandler.delete_playlist(message, args.join(' '));
            else
                return message.channel.send("Please specify the name of the playlist to delete.");
        } else if (command == 'renameplaylist' || command == 'rename' || command == 'rl') {
            if (args.length > 1) {
                await MusicHandler.rename_playlist(message, args[0], args[1]);
            }
            else
                return message.channel.send("Please specify both the old play list name, followed by the new name.");
        } else if (command == 'addqueuetoplaylist' || command == 'aqtp') {
            if (args.length > 0)
                await MusicHandler.add_queue_to_playlist(message, args.join(' '));
            else
                return message.channel.send("Please specify the name of the playlist to add the queue to.");
        }
        else if (command == 'help' || command == 'h') {
            await MusicHandler.help(message, args.join(' '));
        } else {
            message.channel.send("Erm.. what?");
        }

    } catch (err) {
        var date = today.getFullYear() + '-' + (today.getMonth() + 1) + '-' + today.getDate();
        var time = today.getHours() + ':' + today.getMinutes() + ':' + today.getSeconds();
        var serverInfo = "Author: " + message.author + " " + "Server: " + message.guild.id;
        var authorArgs = "Command: " + command + " " + ' Args: ' + args;
        var error = '\n' + date + " " + time + ' ' + serverInfo + '\n' + authorArgs + '\n' + err + '\n';

        const dirName = './Logs';
        if (!fs.existsSync(dirName)) {
            fs.mkdir(dirName, (err) => {
                if (err) {
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
