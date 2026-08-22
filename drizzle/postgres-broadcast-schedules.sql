-- Recurring automated admin broadcasts (owner-managed cadence per audience
-- category, e.g. "daily to users with an incomplete personal profile").
-- Hand-authored for the production Postgres database — do NOT run through
-- drizzle-kit (this repo's schema.ts is MySQL-flavoured; production is
-- Postgres, ported by hand, same as drizzle/schema.ts's `broadcastSchedules`
-- table itself). Apply with:
--   psql "$DATABASE_URL" -f drizzle/postgres-broadcast-schedules.sql
--
-- category is one of server/broadcast-audience.ts's BROADCAST_CATEGORIES
-- ("incompletePersonal" | "incompleteAnalytical" | "incompleteChildren" |
-- "notLinkedSpouse") — validated at the tRPC/zod layer, not by a DB
-- CHECK/enum, matching how every other category string in this schema
-- (e.g. spouse_advice.category) is stored as plain varchar.
--
-- IF NOT EXISTS keeps the CREATE TABLE safe to re-run. The seed INSERTs
-- below are re-run-safe too (each guarded by its own NOT EXISTS), so
-- applying this file twice neither errors nor duplicates rows.
CREATE TABLE IF NOT EXISTS "broadcast_schedules" (
  "id" SERIAL PRIMARY KEY,
  -- UNIQUE: at most one schedule per category — two active schedules for the
  -- same category would double-push every matching user each cycle.
  "category" VARCHAR(32) NOT NULL UNIQUE,
  "cadenceDays" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT false,
  "lastSentAt" TIMESTAMP,
  "createdBy" INTEGER,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Seed rows, both OFF by default. A daily mass-push must not auto-fire on
-- deploy — the owner turns each one on from the in-app admin screen once
-- ready.
INSERT INTO "broadcast_schedules" ("category", "cadenceDays", "active")
SELECT 'incompletePersonal', 1, false
WHERE NOT EXISTS (SELECT 1 FROM "broadcast_schedules" WHERE "category" = 'incompletePersonal');

INSERT INTO "broadcast_schedules" ("category", "cadenceDays", "active")
SELECT 'incompleteAnalytical', 3, false
WHERE NOT EXISTS (SELECT 1 FROM "broadcast_schedules" WHERE "category" = 'incompleteAnalytical');
