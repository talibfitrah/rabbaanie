import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Android's SQLite CursorWindow caps a single AsyncStorage row at ~2 MB. The
 * react-query offline cache (key "rq_offline_cache") is written as ONE JSON
 * blob of up to 50 query results; a large response pushed it to ~2.66 MB in
 * production, and every getItem then threw SQLiteBlobTooBixException ("Row too
 * big to fit into CursorWindow"), so the whole cache became permanently
 * unreadable. Two guards: cap the blob by SIZE (not just by count) before
 * writing, and drop a corrupt/oversized row on read so it self-heals.
 */

const getItem = vi.fn((_key: string): Promise<string | null> => Promise.resolve(null));
const setItem = vi.fn((_key: string, _value: string): Promise<void> => Promise.resolve());
const removeItem = vi.fn((_key: string): Promise<void> => Promise.resolve());
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: (key: string) => getItem(key),
    setItem: (key: string, value: string) => setItem(key, value),
    removeItem: (key: string) => removeItem(key),
  },
}));

import {
  capPersistedQueries,
  persistQueryCache,
  restoreQueryCache,
  MAX_CACHE_BYTES,
  type PersistedQuery,
} from "@/lib/query-persistence";

function entry(key: string, dataBytes: number): PersistedQuery {
  return { queryKey: [key], data: "x".repeat(dataBytes), timestamp: Date.now() };
}

/** Minimal QueryClient stand-in exposing only what the code under test reads. */
function fakeClient(queries: { queryKey: unknown[]; data: unknown }[]) {
  return {
    getQueryCache: () => ({
      getAll: () =>
        queries.map((q) => ({
          queryKey: q.queryKey,
          state: { status: "success", data: q.data },
        })),
    }),
  } as any;
}

describe("capPersistedQueries (keeps the persisted blob under the CursorWindow limit)", () => {
  it("keeps every entry when the serialized array is already under the cap", () => {
    const small = [entry("a", 10), entry("b", 10)];
    expect(capPersistedQueries(small)).toHaveLength(2);
  });

  it("drops entries so the serialized cache stays within the byte cap", () => {
    // Five entries ~700 KB each = ~3.5 MB, well over the cap.
    const big = [0, 1, 2, 3, 4].map((i) => entry(`q${i}`, 700_000));
    const capped = capPersistedQueries(big);
    expect(JSON.stringify(capped).length).toBeLessThanOrEqual(MAX_CACHE_BYTES);
    expect(capped.length).toBeLessThan(big.length);
  });

  it("drops a single entry that alone exceeds the cap, keeping the small ones", () => {
    const mixed = [entry("small", 10), entry("huge", MAX_CACHE_BYTES + 500_000)];
    const capped = capPersistedQueries(mixed);
    expect(capped.map((e) => e.queryKey[0])).toContain("small");
    expect(capped.map((e) => e.queryKey[0])).not.toContain("huge");
  });

  it("counts UTF-8 bytes, not UTF-16 length, so Arabic content cannot exceed the byte cap", () => {
    // Arabic (ض, U+0636) is 1 UTF-16 unit but 2 UTF-8 bytes; SQLite stores
    // UTF-8. ~900k chars is ~900 KB by .length yet ~1.8 MB on disk, so a naive
    // char count keeps it and the row still overflows the CursorWindow.
    const arabic = "ض".repeat(900_000);
    const entries: PersistedQuery[] = [
      entry("small", 10),
      { queryKey: ["arabic"], data: arabic, timestamp: Date.now() },
    ];
    const capped = capPersistedQueries(entries, 1_000_000); // 1 MB byte budget
    const keys = capped.map((e) => e.queryKey[0]);
    expect(keys).toContain("small");
    expect(keys).not.toContain("arabic"); // ~1.8 MB in bytes → must be dropped
  });
});

describe("persistQueryCache applies the size cap before writing", () => {
  beforeEach(() => vi.clearAllMocks());

  it("never writes a blob larger than the cap, even with an oversized query", async () => {
    await persistQueryCache(fakeClient([{ queryKey: ["huge"], data: "y".repeat(3_000_000) }]));
    expect(setItem).toHaveBeenCalledTimes(1);
    const written = setItem.mock.calls[0][1];
    expect(written.length).toBeLessThanOrEqual(MAX_CACHE_BYTES);
  });
});

describe("restoreQueryCache self-heals an unreadable row", () => {
  beforeEach(() => vi.clearAllMocks());

  it("clears the persisted cache when getItem throws (SQLiteBlobTooBigException), so it stops failing every launch", async () => {
    getItem.mockRejectedValueOnce(
      new Error("Row too big to fit into CursorWindow"),
    );
    await restoreQueryCache({ setQueryData: vi.fn() } as any);
    expect(removeItem).toHaveBeenCalledWith("rq_offline_cache");
  });

  it("does not clear the cache on a normal empty read", async () => {
    getItem.mockResolvedValueOnce(null);
    await restoreQueryCache({ setQueryData: vi.fn() } as any);
    expect(removeItem).not.toHaveBeenCalled();
  });
});
