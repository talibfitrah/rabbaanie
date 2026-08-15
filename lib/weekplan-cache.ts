type IssueStamp = {
  id: string;
  createdAt?: string;
  updatedAt?: string;
};

/**
 * Short, stable fingerprint of a child's open issues.
 *
 * The weekly plan is cached for a week, so a consultation held mid-week used to
 * leave the parent looking at a plan generated before they told the advisor
 * anything. Folding this into the cache key means a new or re-diagnosed issue
 * changes the key, and the next plan is built with those facts.
 */
export function issuesSignature(issues: IssueStamp[]): string {
  if (issues.length === 0) return "none";
  const stamp = issues
    .map((i) => `${i.id}:${i.updatedAt || i.createdAt || ""}`)
    .sort()
    .join("|");
  let hash = 0;
  for (let i = 0; i < stamp.length; i++) {
    hash = (hash * 31 + stamp.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Prefix identifying one child's plan for one language and one week.
 *
 * Pruning is scoped to this, not to the child alone: a broader prefix would
 * delete the still-valid cache for every other language and week, so switching
 * language would pay for a fresh plan instead of using the cached one.
 */
export function weekPlanCachePrefix(
  childId: string,
  lang: string,
  weekInYear: number | null,
  yearKey: string | null,
): string {
  return `weekplan_${childId}_${lang}_${yearKey}_w${weekInYear}_`;
}

/** Built from the prefix so the two can never drift apart. */
export function getWeekPlanCacheKey(
  childId: string,
  lang: string,
  weekInYear: number | null,
  yearKey: string | null,
  issuesSig: string,
): string {
  return weekPlanCachePrefix(childId, lang, weekInYear, yearKey) + issuesSig;
}
