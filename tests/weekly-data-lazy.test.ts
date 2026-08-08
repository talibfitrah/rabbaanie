import { describe, expect, it, vi, beforeAll } from "vitest";

// Mock the @/constants/oauth module that weekly-data.ts imports
vi.mock("@/constants/oauth", () => ({
  getApiBaseUrl: () => "http://localhost:3000",
}));

// weekly-data.ts now routes through publicFetch, whose module graph reaches
// lib/_core/auth → react-native (Flow source vitest cannot parse) and native
// storage. Same stubs the other transport-layer suites use.
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn().mockResolvedValue(null),
  setItemAsync: vi.fn().mockResolvedValue(undefined),
  deleteItemAsync: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/lib/offline-cache", () => ({
  getCached: vi.fn().mockResolvedValue(null),
  setCache: vi.fn().mockResolvedValue(undefined),
  isCacheFresh: vi.fn().mockResolvedValue(false),
  fetchWithCache: vi.fn().mockImplementation(async (_key: string, fetcher: () => Promise<any>) => {
    try {
      const data = await fetcher();
      return { data, fromCache: false };
    } catch (e: any) {
      return { data: null, fromCache: false, error: e.message };
    }
  }),
  clearOfflineCache: vi.fn().mockResolvedValue(undefined),
  getCacheStats: vi.fn().mockResolvedValue({ entries: 0, totalSize: 0 }),
}));

describe("weekly-data lazy loading (API-based)", () => {
  let weeklyDataModule: any;

  beforeAll(async () => {
    weeklyDataModule = await import("../lib/weekly-data");
  });

  it("should export getYearKeys that returns all 20 year keys (-1 to 18)", () => {
    const keys = weeklyDataModule.getYearKeys();
    expect(keys).toContain("Jaar -1");
    expect(keys).toContain("Jaar 0");
    expect(keys).toContain("Jaar 18");
    expect(keys.length).toBe(20);
  });

  it("should export fetchYearData as an async function", () => {
    expect(typeof weeklyDataModule.fetchYearData).toBe("function");
  });

  it("should export getYearDataSync that returns null for unfetched years", () => {
    // Nothing has been fetched yet, so cache should be empty
    const result = weeklyDataModule.getYearDataSync(5);
    expect(result).toBeNull();
  });

  it("fetchYearData should handle network errors gracefully", async () => {
    // Mock fetch to simulate network error
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    // fetchYearData should return fallback on error
    const result = await weeklyDataModule.fetchYearData(99);
    expect(result).toHaveProperty("weeks");
    expect(result.weeks).toEqual([]);

    global.fetch = originalFetch;
  });
});
