import { beforeEach, describe, it, expect, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { stripMarkdownEmphasis } from "../server/advice";

const invokeLLMMock = vi.hoisted(() => vi.fn());
vi.mock("../server/_core/llm", () => ({ invokeLLM: invokeLLMMock }));

// getSpouseAdvice (server/advice.ts) db dependencies — same three
// tests/partner-profile-access.test.ts already stubs for this procedure.
// getGeneralAdvice/getWeekPlan/generateTreatmentPlan/getQuickTips (this
// file's other tests) never call db.*, so mocking it wholesale here is safe.
const dbMocks = vi.hoisted(() => ({
  getPartnersOfUser: vi.fn(),
  getSpouseInteractionData: vi.fn(),
  getRecentDiagnosticSignals: vi.fn(),
  createSpouseAdvice: vi.fn(),
}));
vi.mock("../server/db", () => dbMocks);

import { adviceRouter } from "../server/advice";

// --- Defect 2 (cosmetic): server-side strip is the guarantee, prompt bans are ---
// --- probabilistic. This is the pure helper the routers apply before returning. ---
describe("stripMarkdownEmphasis", () => {
  it("removes ** bold markers", () => {
    expect(stripMarkdownEmphasis("**bold**")).toBe("bold");
  });

  it("removes __ underline markers", () => {
    expect(stripMarkdownEmphasis("__x__")).toBe("x");
  });

  it("leaves text with no markers unchanged", () => {
    const text = "Voor jullie relatie: praat vanavond samen.";
    expect(stripMarkdownEmphasis(text)).toBe(text);
  });

  it("does not mangle an asterisk that is not an emphasis marker", () => {
    const text = "3 * 4 = 12, dus reken dat na.";
    expect(stripMarkdownEmphasis(text)).toBe(text);
  });

  it("strips inline emphasis within a sentence, keeping the rest intact", () => {
    expect(stripMarkdownEmphasis("**Voor jullie relatie:** praat vanavond.")).toBe(
      "Voor jullie relatie: praat vanavond.",
    );
  });

  it("strips multiple pairs in the same string", () => {
    expect(stripMarkdownEmphasis("**Ochtend:** doe dit. **Avond:** doe dat.")).toBe(
      "Ochtend: doe dit. Avond: doe dat.",
    );
  });
});

// --- Round-3 fix: the ** regex isn't anchored to one JSON string value, so ---
// --- stripping rawText BEFORE JSON.parse lets an unpaired ** in one field ---
// --- bridge to an unpaired ** in a different field on the same line, silently ---
// --- corrupting both fields' text. Fix: parse first, strip the extracted ---
// --- string fields after. These reproduce the bridging against the real ---
// --- router procedures with a mocked LLM response. ---
describe("stripMarkdownEmphasis runs AFTER JSON.parse, not before (round-3 fix)", () => {
  beforeEach(() => {
    invokeLLMMock.mockReset();
  });

  const minimalGeneralAdviceInput = {
    parentProfile: {},
    childrenCount: 1,
    childrenAges: ["8"],
    season: "summer",
    location: "Amsterdam",
    language: "nl",
  };

  it("getGeneralAdvice: an unpaired ** in one section's field no longer bridges into another field", async () => {
    // title and content each carry a LONE, unpaired ** (no closing pair
    // within their own string) — stripping rawText before parsing used to
    // bridge these two across the field boundary and silently delete both.
    // The second section's title has a genuine, self-contained **pair**,
    // proving real stripping still works once scoped to one field.
    const raw =
      '{"sections": [' +
      '{"title": "Salaah **eerst", "icon": "mosque", "content": "dan** de rest"}, ' +
      '{"title": "Gewoon **belangrijk** nieuws", "icon": "star", "content": "Normale tekst."}' +
      "]}";
    invokeLLMMock.mockResolvedValue({ choices: [{ message: { content: raw } }] });

    const result: any = await adviceRouter
      .createCaller({} as any)
      .getGeneralAdvice(minimalGeneralAdviceInput);

    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].title).toBe("Salaah **eerst");
    expect(result.sections[0].content).toBe("dan** de rest");
    expect(result.sections[1].title).toBe("Gewoon belangrijk nieuws");
    expect(result.sections[1].content).toBe("Normale tekst.");
  });

  it("getGeneralAdvice: the advice fallback field is built from the stripped sections, not the raw JSON text (round-4 fix)", async () => {
    // Same fixture as above. advice.ts:1467 still stripped rawText (the
    // whole JSON blob) for the `advice` field even after `sections` was
    // fixed to strip per-field — exactly the bridging bug the comment above
    // warns about, just left unfixed for this one field.
    const raw =
      '{"sections": [' +
      '{"title": "Salaah **eerst", "icon": "mosque", "content": "dan** de rest"}, ' +
      '{"title": "Gewoon **belangrijk** nieuws", "icon": "star", "content": "Normale tekst."}' +
      "]}";
    invokeLLMMock.mockResolvedValue({ choices: [{ message: { content: raw } }] });

    const result: any = await adviceRouter
      .createCaller({} as any)
      .getGeneralAdvice(minimalGeneralAdviceInput);

    // Not the raw JSON scaffolding dumped as a string.
    expect(result.advice).not.toContain('"sections"');
    // Every field's real text survives — a whole-text strip bridges
    // section 1's unpaired ** into unrelated JSON punctuation and text.
    expect(result.advice).toContain("Salaah **eerst");
    expect(result.advice).toContain("dan** de rest");
    expect(result.advice).toContain("Gewoon belangrijk nieuws");
    expect(result.advice).toContain("Normale tekst.");
  });

  it("getGeneralAdvice: a section missing title/content doesn't leak the literal word 'undefined' into the advice fallback (round-6 P3 fix)", async () => {
    // One section has no "title" key, the other has no "content" key — the
    // LLM's JSON response is untrusted (parsed as `any`), so this is a real
    // shape the join at advice.ts's `sections.map(s => `${s.title}\n${s.content}`)`
    // must survive without stringifying the missing key as the text "undefined".
    const raw =
      '{"sections": [' +
      '{"content": "Alleen inhoud, geen titel."}, ' +
      '{"title": "Titel zonder inhoud"}' +
      "]}";
    invokeLLMMock.mockResolvedValue({ choices: [{ message: { content: raw } }] });

    const result: any = await adviceRouter
      .createCaller({} as any)
      .getGeneralAdvice(minimalGeneralAdviceInput);

    expect(result.advice).not.toContain("undefined");
    expect(result.advice).toContain("Alleen inhoud, geen titel.");
    expect(result.advice).toContain("Titel zonder inhoud");
  });

  const minimalQuickTipsInput = {
    parentProfile: {},
    childrenCount: 1,
    childrenAges: ["8"],
    location: "Amsterdam",
    timeOfDay: "morning",
    season: "summer",
    language: "nl",
  };

  it("getQuickTips: an unpaired ** in one tip no longer bridges into the next tip", async () => {
    // getQuickTips reads invokeLLM's raw result directly as the content
    // string (see getQuickTips's `const content = result;`), unlike
    // getGeneralAdvice which reads result.choices[0].message.content — the
    // mock below matches what this procedure actually consumes.
    const raw =
      '{"tips": ["Doe dit **vandaag", "en dat** morgen", "Normale **tip** hier"]}';
    invokeLLMMock.mockResolvedValue(raw);

    const result: any = await adviceRouter
      .createCaller({} as any)
      .getQuickTips(minimalQuickTipsInput);

    expect(result.tips).toEqual([
      "Doe dit **vandaag",
      "en dat** morgen",
      "Normale tip hier",
    ]);
  });
});

