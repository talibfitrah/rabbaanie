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

// Sync/merge round-trips (partner sync, syncFromServer) bump these fields and
// reorder arrays without changing the actual diagnosis, so they must not flip
// the signature — otherwise "stable for a week" would erode on every app open.
const VOLATILE_DIAGNOSTIC_KEYS = new Set([
  "updatedAt",
  "createdAt",
  "lastUpdated",
  "lastModified",
  "modifiedAt",
  "syncedAt",
  "syncedFromPartner",
]);

/**
 * Canonicalise diagnostic input before hashing: drop volatile sync metadata,
 * sort object keys, and order arrays deterministically so a partner-merge
 * reordering doesn't change the signature. Only genuine diagnostic edits alter it.
 */
function normalizeDiagnostic(value: any): any {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeDiagnostic(item))
      .map((item) => ({ item, key: JSON.stringify(item ?? null) }))
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
      .map((entry) => entry.item);
  }
  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    for (const key of Object.keys(value).sort()) {
      if (VOLATILE_DIAGNOSTIC_KEYS.has(key)) continue;
      out[key] = normalizeDiagnostic(value[key]);
    }
    return out;
  }
  return value;
}

/**
 * Signature of the "diagnostic file" that shapes advice: the parent profile,
 * the per-child environments, the recorded issues, and a child fingerprint
 * (id + name + birthDate — the count/ages/names sent in the advice payload).
 * Advice regenerates when this changes, even within the same week (per
 * Daa3iyah's requirement: fixed for a week unless the diagnostic file changes).
 * Daily check-ins and volatile sync metadata are intentionally excluded so they
 * don't defeat the weekly stability.
 */
export function adviceDiagnosticSig(state: any): string {
  const childFingerprint = (state?.children ?? []).map((c: any) => ({
    id: c?.id,
    name: c?.name,
    birthDate: c?.birthDate,
  }));
  return hash(
    normalizeDiagnostic([
      state?.parentProfile,
      state?.environments,
      state?.issues,
      childFingerprint,
    ])
  );
}
