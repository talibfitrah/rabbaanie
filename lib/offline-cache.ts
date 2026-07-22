/**
 * Offline Cache Utility
 * Provides transparent caching for API responses using AsyncStorage.
 * When online, fetches fresh data and caches it.
 * When offline, returns cached data if available.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const CACHE_PREFIX = "offline_cache_";
const DEFAULT_TTL = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

/**
 * Check if the device is currently online.
 * Falls back to true if detection fails (better to attempt fetch than not).
 */
async function isOnline(): Promise<boolean> {
  try {
    if (Platform.OS === "web") {
      return navigator.onLine !== false;
    }
    // On native, we try a quick HEAD request to check connectivity
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    await fetch("https://clients3.google.com/generate_204", {
      method: "HEAD",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get cached data for a given key.
 * Returns null if no cache exists or if the cache has expired.
 */
export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;

    const entry: CacheEntry<T> = JSON.parse(raw);
    const now = Date.now();

    // Check if cache is still valid (within TTL)
    if (now - entry.timestamp > entry.ttl) {
      // Cache expired, but still return it for offline use
      // The caller can decide whether to use stale data
      return entry.data;
    }

    return entry.data;
  } catch {
    return null;
  }
}

/**
 * Store data in the cache with a TTL.
 */
export async function setCache<T>(key: string, data: T, ttl: number = DEFAULT_TTL): Promise<void> {
  try {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl,
    };
    await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch (err) {
    console.warn("[offline-cache] Failed to cache:", key, err);
  }
}

/**
 * Check if cached data is fresh (within TTL).
 */
export async function isCacheFresh(key: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return false;

    const entry: CacheEntry<any> = JSON.parse(raw);
    return Date.now() - entry.timestamp <= entry.ttl;
  } catch {
    return false;
  }
}

/**
 * Fetch with offline fallback.
 * Tries to fetch fresh data. If successful, caches it.
 * If fetch fails (offline), returns cached data.
 */
export async function fetchWithCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: { ttl?: number; forceRefresh?: boolean } = {}
): Promise<{ data: T | null; fromCache: boolean; error?: string }> {
  const { ttl = DEFAULT_TTL, forceRefresh = false } = options;

  // If not forcing refresh, check if we have fresh cache
  if (!forceRefresh) {
    const fresh = await isCacheFresh(key);
    if (fresh) {
      const cached = await getCached<T>(key);
      if (cached !== null) {
        return { data: cached, fromCache: true };
      }
    }
  }

  // Try to fetch fresh data
  try {
    const online = await isOnline();
    if (!online) {
      // Offline - return cached data even if stale
      const cached = await getCached<T>(key);
      if (cached !== null) {
        return { data: cached, fromCache: true };
      }
      return { data: null, fromCache: false, error: "offline" };
    }

    const data = await fetcher();
    // Cache the fresh data
    await setCache(key, data, ttl);
    return { data, fromCache: false };
  } catch (err: any) {
    // Fetch failed - try cache
    const cached = await getCached<T>(key);
    if (cached !== null) {
      return { data: cached, fromCache: true };
    }
    return { data: null, fromCache: false, error: err?.message || "fetch_failed" };
  }
}

/**
 * Clear all offline cache entries.
 */
export async function clearOfflineCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter((k) => k.startsWith(CACHE_PREFIX));
    if (cacheKeys.length > 0) {
      await AsyncStorage.multiRemove(cacheKeys);
    }
  } catch (err) {
    console.warn("[offline-cache] Failed to clear cache:", err);
  }
}

/**
 * Get cache statistics (for debugging/settings screen).
 */
export async function getCacheStats(): Promise<{ entries: number; totalSize: number }> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter((k) => k.startsWith(CACHE_PREFIX));
    let totalSize = 0;
    for (const key of cacheKeys) {
      const val = await AsyncStorage.getItem(key);
      if (val) totalSize += val.length;
    }
    return { entries: cacheKeys.length, totalSize };
  } catch {
    return { entries: 0, totalSize: 0 };
  }
}
