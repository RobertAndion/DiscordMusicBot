'use strict';

// ---------------------------------------------------------------------------
// Module mocks (hoisted by Jest before any require)
// ---------------------------------------------------------------------------

jest.mock('@discordjs/voice', () => ({
    joinVoiceChannel: jest.fn(),
    createAudioPlayer: jest.fn(),
    createAudioResource: jest.fn(),
    getVoiceConnection: jest.fn(),
    AudioPlayerStatus: { Paused: 'paused', Idle: 'idle' },
    StreamType: { Arbitrary: 'arbitrary' },
}));

jest.mock('yt-dlp-exec', () => {
    const fn = jest.fn();
    fn.exec = jest.fn().mockReturnValue({ stdout: 'mockStream' });
    return fn;
});

jest.mock('ffmpeg-static', () => '/mock/ffmpeg');

jest.mock('fs', () => ({
    readFile: jest.fn(),
    writeFile: jest.fn(),
    existsSync: jest.fn(),
    mkdir: jest.fn(),
    appendFile: jest.fn(),
}));

jest.mock('adm-zip', () => jest.fn());

jest.mock('node-fetch', () => jest.fn());

jest.mock('discord.js', () => ({
    EmbedBuilder: jest.fn().mockImplementation(() => ({
        setTitle: jest.fn().mockReturnThis(),
        setDescription: jest.fn().mockReturnThis(),
        setFooter: jest.fn().mockReturnThis(),
        addFields: jest.fn().mockReturnThis(),
    })),
    AttachmentBuilder: jest.fn().mockImplementation(() => ({})),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks are set up)
// ---------------------------------------------------------------------------

const voice = require('@discordjs/voice');
const ytdlp = require('yt-dlp-exec');
const fs = require('fs');
const AdmZip = require('adm-zip');
const fetch = require('node-fetch');
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const ytdltie = require('../commands/ytdltie');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Flush multiple rounds of the microtask queue — needed for async callbacks
const flushPromises = async (rounds = 5) => {
    for (let i = 0; i < rounds; i++) {
        await new Promise(resolve => setImmediate(resolve));
    }
};

const mockVoiceChannel = { id: 'vc123' };
const mockOtherChannel = { id: 'vc456' };

const createMessage = (voiceChannel = null) => ({
    author: { id: 'user123', username: 'TestUser', send: jest.fn() },
    member: { voice: { channel: voiceChannel } },
    guild: { id: 'guild123', voiceAdapterCreator: jest.fn() },
    channel: { send: jest.fn() },
    attachments: { size: 0, first: jest.fn() },
});

const makeSong = (overrides = {}) => ({
    title: 'Test Song',
    url: 'https://www.youtube.com/watch?v=test123',
    flag: false,
    ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ytdltie', () => {
    let handler;
    let mockPlayer;
    let mockConnection;

    beforeEach(() => {
        jest.clearAllMocks();

        mockPlayer = {
            play: jest.fn(),
            pause: jest.fn(),
            unpause: jest.fn(),
            stop: jest.fn(),
            on: jest.fn(),
            once: jest.fn(),
            state: { status: 'idle' },
        };
        mockConnection = {
            subscribe: jest.fn(),
            destroy: jest.fn(),
        };

        voice.joinVoiceChannel.mockReturnValue(mockConnection);
        voice.createAudioPlayer.mockReturnValue(mockPlayer);
        voice.createAudioResource.mockReturnValue({});
        voice.getVoiceConnection.mockReturnValue(mockConnection);

        const userCache = new Map([['user123', {}]]);
        handler = new ytdltie({ users: { cache: userCache } });
    });

    // -----------------------------------------------------------------------
    describe('constructor', () => {
        it('initialises with an empty queue', () => {
            expect(handler.queue).toBeInstanceOf(Map);
            expect(handler.queue.size).toBe(0);
        });
    });

    // -----------------------------------------------------------------------
    describe('getSong', () => {
        it('passes a YouTube URL directly to yt-dlp', async () => {
            ytdlp.mockResolvedValue({ title: 'URL Song', webpage_url: 'https://www.youtube.com/watch?v=abc' });

            const result = await handler.getSong('https://www.youtube.com/watch?v=abc');

            expect(ytdlp).toHaveBeenCalledWith('https://www.youtube.com/watch?v=abc', expect.any(Object));
            expect(result).toEqual({ title: 'URL Song', url: 'https://www.youtube.com/watch?v=abc', flag: false });
        });

        it('prefixes a text query with ytsearch1: for yt-dlp', async () => {
            ytdlp.mockResolvedValue({ title: 'Found Song', webpage_url: 'https://www.youtube.com/watch?v=found' });

            const result = await handler.getSong('some query');

            expect(ytdlp).toHaveBeenCalledWith('ytsearch1:some query', expect.any(Object));
            expect(result).toEqual({ title: 'Found Song', url: 'https://www.youtube.com/watch?v=found', flag: false });
        });

        it('returns null when yt-dlp returns no info', async () => {
            ytdlp.mockResolvedValue(null);

            const result = await handler.getSong('nothing found');
            expect(result).toBeNull();
        });
    });

    // -----------------------------------------------------------------------
    describe('play', () => {
        it('sends error if user is not in a voice channel', async () => {
            const msg = createMessage(null);
            await handler.play(msg, makeSong());
            expect(msg.channel.send).toHaveBeenCalledWith('Please join a voice channel first.');
        });

        it('creates queue, joins channel, and starts playback for first song', async () => {
            const msg = createMessage(mockVoiceChannel);
            const song = makeSong();
            jest.spyOn(handler, 'video_player').mockResolvedValue();

            await handler.play(msg, song);

            expect(voice.joinVoiceChannel).toHaveBeenCalledWith({
                channelId: mockVoiceChannel.id,
                guildId: 'guild123',
                adapterCreator: msg.guild.voiceAdapterCreator,
            });
            expect(voice.createAudioPlayer).toHaveBeenCalled();
            expect(mockConnection.subscribe).toHaveBeenCalledWith(mockPlayer);
            expect(handler.video_player).toHaveBeenCalledWith(msg.guild, song);
            expect(msg.channel.send).toHaveBeenCalledWith(`Now playing **${song.title}**`);
        });

        it('cleans up queue and sends error when voice join throws', async () => {
            voice.joinVoiceChannel.mockImplementation(() => { throw new Error('no perms'); });
            const msg = createMessage(mockVoiceChannel);

            await handler.play(msg, makeSong());

            expect(handler.queue.has('guild123')).toBe(false);
            expect(msg.channel.send).toHaveBeenCalledWith('Failed to connect and play.');
        });

        it('adds song to existing queue in same channel', async () => {
            const msg = createMessage(mockVoiceChannel);
            const song = makeSong();
            handler.queue.set('guild123', {
                voice_channel: mockVoiceChannel,
                player: mockPlayer,
                songs: [makeSong({ title: 'First' })],
            });

            await handler.play(msg, song);

            const q = handler.queue.get('guild123');
            expect(q.songs).toHaveLength(2);
            expect(msg.channel.send).toHaveBeenCalledWith(`**${song.title}** added to queue!`);
        });

        it('rejects adding to queue from a different voice channel', async () => {
            const msg = createMessage(mockOtherChannel);
            handler.queue.set('guild123', {
                voice_channel: mockVoiceChannel,
                player: mockPlayer,
                songs: [],
            });

            await handler.play(msg, makeSong());
            expect(msg.channel.send).toHaveBeenCalledWith('Please join the same voice channel as me.');
        });

        it('does not send "added to queue" when song.flag is true', async () => {
            const msg = createMessage(mockVoiceChannel);
            handler.queue.set('guild123', {
                voice_channel: mockVoiceChannel,
                player: mockPlayer,
                songs: [makeSong()],
            });

            await handler.play(msg, makeSong({ flag: true }));
            expect(msg.channel.send).not.toHaveBeenCalled();
        });
    });

    // -----------------------------------------------------------------------
    describe('skip', () => {
        const setupQueue = (songs) => {
            handler.queue.set('guild123', {
                voice_channel: mockVoiceChannel,
                player: mockPlayer,
                songs,
            });
        };

        it('sends error when nothing is playing', async () => {
            const msg = createMessage(mockVoiceChannel);
            await handler.skip(msg);
            expect(msg.channel.send).toHaveBeenCalledWith('Nothing playing!');
        });

        it('sends error when user is not in a voice channel', async () => {
            setupQueue([makeSong()]);
            const msg = createMessage(null);
            await handler.skip(msg);
            expect(msg.channel.send).toHaveBeenCalledWith('Please join the same voice channel as me.');
        });

        it('sends error when user is in a different voice channel', async () => {
            setupQueue([makeSong()]);
            const msg = createMessage(mockOtherChannel);
            await handler.skip(msg);
            expect(msg.channel.send).toHaveBeenCalledWith('Please join the same voice channel as me.');
        });

        it('sends error for non-numeric skip amount', async () => {
            setupQueue([makeSong()]);
            const msg = createMessage(mockVoiceChannel);
            await handler.skip(msg, 'abc');
            expect(msg.channel.send).toHaveBeenCalledWith('Please enter a valid integer (no decimals or characters).');
        });

        it('sends error for skip amount <= 0', async () => {
            setupQueue([makeSong()]);
            const msg = createMessage(mockVoiceChannel);
            await handler.skip(msg, 0);
            expect(msg.channel.send).toHaveBeenCalledWith('Please enter a valid skip amount. (>=1)');
        });

        it('stops the player to skip one song', async () => {
            setupQueue([makeSong(), makeSong({ title: 'Next' })]);
            const msg = createMessage(mockVoiceChannel);
            await handler.skip(msg, 1);
            expect(mockPlayer.stop).toHaveBeenCalled();
        });

        it('removes N-1 songs before stopping when skipping N', async () => {
            const songs = [1, 2, 3, 4].map(n => makeSong({ title: `Song ${n}` }));
            setupQueue(songs);
            const msg = createMessage(mockVoiceChannel);
            await handler.skip(msg, 3);
            // skip(3) removes 2 songs from the queue via shift(), then player.stop() fires the idle
            // listener (tested separately) which removes the current song. Tests only the shift phase.
            expect(handler.queue.get('guild123').songs).toHaveLength(2);
            expect(mockPlayer.stop).toHaveBeenCalled();
        });

        it('destroys connection and clears queue when player.stop throws', async () => {
            mockPlayer.stop.mockImplementation(() => { throw new Error('boom'); });
            setupQueue([makeSong()]);
            const msg = createMessage(mockVoiceChannel);

            await handler.skip(msg);

            expect(voice.getVoiceConnection).toHaveBeenCalledWith('guild123');
            expect(mockConnection.destroy).toHaveBeenCalled();
            expect(handler.queue.has('guild123')).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    describe('viewQueue', () => {
        it('sends error when nothing is playing', async () => {
            const msg = createMessage();
            await handler.viewQueue(msg);
            expect(msg.channel.send).toHaveBeenCalledWith('Nothing playing.');
        });

        it('shows the currently playing song', async () => {
            handler.queue.set('guild123', {
                songs: [makeSong({ title: 'First Song' })],
            });
            const msg = createMessage();
            await handler.viewQueue(msg);

            const embed = msg.channel.send.mock.calls[0][0].embeds[0];
            expect(embed.setTitle).toHaveBeenCalledWith('Queue');
            expect(embed.setDescription).toHaveBeenCalledWith(
                expect.stringContaining('First Song')
            );
        });

        it('paginates when queue exceeds 10 songs', async () => {
            const songs = Array.from({ length: 15 }, (_, i) => makeSong({ title: `Song ${i + 1}` }));
            handler.queue.set('guild123', { songs });
            const msg = createMessage();

            await handler.viewQueue(msg, 2);

            const embed = msg.channel.send.mock.calls[0][0].embeds[0];
            expect(embed.setFooter).toHaveBeenCalledWith({ text: 'Page: 2/2' });
        });

        it('clamps page below 1 to page 1', async () => {
            handler.queue.set('guild123', { songs: [makeSong()] });
            const msg = createMessage();
            await handler.viewQueue(msg, -5);
            const embed = msg.channel.send.mock.calls[0][0].embeds[0];
            expect(embed.setFooter).toHaveBeenCalledWith({ text: 'Page: 1/1' });
        });

        it('clamps page above max to last page', async () => {
            handler.queue.set('guild123', { songs: [makeSong()] });
            const msg = createMessage();
            await handler.viewQueue(msg, 999);
            const embed = msg.channel.send.mock.calls[0][0].embeds[0];
            expect(embed.setFooter).toHaveBeenCalledWith({ text: 'Page: 1/1' });
        });
    });

    // -----------------------------------------------------------------------
    describe('shuffle', () => {
        it('sends error when nothing is playing', async () => {
            const msg = createMessage(mockVoiceChannel);
            await handler.shuffle(msg);
            expect(msg.channel.send).toHaveBeenCalledWith('Nothing is currently playing.');
        });

        it('sends error when user is not in a voice channel', async () => {
            handler.queue.set('guild123', { voice_channel: mockVoiceChannel, songs: [] });
            const msg = createMessage(null);
            await handler.shuffle(msg);
            expect(msg.channel.send).toHaveBeenCalledWith('Please join a voice channel first.');
        });

        it('sends error from a different channel', async () => {
            handler.queue.set('guild123', { voice_channel: mockVoiceChannel, songs: [] });
            const msg = createMessage(mockOtherChannel);
            await handler.shuffle(msg);
            expect(msg.channel.send).toHaveBeenCalledWith('Please join a voice channel first.');
        });

        it('shuffles songs and preserves the first song', async () => {
            const songs = [1, 2, 3, 4, 5].map(n => makeSong({ title: `Song ${n}` }));
            handler.queue.set('guild123', { voice_channel: mockVoiceChannel, songs });
            const msg = createMessage(mockVoiceChannel);

            await handler.shuffle(msg);

            const shuffled = handler.queue.get('guild123').songs;
            expect(shuffled[0].title).toBe('Song 1');
            expect(shuffled).toHaveLength(5);
            expect(msg.channel.send).toHaveBeenCalledWith('Shuffle Complete.');
        });
    });

    // -----------------------------------------------------------------------
    describe('pause', () => {
        it('sends error when nothing is playing', async () => {
            const msg = createMessage(mockVoiceChannel);
            await handler.pause(msg);
            expect(msg.channel.send).toHaveBeenCalledWith('Nothing is currently playing.');
        });

        it('sends error when user is not in the right channel', async () => {
            handler.queue.set('guild123', { voice_channel: mockVoiceChannel, player: mockPlayer });
            const msg = createMessage(null);
            await handler.pause(msg);
            expect(msg.channel.send).toHaveBeenCalledWith('Please join a voice channel first.');
        });

        it('sends error when already paused', async () => {
            mockPlayer.state.status = 'paused';
            handler.queue.set('guild123', { voice_channel: mockVoiceChannel, player: mockPlayer });
            const msg = createMessage(mockVoiceChannel);
            await handler.pause(msg);
            expect(msg.channel.send).toHaveBeenCalledWith('Song is already paused!');
        });

        it('pauses the player and confirms', async () => {
            mockPlayer.state.status = 'playing';
            handler.queue.set('guild123', { voice_channel: mockVoiceChannel, player: mockPlayer });
            const msg = createMessage(mockVoiceChannel);
            await handler.pause(msg);
            expect(mockPlayer.pause).toHaveBeenCalled();
            expect(msg.channel.send).toHaveBeenCalledWith('⏸️ Paused the song!');
        });
    });

    // -----------------------------------------------------------------------
    describe('unpause', () => {
        it('sends error when nothing is playing', async () => {
            const msg = createMessage(mockVoiceChannel);
            await handler.unpause(msg);
            expect(msg.channel.send).toHaveBeenCalledWith('Nothing is currently playing.');
        });

        it('sends error when user is not in the right channel', async () => {
            handler.queue.set('guild123', { voice_channel: mockVoiceChannel, player: mockPlayer });
            const msg = createMessage(null);
            await handler.unpause(msg);
            expect(msg.channel.send).toHaveBeenCalledWith('Please join a voice channel first.');
        });

        it('sends error when not paused', async () => {
            mockPlayer.state.status = 'idle';
            handler.queue.set('guild123', { voice_channel: mockVoiceChannel, player: mockPlayer });
            const msg = createMessage(mockVoiceChannel);
            await handler.unpause(msg);
            expect(msg.channel.send).toHaveBeenCalledWith('No music is currently paused.');
        });

        it('resumes the player and confirms', async () => {
            mockPlayer.state.status = 'paused';
            handler.queue.set('guild123', { voice_channel: mockVoiceChannel, player: mockPlayer });
            const msg = createMessage(mockVoiceChannel);
            await handler.unpause(msg);
            expect(mockPlayer.unpause).toHaveBeenCalled();
            expect(msg.channel.send).toHaveBeenCalledWith('▶️ Unpaused the song!');
        });
    });

    // -----------------------------------------------------------------------
    describe('create_playlist', () => {
        it('sends error when nothing is playing', async () => {
            const msg = createMessage();
            await handler.create_playlist(msg, 'mylist');
            expect(msg.channel.send).toHaveBeenCalledWith('Nothing is currently playing.');
        });

        it('creates a new playlist file when none exists', async () => {
            handler.queue.set('guild123', { songs: [makeSong({ title: 'Playing Song' })] });
            fs.readFile.mockImplementation((p, enc, cb) => cb(new Error('ENOENT')));
            fs.writeFile.mockImplementation((p, d, cb) => cb(null));
            const msg = createMessage();

            await handler.create_playlist(msg, 'mylist');

            expect(fs.writeFile).toHaveBeenCalledWith(
                './Playlists/user123.json',
                expect.stringContaining('Playing Song'),
                expect.any(Function)
            );
            expect(msg.channel.send).toHaveBeenCalledWith('Successfully created mylist!');
        });

        it('merges playlist into existing file', async () => {
            handler.queue.set('guild123', { songs: [makeSong({ title: 'New Song' })] });
            fs.readFile.mockImplementation((p, enc, cb) =>
                cb(null, JSON.stringify({ existing: ['Old Song'] }))
            );
            fs.writeFile.mockImplementation((p, d, cb) => cb(null));
            const msg = createMessage();

            await handler.create_playlist(msg, 'newlist');

            const written = JSON.parse(fs.writeFile.mock.calls[0][1]);
            expect(written.existing).toEqual(['Old Song']);
            expect(written.newlist).toEqual(['New Song']);
        });
    });

    // -----------------------------------------------------------------------
    describe('add_to_playlist', () => {
        it('sends error when nothing is playing', async () => {
            const msg = createMessage();
            await handler.add_to_playlist(msg, 'mylist');
            expect(msg.channel.send).toHaveBeenCalledWith('Nothing is currently playing.');
        });

        it('sends error when no playlist file exists', async () => {
            handler.queue.set('guild123', { songs: [makeSong()] });
            fs.readFile.mockImplementation((p, enc, cb) => cb(new Error('ENOENT')));
            const msg = createMessage();

            await handler.add_to_playlist(msg, 'mylist');
            expect(msg.channel.send).toHaveBeenCalledWith(
                'You do not have any playlists, create one with createplaylist'
            );
        });

        it('sends error when named playlist does not exist', async () => {
            handler.queue.set('guild123', { songs: [makeSong()] });
            fs.readFile.mockImplementation((p, enc, cb) =>
                cb(null, JSON.stringify({ other: ['Song A'] }))
            );
            const msg = createMessage();

            await handler.add_to_playlist(msg, 'nonexistent');
            expect(msg.channel.send).toHaveBeenCalledWith('Playlist: nonexistent does not exist.');
        });

        it('appends current song to playlist', async () => {
            handler.queue.set('guild123', { songs: [makeSong({ title: 'New Song' })] });
            fs.readFile.mockImplementation((p, enc, cb) =>
                cb(null, JSON.stringify({ mylist: ['Existing Song'] }))
            );
            fs.writeFile.mockImplementation((p, d, cb) => cb(null));
            const msg = createMessage();

            await handler.add_to_playlist(msg, 'mylist');

            const written = JSON.parse(fs.writeFile.mock.calls[0][1]);
            expect(written.mylist).toEqual(['Existing Song', 'New Song']);
            expect(msg.channel.send).toHaveBeenCalledWith('New Song was added to mylist!');
        });
    });

    // -----------------------------------------------------------------------
    describe('list_playlists', () => {
        it('sends error when no playlist file exists', async () => {
            fs.readFile.mockImplementation((p, enc, cb) => cb(new Error('ENOENT')));
            const msg = createMessage();
            await handler.list_playlists(msg);
            expect(msg.channel.send).toHaveBeenCalledWith(
                'You do not have any playlists, create one with createplaylist'
            );
        });

        it('sends error when playlists object is empty', async () => {
            fs.readFile.mockImplementation((p, enc, cb) => cb(null, JSON.stringify({})));
            const msg = createMessage();
            await handler.list_playlists(msg);
            expect(msg.channel.send).toHaveBeenCalledWith(
                'You do not have any playlists, create one with createplaylist'
            );
        });

        it('sends embed with playlist names', async () => {
            fs.readFile.mockImplementation((p, enc, cb) =>
                cb(null, JSON.stringify({ alpha: [], beta: [] }))
            );
            const msg = createMessage();
            await handler.list_playlists(msg);
            const embed = msg.channel.send.mock.calls[0][0].embeds[0];
            expect(embed.setDescription).toHaveBeenCalledWith(expect.stringContaining('alpha'));
        });

        it('paginates when there are more than 10 playlists', async () => {
            const playlists = {};
            for (let i = 0; i < 15; i++) playlists[`list${i}`] = [];
            fs.readFile.mockImplementation((p, enc, cb) => cb(null, JSON.stringify(playlists)));
            const msg = createMessage();
            await handler.list_playlists(msg, 2);
            const embed = msg.channel.send.mock.calls[0][0].embeds[0];
            expect(embed.setFooter).toHaveBeenCalledWith({ text: 'Page: 2/2' });
        });
    });

    // -----------------------------------------------------------------------
    describe('view_playlist', () => {
        it('sends error when no playlist file exists', async () => {
            fs.readFile.mockImplementation((p, enc, cb) => cb(new Error('ENOENT')));
            const msg = createMessage();
            await handler.view_playlist(msg, 'mylist');
            expect(msg.channel.send).toHaveBeenCalledWith(
                'You do not have any playlists, create one with createplaylist'
            );
        });

        it('sends error when named playlist does not exist', async () => {
            fs.readFile.mockImplementation((p, enc, cb) =>
                cb(null, JSON.stringify({ other: ['Song'] }))
            );
            const msg = createMessage();
            await handler.view_playlist(msg, 'nonexistent');
            expect(msg.channel.send).toHaveBeenCalledWith(
                "Sorry you don't have a playlist named: nonexistent"
            );
        });

        it('sends single embed for a short playlist', async () => {
            fs.readFile.mockImplementation((p, enc, cb) =>
                cb(null, JSON.stringify({ mylist: ['Song A', 'Song B'] }))
            );
            const msg = createMessage();
            await handler.view_playlist(msg, 'mylist');
            expect(msg.channel.send).toHaveBeenCalledTimes(1);
            const embed = msg.channel.send.mock.calls[0][0].embeds[0];
            expect(embed.setTitle).toHaveBeenCalledWith('mylist');
        });

        it('sends multiple embeds for a long playlist', async () => {
            const songs = Array.from({ length: 15 }, (_, i) => `Song ${i + 1}`);
            fs.readFile.mockImplementation((p, enc, cb) =>
                cb(null, JSON.stringify({ mylist: songs }))
            );
            const msg = createMessage();
            await handler.view_playlist(msg, 'mylist');
            expect(msg.channel.send.mock.calls.length).toBeGreaterThan(1);
        });
    });

    // -----------------------------------------------------------------------
    describe('play_from_list', () => {
        it('sends error when user is not in a voice channel', async () => {
            const msg = createMessage(null);
            await handler.play_from_list(msg, 'mylist');
            expect(msg.channel.send).toHaveBeenCalledWith('Please join a voice channel first.');
        });

        it('sends error when no playlist file exists', async () => {
            fs.readFile.mockImplementation((p, enc, cb) => cb(new Error('ENOENT')));
            const msg = createMessage(mockVoiceChannel);
            await handler.play_from_list(msg, 'mylist');
            expect(msg.channel.send).toHaveBeenCalledWith(
                'You do not have any playlists, create one with createplaylist'
            );
        });

        it('sends error when named playlist does not exist', async () => {
            fs.readFile.mockImplementation((p, enc, cb) =>
                cb(null, JSON.stringify({ other: [] }))
            );
            const msg = createMessage(mockVoiceChannel);
            await handler.play_from_list(msg, 'nonexistent');
            await flushPromises();
            expect(msg.channel.send).toHaveBeenCalledWith(
                "Sorry you don't have a playlist named: nonexistent"
            );
        });

        it('loads all songs from a playlist and starts playback', async () => {
            const song = makeSong();
            jest.spyOn(handler, 'getSong').mockResolvedValue(song);
            jest.spyOn(handler, 'play').mockImplementation(async () => {
                handler.queue.set('guild123', {
                    voice_channel: mockVoiceChannel,
                    player: mockPlayer,
                    songs: [song],
                });
            });
            fs.readFile.mockImplementation((p, enc, cb) =>
                cb(null, JSON.stringify({ mylist: ['Song A', 'Song B'] }))
            );
            const msg = createMessage(mockVoiceChannel);

            await handler.play_from_list(msg, 'mylist');
            await flushPromises();

            expect(handler.getSong).toHaveBeenCalled();
            expect(msg.channel.send).toHaveBeenCalledWith('mylist was added successfully');
        });
    });

    // -----------------------------------------------------------------------
    describe('del_from_list', () => {
        it('sends error when no playlist file exists', async () => {
            fs.readFile.mockImplementation((p, enc, cb) => cb(new Error('ENOENT')));
            const msg = createMessage();
            await handler.del_from_list(msg, 1, 'mylist');
            expect(msg.channel.send).toHaveBeenCalledWith(
                'You do not have any playlists, create one with createplaylist'
            );
        });

        it('sends error when song number exceeds playlist length', async () => {
            fs.readFile.mockImplementation((p, enc, cb) =>
                cb(null, JSON.stringify({ mylist: ['Song A'] }))
            );
            const msg = createMessage();
            await handler.del_from_list(msg, 5, 'mylist');
            expect(msg.channel.send).toHaveBeenCalledWith('This playlist is not that long!');
        });

        it('sends error when playlist does not exist', async () => {
            fs.readFile.mockImplementation((p, enc, cb) =>
                cb(null, JSON.stringify({ other: ['Song'] }))
            );
            const msg = createMessage();
            await handler.del_from_list(msg, 1, 'nonexistent');
            expect(msg.channel.send).toHaveBeenCalledWith(
                "Sorry you don't have a playlist named: nonexistent"
            );
        });

        it('removes the specified song and writes the file', async () => {
            fs.readFile.mockImplementation((p, enc, cb) =>
                cb(null, JSON.stringify({ mylist: ['Song A', 'Song B', 'Song C'] }))
            );
            fs.writeFile.mockImplementation((p, d, cb) => cb(null));
            const msg = createMessage();

            await handler.del_from_list(msg, 2, 'mylist');

            const written = JSON.parse(fs.writeFile.mock.calls[0][1]);
            expect(written.mylist).toEqual(['Song A', 'Song C']);
            expect(msg.channel.send).toHaveBeenCalledWith('Song B was removed from mylist!');
        });
    });

    // -----------------------------------------------------------------------
    describe('delete_playlist', () => {
        it('sends error when no playlist file exists', async () => {
            fs.readFile.mockImplementation((p, enc, cb) => cb(new Error('ENOENT')));
            const msg = createMessage();
            await handler.delete_playlist(msg, 'mylist');
            expect(msg.channel.send).toHaveBeenCalledWith(
                'You do not have any playlists, create one with createplaylist'
            );
        });

        it('deletes playlist and writes the file', async () => {
            fs.readFile.mockImplementation((p, enc, cb) =>
                cb(null, JSON.stringify({ mylist: ['Song A'], other: ['Song B'] }))
            );
            fs.writeFile.mockImplementation((p, d, cb) => cb(null));
            const msg = createMessage();

            await handler.delete_playlist(msg, 'mylist');

            const written = JSON.parse(fs.writeFile.mock.calls[0][1]);
            expect(written.mylist).toBeUndefined();
            expect(written.other).toEqual(['Song B']);
            expect(msg.channel.send).toHaveBeenCalledWith('mylist was removed from your playlists!');
        });
    });

    // -----------------------------------------------------------------------
    describe('rename_playlist', () => {
        it('sends error when no playlist file exists', async () => {
            fs.readFile.mockImplementation((p, enc, cb) => cb(new Error('ENOENT')));
            const msg = createMessage();
            await handler.rename_playlist(msg, 'old', 'new');
            expect(msg.channel.send).toHaveBeenCalledWith(
                'You do not have any playlists, create one with createplaylist'
            );
        });

        it('sends error when the new name already exists', async () => {
            fs.readFile.mockImplementation((p, enc, cb) =>
                cb(null, JSON.stringify({ old: ['Song'], new: ['Other'] }))
            );
            const msg = createMessage();
            await handler.rename_playlist(msg, 'old', 'new');
            expect(msg.channel.send).toHaveBeenCalledWith(
                expect.stringContaining('already exists')
            );
        });

        it('sends error when the old playlist does not exist', async () => {
            fs.readFile.mockImplementation((p, enc, cb) =>
                cb(null, JSON.stringify({ other: ['Song'] }))
            );
            const msg = createMessage();
            await handler.rename_playlist(msg, 'nonexistent', 'newname');
            expect(msg.channel.send).toHaveBeenCalledWith(
                "Sorry you don't have a playlist named: nonexistent"
            );
        });

        it('renames playlist and writes the file', async () => {
            fs.readFile.mockImplementation((p, enc, cb) =>
                cb(null, JSON.stringify({ old: ['Song A', 'Song B'] }))
            );
            fs.writeFile.mockImplementation((p, d, cb) => cb(null));
            const msg = createMessage();

            await handler.rename_playlist(msg, 'old', 'renamed');

            const written = JSON.parse(fs.writeFile.mock.calls[0][1]);
            expect(written.old).toBeUndefined();
            expect(written.renamed).toEqual(['Song A', 'Song B']);
            expect(msg.channel.send).toHaveBeenCalledWith('old playlist has been renamed to renamed');
        });
    });

    // -----------------------------------------------------------------------
    describe('add_queue_to_playlist', () => {
        it('sends error when no playlist file exists', async () => {
            fs.readFile.mockImplementation((p, enc, cb) => cb(new Error('ENOENT')));
            const msg = createMessage();
            await handler.add_queue_to_playlist(msg, 'mylist');
            expect(msg.channel.send).toHaveBeenCalledWith(
                'You do not have any playlists, create one with createplaylist'
            );
        });

        it('sends error when the named playlist does not exist in the file', async () => {
            handler.queue.set('guild123', {
                songs: [makeSong()],
            });
            fs.readFile.mockImplementation((p, enc, cb) =>
                cb(null, JSON.stringify({ other: [] }))
            );
            const msg = createMessage();
            await handler.add_queue_to_playlist(msg, 'nonexistent');
            expect(msg.channel.send).toHaveBeenCalledWith(
                "Sorry you don't have a playlist named: nonexistent"
            );
        });

        it('sends error when nothing is playing', async () => {
            fs.readFile.mockImplementation((p, enc, cb) =>
                cb(null, JSON.stringify({ mylist: [] }))
            );
            const msg = createMessage();
            await handler.add_queue_to_playlist(msg, 'mylist');
            expect(msg.channel.send).toHaveBeenCalledWith('Nothing playing.');
        });

        it('adds all queued songs to the playlist', async () => {
            handler.queue.set('guild123', {
                songs: [makeSong({ title: 'Q Song 1' }), makeSong({ title: 'Q Song 2' })],
            });
            fs.readFile.mockImplementation((p, enc, cb) =>
                cb(null, JSON.stringify({ mylist: ['Existing'] }))
            );
            fs.writeFile.mockImplementation((p, d, cb) => cb(null));
            const msg = createMessage();

            await handler.add_queue_to_playlist(msg, 'mylist');

            const written = JSON.parse(fs.writeFile.mock.calls[0][1]);
            expect(written.mylist).toEqual(['Existing', 'Q Song 1', 'Q Song 2']);
            expect(msg.channel.send).toHaveBeenCalledWith(
                'Successfully added the queue to playlist mylist'
            );
        });
    });

    // -----------------------------------------------------------------------
    describe('writePlaylist', () => {
        it('writes the playlist JSON to disk', () => {
            fs.writeFile.mockImplementation((p, d, cb) => cb(null));
            const msg = createMessage();
            handler.writePlaylist('./Playlists/', msg, { mylist: ['Song A'] });

            expect(fs.writeFile).toHaveBeenCalledWith(
                './Playlists/user123.json',
                JSON.stringify({ mylist: ['Song A'] }, null, 4),
                expect.any(Function)
            );
        });
    });

    // -----------------------------------------------------------------------
    describe('video_player', () => {
        it('destroys connection and removes queue when no song is given', async () => {
            handler.queue.set('guild123', { songs: [], player: mockPlayer });
            const guild = { id: 'guild123' };

            await handler.video_player(guild, undefined);

            expect(voice.getVoiceConnection).toHaveBeenCalledWith('guild123');
            expect(mockConnection.destroy).toHaveBeenCalled();
            expect(handler.queue.has('guild123')).toBe(false);
        });

        it('does not crash when no connection exists during cleanup', async () => {
            voice.getVoiceConnection.mockReturnValue(null);
            handler.queue.set('guild123', { songs: [], player: mockPlayer });

            await handler.video_player({ id: 'guild123' }, undefined);
            expect(mockConnection.destroy).not.toHaveBeenCalled();
        });

        it('spawns yt-dlp, creates a resource, and registers idle listener', async () => {
            const song = makeSong();
            handler.queue.set('guild123', { songs: [song], player: mockPlayer });

            await handler.video_player({ id: 'guild123' }, song);

            expect(ytdlp.exec).toHaveBeenCalledWith(
                song.url,
                expect.objectContaining({ output: '-', format: 'bestaudio/best' })
            );
            expect(voice.createAudioResource).toHaveBeenCalledWith('mockStream', { inputType: 'arbitrary' });
            expect(mockPlayer.play).toHaveBeenCalled();
            expect(mockPlayer.once).toHaveBeenCalledWith('idle', expect.any(Function));
        });

        it('advances to next song when idle fires', async () => {
            const song1 = makeSong({ title: 'Song 1' });
            const song2 = makeSong({ title: 'Song 2' });
            handler.queue.set('guild123', { songs: [song1, song2], player: mockPlayer });

            await handler.video_player({ id: 'guild123' }, song1);

            const idleCallback = mockPlayer.once.mock.calls[0][1];
            await idleCallback();

            expect(ytdlp.exec).toHaveBeenCalledTimes(2);
        });

        it('cleans up when idle fires and queue is empty', async () => {
            const song = makeSong();
            handler.queue.set('guild123', { songs: [song], player: mockPlayer });

            await handler.video_player({ id: 'guild123' }, song);

            const idleCallback = mockPlayer.once.mock.calls[0][1];
            idleCallback(); // songs[0] shifts → songs = [] → video_player(undefined)

            expect(mockConnection.destroy).toHaveBeenCalled();
            expect(handler.queue.has('guild123')).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    describe('get_playlist', () => {
        it('sends error when no playlist file exists', async () => {
            fs.readFile.mockImplementation((p, enc, cb) => cb(new Error('ENOENT')));
            const msg = createMessage();
            await handler.get_playlist(msg, 'mylist');
            expect(msg.channel.send).toHaveBeenCalledWith(
                'You do not have any playlists, create one with createplaylist'
            );
        });

        it('sends error when the named playlist does not exist', async () => {
            fs.readFile.mockImplementation((p, enc, cb) =>
                cb(null, JSON.stringify({ other: ['Song'] }))
            );
            const msg = createMessage();
            await handler.get_playlist(msg, 'nonexistent');
            expect(msg.channel.send).toHaveBeenCalledWith(
                "Sorry you don't have a playlist named: nonexistent"
            );
        });

        it('DMs the playlist as a JSON attachment', async () => {
            fs.readFile.mockImplementation((p, enc, cb) =>
                cb(null, JSON.stringify({ mylist: ['Song A', 'Song B'] }))
            );
            const msg = createMessage();
            await handler.get_playlist(msg, 'mylist');

            expect(AttachmentBuilder).toHaveBeenCalledWith(
                expect.any(Buffer),
                { name: 'mylist.json' }
            );
            expect(msg.author.send).toHaveBeenCalledWith({ files: [expect.any(Object)] });
        });
    });

    // -----------------------------------------------------------------------
    describe('backup_playlists', () => {
        it('silently returns when caller is not in the user cache', async () => {
            const msg = createMessage();
            msg.author.id = 'unauthorised999';

            await handler.backup_playlists(msg);

            expect(AdmZip).not.toHaveBeenCalled();
            expect(msg.author.send).not.toHaveBeenCalled();
        });

        it('zips playlists and DMs the archive to an authorised user', async () => {
            const mockZipInstance = { addLocalFolder: jest.fn(), writeZip: jest.fn() };
            AdmZip.mockImplementation(() => mockZipInstance);

            const msg = createMessage();
            await handler.backup_playlists(msg);

            expect(mockZipInstance.addLocalFolder).toHaveBeenCalledWith('./Playlists/');
            expect(msg.author.send).toHaveBeenCalledWith({ files: ['./backup.zip'] });
        });
    });

    // -----------------------------------------------------------------------
    describe('upload_playlist', () => {
        it('sends error when no file is attached', async () => {
            const msg = createMessage();
            msg.attachments.size = 0;
            await handler.upload_playlist(msg);
            expect(msg.channel.send).toHaveBeenCalledWith('Please attach a file to use this command');
        });

        it('sends error when attached file is not JSON', async () => {
            const msg = createMessage();
            msg.attachments.size = 1;
            msg.attachments.first.mockReturnValue({ name: 'songs.txt', url: 'http://x.test/a' });
            await handler.upload_playlist(msg);
            expect(msg.channel.send).toHaveBeenCalledWith('Please only upload json files');
        });

        it('creates a new playlist from uploaded JSON (no existing file)', async () => {
            const msg = createMessage();
            msg.attachments.size = 1;
            msg.attachments.first.mockReturnValue({ name: 'summer.json', url: 'http://x.test/file' });
            fetch.mockResolvedValue({ json: jest.fn().mockResolvedValue(['Song A', 'Song B']) });
            fs.readFile.mockImplementation((p, enc, cb) => cb(new Error('ENOENT')));
            fs.writeFile.mockImplementation((p, d, cb) => cb(null));

            await handler.upload_playlist(msg);
            await flushPromises();

            const written = JSON.parse(fs.writeFile.mock.calls[0][1]);
            expect(written.summer).toEqual(['Song A', 'Song B']);
            expect(msg.channel.send).toHaveBeenCalledWith('Successfully created summer!');
        });

        it('overwrites an existing playlist from uploaded JSON', async () => {
            const msg = createMessage();
            msg.attachments.size = 1;
            msg.attachments.first.mockReturnValue({ name: 'mylist.json', url: 'http://x.test/file' });
            fetch.mockResolvedValue({ json: jest.fn().mockResolvedValue(['New Song']) });
            fs.readFile.mockImplementation((p, enc, cb) =>
                cb(null, JSON.stringify({ mylist: ['Old Song'], other: ['X'] }))
            );
            fs.writeFile.mockImplementation((p, d, cb) => cb(null));

            await handler.upload_playlist(msg);
            await flushPromises();

            const written = JSON.parse(fs.writeFile.mock.calls[0][1]);
            expect(written.mylist).toEqual(['New Song']);
            expect(written.other).toEqual(['X']);
        });
    });

    // -----------------------------------------------------------------------
    describe('help', () => {
        it('sends the regular command embed when called with no arg', async () => {
            const msg = createMessage();
            await handler.help(msg, '');

            expect(msg.channel.send).toHaveBeenCalledWith({ embeds: [expect.any(Object)] });
            const embed = msg.channel.send.mock.calls[0][0].embeds[0];
            expect(embed.setTitle).toHaveBeenCalledWith('JukeBot Regular Commands');
        });

        it('sends the playlist embed when called with "playlist"', async () => {
            const msg = createMessage();
            await handler.help(msg, 'playlist');

            expect(msg.channel.send).toHaveBeenCalledWith({ embeds: [expect.any(Object)] });
            const embed = msg.channel.send.mock.calls[0][0].embeds[0];
            expect(embed.setTitle).toHaveBeenCalledWith('JukeBot Playlist Commands');
        });
    });
});
