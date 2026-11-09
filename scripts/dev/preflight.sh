#!/usr/bin/env bash
# Fails with a clear message if Docker can't be used, or if a port the stack
# publishes is taken by something other than this stack.
set -euo pipefail
cd "$(dirname "$0")/../.."

fail() {
  echo "error: $*" >&2
  exit 1
}

command -v docker >/dev/null || fail "Docker isn't installed. Install Docker, then try again."

if ! err=$(docker info 2>&1 >/dev/null); then
  if grep -qi "permission denied" <<<"$err"; then
    fail "Docker is running, but this user can't use it. Add yourself to the docker group
       (sudo usermod -aG docker \$USER), log out and back in, then try again."
  fi
  fail "Docker isn't running. Start it (e.g. sudo systemctl start docker, or open Docker Desktop),
       then try again."
fi

docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 ('docker compose') isn't available."

# Each published port must be free, or already held by this stack's container.
check_port() {
  local service=$1 port=$2
  [ -n "$(docker compose ps -q --status running "$service" 2>/dev/null)" ] && return 0
  (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null || return 0

  local owner
  owner=$(docker ps --filter "publish=$port" --format '{{.Names}}' | head -n1)
  if [ -n "$owner" ]; then
    fail "Port $port (for $service) is used by the Docker container '$owner'.
       Stop it (docker stop $owner), or pick another port, e.g. make run $3=$((port + 1))."
  fi
  fail "Port $port (for $service) is used by another process.
       Find it with: ss -ltnp 'sport = :$port'  (or lsof -i :$port), or pick another port, e.g. make run $3=$((port + 1))."
}

check_port db "${DB_PORT:-5433}" DB_PORT
check_port web "${WEB_PORT:-3000}" WEB_PORT
check_port storybook "${STORYBOOK_PORT:-6006}" STORYBOOK_PORT
check_port mail "${MAIL_UI_PORT:-8025}" MAIL_UI_PORT
check_port mail "${MAIL_SMTP_PORT:-1025}" MAIL_SMTP_PORT
