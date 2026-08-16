/**
 * Daily diagnostic check-in — replaces the guessed spouse advice.
 *
 * Each spouse answers a handful of short, single-choice questions about
 * THEMSELVES (prayer / psychological state / physical state / children) once
 * a day. Questions are generated per-family via the AI, with a static
 * fallback so a family never sees an empty check-in.
 *
 * PRIVACY (scoped to THIS module's own contribution only — see caveat
 * below): every question here is single-choice (no free text field exists
 * in this schema at all), and the signal this module adds to getSpouseAdvice
 * only ever carries the coarse category+tone summary via
 * summarizeSignals/buildPartnerSignalContext — never the option `label`
 * text. That is what makes it structurally impossible for THIS data to
 * leak a raw answer into the prompt whose output comes back to the other
 * spouse. Nothing here is read by getPartnerProfile/syncWithPartner — this
 * is a dedicated table + router.
 *
 * CAVEAT — this is not a blanket guarantee about getSpouseAdvice as a whole:
 * that same function still concatenates the partner's pre-existing, free-text
 * dailyCheckins.openAnswer into the same prompt (server/advice.ts, the
 * "Daily checkins from partner" block above where this module's signal is
 * appended). That is a known, PRE-EXISTING leak this task was told not to
 * extend, not one this module fixes — flagged to the product owner, not
 * silently patched.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "./_core/trpc";
import * as db from "./db";
import { invokeLLM } from "./_core/llm";

export const DIAGNOSTIC_CATEGORIES = ["prayer", "psychological", "physical", "children"] as const;
export type DiagnosticCategory = (typeof DIAGNOSTIC_CATEGORIES)[number];
export type DiagnosticTone = "positive" | "neutral" | "needs_support";
export type Lang = "nl" | "en" | "ar";
export type Gender = "man" | "vrouw" | "";

export interface DiagnosticOption {
  label: string;
  tone: DiagnosticTone;
}
export interface DiagnosticQuestion {
  category: DiagnosticCategory;
  text: string;
  options: DiagnosticOption[];
}
export interface DiagnosticAnswer {
  category: DiagnosticCategory;
  label: string;
  tone: DiagnosticTone;
}

const TONES: readonly DiagnosticTone[] = ["positive", "neutral", "needs_support"];

const optionSchema = z.object({
  label: z.string().trim().min(1).max(60),
  tone: z.enum(TONES as [DiagnosticTone, ...DiagnosticTone[]]),
});
const questionSchema = z.object({
  category: z.enum(DIAGNOSTIC_CATEGORIES),
  text: z.string().trim().min(1).max(160),
  options: z
    .array(optionSchema)
    .min(2)
    .max(4)
    // Distinct labels only — a duplicate would render as a duplicate React
    // key on the client and make two option rows highlight on one tap.
    .refine((options) => new Set(options.map((o) => o.label)).size === options.length, {
      message: "Option labels must be distinct within a question",
    }),
});
const questionSetSchema = z.array(questionSchema).length(DIAGNOSTIC_CATEGORIES.length);

// ============================================================
// Static fallback — always available, no network dependency
// ============================================================

// No `lang` parameter: every call site only ever reaches gAr's return value
// through t()'s third (Arabic) argument, which t() itself only reads when
// lang === "ar" — a lang check inside gAr can never actually change what
// gets rendered, so it isn't taken as a parameter here at all.
function gAr(gender: Gender, male: string, female: string, neutral: string): string {
  return gender === "man" ? male : gender === "vrouw" ? female : neutral;
}

/**
 * Deterministic, trilingual, gendered fallback question set. Used whenever
 * generation fails or hasn't run yet — a family must never see an empty
 * check-in.
 */
