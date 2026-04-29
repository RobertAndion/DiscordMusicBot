const ytdltie = require('./commands/ytdltie.js');
const commandHandler = require('./commands/commandHandler.js');
const { Client, GatewayIntentBits } = require('discord.js');
const { prefix, token } = require('./config.json');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.GuildMembers,
    ]
});

const MusicHandler = new ytdltie(client);
client.login(token);

client.on('clientReady', () => {
    console.log('Bot is live.');
});

client.on('messageCreate', async message => {
    if (message.author.bot || !message.content.startsWith(prefix)) return;
    const args = message.content.slice(prefix.length).split(/ +/);
    const command = args.shift().toLowerCase();
    commandHandler(command, args, message, MusicHandler);
});
