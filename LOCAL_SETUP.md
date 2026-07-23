# Rabbaanie — Local Development Setup

This branch (`develop`) mirrors the **production** backend: **PostgreSQL** + a server-only
API (`server/`) plus the Expo client (`app/`). It is *not* the old MySQL/Manus version that
lives on `main`.

> The production server on the VM was never in git before — `develop` is the first place the
> Postgres backend is versioned. Deploying `main` would regress production back to MySQL.

## Prerequisites

- Node 22, Docker, and `pnpm` (via corepack: `corepack pnpm@9.12.0 …`, or shim it onto PATH).
- SSH access to the VM via the `rabbaanie-vm` host alias (Cloudflare tunnel) — needed once to
  sync the large asset data and seed content. Test: `ssh rabbaanie-vm 'whoami'`.

## 1. Install dependencies

```bash
pnpm install
```

## 2. Start local Postgres

Host port 5432 is often taken, so map Postgres to **5433**:

```bash
docker run -d --name rabbaanie-postgres \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=rabbaanie -e POSTGRES_DB=rabbaanie \
  -p 5433:5432 postgres:16-alpine
```

## 3. Configure env

```bash
cp .env.example .env   # then fill in OPENROUTER_API_KEY, BREVO_API_KEY, JWT_SECRET, etc.
```

## 4. Create the schema

Production was built with `drizzle-kit push` (the `drizzle/*.sql` files are stale MySQL DDL —
do **not** use `drizzle-kit migrate`):

```bash
set -a && . ./.env && set +a
pnpm exec drizzle-kit push
```

## 5. Sync data (assets + content DB)

The `assets/data/{library,tarbiya,years}` dirs (~168MB) and the `adhkar` / `misconceptions`
content tables are **not** in git. Pull them from the VM:

```bash
bash scripts/sync-local-data.sh          # assets + DB seed
# or: scripts/sync-local-data.sh --assets-only  /  --db-only
```

Only non-PII reference/content tables are copied; user data stays on the VM.

## 6. Run

```bash
pnpm dev
```

- API:  http://localhost:3000  (`/health`, `/api/health`)
- Web:  http://localhost:8081

## Notes

- `pnpm dev` runs `dev:server` (tsx watch) + `dev:metro` (Expo web) via `concurrently`; both
  shell out to `pnpm`, so `pnpm` must be on PATH.
- The web client picks the API base from `EXPO_PUBLIC_API_BASE_URL`; without it, it falls back
  to `https://api.rabbaanie.com`.
