import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

/**
 * Direction is JavaScript-only (lib/i18n.tsx): native RTL is off, so a plain
 * `flexDirection: "row"` renders left-to-right for Arabic users. Every row
 * must be `isRTL ? "row-reverse" : "row"` (static stylesheet entries carry no
 * flexDirection and are overridden at the use site). The allow-list is exact
 * — a new plain row anywhere fails — and the gated-row floor keeps the guard
 * from being satisfied by deleting rows.
 */
const ROOT = join(__dirname, "..");
const ALLOWED_PLAIN: Record<string, { count: number; why: string }> = {
  "app/(tabs)/index.tsx": { count: 2, why: "weatherForecast/checkinAnswered: dead static entries, no render site" },
  "app/(tabs)/weekly.tsx": { count: 1, why: "weekNav: dead static entry, no render site" },
  "app/language-select.tsx": { count: 1, why: "trilingual picker shown before a language exists" },
  "components/animated-splash.tsx": { count: 1, why: "symmetric line/glyph/line row, rendered before the provider" },
  "app/child-account/login.tsx": { count: 1, why: "symmetric line/or/line divider" },
};

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return tsxFiles(p);
    return name.endsWith(".tsx") ? [p] : [];
  });
}

const files = [...tsxFiles(join(ROOT, "app")), ...tsxFiles(join(ROOT, "components"))];
const count = (src: string, needle: string) => src.split(needle).length - 1;

describe("every flexDirection row is gated on isRTL", () => {
  it("has no plain rows beyond the allow-list", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const rel = relative(ROOT, f);
      const src = readFileSync(f, "utf8");
      const plain = count(src, 'flexDirection: "row"') + count(src, "flexDirection: 'row'");
      const allowed = ALLOWED_PLAIN[rel]?.count ?? 0;
      if (plain !== allowed) offenders.push(`${rel}: ${plain} plain (allowed ${allowed})`);
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the gated rows (presence, not just absence)", () => {
    const gated = files.reduce((n, f) => n + count(readFileSync(f, "utf8"), 'isRTL ? "row-reverse" : "row"'), 0);
    expect(gated).toBeGreaterThanOrEqual(650);
  });
});
