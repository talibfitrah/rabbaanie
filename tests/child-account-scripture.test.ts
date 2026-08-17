import { describe, it, expect, vi } from "vitest";

// advisor.tsx and home.tsx are React Native screens; importing them for their
// exported data constants (RESPONSES, SALAF_STORIES) still runs their module-level
// imports, so those need stubbing the same way tests/treatment-renderer.test.ts
// stubs react-native for components/treatment-plan-renderer.tsx. Nothing here is
// exercised beyond module load -- the screen components themselves are never
// rendered or called -- so every stub is a trivial no-op shape.
vi.mock("react-native", () => ({
  Text: "Text",
  View: "View",
  ScrollView: "ScrollView",
  TextInput: "TextInput",
  TouchableOpacity: "TouchableOpacity",
  KeyboardAvoidingView: "KeyboardAvoidingView",
  Alert: { alert: vi.fn() },
  Platform: { OS: "ios" },
}));
vi.mock("expo-router", () => ({ useLocalSearchParams: vi.fn(), useRouter: vi.fn() }));
vi.mock("@/components/screen-container", () => ({ ScreenContainer: "ScreenContainer" }));
vi.mock("@/hooks/use-colors", () => ({ useColors: vi.fn() }));
vi.mock("@/lib/i18n", () => ({ useI18n: vi.fn() }));
vi.mock("@/lib/activity-tracker", () => ({ activityTracker: { init: vi.fn() } }));
vi.mock("@/lib/app-usage-tracker", () => ({
  startScreenTracking: vi.fn(),
  endScreenTracking: vi.fn(),
  saveSessionsLocally: vi.fn(),
  fetchAndStoreExternalUsage: vi.fn(),
  isNativeModuleAvailable: vi.fn(),
  isUsageStatsPermissionGranted: vi.fn(),
  syncUsageToServer: vi.fn(),
}));
vi.mock("@/lib/monitoring-notice", () => ({ hideMonitoringNotice: vi.fn(), runNoticeGatedCollection: vi.fn() }));
vi.mock("@/lib/distribution", () => ({ CHILD_MONITORING_ENABLED: false }));
vi.mock("@/lib/trpc", () => ({ trpc: {} }));

import { RESPONSES } from "@/app/child-account/advisor";
import { SALAF_STORIES } from "@/app/child-account/home";

describe("child advisor: prayer response (job 1a)", () => {
  it("attributes prayer's status to the Tirmidhi 2616 wording (hasan sahih), not the unsourced 'عمود الدين' line", () => {
    const first = RESPONSES.prayer.ar[0];
    expect(first).toContain("رأس الأمر الإسلام، وعموده الصلاة، وذروة سنامه الجهاد");
    expect(first).not.toContain("عمود الدين");
    expect(first).not.toContain("من حافظ عليها فقد أقام الدين");
  });

  it("carries the same corpus-verified quote in nl and en", () => {
    expect(RESPONSES.prayer.nl[0]).toContain("de pilaar ervan is het gebed");
    expect(RESPONSES.prayer.en[0]).toContain("its pillar is prayer");
  });
});

describe("child advisor: friends response (job 1d)", () => {
  it("quotes Abu Dawud 4833 exactly ('الرجل', not 'المرء')", () => {
    const first = RESPONSES.friends.ar[0];
    expect(first).toContain("الرجل على دين خليله فلينظر أحدكم من يخالل");
    expect(first).not.toContain("المرء على دين خليله");
  });
});

describe("child home: salaf stories (job 1b)", () => {
  it("gives Usama ibn Zayd's age as the corpus's own 16, with only 'Umar placed in the army", () => {
    const story = SALAF_STORIES.ar.find((s) => s.title.includes("أسامة"))!;
    expect(story.story).toContain("16 سنة");
    expect(story.story).toContain("عمر بن الخطاب");
    expect(story.story).not.toContain("18 سنة");
    expect(story.story).not.toContain("أبو بكر");
  });

  it("drops the unsourced pregnancy detail from Asma bint Abi Bakr's story in all three languages", () => {
    const ar = SALAF_STORIES.ar.find((s) => s.title.includes("أسماء"))!;
    const nl = SALAF_STORIES.nl.find((s) => s.title.includes("Asmaa"))!;
    const en = SALAF_STORIES.en.find((s) => s.title.includes("Asmaa"))!;
    expect(ar.story).toContain("حملت الطعام للنبي ﷺ وأبيها في الهجرة");
    expect(ar.story).not.toContain("حامل");
    expect(nl.story).not.toContain("zwanger");
    expect(en.story).not.toContain("pregnant");
  });
});
