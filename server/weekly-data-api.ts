/**
 * Server-side weekly data API - serves tarbiya goals from the new Arabic dataset.
 * Data source: assets/data/tarbiya/year_{N}.json (20 years: -1 to 18)
 * 
 * Each year has 52 weeks, each week has 16 goals categorized by stage:
 * - التزكية (القلب) = tazkiyah (heart purification)
 * - التصفية (العقل) = tasfiyah (mind clarification)
 * - التربية (الجوارح واللسان) = tarbiyah (limbs & tongue training)
 * 
 * Translation: Arabic is the source language. Dutch/English are translated on-demand via LLM.
 */
import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Caches
const yearCache: Record<string, any> = {};
// translationCache no longer needed - translations are in JSON data

function resolveTarbiyaPath(yearNum: number): string {
  const filename = `year_${yearNum}.json`;
  const relPath = path.resolve(__dirname, "../assets/data/tarbiya", filename);
  if (fs.existsSync(relPath)) return relPath;
  return path.resolve(process.cwd(), "assets/data/tarbiya", filename);
}

function loadYearRaw(yearNum: number): any {
  const cacheKey = `raw_${yearNum}`;
  if (yearCache[cacheKey]) return yearCache[cacheKey];
  
  const filePath = resolveTarbiyaPath(yearNum);
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);
    yearCache[cacheKey] = data;
    return data;
  } catch (e) {
    console.error(`[weekly-data-api] Failed to load year ${yearNum}:`, e);
    return null;
  }
}

/**
 * Transform raw week data into the format expected by the client.
 * Groups goals by stage (tazkiyah/tasfiyah/tarbiyah).
 */
function transformWeekForClient(week: any): any {
  if (!week || !week.goals) return null;
  
  const goals = week.goals || [];
  
  // Group by stage
  const tazkiyah = goals.filter((g: any) => g.stage && g.stage.includes("التزكية"));
  const tasfiyah = goals.filter((g: any) => g.stage && g.stage.includes("التصفية"));
  const tarbiyah = goals.filter((g: any) => g.stage && g.stage.includes("التربية"));
  
  const mapGoal = (g: any) => ({
    num: g.num,
    type: g.type || "",
    goal: g.goal || "",
    goal_nl: g.goal_nl || "",
    goal_en: g.goal_en || "",
    source: g.source || "",
    method: g.method || "",
    method_nl: g.method_nl || "",
    method_en: g.method_en || "",
    steps: g.steps || "",
    steps_nl: g.steps_nl || "",
    steps_en: g.steps_en || "",
    stage: g.stage || "",
  });
  
  return {
    week: week.week,
    tazkiyah: tazkiyah.map(mapGoal),
    tasfiyah: tasfiyah.map(mapGoal),
    tarbiyah: tarbiyah.map(mapGoal),
    foundations: week.foundations || [],
    activities: week.activities || [],
  };
}

/**
 * Translate a batch of goals from Arabic to target language.
 * Uses LLM with caching to avoid repeated translations.
 */
async function translateGoalsBatch(goals: any[], yearNum: number, weekNum: number, category: string, lang: "nl" | "en"): Promise<any[]> {
  if (goals.length === 0) return [];
  
  // Use pre-translated fields from JSON data (goal_nl/goal_en, method_nl/method_en, steps_nl/steps_en)
  const suffix = lang === "nl" ? "_nl" : "_en";
  return goals.map(g => ({
    ...g,
    goalTr: g[`goal${suffix}`] || g.goal,
    methodTr: g[`method${suffix}`] || g.method,
    stepsTr: g[`steps${suffix}`] || g.steps,
  }));
}

/**
 * Translate foundations (Qur'aan verses context + hadieth context) from Arabic to target language.
 * Keeps the original Arabic verse/hadieth text but translates the explanatory text and title.
 */
async function translateFoundationsBatch(foundations: any[], yearNum: number, weekNum: number, lang: "nl" | "en"): Promise<any[]> {
  if (!foundations || foundations.length === 0) return foundations;
  
  const langName = lang === "nl" ? "Dutch" : "English";
  const verseField = lang === "nl" ? "verse_nl" : "verse_en";
  const hadithField = lang === "nl" ? "hadith_nl" : "hadith_en";
  
  // Collect texts that need on-demand translation
  const needsVerseTr: { idx: number; text: string }[] = [];
  const needsHadithTr: { idx: number; text: string }[] = [];
  
  const results = foundations.map((f, idx) => {
    const translated = { ...f };
    const titleField = lang === "nl" ? "title_nl" : "title_en";
    const textField = lang === "nl" ? "text_nl" : "text_en";
    
    if (f[titleField]) {
      translated.titleTr = f[titleField];
    }
    if (f.content?.[textField]) {
      translated.textTr = f.content[textField];
    }
    // Use pre-translated if available
    if (f.content?.[verseField]) {
      translated.verseTr = f.content[verseField];
    } else if (f.content?.verse) {
      needsVerseTr.push({ idx, text: f.content.verse });
    }
    if (f.content?.[hadithField]) {
      translated.hadithTr = f.content[hadithField];
    } else if (f.content?.hadith) {
      const hadithText = f.content.hadith.split(' \u2014 ')[0];
      needsHadithTr.push({ idx, text: hadithText });
    }
    return translated;
  });
  
  // On-demand LLM translation for missing verse/hadith translations (batch)
  if (needsVerseTr.length > 0 || needsHadithTr.length > 0) {
    try {
      const allTexts = [
        ...needsVerseTr.map(v => v.text),
        ...needsHadithTr.map(h => h.text),
      ];
      const numbered = allTexts.map((t, i) => `${i + 1}. ${t}`).join('\n');
      const prompt = `Translate each Arabic Islamic text to ${langName}. Return ONLY numbered translations:\n${numbered}`;
      const response = await invokeLLM({
        messages: [
          { role: "system", content: `Translate Arabic Islamic texts to ${langName}. Return numbered translations matching input.` },
          { role: "user", content: prompt },
        ],
        maxTokens: 4000,
      });
      const respContent = response?.choices?.[0]?.message?.content;
      const textContent = typeof respContent === 'string' ? respContent : Array.isArray(respContent) ? respContent.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('') : '';
      if (textContent) {
        const lines = textContent.split('\n').filter((l: string) => l.trim());
        const translations = lines.map((l: string) => l.replace(/^\d+[\.)\.]\s*/, '').trim());
        let tIdx = 0;
        for (const item of needsVerseTr) {
          if (tIdx < translations.length && translations[tIdx]) {
            results[item.idx].verseTr = translations[tIdx];
          }
          tIdx++;
        }
        for (const item of needsHadithTr) {
          if (tIdx < translations.length && translations[tIdx]) {
            results[item.idx].hadithTr = translations[tIdx];
          }
          tIdx++;
        }
      }
    } catch (e) {
      // Silently fail - Arabic text will still show
    }
  }
  
  return results;
}