// --- Defect 1 (hadith recall) + Defect 3 (diminutive terminology): presence ---
// --- assertions against the actual prompt source text. A future edit that ---
// --- silently drops the rule from one prompt (but not the others) must fail ---
// --- this, so we slice per-procedure rather than checking the whole file at once. ---
describe("advice.ts prompt safety guards", () => {
  const source = fs.readFileSync(path.join(__dirname, "../server/advice.ts"), "utf-8");

  // Unique, once-only string per advice-generating procedure, in file order.
  const PROCEDURE_MARKERS = [
    "getGeneralAdvice: publicProcedure",
    "getWeekPlan: publicProcedure",
    "generateTreatmentPlan: publicProcedure",
    "getSpouseAdvice: protectedProcedure",
    "getQuickTips: publicProcedure",
  ];

  // Procedures whose prompts retrieve vetted corpus text (mawsouah/gezinskunde
  // knowledge base) into the prompt, vs. those that don't retrieve anything.
  const RETRIEVAL_PROCEDURES = [
    "getGeneralAdvice: publicProcedure",
    "getWeekPlan: publicProcedure",
    "generateTreatmentPlan: publicProcedure",
  ];

  const indices = PROCEDURE_MARKERS.map((m) => {
    const i = source.indexOf(m);
    if (i === -1) throw new Error(`procedure marker not found in server/advice.ts: ${m}`);
    return i;
  });
  const blocks: Record<string, string> = {};
  PROCEDURE_MARKERS.forEach((m, idx) => {
    const start = indices[idx];
    const end = idx + 1 < indices.length ? indices[idx + 1] : source.length;
    blocks[m] = source.slice(start, end);
  });

  // Covers both hadith AND Qur'anic ayah recall — retrieval in this file
  // (mawsouah/knowledge-base context) is real but partial, so the same
  // no-recall standard applies to ayah citation, not just hadith.
  const HADITH_BAN_AR =
    "يُحظر منعًا باتًا الاستشهاد بأي حديث نبوي أو آية قرآنية من الذاكرة";
  const HADITH_BAN_EN = "Never quote, paraphrase, or attribute any hadith or Qur'anic ayah from memory";
  const HADITH_BAN_NL = "Citeer, parafraseer of schrijf nooit uit het geheugen een hadith of Koranvers (ayah) toe";

  for (const marker of PROCEDURE_MARKERS) {
    it(`${marker}: forbids reciting hadith or ayah from memory (Arabic)`, () => {
      expect(blocks[marker]).toContain(HADITH_BAN_AR);
    });
    it(`${marker}: forbids reciting hadith or ayah from memory (English)`, () => {
      expect(blocks[marker]).toContain(HADITH_BAN_EN);
    });
    it(`${marker}: forbids reciting hadith or ayah from memory (Dutch)`, () => {
      expect(blocks[marker]).toContain(HADITH_BAN_NL);
    });
  }

  const TERMINOLOGY_BAN_EN = 'never a loose, colloquial, or diminutive rendering (e.g. never "little prayer" for adhkaar or du\'aa)';
  const TERMINOLOGY_BAN_NL = 'nooit een losse, informele of verkleinwoordvorm (bijv. nooit "gebedje" of "slaapgebedje" voor adhkaar of du3aa\')';

  for (const marker of PROCEDURE_MARKERS) {
    it(`${marker}: forbids diminutive Islamic terminology (English)`, () => {
      expect(blocks[marker]).toContain(TERMINOLOGY_BAN_EN);
    });
    it(`${marker}: forbids diminutive Islamic terminology (Dutch)`, () => {
      expect(blocks[marker]).toContain(TERMINOLOGY_BAN_NL);
    });
  }

  const TERMINOLOGY_PREFER_CORPUS_EN = "Where the context provided above already gives a term's own wording, use that exact wording.";
  const TERMINOLOGY_PREFER_CORPUS_NL = "Geeft de context hierboven al de eigen bewoording van een term, gebruik die bewoording.";

  for (const marker of RETRIEVAL_PROCEDURES) {
    it(`${marker}: prefers the retrieved corpus's own wording for terms (English)`, () => {
      expect(blocks[marker]).toContain(TERMINOLOGY_PREFER_CORPUS_EN);
    });
    it(`${marker}: prefers the retrieved corpus's own wording for terms (Dutch)`, () => {
      expect(blocks[marker]).toContain(TERMINOLOGY_PREFER_CORPUS_NL);
    });
  }

  const MARKDOWN_BAN_EN = "Do not use asterisks (**) or any markdown formatting symbols.";
  const MARKDOWN_BAN_NL = "Gebruik geen sterretjes (**) of andere opmaaksymbolen (markdown).";

  for (const marker of PROCEDURE_MARKERS) {
    it(`${marker}: bans markdown asterisks in output (English)`, () => {
      expect(blocks[marker]).toContain(MARKDOWN_BAN_EN);
    });
    it(`${marker}: bans markdown asterisks in output (Dutch)`, () => {
      expect(blocks[marker]).toContain(MARKDOWN_BAN_NL);
    });
  }

  // Defect 4: spouse advice is the only prompt with no heading structure at
  // all (getWeekPlan/generateTreatmentPlan already emit their own numbered
  // top-level outline; getGeneralAdvice/getQuickTips return structured JSON,
  // not free text) — so only getSpouseAdvice needs the numbered-outline
  // instruction that lib/plan-blocks.ts's accordion detector looks for.
  const NUMBERED_HEADING_AR = 'ابدأ كل قسم بعنوان مرقّم في سطر مستقل: "1. العنوان"';
  const NUMBERED_HEADING_EN = 'Start each section with a top-level numbered heading on its own line — "1. <heading>"';
  const NUMBERED_HEADING_NL = 'Begin elke sectie met een genummerde kop op een eigen regel: "1. <kop>"';

  it("getSpouseAdvice: instructs numbered section headings (Arabic)", () => {
    expect(blocks["getSpouseAdvice: protectedProcedure"]).toContain(NUMBERED_HEADING_AR);
  });
  it("getSpouseAdvice: instructs numbered section headings (English)", () => {
    expect(blocks["getSpouseAdvice: protectedProcedure"]).toContain(NUMBERED_HEADING_EN);
  });
  it("getSpouseAdvice: instructs numbered section headings (Dutch)", () => {
    expect(blocks["getSpouseAdvice: protectedProcedure"]).toContain(NUMBERED_HEADING_NL);
  });
});

