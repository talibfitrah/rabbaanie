import { describe, expect, it } from "vitest";
import {
  bucketByDay,
  bucketByWeek,
  classifyReferrer,
  countBy,
  dayKey,
  groupByCityWithSuppression,
  weekKey,
} from "../server/site-analytics";

describe("classifyReferrer", () => {
  it("classifies an empty/missing referrer as direct", () => {
    expect(classifyReferrer("", "rabbaanie.com")).toBe("direct");
    expect(classifyReferrer(null, "rabbaanie.com")).toBe("direct");
    expect(classifyReferrer(undefined, "rabbaanie.com")).toBe("direct");
  });

  it("classifies a same-site referrer as direct", () => {
    expect(classifyReferrer("https://www.rabbaanie.com/page", "rabbaanie.com")).toBe("direct");
    expect(classifyReferrer("https://rabbaanie.com/", "www.rabbaanie.com")).toBe("direct");
  });

  it("classifies a known search engine as search", () => {
    expect(classifyReferrer("https://www.google.com/search?q=x", "rabbaanie.com")).toBe("search");
    expect(classifyReferrer("https://duckduckgo.com/", "rabbaanie.com")).toBe("search");
    expect(classifyReferrer("https://www.bing.com/search?q=x", "rabbaanie.com")).toBe("search");
  });

  it("classifies any other site as external", () => {
    expect(classifyReferrer("https://www.facebook.com/somepage", "rabbaanie.com")).toBe("external");
    expect(classifyReferrer("https://t.me/somechannel", "rabbaanie.com")).toBe("external");
  });

  it("does not mistake a lookalike hostname for the search engine it merely contains as a substring", () => {
    expect(classifyReferrer("https://notgoogle.com/", "rabbaanie.com")).toBe("external");
    expect(classifyReferrer("https://combing.com/", "rabbaanie.com")).toBe("external");
  });

  it("does not mistake a host that merely BEGINS with the engine's label", () => {
    // The marker names one label ("google"), so it must be followed by the
    // public suffix and nothing more — otherwise anyone can park the label at
    // the front of their own domain and be counted as search traffic.
    expect(classifyReferrer("https://google.com.example.net/x", "rabbaanie.com")).toBe("external");
    expect(classifyReferrer("https://yahoo.co.uk.phish.io/", "rabbaanie.com")).toBe("external");
    expect(classifyReferrer("https://google.evil.com/", "rabbaanie.com")).toBe("external");
  });

  it("still matches the real engine, its subdomains and its country TLDs", () => {
    expect(classifyReferrer("https://google.com/search?q=x", "rabbaanie.com")).toBe("search");
    expect(classifyReferrer("https://mail.google.com/", "rabbaanie.com")).toBe("search");
    expect(classifyReferrer("https://cn.bing.com/search?q=x", "rabbaanie.com")).toBe("search");
    expect(classifyReferrer("https://google.nl/search?q=x", "rabbaanie.com")).toBe("search");
    expect(classifyReferrer("https://www.google.co.uk/search?q=x", "rabbaanie.com")).toBe("search");
  });

  it("falls back to direct for an unparseable referrer rather than throwing", () => {
    expect(classifyReferrer("not a url", "rabbaanie.com")).toBe("direct");
  });
});

describe("countBy", () => {
  it("counts rows per key", () => {
    const rows = [{ c: "NL" }, { c: "NL" }, { c: "US" }];
    const result = countBy(rows, (r) => r.c, "ZZ");
    expect(result).toHaveLength(2);
    expect(result).toEqual(expect.arrayContaining([{ key: "NL", count: 2 }, { key: "US", count: 1 }]));
  });

  it("collapses null/empty keys into the fallback", () => {
    const rows = [{ c: null as string | null }, { c: "" }, { c: "NL" }];
    const result = countBy(rows, (r) => r.c, "ZZ");
    expect(result).toHaveLength(2);
    expect(result).toEqual(expect.arrayContaining([{ key: "ZZ", count: 2 }, { key: "NL", count: 1 }]));
  });

  it("returns an empty array for no rows", () => {
    expect(countBy([], (r: any) => r, "ZZ")).toEqual([]);
  });
});

