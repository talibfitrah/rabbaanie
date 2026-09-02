import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// Same mocking recipe as tests/daily-deeds-card.test.ts: react-native's
// package entry uses Flow syntax vitest cannot parse, and the rest are only
// touched inside the component body (hooks, JSX), never at module scope, so
// empty stubs let this file import the module's plain exports at all.
vi.mock("react-native", () => ({
  View: "View",
  Pressable: "Pressable",
  Text: "Text",
  StyleSheet: { create: (styles: unknown) => styles },
  Platform: { OS: "android" },
}));
vi.mock("expo-router", () => ({ useRouter: vi.fn(), usePathname: vi.fn() }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: vi.fn() }));
vi.mock("@/hooks/use-colors", () => ({ useColors: vi.fn() }));
vi.mock("@/components/ui/icon-symbol", () => ({ IconSymbol: "IconSymbol" }));
vi.mock("expo-haptics", () => ({}));
vi.mock("@/lib/i18n", () => ({ useI18n: vi.fn() }));

import { TABS } from "@/components/persistent-tab-bar";

const src = readFileSync(join(__dirname, "..", "components", "persistent-tab-bar.tsx"), "utf8");

// The translation table is a module-private const, so it is read from source
// (same as tests/concepts.test.ts). One `{ nl, en, ar }` object literal per key
// is the table's declared shape (Record<string, { nl; en; ar }>).
const i18nSrc = readFileSync(join(__dirname, "..", "lib", "i18n.tsx"), "utf8");
function entry(key: string) {
  const m = i18nSrc.match(new RegExp(`"${key}":\\s*\\{([^}]*)\\}`));
  if (!m) return null;
  const pick = (lang: string) => m[1].match(new RegExp(`\\b${lang}:\\s*"([^"]*)"`))?.[1];
  return { nl: pick("nl"), en: pick("en"), ar: pick("ar") };
}

/**
 * Bug: on any Stack route outside (tabs) — /child/<id>, /qiyam, … —
 * app/_layout.tsx renders PersistentTabBar, which hardcoded the seven Arabic
 * labels and never consulted the language, so a Dutch/English UI got an
 * Arabic bottom bar the moment the user left the tab group. The real tab bar
 * (app/(tabs)/_layout.tsx) resolves the same seven labels through t("tab.*").
 */
describe("PersistentTabBar labels follow the app language", () => {
  // Same seven keys, same order, as app/(tabs)/_layout.tsx's Tabs.Screen list.
  const expected: Array<[key: string, ar: string]> = [
    ["tab.home", "الرئيسة"],
    ["tab.fitrah", "الفطرة"],
    ["tab.prayer", "الصلاة"],
    ["tab.weekly", "الأسبوعي"],
    ["tab.family", "العائلة"],
    ["tab.network", "شبكتي"],
    // Table value. The old literal lacked the kasra («ذكري»); the real tab bar
    // has always shown the table's «ذِكري», and this bar must match it.
    ["tab.dhikri", "ذِكري"],
  ];

  it("maps every tab to a translation key instead of a hardcoded label", () => {
    expect(TABS.map((tab) => tab.key)).toEqual(expected.map(([key]) => key));
    for (const tab of TABS) expect(tab).not.toHaveProperty("label");
  });

  it("every key exists in the table in all three languages, with the Arabic the bar used to hardcode", () => {
    for (const [key, ar] of expected) {
      const e = entry(key);
      expect(e, key).not.toBeNull();
      expect(e!.nl, key).toBeTruthy();
      expect(e!.en, key).toBeTruthy();
      expect(e!.ar, key).toBe(ar);
    }
  });

  it("renders the label through the i18n context", () => {
    expect(src).toContain("useI18n()");
    expect(src).toMatch(/\bt\(\w+\.key\)/);
  });
});
