#!/bin/bash
# Daily local run: fetch feeds → enrich via Codex CLI → build site/.
# Invoked by launchd (~/Library/LaunchAgents/com.alan.ai-builders-digest.plist).
# Skips if today's data already exists; FORCE=1 to regenerate.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p logs data

# launchd starts with a minimal PATH — load nvm's default node if needed.
if ! command -v node >/dev/null 2>&1; then
  export NVM_DIR="$HOME/.nvm"
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh" >/dev/null
fi

TODAY="$(date +%F)"
LOG="logs/$TODAY.log"
exec >>"$LOG" 2>&1
echo "── run $(date '+%F %T') ──"

if [[ -f "data/$TODAY.json" && "${FORCE:-0}" != "1" ]]; then
  echo "data/$TODAY.json exists, skipping generation"
else
  node scripts/prepare-digest.js | node scripts/enhance.js
fi
node scripts/build-site.js
echo "done $(date '+%T')"
