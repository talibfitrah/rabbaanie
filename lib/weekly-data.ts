/**
 * Weekly tarbiya data - loaded from the server API on demand.
 * Supports years -1 (pregnancy) through 18.
 * Data is fetched from the server and cached locally for offline use.
 */
import { getApiBaseUrl } from "@/constants/oauth";
import { fetchWithCache } from "@/lib/offline-cache";

// In-memory cache for the current session
const memoryCache: Record<string, any> = {};

/**
 * Fetch year data from the server API.
 */
async function fetchFromServer(yearNum: number, lang: string): Promise<any> {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    console.warn("[weekly-data] No API base URL configured");
    return null;
  }

  const input = JSON.stringify({ json: { year: yearNum, lang } });
  const url = `${baseUrl}/api/trpc/weeklyData.getYear?input=${encodeURIComponent(input)}`;

  const response = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

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
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) return null;

  const input = JSON.stringify({ json: { year: yearNum, week: weekNum, lang } });
  const url = `${baseUrl}/api/trpc/weeklyData.getWeek?input=${encodeURIComponent(input)}`;

  const response = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) return null;
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
 * Fetch a specific week (with translation if needed).
 */
export async function fetchWeekData(yearNum: number, weekNum: number, lang: string = "ar"): Promise<any> {
  const validLang = ["nl", "en", "ar"].includes(lang) ? lang : "ar";
  const cacheKey = `weekly_week_${yearNum}_${weekNum}_${validLang}`;

  if (memoryCache[cacheKey]) {
    return memoryCache[cacheKey];
  }

  // For Arabic, we can get from the year data
  if (validLang === "ar") {
    const yearData = await fetchYearData(yearNum, validLang);
    if (yearData?.weeks) {
      const week = yearData.weeks.find((w: any) => w.week === weekNum);
      if (week) {
        memoryCache[cacheKey] = week;
        return week;
      }
    }
    return null;
  }

  // For other languages, fetch translated week from server
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