export function buildFallbackQuestions(gender: Gender, lang: Lang): DiagnosticQuestion[] {
  const t = (nl: string, en: string, ar: string) => (lang === "ar" ? ar : lang === "en" ? en : nl);

  return [
    {
      // Deliberately NOT "was your prayer on time" — the home screen's
      // existing check-in already asks that. This asks about presence of
      // mind (khushoo'), a distinct angle, so the two cards never repeat
      // the same question.
      category: "prayer",
      text: t("Hoe was uw aanwezigheid van geest tijdens het gebed vandaag?", "How present were you during your prayer today?", "كيف كان خشوعك في الصلاة اليوم؟"),
      options: [
        { label: t("Aanwezig en geconcentreerd", "Present and focused", "خاشعاً ومركّزاً"), tone: "positive" },
        { label: t("Vaak afgeleid", "Often distracted", "كثير التشتت"), tone: "needs_support" },
        { label: t("Wisselend", "It varied", "متفاوت"), tone: "neutral" },
      ],
    },
    {
      category: "psychological",
      text: t("Hoe was uw gemoedstoestand vandaag?", "How was your mood today?", "كيف كانت حالتك النفسية اليوم؟"),
      options: [
        {
          label: t(
            "Rustig en tevreden",
            "Calm and content",
            gAr(gender, "مطمئن ومرتاح البال", "مطمئنة ومرتاحة البال", "مطمئن ومرتاح البال"),
          ),
          tone: "positive",
        },
        {
          label: t(
            "Gestrest of bezorgd",
            "Stressed or worried",
            gAr(gender, "متوتر أو مهموم", "متوترة أو مهمومة", "متوتر أو مهموم"),
          ),
          tone: "needs_support",
        },
        { label: t("Gewone dag", "An ordinary day", "حالة عادية"), tone: "neutral" },
      ],
    },
    {
      category: "physical",
      text: t("Hoe was uw lichamelijke gesteldheid vandaag?", "How was your physical state today?", "كيف كانت حالتك الجسدية اليوم؟"),
      options: [
        {
          label: t("Fit en energiek", "Fit and energetic", gAr(gender, "نشيط وبصحة جيدة", "نشيطة وبصحة جيدة", "نشيط وبصحة جيدة")),
          tone: "positive",
        },
        {
          label: t("Moe of uitgeput", "Tired or exhausted", gAr(gender, "متعب أو مرهق", "متعبة أو مرهقة", "متعب أو مرهق")),
          tone: "needs_support",
        },
        { label: t("Gewone dag", "An ordinary day", "حالة عادية"), tone: "neutral" },
      ],
    },
    {
      category: "children",
      text: t("Hoe ging het vandaag met de kinderen?", "How did it go with the children today?", "كيف كان تعاملك مع الأبناء اليوم؟"),
      options: [
        {
          label: t(
            "Geduldig en betrokken",
            "Patient and engaged",
            gAr(gender, "كنت صبورا ومتفاعلا معهم", "كنت صبورة ومتفاعلة معهم", "كنت صبورا معهم"),
          ),
          tone: "positive",
        },
        { label: t("Te weinig aandacht gegeven", "Gave them too little attention", "قصّرت في الاهتمام بهم اليوم"), tone: "needs_support" },
        { label: t("Gewone dag", "An ordinary day", "تعامل عادي"), tone: "neutral" },
      ],
    },
  ];
}

// ============================================================
// AI generation: prompt + strict parse/validate (never trust raw output)
// ============================================================