// --- round-7 P1 fix: server/ai-chat.ts is a stale, non-deployed copy (see ---
// --- its own file header) that was missing the SCRIPTURE CITATION RULE ---
// --- guard advice.ts already enforces. Not a live defect today (production ---
// --- has the guard), but a future repo->VM sync of this file would REMOVE ---
// --- it from production, so it belongs here too. Presence assertions ---
// --- against the raw source, sliced per language key, so a future edit ---
// --- that drops the rule from one language (but not the others) fails this. ---
describe("ai-chat.ts SYSTEM_PROMPTS carry the SCRIPTURE CITATION RULE (round-7 P1 fix)", () => {
  const aiChatSource = fs.readFileSync(path.join(__dirname, "../server/ai-chat.ts"), "utf-8");

  // Unique, once-only string per SYSTEM_PROMPTS language key, in file order.
  const LANG_MARKERS = [
    "  nl: `Je bent een islamitische opvoedingsadviseur",
    "  ar: `أنت مستشار تربوي إسلامي",
    "  en: `You are an Islamic parenting advisor",
  ];
  const langIndices = LANG_MARKERS.map((m) => {
    const i = aiChatSource.indexOf(m);
    if (i === -1) throw new Error(`SYSTEM_PROMPTS marker not found in server/ai-chat.ts: ${m}`);
    return i;
  });
  const langBlocks: Record<string, string> = {};
  LANG_MARKERS.forEach((m, idx) => {
    const start = langIndices[idx];
    const end = idx + 1 < langIndices.length ? langIndices[idx + 1] : aiChatSource.length;
    langBlocks[m] = aiChatSource.slice(start, end);
  });

  // Verbatim from server/advice.ts (the approved wording) — the same rule
  // that file already enforces for its own procedures, copied per language,
  // not re-translated.
  const RULE_NL =
    "REGEL VOOR RELIGIEUZE CITATEN (bindend, geen uitzonderingen): Citeer, parafraseer of schrijf nooit uit het geheugen een hadith of Koranvers (ayah) toe, en schrijf nooit op eigen initiatief een uitspraak toe aan de Profeet ﷺ — noch letterlijk noch naar de strekking. Gebruik uitsluitend hadith- of ayah-tekst die je letterlijk elders in deze prompt is aangereikt; is daarover niets aangereikt, geef dan algemene geloofsaanmoediging zonder een hadith of ayah te vertellen.";
  const RULE_AR =
    "قاعدة الاستشهاد الديني (ملزمة بلا استثناء): يُحظر منعًا باتًا الاستشهاد بأي حديث نبوي أو آية قرآنية من الذاكرة، أو نسبة أي قول إلى النبي ﷺ من تلقاء نفسك، نصًا أو معنى. لا تستخدم إلا نصّ حديث أو آية ورد لك حرفيًا في موضع آخر من هذا النص؛ فإن لم يرد نص يخص هذا الموضوع، فقدّم التشجيع الإيماني بعبارات عامة دون سرد أي حديث أو آية.";
  const RULE_EN =
    "SCRIPTURE CITATION RULE (binding, no exceptions): Never quote, paraphrase, or attribute any hadith or Qur'anic ayah from memory, and never attribute any saying to the Prophet ﷺ on your own initiative — whether by exact wording or by meaning. Only use hadith or ayah text that was given to you verbatim elsewhere in this prompt; if none was given for this topic, give religious encouragement in general terms without narrating any hadith or ayah.";

  it("nl SYSTEM_PROMPTS entry forbids reciting hadith or ayah from memory", () => {
    expect(langBlocks[LANG_MARKERS[0]]).toContain(RULE_NL);
  });
  it("ar SYSTEM_PROMPTS entry forbids reciting hadith or ayah from memory", () => {
    expect(langBlocks[LANG_MARKERS[1]]).toContain(RULE_AR);
  });
  it("en SYSTEM_PROMPTS entry forbids reciting hadith or ayah from memory", () => {
    expect(langBlocks[LANG_MARKERS[2]]).toContain(RULE_EN);
  });
});

