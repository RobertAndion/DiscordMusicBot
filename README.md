# DiscordMusicBotNode
This is a new project undertaken by myself and Bianca, it is in the very early development stage.
If you come across some issues feel free to post them in the issues.

### General Setup
To be written.

## COMMAND DOCUMENTATION:
### NOTE: 
Anything after ! is a command name and the prefix ! is needed to run the command,
the items in <> are the function arguments and anything with OPTIONAL is as it sounds.
```
!play <SONG-NAME>
```
If the person using the command is in a voice channel and the bot has access to that channel it will connect and play the song listed. This is also the command to continue adding songs to the queue, it covers both functions. The bot will auto disconnect
when the end of the queue is reached.

```
!skip <OPTIONAL amount>
```
If the bot is playing a song it will skip to the next song as long as the person is in the same
voice channel as the bot. If there are no songs after the bot will automatically disconnect. 
The argument can be used to say how many songs to skip. (>=1)
