# syntax=docker/dockerfile:1

FROM archlinux:latest

RUN pacman -Sy --noconfirm archlinux-keyring && \
    pacman-key --init && \
    pacman-key --populate archlinux && \
    pacman -Syu --noconfirm && \
    pacman -S --noconfirm \
    curl \
    sudo \
    nodejs \
    npm \
    python && \
    pacman -Scc --noconfirm

WORKDIR /workspace

EXPOSE 3000

CMD ["/bin/bash"]
