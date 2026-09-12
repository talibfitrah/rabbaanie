/**
 * Covers the JS-side half of the native iqamah auto-mute alarm path
 * (modules/iqamah-alarm): the prior-ringer-mode state must have exactly one
 * owner (the native module, via SharedPreferences) so the JS-driven
 * notification path and the native killed-app path can never disagree about
 * what to restore — see local-docs design note in lib/iqamah-silence.ts.
 *
 * The native module itself is unbuildable/untestable here (no Android
 * device, no gradle build permitted); it is mocked at its JS boundary
 * (modules/iqamah-alarm/src), exactly the boundary lib/iqamah-silence.ts
 * calls through.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("__DEV__", false);
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));

vi.mock("expo-notifications", () => ({
  setNotificationChannelAsync: vi.fn(),
  scheduleNotificationAsync: vi.fn(async () => "id"),
  cancelScheduledNotificationAsync: vi.fn(),
  getAllScheduledNotificationsAsync: vi.fn(async () => []),
  AndroidImportance: { MAX: 5 },
  AndroidNotificationVisibility: { PUBLIC: 1 },
  AndroidNotificationPriority: { MAX: 5, HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: "date" },
}));

const storage = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (k: string) => storage.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: string) => {
      storage.set(k, v);
    }),
    removeItem: vi.fn(async (k: string) => {
      storage.delete(k);
    }),
  },
}));

const nativeMock = {
  isAvailable: vi.fn(() => true),
  scheduleSilenceAlarms: vi.fn(async (_entries: unknown) => 0),
  captureRingerModeIfNeeded: vi.fn(async (_durationMinutes: number) => {}),
  consumePriorRingerMode: vi.fn(async (): Promise<number | null> => null),
};
vi.mock("../modules/iqamah-alarm/src", () => nativeMock);

const volumeManagerMock = {
  checkDndAccess: vi.fn(async () => true),
  requestDndAccess: vi.fn(async () => {}),
  getRingerMode: vi.fn(async () => 2),
  setRingerMode: vi.fn(async (_mode: number) => {}),
};
vi.mock("react-native-volume-manager", () => ({
  VolumeManager: volumeManagerMock,
  RINGER_MODE: { silent: 0, vibrate: 1, normal: 2 },
}));

const IQAMAH_PRIOR_RINGER_KEY = "@iqamah_prior_ringer_mode";

beforeEach(() => {
  storage.clear();
  vi.clearAllMocks();
  nativeMock.isAvailable.mockReturnValue(true);
  nativeMock.consumePriorRingerMode.mockResolvedValue(null);
  volumeManagerMock.checkDndAccess.mockResolvedValue(true);
  volumeManagerMock.getRingerMode.mockResolvedValue(2);
});

afterEach(() => {
  vi.resetModules();
});

describe("handleIqamahSilenceAction: prior-ringer-mode has exactly one owner", () => {
  it("captures via the native module (not AsyncStorage) when the module is available", async () => {
    const { handleIqamahSilenceAction } = await import("../lib/iqamah-silence");
    await handleIqamahSilenceAction("silence");
    // 10 = DEFAULT_IQAMAH_SILENCE_PREFS.silenceDurationMinutes (no prefs saved in this test).
    expect(nativeMock.captureRingerModeIfNeeded).toHaveBeenCalledWith(10);
    expect(storage.has(IQAMAH_PRIOR_RINGER_KEY)).toBe(false);
  });

  it("restores using the mode the native module consumed, applied via VolumeManager", async () => {
    nativeMock.consumePriorRingerMode.mockResolvedValue(1); // vibrate
    const { handleIqamahSilenceAction } = await import("../lib/iqamah-silence");
    await handleIqamahSilenceAction("restore");
    expect(volumeManagerMock.setRingerMode).toHaveBeenCalledWith(1);
  });

  it("never forces the ringer to normal when nothing was captured (the stuck-silent-forever guard)", async () => {
    nativeMock.consumePriorRingerMode.mockResolvedValue(null);
    const { handleIqamahSilenceAction } = await import("../lib/iqamah-silence");
    await handleIqamahSilenceAction("restore");
    expect(volumeManagerMock.setRingerMode).not.toHaveBeenCalled();
  });

  it("falls back to AsyncStorage capture when the native module is unavailable", async () => {
    nativeMock.isAvailable.mockReturnValue(false);
    const { handleIqamahSilenceAction } = await import("../lib/iqamah-silence");
    await handleIqamahSilenceAction("silence");
    expect(nativeMock.captureRingerModeIfNeeded).not.toHaveBeenCalled();
    expect(storage.get(IQAMAH_PRIOR_RINGER_KEY)).toBe("2");
  });
});

describe("restorePhoneSound: manual unstick clears native state and forces normal", () => {
  it("clears the native record and sets the ringer to normal", async () => {
    const { restorePhoneSound } = await import("../lib/iqamah-silence");
    const ok = await restorePhoneSound();
    expect(ok).toBe(true);
    expect(nativeMock.consumePriorRingerMode).toHaveBeenCalled();
    expect(volumeManagerMock.setRingerMode).toHaveBeenCalledWith(2);
  });
});

describe("scheduleIqamahSilence also arms native exact alarms", () => {
  beforeEach(() => {
    storage.set(
      "@prayer_location",
      JSON.stringify({ country: "NL", city: "Utrecht", lat: 52.09, lng: 5.12, tz: "Europe/Amsterdam" }),
    );
    storage.set("@prayer_method", "uoif");
  });

  it("hands the native scheduler one entry per future enabled prayer, each with a unique requestCode", async () => {
    const { scheduleIqamahSilence } = await import("../lib/iqamah-silence");
    await scheduleIqamahSilence("en");

    expect(nativeMock.scheduleSilenceAlarms).toHaveBeenCalledTimes(1);
    const entries = nativeMock.scheduleSilenceAlarms.mock.calls[0][0] as Array<{
      requestCode: number;
      triggerAtMs: number;
      durationMinutes: number;
    }>;
    expect(entries.length).toBeGreaterThan(0);
    const requestCodes = entries.map((e) => e.requestCode);
    expect(new Set(requestCodes).size).toBe(requestCodes.length);
    for (const entry of entries) {
      expect(entry.triggerAtMs).toBeGreaterThan(Date.now());
      // requestCode = dayOffset*5 + prayerIndex ([fajr,dhuhr,asr,maghrib,isha]).
      // With default prefs every window is the 10-min default EXCEPT Friday
      // Dhuhr, which takes the 45-min Jumu'ah slot (2926).
      const prayerIdx = entry.requestCode % 5;
      const d = new Date();
      d.setDate(d.getDate() + Math.floor(entry.requestCode / 5));
      const isFridayDhuhr = prayerIdx === 1 && d.getDay() === 5;
      expect(entry.durationMinutes).toBe(isFridayDhuhr ? 45 : 10);
    }
  });

  it("resolves explicit per-prayer durations, Jumu'ah overriding Friday Dhuhr (2926)", async () => {
    const { scheduleIqamahSilence, saveIqamahSilencePrefs, DEFAULT_IQAMAH_SILENCE_PREFS } = await import(
      "../lib/iqamah-silence"
    );
    await saveIqamahSilencePrefs({
      ...DEFAULT_IQAMAH_SILENCE_PREFS,
      perPrayerDuration: { fajr: 3, dhuhr: 7, asr: 4, maghrib: 6, isha: 8 },
      jumuah: { enabled: true, durationMinutes: 50 },
    });
    await scheduleIqamahSilence("en");

    const entries = nativeMock.scheduleSilenceAlarms.mock.calls[0][0] as Array<{
      requestCode: number;
      durationMinutes: number;
    }>;
    expect(entries.length).toBeGreaterThan(0);
    const perPrayer = [3, 7, 4, 6, 8]; // fajr, dhuhr, asr, maghrib, isha
    for (const entry of entries) {
      const prayerIdx = entry.requestCode % 5;
      const d = new Date();
      d.setDate(d.getDate() + Math.floor(entry.requestCode / 5));
      const isFridayDhuhr = prayerIdx === 1 && d.getDay() === 5;
      // Friday Dhuhr takes the Jumu'ah slot (50), NOT its per-prayer Dhuhr value (7).
      expect(entry.durationMinutes).toBe(isFridayDhuhr ? 50 : perPrayer[prayerIdx]);
    }
  });

  it("schedules no native alarms (empty array) when iqamah silence is disabled", async () => {
    const { scheduleIqamahSilence, saveIqamahSilencePrefs, DEFAULT_IQAMAH_SILENCE_PREFS } = await import(
      "../lib/iqamah-silence"
    );
    await saveIqamahSilencePrefs({ ...DEFAULT_IQAMAH_SILENCE_PREFS, enabled: false });
    await scheduleIqamahSilence("en");

    expect(nativeMock.scheduleSilenceAlarms).toHaveBeenCalledTimes(1);
    expect(nativeMock.scheduleSilenceAlarms).toHaveBeenCalledWith([]);
  });
});

describe("loadIqamahSilencePrefs: Jumu'ah migration for pre-2926 records (2926)", () => {
  // A record written before 2926 has no `jumuah` key. It must NOT silently opt a
  // user who deliberately disabled Dhuhr into a new Friday mute.
  async function storePre2926(dhuhr: boolean) {
    const { saveIqamahSilencePrefs, DEFAULT_IQAMAH_SILENCE_PREFS } = await import("../lib/iqamah-silence");
    const stored: any = { ...DEFAULT_IQAMAH_SILENCE_PREFS };
    delete stored.jumuah;
    stored.prayers = { ...stored.prayers, dhuhr };
    await saveIqamahSilencePrefs(stored);
  }

  it("inherits jumuah.enabled=false from an existing Dhuhr-OFF choice", async () => {
    await storePre2926(false);
    const { loadIqamahSilencePrefs } = await import("../lib/iqamah-silence");
    expect((await loadIqamahSilencePrefs()).jumuah).toEqual({ enabled: false, durationMinutes: 45 });
  });

  it("keeps jumuah ON when the pre-2926 record had Dhuhr ON", async () => {
    await storePre2926(true);
    const { loadIqamahSilencePrefs } = await import("../lib/iqamah-silence");
    expect((await loadIqamahSilencePrefs()).jumuah).toEqual({ enabled: true, durationMinutes: 45 });
  });

  it("never overrides an already-present jumuah preference", async () => {
    const { loadIqamahSilencePrefs, saveIqamahSilencePrefs, DEFAULT_IQAMAH_SILENCE_PREFS } = await import(
      "../lib/iqamah-silence"
    );
    await saveIqamahSilencePrefs({ ...DEFAULT_IQAMAH_SILENCE_PREFS, jumuah: { enabled: false, durationMinutes: 90 } });
    expect((await loadIqamahSilencePrefs()).jumuah).toEqual({ enabled: false, durationMinutes: 90 });
  });

  it("defaults jumuah ON for a fresh install (no stored record)", async () => {
    const { loadIqamahSilencePrefs } = await import("../lib/iqamah-silence"); // storage cleared in beforeEach
    expect((await loadIqamahSilencePrefs()).jumuah).toEqual({ enabled: true, durationMinutes: 45 });
  });
});
