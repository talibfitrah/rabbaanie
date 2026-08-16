-- Owner-mandated spouse-profile access gating.
-- Hand-authored for the production Postgres database — do NOT run through
-- drizzle-kit (this repo's schema.ts is MySQL-flavoured; production is
-- Postgres, ported by hand, same as drizzle/schema.ts's `partnerships` table
-- itself). Apply with: psql "$DATABASE_URL" -f drizzle/postgres-partner-profile-access.sql
--
-- Adds two nullable timestamps to the existing "partnerships" table — no new
-- table. NULL means "not requested" / "not granted".
ALTER TABLE "partnerships"
  ADD COLUMN IF NOT EXISTS "profileAccessRequestedAt" TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "profileAccessGrantedAt" TIMESTAMP;
