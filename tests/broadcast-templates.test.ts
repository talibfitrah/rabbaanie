import { describe, it, expect } from "vitest";
import {
  analyticalProfileTemplate,
  personalProfileTemplate,
  childProfileTemplate,
  spouseNotLinkedTemplate,
  type BroadcastTemplate,
} from "../server/broadcast-templates";

const BASMALA_AR = "بسم الله الرحمن الرحيم";
const BASMALA_NL_EN = "Bismillaah";
const CLOSING_END_AR = "والسلام عليكم ورحمة الله وبركاته.";
const CLOSING_END_NL_EN = "Was-salaamu 3alaykum wa rahmatullaahi wa barakaatuh.";

// Shared structural contract every template must satisfy, regardless of
// category: open with the basmala, close with al-hamdu + as-salaam, in all
// three languages. This is the owner's fixed structure, not a formatting
// nitpick — it's the actual requirement.
function expectFixedStructure(t: BroadcastTemplate) {
  expect(t.body.ar.startsWith(BASMALA_AR)).toBe(true);
  expect(t.body.nl.startsWith(BASMALA_NL_EN)).toBe(true);
  expect(t.body.en.startsWith(BASMALA_NL_EN)).toBe(true);
  expect(t.body.ar.endsWith(CLOSING_END_AR)).toBe(true);
  expect(t.body.nl.endsWith(CLOSING_END_NL_EN)).toBe(true);
  expect(t.body.en.endsWith(CLOSING_END_NL_EN)).toBe(true);
  // Every field non-empty in every language, title and body alike.
  for (const field of [t.title, t.body]) {
    for (const lang of ["ar", "nl", "en"] as const) {
      expect(field[lang].trim().length).toBeGreaterThan(0);
    }
  }
}

describe("analyticalProfileTemplate", () => {
  it("follows the fixed basmala/message/closing structure in all three languages", () => {
    expectFixedStructure(analyticalProfileTemplate());
  });
});

describe("personalProfileTemplate", () => {
  it("follows the fixed basmala/message/closing structure in all three languages", () => {
    expectFixedStructure(personalProfileTemplate());
  });

  it("is a distinct message from the analytical-profile template", () => {
    expect(personalProfileTemplate().body.ar).not.toBe(analyticalProfileTemplate().body.ar);
  });
});

describe("childProfileTemplate", () => {
  it("follows the fixed basmala/message/closing structure in all three languages", () => {
    expectFixedStructure(childProfileTemplate(["Yusuf"]));
  });

  it("names the specific child in the body, in every language", () => {
    // The stored name is interpolated verbatim, not transliterated to Arabic
    // script — same as the existing admin UI's incompleteChildren display
    // (app/admin/broadcast.tsx) and incompleteChildNames() itself, neither
    // of which transliterate.
    const t = childProfileTemplate(["Yusuf"]);
    expect(t.body.ar).toContain("Yusuf");
    expect(t.body.nl).toContain("Yusuf");
    expect(t.body.en).toContain("Yusuf");
  });

  it("names the specific child in the title too", () => {
    const t = childProfileTemplate(["Yusuf"]);
    expect(t.title.ar).toContain("Yusuf");
    expect(t.title.nl).toContain("Yusuf");
    expect(t.title.en).toContain("Yusuf");
  });

  it("names every incomplete child when a user has more than one", () => {
    const t = childProfileTemplate(["Yusuf", "Maryam"]);
    expect(t.body.en).toContain("Yusuf");
    expect(t.body.en).toContain("Maryam");
  });
});

describe("spouseNotLinkedTemplate", () => {
  it("follows the fixed basmala/message/closing structure in all three languages, for either gender", () => {
    expectFixedStructure(spouseNotLinkedTemplate("man"));
    expectFixedStructure(spouseNotLinkedTemplate("vrouw"));
  });

  it("addresses a husband about linking his wife's profile", () => {
    const t = spouseNotLinkedTemplate("man");
    expect(t.title.ar).toContain("زوجتك");
    expect(t.title.en.toLowerCase()).toContain("wife");
  });

  it("addresses a wife about linking her husband's profile, with feminine Arabic verb forms", () => {
    const t = spouseNotLinkedTemplate("vrouw");
    expect(t.title.ar).toContain("زوجك");
    expect(t.title.en.toLowerCase()).toContain("husband");
    // Feminine second-person marker ("...ِ") must appear in the Arabic body —
    // this is the gendered-wording requirement, not a cosmetic string swap.
    expect(t.body.ar).toContain("تربطي");
  });

  it("the two gender variants render different text in every language", () => {
    const man = spouseNotLinkedTemplate("man");
    const vrouw = spouseNotLinkedTemplate("vrouw");
    expect(man.title.ar).not.toBe(vrouw.title.ar);
    expect(man.title.nl).not.toBe(vrouw.title.nl);
    expect(man.title.en).not.toBe(vrouw.title.en);
    expect(man.body.ar).not.toBe(vrouw.body.ar);
  });
});
