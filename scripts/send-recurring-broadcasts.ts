/**
 * Cron entrypoint for recurring admin broadcasts (owner-configured weekdays +
 * hour per audience category, managed from app/admin/broadcast.tsx). Run
 * HOURLY by scripts/run-recurring-broadcasts.sh via the VM crontab — each
 * schedule's sendHour only matches one of those runs per day (see
 * server/broadcast-schedule.ts's isScheduleDue).
 *
 * Idempotent per occurrence: markBroadcastScheduleSent advances lastSentAt to
 * today and isScheduleDue's exact-hour match means the schedule isn't due
 * again until its next selected day — so a retried cron tick sends nothing
 * twice. Not exactly-once: if the send succeeds but the mark write then fails
 * (a DB blip; per-recipient push failures are already swallowed inside
 * broadcastLocalizedPush), lastSentAt isn't advanced and the schedule
 * re-sends on its next occurrence — once (daily/weekly), not hourly, precisely
 * because the hour match is exact. The send-log insert is best-effort (its own
 * catch) so a failed report row never masks a successful send. Accepted,
 * self-healing edges for a non-critical reminder push.
 *
 * Each schedule is wrapped in its own try/catch so one failing category
 * (bad template, transient DB error) can't block every schedule after it in
 * the same run.
 */
import "dotenv/config";
import { getDueBroadcastSchedules, markBroadcastScheduleSent, logBroadcastSend } from "../server/db";
import { sendCategoryBroadcast } from "../server/broadcast-send-category";
import { BROADCAST_CATEGORIES, type BroadcastCategory } from "../server/broadcast-audience";

function isKnownCategory(category: string): category is BroadcastCategory {
  return (BROADCAST_CATEGORIES as readonly string[]).includes(category);
}

async function main() {
  const now = new Date();
  const due = await getDueBroadcastSchedules(now);

  if (due.length === 0) {
    console.log("[recurring-broadcast] nothing due");
    return;
  }

  for (const schedule of due) {
    // Both write paths (admin.createSchedule's zod enum, the unique varchar
    // column) block an unrecognized category — this is a read-time backstop
    // for a row that reached the DB some other way (manual SQL, a future
    // migration bug), because selectAudience() applies NO filter at all for
    // an unrecognized category key, which would match every user, not none.
    if (!isKnownCategory(schedule.category)) {
      console.error(`[recurring-broadcast] skipping schedule id=${schedule.id}: unrecognized category "${schedule.category}"`);
      continue;
    }
    try {
      const { sent } = await sendCategoryBroadcast(schedule.category);
      await markBroadcastScheduleSent(schedule.id, now);
      try {
        await logBroadcastSend({ scheduleId: schedule.id, category: schedule.category, recipientCount: sent });
      } catch (logErr) {
        // Report row is best-effort — a failed log insert must not be
        // reported as the send failing (it succeeded and was marked).
        console.error(`[recurring-broadcast] category=${schedule.category} sent=${sent} but send-log insert failed:`, logErr);
      }
      console.log(`[recurring-broadcast] category=${schedule.category} sent=${sent}`);
    } catch (err) {
      console.error(`[recurring-broadcast] category=${schedule.category} failed:`, err);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[recurring-broadcast] failed:", err);
    process.exit(1);
  });
