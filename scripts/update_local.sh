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

# The old weekly steps (scrape_and_merge.py, sanity_check.py, committing the
# JSON and push_supabase.py) were removed in #82: push_supabase.py overwrote
# hand-corrected locations. Scheduled location updates belong in the location
# ETL pipeline (scripts/location_etl_pipeline/), which must respect
# manual_override.

echo "✅ Environment ready."
