/**
 * Advice feeds (personal advice, quick tips, ...) are cached per period and only
 * regenerate when the period changes. We key on the current WEEK so advice stays
 * stable for a week instead of refreshing daily. Computed in UTC to match the
 * app's existing "YYYY-MM-DD" date keys. The week is taken to start on Saturday.
 */
export function currentWeekKey(): string {
  const now = new Date();
  const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const daysSinceSaturday = (utc.getUTCDay() + 1) % 7; // Sat=0, Sun=1, ... Fri=6
  utc.setUTCDate(utc.getUTCDate() - daysSinceSaturday);
  return utc.toISOString().slice(0, 10); // date of the most recent Saturday
}

/** Stable hash of arbitrary JSON-serialisable input (djb2 → base36). */
function hash(input: unknown): string {
  const json = JSON.stringify(input ?? null);
  let h = 5381;
  for (let i = 0; i < json.length; i++) h = ((h << 5) + h + json.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * Signature of the "diagnostic file" that shapes advice: the parent profile,
 * the per-child environments, and the recorded issues. Advice is regenerated
 * when this changes, even within the same week (per Daa3iyah's requirement:
 * fixed for a week unless the diagnostic file changes). Daily check-ins are
 * intentionally excluded so they don't defeat the weekly stability.
 */
export function adviceDiagnosticSig(state: any): string {
  return hash([state?.parentProfile, state?.environments, state?.issues]);
}
