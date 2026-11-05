#!/bin/sh
# Entrypoint for the dev image. node_modules is a Docker volume, so install
# dependencies only when package-lock.json differs from the last install.
set -eu

hash=$(sha256sum package-lock.json | cut -d' ' -f1)
if [ "$(cat node_modules/.lock-sha256 2>/dev/null || true)" != "$hash" ]; then
  echo "Installing dependencies (package-lock.json changed)..."
  npm ci --no-audit --no-fund
  echo "$hash" >node_modules/.lock-sha256
fi

exec "$@"
