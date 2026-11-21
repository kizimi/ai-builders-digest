#!/bin/bash
# Daily cloud run, used by the scheduled Claude Code task:
#   fetch feeds → enrich via `claude -p` → commit data/YYYY-MM-DD.json → push main.
# The push triggers .github/workflows/daily.yml, which builds and deploys Pages.
# Skips generation if today's data already exists; FORCE=1 to regenerate.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export TZ="${TZ:-America/Los_Angeles}"
export LLM_BACKEND="${LLM_BACKEND:-claude}"
TODAY="$(date +%F)"
BRANCH="${DIGEST_BRANCH:-main}"

git fetch origin "$BRANCH"
git checkout -B "$BRANCH" "origin/$BRANCH"

if [[ -f "data/$TODAY.json" && "${FORCE:-0}" != "1" ]]; then
  echo "data/$TODAY.json already on $BRANCH — nothing to do"
  exit 0
fi

npm ci --no-audit --no-fund
node scripts/prepare-digest.js | node scripts/enhance.js
node scripts/build-site.js   # sanity check that the site still renders

git add "data/$TODAY.json"
git -c user.name="ai-builders-digest bot" -c user.email="noreply@anthropic.com" \
  commit -m "data: digest for $TODAY"
for i in 1 2 3 4; do
  git push origin "$BRANCH" && exit 0
  sleep $((i * 5))
  git pull --rebase origin "$BRANCH"
done
echo "push failed" >&2
exit 1
