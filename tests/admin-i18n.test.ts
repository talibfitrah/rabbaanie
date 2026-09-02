import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Bug: an admin who chose Dutch or English still saw the whole admin panel in
 * Arabic. The screens called useI18n() for isRTL only and kept their copy as
 * inline Arabic literals. Source-level guard (same style as
 * tests/i18n-leaks.test.ts): each screen takes L3 from the shared picker,
 * every non-comment line carrying Arabic script goes through L3(ar, nl, en),
 * and the wrap count cannot silently shrink (a guard that only checks absence
 * would pass if the strings were deleted). `keepArabic` lists the lines that
 * are Arabic by design — basmala/closing, weekday names, the broadcast preview
 * that tests/broadcast-admin-preview.test.ts pins, a language's own name, a
 * category value stored in Arabic — by a unique substring each.
 */
const FILES: Record<string, { minL3: number; keepArabic: string[] }> = {
  "broadcast.tsx": { minL3: 81, keepArabic: ["BASMALA_AR =", "CLOSING_AR =", "titleAr:", "bodyAr:", "WEEKDAY_LABELS_AR ="] },
  "subscriptions.tsx": { minL3: 77, keepArabic: [] },
  "panel.tsx": { minL3: 39, keepArabic: [] },
  "user.tsx": { minL3: 46, keepArabic: [] },
  "content.tsx": { minL3: 33, keepArabic: [] },
  "site-analytics.tsx": { minL3: 40, keepArabic: ['ar: "العربية"'] },
  "list.tsx": { minL3: 16, keepArabic: [] },
  "create-specialist.tsx": { minL3: 15, keepArabic: [] },
  "add-book.tsx": { minL3: 15, keepArabic: ['useState("الهدايات")', 'category.trim() || "الهدايات"', 'placeholder="الهدايات"'] },
  "users.tsx": { minL3: 15, keepArabic: [] },
  "content-editor.tsx": { minL3: 3, keepArabic: [] },
  "email.tsx": { minL3: 51, keepArabic: ['hint("العربية")'] },
  "specialist.tsx": { minL3: 7, keepArabic: [] },
  "newsletter-editor.tsx": { minL3: 2, keepArabic: [] },
  "feedback.tsx": { minL3: 8, keepArabic: [] },
};

const ARABIC = /[؀-ۿ]/;
const COMMENT = /^\s*(\/\/|\/?\*)/;
// Strip complete L3(...) calls first: a bare Arabic literal beside a wrapped one is still a leak.
const stripL3 = (l: string) => l.replace(/L3\((?:[^()]|\([^()]*\))*\)/g, "");
// A long call is formatted as `L3(` on one line and the Arabic argument on the next.
const continuesL3 = (lines: string[], i: number) => lines[i - 1]?.trimEnd().endsWith("L3(");

describe.each(Object.entries(FILES))("app/admin/%s renders its chrome in the app language", (file, { minL3, keepArabic }) => {
  const src = readFileSync(join(__dirname, "..", "app", "admin", file), "utf8");

  it("takes L3 from the shared picker", () => {
    expect(src).toContain('import { useL3 } from "@/lib/admin-text"');
    expect(src).toMatch(/const L3 = useL3\(\)/);
  });

  it("routes every Arabic literal through L3()", () => {
    const lines = src.split("\n");
    const leaks = lines
      .map((l, i) => ({ l, n: i + 1 }))
      .filter(({ l, n }) => ARABIC.test(stripL3(l)) && !COMMENT.test(l) && !continuesL3(lines, n - 1) && !keepArabic.some((k) => l.includes(k)));
    expect(leaks.map(({ n, l }) => `${n}: ${l.trim()}`)).toEqual([]);
  });

  it(`has at least ${minL3} L3() calls`, () => {
    expect((src.match(/\bL3\(/g) || []).length).toBeGreaterThanOrEqual(minL3);
  });

  it("still carries each allow-listed data line", () => {
    for (const k of keepArabic) expect(src).toContain(k);
  });
});
