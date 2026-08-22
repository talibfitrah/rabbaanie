/**
 * Cron entrypoint for recurring admin broadcasts (owner-configured cadence
 * per audience category, managed from app/admin/broadcast.tsx). Run daily by
 * scripts/run-recurring-broadcasts.sh via the VM crontab.
 *
 * Idempotent on the success path: a schedule only becomes due again once
 * markBroadcastScheduleSent has pushed lastSentAt far enough past for
 * isScheduleDue (server/broadcast-schedule.ts) to say so — so a second run
 * on an already-sent day (e.g. a retried cron) finds nothing due and sends
 * nothing twice. Not exactly-once end to end: if sendCategoryBroadcast
 * throws (a DB blip, not a push-delivery failure — broadcastLocalizedPush
 * already swallows those per-recipient), lastSentAt is never advanced, so
 * that one schedule can re-send its whole category on the next run. Treated
 * as an acceptable, self-healing edge for a non-critical reminder push, not
 * worth per-recipient dedup tracking.
 *
 * Each schedule is wrapped in its own try/catch so one failing category
 * (bad template, transient DB error) can't block every schedule after it in
 * the same run — it just retries on the next cron.
 */
import "dotenv/config";
import { getDueBroadcastSchedules, markBroadcastScheduleSent } from "../server/db";
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
