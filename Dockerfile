# syntax=docker/dockerfile:1

from archlinux:latest

RUN pacman -Syu --noconfirm && \
    pacman -S --noconfirm \
    curl \
    sudo \
    nodejs \
    npm \
    && pacman -Scc --noconfirm

WORKDIR /workspace

EXPOSE 3000

CMD ["/bin/bash"]
