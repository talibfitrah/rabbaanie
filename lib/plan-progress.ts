import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Where a plan's ticked-off tasks are stored. The renderer writes it; the weekly
 * plan reads it, so the next plan can carry on from what the parents finished
 * instead of repeating ground they already covered.
 */
export function planProgressKey(issueId: string): string {
  return `@treatment_tasks_${issueId}`;
}

/**
 * Caches what the renderer reports about an advisor plan onto the plan record.
 *
 * The ticks themselves live under planProgressKey; these are just the counts, so
 * the collapsed card and the daily reminder can show a real number without
 * parsing the plan text a second time — a second parser would be free to
 * disagree with the one that drew the checkboxes.
 *
 * Both screens that render a plan call this, or a parent working from one of
 * them would leave the other showing a stale percentage.
 *
 * Returns whether anything changed, so a caller can skip a needless re-render.
 */
// The store holds every plan in one JSON blob, so two overlapping writers each
// read it, each patch their own entry, and the second write puts back a list
// that never saw the first. The runtime is single-threaded, so a promise chain
// is enough; nothing here needs a real lock.
//
// EVERY writer of @advisor_action_plans must go through withPlanStore, not just
// this file. A progress report serialised only against other progress reports
// still loses to an un-queued delete running beside it, and brings the deleted
// plan back — which is exactly the case this was written for.
let writeQueue: Promise<unknown> = Promise.resolve();
export function withPlanStore<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.catch(() => undefined);
  return run;
}

export async function cachePlanProgress(
  planId: string,
  done: number,
  total: number,
): Promise<boolean> {
  return withPlanStore(() => cachePlanProgressUnlocked(planId, done, total));
}

async function cachePlanProgressUnlocked(
  planId: string,
  done: number,
  total: number,
): Promise<boolean> {
  const data = await AsyncStorage.getItem("@advisor_action_plans");
  if (!data) return false;
  const plans = JSON.parse(data);
  const idx = plans.findIndex((p: any) => p.id === planId);
  if (idx < 0) return false;
  if (plans[idx].progressDone === done && plans[idx].progressTotal === total) return false;
  plans[idx] = { ...plans[idx], progressDone: done, progressTotal: total };
  await AsyncStorage.setItem("@advisor_action_plans", JSON.stringify(plans));
  return true;
}

/** How many tasks are ticked, given the raw stored value. */
export function completedTaskCount(raw: string | null): number {
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

/**
 * Fingerprint of how far the parents have got, for the weekly plan's cache key.
 * Ticking another task changes it, so the plan is rebuilt rather than served
 * from the copy made before they made progress.
 */
export function progressSignature(
  progress: { issueId: string; completed: number }[],
): string {
  if (progress.length === 0) return "p0";
  const hash = progress
    .map((p) => `${p.issueId}:${p.completed}`)
    .sort()
    .join(",")
    .split("")
    .reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0);
  // `>>> 0` rather than stripping the sign afterwards. `| 0` yields a SIGNED
  // 32-bit int, so .toString(36).replace("-","") mapped h and -h to the same
  // signature — two different progress states sharing one weekly plan cache
  // key, serving a parent a plan built before their progress. Same shape as
  // issuesSignature in lib/weekplan-cache.ts.
  //
  // Honest about the odds: a brute-force sweep of 160k realistic states found
  // no actual collision, so this was unlikely rather than imminent. It is
  // still cheaper to be correct than to reason about.
  return "p" + (hash >>> 0).toString(36);
}