export function buildGenerationPrompt(input: { gender: Gender; lang: Lang; childrenAges: number[] }): {
  system: string;
  user: string;
} {
  const { gender, lang, childrenAges } = input;
  const categoryList = DIAGNOSTIC_CATEGORIES.join(", ");
  const system =
    lang === "ar"
      ? `أنت تُعِدّ أسئلة تسجيل يومي قصيرة داخل تطبيق أسري إسلامي. أعد أربعة أسئلة فقط، سؤال واحد بالضبط لكل فئة من: ${categoryList} (الصلاة، الحالة النفسية، الحالة الجسدية، التعامل مع الأبناء) بهذا الترتيب.
كل سؤال: سطر واحد قصير بالعربية الفصحى فقط، بلا أي حروف لاتينية.
كل سؤال له 2 إلى 4 خيارات إجابة قصيرة (بضع كلمات لا أكثر) — ممنوع طلب إجابة حرة مطلقًا. كل خيار يحمل وسم tone بقيمة واحدة من: positive أو neutral أو needs_support.
سؤال فئة الصلاة تحديدًا: لا تسأل هل صلّى في وقتها أو فاتته صلاة — هذا التطبيق يسأل ذلك في مكان آخر من الشاشة. اسأل عن جانب مختلف مثل الخشوع أو الحضور القلبي.
أعد النتيجة بصيغة JSON فقط بلا أي شرح، مصفوفة من أربعة عناصر شكل كل عنصر: {"category":"...","text":"...","options":[{"label":"...","tone":"..."}]}`
      : lang === "en"
        ? `You write short daily check-in questions for an Islamic family app. Return exactly four questions, one per category, in this order: ${categoryList} (prayer, psychological state, physical state, dealing with the children).
Each question: one short line, plain English.
Each question has 2-4 short single-choice options (a few words each) — never ask for free text. Each option carries a "tone" of exactly one of: positive, neutral, needs_support.
For the prayer category specifically: do NOT ask whether prayers were on time or missed — this app already asks that elsewhere on the same screen. Ask about a different angle, such as presence of mind (khushoo) during prayer.
Return JSON only, no explanation: an array of four items shaped {"category":"...","text":"...","options":[{"label":"...","tone":"..."}]}`
        : `Je schrijft korte dagelijkse check-in vragen voor een islamitische gezins-app. Geef precies vier vragen terug, één per categorie, in deze volgorde: ${categoryList} (gebed, psychische staat, lichamelijke staat, omgang met de kinderen).
Elke vraag: één korte regel, gewoon Nederlands.
Elke vraag heeft 2-4 korte keuzeopties (een paar woorden) — vraag nooit om vrije tekst. Elke optie draagt een "tone" van precies: positive, neutral, needs_support.
Voor de gebedscategorie specifiek: vraag NIET of het gebed op tijd was of gemist werd — de app vraagt dat al elders op hetzelfde scherm. Vraag naar een ander aspect, zoals aanwezigheid van geest (khushoo) tijdens het gebed.
Geef alleen JSON terug, geen uitleg: een array van vier items in de vorm {"category":"...","text":"...","options":[{"label":"...","tone":"..."}]}`;

  const genderWord =
    lang === "ar" ? (gender === "man" ? "زوج (رجل)" : gender === "vrouw" ? "زوجة (امرأة)" : "أحد الزوجين") : gender || "unspecified";
  const agesText = childrenAges.length > 0 ? childrenAges.join(", ") : lang === "ar" ? "لا يوجد أبناء بعد" : "none yet";
  const user =
    lang === "ar"
      ? `الشخص الذي سيُجيب: ${genderWord}. أعمار الأبناء تقريبًا: ${agesText}.`
      : lang === "en"
        ? `The person answering: ${genderWord}. Approximate children's ages: ${agesText}.`
        : `De persoon die antwoordt: ${genderWord}. Ongeveer leeftijden van de kinderen: ${agesText}.`;

  return { system, user };
}

/** Strict parse+validate of the model's response. Any deviation -> null (caller falls back). */
export function parseGeneratedQuestions(raw: string): DiagnosticQuestion[] | null {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  let data: unknown;
  try {
    data = JSON.parse(stripped);
  } catch {
    return null;
  }
  const result = questionSetSchema.safeParse(data);
  if (!result.success) return null;
  const categories = new Set(result.data.map((q) => q.category));
  if (categories.size !== DIAGNOSTIC_CATEGORIES.length) return null; // duplicate or missing category
  return result.data;
}

// ============================================================
// Signal aggregation for the OTHER spouse's advice — category+tone only
// ============================================================

const isDiagnosticAnswer = (value: unknown): value is DiagnosticAnswer =>
  typeof value === "object" &&
  value !== null &&
  (DIAGNOSTIC_CATEGORIES as readonly string[]).includes((value as any).category) &&
  TONES.includes((value as any).tone);

/**
 * Most-recent-first rows in, one tone per category out (most recent answered
 * day wins). Never touches `label` — that is what keeps raw text out of the
 * advice-generation prompt. `answers` comes straight off a JSON DB column, so
 * it is narrowed at runtime rather than trusted at the type level.
 */
export function summarizeSignals(
  recentRowsMostRecentFirst: Array<{ answers: unknown }>,
): Partial<Record<DiagnosticCategory, DiagnosticTone>> {
  const summary: Partial<Record<DiagnosticCategory, DiagnosticTone>> = {};
  for (const row of recentRowsMostRecentFirst) {
    if (!Array.isArray(row.answers)) continue;
    for (const answer of row.answers) {
      if (!isDiagnosticAnswer(answer)) continue;
      if (!(answer.category in summary)) {
        summary[answer.category] = answer.tone;
      }
    }
  }
  return summary;
}

