#!/usr/bin/env bash
# Creates .env.local from .env.template if it doesn't exist, and never edits an
# existing one. Fails if a variable the app needs at start-up is still empty.
set -euo pipefail
cd "$(dirname "$0")/../.."

file=.env.local

# Value of a variable in a dotenv file, or empty if it's unset or blank.
read_var() {
  [ -f "$2" ] || return 0
  sed -nE "s/^[[:space:]]*(export[[:space:]]+)?$1=[[:space:]]*[\"']?([^\"'#[:space:]]*).*$/\2/p" "$2" | tail -n1
}

if [ ! -e "$file" ]; then
  secret=$(head -c 48 /dev/urandom | base64 | tr -d '\n')
  {
    echo "# Created by 'make run' from .env.template. Edit freely; make never overwrites this file."
    sed -e "s#^JWT_SECRET=\$#JWT_SECRET=$secret#" .env.template
  } >"$file"
  echo "Created $file with a random JWT_SECRET."
fi

# Required at start-up by src/server/config.ts. The web container reads these
# files the way Next.js does (first one wins). DATABASE_URL isn't listed: the
# containers set it themselves.
required=(APP_URL JWT_SECRET)
missing=()
for var in "${required[@]}"; do
  value=""
  for f in .env.development.local .env.local .env.development .env; do
    value=$(read_var "$var" "$f")
    [ -n "$value" ] && break
  done
  [ -n "$value" ] || missing+=("$var")
done

if [ ${#missing[@]} -gt 0 ]; then
  echo "error: the app won't start until these are set in $file:" >&2
  printf '  %s\n' "${missing[@]}" >&2
  exit 1
fi
