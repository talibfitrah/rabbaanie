import { describe, it, expect, vi } from "vitest";

// lib/i18n.tsx reaches react-native and AsyncStorage at module scope; the
// function under test touches neither, so empty stubs are enough to let the
// module import at all (react-native's package entry uses Flow syntax vitest
// cannot parse). Same recipe as tests/daily-checkin-notification.test.ts.
vi.mock("react-native", () => ({
  I18nManager: { isRTL: false, forceRTL: () => {}, allowRTL: () => {} },
  Platform: { OS: "android" },
  Alert: { alert: () => {} },
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: async () => null, setItem: async () => {} },
}));
vi.mock("@/lib/language-sync", () => ({ syncLanguageToServer: () => {} }));

import { rtlRestartNotice, applyRTLForLanguage } from "@/lib/i18n";

/**
 * Bug: picking Arabic and staying in the app left the session half-flipped.
 * I18nManager.forceRTL writes a flag the NEXT launch reads — react-native's
 * I18nManager.js snapshots `isRTL` when the bundle loads and never writes it
 * back — so `textAlign` and the chevrons (which read the app's own `isRTL`
 * state) turned RTL immediately while every plain `flexDirection: "row"` kept
 * laying out left-to-right. Nothing in this app can reload itself to close the
 * gap (expo-updates is not a dependency; hooks/use-updates.ts installs APKs),
 * so the honest fix is to tell the user a restart is needed.
 */
describe("rtlRestartNotice — a language change that flips the layout direction must say so", () => {
  it("asks for a restart when an LTR session switches to Arabic", () => {
    expect(rtlRestartNotice("ar", false)).not.toBeNull();
  });

  it("asks for a restart when an RTL session switches away from Arabic", () => {
    expect(rtlRestartNotice("en", true)).not.toBeNull();
    expect(rtlRestartNotice("nl", true)).not.toBeNull();
  });

  // Absence too: a restart prompt on a switch that changes nothing about the
  // direction — nl <-> en, or re-picking the language already running — is
  // noise, and noise is what teaches users to dismiss the real one.
  it("stays silent when the direction does not change", () => {
    expect(rtlRestartNotice("ar", true)).toBeNull();
    expect(rtlRestartNotice("en", false)).toBeNull();
    expect(rtlRestartNotice("nl", false)).toBeNull();
  });

  // The user has just switched TO this language; a notice written in the one
  // they are leaving is the single wording guaranteed to be unreadable.
  it("writes the notice in the language being switched to", () => {
    const ar = rtlRestartNotice("ar", false)!;
    const en = rtlRestartNotice("en", true)!;
    const nl = rtlRestartNotice("nl", true)!;
    expect(ar.title).toMatch(/[؀-ۿ]/);
    expect(en.title).not.toBe(nl.title);
    for (const n of [ar, en, nl]) expect(n.body.length).toBeGreaterThan(0);
  });
});

/**
 * Bug: the persisted direction flag and the chosen language could disagree.
 * I18nManager.isRTL is a bundle-load snapshot that does NOT track forceRTL
 * calls made earlier in the same session, so gating the WRITE on it meant a
 * second flip back within one session never wrote anything: pick Arabic
 * (flag -> true, "restart" alert shown), change your mind back to Dutch
 * (isRTL is still false, so the notice is null and the whole block was
 * skipped), restart as instructed — and the app boots right-to-left with
 * Dutch text, only self-correcting on the launch after that.
 *
 * The flag write is unconditional now; only the NOTICE is session-relative.
 */
describe("applyRTLForLanguage — the stored direction always matches the chosen language", () => {
  const fakeManager = (isRTL: boolean) => ({
    isRTL,
    written: [] as boolean[],
    allowed: [] as boolean[],
    forceRTL(v: boolean) { this.written.push(v); },
    allowRTL(v: boolean) { this.allowed.push(v); },
  });

  it("writes the flag on a second flip back within one session", () => {
    const mgr = fakeManager(false); // LTR session
    applyRTLForLanguage("ar", mgr);
    applyRTLForLanguage("nl", mgr); // mgr.isRTL is still false — the snapshot
    expect(mgr.written).toEqual([true, false]);
  });

  it.each([["ar", true], ["en", false], ["nl", false]] as const)(
    "stores %s as isRTL=%s regardless of the session's own direction",
    (lang, expected) => {
      for (const sessionIsRTL of [true, false]) {
        const mgr = fakeManager(sessionIsRTL);
        applyRTLForLanguage(lang, mgr);
        expect(mgr.written).toEqual([expected]);
        expect(mgr.allowed).toEqual([expected]);
      }
    },
  );

  // The notice stays session-relative: it describes the gap between the
  // direction on screen right now and the one just stored.
  it("returns the same notice rtlRestartNotice would, and null when nothing flips", () => {
    expect(applyRTLForLanguage("ar", fakeManager(false))).toEqual(rtlRestartNotice("ar", false));
    expect(applyRTLForLanguage("ar", fakeManager(true))).toBeNull();
    expect(applyRTLForLanguage("nl", fakeManager(false))).toBeNull();
  });
});
