import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
// lib/i18n.tsx imports react-native's Flow-typed entry; stub what it touches at
// module scope so the two pure exports can be imported (same recipe as the
// other source-level tests).
vi.mock("react-native", () => ({
  Alert: { alert: () => {} },
  I18nManager: { isRTL: false, allowRTL: () => {}, forceRTL: () => {} },
  Platform: { OS: "ios" },
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
vi.mock("@/lib/language-sync", () => ({ syncLanguageToServer: async () => {} }));

import { disableNativeRTL, rtlRestartNotice } from "@/lib/i18n";

const src = readFileSync(join(__dirname, "..", "lib", "i18n.tsx"), "utf8");

/**
 * Direction is JavaScript-only: `isRTL = language === "ar"` gates layout.
 * Native RTL is off — expo-localization sets allowRTL=false before the bundle
 * loads (tests/ios-config.test.ts asserts the Info.plist keys), and the
 * provider clears both native flags once at startup for the Android pref an
 * earlier build persisted. With native RTL forced, every JS-gated site
 * double-flipped after the restart it demanded.
 */
function fakeManager(isRTL: boolean) {
  const calls: string[] = [];
  return {
    calls,
    manager: {
      isRTL,
      allowRTL: (v: boolean) => { calls.push(`allowRTL(${v})`); },
      forceRTL: (v: boolean) => { calls.push(`forceRTL(${v})`); },
    },
  };
}

describe("disableNativeRTL", () => {
  it.each([true, false])("always writes allowRTL(false) then forceRTL(false) (session RTL=%s)", (booted) => {
    const { calls, manager } = fakeManager(booted);
    expect(disableNativeRTL(manager)).toBe(booted);
    expect(calls).toEqual(["allowRTL(false)", "forceRTL(false)"]);
  });
});

describe("rtlRestartNotice", () => {
  it("fires only for a session that booted natively RTL, in its language", () => {
    expect(rtlRestartNotice("nl", true)?.title).toBe("Herstart vereist");
    expect(rtlRestartNotice("ar", true)?.title).toBe("أعد تشغيل التطبيق");
    expect(rtlRestartNotice("en", true)?.title).toBe("Restart required");
    expect(rtlRestartNotice("ar", false)).toBeNull();
    expect(rtlRestartNotice("nl", false)).toBeNull();
  });
});

describe("lib/i18n.tsx never turns native RTL on", () => {
  it("the only forceRTL call is forceRTL(false); no document.dir write", () => {
    expect(src.match(/forceRTL\([^)]*\)/g)).toEqual(["forceRTL(false)"]);
    expect(src.match(/allowRTL\([^)]*\)/g)).toEqual(["allowRTL(false)"]);
    expect(src).not.toContain("documentElement.dir");
  });
  it("still derives isRTL from the language", () => {
    expect(src).toContain('const isRTL = language === "ar"');
  });
});
