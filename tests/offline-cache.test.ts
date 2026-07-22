import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock AsyncStorage
const mockStorage: Record<string, string> = {};
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn((key: string) => Promise.resolve(mockStorage[key] || null)),
    setItem: vi.fn((key: string, value: string) => {
      mockStorage[key] = value;
      return Promise.resolve();
    }),
    removeItem: vi.fn((key: string) => {
      delete mockStorage[key];
      return Promise.resolve();
    }),
    getAllKeys: vi.fn(() => Promise.resolve(Object.keys(mockStorage))),
    multiRemove: vi.fn((keys: string[]) => {
      keys.forEach((k) => delete mockStorage[k]);
      return Promise.resolve();
    }),
  },
}));

// Mock react-native Platform
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

// Mock fetch
global.fetch = vi.fn();

import { getCached, setCache, fetchWithCache, clearOfflineCache, getCacheStats } from "../lib/offline-cache";

describe("Offline Cache", () => {
  beforeEach(() => {
    // Clear mock storage
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
    vi.clearAllMocks();
  });

  it("should store and retrieve cached data", async () => {
    await setCache("test_key", { name: "test", value: 42 });
    const result = await getCached<{ name: string; value: number }>("test_key");
    expect(result).toEqual({ name: "test", value: 42 });
  });

  it("should return null for non-existent cache", async () => {
    const result = await getCached("non_existent");
    expect(result).toBeNull();
  });

  it("should return stale data even after TTL expires", async () => {
    // Set cache with very short TTL
    await setCache("stale_key", { data: "old" }, 1); // 1ms TTL
    // Wait for TTL to expire
    await new Promise((r) => setTimeout(r, 10));
    // Should still return data (for offline use)
    const result = await getCached("stale_key");
    expect(result).toEqual({ data: "old" });
  });

  it("should clear all cache entries", async () => {
    await setCache("key1", "value1");
    await setCache("key2", "value2");
    await clearOfflineCache();
    const stats = await getCacheStats();
    expect(stats.entries).toBe(0);
  });

  it("fetchWithCache should return fresh data when online", async () => {
    (global.fetch as any).mockResolvedValueOnce({ ok: true }); // isOnline check
    const fetcher = vi.fn().mockResolvedValue({ items: [1, 2, 3] });

    const result = await fetchWithCache("online_test", fetcher, { forceRefresh: true });
    expect(result.data).toEqual({ items: [1, 2, 3] });
    expect(result.fromCache).toBe(false);
    expect(fetcher).toHaveBeenCalled();
  });

  it("fetchWithCache should return cached data when fetcher fails", async () => {
    // Pre-populate cache
    await setCache("fallback_test", { cached: true });

    (global.fetch as any).mockResolvedValueOnce({ ok: true }); // isOnline check
    const fetcher = vi.fn().mockRejectedValue(new Error("Network error"));

    const result = await fetchWithCache("fallback_test", fetcher, { forceRefresh: true });
    expect(result.data).toEqual({ cached: true });
    expect(result.fromCache).toBe(true);
  });

  it("fetchWithCache should use fresh cache without calling fetcher", async () => {
    // Pre-populate cache with fresh data
    await setCache("fresh_test", { fresh: true }, 60000); // 60s TTL

    const fetcher = vi.fn().mockResolvedValue({ new: true });

    const result = await fetchWithCache("fresh_test", fetcher);
    expect(result.data).toEqual({ fresh: true });
    expect(result.fromCache).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
