import { describe, it, expect, vi } from "vitest";

// app/roznama.tsx is a heavy React Native screen; importing it for its
// exported pure helpers (parseISODate, daysInMonth, computeEffectiveToday)
// still runs every module-level import, so it needs stubbing the same way
// tests/family-calendar-scripture.test.ts stubs react-native for
// app/(tabs)/family.tsx. @/lib/prayer-data and @/lib/calendar-grid are left
// REAL (both are dependency-free, see their source) because
// computeEffectiveToday's whole job is the real maghrib-rollover interaction
// between them -- mocking either away would test nothing. The screen
// component itself is never rendered or called, so every other stub is a
// trivial no-op shape.
vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  ScrollView: "ScrollView",
  Pressable: "Pressable",
  StyleSheet: { create: (styles: unknown) => styles },
  Platform: { OS: "web" }, // skips the native-only DateTimePicker require() at module scope
  TextInput: "TextInput",
  Modal: "Modal",
}));
vi.mock("expo-router", () => ({ useRouter: vi.fn(), useLocalSearchParams: vi.fn(), useFocusEffect: vi.fn() }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: vi.fn() }));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: vi.fn(async () => null), setItem: vi.fn(async () => {}) },
}));
vi.mock("@expo/vector-icons/MaterialIcons", () => ({ default: "MaterialIcons" }));
vi.mock("@/lib/i18n", () => ({ useI18n: vi.fn() }));
vi.mock("@/lib/islamic-calendar", () => ({ getDayOccasions: vi.fn() }));
vi.mock("@/lib/calendar-events", () => ({
  loadEvents: vi.fn(),
  addEvent: vi.fn(),
  updateEvent: vi.fn(),
  removeEvent: vi.fn(),
  eventsForDate: vi.fn(),
}));
vi.mock("@/lib/event-reminders", () => ({ rescheduleEventReminders: vi.fn() }));
vi.mock("@/lib/calendar-alarm", () => ({
  CALENDAR_SOUND_OPTIONS: [],
  loadCalendarSound: vi.fn().mockResolvedValue("default"),
  saveCalendarSound: vi.fn(),
  ensureCalendarAlarmChannels: vi.fn(),
  ensureExactAlarmAllowed: vi.fn().mockResolvedValue(true),
  openAlarmPermission: vi.fn(),
}));

import { parseISODate, daysInMonth, computeEffectiveToday } from "@/app/roznama";
import { calculatePrayerTimes, CALC_METHODS, type SavedPrayerLocation } from "@/lib/prayer-data";

describe("parseISODate", () => {
  it("parses a valid date", () => {
    const d = parseISODate("2026-09-07");
    expect(d).not.toBeNull();
    expect([d!.getFullYear(), d!.getMonth(), d!.getDate()]).toEqual([2026, 8, 7]);
  });

  it("rejects a day that overflows its month (2026-02-31), instead of silently normalizing to March", () => {
    expect(parseISODate("2026-02-31")).toBeNull();
  });

  it("rejects a month out of 1-12 range (2026-13-01), instead of silently normalizing to next year", () => {
    expect(parseISODate("2026-13-01")).toBeNull();
  });

  it("accepts a genuine leap day", () => {
    const d = parseISODate("2024-02-29");
    expect(d).not.toBeNull();
    expect([d!.getFullYear(), d!.getMonth(), d!.getDate()]).toEqual([2024, 1, 29]);
  });

  it("rejects a malformed string", () => {
    expect(parseISODate("not-a-date")).toBeNull();
  });
});

describe("daysInMonth", () => {
  it("leap Feb 2024 has 29 days; non-leap Feb 2025 has 28", () => {
    expect(daysInMonth(2024, 1)).toBe(29);
    expect(daysInMonth(2025, 1)).toBe(28);
  });

  it("clamping 29 Feb 2024's day into 2025 lands on the 28th, not an overflowed 1 March", () => {
    expect(Math.min(29, daysInMonth(2025, 1))).toBe(28);
  });

  it("Jan has 31 days", () => {
    expect(daysInMonth(2026, 0)).toBe(31);
  });
});

describe("computeEffectiveToday", () => {
  const METHOD = CALC_METHODS[0];
  const LOC: SavedPrayerLocation = { country: "Test", city: "Test", lat: 52, lng: 5, tz: Intl.DateTimeFormat().resolvedOptions().timeZone };
  // Real maghrib for this location/date, so the boundary below isn't guessed.
  const { maghrib } = calculatePrayerTimes(new Date(2026, 8, 7, 12, 0, 0), LOC.lat, LOC.lng, METHOD, LOC.tz);
  const [mh, mm] = maghrib.split(":").map(Number);

  it("no rollover before today's Maghrib", () => {
    const justBefore = new Date(2026, 8, 7, mh, mm - 1, 0);
    const result = computeEffectiveToday(justBefore, LOC, METHOD);
    expect([result.getFullYear(), result.getMonth(), result.getDate()]).toEqual([2026, 8, 7]);
  });

  it("rolls to the next civil day at/after Maghrib", () => {
    const atMaghrib = new Date(2026, 8, 7, mh, mm, 0);
    const result = computeEffectiveToday(atMaghrib, LOC, METHOD);
    expect([result.getFullYear(), result.getMonth(), result.getDate()]).toEqual([2026, 8, 8]);
  });

  it("no saved location -> no rollover, even late in the evening", () => {
    const lateEvening = new Date(2026, 8, 7, 23, 0, 0);
    const result = computeEffectiveToday(lateEvening, null, METHOD);
    expect(result.getTime()).toBe(lateEvening.getTime());
  });
});
