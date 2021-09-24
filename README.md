# DiscordMusicBotNode
This is a new project undertaken by myself and Bianca, it is in the very early development stage.
If you come across some issues feel free to post them in the issues.

### General Setup
The installation of the bots packages can be made from npm install when in the same directory as the 
package.json file. You must open config.sample.json and insert your bots token, after which you should 
rename the file to config.json. 
To run the bot: 
```
node index.js
```
### Node must be version 12!
Ubuntu node install:
```
curl -sL https://deb.nodesource.com/setup_12.x | sudo -E bash -
sudo apt-get install -y nodejs
```
### Docker
If you wish to run the bot in a docker container the Docker folder provides a
dockerfile to do so. In order to use the file place the github files in a folder named Bot,
then place the dockerfile on the same level as the Bot folder (not inside) then run a normal build 
command. First set the correct key in config.json and add any lists into the Playlist folder (if you have existing playlists) and they
will automatically be brought into the container. 

Docker start command:
```
docker run -it -m 2G --cpuset-cpus 0-1 --security-opt=no-new-privileges <image_id_here>
```
In this command the -m and --cpuset-cpus are optional but means that the container can use at most
two gigabytes of RAM and cpuset 0-1 means that the container can use threads 0 and 1. (Limiting resources)
All of this can be adjusted to suit or removed entirely. Keep --security-opt=no-new-privileges for security.

After this you can exit the container and rename it using
```
docker container ls -a
```
and then use the container id in the following command:
```
docker rename <container_id_here> musicbot
```
Now the automatic start file will boot up the container and automatically run the bot inside,
if the instructions below are followed.

#### Note:
You will be unable to update these containers from the inside so the command .backupPlaylists is here
in order to send you the playlists (only new info in the container) so you can remake the container images
often to get updates and changes to the bots code, simply place the .json lists back in the playlist folder
before building the new image and they will be added to the new image.

#### Automatic Docker Startup
In order to auto start, create the docker container and name it "musicbot",
then place the musicbotstart.sh on the containers host machine. In the host machine run the command:
(use sudo -i first if you need sudo to run docker, you should.)
```
crontab -e
```
Then choose nano if you are unfamiliar with linux editors, or pick your favorite editor. Add the following line to the bottom of
the file it opens
```
@reboot sh /pathtoyourfile/musicbotstart.sh
```
Now upon the main server restarting it will start up the docker container and run the bot inside.

## COMMAND DOCUMENTATION:
### NOTE: 
Anything after ! is a command name and the prefix ! is needed to run the command,
the items in <> are the function arguments, () are aliases, and anything with OPTIONAL is as it sounds.
(The prefix can be made to any variable by adjusting the field in config.json)

```
!play <SONG-NAME> (p)
```
If the person using the command is in a voice channel and the bot has access to that channel it will connect and play the song listed. This is also the command to continue adding songs to the queue, it covers both functions. The bot will auto disconnect
when the end of the queue is reached.

```
!pause <> (ps)
```
This will check if the player is playing, and if the person envoking is in the same channel
as the bot. If so it will pause the song indefinetely as of now. (May add auto resume)

```
!unpause <> (up)
```
This will check that the bot is "playing" but paused. It will also check to make sure
the envoker is in the same channel as the bot. If so it will resume the playing of a paused song.

```
!skip <OPTIONAL amount> ()
```
If the bot is playing a song it will skip to the next song as long as the person is in the same
voice channel as the bot. If there are no songs after the bot will automatically disconnect. 
The argument can be used to say how many songs to skip. (>=1)
#### Note: Skip is also used to clear out errors. If something happens and the bot freezes or stops playing audio, try using skip to reset it. 

```
!queue <OPTIONAL page number> ()
```
The queue command will show the currently playing song and all other songs in an embedded queue.
If the queue is longer than 10 songs it will wrap into multiple pages and a page number argument is 
optional to view these additiona pages. (First page is default.)

```
!shuffle <> ()
```
If the bot is playing and the envoker is in the same voice channel as the bot, this command
will shuffle all songs in the servers queue.

For a version in python3 try: https://github.com/RobertAndion/Discord_Music_Bot
### Future:
We are moving towards a stable version of this bot with more error checking/handling and making it less prone to failure.
We soon plan to add a playlist system in which you can store and load playlists into the bots queue.
If you have suggestions for functionality or have found bugs in the system please create an issue and upload your log
file content so we can see the root of the issue. Thank you, Robert and Bianca.
