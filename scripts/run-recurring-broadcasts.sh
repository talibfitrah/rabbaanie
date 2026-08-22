#!/bin/bash
# Cron wrapper for scripts/send-recurring-broadcasts.ts. Resolves the app
# root relative to this script's own location, so it works unmodified from
# any checkout path (dev machine or the VM).
#
# Intended crontab line (on the VM, once this is ported — see
# local-docs/ for the port checklist). Runs HOURLY so each schedule's
# owner-configured sendHour (server/broadcast-schedule.ts) gets checked:
#   0 * * * * /home/murabbie/rabbaanie-api/scripts/run-recurring-broadcasts.sh
set -euo pipefail
cd "$(dirname "$0")/.."
npx tsx scripts/send-recurring-broadcasts.ts