const CATEGORY_LABEL: Record<Lang, Record<DiagnosticCategory, string>> = {
  ar: { prayer: "الصلاة", psychological: "الحالة النفسية", physical: "الحالة الجسدية", children: "التعامل مع الأبناء" },
  en: { prayer: "Prayer", psychological: "Psychological state", physical: "Physical state", children: "With the children" },
  nl: { prayer: "Gebed", psychological: "Psychische staat", physical: "Lichamelijke staat", children: "Met de kinderen" },
};
const TONE_LABEL: Record<Lang, Record<DiagnosticTone, string>> = {
  ar: { positive: "بحالة جيدة", neutral: "عادية", needs_support: "بحاجة إلى دعم" },
  en: { positive: "doing well", neutral: "ordinary", needs_support: "could use support" },
  nl: { positive: "gaat goed", neutral: "gewoon", needs_support: "kan steun gebruiken" },
};

/**
 * Turns a category->tone summary into the short text block folded into the
 * spouse-advice prompt. Only ever emits category names + tone words —
 * never an option label, so nothing the partner wrote can appear here.
 */
export function buildPartnerSignalContext(summary: Partial<Record<DiagnosticCategory, DiagnosticTone>>, lang: Lang): string {
  const categories = Object.keys(summary) as DiagnosticCategory[];
  if (categories.length === 0) return "";
  const header =
    lang === "ar"
      ? "\n\n--- إشارات ذاتية من الشريك هذا الأسبوع (فئات عامة فقط) ---"
      : lang === "en"
        ? "\n\n--- Partner's self-reported signals this week (categories only) ---"
        : "\n\n--- Partner's zelfgerapporteerde signalen deze week (alleen categorieën) ---";
  const lines = categories.map((cat) => `${CATEGORY_LABEL[lang][cat]}: ${TONE_LABEL[lang][summary[cat]!]}`);
  return `${header}\n${lines.join("\n")}`;
}

// ============================================================
// Router
// ============================================================

