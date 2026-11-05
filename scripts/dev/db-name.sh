#!/usr/bin/env bash
# Prints the local database name for a git branch (default: the checked-out one).
# main uses "pokefindr"; every other branch gets its own database
# (see "Branch databases" in docs/database.md).
#
#   scripts/dev/db-name.sh                  # current branch
#   scripts/dev/db-name.sh feat/my-change   # pokefindr_b_feat_my_change_1a2b3c
set -euo pipefail
cd "$(dirname "$0")/../.."

main_branch=${MAIN_BRANCH:-main}

if [ $# -gt 0 ]; then
  branch=$1
elif ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo pokefindr # not a git checkout (e.g. a tarball)
  exit
else
  branch=$(git symbolic-ref --quiet --short HEAD || echo "detached-$(git rev-parse --short HEAD)")
fi

if [ "$branch" = "$main_branch" ]; then
  echo pokefindr
  exit
fi

# Postgres names max out at 63 bytes. The hash keeps truncated or
# differently-punctuated branch names (feat/a-b vs feat/a_b) apart.
slug=$(printf '%s' "$branch" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/_/g' | cut -c1-40)
hash=$(printf '%s' "$branch" | sha1sum | cut -c1-6)
echo "pokefindr_b_${slug}_${hash}"
