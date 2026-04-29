FROM ubuntu

RUN export DEBIAN_FRONTEND=noninteractive && \
    apt-get update && \
    apt-get full-upgrade -y && \
    apt-get install -y curl python3 build-essential ffmpeg tmux && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash && \
    apt-get install -y nodejs && \
    apt-get clean

ADD ./Bot /MusicBot
WORKDIR /MusicBot

RUN npm install

RUN groupadd -g 1000 basicuser && useradd -r -u 1000 -g basicuser basicuser
USER basicuser

CMD ["node", "index.js"]
