/**
 * Where a plan's ticked-off tasks are stored. The renderer writes it; the weekly
 * plan reads it, so the next plan can carry on from what the parents finished
 * instead of repeating ground they already covered.
 */
export function planProgressKey(issueId: string): string {
  return `@treatment_tasks_${issueId}`;
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
  return (
    "p" +
    progress
      .map((p) => `${p.issueId}:${p.completed}`)
      .sort()
      .join(",")
      .split("")
      .reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)
      .toString(36)
      .replace("-", "")
  );
}
