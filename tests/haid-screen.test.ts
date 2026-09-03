import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// Source-level guards, same style as tests/prayer-popup-haid.test.ts and
// tests/wife-cycle-status.test.ts: no renderer is installed in this project,
// and the spec (item F) explicitly allows source-guard coverage for this
// screen — kept honest by asserting the exact fixed pattern and, where it
// matters, the absence of the old buggy one.
const src = readFileSync(join(__dirname, "..", "app", "haid.tsx"), "utf8");

describe("app/haid.tsx (item F: screen fixes)", () => {
  it("redirects away only once loading has settled, not mid-hydration", () => {
    expect(src).toContain("if (!loading && isAuthenticated && !isWoman)");
  });

  it("the purity-check card shows only while today is actually excused (haid/nifas), not merely non-tuhr", () => {
    expect(src).toContain("isExcusedToday(classified, today)");
    expect(src).not.toContain('todayCls.status !== "tuhr"');
  });

  // C12: carrying a prior blood day's colour onto a dry/spotting entry made
  // the server reject the request outright (color only applies to flow:
  // blood) — she'd stay stuck classified excused, unable to log purity.
  it("log() preserves the existing entry's colour when logging blood, but clears it for dry/spotting (C12)", () => {
    expect(src).toContain('const color = flow === "blood" ? (extra.color ?? existing?.color ?? null) : null;');
    expect(src).toContain("upsertDay.mutate({ date: selected, flow, color, ghusl: extra.ghusl ?? false });");
  });

  it("the ghusl button's dead byDate.get(selected) conjunct is gone", () => {
    expect(src).not.toContain("byDate.get(selected) &&");
    expect(src).toContain('log(days.find((d) => d.date === selected)?.flow || "dry", { ghusl: true })');
  });

  it("the invalid-date alert passes a real title and message, not a single bare string", () => {
    expect(src).toMatch(/Alert\.alert\(tx\(lang, "[^"]+", "[^"]+", "[^"]+"\), tx\(lang, "[^"]+", "[^"]+", "[^"]+"\)\)/);
  });

  it("every mutation gets an onError handler alongside its onSuccess", () => {
    // Not "onSuccess: invalidate" specifically — disable's onSuccess (C9) is
    // a custom function that calls invalidate() plus syncHaidNotifications,
    // not the bare shorthand the other three use. The invariant is that
    // every mutation with a success handler also has this error handler.
    const successCount = (src.match(/onSuccess: /g) || []).length;
    const errorCount = (src.match(/onError: onMutationError/g) || []).length;
    expect(successCount).toBe(4); // upsertDay, deleteDay, saveSettings, disable
    expect(errorCount).toBe(4);
  });

  it("the Save button reflects a pending save", () => {
    expect(src).toContain("isSaving");
    expect(src).toMatch(/disabled=\{isSaving\}/);
  });

  it("kaffarah_info renders behind a small More toggle, not directly in the notes list", () => {
    expect(src).toContain('if (n === "kaffarah_info") return false;');
    expect(src).toContain("hasKaffarahInfo");
    expect(src).toMatch(/tx\(lang, "Meer", "More", "المزيد"\)/);
  });

  it("onset-only notes are filtered by the screen: qadaa only on the run's first day, the ghusl-due note only on the first ghuslDue day", () => {
    expect(src).toContain("selectedCls.runDay === 1");
    expect(src).toContain('prevCls?.status === "haid" || prevCls?.status === "nifas"');
  });

  it("date fields are validated with a real calendar round-trip, not just the regex shape", () => {
    expect(src).toContain('new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s');
  });
});

// C9: disable() used to only invalidate cycle.getMine — the screen effect
// that would otherwise call syncHaidNotifications explicitly bails when
// settings.enabled is false, so a stale excused flag + purity/ghusl alarms
// from before disabling survived indefinitely. Disable deletes all her days
// server-side, so an empty days list always resolves to excused:false.
describe("app/haid.tsx disable() clears the pause immediately (C9)", () => {
  it("does not rely on the screen effect — it syncs (empty days) right in onSuccess", () => {
    const start = src.indexOf("const disable = trpc.cycle.disable.useMutation({");
    const end = src.indexOf("\n\n", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = src.slice(start, end);
    expect(block).toContain("syncHaidNotifications({ userId: user.id, days: [], settings: DEFAULT_SETTINGS, language: lang })");
  });
});

// Daa3iyah UX feedback: (1) the header gear opened a settings panel rendered
// at the very bottom of the ScrollView, invisible from the top; (2) after
// logging a day, the resulting ruling sat in a card ABOVE the log buttons,
// so tapping a flow button updated a ruling the user had already scrolled
// past. Layout-only fix — no fiqh rule changes.
describe("app/haid.tsx (UX: discoverable settings + the logged ruling visible where you log)", () => {
  it("settings panel has its own close (X) control, not just the header gear", () => {
    expect(src).toContain('name="close"');
    expect(src).toMatch(/onPress=\{\(\) => setShowSettings\(false\)\}/);
  });

  it("settings panel renders inline right after the header row, not after Predictions at the bottom", () => {
    const settingsIdx = src.indexOf("<SettingsCard");
    const headerGearIdx = src.indexOf('name="settings"');
    const predictionsIdx = src.indexOf('"Verwachtingen"');
    expect(settingsIdx).toBeGreaterThan(-1);
    expect(headerGearIdx).toBeGreaterThan(-1);
    expect(predictionsIdx).toBeGreaterThan(-1);
    expect(settingsIdx).toBeGreaterThan(headerGearIdx);
    expect(settingsIdx).toBeLessThan(predictionsIdx);
  });

  it("quick-log buttons render above the resulting ruling, in the same card, so the ruling is visible right where she logs", () => {
    const ghuslButtonIdx = src.indexOf('log(days.find((d) => d.date === selected)?.flow || "dry", { ghusl: true })');
    const rulingIdx = src.indexOf("T.prayer[rulings.prayer]");
    expect(ghuslButtonIdx).toBeGreaterThan(-1);
    expect(rulingIdx).toBeGreaterThan(-1);
    expect(ghuslButtonIdx).toBeLessThan(rulingIdx);
  });

  it("opening settings scrolls the screen to the top so the panel isn't off-screen", () => {
    expect(src).toContain("useRef<ScrollView>(null)");
    // Invariant: some effect gated on showSettings scrolls to y: 0 — not the
    // exact one-line phrasing/whitespace, so a reformat doesn't break this.
    expect(src).toMatch(/showSettings[\s\S]{0,80}scrollTo\(\{[^}]*\by:\s*0\b[^}]*\}\)/);
  });
});

describe("lib/haid-text.ts (item F: house wudu spelling, server/advice.ts:360-361)", () => {
  const haidTextSrc = readFileSync(join(__dirname, "..", "lib", "haid-text.ts"), "utf8");
  it("uses wudoe'/wudoo', not the old woedoe'/wudu' spelling", () => {
    expect(haidTextSrc).not.toContain("Woedoe'");
    expect(haidTextSrc).not.toContain("woedoe'");
    expect(haidTextSrc).not.toContain("Wudu'");
    expect(haidTextSrc).not.toContain("wudu'.");
    expect(haidTextSrc).toContain("Wudoe'");
    expect(haidTextSrc).toContain("wudoe'");
    expect(haidTextSrc).toContain("Wudoo'");
    expect(haidTextSrc).toContain("wudoo'.");
  });
});
