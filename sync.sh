#!/usr/bin/env bash
# Run this to get the latest code. Safe to run any time, as often as you like.
# Your own work is committed first, so nothing you have can ever be lost.
set -euo pipefail
cd "$(dirname "$0")"

git add -A
git diff --cached --quiet || git commit -qm "wip: $(date '+%Y-%m-%d %H:%M')"

if git pull --rebase --no-edit origin main; then
  echo
  echo "Up to date. Your work is saved in commits on this machine."
else
  git rebase --abort 2>/dev/null || true
  echo
  echo "STOP - the same file was changed in two places and I can't decide which wins."
  echo "Nothing was lost or changed. Send Farouq this message."
  exit 1
fi
