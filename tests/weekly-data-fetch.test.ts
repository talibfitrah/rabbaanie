import { describe, it, expect, vi, beforeEach } from "vitest";

// fetchWeekData used to load the ENTIRE year (0.9-2.9 MB) just to read one week
// when the language was Arabic. Both mocks keep this suite off react-native and
// off AsyncStorage: publicFetch is the only thing we assert on, and
// fetchWithCache is reduced to "call the fetcher, wrap the result".
const publicFetch = vi.fn();
const fetchWithCache = vi.fn((_k: string, fn: () => Promise<any>) => fn().then((data) => ({ data })));
vi.mock("@/lib/authed-fetch", () => ({ publicFetch }));
vi.mock("@/lib/offline-cache", () => ({ fetchWithCache }));

const { fetchWeekData } = await import("@/lib/weekly-data");

beforeEach(() => publicFetch.mockReset());

describe("fetchWeekData", () => {
  it("asks the server for one week, in Arabic too, never the whole year", async () => {
    publicFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ result: { data: { json: { week: 3, foundations: [] } } } }),
    });

    const w = await fetchWeekData(5, 3, "ar");

    expect(w.week).toBe(3);
    expect(publicFetch).toHaveBeenCalledTimes(1);
    expect(publicFetch.mock.calls[0][0]).toContain("weeklyData.getWeek");
    expect(publicFetch.mock.calls[0][0]).not.toContain("getYear");
  });
});

describe("fetchWeekFromServer error handling", () => {
  it("hands fetchWithCache a fetcher that rejects on a server error, so the stale cached week survives", async () => {
    publicFetch.mockResolvedValue({ ok: false, status: 500 });

    await expect(fetchWeekData(5, 9, "ar")).rejects.toThrow("Server returned 500");

    // fetchWithCache only keeps the stale row when its fetcher REJECTS; a
    // resolved null would overwrite the user's offline copy with nothing.
    const fetcher = fetchWithCache.mock.calls.at(-1)![1];
    await expect(fetcher()).rejects.toThrow("Server returned 500");
  });
});
