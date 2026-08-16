import { describe, it, expect, vi } from "vitest";
import * as fs from "fs";

// The block parser moved to lib/plan-blocks.ts so the renderer, the weekly card
// and the daily reminder all count a plan's tasks the same way. It is plain TS
// now, so these can assert what it does instead of what its source looks like.
import { parsePlanText } from "@/lib/plan-blocks";

// cubic round 3: components/treatment-plan-renderer.tsx CAN be imported here --
// it just needs every module that fails to parse under vitest's esbuild
// transform mocked out first: react-native itself (its entry point uses Flow's
// `import typeof` syntax) and @expo/vector-icons/MaterialIcons (fails its own,
// separate parse) both throw at collection time otherwise, verified directly.
// Everything else the file imports (@/lib/plan-owner, @/lib/plan-blocks,
// @/lib/plan-progress) is plain TS and needs nothing.
vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  Pressable: "Pressable",
  StyleSheet: { create: (styles: unknown) => styles },
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: vi.fn(async () => null), setItem: vi.fn(async () => {}) },
}));
vi.mock("@expo/vector-icons/MaterialIcons", () => ({ default: "MaterialIcons" }));
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ language: "ar", isRTL: true }) }));
vi.mock("@/lib/authed-fetch", () => ({ authedFetch: vi.fn() }));

import { shouldFetchTranslation } from "@/components/treatment-plan-renderer";

