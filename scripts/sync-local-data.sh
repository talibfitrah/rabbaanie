#!/usr/bin/env bash
#
# sync-local-data.sh — pull the large asset data + reseed local content DB from the
# production VM. These are NOT versioned in git (see .gitignore / LOCAL_SETUP.md).
#
# Prerequisites:
#   - SSH access to the VM via the `rabbaanie-vm` host alias (Cloudflare tunnel).
#     Test with: ssh rabbaanie-vm 'whoami'
#   - Local Postgres running (default container: rabbaanie-postgres) with the schema
#     already pushed (pnpm exec drizzle-kit push).
#
# Usage:  bash scripts/sync-local-data.sh [--assets-only|--db-only]
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VM_HOST="${VM_HOST:-rabbaanie-vm}"
VM_APP_DIR="${VM_APP_DIR:-/home/murabbie/rabbaanie-api}"
PG_CONTAINER="${PG_CONTAINER:-rabbaanie-postgres}"
LOCAL_DB="${LOCAL_DB:-rabbaanie}"
LOCAL_DB_USER="${LOCAL_DB_USER:-postgres}"

MODE="${1:-all}"

sync_assets() {
  echo "==> Syncing asset data (library, tarbiya, years) from ${VM_HOST}…"
  mkdir -p "${REPO_ROOT}/assets/data"
  for d in library tarbiya years; do
    rsync -az --delete -e ssh \
      "${VM_HOST}:${VM_APP_DIR}/assets/data/${d}/" \
      "${REPO_ROOT}/assets/data/${d}/"
    echo "    ${d}: $(ls "${REPO_ROOT}/assets/data/${d}" | wc -l) files"
  done
}

seed_db() {
  echo "==> Dumping non-PII content tables from ${VM_HOST} and loading into local '${LOCAL_DB}'…"
  # pg_dump runs on the VM using the VM's own .env (no secrets stored here).
  # User PII tables (users, children, messages, families, …) are intentionally excluded.
  ssh "${VM_HOST}" "set -a; . ${VM_APP_DIR}/.env; set +a; \
    pg_dump \"\$DATABASE_URL\" --no-owner --no-privileges --clean --if-exists \
      -t adhkar -t misconceptions -t authors -t content_categories \
      -t content -t content_items -t content_translations \
      -t translation_cache -t network_contacts" \
  | docker exec -i "${PG_CONTAINER}" psql -U "${LOCAL_DB_USER}" -d "${LOCAL_DB}" -v ON_ERROR_STOP=0 >/dev/null
  docker exec "${PG_CONTAINER}" psql -U "${LOCAL_DB_USER}" -d "${LOCAL_DB}" -tAc \
    "SELECT 'adhkar='||count(*) FROM adhkar UNION ALL SELECT 'misconceptions='||count(*) FROM misconceptions;"
}

case "${MODE}" in
  --assets-only) sync_assets ;;
  --db-only)     seed_db ;;
  all|"")        sync_assets; seed_db ;;
  *) echo "Unknown option: ${MODE}"; echo "Usage: $0 [--assets-only|--db-only]"; exit 1 ;;
esac

echo "==> Done."