/** Whole-year ages of the user's own children, from their own profileData.children. */
export function childrenAgesFromProfile(profileData: any): number[] {
  const children = Array.isArray(profileData?.children) ? profileData.children : [];
  return children
    .map((c: any) => (c?.birthDate ? Math.floor((Date.now() - new Date(c.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : null))
    .filter((age: number | null): age is number => age !== null && age >= 0);
}

// Race-loser recovery window: short enough not to matter to a normal open,
// long enough to usually catch the winner's LLM call landing (typically
// 1-3s). Exported so tests can compute how far to advance vi.useFakeTimers()
// rather than sleeping for real.
export const LOSER_POLL_ATTEMPTS = 4;
export const LOSER_POLL_DELAY_MS = 700;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A race loser (or a request that arrives while the winner's row is still
 * "pending") polls briefly for the real row instead of immediately serving
 * an unpersisted fallback that could never be submitted (its labels don't
 * match what actually gets stored). Never calls the LLM — read-only.
 */
async function pollForFinishedRow(userId: number, date: string) {
  for (let i = 0; i < LOSER_POLL_ATTEMPTS; i++) {
    await sleep(LOSER_POLL_DELAY_MS);
    const row = await db.getDiagnosticCheckinForToday(userId, date);
    if (row && row.source !== "pending") return row;
  }
  return null;
}

// A "pending" row older than this is treated as abandoned (its owner's
// process likely died between claiming and filling it in) rather than just
// slow. LLM calls normally finish in a few seconds, but a shorter threshold
// here directly trades against the money rule: too short and a second
// device/re-tap can reclaim (and re-spend on) a generation that was only
// slow, not dead. 45s comfortably clears realistic latency for this
// feature's model tier while still recovering a genuine crash in under a
// minute.
// ponytail: a timeout can't fully close this — an LLM call slower than 45s
// would still trigger a real double-spend. Full fix needs the original
// request to renew its own claim (a heartbeat) or be cancellable; not built
// for v1 given how rarely a routine call should take that long.
const STALE_CLAIM_MS = 45_000;

type ReadyRow = { date: string; questions: DiagnosticQuestion[]; answers: DiagnosticAnswer[] | null; source: "generated" | "fallback" };

// ponytail: UTC calendar day (see the longer note on getToday's own `date`
// computation below) — the single definition, reused by getToday and
// submitAnswers so there is only ever one notion of "today" in this module.
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Calls the model, validates its output, falls back on any failure, and
 * persists the result into a claimed/reclaimed row. `date` is the day the
 * row was claimed UNDER — it must be passed in, not recomputed after the
 * (multi-second) LLM call, or a request straddling UTC midnight would report
 * a date the stored row was never actually saved under.
 *
 * A stale-claim reclaim (see STALE_CLAIM_MS) means the ORIGINAL claimant
 * might not actually be dead, just slow — both it and the reclaiming
 * request can end up here for the same row. fillDiagnosticCheckin only
 * writes while the row is still "pending", so whichever one finishes second
 * loses the write; when that happens this returns what's ACTUALLY
 * persisted (userId+date) rather than content that only exists locally and
 * can never be submitted.
 */
async function generateAndFill(
  userId: number,
  claimedId: number,
  date: string,
  gender: Gender,
  lang: Lang,
  childrenAges: number[],
): Promise<ReadyRow> {
  let questions: DiagnosticQuestion[] | null = null;
  try {
    const { system, user } = buildGenerationPrompt({ gender, lang, childrenAges });
    const result = await invokeLLM({ messages: [{ role: "system", content: system }, { role: "user", content: user }] });
    const content = result.choices[0]?.message?.content;
    const text = typeof content === "string" ? content : Array.isArray(content) ? content.map((c: any) => ("text" in c ? c.text : "")).join("") : "";
    questions = parseGeneratedQuestions(text);
  } catch {
    questions = null;
  }

  const source: "generated" | "fallback" = questions ? "generated" : "fallback";
  if (!questions) questions = buildFallbackQuestions(gender, lang);

  const wrote = await db.fillDiagnosticCheckin(claimedId, questions, source);
  if (!wrote) {
    const actual = await db.getDiagnosticCheckinForToday(userId, date);
    if (actual && actual.source !== "pending") {
      return { date, questions: actual.questions as DiagnosticQuestion[], answers: actual.answers as DiagnosticAnswer[] | null, source: actual.source as "generated" | "fallback" };
    }
  }
  return { date, questions, answers: null, source };
}

export const dailyDiagnosticRouter = router({
  /**
   * Today's question set for the caller — generated once per user per day,
   * always non-empty. Claims the day via db.claimDiagnosticCheckin BEFORE
   * calling the paid LLM, so a losing concurrent request (two devices open
   * at once, a retried request, or the DB being briefly unavailable) never
   * reaches invokeLLM at all. It polls briefly for the winner's row so its
   * response is always something the user can actually submit; if nothing
   * shows up because the winner's process died mid-flight, it re-claims the
   * now-stale row itself rather than leaving the day stuck for good.
   */
  getToday: protectedProcedure
    .input(z.object({ lang: z.enum(["nl", "en", "ar"]).optional() }).optional())
    .query(async ({ ctx, input }) => {
    // ponytail: UTC calendar day, not the user's own local day — this app
    // has users across many timezones and no per-user timezone is stored
    // anywhere yet, so there is no single "correct" local midnight to key
    // on. UTC means the day boundary can land at an odd local hour (e.g.
    // 01:00-02:00 in the Netherlands), not that it's wrong for everyone
    // simultaneously the way hardcoding one country's zone would be.
    // Upgrade path: store/derive the user's timezone and key on that instead.
    const date = todayKey();
    const profileData = ctx.user.profileData as any;
    const gender: Gender = (profileData?.parentProfile?.gender as Gender) || "";
    // The stored account language is not always the language the app is being
    // used in — an Arabic-UI user whose profile still says "nl" would be
    // handed Dutch questions, and Dutch leaking into an Arabic screen is a
    // defect in this product, not a cosmetic detail. Trust the client's
    // current UI language when it sends one (the schema above constrains it
    // to the known set); fall back to the account, then Dutch.
    const lang: Lang = input?.lang ?? ((ctx.user.language as Lang) || "nl");
    const childrenAges = childrenAgesFromProfile(profileData);

    const existing = await db.getDiagnosticCheckinForToday(ctx.user.id, date);
    if (existing && existing.source !== "pending") {
      return { date, questions: existing.questions as DiagnosticQuestion[], answers: existing.answers as DiagnosticAnswer[] | null, source: existing.source as "generated" | "fallback" };
    }

    const claimed = existing ? null : await db.claimDiagnosticCheckin(ctx.user.id, date);
    if (claimed) {
      return generateAndFill(ctx.user.id, claimed.id, date, gender, lang, childrenAges);
    }

    // Another request already claimed (or finished) today's row, or the DB
    // is unavailable to claim against. Never call the LLM here — there is
    // nowhere reliable to cache the result, which is exactly what would turn
    // a race, or an outage, into unbounded paid calls.
    // Only wait when there is actually a row to wait for. A failed claim with
    // no row visible means the DB is down, not that a winner is on its way,
    // and polling the full window there makes every request during an outage
    // hold a server slot for seconds to learn nothing.
    const pending = existing ?? (await db.getDiagnosticCheckinForToday(ctx.user.id, date));
    const winner = pending
      ? pending.source !== "pending"
        ? pending
        : await pollForFinishedRow(ctx.user.id, date)
      : null;
    if (winner) {
      return { date, questions: winner.questions as DiagnosticQuestion[], answers: winner.answers as DiagnosticAnswer[] | null, source: winner.source as "generated" | "fallback" };
    }

    // Still nothing — if a claim exists but looks abandoned (its owner
    // crashed rather than just being slow), take it over instead of leaving
    // the day permanently stuck.
    const reclaimed = await db.reclaimStaleDiagnosticCheckin(ctx.user.id, date, STALE_CLAIM_MS);
    if (reclaimed) {
      return generateAndFill(ctx.user.id, reclaimed.id, date, gender, lang, childrenAges);
    }

    // The reclaim declines when the original claimant finished between our
    // poll and now. Serve that persisted row rather than the fallback: the
    // fallback's labels would not match what is stored, and submitAnswers
    // rejects any answer whose label isn't one of the stored options — so
    // falling back here would hand the user a check-in they cannot submit.
    const finished = await db.getDiagnosticCheckinForToday(ctx.user.id, date);
    if (finished && finished.source !== "pending") {
      return { date, questions: finished.questions as DiagnosticQuestion[], answers: finished.answers as DiagnosticAnswer[] | null, source: finished.source as "generated" | "fallback" };
    }

    return { date, questions: buildFallbackQuestions(gender, lang), answers: null, source: "fallback" as const };
  }),

  /** Save today's answers. Rejects anything that isn't one of the exact options shown. */
  submitAnswers: protectedProcedure
    .input(
      z.object({
        date: z.string(),
        answers: z
          .array(
            z.object({
              category: z.enum(DIAGNOSTIC_CATEGORIES),
              label: z.string(),
              tone: z.enum(TONES as [DiagnosticTone, ...DiagnosticTone[]]),
            }),
          )
          .min(1), // an empty submission would still mark the day "answered" client-side ([] is truthy)
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Only today — not "any of the caller's own rows". Otherwise a crafted
      // client could answer an old, still-unanswered day whenever it liked,
      // contradicting "one submission per day, final" and injecting a
      // backdated tone into whatever 7-day window getRecentDiagnosticSignals
      // happens to be reading at that moment.
      if (input.date !== todayKey()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Can only answer today's check-in" });
      }

      const row = await db.getDiagnosticCheckinForToday(ctx.user.id, input.date);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "No check-in for that date" });
      if (row.source === "pending") throw new TRPCError({ code: "NOT_FOUND", message: "That day's questions are not ready yet" });
      // One submission per day, final — not an editable log. Otherwise a user
      // could retroactively rewrite what they reported on a past day (the
      // signal getSpouseAdvice already read may have been generated from it).
      if (row.answers) throw new TRPCError({ code: "BAD_REQUEST", message: "That day has already been answered" });

      // Exactly one answer per required category — not "any non-empty set of
      // individually-valid answers" (a client could otherwise submit two
      // different "prayer" options and skip the other three categories).
      const submittedCategories = new Set(input.answers.map((a) => a.category));
      if (submittedCategories.size !== input.answers.length || submittedCategories.size !== DIAGNOSTIC_CATEGORIES.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Must answer every category exactly once" });
      }

      const questions = row.questions as DiagnosticQuestion[];
      for (const answer of input.answers) {
        const question = questions.find((q) => q.category === answer.category);
        const matchesOption = question?.options.some((o) => o.label === answer.label && o.tone === answer.tone);
        if (!matchesOption) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Answer does not match an offered option" });
        }
      }

      const wrote = await db.saveDiagnosticAnswers(row.id, input.answers);
      if (!wrote) {
        // Lost a race against another concurrent submitAnswers for the same
        // row (both read answers===null before either wrote) — the other
        // one's write already stands; don't report a second success that
        // didn't actually happen.
        throw new TRPCError({ code: "BAD_REQUEST", message: "That day has already been answered" });
      }
      return { success: true };
    }),
});
