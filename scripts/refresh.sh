#!/usr/bin/env bash
# Re-pull the PostHog substrate and rewrite web/public/substrate.json.
# Used by both the on-demand /api/refresh endpoint (vite.config.js) and the
# nightly launchd job (com.progen.journey-substrate.refresh.plist).
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"

# Load PH_KEY (and anything else) from the gitignored .env if present.
if [ -f "$REPO/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$REPO/.env"
  set +a
fi

PY="$(command -v python3 || command -v python)"
mkdir -p "$REPO/logs"
LOG="$REPO/logs/refresh.log"

# Optional lookback window (days), from arg 1 or the PULL_DAYS env; pull_v2.py
# defaults to 45 when unset.
if [ -n "${1:-}" ]; then export PULL_DAYS="$1"; fi

echo "[$(date '+%Y-%m-%d %H:%M:%S %z')] refresh start (PULL_DAYS=${PULL_DAYS:-default})" >>"$LOG"
if "$PY" "$REPO/scripts/pull_v2.py" >>"$LOG" 2>&1; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S %z')] refresh ok" >>"$LOG"
else
  code=$?
  echo "[$(date '+%Y-%m-%d %H:%M:%S %z')] refresh FAILED (exit $code)" >>"$LOG"
  exit $code
fi
