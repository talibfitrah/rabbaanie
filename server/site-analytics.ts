// Pure, DB-free aggregation/bucketing logic for website visitor analytics.
//
// Deliberately zero imports from drizzle/db: everything here takes plain
// arrays of already-fetched rows and returns grouped/bucketed summaries, so
// it is unit-testable without mocking a database (compare the mocking
// server/article-reads.ts's own DB-touching functions need in its test file
// — this module needs none of that).
//
// This file is mirrored verbatim on the VM (rabbaanie-api/server/site-analytics.ts),
// where it is paired with DB-touching functions (fetch rows, insert events)
// that import these same exports. Keep the two copies byte-identical for the
// functions below — that's what makes "tested here" mean "true there".

export type ReferrerCategory = "search" | "external" | "direct";

// Domain markers, not full hostnames: "google." (trailing dot, no TLD)
// catches every ccTLD variant (google.com, google.nl, google.co.uk, ...)
// without enumerating them; "bing.com" etc. (no trailing dot) are exact
// known domains. matchesSearchMarker below anchors both at a label
// boundary — a bare .includes() would also match "notgoogle.com" or
// "combing.com", mislabelling an unrelated site as a search engine.
const SEARCH_ENGINE_MARKERS = [
  "google.",
  "bing.com",
  "yahoo.",
  "duckduckgo.com",
  "yandex.",
  "baidu.com",
  "ecosia.org",
  "startpage.com",
];

// Second-level suffixes that precede a country TLD ("google.co.uk").
// ponytail: a hand-list, not a real public-suffix list — enough to tell
// "google.co.uk" (search) from "google.evil.com" (not), without pulling in
// a PSL dependency for a coarse analytics bucket. Add entries if a real
// referrer is ever misfiled.
const SECOND_LEVEL_SUFFIXES = new Set(["co", "com", "org", "net", "gov", "edu", "ac"]);

function matchesSearchMarker(refHost: string, marker: string): boolean {
  if (!marker.endsWith(".")) {
    // Exact known domain, or any of its subdomains.
    return refHost === marker || refHost.endsWith("." + marker);
  }
  // Any TLD: the marker names ONE label ("google"), which must be followed by
  // the public suffix and nothing more. Anchoring only the left — what
  // startsWith/includes did — also matched hosts that merely BEGIN with the
  // label, so "google.com.example.net" and "yahoo.co.uk.phish.io" classified
  // as search engines while belonging to someone else entirely.
  const label = marker.slice(0, -1);
  const labels = refHost.split(".");
  const i = labels.lastIndexOf(label);
  if (i === -1) return false;
  const rest = labels.length - i - 1;
  if (rest === 1) return true; // google.com
  return rest === 2 && SECOND_LEVEL_SUFFIXES.has(labels[i + 1]); // google.co.uk
}

/**
 * Classifies where a visit came from into one of three coarse buckets.
 * Callers must only ever store the returned category, never the `referrer`
 * argument itself — a raw referrer URL can carry a search query or other
 * cross-site detail, which is exactly the kind of cross-site identifier
 * this app's tracking is built to never retain.
 */
export function classifyReferrer(referrer: string | null | undefined, siteHost: string): ReferrerCategory {
  if (!referrer) return "direct";
  let refHost: string;
  try {
    refHost = new URL(referrer).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "direct";
  }
  if (!refHost) return "direct";
  if (refHost === siteHost.toLowerCase().replace(/^www\./, "")) return "direct";
  if (SEARCH_ENGINE_MARKERS.some((marker) => matchesSearchMarker(refHost, marker))) return "search";
  return "external";
}

export interface CountRow {
  key: string;
  count: number;
}

/**
 * Generic "how many rows have each value of this key" — the one grouping
 * primitive every flat breakdown (country/language/category/referrer/page)
 * reduces to. Null/empty keys collapse into `fallback` rather than a bare
 * "null" bucket. Unordered on purpose — callers sort for their own use
 * (chronological for day/week, count-descending for a top-N list).
 */
export function countBy<T>(rows: readonly T[], keyFn: (row: T) => string | null | undefined, fallback: string): CountRow[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = keyFn(row) || fallback;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([key, count]) => ({ key, count }));
}

// Bucketing anchor for dayKey/weekKey below: this app's Postgres (`SHOW
// timezone`, confirmed live) is Europe/Amsterdam, and server/db.ts's own
// getRegistrationAnalytics/getActiveUsersAnalytics already bucket their own
// day charts via SQL DATE(timestamptz) under that same session timezone.
// Bucketing here in plain UTC instead would silently disagree with those
// sibling admin-panel charts by up to the DST offset (1-2h) right around
// local midnight — a real visit lands on "yesterday" or "tomorrow" here
// while showing up on "today" there. Intl.DateTimeFormat (stdlib, no new
// dependency) resolves the local calendar date directly from the IANA zone.
const BUCKET_TIMEZONE = "Europe/Amsterdam";

