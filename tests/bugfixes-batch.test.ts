import { describe, it, expect } from "vitest";
import fs from "fs";

// ============ Fix #1: Children cards 2-column grid ============
describe("Fix #1: Children cards 2-column grid layout", () => {
  it("should have childrenGrid with flexWrap and flexDirection row", () => {
    const content = fs.readFileSync("app/(tabs)/index.tsx", "utf-8");
    expect(content).toContain("childrenGrid");
    expect(content).toContain("flexWrap");
    expect(content).toContain('"wrap"');
    expect(content).toContain('"row"');
  });

  it("should have childCard with 48% width", () => {
    const content = fs.readFileSync("app/(tabs)/index.tsx", "utf-8");
    expect(content).toContain('"48%"');
    expect(content).toContain("childCard");
  });
});

// ============ Fix #2: Personal advice collapsible sections ============
describe("Fix #2: Personal advice collapsible sections", () => {
  it("should have AdviceSectionCollapsible component in family.tsx", () => {
    const content = fs.readFileSync("app/(tabs)/family.tsx", "utf-8");
    expect(content).toContain("AdviceSectionCollapsible");
    expect(content).toContain("function AdviceSectionCollapsible");
  });

  it("should render sections with title and content props", () => {
    const content = fs.readFileSync("app/(tabs)/family.tsx", "utf-8");
    expect(content).toContain("sec.title");
    expect(content).toContain("sec.content");
  });
});

// ============ Fix #3: Q&A page suggestion chips send messages directly ============
describe("Fix #3: Q&A suggestion chips send messages directly", () => {
  it("should have sendMessageWithText function in ai-chat.tsx", () => {
    const content = fs.readFileSync("app/ai-chat.tsx", "utf-8");
    expect(content).toContain("sendMessageWithText");
  });

  it("suggestion chips should call sendMessageWithText", () => {
    const content = fs.readFileSync("app/ai-chat.tsx", "utf-8");
    expect(content).toContain("sendMessageWithText(suggestion)");
  });
});

// ============ Fix #4: Refresh advice button ============
describe("Fix #4: Refresh advice button stores sections", () => {
  it("should have fetchParentAdvice function in family.tsx", () => {
    const content = fs.readFileSync("app/(tabs)/family.tsx", "utf-8");
    expect(content).toContain("fetchParentAdvice");
    expect(content).toContain("async function fetchParentAdvice");
  });
});

// ============ Fix #5: Graduation cap icon replaced ============
describe("Fix #5: Graduation cap icon replaced with book icon", () => {
  it("should use menu-book icon instead of graduation cap in find-specialist.tsx", () => {
    const content = fs.readFileSync("app/find-specialist.tsx", "utf-8");
    expect(content).toContain("menu-book");
    expect(content).not.toContain("school");
  });
});

