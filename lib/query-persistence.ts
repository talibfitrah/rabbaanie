/**
 * Query Persistence for Offline Mode
 * Persists React Query cache to AsyncStorage so data is available offline.
 * Uses a simple approach: save successful query results and restore on app start.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { QueryClient } from "@tanstack/react-query";

const QUERY_CACHE_KEY = "rq_offline_cache";
const MAX_CACHE_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

interface PersistedQuery {
  queryKey: readonly unknown[];
  data: unknown;
  timestamp: number;
}

/**
 * Save the current query cache to AsyncStorage.
 * Only saves successful queries with data.
 */
export async function persistQueryCache(queryClient: QueryClient): Promise<void> {
  try {
    const queryCache = queryClient.getQueryCache();
    const queries = queryCache.getAll();
    const now = Date.now();

    const toPersist: PersistedQuery[] = [];
    for (const query of queries) {
      // Only persist successful queries with data
      if (query.state.status === "success" && query.state.data != null) {
        toPersist.push({
          queryKey: query.queryKey,
          data: query.state.data,
          timestamp: now,
        });
      }
    }

    // Limit to 50 most recent queries to avoid storage bloat
    const limited = toPersist.slice(0, 50);
    await AsyncStorage.setItem(QUERY_CACHE_KEY, JSON.stringify(limited));
  } catch (err) {
    console.warn("[query-persistence] Failed to persist:", err);
  }
}

/**
 * Restore persisted query cache from AsyncStorage.
 * Only restores queries that are within the max cache age.
 */
export async function restoreQueryCache(queryClient: QueryClient): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(QUERY_CACHE_KEY);
    if (!raw) return;

    const persisted: PersistedQuery[] = JSON.parse(raw);
    const now = Date.now();

    for (const entry of persisted) {
      // Skip expired entries
      if (now - entry.timestamp > MAX_CACHE_AGE) continue;

      // Set the cached data in the query client
      queryClient.setQueryData(entry.queryKey as any, entry.data);
    }
  } catch (err) {
    console.warn("[query-persistence] Failed to restore:", err);
  }
}

/**
 * Setup automatic persistence on query cache changes.
 * Debounces saves to avoid excessive writes.
 */
export function setupQueryPersistence(queryClient: QueryClient): () => void {
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;

  const unsubscribe = queryClient.getQueryCache().subscribe(() => {
    // Debounce saves (wait 2 seconds after last change)
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      persistQueryCache(queryClient);
    }, 2000);
  });

  return () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    unsubscribe();
  };
}

/**
 * Clear persisted query cache.
 */
export async function clearPersistedQueryCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(QUERY_CACHE_KEY);
  } catch (err) {
    console.warn("[query-persistence] Failed to clear:", err);
  }
}
