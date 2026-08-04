import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(relativePath, "utf8");
}

const REPORTING_SURFACES = [
  ["app/ai-chat.tsx", 'surface="ai-chat"'],
  ["app/child-account/ask-ai.tsx", 'surface="child-ask-ai"'],
  ["app/child-profile/[id].tsx", 'surface="child-profile-treatment-plan"'],
  ["app/(tabs)/treatments.tsx", 'surface="treatments-saved-plan"'],
  ["app/(tabs)/personal-advice.tsx", 'surface="personal-advice-quick-tips"'],
  ["app/(tabs)/personal-advice.tsx", 'surface="personal-advice-sections"'],
  ["app/(tabs)/personal-advice.tsx", 'surface="personal-advice"'],
  [
    "app/details/personal-advice.tsx",
    'surface="personal-advice-details-sections"',
  ],
  ["app/details/personal-advice.tsx", 'surface="personal-advice-details"'],
  ["app/(tabs)/family.tsx", 'surface="family-parent-advice-sections"'],
  ["app/(tabs)/family.tsx", 'surface="family-parent-advice"'],
  ["app/(tabs)/family.tsx", 'surface="family-spouse-advice"'],
  ["app/child/[id].tsx", 'surface="child-treatment-question"'],
  ["app/child/[id].tsx", 'surface="child-treatment-root-cause"'],
  ["app/child/[id].tsx", 'surface="child-treatment-plan"'],
  ["app/child/[id].tsx", 'surface="child-saved-treatment-plan"'],
  ["app/child/weekplan.tsx", 'surface="child-week-plan"'],
  ["app/(tabs)/concepts.tsx", "surface={`quran-${scienceTab}`}"],
] as const;

describe("AI-generated content reporting coverage", () => {
  it.each(REPORTING_SURFACES)(
    "keeps an in-app report control on %s",
    (file, marker) => {
      expect(source(file)).toContain("ReportAiContent");
      expect(source(file)).toContain(marker);
    },
  );

  it("submits reports inside the app to the feedback API", () => {
    const component = source("components/report-ai-content.tsx");
    expect(component).toContain('apiCall("/api/feedback"');
    expect(component).toContain("[AI-RAPPORT]");
    expect(component).not.toContain("Linking.openURL");
    expect(REPORTING_SURFACES).toHaveLength(18);
  });
});
