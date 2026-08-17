-- Owner-mandated spouse-profile access gating.
-- Hand-authored for the production Postgres database — do NOT run through
-- drizzle-kit (this repo's schema.ts is MySQL-flavoured; production is
-- Postgres, ported by hand, same as drizzle/schema.ts's `partnerships` table
-- itself). Apply with: psql "$DATABASE_URL" -f drizzle/postgres-partner-profile-access.sql
--
-- Adds three nullable timestamps to the existing "partnerships" table — no
-- new table. NULL means "not requested" / "not granted" / "not declined".
-- profileAccessDeclinedAt (Fix 1) distinguishes a husband's decline of a
-- pending request from "never asked" — both used to leave the same two
-- columns null, which made them indistinguishable to the wife.
-- IF NOT EXISTS keeps this safe to re-run against a database that already
-- has the first two columns applied.
ALTER TABLE "partnerships"
  ADD COLUMN IF NOT EXISTS "profileAccessRequestedAt" TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "profileAccessGrantedAt" TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "profileAccessDeclinedAt" TIMESTAMP;
