FROM ubuntu
RUN apt-get update && \
    apt-get install curl -y && \
    apt-get install tmux -y && \
    curl -sL https://deb.nodesource.com/setup_12.x | bash && \
    apt-get install nodejs -y

ADD ./Bot /MusicBot

RUN cd MusicBot && \
    npm install