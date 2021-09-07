FROM ubuntu
RUN export DEBIAN_FRONTEND=noninteractive && \
    apt-get update && \
    apt-get full-upgrade -y && \
    apt install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_16.x | bash && \
    apt-get install tmux -y && \
    apt-get install nodejs -yq && \
    apt-get remove curl -y

ADD ./Bot /MusicBot

RUN cd MusicBot && \
    npm install

RUN groupadd -g 1000 basicuser && useradd -r -u 1000 -g basicuser basicuser

USER basicuser