// --- Spouse-advice addressing fix: the prompt used to embed ctx.user.name
// (Latin script, e.g. "Suhayb Salam") directly into the Arabic-language
// prompt, framed in 3rd person ("suggestions for [name]..."). The model
// re-transliterated the Latin name back into Arabic and got it wrong
// (سهيب instead of صهيب), shown on the user's OWN advice screen. Fix: no
// name in the prompt at all; address the user in 2nd person; refer to the
// partner only by a gendered relationship term derived from the user's
// own gender (same column-then-JSON precedence as resolveGender in
// server/routers.ts). Static check first (source no longer embeds the
// name variables); runtime checks prove the actual rendered prompt. ---
describe("getSpouseAdvice: prompt no longer embeds ctx.user.name (static)", () => {
  const source = fs.readFileSync(path.join(__dirname, "../server/advice.ts"), "utf-8");
  const start = source.indexOf("getSpouseAdvice: protectedProcedure");
  const end = source.indexOf("getSpouseAdviceHistory: protectedProcedure");
  if (start === -1 || end === -1) throw new Error("getSpouseAdvice block markers not found");
  const block = source.slice(start, end);

  it("no longer interpolates the raw user/partner name into the prompt", () => {
    expect(block).not.toContain("${myName}");
    expect(block).not.toContain("${partnerName}");
  });

  it("instructs 2nd-person addressing with no name, in all three languages", () => {
    expect(block).toContain('خاطب المستخدم دائماً بصيغة المخاطب "أنت"، ولا تذكر اسمه أو اسم الشريك إطلاقاً');
    expect(block).toContain('ADDRESSING RULE (binding): Always address the reader directly as "you"');
    expect(block).toContain('AANSPREEKREGEL (bindend): Spreek de lezer altijd rechtstreeks aan met "je"');
  });
});

