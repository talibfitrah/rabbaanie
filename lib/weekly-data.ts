/**
 * Weekly tarbiya data - loaded from the server API on demand.
 * Supports years -1 (pregnancy) through 18.
 * Data is fetched from the server and cached locally for offline use.
 */
import { publicFetch } from "@/lib/authed-fetch";
import { fetchWithCache } from "@/lib/offline-cache";

// In-memory cache for the current session
const memoryCache: Record<string, any> = {};

/**
 * Fetch year data from the server API.
 */
async function fetchFromServer(yearNum: number, lang: string): Promise<any> {
  const input = JSON.stringify({ json: { year: yearNum, lang } });

  // weeklyData.* is public by design — the app reads it before sign-in — so
  // publicFetch, not authedFetch. It still has to go through the transport
  // layer: that is what keeps the base URL in one place.
  const response = await publicFetch(
    `/api/trpc/weeklyData.getYear?input=${encodeURIComponent(input)}`,
    { method: "GET", headers: { "Content-Type": "application/json" } },
  );

  if (!response.ok) {
    throw new Error(`Server returned ${response.status}`);
  }

  const json = await response.json();
  return json?.result?.data?.json ?? json?.result?.data ?? json;
}

/**
 * Fetch a specific week with translation support.
 */
async function fetchWeekFromServer(yearNum: number, weekNum: number, lang: string): Promise<any> {
  const input = JSON.stringify({ json: { year: yearNum, week: weekNum, lang } });

  const response = await publicFetch(
    `/api/trpc/weeklyData.getWeek?input=${encodeURIComponent(input)}`,
    { method: "GET", headers: { "Content-Type": "application/json" } },
  );

  // Throw, never return null: fetchWithCache keeps the stale cached week when
  // its fetcher rejects, but treats a resolved null as a successful empty
  // result and overwrites the user's offline copy with it.
  if (!response.ok) {
    throw new Error(`Server returned ${response.status}`);
  }
  const json = await response.json();
  return json?.result?.data?.json ?? json?.result?.data ?? json;
}

/**
 * Get year data - checks memory cache, then AsyncStorage cache, then fetches from server.
 */
export async function fetchYearData(yearNum: number, lang: string = "ar"): Promise<any> {
  const validLang = ["nl", "en", "ar"].includes(lang) ? lang : "ar";
  const cacheKey = `weekly_tarbiya_${yearNum}_${validLang}`;

  if (memoryCache[cacheKey]) {
    return memoryCache[cacheKey];
  }

  const result = await fetchWithCache(
    cacheKey,
    () => fetchFromServer(yearNum, validLang),
    { ttl: 7 * 24 * 60 * 60 * 1000 }
  );

  if (result.data) {
    memoryCache[cacheKey] = result.data;
    return result.data;
  }

  return { weeks: [], name: "", characteristics: "" };
}

/**
 * Get year data synchronously from memory cache only.
 */
export function getYearDataSync(yearNum: number, lang: string = "ar"): any {
  const validLang = ["nl", "en", "ar"].includes(lang) ? lang : "ar";
  const cacheKey = `weekly_tarbiya_${yearNum}_${validLang}`;
  return memoryCache[cacheKey] || null;
}

/**
 * Get week data synchronously from memory cache only.
 */
export function getWeekDataSync(yearNum: number, weekNum: number, lang: string = "ar"): any {
  const validLang = ["nl", "en", "ar"].includes(lang) ? lang : "ar";
  return memoryCache[`weekly_week_${yearNum}_${weekNum}_${validLang}`] || null;
}

/**
 * Fetch a specific week (with translation if needed).
 */
export async function fetchWeekData(yearNum: number, weekNum: number, lang: string = "ar"): Promise<any> {
  const validLang = ["nl", "en", "ar"].includes(lang) ? lang : "ar";
  const cacheKey = `weekly_week_${yearNum}_${weekNum}_${validLang}`;

  if (memoryCache[cacheKey]) {
    return memoryCache[cacheKey];
  }

  // Every language fetches the single week (~40 KB). Pulling the whole year for
  // Arabic cost 0.9-2.9 MB and overflowed the Android AsyncStorage row, so the
  // cache write never survived and the year was refetched on every open.
  const result = await fetchWithCache(
    cacheKey,
    () => fetchWeekFromServer(yearNum, weekNum, validLang),
    { ttl: 7 * 24 * 60 * 60 * 1000 }
  );

  if (result.data) {
    memoryCache[cacheKey] = result.data;
    return result.data;
  }

  return null;
}

/**
 * Get all available year keys (from -1 to 18)
 */
export function getYearKeys(): string[] {
  return Array.from({ length: 20 }, (_, i) => `Jaar ${i - 1}`);
}

/**
 * Preload year data into memory cache.
 */
export async function preloadYearData(yearNum: number, lang: string = "ar"): Promise<void> {
  await fetchYearData(yearNum, lang);
}

export default {};
