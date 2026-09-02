/**
 * Query Persistence for Offline Mode
 * Persists React Query cache to AsyncStorage so data is available offline.
 * Uses a simple approach: save successful query results and restore on app start.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { QueryClient } from "@tanstack/react-query";

const QUERY_CACHE_KEY = "rq_offline_cache";
const MAX_CACHE_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

// Android's SQLite CursorWindow caps a single AsyncStorage row at ~2 MB; a
// bigger row throws SQLiteBlobTooBigException on read and the whole persisted
// cache becomes permanently unreadable (observed at 2.66 MB in production).
// Keep the serialized blob safely under that limit.
export const MAX_CACHE_BYTES = 1_500_000;

export interface PersistedQuery {
  queryKey: readonly unknown[];
  data: unknown;
  timestamp: number;
}

/**
 * UTF-8 byte length of a string. AsyncStorage on Android stores TEXT as UTF-8,
 * so the CursorWindow limit is on BYTES, not UTF-16 units — an Arabic letter is
 * one JS `.length` unit but 2 bytes on disk, so `.length` under-counts by ~2x
 * for this app's (Arabic) content and could still write an unreadable row.
 */
function utf8ByteLength(s: string): number {
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      bytes += 4; // high surrogate → 4-byte pair; skip the paired low surrogate
      i++;
    } else bytes += 3;
  }
  return bytes;
}

/**
 * Keep entries (in order) while the serialized array stays under maxBytes of
 * UTF-8 (see utf8ByteLength), skipping any entry that would push it over —
 * including a single entry that alone exceeds the cap. Count alone (the old
 * slice(0, 50)) does not bound size: one large response is enough to make the
 * row unreadable.
 */
export function capPersistedQueries(
  entries: PersistedQuery[],
  maxBytes: number = MAX_CACHE_BYTES,
): PersistedQuery[] {
  const kept: PersistedQuery[] = [];
  let total = 2; // the enclosing "[]"
  for (const e of entries) {
    const size = utf8ByteLength(JSON.stringify(e)) + 1; // +1 for the "," separator
    if (total + size <= maxBytes) {
      kept.push(e);
      total += size;
    }
  }
  return kept;
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

    // Limit to the first 50 queries (cache-iteration order, not recency), then
    // cap by SIZE so one large response can't push the row past the
    // CursorWindow limit (see capPersistedQueries).
    const limited = capPersistedQueries(toPersist.slice(0, 50));
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
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(QUERY_CACHE_KEY);
  } catch (err) {
    // An oversized row (SQLiteBlobTooBigException — see MAX_CACHE_BYTES) can
    // never be read; drop it so it stops throwing on every launch and the
    // size-capped writer rebuilds a smaller one. Scoped to the READ so a later
    // per-entry failure can't wipe an otherwise-valid cache.
    console.warn("[query-persistence] Failed to read cache; dropping it:", err);
    AsyncStorage.removeItem(QUERY_CACHE_KEY).catch(() => {});
    return;
  }
  if (!raw) return;

  try {
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