/**
 * Translate activities from Arabic to target language.
 */
async function translateActivitiesBatch(activities: any[], yearNum: number, weekNum: number, lang: "nl" | "en"): Promise<any[]> {
  if (!activities || activities.length === 0) return activities;
  
  // Use pre-translated fields from JSON data (title_nl/title_en, content.goal_nl/goal_en, etc.)
  return activities.map(a => {
    const translated = { ...a };
    const suffix = lang === "nl" ? "_nl" : "_en";
    
    if (a[`title${suffix}`]) {
      translated.titleTr = a[`title${suffix}`];
    }
    if (a.content?.[`goal${suffix}`]) {
      translated.goalTr = a.content[`goal${suffix}`];
    }
    if (a.content?.[`steps${suffix}`]) {
      translated.stepsTr = a.content[`steps${suffix}`];
    }
    if (a.content?.[`tools${suffix}`]) {
      translated.toolsTr = a.content[`tools${suffix}`];
    }
    return translated;
  });
}

async function translateWeek(week: any, yearNum: number, lang: "nl" | "en"): Promise<any> {
  if (!week) return week;
  
  const [tazkiyahTr, tasfiyahTr, tarbiyahTr, foundationsTr, activitiesTr] = await Promise.all([
    translateGoalsBatch(week.tazkiyah || [], yearNum, week.week, "tazkiyah", lang),
    translateGoalsBatch(week.tasfiyah || [], yearNum, week.week, "tasfiyah", lang),
    translateGoalsBatch(week.tarbiyah || [], yearNum, week.week, "tarbiyah", lang),
    translateFoundationsBatch(week.foundations || [], yearNum, week.week, lang),
    translateActivitiesBatch(week.activities || [], yearNum, week.week, lang),
  ]);
  
  return {
    ...week,
    tazkiyah: tazkiyahTr,
    tasfiyah: tasfiyahTr,
    tarbiyah: tarbiyahTr,
    foundations: foundationsTr,
    activities: activitiesTr,
  };
}

export const weeklyDataRouter = router({
  getYear: publicProcedure
    .input(z.object({ year: z.number().min(-1).max(18), lang: z.string().optional() }))
    .query(async ({ input }) => {
      const lang = (input.lang || "ar") as "ar" | "nl" | "en";
      const rawData = loadYearRaw(input.year);
      if (!rawData) return { weeks: [], name: "", characteristics: "" };
      
      // Transform all weeks
      const weeks = (rawData.weeks || []).map(transformWeekForClient).filter(Boolean);
      
      const result = {
        name: rawData.name || "",
        characteristics: rawData.characteristics || "",
        characteristics_nl: rawData.characteristics_nl || "",
        characteristics_en: rawData.characteristics_en || "",
        distribution: rawData.distribution || "",
        weeks,
      };
      
      // If not Arabic, apply pre-saved translations from JSON fields
      if (lang !== "ar" && weeks.length > 0) {
        const translatedWeeks = await Promise.all(
          weeks.map((w: any) => translateWeek(w, input.year, lang as "nl" | "en"))
        );
        return { ...result, weeks: translatedWeeks };
      }
      
      return result;
    }),

  getWeek: publicProcedure
    .input(z.object({ year: z.number().min(-1).max(18), week: z.number().min(1).max(156), lang: z.string().optional() }))
    .query(async ({ input }) => {
      const lang = (input.lang || "ar") as "ar" | "nl" | "en";
      const rawData = loadYearRaw(input.year);
      if (!rawData || !rawData.weeks) return null;
      
      const rawWeek = rawData.weeks.find((w: any) => w.week === input.week);
      if (!rawWeek) return null;
      
      const week = transformWeekForClient(rawWeek);
      if (!week) return null;
      
      // Translate if needed
      if (lang !== "ar") {
        return await translateWeek(week, input.year, lang as "nl" | "en");
      }
      
      return week;
    }),

  listYears: publicProcedure.query(() => {
    return Array.from({ length: 20 }, (_, i) => {
      const yearNum = i - 1; // -1 to 18
      let label = "";
      if (yearNum === -1) label = "السنة -١ (الحمل)";
      else if (yearNum === 0) label = "السنة 0 (الرضاعة)";
      else label = `السنة ${yearNum}`;
      return { key: `Jaar ${yearNum}`, yearNum, label };
    });
  }),
});
