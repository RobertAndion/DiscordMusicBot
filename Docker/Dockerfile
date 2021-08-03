FROM ubuntu
RUN apt-get update && \
    apt-get full-upgrade -y && \
    apt-get install curl -y && \
    apt-get install tmux -y && \
    curl -sL https://deb.nodesource.com/setup_12.x | bash && \
    apt-get install nodejs -y && \
    apt-get remove curl -y

ADD ./Bot /MusicBot

RUN cd MusicBot && \
    npm install

RUN groupadd -g 1000 basicuser && useradd -r -u 1000 -g basicuser basicuser

USER basicuser