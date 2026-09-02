import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Bug: these screens kept their own `useState("ar")` + async AsyncStorage
 * read of "@app_language" instead of the I18nProvider they already render
 * under — so the first frame was Arabic in a Dutch/English app, and stayed
 * Arabic whenever the read failed. Source-level guard (no renderer is
 * installed; same style as tests/prayer-popup-haid.test.ts): the language
 * must come from useI18n(), and no screen may read the storage key itself.
 */
describe.each(["qiyam.tsx", "ai-chat.tsx"])("app/%s takes its language from I18nProvider", (file) => {
  const src = readFileSync(join(__dirname, "..", "app", file), "utf8");

  it("reads language from useI18n()", () => {
    expect(src).toMatch(/import \{[^}]*\buseI18n\b[^}]*\} from "@\/lib\/i18n"/);
    expect(src).toMatch(/\{[^}]*\blanguage\b[^}]*\} = useI18n\(\)/);
  });

  it("does not keep its own copy of the language", () => {
    expect(src).not.toContain('"@app_language"');
    expect(src).not.toMatch(/useState<[^>]*>\("ar"\)/);
  });
});

// Same complaint on app/details/adhkar.tsx: tap hint, completion line and
// post-prayer title were Arabic-only regardless of the app language.
describe("app/details/adhkar.tsx renders its chrome in the app language", () => {
  const src = readFileSync(join(__dirname, "..", "app", "details", "adhkar.tsx"), "utf8");
  // The invariant, not the copy: every line carrying one of these Arabic
  // chrome literals is a language ternary, so nl/en users never see it.
  it.each(["أحسنت", "اضغط", "أذكار بعد"])("every line with %j is language-gated", (ar) => {
    const lines = src.split("\n").filter((l) => l.includes(ar));
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l).toContain("language ===");
  });
});

// Native RTL (I18nManager.forceRTL) is gone; the app's one direction mechanism
// is JavaScript gating. These files had plain `flexDirection: "row"` and no
// gate, so their icon/badge/button-beside-text rows rendered LTR for Arabic.
// Presence guard: the capability must not vanish silently.
describe.each([
  "app/child-account/login.tsx",
  "app/details/adhkar.tsx",
  "app/id-management.tsx",
  "app/qr-scanner.tsx",
  "app/specialist/register.tsx",
  "components/sync-toast.tsx",
  "components/prayer-popup-modal.tsx",
])("%s gates its rows on isRTL", (file) => {
  it("uses the JS direction gate", () => {
    const src = readFileSync(join(__dirname, "..", file), "utf8");
    expect(src).toContain('isRTL ? "row-reverse" : "row"');
  });
});

// adhkar.tsx reward/howTo/source text is nl/en in those languages, so its
// alignment is gated inline; only dhikrText (always Arabic) stays static rtl.
describe("app/details/adhkar.tsx gates reward/source text alignment", () => {
  const src = readFileSync(join(__dirname, "..", "app", "details", "adhkar.tsx"), "utf8");
  it.each(["rewardText:", "sourceText:"])("stylesheet %s carries no static direction", (key) => {
    const block = src.match(new RegExp(key + "\\s*\\{[^}]*\\}"))?.[0];
    expect(block).toBeDefined();
    expect(block).not.toContain('writingDirection: "rtl"');
    expect(block).not.toContain('textAlign: "right"');
  });
  it("gates the alignment inline", () => {
    expect(src).toContain('textAlign: isRTL ? "right" : "left"');
    expect(src).toContain('writingDirection: isRTL ? "rtl" : "ltr"');
  });
});

// Auth screens: TextInput alignment must live in `style`, not the `textAlign`
// prop — react-native-web ignores the prop, so Arabic input text sat at the
// left on web (customer screenshot 2026-09-02).
describe("auth screens align inputs through style, not the textAlign prop", () => {
  it.each(["login.tsx", "register.tsx", "forgot-password.tsx"])("%s", (f) => {
    const src = readFileSync(join(__dirname, "..", "app", f), "utf8");
    expect(src).not.toContain("textAlign={isRTL");
    expect(src).toContain('textAlign: isRTL ? "right" : "left"');
  });
});
