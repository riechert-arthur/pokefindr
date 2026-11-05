#!/usr/bin/env bash
# Drops branch databases whose git branch no longer exists locally.
# Keeps main's database and the checked-out branch's.
set -euo pipefail
cd "$(dirname "$0")/../.."

keep=$(
  git for-each-ref --format='%(refname:short)' refs/heads | while read -r branch; do
    scripts/dev/db-name.sh "$branch"
  done
  scripts/dev/db-name.sh
)

psql() { docker compose exec -T db psql -U pokefindr -d postgres -v ON_ERROR_STOP=1 -Atc "$1"; }

dropped=0
for db in $(psql "select datname from pg_database where datname like 'pokefindr\_b\_%'"); do
  if ! grep -qxF "$db" <<<"$keep"; then
    echo "Dropping $db"
    psql "drop database \"$db\" with (force)" >/dev/null
    dropped=$((dropped + 1))
  fi
done
echo "Dropped $dropped branch database(s)."
