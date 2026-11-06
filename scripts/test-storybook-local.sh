#!/usr/bin/env bash
# Builds Storybook and runs the accessibility checks on the build, as CI does.
# Usage: npm run test-storybook:local [-- <test-storybook args>]   (PORT=6008 to change the port)
set -euo pipefail

PORT="${PORT:-6007}"
URL="http://127.0.0.1:$PORT"

# A server already on the port (a leftover run, or `npm run storybook` if PORT=6006)
# would be tested instead of this build.
if curl -sf "$URL" >/dev/null 2>&1; then
  echo "Something is already serving $URL. Stop it, or run with PORT=<other port>." >&2
  exit 1
fi

npm run build-storybook

python3 -m http.server "$PORT" --bind 127.0.0.1 --directory storybook-static >/dev/null &
server=$!
trap 'kill "$server" 2>/dev/null || true' EXIT

for _ in $(seq 30); do
  curl -sf "$URL/index.json" >/dev/null && break
  kill -0 "$server" 2>/dev/null || { echo "The Storybook server exited (port $PORT taken?)." >&2; exit 1; }
  sleep 1
done
curl -sf "$URL/index.json" >/dev/null || { echo "The Storybook server didn't start on $URL." >&2; exit 1; }

npx test-storybook --url "$URL" "$@"
