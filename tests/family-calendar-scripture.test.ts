import { describe, it, expect, vi } from "vitest";

// family.tsx and upcoming-days.tsx are heavy React Native screens; importing
// them for their exported pure calendar functions (getParentDayInfo,
// getDetailedDays) still runs every module-level import, so each needs
// stubbing the same way tests/treatment-renderer.test.ts stubs react-native
// for components/treatment-plan-renderer.tsx. Nothing here is exercised beyond
// module load and the two pure functions under test -- the screen components
// themselves are never rendered or called -- so every stub is a trivial no-op
// shape.
vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  ScrollView: "ScrollView",
  Pressable: "Pressable",
  ActivityIndicator: "ActivityIndicator",
  LayoutAnimation: {},
  Platform: { OS: "ios" },
  UIManager: {},
  Alert: { alert: vi.fn() },
  Modal: "Modal",
  TouchableOpacity: "TouchableOpacity",
  StyleSheet: { create: (styles: unknown) => styles },
}));
vi.mock("expo-router", () => ({ useRouter: vi.fn() }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: vi.fn() }));
vi.mock("react-native-qrcode-svg", () => ({ default: "QRCode" }));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: vi.fn(async () => null), setItem: vi.fn(async () => {}) },
}));
vi.mock("@expo/vector-icons/MaterialIcons", () => ({ default: "MaterialIcons" }));
vi.mock("@/hooks/use-colors", () => ({ useColors: vi.fn() }));
vi.mock("@/lib/app-context", () => ({ useAppState: vi.fn() }));
vi.mock("@/lib/store", () => ({
  calculateAgeInWeeks: vi.fn(),
  getWeekInYear: vi.fn(),
  getYearKey: vi.fn(),
  isProfileComplete: vi.fn(),
}));
vi.mock("@/components/date-time-header", () => ({ DateTimeHeader: "DateTimeHeader" }));
vi.mock("@/lib/i18n", () => ({ useI18n: vi.fn() }));
vi.mock("@/hooks/use-weekly-data", () => ({ useMultipleYearData: vi.fn() }));
vi.mock("@/lib/trpc", () => ({ trpc: {} }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: vi.fn() }));
vi.mock("@/components/sync-toast", () => ({ SyncToast: "SyncToast" }));
vi.mock("@/components/report-ai-content", () => ({ ReportAiContent: "ReportAiContent" }));
vi.mock("@/lib/authed-fetch", () => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/profile-labels", () => ({ translateProfileValue: vi.fn() }));
vi.mock("@/lib/plan-blocks", () => ({ parsePlanText: vi.fn(), groupIntoSections: vi.fn() }));
vi.mock("@/lib/sync-refusal", () => ({ syncRefusedMessage: vi.fn() }));
vi.mock("@/lib/partner-types", () => ({ isFullPartnerProfile: vi.fn() }));
vi.mock("@/lib/prayer-data", () => ({
  PRAYER_LOCATION_KEY: "k",
  PRAYER_METHOD_KEY: "k",
  CALC_METHODS: {},
  calculatePrayerTimes: vi.fn(),
  getIslamicDate: vi.fn(),
}));

import { getParentDayInfo } from "@/app/(tabs)/family";
import { getDetailedDays } from "@/app/details/upcoming-days";

function evidenceFor(days: { name: string; evidence?: string }[], nameIncludes: string): string {
  const d = days.find((x) => x.name.includes(nameIncludes));
  if (!d?.evidence) throw new Error(`no evidence field for a day matching "${nameIncludes}"`);
  return d.evidence;
}

describe("family.tsx getParentDayInfo: job 1c corpus corrections", () => {
  it("attributes the two-Eids-replace-jaahiliyyah hadith to Nasaa'i & Ahmad, plural, Fitr before Adha (Silsilah Sahiha 2021)", () => {
    // hijriMonth=10, hijriDay=1 -> 'Ied al-Fitr branch
    const days = getParentDayInfo(10, 1, 3, "ar");
    const evidence = evidenceFor(days, "عيد الفطر");
    expect(evidence).toContain("قد أبدلكم الله بهما خيرا منهما: يوم الفطر ويوم الأضحى");
    expect(evidence).toContain("النسائي وأحمد");
    expect(evidence).not.toContain("أبدلكما");
    expect(evidence).not.toContain("أبو داود");
  });

  it("attributes 'ten days good deeds' to Tirmidhi 757 with the fuller wording, not Bukhaari", () => {
    // hijriMonth=12, hijriDay=1..9 -> first-10-Dhul-Hijjah branch
    const days = getParentDayInfo(12, 5, 3, "ar");
    const evidence = evidenceFor(days, "عشر ذي الحجة");
    expect(evidence).toContain("ما من أيام العمل الصالح فيهن أحب إلى الله من هذه الأيام العشر");
    expect(evidence).toContain("الترمذي");
    expect(evidence).not.toContain("البخاري");
  });

  it("attributes 'blessed month' Ramadan-prep evidence to al-Bayhaqi, not an-Nasaa'i (per the corpus's own Silsilah Sahiha note)", () => {
    // hijriMonth=8, hijriDay>=20 -> Ramadhaan-prep branch
    const days = getParentDayInfo(8, 25, 3, "ar");
    const evidence = evidenceFor(days, "التحضير لرمضان");
    expect(evidence).toContain("شهر مبارك فرض الله عليكم صيامه");
    expect(evidence).toContain("البيهقي");
    expect(evidence).not.toContain("النسائي");
  });
});

describe("upcoming-days.tsx getDetailedDays: shares the ten-days fix (job 1c)", () => {
  it("attributes the ten-days evidence to Tirmidhi, matching family.tsx's corrected wording", () => {
    // Pick a 'now' so that tomorrow (i=1) lands within the first 10 days of Dhul-Hijjah.
    const now = new Date("2026-05-16T00:00:00Z"); // -> 1 Dhul-Hijjah 1447 the next day, per this file's own hijri math
    const days = getDetailedDays(now, "ar");
    const withEvidence = days.flatMap((d) => d.events).find((e) => e.evidence?.includes("العمل الصالح"));
    expect(withEvidence, "expected one of the next 5 days to be within the first 10 days of Dhul-Hijjah").toBeTruthy();
    expect(withEvidence!.evidence).toContain("ما من أيام العمل الصالح فيهن أحب إلى الله من هذه الأيام العشر");
    expect(withEvidence!.evidence).toContain("الترمذي");
    expect(withEvidence!.evidence).not.toContain("البخاري");
  });
});
