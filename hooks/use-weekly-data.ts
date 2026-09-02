/**
 * Hook to load weekly tarbiya data from the server API with offline caching.
 * Supports years -1 (pregnancy) through 18.
 */
import { useState, useEffect } from "react";
import { fetchWeekData, fetchYearData, getWeekDataSync, getYearDataSync, getYearKeys } from "@/lib/weekly-data";
import { useI18n } from "@/lib/i18n";

interface UseWeeklyDataResult {
  yearData: any;
  loading: boolean;
  error: string | null;
  allYearKeys: string[];
}

/**
 * Loads the data for a specific year number (e.g., -1, 0, 5, 18).
 */
export function useWeeklyData(yearKey: string): UseWeeklyDataResult {
  const { language } = useI18n();
  const lang = language || "ar";
  const yearNum = parseInt(yearKey.replace("Jaar ", ""), 10);
  const isValid = !isNaN(yearNum) && yearNum >= -1 && yearNum <= 18;

  const [yearData, setYearData] = useState<any>(() => {
    if (isValid) return getYearDataSync(yearNum, lang);
    return null;
  });
  const [loading, setLoading] = useState(!yearData && isValid);
  const [error, setError] = useState<string | null>(isValid ? null : "Invalid year key");

  useEffect(() => {
    if (!isValid) return;

    const cached = getYearDataSync(yearNum, lang);
    if (cached) {
      setYearData(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchYearData(yearNum, lang)
      .then((data) => {
        if (!cancelled) {
          setYearData(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message || "Failed to load data");
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [yearNum, lang, isValid]);

  return {
    yearData,
    loading,
    error,
    allYearKeys: getYearKeys(),
  };
}

/**
 * Loads one week per entry — the home and family tabs only ever read the
 * current week, and a week is ~40 KB against 0.9-2.9 MB for a whole year.
 * Keyed by `${yearKey}:${week}`.
 */
export function useMultipleWeekData(entries: { yearKey: string; week: number }[]): Record<string, any> {
  const { language } = useI18n();
  const lang = language || "ar";
  const keyString = entries.map((e) => `${e.yearKey}:${e.week}`).join(",");

  const [dataMap, setDataMap] = useState<Record<string, any>>(() => {
    const map: Record<string, any> = {};
    for (const { yearKey, week } of entries) {
      const yearNum = parseInt(yearKey.replace("Jaar ", ""), 10);
      if (isNaN(yearNum) || yearNum < -1 || yearNum > 18) continue;
      const cached = getWeekDataSync(yearNum, week, lang);
      if (cached) map[`${yearKey}:${week}`] = cached;
    }
    return map;
  });

  useEffect(() => {
    let cancelled = false;
    const unique = new Map(entries.map((e) => [`${e.yearKey}:${e.week}`, e]));

    const loadAll = async () => {
      const map: Record<string, any> = {};
      await Promise.all(
        [...unique].map(async ([mapKey, { yearKey, week }]) => {
          const yearNum = parseInt(yearKey.replace("Jaar ", ""), 10);
          if (isNaN(yearNum) || yearNum < -1 || yearNum > 18) return;
          try {
            const data = await fetchWeekData(yearNum, week, lang);
            if (data) map[mapKey] = data;
          } catch (err) {
            console.warn(`[useMultipleWeekData] Error loading ${mapKey} (${lang}):`, err);
          }
        })
      );
      if (!cancelled) {
        setDataMap(map);
      }
    };

    loadAll();
    return () => { cancelled = true; };
  }, [keyString, lang]);

  return dataMap;
}
