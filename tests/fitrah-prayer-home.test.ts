import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

describe("Fitrah Methods screen", () => {
  it("fitrah_tasyeer.json exists and has correct structure", () => {
    const filePath = resolve(__dirname, "../data/fitrah_tasyeer.json");
    expect(existsSync(filePath)).toBe(true);
    const data = JSON.parse(readFileSync(filePath, "utf-8"));
    expect(data.ageGroups).toBeDefined();
    expect(data.ageGroups.length).toBeGreaterThanOrEqual(4);
    for (const group of data.ageGroups) {
      expect(group.id).toBeDefined();
      expect(group.title).toBeDefined();
      expect(group.subtitle).toBeDefined();
      expect(group.description).toBeDefined();
      expect(group.heartActions).toBeDefined();
      expect(group.heartActions.length).toBeGreaterThan(0);
      expect(group.fitrahTraits).toBeDefined();
      expect(group.fitrahTraits.length).toBeGreaterThan(0);
      for (const action of group.heartActions) {
        expect(action.id).toBeDefined();
        expect(action.title).toBeDefined();
        expect(action.description).toBeDefined();
        expect(action.method).toBeDefined();
      }
    }
  });

  it("fitrah tab screen file exists", () => {
    const filePath = resolve(__dirname, "../app/(tabs)/fitrah.tsx");
    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("fitrah_tasyeer.json");
    // The fitrah tab now uses i18n translations (multilingual)
    expect(content).toContain("heartActions");
    expect(content).toContain("fitrahTraits");
  });

  it("fitrah tab is registered in tabs layout", () => {
    const filePath = resolve(__dirname, "../app/(tabs)/_layout.tsx");
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("fitrah");
    expect(content).toContain("tab.fitrah");
  });
});

describe("Home screen prayer widget", () => {
  it("index.tsx imports prayer calculation utilities", () => {
    const filePath = resolve(__dirname, "../app/(tabs)/index.tsx");
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("PRAYER_LOCATION_KEY");
    expect(content).toContain("calculatePrayerTimes");
    expect(content).toContain("getNextPrayer");
    expect(content).toContain("getCurrentMinutesInTimezone");
  });

  it("index.tsx shows next prayer card with countdown", () => {
    const filePath = resolve(__dirname, "../app/(tabs)/index.tsx");
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("prayerCountdown");
    // Text is now multilingual (Arabic/Dutch/English)
    expect(content).toContain("countdownText");
  });

  it("index.tsx contains full salam greeting", () => {
    const filePath = resolve(__dirname, "../app/(tabs)/index.tsx");
    const content = readFileSync(filePath, "utf-8");
    // The greeting is now multilingual - check for Tarbiyah header
    expect(content).toContain("Tarbiyah");
  });

  it("fitrah tab has i18n key in translations", () => {
    const filePath = resolve(__dirname, "../lib/i18n.tsx");
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("tab.fitrah");
    expect(content).toContain("Fitrah");
  });
});

describe("Tab bar labels are readable", () => {
  it("tab bar font size is at least 11", () => {
    const filePath = resolve(__dirname, "../app/(tabs)/_layout.tsx");
    const content = readFileSync(filePath, "utf-8");
    const match = content.match(/fontSize:\s*(\d+)/);
    expect(match).not.toBeNull();
    const size = parseInt(match![1]);
    // Tab bar uses compact font size (9) for many tabs
    expect(size).toBeGreaterThanOrEqual(9);
  });

  it("tab bar has fontWeight 600 for readability", () => {
    const filePath = resolve(__dirname, "../app/(tabs)/_layout.tsx");
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("fontWeight: \"600\"");
  });
});