describe("getSpouseAdvice: 2nd-person addressing + gendered partner term (runtime)", () => {
  beforeEach(() => {
    invokeLLMMock.mockReset();
    dbMocks.getPartnersOfUser.mockReset();
    dbMocks.getSpouseInteractionData.mockReset();
    dbMocks.getRecentDiagnosticSignals.mockReset();
    dbMocks.createSpouseAdvice.mockReset();
    dbMocks.getSpouseInteractionData.mockResolvedValue({
      goals: [], conversations: [], messages: [], profileData: {}, childrenData: [],
    });
    dbMocks.getRecentDiagnosticSignals.mockResolvedValue([]);
    dbMocks.createSpouseAdvice.mockResolvedValue(1);
    invokeLLMMock.mockResolvedValue({ choices: [{ message: { content: "1. Test\n- doe iets aardigs" } }] });
    dbMocks.getPartnersOfUser.mockResolvedValue([{
      id: 2, name: "Partner", partnershipId: 55, partnershipConfirmed: true, profileData: {},
    }]);
  });

  function ctxFor(name: string, gender: string | undefined | null, language = "ar") {
    return {
      req: {} as any,
      res: {} as any,
      user: { id: 1, name, language, gender, profileData: {} } as any,
    };
  }

  function promptText() {
    const call = invokeLLMMock.mock.calls[0][0] as { messages: { role: string; content: string }[] };
    return call.messages.map((m) => m.content).join("\n");
  }

  it("male user, Arabic: no Latin name in the prompt, partner named زوجتك (your wife)", async () => {
    await adviceRouter.createCaller(ctxFor("Suhayb Salam", "man", "ar")).getSpouseAdvice({ language: "ar" });
    const text = promptText();
    expect(text).not.toContain("Suhayb Salam");
    expect(text).toContain("زوجتك");
    expect(text).not.toContain("زوجك");
    expect(text).not.toContain("شريكك");
  });

  it("female user, Arabic: no Latin name in the prompt, partner named زوجك (your husband)", async () => {
    await adviceRouter.createCaller(ctxFor("Fatima Zahra", "vrouw", "ar")).getSpouseAdvice({ language: "ar" });
    const text = promptText();
    expect(text).not.toContain("Fatima Zahra");
    expect(text).toContain("زوجك");
    expect(text).not.toContain("زوجتك");
  });

  it("unknown gender, Arabic: falls back to the neutral شريكك (your partner)", async () => {
    await adviceRouter.createCaller(ctxFor("No Gender", undefined, "ar")).getSpouseAdvice({ language: "ar" });
    const text = promptText();
    expect(text).toContain("شريكك");
    expect(text).not.toContain("زوجتك");
    expect(text).not.toContain("زوجك");
  });

  it("gender resolved from the profileData JSON copy when the users.gender column is missing (resolveGender fallback)", async () => {
    const ctx = {
      req: {} as any,
      res: {} as any,
      user: {
        id: 1, name: "Column Missing", language: "ar", gender: null,
        profileData: { parentProfile: { gender: "vrouw" } },
      } as any,
    };
    await adviceRouter.createCaller(ctx).getSpouseAdvice({ language: "ar" });
    expect(promptText()).toContain("زوجك");
  });

  it("male user, English: no Latin name in the prompt, partner named 'your wife'", async () => {
    await adviceRouter.createCaller(ctxFor("Suhayb Salam", "man", "en")).getSpouseAdvice({ language: "en" });
    const text = promptText();
    expect(text).not.toContain("Suhayb Salam");
    expect(text).toContain("your wife");
    expect(text).not.toContain("your husband");
  });

  it("male user, Dutch: no Latin name in the prompt, partner named 'je vrouw'", async () => {
    await adviceRouter.createCaller(ctxFor("Suhayb Salam", "man", "nl")).getSpouseAdvice({ language: "nl" });
    const text = promptText();
    expect(text).not.toContain("Suhayb Salam");
    expect(text).toContain("je vrouw");
    expect(text).not.toContain("je man");
  });
});

