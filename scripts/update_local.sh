#!/usr/bin/env bash
set -euo pipefail

# ─── HARDCODED PROJECT PATHS ───────────────────────────
REPO_ROOT="/home/veritas/workspace/pokefindr"
VENV_DIR="$REPO_ROOT/scripts/env"
ENV_FILE="$REPO_ROOT/.env"

# ─── LOAD ENVIRONMENT ───────────────────────────────────
if [[ -f "$ENV_FILE" ]]; then
  # load .env key=val into environment, ignore comments and blank lines
  set -a
  source <(grep -v '^\s*#' "$ENV_FILE" | sed '/^$/d')
  set +a
fi

# ─── ACTIVATE VENV & NAVIGATE ────────────────────────────
cd "$REPO_ROOT"
if [[ -f "$VENV_DIR/bin/activate" ]]; then
  # shellcheck disable=SC1090
  source "$VENV_DIR/bin/activate"
  echo "🟢 Activated virtualenv at $VENV_DIR"
  PYTHON="$VENV_DIR/bin/python3"
  PIP="$VENV_DIR/bin/pip"
else
  echo "⚠️  Virtualenv not found at $VENV_DIR. Using system Python and pip."
  PYTHON="python3"
  PIP="python3 -m pip"
fi

# ─── INSTALL/UPDATE DEPENDENCIES ─────────────────────────
echo "📦 Installing dependencies..."
$PIP install --upgrade pip
$PIP install -r scripts/requirements.txt

# ─── STEP 1: Scrape & Merge ─────────────────────────────
echo "🔍 Running scrape_and_merge.py"
$PYTHON scripts/scrape_and_merge.py

# ─── STEP 2: Sanity Check ────────────────────────────────
echo "🔍 Running sanity_check.py"
$PYTHON scripts/sanity_check.py

# ─── STEP 3: Commit & Push Changes ──────────────────────
echo "🔍 Checking for JSON changes"
git add src/data/vending_machines.json \
        src/data/vending_machines_mod.json \
        src/data/vending_machines_diff.json \
        src/data/vending_machines_flagged.json
if git diff --cached --quiet; then
  echo "ℹ️  No changes to commit."
else
  git commit -m "ci: weekly update vending_machines data"
  git push --force-with-lease origin main
fi

# ─── STEP 4: Upsert to Supabase ─────────────────────────
echo "🔍 Running push_supabase.py"
$PYTHON scripts/push_supabase.py

echo "✅ Weekly update complete."