describe("TreatmentPlanRenderer", () => {
  const src = fs.readFileSync("components/treatment-plan-renderer.tsx", "utf8");

  // isArabicText is a private helper inside the component, and this file can't
  // import the component either: it pulls in react-native, whose entry point
  // uses Flow's `import typeof` syntax, which esbuild (vitest's transform)
  // cannot parse. So this asserts the ternary's shape in the source rather
  // than an importable function's resolved value — an Arabic-detecting call
  // gates the checkbox row's flexDirection between "row-reverse" (Arabic/RTL)
  // and "row" (else) — written to survive reformatting and identifier
  // renames, unlike the exact `flexDirection: "row-reverse"` text this
  // replaces, which the conditional itself never contains.
  const CHECKBOX_ROW_RTL =
    /styles\.taskRow[\s\S]{0,200}?flexDirection:\s*\w+\([^)]*\)\s*\?\s*"row-reverse"\s*:\s*"row"/;

  it("should have RTL checkbox layout (row-reverse)", () => {
    expect(src).toMatch(CHECKBOX_ROW_RTL);
  });

  it("should have heading1 with large fontSize", () => {
    // Section titles use fontSize: 15 with fontWeight: 800 for emphasis
    expect(src).toContain("fontWeight: \"800\"");
  });

  it("should have heading2 with medium fontSize", () => {
    expect(src).toContain("fontSize: 15");
  });

  it("should have paragraph with smaller fontSize", () => {
    expect(src).toContain("fontSize: 13");
  });

  it("should have writingDirection rtl for all text", () => {
    const rtlCount = (src.match(/writingDirection: "rtl"/g) || []).length;
    expect(rtlCount).toBeGreaterThanOrEqual(5);
  });

  it("should have textAlign right for Arabic", () => {
    const rightCount = (src.match(/textAlign: "right"/g) || []).length;
    expect(rightCount).toBeGreaterThanOrEqual(5);
  });

  it("should handle checkboxes on the right side", () => {
    // row-reverse means first child (text) goes left, last child (checkbox) goes right
    expect(src).toContain("taskRow");
    expect(src).toMatch(CHECKBOX_ROW_RTL);
  });

  it("should have progress bar", () => {
    expect(src).toContain("progressBar");
    expect(src).toContain("progressFill");
  });

  it("should have warning box for short-term tarbiya", () => {
    const blocks = parsePlanText("التربية القصيرة المدى مبنية على التربية الطويلة المدى");
    expect(blocks[0].type).toBe("warning");
  });

  it("should clean markdown symbols (**)", () => {
    const blocks = parsePlanText("1. **راجع نيتك في تربيته**");
    expect(blocks[0]).toMatchObject({ type: "task", text: "راجع نيتك في تربيته" });
  });

  it("should handle separator (---)", () => {
    expect(parsePlanText("---")[0].type).toBe("separator");
  });

  it("should persist completed tasks to AsyncStorage", () => {
    // The key itself now lives in lib/plan-progress.ts, so the weekly plan can
    // read the same progress the renderer writes.
    expect(src).toContain("planProgressKey(issueId)");
    expect(src).toContain("AsyncStorage.setItem");
    expect(
      fs.readFileSync("lib/plan-progress.ts", "utf-8"),
    ).toContain("@treatment_tasks_");
  });

  it("should detect main sections (تشخيص, مهام الوالد, مهام الابن)", () => {
    for (const title of ["التشخيص:", "مهام الوالد:", "مهام الابن:"]) {
      expect(parsePlanText(title)[0]).toMatchObject({ type: "heading1" });
    }
  });

  it("should detect sub-sections (تمهيد, تصفية, تزكية, تربية)", () => {
    for (const title of ["تمهيد:", "تصفية (تصحيح عقل الوالد):", "تزكية:", "تربية في اللسان:"]) {
      expect(parsePlanText(title)[0].type).toMatch(/^heading[12]$/);
    }
  });

  // cubic round 3: the two tests below used to assert the shape of the
  // effect's guard in the source (an exact operator/whitespace regex, and a
  // slice between two literal strings) rather than what it does. Rewriting
  // the guard as `!text?.trim()` -- identical behaviour -- failed them, and
  // the tempting fix was to loosen the regex, which would have removed the
  // guard entirely. shouldFetchTranslation is the guard itself, pulled out
  // of the effect as a plain function so these can invoke it directly and
  // assert on what it returns.
  describe("shouldFetchTranslation gates the network effect", () => {
    // cubic P2 (Finding C): issue.description can be undefined at runtime
    // (AsyncStorage / partner-synced records) even though its TS type says
    // string. When the viewer's language is "ar", needsTranslation is true
    // for undefined text too (isArabicText(undefined) is false, so the
    // "not-Arabic text but Arabic viewer" branch fires) -- so undefined text
    // must never reach a fetch, whatever the guard's exact wording.
    it("does not need a fetch when the text is undefined, even for an Arabic viewer", () => {
      expect(shouldFetchTranslation(undefined, "ar", true)).toBe(false);
    });

    // cubic P2 (Finding D): StructuredIssueCard called useAutoTranslate
    // unconditionally, so a family with N issues in a non-matching language
    // fired N POSTs to the paid /api/advice/translate endpoint on first
    // render of the child screen, whether or not any card was ever opened.
    it("does not need a fetch when disabled, even if the language genuinely mismatches", () => {
      expect(shouldFetchTranslation("some plain English text", "ar", false)).toBe(false);
    });

    // The gate must not vanish into an always-false stub (only checking what
    // must be ABSENT lets the capability disappear silently) -- a real
    // mismatch, with text present and the caller enabled, must still fetch.
    it("does need a fetch when enabled, text is present, and the language mismatches", () => {
      expect(shouldFetchTranslation("some plain English text", "ar", true)).toBe(true);
    });
  });

  // cubic round 8 P2: `enabled` used to sit in the SAME effect as the
  // `setTranslated(null)` reset, so collapsing a card (enabled -> false) and
  // reopening it (enabled -> true) wiped the already-fetched translation and
  // re-ran the fetch/cache path from scratch on every toggle -- a one-off
  // cost turned into a per-toggle one. useAutoTranslate can't be mounted and
  // toggled here (no React renderer is installed in this project -- see the
  // docstring above shouldFetchTranslation), so this asserts the structural
  // fix instead: the effect whose dependency array includes `enabled` must
  // not also discard `translated`.
  describe("useAutoTranslate retains a translation across enabled toggles", () => {
    it("the effect that reads `enabled` does not reset `translated`", () => {
      const start = src.indexOf("export function useAutoTranslate");
      const end = src.indexOf("export function TreatmentPlanRenderer", start);
      const hookSrc = src.slice(start, end);
      // Split into per-effect chunks (lookahead keeps each "useEffect(" as
      // the start of its own chunk) rather than one regex spanning "from an
      // opening brace to a closing bracket that mentions enabled" -- that
      // greedy span used to jump straight over an unrelated earlier effect's
      // own closing `}, [...])` and swallow both effects as one match.
      const effectBlocks = hookSrc
        .split(/(?=useEffect\()/)
        .filter((b) => b.startsWith("useEffect("));
      const enabledEffects = effectBlocks.filter((b) => /\benabled\b/.test(b));
      expect(enabledEffects.length).toBeGreaterThan(0);
      for (const block of enabledEffects) {
        expect(block).not.toMatch(/setTranslated\(null\)/);
      }
    });
  });
});

