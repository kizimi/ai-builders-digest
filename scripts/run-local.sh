#!/bin/bash
# Daily run on the Mac (uses the ChatGPT/Codex plan quota, no API key):
#   fetch feeds → enrich via Codex CLI → commit data/YYYY-MM-DD.json → push main.
# The push triggers .github/workflows/daily.yml, which builds and deploys
# kizimi.space. Also builds site/ locally for preview.
# Invoked by launchd (~/Library/LaunchAgents/com.alan.ai-builders-digest.plist).
# Skips generation if today's data already exists; FORCE=1 to regenerate.
# NO_PUSH=1 to generate without committing/pushing.

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

export TZ="${TZ:-America/Los_Angeles}"
export LLM_BACKEND="${LLM_BACKEND:-codex}"
TODAY="$(date +%F)"
LOG="logs/$TODAY.log"
exec >>"$LOG" 2>&1
echo "── run $(date '+%F %T') ──"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "${NO_PUSH:-0}" != "1" ]]; then
  if [[ "$BRANCH" != "main" ]]; then
    echo "not on main (on $BRANCH) — will generate but not push"
    NO_PUSH=1
  else
    git fetch origin main
    # data/ used to be gitignored: drop local untracked copies of files that
    # are now on main with identical content, so the pull doesn't refuse.
    git ls-files --others --exclude-standard -- data/ | while read -r f; do
      if git cat-file -e "origin/main:$f" 2>/dev/null && git show "origin/main:$f" | cmp -s - "$f"; then
        rm -f "$f"
      fi
    done
    git pull --rebase --autostash origin main
  fi
fi

if [[ -f "data/$TODAY.json" && "${FORCE:-0}" != "1" ]]; then
  echo "data/$TODAY.json exists, skipping generation"
else
  node scripts/prepare-digest.js | node scripts/enhance.js
fi
node scripts/build-site.js

if [[ "${NO_PUSH:-0}" != "1" ]]; then
  git add "data/$TODAY.json"
  if git diff --cached --quiet; then
    echo "data/$TODAY.json already committed"
  else
    git commit -m "data: digest for $TODAY" -- "data/$TODAY.json"
  fi
  for i in 1 2 3; do
    if git push origin main; then break; fi
    sleep $((i * 10))
    git pull --rebase --autostash origin main
  done
fi
echo "done $(date '+%T')"
