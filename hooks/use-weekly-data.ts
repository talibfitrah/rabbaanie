/**
 * Hook to load weekly tarbiya data from the server API with offline caching.
 * Supports years -1 (pregnancy) through 18.
 */
import { useState, useEffect } from "react";
import { fetchYearData, getYearDataSync, getYearKeys } from "@/lib/weekly-data";
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
 * Loads multiple years at once.
 */
export function useMultipleYearData(yearKeys: string[]): Record<string, any> {
  const { language } = useI18n();
  const lang = language || "ar";
  const keyString = yearKeys.join(",");

  const [dataMap, setDataMap] = useState<Record<string, any>>(() => {
    const map: Record<string, any> = {};
    for (const key of yearKeys) {
      const yearNum = parseInt(key.replace("Jaar ", ""), 10);
      if (isNaN(yearNum) || yearNum < -1 || yearNum > 18) continue;
      const cached = getYearDataSync(yearNum, lang);
      if (cached) map[key] = cached;
    }
    return map;
  });

  useEffect(() => {
    let cancelled = false;
    const uniqueKeys = [...new Set(yearKeys)];

    const loadAll = async () => {
      const map: Record<string, any> = {};
      await Promise.all(
        uniqueKeys.map(async (key) => {
          const yearNum = parseInt(key.replace("Jaar ", ""), 10);
          if (isNaN(yearNum) || yearNum < -1 || yearNum > 18) return;
          try {
            const data = await fetchYearData(yearNum, lang);
            if (data) map[key] = data;
          } catch (err) {
            console.warn(`[useMultipleYearData] Error loading ${key} (${lang}):`, err);
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
