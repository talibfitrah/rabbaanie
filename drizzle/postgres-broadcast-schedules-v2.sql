-- v2: day-of-week + hour scheduling (replaces the "every N days" cadence
-- from drizzle/postgres-broadcast-schedules.sql) + a send-log report table.
-- Hand-authored for the production Postgres database — do NOT run through
-- drizzle-kit (this repo's schema.ts is MySQL-flavoured; production is
-- Postgres, ported by hand, same as drizzle/schema.ts's `broadcastSchedules`
-- table itself). Apply with:
--   psql "$DATABASE_URL" -f drizzle/postgres-broadcast-schedules-v2.sql
--
-- Idempotent: every ADD COLUMN is IF NOT EXISTS, DROP NOT NULL is a no-op if
-- already nullable, the seed-row UPDATE is scoped to rows not yet migrated
-- (so re-running never clobbers a value an admin already set), and the new
-- table is CREATE TABLE IF NOT EXISTS. Safe to apply this file more than
-- once.

-- daysOfWeek: CSV of weekday numbers, 0=Sunday..6=Saturday (e.g.
-- "0,1,2,3,4,5,6"). sendHour: local hour of day, 0-23. Both validated at the
-- tRPC/zod layer (server/routers.ts's daysOfWeekSchema), not a DB
-- CHECK/enum — matching how `category` itself is stored as plain varchar.
ALTER TABLE "broadcast_schedules"
  ADD COLUMN IF NOT EXISTS "daysOfWeek" VARCHAR(32),
  ADD COLUMN IF NOT EXISTS "sendHour" INTEGER;

-- cadenceDays is legacy now (server/broadcast-schedule.ts's isScheduleDue no
-- longer reads it) — dropped NOT NULL instead of dropping the column, so no
-- data is destroyed.
ALTER TABLE "broadcast_schedules" ALTER COLUMN "cadenceDays" DROP NOT NULL;

-- Backfill the 2 existing seed rows (incompletePersonal, incompleteAnalytical
-- — see the base migration) to "every day at 9am", the closest equivalent to
-- their old daily/3-day cadence. Scoped to rows not yet migrated, so this is
-- safe to re-run and never overwrites a value the admin UI has since set.
UPDATE "broadcast_schedules"
SET "daysOfWeek" = '0,1,2,3,4,5,6', "sendHour" = 9
WHERE "daysOfWeek" IS NULL;

-- Report of what a recurring schedule actually sent (owner-facing "تقارير
-- الإرسال" list in app/admin/broadcast.tsx). scheduleId is nullable so a log
-- row survives its schedule being deleted later.
CREATE TABLE IF NOT EXISTS "broadcast_send_log" (
  "id" SERIAL PRIMARY KEY,
  "scheduleId" INTEGER,
  "category" VARCHAR(32) NOT NULL,
  "sentAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "recipientCount" INTEGER NOT NULL
);
