-- Husband-gated co-wife direct messaging switch.
-- Hand-authored for the production Postgres database — do NOT run through
-- drizzle-kit (this repo's schema.ts is MySQL-flavoured; production is
-- Postgres, ported by hand, same as drizzle/schema.ts's `partnerships` table
-- itself and the coWivesVisible column beside it). Apply with:
--   psql "$DATABASE_URL" -f drizzle/postgres-partnerships-cowives-can-chat.sql
--
-- Adds one boolean to the existing "partnerships" table — no new table.
-- Defaults false: an existing partnership stays chat-disabled until the
-- husband explicitly turns it on (same default as coWivesVisible).
-- IF NOT EXISTS keeps this safe to re-run.
ALTER TABLE "partnerships"
  ADD COLUMN IF NOT EXISTS "coWivesCanChat" boolean NOT NULL DEFAULT false;