describe("day/week bucketing", () => {
  it("groups rows by calendar day (Europe/Amsterdam local, not UTC)", () => {
    const rows = [
      { viewedAt: "2026-08-10T08:00:00Z" }, // 10:00 local -> Aug 10
      { viewedAt: "2026-08-10T22:00:00Z" }, // 00:00 local NEXT day -> Aug 11
      { viewedAt: "2026-08-11T01:00:00Z" }, // 03:00 local -> Aug 11
    ];
    expect(bucketByDay(rows)).toEqual([
      { key: "2026-08-10", count: 1 },
      { key: "2026-08-11", count: 2 },
    ]);
  });

  it("maps every day of a week onto that week's Monday (Europe/Amsterdam local)", () => {
    // 2026-08-10 is a Monday. 2026-08-16T23:59Z is 2026-08-17 01:59 local —
    // already Monday of the NEXT week, not "Sunday night" — proof this
    // buckets on the local calendar date, not the UTC one.
    expect(weekKey("2026-08-10T00:00:00Z")).toBe("2026-08-10");
    expect(weekKey("2026-08-13T12:00:00Z")).toBe("2026-08-10");
    expect(weekKey("2026-08-16T23:59:00Z")).toBe("2026-08-17");
    expect(weekKey("2026-08-17T00:00:00Z")).toBe("2026-08-17");
  });

  it("groups rows by week", () => {
    const rows = [
      { viewedAt: "2026-08-10T00:00:00Z" }, // Mon
      { viewedAt: "2026-08-16T00:00:00Z" }, // Sun, same week
      { viewedAt: "2026-08-17T00:00:00Z" }, // Mon, next week
    ];
    expect(bucketByWeek(rows)).toEqual([
      { key: "2026-08-10", count: 2 },
      { key: "2026-08-17", count: 1 },
    ]);
  });

  it("returns an empty array for no rows", () => {
    expect(bucketByDay([])).toEqual([]);
    expect(bucketByWeek([])).toEqual([]);
  });

  it("dayKey ignores time-of-day", () => {
    expect(dayKey("2026-08-10T04:00:00Z")).toBe(dayKey("2026-08-10T19:00:00Z"));
  });

  it("falls back to the empty-key bucket for an unparseable timestamp instead of throwing", () => {
    expect(dayKey("not a date")).toBe("");
    expect(weekKey("not a date")).toBe("");
    expect(() => bucketByDay([{ viewedAt: "not a date" }, { viewedAt: "2026-08-10T08:00:00Z" }])).not.toThrow();
  });
});

describe("groupByCityWithSuppression", () => {
  it("keeps a city whose distinct sessions meet the threshold", () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({ country: "NL", city: "Amsterdam", sessionId: "s" + i }));
    expect(groupByCityWithSuppression(rows, 5)).toEqual([{ country: "NL", city: "Amsterdam", count: 6 }]);
  });

  it("suppresses a city with many page views but few distinct sessions (k-anonymity)", () => {
    // One visitor, ten page views, same city — must never be individually named.
    const rows = Array.from({ length: 10 }, () => ({ country: "NL", city: "Belfeld", sessionId: "same-session" }));
    const result = groupByCityWithSuppression(rows, 5);
    expect(result.some((r) => r.city === "Belfeld")).toBe(false);
    expect(result).toEqual([{ country: "NL", city: null, count: 10 }]);
  });

  it("rolls up multiple suppressed cities plus country-only rows into one total", () => {
    const rows = [
      { country: "NL", city: "Tilburg", sessionId: "a" },
      { country: "NL", city: "Utrecht", sessionId: "b" },
      { country: "NL", city: null, sessionId: "c" },
    ];
    expect(groupByCityWithSuppression(rows, 5)).toEqual([{ country: "NL", city: null, count: 3 }]);
  });

  it("returns an empty array for no rows", () => {
    expect(groupByCityWithSuppression([], 5)).toEqual([]);
  });
});