describe("child/[id].tsx uses TreatmentPlanRenderer and useAutoTranslate", () => {
  const src = fs.readFileSync("app/child/[id].tsx", "utf8");

  // Checks that the SYMBOL is imported from the module, not the exact
  // import-line text — a prior version of this asserted the single-name
  // import line verbatim, which coupled app/child/[id].tsx to keeping
  // TreatmentPlanRenderer and useAutoTranslate on two separate import lines
  // even though both names come from the same module. `[^}]` matches
  // newlines too, so this still finds the name if a merged import wraps
  // across lines.
  function importsSymbolFrom(symbol: string, modulePath: string): boolean {
    const escapedModule = modulePath.replace(/\//g, "\\/");
    const re = new RegExp(
      `import\\s*\\{[^}]*\\b${symbol}\\b[^}]*\\}\\s*from\\s*["']${escapedModule}["']`,
    );
    return re.test(src);
  }

  it("imports TreatmentPlanRenderer from the renderer module", () => {
    expect(
      importsSymbolFrom("TreatmentPlanRenderer", "@/components/treatment-plan-renderer"),
    ).toBe(true);
  });

  it("imports useAutoTranslate from the renderer module", () => {
    expect(
      importsSymbolFrom("useAutoTranslate", "@/components/treatment-plan-renderer"),
    ).toBe(true);
  });

  it("uses the TreatmentPlanRenderer component", () => {
    expect(src).toContain("<TreatmentPlanRenderer");
  });

  it("calls useAutoTranslate", () => {
    expect(/\buseAutoTranslate\s*\(/.test(src)).toBe(true);
  });

  // Finding D: the description heading is what's translated here, at the top
  // of every StructuredIssueCard -- unlike the plan body (which only mounts
  // once a card is expanded), so this call site is the one that must gate
  // itself on the card actually being open, via useAutoTranslate's enabled flag.
  it("only translates the issue description for expanded cards", () => {
    expect(src).toMatch(/useAutoTranslate\(\s*issue\.description\s*,\s*lang\s*,\s*expanded\s*\)/);
  });
});

// Finding E: getSpouseAdvice's prompt now emits "1. <heading>" lines with
// "- " bullets (server/advice.ts:2876), so the flat <Text> this used to
// render through would show that literal markup instead of clean prose.
// The product owner asked for collapsible sections, one per advice type --
// the same section/accordion path treatment plans already use.
describe("family.tsx renders spouse advice as sections, not raw numbered markup", () => {
  const familySrc = fs.readFileSync("app/(tabs)/family.tsx", "utf8");

  it("imports the shared section parser from lib/plan-blocks", () => {
    expect(familySrc).toMatch(/from\s*["']@\/lib\/plan-blocks["']/);
  });

  it("parses spouseAdvice.advice through parsePlanText + groupIntoSections", () => {
    expect(familySrc).toMatch(/groupIntoSections\(\s*parsePlanText\(/);
  });

  // cubic round 3: this call omitted groupIntoSections' language argument, so
  // the synthetic intro section fell back to the Arabic literal "مقدمة" even
  // in the Dutch/English spouse-advice renderer -- TreatmentPlanRenderer:202
  // passes it, this call site must too.
  it("passes the viewer's language to groupIntoSections, so the synthetic intro title is not always Arabic", () => {
    expect(familySrc).toMatch(/groupIntoSections\(\s*parsePlanText\([^)]*\)\s*,\s*language\s*\)/);
  });

  // The guard: SpouseAdviceSections' own `language` prop is required, not
  // optional, so a future call site of this component fails to compile
  // instead of silently falling back to Arabic the same way.
  it("declares SpouseAdviceSections' language prop as required, not optional", () => {
    const start = familySrc.indexOf("function SpouseAdviceSections");
    const propsBlock = familySrc.slice(start, familySrc.indexOf("}) {", start));
    expect(propsBlock).toMatch(/language:\s*string/);
    expect(propsBlock).not.toMatch(/language\?:/);
  });
});
