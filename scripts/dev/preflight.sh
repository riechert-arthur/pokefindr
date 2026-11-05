#!/usr/bin/env bash
# Fails with a clear message if Docker can't be used, or if the database port
# is taken by something other than our compose `db` container.
#
#   scripts/dev/preflight.sh 5433
set -euo pipefail
cd "$(dirname "$0")/../.."

port="${1:?usage: preflight.sh <port>}"

fail() {
  echo "error: $*" >&2
  exit 1
}

command -v docker >/dev/null || fail "Docker isn't installed. Install Docker, then run make setup again."

if ! err=$(docker info 2>&1 >/dev/null); then
  if grep -qi "permission denied" <<<"$err"; then
    fail "Docker is running, but this user can't use it. Add yourself to the docker group
       (sudo usermod -aG docker \$USER), log out and back in, then run make setup again."
  fi
  fail "Docker isn't running. Start it (e.g. sudo systemctl start docker, or open Docker Desktop),
       then run make setup again."
fi

docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 ('docker compose') isn't available."

# Our container is already up, so the port is ours.
if [ -n "$(docker compose ps -q --status running db 2>/dev/null)" ]; then
  exit 0
fi

# Something else is listening on the port.
if (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then
  owner=$(docker ps --filter "publish=$port" --format '{{.Names}}' | head -n1)
  if [ -n "$owner" ]; then
    fail "Port $port is used by the Docker container '$owner', not this project's database.
       Stop it (docker stop $owner) and run make setup again."
  fi
  fail "Port $port is used by another process, not this project's database.
       Find it with: ss -ltnp 'sport = :$port'  (or lsof -i :$port), stop it, and run make setup again."
fi