// Returns null for an unparseable `d` rather than throwing — dayKey/weekKey
// fold that into "" below, which bucketByDay/bucketByWeek already pass as
// their countBy fallback, so one bad row lands in the existing "unknown"
// bucket instead of failing the whole analytics query.
function localDateParts(d: Date | string): { y: number; m: number; day: number } | null {
  const date = new Date(d);
  if (isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: BUCKET_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return { y: get("year"), m: get("month"), day: get("day") };
}

/** Calendar day (Europe/Amsterdam local time) of a timestamp, as its own sortable label. Empty string if `d` is unparseable. */
export function dayKey(d: Date | string): string {
  const parts = localDateParts(d);
  if (!parts) return "";
  return `${parts.y}-${String(parts.m).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

/**
 * Monday (Europe/Amsterdam local time) of the week containing `d`, as its
 * own YYYY-MM-DD — the week's label. Empty string if `d` is unparseable.
 * Not an ISO week NUMBER on purpose: a date the owner can read at a glance
 * beats an abstract "2026-W33" he'd have to decode, and it sidesteps ISO
 * week-numbering's year-boundary edge cases entirely.
 */
export function weekKey(d: Date | string): string {
  const parts = localDateParts(d);
  if (!parts) return "";
  // Anchored at UTC noon on the already-resolved local calendar date, so
  // the Mon-Sun arithmetic below (all UTC-suffixed methods, immune to the
  // host process's own TZ) can't itself cross a date line.
  const anchor = new Date(Date.UTC(parts.y, parts.m - 1, parts.day, 12));
  const dow = (anchor.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
  anchor.setUTCDate(anchor.getUTCDate() - dow);
  return anchor.toISOString().slice(0, 10);
}

export function bucketByDay(rows: readonly { viewedAt: Date | string }[]): CountRow[] {
  return countBy(rows, (r) => dayKey(r.viewedAt), "").sort((a, b) => (a.key < b.key ? -1 : 1));
}

export function bucketByWeek(rows: readonly { viewedAt: Date | string }[]): CountRow[] {
  return countBy(rows, (r) => weekKey(r.viewedAt), "").sort((a, b) => (a.key < b.key ? -1 : 1));
}

export interface CityRow {
  country: string;
  city: string | null;
  count: number;
}

const MIN_DISTINCT_SESSIONS_FOR_CITY = 5;

/**
 * Country/city breakdown, privacy-safe by construction: a city is only ever
 * broken out when at least `minDistinctSessions` distinct SESSIONS visited
 * from it — not raw page-view rows, which one visitor flipping through
 * several pages would otherwise inflate past a row-count threshold alone.
 * This closes the same k-anonymity gap server/article-reads.ts's
 * getArticleReadGeoBreakdown already closes for article reads (there keyed
 * on distinct registered userId; here keyed on the visit's ephemeral
 * sessionId, since page-view visitors are never registered users). Below
 * the threshold, the city's count rolls up into its country instead.
 */
export function groupByCityWithSuppression(
  rows: readonly { country: string | null; city: string | null; sessionId: string | null }[],
  minDistinctSessions: number = MIN_DISTINCT_SESSIONS_FOR_CITY,
): CityRow[] {
  const cells = new Map<string, { country: string; city: string | null; count: number; sessions: Set<string> }>();
  for (const row of rows) {
    const country = row.country || "ZZ";
    const city = row.city || null;
    const cellKey = country + "|" + (city ?? "");
    let cell = cells.get(cellKey);
    if (!cell) {
      cell = { country, city, count: 0, sessions: new Set() };
      cells.set(cellKey, cell);
    }
    cell.count++;
    if (row.sessionId) cell.sessions.add(row.sessionId);
  }

  const byCountryTotal = new Map<string, number>();
  const out: CityRow[] = [];
  for (const cell of cells.values()) {
    if (cell.city && cell.sessions.size >= minDistinctSessions) {
      out.push({ country: cell.country, city: cell.city, count: cell.count });
    } else {
      byCountryTotal.set(cell.country, (byCountryTotal.get(cell.country) ?? 0) + cell.count);
    }
  }
  for (const [country, count] of byCountryTotal) out.push({ country, city: null, count });
  return out.sort((a, b) => b.count - a.count);
}
