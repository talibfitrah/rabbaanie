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