// ============ Fix #6: Collapsible settings + partner fields ============
describe("Fix #6: Collapsible settings and partner fields", () => {
  it("should have SettingsCollapsible component in settings.tsx", () => {
    const content = fs.readFileSync("app/(tabs)/settings.tsx", "utf-8");
    expect(content).toContain("function SettingsCollapsible");
    expect(content).toContain("SettingsCollapsible");
  });

  it("should have multiple collapsible sections", () => {
    const content = fs.readFileSync("app/(tabs)/settings.tsx", "utf-8");
    const matches = content.match(/<SettingsCollapsible/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(3);
  });

  it("should have partnerName and partnerId in store interface", () => {
    const storeContent = fs.readFileSync("lib/store.ts", "utf-8");
    expect(storeContent).toContain("partnerName");
    expect(storeContent).toContain("partnerId");
  });
});

// ============ Fix #7: Network specialist ID/QR ============
describe("Fix #7: Network specialist publicId field", () => {
  it("should have publicId field in network.tsx", () => {
    const content = fs.readFileSync("app/network.tsx", "utf-8");
    expect(content).toContain("publicId");
  });

  it("should display publicId for user", () => {
    const content = fs.readFileSync("app/network.tsx", "utf-8");
    expect(content).toContain("myIdQuery.data.publicId");
  });
});

// ============ Fix #8: Hijri calendar consistency ============
describe("Fix #8: Hijri calendar consistency (getIslamicDate)", () => {
  it("should use correct Julian Day formula", () => {
    const content = fs.readFileSync("lib/prayer-data.ts", "utf-8");
    // Check the corrected formula is present
    expect(content).toContain("getIslamicDate");
    expect(content).toContain("(jd - 2) - 1948440 + 10632");
  });

  it("getIslamicDate should return consistent results", async () => {
    // Import the function
    const mod = await import("../lib/prayer-data");
    const { getIslamicDate } = mod;

    // Test with a known date (no maghrib adjustment)
    const testDate = new Date("2025-01-15T12:00:00Z");
    const result1 = getIslamicDate(testDate, null);
    const result2 = getIslamicDate(testDate, null);

    // Same input should give same output
    expect(result1.day).toBe(result2.day);
    expect(result1.month).toBe(result2.month);
    expect(result1.year).toBe(result2.year);

    // Day should be between 1-30
    expect(result1.day).toBeGreaterThanOrEqual(1);
    expect(result1.day).toBeLessThanOrEqual(30);

    // Month should be between 1-12
    expect(result1.month).toBeGreaterThanOrEqual(1);
    expect(result1.month).toBeLessThanOrEqual(12);

    // Year should be reasonable (1446-1447 for 2025)
    expect(result1.year).toBeGreaterThanOrEqual(1446);
    expect(result1.year).toBeLessThanOrEqual(1447);

    // Month name should be non-empty
    expect(result1.monthName.length).toBeGreaterThan(0);
    expect(result1.monthNameAR.length).toBeGreaterThan(0);
  });

  it("getIslamicDate should advance day after maghrib", async () => {
    const mod = await import("../lib/prayer-data");
    const { getIslamicDate } = mod;

    // Test with a date before maghrib (noon)
    const testDate = new Date("2025-06-15T12:00:00Z");
    const beforeMaghrib = getIslamicDate(testDate, "20:00", "Europe/Amsterdam");

    // Test with same date after maghrib (21:00)
    const testDateEvening = new Date("2025-06-15T21:00:00Z");
    const afterMaghrib = getIslamicDate(testDateEvening, "20:00", "Europe/Amsterdam");

    // After maghrib should be one day ahead (or next month)
    if (beforeMaghrib.month === afterMaghrib.month) {
      expect(afterMaghrib.day).toBe(beforeMaghrib.day + 1);
    } else {
      // Day reset to 1 (new month)
      expect(afterMaghrib.day).toBe(1);
    }
  });
});

// ============ Fix #9: stripHtml function ============
describe("Fix #9: stripHtml removes HTML tags from content", () => {
  it("should have stripHtml function in content detail page", () => {
    const content = fs.readFileSync("app/content/detail/[id].tsx", "utf-8");
    expect(content).toContain("function stripHtml");
    expect(content).toContain("stripHtml(translation.body)");
  });

  it("stripHtml should correctly remove HTML tags", () => {
    // Replicate the function logic for testing
    function stripHtml(html: string): string {
      return html
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }

    expect(stripHtml("<p>Hello</p>")).toBe("Hello");
    expect(stripHtml("<div><strong>Bold</strong> text</div>")).toBe("Bold text");
    expect(stripHtml("No tags here")).toBe("No tags here");
    expect(stripHtml("&amp; &lt; &gt; &quot; &#39;")).toBe('& < > " \'');
    expect(stripHtml("<br/>&nbsp;space")).toBe("space");
    expect(stripHtml("<h1>Title</h1><p>Body</p>")).toBe("TitleBody");
    expect(stripHtml("")).toBe("");
  });

  it("concepts.json should not contain HTML tags", () => {
    const conceptsData = require("../assets/data/concepts.json");
    const htmlTagRegex = /<[a-z][^>]*>/i;
    for (const concept of conceptsData) {
      // Check all text fields
      const fields = [
        concept.nameAR, concept.nameEN, concept.nameNL,
        concept.descriptionAR, concept.descriptionEN, concept.descriptionNL,
        concept.sourceAR, concept.sourceEN, concept.sourceNL,
        concept.scholarAR, concept.scholarEN, concept.scholarNL,
      ];
      for (const field of fields) {
        if (field) {
          expect(htmlTagRegex.test(field), `Found HTML in: ${field.substring(0, 50)}`).toBe(false);
        }
      }
    }
  });
});

// ============ Fix #10: Sunnah Companion share text no longer drops content ============
describe("Fix #10: Sunnah Companion shareMoment includes everything renderMoment shows", () => {
  // Daa3iyah's report: the share button dropped the deeds list, each dua's reflect
  // line, and the whole 4-category advice section. Replicate shareMoment()'s logic
  // (same approach as Fix #9's stripHtml test) against a fixture moment and assert
  // every piece that renderMoment() displays is present in the shared text.
  type Loc = string | { ar?: string; nl?: string; en?: string };
  const tt = (nl: string, en: string, ar: string) => ar;
  const L = (v: Loc | undefined): string => (v == null ? "" : typeof v === "string" ? v : (v.ar ?? v.nl ?? v.en ?? ""));

  const moment = {
    title: "عنوان الموضع",
    ikhlas: "نص الإخلاص",
    duas: [{ text: "نص الدعاء", source: "رواه البخاري", reward: "نص الأجر", reflect: "نص التفكر" }],
    deeds: ["عمل مصاحب أول", "عمل مصاحب ثانٍ"],
    advice: { think: ["فكرة أولى"], feel: ["إحساس أول"], speak: ["كلمة أولى"], act: ["فعل أول"] },
  };

  function adviceLine(label: string, arr?: string[]) {
    return arr && arr.length ? `\n${label}:\n${arr.map((it) => `  • ${L(it)}`).join("\n")}` : "";
  }

  // Mirrors the on-screen order in renderMoment(): text -> reward -> reflect -> source.
  function shareMoment(m: typeof moment) {
    return (
      `🕌 ${L(m.title)}\n\n` +
      `• ${tt("Ikhlaas", "Sincerity", "تذكيرُ الإخلاص")}: ${L(m.ikhlas)}\n\n` +
      (m.duas || []).map((d) => `• ${d.text}${d.reward ? `\n${tt("Beloning", "Reward", "الأجر")}: ${L(d.reward)}` : ""}${d.reflect ? `\n${tt("Overdenk", "Reflect", "تفكّر")}: ${L(d.reflect)}` : ""}\n(${L(d.source)})`).join("\n\n") +
      (m.deeds && m.deeds.length ? `\n\n${tt("Bijbehorende daden", "Accompanying deeds", "أعمالٌ مصاحبة")}:\n${m.deeds.map((it) => `  • ${L(it)}`).join("\n")}` : "") +
      (m.advice ? `\n\n${tt("Adviezen", "Advice", "نصائح")}:` +
        adviceLine(tt("In je denken", "In your thinking", "في تفكيرك"), m.advice.think) +
        adviceLine(tt("In je gevoel", "In your feeling", "في إحساسك"), m.advice.feel) +
        adviceLine(tt("In je spreken", "In your speech", "في خطابك"), m.advice.speak) +
        adviceLine(tt("In je handelen", "In your action", "في جوارحك"), m.advice.act)
        : "")
    );
  }

  it("shared text should include the dua reflect line", () => {
    expect(shareMoment(moment)).toContain("نص التفكر");
  });

  it("shared text should include every accompanying deed", () => {
    const text = shareMoment(moment);
    expect(text).toContain("عمل مصاحب أول");
    expect(text).toContain("عمل مصاحب ثانٍ");
  });

  it("shared text should include all 4 advice categories", () => {
    const text = shareMoment(moment);
    expect(text).toContain("فكرة أولى");
    expect(text).toContain("إحساس أول");
    expect(text).toContain("كلمة أولى");
    expect(text).toContain("فعل أول");
  });

  it("dua fields should appear in the same order as renderMoment shows them (reward, reflect, then source)", () => {
    const text = shareMoment(moment);
    const rewardPos = text.indexOf("نص الأجر");
    const reflectPos = text.indexOf("نص التفكر");
    const sourcePos = text.indexOf("رواه البخاري");
    expect(rewardPos).toBeGreaterThan(-1);
    expect(reflectPos).toBeGreaterThan(rewardPos);
    expect(sourcePos).toBeGreaterThan(reflectPos);
  });

  it("app/sunnah.tsx source should reference deeds and reflect, and call adviceLine for all 4 categories", () => {
    // Checks distinctive strings only shareMoment (not renderMoment/AdviceRow/momentText)
    // would contain. A bare "m.advice.think" or "d.reflect" substring also appears in
    // renderMoment's AdviceRow calls and momentText's search-indexing code respectively
    // (both pre-existing, untouched by this fix), so those alone wouldn't catch a
    // regression in shareMoment specifically — cubic review flagged this (round 2).
    const content = fs.readFileSync("app/sunnah.tsx", "utf-8");
    expect(content).toContain("m.deeds.map((it) => `  • ${L(it)}`)");
    // renderMoment's own reflect label is tt("Overdenk: ", ...) (colon inside the
    // string); shareMoment's is tt("Overdenk", ...) with the colon appended outside —
    // distinct literal text, so this only matches shareMoment's own reflect handling.
    expect(content).toContain('tt("Overdenk", "Reflect", "تفكّر")');
    const adviceLineCalls = content.match(/adviceLine\(/g);
    expect(adviceLineCalls).not.toBeNull();
    expect(adviceLineCalls!.length).toBeGreaterThanOrEqual(4);
  });
});

// ============ Fix #11: Child data share no longer caps issues/treatment plans ============
describe("Fix #11: Child data share (app/child/share.tsx) includes all issues and full treatment text", () => {
  // Regexes, not literal-value checks (cubic review, round 4): a reworded cap
  // like issues.slice(0, 10) would dodge a not.toContain("issues.slice(0, 5)")
  // check while the bug persists. Matching on the call shape catches any cap.
  it("should not cap issues or treatment plans with .slice(...)", () => {
    const content = fs.readFileSync("app/child/share.tsx", "utf-8");
    expect(content).not.toMatch(/issues\.slice\(/);
    expect(content).not.toMatch(/treated\.slice\(/);
  });

  it("should not truncate treatment plan text with .substring(...)", () => {
    const content = fs.readFileSync("app/child/share.tsx", "utf-8");
    expect(content).not.toMatch(/treatmentPlan\?\.substring\(/);
  });

  it("treatment lines should fall back to description when title is missing (Issue has no .title field)", () => {
    const content = fs.readFileSync("app/child/share.tsx", "utf-8");
    expect(content).toContain('issue.title || issue.description || "—"}: ${issue.treatmentPlan}');
  });

  it("PDF export should escape the summary text before interpolating it into HTML", () => {
    const content = fs.readFileSync("app/child/share.tsx", "utf-8");
    expect(content).toContain("escapeHtml(text)");
  });
});

// ============ Fix #12: Push notification bodies capped at the shared send function ============
describe("Fix #12: sendPushNotification caps oversized bodies instead of letting the provider silently reject them", () => {
  it("sendPushNotification should use truncateToByteBudget on both title and body it sends", () => {
    // Cubic review (round 8): body was capped but title wasn't, an inconsistency
    // with broadcastLocalizedPush (fixed in the same diff) which caps both —
    // some callers embed unbounded strings into the title (e.g. a child's name).
    const content = fs.readFileSync("server/db.ts", "utf-8");
    expect(content).toContain("truncateToByteBudget(title, PUSH_BODY_BYTE_LIMIT)");
    expect(content).toContain("truncateToByteBudget(body, PUSH_BODY_BYTE_LIMIT)");
    expect(content).toContain("title: safeTitle");
    expect(content).toContain("body: safeBody");
  });

  // Cubic review (round 6/7): broadcastLocalizedPush builds its own Expo payload
  // instead of routing through sendPushNotification, so it kept the same
  // unbounded-payload failure mode for admin broadcast pushes.
  it("broadcastLocalizedPush should also cap title/body, since it sends its own request instead of routing through sendPushNotification", () => {
    const content = fs.readFileSync("server/db.ts", "utf-8");
    const broadcastFn = content.slice(content.indexOf("export async function broadcastLocalizedPush"));
    expect(broadcastFn).toContain("truncateToByteBudget(tx(lang, titleNl, titleEn, titleAr), PUSH_BODY_BYTE_LIMIT)");
    expect(broadcastFn).toContain("truncateToByteBudget(tx(lang, bodyNl, bodyEn, bodyAr), PUSH_BODY_BYTE_LIMIT)");
  });

  // Cubic review (round 4): a prior version of these tests re-implemented the
  // truncation loop instead of exercising the real one, so a future refactor
  // bug in server/db.ts wouldn't be caught. truncateToByteBudget is now
  // exported specifically so tests import and call the production function.
  // Cubic review (round 2): capping by .length (code points) instead of UTF-8
  // bytes still let Arabic-heavy bodies (2 bytes/char) blow the ~4KB budget.
  it("should keep an Arabic-heavy body under the byte budget, not just the character-count budget", async () => {
    const { truncateToByteBudget } = await import("../server/db");
    const arabicBody = "نصائح لتربية الأبناء على الكتاب والسنة ".repeat(60); // > 1200 bytes in UTF-8, well under 1200 chars
    const result = truncateToByteBudget(arabicBody, 1200);
    expect(Buffer.byteLength(result, "utf8")).toBeLessThanOrEqual(1200 + Buffer.byteLength("…", "utf8"));
    expect(result.length).toBeLessThan(arabicBody.length);
  });

  it("should not cut a multi-byte character in half", async () => {
    const { truncateToByteBudget } = await import("../server/db");
    const result = truncateToByteBudget("ع".repeat(2000), 1200);
    // A corrupted cut would produce the Unicode replacement character or an
    // unpaired surrogate when re-decoded; every char must round-trip cleanly.
    expect([...result.replace("…", "")].every((c) => c === "ع")).toBe(true);
  });

  it("should leave short bodies untouched", async () => {
    const { truncateToByteBudget } = await import("../server/db");
    expect(truncateToByteBudget("قصير", 1200)).toBe("قصير");
  });
});