// The block is headed "last 7 days" but its guard tested the UNFILTERED array,
// so a partner whose dailyCheckins array stopped growing months ago (nothing
// writes it any more — see lib/advice-period.ts checkinsLast7Days) still
// produced `--- Partner's daily check-ins (last 7 days) ---\nPrayer: \nMood: `.
// Blank values under that header assert to the model that the partner logged
// nothing THIS WEEK, which is a claim, not silence. Same call this branch
// already made for the partner panel in app/(tabs)/family.tsx: an empty array
// is absence of data, not absence of activity — say nothing.
describe("getSpouseAdvice: the partner check-in block reports the 7-day window, not the array", () => {
  const HEADER = "Partner's daily check-ins (last 7 days)";
  const dayKey = (daysAgo: number) =>
    new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  function runWith(dailyCheckins: unknown) {
    dbMocks.getSpouseInteractionData.mockResolvedValue({
      goals: [], conversations: [], messages: [], profileData: { dailyCheckins }, childrenData: [],
    });
    return adviceRouter
      .createCaller({ req: {} as any, res: {} as any, user: { id: 1, name: "U", language: "en", gender: "man", profileData: {} } as any })
      .getSpouseAdvice({ language: "en" });
  }

  function promptText() {
    const call = invokeLLMMock.mock.calls[0][0] as { messages: { role: string; content: string }[] };
    return call.messages.map((m) => m.content).join("\n");
  }

  beforeEach(() => {
    invokeLLMMock.mockReset();
    dbMocks.getPartnersOfUser.mockReset();
    dbMocks.getSpouseInteractionData.mockReset();
    dbMocks.getRecentDiagnosticSignals.mockReset();
    dbMocks.createSpouseAdvice.mockReset();
    dbMocks.getRecentDiagnosticSignals.mockResolvedValue([]);
    dbMocks.createSpouseAdvice.mockResolvedValue(1);
    invokeLLMMock.mockResolvedValue({ choices: [{ message: { content: "1. Test\n- doe iets aardigs" } }] });
    dbMocks.getPartnersOfUser.mockResolvedValue([{
      id: 2, name: "Partner", partnershipId: 55, partnershipConfirmed: true, profileData: {},
    }]);
  });

  it("omits the block when every stored check-in falls outside the window", async () => {
    await runWith([
      { date: "2025-11-01", prayer: "alle_5_op_tijd", mood: "rustig" },
      { date: "2025-11-02", prayer: "sommige_gemist", mood: "moe" },
    ]);
    expect(promptText()).not.toContain(HEADER);
  });

  // Presence, not only absence: a guard that merely deleted the block would
  // satisfy the test above while silently dropping a real signal.
  it("still emits the block, with its values, when a check-in falls inside the window", async () => {
    await runWith([
      { date: "2025-11-01", prayer: "OLD_PRAYER", mood: "OLD_MOOD" },
      { date: dayKey(1), prayer: "alle_5_op_tijd", mood: "rustig" },
    ]);
    const text = promptText();
    expect(text).toContain(HEADER);
    expect(text).toContain("alle_5_op_tijd");
    expect(text).toContain("rustig");
    expect(text).not.toContain("OLD_PRAYER");
  });

  it("omits the block when the partner has no check-ins at all", async () => {
    await runWith([]);
    expect(promptText()).not.toContain(HEADER);
  });

  // profileData is stored through z.any() (server/routers.ts:1366), so the
  // PARTNER controls this blob's shape and it need not be an array. The
  // original `?.length > 0` guard skipped a non-array by accident; filtering
  // it directly would throw `.filter is not a function` — a 500 on the OTHER
  // user's advice request, triggered by data the partner wrote.
  it.each([[{}], [5], [true], ["not-an-array"]])(
    "skips a non-array dailyCheckins (%p) instead of throwing",
    async (stored) => {
      await expect(runWith(stored)).resolves.toBeDefined();
      expect(promptText()).not.toContain(HEADER);
    },
  );

  // The ELEMENTS are partner-controlled too, and the dated window reads
  // `.date` off every one of them — where the old `slice(-7)` only ever
  // touched the last seven. A null entry anywhere in the stored history is
  // the same cross-user 500.
  it("drops null/garbage entries and still reports the real ones", async () => {
    await runWith([null, undefined, 42, { date: dayKey(2), prayer: "fajr_gemist", mood: "moe" }]);
    const text = promptText();
    expect(text).toContain(HEADER);
    expect(text).toContain("fajr_gemist");
  });

  it("omits the block when every entry is garbage", async () => {
    await expect(runWith([null, undefined])).resolves.toBeDefined();
    expect(promptText()).not.toContain(HEADER);
  });

  // The whole profileData blob is partner-written through z.any(), not just
  // dailyCheckins. Every `?.length > 0` test in this procedure passes for a
  // STRING, so any sibling block that then calls .map/.slice is the same
  // cross-user 500. Asserted as a class, so hardening one block at a time
  // cannot look finished.
  describe.each([
    ["environments", "envs-as-a-string", "Partner has not completed any child environment analysis"],
    ["dailyTipCompletions", "tips-as-a-string", "Partner has not completed any daily tips recently"],
  ])("%s stored as a non-array", (field, value, nothingToReport) => {
    it("does not throw, and takes the 'nothing to report' branch", async () => {
      dbMocks.getSpouseInteractionData.mockResolvedValue({
        goals: [], conversations: [], messages: [], childrenData: [],
        profileData: { [field]: value },
      });
      await expect(
        adviceRouter
          .createCaller({ req: {} as any, res: {} as any, user: { id: 1, name: "U", language: "en", gender: "man", profileData: {} } as any })
          .getSpouseAdvice({ language: "en" }),
      ).resolves.toBeDefined();
      // A string survives .slice()/.length, so "no crash" is not enough: the
      // model must not be told the partner completed 10 of anything.
      expect(promptText()).toContain(nothingToReport);
    });
  });

  it("does not throw when childrenData is a non-array", async () => {
    dbMocks.getSpouseInteractionData.mockResolvedValue({
      goals: [], conversations: [], messages: [], profileData: {},
      childrenData: "kids-as-a-string",
    });
    await expect(
      adviceRouter
        .createCaller({ req: {} as any, res: {} as any, user: { id: 1, name: "U", language: "en", gender: "man", profileData: {} } as any })
        .getSpouseAdvice({ language: "en" }),
    ).resolves.toBeDefined();
  });

  // Presence: real arrays must still be described to the model.
  it("still reports real environments and children", async () => {
    dbMocks.getSpouseInteractionData.mockResolvedValue({
      goals: [], conversations: [], messages: [],
      profileData: { environments: [{ childName: "Ahmad" }] },
      childrenData: [{ name: "Ahmad", birthDate: "2018-01-01" }],
    });
    await adviceRouter
      .createCaller({ req: {} as any, res: {} as any, user: { id: 1, name: "U", language: "en", gender: "man", profileData: {} } as any })
      .getSpouseAdvice({ language: "en" });
    const text = promptText();
    expect(text).toContain("Child environment analyses completed by partner: 1");
    expect(text).toContain("Ahmad");
  });
});
