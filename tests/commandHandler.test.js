'use strict';

jest.mock('fs', () => ({
    existsSync: jest.fn().mockReturnValue(true),
    mkdir: jest.fn(),
    appendFile: jest.fn(),
}));

const fs = require('fs');
const commandHandler = require('../commands/commandHandler');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const createMessage = () => ({
    author: { id: 'user123', toString: () => 'TestUser#1234' },
    guild: { id: 'guild123' },
    channel: { send: jest.fn() },
});

const makeMusicHandler = () => ({
    viewQueue: jest.fn().mockResolvedValue(),
    getSong: jest.fn().mockResolvedValue({ title: 'Test', url: 'url', flag: false }),
    play: jest.fn().mockResolvedValue(),
    skip: jest.fn().mockResolvedValue(),
    shuffle: jest.fn().mockResolvedValue(),
    pause: jest.fn().mockResolvedValue(),
    unpause: jest.fn().mockResolvedValue(),
    create_playlist: jest.fn().mockResolvedValue(),
    add_to_playlist: jest.fn().mockResolvedValue(),
    list_playlists: jest.fn().mockResolvedValue(),
    view_playlist: jest.fn().mockResolvedValue(),
    play_from_list: jest.fn().mockResolvedValue(),
    del_from_list: jest.fn().mockResolvedValue(),
    delete_playlist: jest.fn().mockResolvedValue(),
    rename_playlist: jest.fn().mockResolvedValue(),
    add_queue_to_playlist: jest.fn().mockResolvedValue(),
    get_playlist: jest.fn().mockResolvedValue(),
    upload_playlist: jest.fn().mockResolvedValue(),
    backup_playlists: jest.fn().mockResolvedValue(),
    help: jest.fn().mockResolvedValue(),
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('commandHandler', () => {
    let mh;
    let msg;

    beforeEach(() => {
        jest.clearAllMocks();
        mh = makeMusicHandler();
        msg = createMessage();
    });

    // -----------------------------------------------------------------------
    describe('queue / q', () => {
        it('calls viewQueue without page when no args', async () => {
            await commandHandler('queue', [], msg, mh);
            expect(mh.viewQueue).toHaveBeenCalledWith(msg);
        });

        it('calls viewQueue with page arg', async () => {
            await commandHandler('queue', ['2'], msg, mh);
            expect(mh.viewQueue).toHaveBeenCalledWith(msg, '2');
        });

        it('alias q works', async () => {
            await commandHandler('q', [], msg, mh);
            expect(mh.viewQueue).toHaveBeenCalledWith(msg);
        });
    });

    // -----------------------------------------------------------------------
    describe('play / p', () => {
        it('sends error when no song name given', async () => {
            await commandHandler('play', [], msg, mh);
            expect(msg.channel.send).toHaveBeenCalledWith('No song name given.');
            expect(mh.getSong).not.toHaveBeenCalled();
        });

        it('calls getSong and play with joined args', async () => {
            await commandHandler('play', ['hello', 'world'], msg, mh);
            expect(mh.getSong).toHaveBeenCalledWith('hello world');
            expect(mh.play).toHaveBeenCalled();
        });

        it('sends "not found" when getSong returns null', async () => {
            mh.getSong.mockResolvedValue(null);
            await commandHandler('play', ['nope'], msg, mh);
            expect(msg.channel.send).toHaveBeenCalledWith('No song with that name/link was found.');
            expect(mh.play).not.toHaveBeenCalled();
        });

        it('sends "Video unavailable" and logs error when getSong throws', async () => {
            fs.appendFile.mockImplementation((p, d, cb) => cb(null));
            mh.getSong.mockRejectedValue(new Error('age restricted'));
            await commandHandler('play', ['bad'], msg, mh);
            // The inner catch rethrows to the outer catch, which logs to file rather than rethrowing.
            expect(msg.channel.send).toHaveBeenCalledWith('Video unavailable.');
            expect(fs.appendFile).toHaveBeenCalledWith(
                expect.stringMatching(/Logs\/.*\.txt/),
                expect.stringContaining('age restricted'),
                expect.any(Function)
            );
        });

        it('alias p works', async () => {
            await commandHandler('p', ['song'], msg, mh);
            expect(mh.getSong).toHaveBeenCalledWith('song');
        });
    });

    // -----------------------------------------------------------------------
    describe('skip', () => {
        it('calls skip without amount when no args', async () => {
            await commandHandler('skip', [], msg, mh);
            expect(mh.skip).toHaveBeenCalledWith(msg);
        });

        it('calls skip with amount arg', async () => {
            await commandHandler('skip', ['3'], msg, mh);
            expect(mh.skip).toHaveBeenCalledWith(msg, '3');
        });
    });

    // -----------------------------------------------------------------------
    describe('shuffle', () => {
        it('calls shuffle', async () => {
            await commandHandler('shuffle', [], msg, mh);
            expect(mh.shuffle).toHaveBeenCalledWith(msg);
        });
    });

    // -----------------------------------------------------------------------
    describe('pause / ps', () => {
        it('calls pause', async () => {
            await commandHandler('pause', [], msg, mh);
            expect(mh.pause).toHaveBeenCalledWith(msg);
        });

        it('alias ps works', async () => {
            await commandHandler('ps', [], msg, mh);
            expect(mh.pause).toHaveBeenCalledWith(msg);
        });
    });

    // -----------------------------------------------------------------------
    describe('unpause / up', () => {
        it('calls unpause', async () => {
            await commandHandler('unpause', [], msg, mh);
            expect(mh.unpause).toHaveBeenCalledWith(msg);
        });

        it('alias up works', async () => {
            await commandHandler('up', [], msg, mh);
            expect(mh.unpause).toHaveBeenCalledWith(msg);
        });
    });

    // -----------------------------------------------------------------------
    describe('clear / c', () => {
        it('calls skip with 10000 to clear queue', async () => {
            await commandHandler('clear', [], msg, mh);
            expect(mh.skip).toHaveBeenCalledWith(msg, 10000);
        });

        it('alias c works', async () => {
            await commandHandler('c', [], msg, mh);
            expect(mh.skip).toHaveBeenCalledWith(msg, 10000);
        });
    });

    // -----------------------------------------------------------------------
    describe('createplaylist / cpl', () => {
        it('sends error when no playlist name given', async () => {
            await commandHandler('createplaylist', [], msg, mh);
            expect(msg.channel.send).toHaveBeenCalledWith('Please enter a playlist name');
        });

        it('calls create_playlist with joined args', async () => {
            await commandHandler('createplaylist', ['my', 'list'], msg, mh);
            expect(mh.create_playlist).toHaveBeenCalledWith(msg, 'my list');
        });

        it('alias cpl works', async () => {
            await commandHandler('cpl', ['summer'], msg, mh);
            expect(mh.create_playlist).toHaveBeenCalledWith(msg, 'summer');
        });
    });

    // -----------------------------------------------------------------------
    describe('addtoplaylist / atp', () => {
        it('sends error when no playlist name given', async () => {
            await commandHandler('addtoplaylist', [], msg, mh);
            expect(msg.channel.send).toHaveBeenCalledWith('Please enter a playlist name');
        });

        it('calls add_to_playlist', async () => {
            await commandHandler('atp', ['mylist'], msg, mh);
            expect(mh.add_to_playlist).toHaveBeenCalledWith(msg, 'mylist');
        });
    });

    // -----------------------------------------------------------------------
    describe('listplaylists / lpl', () => {
        it('calls list_playlists without page when no args', async () => {
            await commandHandler('listplaylists', [], msg, mh);
            expect(mh.list_playlists).toHaveBeenCalledWith(msg);
        });

        it('calls list_playlists with page arg', async () => {
            await commandHandler('lpl', ['2'], msg, mh);
            expect(mh.list_playlists).toHaveBeenCalledWith(msg, '2');
        });
    });

    // -----------------------------------------------------------------------
    describe('viewplaylist / vpl', () => {
        it('sends error when no name given', async () => {
            await commandHandler('viewplaylist', [], msg, mh);
            expect(msg.channel.send).toHaveBeenCalledWith('Please specify the name of the playlist.');
        });

        it('calls view_playlist with joined args', async () => {
            await commandHandler('vpl', ['my', 'list'], msg, mh);
            expect(mh.view_playlist).toHaveBeenCalledWith(msg, 'my list');
        });
    });

    // -----------------------------------------------------------------------
    describe('playfromlist / playl / pl', () => {
        it('sends error when no name given', async () => {
            await commandHandler('playfromlist', [], msg, mh);
            expect(msg.channel.send).toHaveBeenCalledWith('Please specify the name of the playlist.');
        });

        it('calls play_from_list', async () => {
            await commandHandler('pl', ['summer'], msg, mh);
            expect(mh.play_from_list).toHaveBeenCalledWith(msg, 'summer');
        });

        it('alias playl works', async () => {
            await commandHandler('playl', ['mix'], msg, mh);
            expect(mh.play_from_list).toHaveBeenCalledWith(msg, 'mix');
        });
    });

    // -----------------------------------------------------------------------
    describe('deletefromlist / delsong / dfl', () => {
        it('sends error when no args provided', async () => {
            await commandHandler('dfl', [], msg, mh);
            expect(msg.channel.send).toHaveBeenCalledWith(
                'Please specify the song number and name of the playlist'
            );
        });

        it('sends error when only one arg provided', async () => {
            await commandHandler('dfl', ['1'], msg, mh);
            expect(msg.channel.send).toHaveBeenCalledWith(
                'Please specify the song number and name of the playlist'
            );
        });

        it('sends error when song number is not a positive integer', async () => {
            await commandHandler('dfl', ['abc', 'mylist'], msg, mh);
            expect(msg.channel.send).toHaveBeenCalledWith(
                expect.stringContaining('The song number must be > 0')
            );
        });

        it('calls del_from_list with valid args', async () => {
            await commandHandler('dfl', ['2', 'mylist'], msg, mh);
            expect(mh.del_from_list).toHaveBeenCalledWith(msg, '2', 'mylist');
        });

        it('alias delsong works', async () => {
            await commandHandler('delsong', ['1', 'list'], msg, mh);
            expect(mh.del_from_list).toHaveBeenCalledWith(msg, '1', 'list');
        });
    });

    // -----------------------------------------------------------------------
    describe('deleteplaylist / deletelist / dl', () => {
        it('sends error when no name given', async () => {
            await commandHandler('deleteplaylist', [], msg, mh);
            expect(msg.channel.send).toHaveBeenCalledWith(
                'Please specify the name of the playlist to delete.'
            );
        });

        it('calls delete_playlist', async () => {
            await commandHandler('dl', ['mylist'], msg, mh);
            expect(mh.delete_playlist).toHaveBeenCalledWith(msg, 'mylist');
        });

        it('alias deletelist works', async () => {
            await commandHandler('deletelist', ['mylist'], msg, mh);
            expect(mh.delete_playlist).toHaveBeenCalledWith(msg, 'mylist');
        });
    });

    // -----------------------------------------------------------------------
    describe('renameplaylist / rename / rl', () => {
        it('sends error when fewer than 2 args given', async () => {
            await commandHandler('renameplaylist', ['old'], msg, mh);
            expect(msg.channel.send).toHaveBeenCalledWith(
                'Please specify both the old playlist name, followed by the new name.'
            );
        });

        it('calls rename_playlist with old and new names', async () => {
            await commandHandler('rl', ['old', 'new'], msg, mh);
            expect(mh.rename_playlist).toHaveBeenCalledWith(msg, 'old', 'new');
        });
    });

    // -----------------------------------------------------------------------
    describe('addqueuetoplaylist / aqtp', () => {
        it('sends error when no name given', async () => {
            await commandHandler('addqueuetoplaylist', [], msg, mh);
            expect(msg.channel.send).toHaveBeenCalledWith(
                'Please specify the name of the playlist to add the queue to.'
            );
        });

        it('calls add_queue_to_playlist', async () => {
            await commandHandler('aqtp', ['mylist'], msg, mh);
            expect(mh.add_queue_to_playlist).toHaveBeenCalledWith(msg, 'mylist');
        });
    });

    // -----------------------------------------------------------------------
    describe('getplaylist / getlist / gl', () => {
        it('sends error when no name given', async () => {
            await commandHandler('getplaylist', [], msg, mh);
            expect(msg.channel.send).toHaveBeenCalledWith(
                'Please specify the name of the playlist to get.'
            );
        });

        it('calls get_playlist', async () => {
            await commandHandler('gl', ['mylist'], msg, mh);
            expect(mh.get_playlist).toHaveBeenCalledWith(msg, 'mylist');
        });

        it('alias getlist works', async () => {
            await commandHandler('getlist', ['mylist'], msg, mh);
            expect(mh.get_playlist).toHaveBeenCalledWith(msg, 'mylist');
        });
    });

    // -----------------------------------------------------------------------
    describe('uploadplaylist / uplist', () => {
        it('calls upload_playlist', async () => {
            await commandHandler('uploadplaylist', [], msg, mh);
            expect(mh.upload_playlist).toHaveBeenCalledWith(msg);
        });

        it('alias uplist works', async () => {
            await commandHandler('uplist', [], msg, mh);
            expect(mh.upload_playlist).toHaveBeenCalledWith(msg);
        });
    });

    // -----------------------------------------------------------------------
    describe('backupplaylists / bups', () => {
        it('calls backup_playlists', async () => {
            await commandHandler('backupplaylists', [], msg, mh);
            expect(mh.backup_playlists).toHaveBeenCalledWith(msg);
        });

        it('alias bups works', async () => {
            await commandHandler('bups', [], msg, mh);
            expect(mh.backup_playlists).toHaveBeenCalledWith(msg);
        });
    });

    // -----------------------------------------------------------------------
    describe('help / h', () => {
        it('calls help with joined args', async () => {
            await commandHandler('help', ['playlist'], msg, mh);
            expect(mh.help).toHaveBeenCalledWith(msg, 'playlist');
        });

        it('alias h works', async () => {
            await commandHandler('h', [], msg, mh);
            expect(mh.help).toHaveBeenCalledWith(msg, '');
        });
    });

    // -----------------------------------------------------------------------
    describe('unknown command', () => {
        it('sends "Erm.. what?" for unrecognised commands', async () => {
            await commandHandler('doesnotexist', [], msg, mh);
            expect(msg.channel.send).toHaveBeenCalledWith('Erm.. what?');
        });
    });

    // -----------------------------------------------------------------------
    describe('error handling', () => {
        it('logs errors to a date-stamped file when a handler throws', async () => {
            fs.existsSync.mockReturnValue(true);
            fs.appendFile.mockImplementation((p, d, cb) => cb(null));
            mh.shuffle.mockRejectedValue(new Error('unexpected failure'));

            await commandHandler('shuffle', [], msg, mh);

            expect(fs.appendFile).toHaveBeenCalledWith(
                expect.stringMatching(/Logs\/.*\.txt/),
                expect.stringContaining('unexpected failure'),
                expect.any(Function)
            );
        });

        it('creates Logs directory if it does not exist', async () => {
            fs.existsSync.mockReturnValue(false);
            fs.mkdir.mockImplementation((p, cb) => cb(null));
            fs.appendFile.mockImplementation((p, d, cb) => cb(null));
            mh.shuffle.mockRejectedValue(new Error('boom'));

            await commandHandler('shuffle', [], msg, mh);

            expect(fs.mkdir).toHaveBeenCalledWith('./Logs', expect.any(Function));
        });
    });
});
