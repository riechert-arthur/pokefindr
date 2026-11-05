#!/usr/bin/env bash
# Creates .env.local from .env.template if it doesn't exist. Never edits an
# existing file; only warns about what it's missing.
#
#   scripts/dev/env.sh postgres://pokefindr:pokefindr@localhost:5433/pokefindr
set -euo pipefail
cd "$(dirname "$0")/../.."

local_url="${1:?usage: env.sh <local database url>}"
file=.env.local

# Value of a variable in a dotenv file, or empty if it's unset or blank.
read_var() {
  [ -f "$2" ] || return 0
  sed -nE "s/^[[:space:]]*(export[[:space:]]+)?$1=[[:space:]]*[\"']?([^\"'#[:space:]]*).*$/\2/p" "$2" | tail -n1
}

if [ ! -e "$file" ]; then
  secret=$(node -e 'process.stdout.write(require("crypto").randomBytes(48).toString("base64"))')
  {
    echo "# Created by 'make env' from .env.template. Edit freely; make never overwrites this file."
    sed -e "s#^DATABASE_URL=.*#DATABASE_URL=$local_url#" -e "s#^JWT_SECRET=\$#JWT_SECRET=$secret#" .env.template
  } >"$file"
  echo "Created $file (local DATABASE_URL and a random JWT_SECRET)."
else
  db_url=$(read_var DATABASE_URL "$file")
  if [ -z "$db_url" ]; then
    echo "warning: $file has no DATABASE_URL, so the app can't reach a database. Add:" >&2
    echo "  DATABASE_URL=$local_url" >&2
    echo "  (make leaves your file alone)" >&2
  elif [ "$db_url" != "$local_url" ]; then
    echo "note: DATABASE_URL in $file isn't the local database. make's db targets still use" \
      "the local one, but npm run dev will use yours."
  fi
fi

# Required at start-up by src/server/config.ts. Next.js loads these files in
# this order (first wins), and variables set in the shell win over all of them.
required=(APP_URL JWT_SECRET NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY)
missing=()
for var in "${required[@]}"; do
  value="${!var:-}"
  for f in .env.development.local .env.local .env.development .env; do
    [ -n "$value" ] && break
    value=$(read_var "$var" "$f")
  done
  [ -n "$value" ] || missing+=("$var")
done

if [ ${#missing[@]} -gt 0 ]; then
  echo "warning: npm run dev will fail at start-up until these are set in $file:" >&2
  printf '  %s\n' "${missing[@]}" >&2
fi
