/**
 * Daily diagnostic check-in — replaces the guessed spouse advice.
 *
 * Each spouse answers a handful of short, single-choice questions about
 * THEMSELVES (prayer / psychological state / physical state / children) once
 * a day. The question set is a fixed, curated, trilingual bank — NOT
 * AI-generated. The AI is only ever a *consumer* of the answers (via
 * summarizeSignals/buildPartnerSignalContext, folded into the OTHER spouse's
 * advice prompt in server/advice.ts); it never writes the questions
 * themselves. That is a deliberate, owner-mandated design change (this
 * module used to call an LLM to write the day's questions), made to remove
 * two whole bug classes at the root:
 *   - A generated question once addressed a man as «تواصلك مع زوجك» ("your
 *     husband") — the old prompt stated the answerer's gender but never
 *     constrained how to name their spouse, so the model guessed wrong.
 *     Curated text makes this class of bug structurally impossible.
 *   - A generated question once asked about الإنجاب (family planning),
 *     which must never be asked. A fixed bank simply never contains it.
 *
 * SOURCE VALUE CONTRACT (load-bearing for Play Store AI-content compliance,
 * not just informational — components/daily-diagnostic-card.tsx gates its
 * ReportAiContent control on `source === "generated"`): every row this
 * module creates from here on is stamped "curated" — never "generated"
 * again, since nothing here calls a model anymore. "generated"/"fallback"
 * can still surface for a brief transition window on rows a still-live OLD
 * deploy wrote for TODAY before this change rolled out (getToday only ever
 * reads *today's* row, so this self-resolves the next calendar day and
 * cannot recur) — that is correct, not a bug: a row that really was
 * AI-generated genuinely should still offer the report control that day.
 * Never special-case "curated" back into "generated" to keep that control
 * showing; a curated, non-AI question set is exactly the case Play's policy
 * does not require reporting on.
 *
 * PRIVACY (scoped to THIS module's own contribution only — see caveat
 * below): every question here is single-choice (no free text field exists
 * in this schema at all). summarizeSignals/buildPartnerSignalContext only
 * ever carry the coarse category+tone summary — never the option `label`
 * text — and that pairing (summarizeSignals + buildPartnerSignalContext)
 * stays unconditional in BOTH directions of a confirmed partnership, with
 * no gender/grant gate, exactly as before.
 *
 * UPDATED (item 1/3, owner-directed reversal — was previously an absolute
 * "never leaks a raw answer" guarantee for this whole module; it is not
 * anymore, deliberately): getRecentDiagnosticRows + buildPartnerAnswersContext
 * DO carry the raw answer `label`, and ARE now read by two ungated-by-
 * gender-alone callers — links.getPartnerDailyDiagnostic (server/routers.ts)
 * and getSpouseAdvice (server/advice.ts) — but ONLY after the SAME
 * hasFullPartnerAccess check that already gates getPartnerProfile/
 * syncWithPartner: a husband reads his wife's answers unconditionally
 * (once confirmed); a wife reads her husband's only with his active grant.
 * Both callers are required to check this BEFORE calling either function;
 * neither function gates itself. This mirrors, rather than weakens, the
 * binding "husband-ungated" ruling that already lets a husband read his
 * wife's whole profile verbatim — the answers were the one thing that
 * ruling hadn't reached yet.
 *
 * CAVEAT — this is not a blanket guarantee about getSpouseAdvice as a whole:
 * that same function still concatenates the partner's pre-existing, free-text
 * dailyCheckins.openAnswer into the same prompt (server/advice.ts, the
 * "Daily checkins from partner" block above where this module's signal is
 * appended). That is a known, PRE-EXISTING leak this task was told not to
 * extend, not one this module fixes — flagged to the product owner, not
 * silently patched.
 *
 * SECOND CAVEAT, NOW CLOSED (round-8 P1 audit; fixed item 5 of the
 * multi-wife/vulnerability task): getSpouseAdvice's own db.getPartnerOfUser
 * lookup USED TO be ungated on partnershipConfirmed — unlike getPartnerProfile/
 * syncWithPartner (server/routers.ts, round-8 P1 fix), it drew on the
 * partner's full profileData (parentProfile fields, dailyCheckins,
 * environments, ...) regardless of whether the partnership was confirmed.
 * That was deliberate on the gender/grant axis (see server/advice.ts's own
 * comment: spouse advice may draw on the partner's data with no grant), but
 * confirmation is a different axis — an unconfirmed "partner" found via the
 * shared-children legacy fallback is not the same thing as an ungranted but
 * agreed-upon one. server/advice.ts now checks partner.partnershipConfirmed
 * right after the db.getPartnerOfUser call in getSpouseAdvice, closing this.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "./_core/trpc";
import * as db from "./db";

export const DIAGNOSTIC_CATEGORIES = ["prayer", "psychological", "physical", "children"] as const;
export type DiagnosticCategory = (typeof DIAGNOSTIC_CATEGORIES)[number];
export type DiagnosticTone = "positive" | "neutral" | "needs_support";
export type Lang = "nl" | "en" | "ar";
export type Gender = "man" | "vrouw" | "";

export interface DiagnosticOption {
  label: string;
  tone: DiagnosticTone;
  /** Set only on the women-only "excused today" prayer option (decision 13
   * of the haid tracker spec). Clients detect it by `kind`, never by label. */
  kind?: "excused";
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

// No `lang` parameter: every call site only ever reaches gAr's return value
// through t()'s third (Arabic) argument, which t() itself only reads when
// lang === "ar" — a lang check inside gAr can never actually change what
// gets rendered, so it isn't taken as a parameter here at all.
function gAr(gender: Gender, male: string, female: string, neutral: string): string {
  return gender === "man" ? male : gender === "vrouw" ? female : neutral;
}

// ============================================================
// Curated question bank — trilingual, gendered, no AI, no free text.
//
// Each category holds one or more phrasings ("variants"); buildQuestionsForToday
// picks one variant per category, deterministically, from the row's own date
// string — so the same user always sees the same four questions on a given
// day, but a different four (or fewer repeats) across days. Every topic here
// is one the product owner explicitly approved:
//   - prayer:        presence of heart (khushoo') in prayer; share of dhikr
//                     through the day; drive (himmah) in seeking what
//                     benefits one's religion
//   - psychological:  one's own mood; whether you checked on your spouse's
//                      psychological state (تعاهد); whether you checked on
//                      your spouse's faith/himmah (تعاهد)
//   - physical:       one's own physical state
//   - children:       sincerity (إخلاص) in raising them; drive/energy with them
// Deliberately absent: anything about الإنجاب (family planning) — never
// asked, on any variant, in any language.
// ============================================================

type QuestionVariant = (gender: Gender, lang: Lang) => DiagnosticQuestion;

function tOf(lang: Lang) {
  return (nl: string, en: string, ar: string) => (lang === "ar" ? ar : lang === "en" ? en : nl);
}

// Variant indices within QUESTION_BANK[category] that ask about the user's
// SPOUSE (تعاهد) rather than themselves — must be excluded from the pool for
// any user with no confirmed partner (single/widowed/divorced/unlinked), or
// they get asked about a spouse they don't have. Every other variant in the
// bank is self-only and safe unconditionally. See buildQuestionsForToday.
const PARTNER_ONLY_VARIANT_INDICES: Partial<Record<DiagnosticCategory, ReadonlySet<number>>> = {
  psychological: new Set([1, 2]), // the two تعاهد variants just below
};

const QUESTION_BANK: Record<DiagnosticCategory, QuestionVariant[]> = {
  prayer: [
    // Deliberately NOT "was your prayer on time" — the home screen's
    // existing check-in already asks that. This asks about presence of
    // mind (khushoo'), a distinct angle, so the two cards never repeat the
    // same question.
    (gender, lang) => {
      const t = tOf(lang);
      return {
        category: "prayer",
        text: t("Hoe was uw aanwezigheid van geest tijdens het gebed vandaag?", "How present were you during your prayer today?", "كيف كان خشوعك في الصلاة اليوم؟"),
        options: [
          { label: t("Aanwezig en geconcentreerd", "Present and focused", "خاشعاً ومركّزاً"), tone: "positive" },
          { label: t("Vaak afgeleid", "Often distracted", "كثير التشتت"), tone: "needs_support" },
          { label: t("Wisselend", "It varied", "متفاوت"), tone: "neutral" },
        ],
      };
    },
    (gender, lang) => {
      const t = tOf(lang);
      return {
        category: "prayer",
        text: t("Wat was uw aandeel aan dhikr (Godsgedachtenis) vandaag?", "How much dhikr (remembrance of Allah) did you have today?", "ما كان نصيبك من ذكر الله اليوم؟"),
        options: [
          { label: t("Ruim, de hele dag door", "Plenty, throughout the day", "نصيب وافر طوال اليوم"), tone: "positive" },
          { label: t("Heel weinig vandaag", "Very little today", "قليل جدا اليوم"), tone: "needs_support" },
          { label: t("Gemiddeld", "Average", "متوسط"), tone: "neutral" },
        ],
      };
    },
    (gender, lang) => {
      const t = tOf(lang);
      return {
        category: "prayer",
        text: t(
          "Hoe was uw inzet vandaag om te zoeken naar wat uw geloof ten goede komt?",
          "How was your drive today to seek what benefits your religion?",
          "كيف كانت همّتك اليوم في طلب ما ينفعك في دينك؟",
        ),
        options: [
          { label: t("Sterke inzet", "Strong drive", "همّة عالية"), tone: "positive" },
          { label: t("Weinig energie ervoor", "Low energy for it", gAr(gender, "كنت فاتراً في ذلك", "كنت فاترة في ذلك", "كنت فاتراً في ذلك")), tone: "needs_support" },
          { label: t("Gemiddeld", "Average", "معتدلة"), tone: "neutral" },
        ],
      };
    },
  ],
  psychological: [
    (gender, lang) => {
      const t = tOf(lang);
      return {
        category: "psychological",
        text: t("Hoe was uw gemoedstoestand vandaag?", "How was your mood today?", "كيف كانت حالتك النفسية اليوم؟"),
        options: [
          { label: t("Rustig en tevreden", "Calm and content", gAr(gender, "مطمئن ومرتاح البال", "مطمئنة ومرتاحة البال", "مطمئن ومرتاح البال")), tone: "positive" },
          { label: t("Gestrest of bezorgd", "Stressed or worried", gAr(gender, "متوتر أو مهموم", "متوترة أو مهمومة", "متوتر أو مهموم")), tone: "needs_support" },
          { label: t("Gewone dag", "An ordinary day", "حالة عادية"), tone: "neutral" },
        ],
      };
    },
    // تعاهُد الزوج/الزوجة — checking in on your spouse is itself a
    // relational/psychological act, so both تعاهد variants live in this
    // category. The spouse must be named with the CORRECT noun for the
    // ANSWERER's own gender (زوجتك = your wife, said to a man; زوجك = your
    // husband, said to a woman) — this exact confusion was the root cause
    // of a real production bug (a man told «تواصلك مع زوجك»).
    (gender, lang) => {
      const t = tOf(lang);
      return {
        category: "psychological",
        text: t(
          "Heeft u vandaag aan uw partner gevraagd hoe het met zijn/haar gemoedstoestand gaat?",
          "Did you ask your spouse about their psychological state today?",
          gAr(gender, "هل سألت زوجتك عن حالتها النفسية اليوم؟", "هل سألت زوجك عن حالته النفسية اليوم؟", "هل سألت شريك حياتك عن حالته النفسية اليوم؟"),
        ),
        options: [
          { label: t("Ja, ik heb gevraagd", "Yes, I asked", "نعم، سألت"), tone: "positive" },
          { label: t("Nee, ik ben het vergeten", "No, I forgot", "لم أسأل اليوم"), tone: "needs_support" },
          { label: t("Kort gevraagd", "Asked briefly", "سألت باقتضاب"), tone: "neutral" },
        ],
      };
    },
    (gender, lang) => {
      const t = tOf(lang);
      return {
        category: "psychological",
        text: t(
          "Heeft u vandaag aan uw partner gevraagd naar zijn/haar geloofsbeleving en inzet (himmah)?",
          "Did you ask your spouse about their faith and drive (himmah) today?",
          gAr(gender, "هل سألت زوجتك عن حالتها الإيمانية وهمّتها اليوم؟", "هل سألت زوجك عن حالته الإيمانية وهمّته اليوم؟", "هل سألت شريك حياتك عن حالته الإيمانية وهمّته اليوم؟"),
        ),
        options: [
          { label: t("Ja, ik heb gevraagd", "Yes, I asked", "نعم، سألت"), tone: "positive" },
          { label: t("Nee, ik ben het vergeten", "No, I forgot", "لم أسأل اليوم"), tone: "needs_support" },
          { label: t("Kort gevraagd", "Asked briefly", "سألت باقتضاب"), tone: "neutral" },
        ],
      };
    },
  ],
  physical: [
    (gender, lang) => {
      const t = tOf(lang);
      return {
        category: "physical",
        text: t("Hoe was uw lichamelijke gesteldheid vandaag?", "How was your physical state today?", "كيف كانت حالتك الجسدية اليوم؟"),
        options: [
          { label: t("Fit en energiek", "Fit and energetic", gAr(gender, "نشيط وبصحة جيدة", "نشيطة وبصحة جيدة", "نشيط وبصحة جيدة")), tone: "positive" },
          { label: t("Moe of uitgeput", "Tired or exhausted", gAr(gender, "متعب أو مرهق", "متعبة أو مرهقة", "متعب أو مرهق")), tone: "needs_support" },
          { label: t("Gewone dag", "An ordinary day", "حالة عادية"), tone: "neutral" },
        ],
      };
    },
  ],
  children: [
    (gender, lang) => {
      const t = tOf(lang);
      return {
        category: "children",
        text: t(
          "Hoe was uw oprechtheid (ikhlaas) vandaag in de opvoeding van uw kinderen?",
          "How was your sincerity (ikhlaas) today in raising your children?",
          "كيف كان إخلاصك اليوم في تربية أبنائك؟",
        ),
        options: [
          { label: t("Oprecht, voor Allah alleen", "Sincere, for Allah alone", gAr(gender, "كنت مخلصاً لله في ذلك", "كنت مخلصة لله في ذلك", "كنت مخلصاً لله في ذلك")), tone: "positive" },
          { label: t("Er weinig bij stilgestaan vandaag", "Barely thought about it today", "لم أستحضر الإخلاص كثيرا اليوم"), tone: "needs_support" },
          { label: t("Gewone dag", "An ordinary day", "متفاوت"), tone: "neutral" },
        ],
      };
    },
    (gender, lang) => {
      const t = tOf(lang);
      return {
        category: "children",
        text: t(
          "Hoe was uw inzet en energie vandaag bij de omgang met uw kinderen?",
          "How was your energy and drive with your children today?",
          "كيف كانت همّتك ونشاطك مع أبنائك اليوم؟",
        ),
        options: [
          {
            label: t(
              "Geduldig en betrokken",
              "Patient and engaged",
              gAr(gender, "كنت صبورا ومتفاعلا معهم", "كنت صبورة ومتفاعلة معهم", "كنت صبورا ومتفاعلا معهم"),
            ),
            tone: "positive",
          },
          { label: t("Te weinig aandacht gegeven", "Gave them too little attention", "قصّرت في الاهتمام بهم اليوم"), tone: "needs_support" },
          { label: t("Gewone dag", "An ordinary day", "تعامل عادي"), tone: "neutral" },
        ],
      };
    },
  ],
};

// Deterministic string hash (polynomial rolling hash) — NOT Math.random(),
// on purpose: the same date string must always pick the same variant, so a
// user reloading the app mid-day (or a retried request) sees an identical
// set, and getToday's get-or-create stays idempotent.
function dateSeed(date: string): number {
  let seed = 0;
  for (let i = 0; i < date.length; i++) seed = (seed * 31 + date.charCodeAt(i)) >>> 0;
  return seed;
}

// Decision 13 (haid tracker spec): women get a 4th, neutral prayer-question
// option so a day excused by حيض/نفاس doesn't get scored positive/needs_support
// against an act she wasn't obligated to do. Neutral tone, and `kind` (never
// the label) is what a client detects it by.
const EXCUSED_OPTION = (lang: Lang): DiagnosticOption => ({
  label: tOf(lang)("Vandaag uitgezonderd (menstruatie of kraamtijd)", "Excused today (menses or postpartum)", "معذورة اليوم (حائض أو نفساء)"),
  tone: "neutral",
  kind: "excused",
});

/**
 * Today's curated four-question set — pure, deterministic, no I/O.
 * `hasPartner` defaults to false (fail-safe): a caller that forgets to pass
 * it gets the set that's safe for someone with no confirmed partner, never
 * the one that risks asking about a spouse they don't have.
 */
export function buildQuestionsForToday(gender: Gender, lang: Lang, date: string, hasPartner = false): DiagnosticQuestion[] {
  const seed = dateSeed(date);
  return DIAGNOSTIC_CATEGORIES.map((category, i) => {
    const allVariants = QUESTION_BANK[category];
    const excludedIndices = hasPartner ? undefined : PARTNER_ONLY_VARIANT_INDICES[category];
    const variants = excludedIndices ? allVariants.filter((_, idx) => !excludedIndices.has(idx)) : allVariants;
    const question = variants[(seed + i) % variants.length](gender, lang);
    if (category === "prayer" && gender === "vrouw") {
      question.options = [...question.options, EXCUSED_OPTION(lang)];
    }
    return question;
  });
}

/** Every phrasing this module can ever produce, for exhaustive content tests. */
export function allBankQuestions(gender: Gender, lang: Lang): DiagnosticQuestion[] {
  return DIAGNOSTIC_CATEGORIES.flatMap((category) => QUESTION_BANK[category].map((variant) => variant(gender, lang)));
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

function signalContextLines(summary: Partial<Record<DiagnosticCategory, DiagnosticTone>>, lang: Lang): string[] {
  const categories = Object.keys(summary) as DiagnosticCategory[];
  return categories.map((cat) => `${CATEGORY_LABEL[lang][cat]}: ${TONE_LABEL[lang][summary[cat]!]}`);
}

/**
 * Turns a category->tone summary into the short text block folded into the
 * spouse-advice prompt. Only ever emits category names + tone words —
 * never an option label, so nothing the partner wrote can appear here.
 */
export function buildPartnerSignalContext(summary: Partial<Record<DiagnosticCategory, DiagnosticTone>>, lang: Lang): string {
  const lines = signalContextLines(summary, lang);
  if (lines.length === 0) return "";
  const header =
    lang === "ar"
      ? "\n\n--- إشارات ذاتية من الشريك هذا الأسبوع (فئات عامة فقط) ---"
      : lang === "en"
        ? "\n\n--- Partner's self-reported signals this week (categories only) ---"
        : "\n\n--- Partner's zelfgerapporteerde signalen deze week (alleen categorieën) ---";
  return `${header}\n${lines.join("\n")}`;
}

/**
 * Full-answer counterpart to buildPartnerSignalContext (item 3): emits the
 * actual question text + the partner's chosen answer `label`, not just
 * category+tone. Unlike buildPartnerSignalContext/summarizeSignals, this is
 * NOT safe to call unconditionally — it is the one function in this module
 * that can put the partner's raw answer text in front of the model. Callers
 * MUST already have checked hasFullPartnerAccess (server/routers.ts) before
 * calling this; see the file header's UPDATED note above. `answers` comes
 * straight off a JSON DB column, so each entry is narrowed at runtime
 * (isDiagnosticAnswer) rather than trusted at the type level, same as
 * summarizeSignals.
 */
export function buildPartnerAnswersContext(
  recentRowsMostRecentFirst: Array<{ date: string; questions: unknown; answers: unknown }>,
  lang: Lang,
): string {
  const lines = recentRowsMostRecentFirst.flatMap((row) => {
    if (!Array.isArray(row.answers)) return [];
    const questions = Array.isArray(row.questions) ? (row.questions as DiagnosticQuestion[]) : [];
    return row.answers.filter(isDiagnosticAnswer).map((answer) => {
      const question = questions.find((q) => q.category === answer.category);
      const questionText = question?.text ?? CATEGORY_LABEL[lang][answer.category];
      return `${row.date} — ${questionText} :: ${answer.label}`;
    });
  });
  if (lines.length === 0) return "";
  const header =
    lang === "ar"
      ? "\n\n--- إجابات الشريك التفصيلية في تسجيله اليومي هذا الأسبوع ---"
      : lang === "en"
        ? "\n\n--- Partner's detailed daily check-in answers this week ---"
        : "\n\n--- Gedetailleerde dagelijkse check-in antwoorden van partner deze week ---";
  return `${header}\n${lines.join("\n")}`;
}

/**
 * Self-facing counterpart to buildPartnerSignalContext above: the user's OWN
 * recent check-in signals, folded into the user's OWN advice prompt
 * (personal/parenting advice, the advisor chat) instead of the other
 * spouse's. Same category+tone-only shape and never-the-label guarantee;
 * only the header's framing differs ("your own" vs "partner's"), so a
 * reader of the prompt can't confuse whose signal it's reading.
 */
export function buildOwnSignalContext(summary: Partial<Record<DiagnosticCategory, DiagnosticTone>>, lang: Lang): string {
  const lines = signalContextLines(summary, lang);
  if (lines.length === 0) return "";
  const header =
    lang === "ar"
      ? "\n\n--- إشاراتك الذاتية من تسجيلك اليومي هذا الأسبوع (فئات عامة فقط) ---"
      : lang === "en"
        ? "\n\n--- Your own self-reported check-in signals this week (categories only) ---"
        : "\n\n--- Uw eigen zelfgerapporteerde check-in signalen deze week (alleen categorieën) ---";
  return `${header}\n${lines.join("\n")}`;
}

/**
 * Fetch + summarize + format the CALLER'S OWN recent check-ins in one call —
 * the composing helper each own-advice surface (getGeneralAdvice,
 * getWeekPlan, generateTreatmentPlan in advice.ts; startConversation,
 * sendMessage, getLiveAdvice in ai-chat.ts) calls once. Mirrors
 * getSpouseAdvice's own inline fetch-then-summarize-then-format sequence
 * (server/advice.ts) — same 7-day window, same fail-open behaviour: a DB
 * hiccup (or a still-missing migration on a server this hasn't rolled out
 * to yet) degrades to "", never a 500, exactly like getSpouseAdvice's own
 * try/catch around the partner's signals.
 *
 * No DB round-trip for a caller with no id (an unauthenticated request to
 * one of these public procedures, or the `0` sentinel this codebase already
 * uses for "no owner" — see ai-chat.ts's ctx.user?.id ?? 0) — there is
 * nothing to look up, and it keeps that path exactly as cheap as it was
 * before this feature existed.
 */
export async function getOwnCheckinContext(userId: number | null | undefined, lang: Lang): Promise<string> {
  if (!userId) return "";
  try {
    const rows = await db.getRecentDiagnosticSignals(userId, 7);
    return buildOwnSignalContext(summarizeSignals(rows), lang);
  } catch (err) {
    console.error("[getOwnCheckinContext] diagnostic signals unavailable, continuing without them:", err);
    return "";
  }
}

// ============================================================
// Router
// ============================================================

// ponytail: UTC calendar day (see the longer note on getToday's own `date`
// computation below) — the single definition, reused by getToday and
// submitAnswers so there is only ever one notion of "today" in this module.
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

type ReadyRow = { date: string; questions: DiagnosticQuestion[]; answers: DiagnosticAnswer[] | null; source: string };

function asReadyRow(row: { date: string; questions: unknown; answers: unknown; source: string }): ReadyRow {
  return { date: row.date, questions: row.questions as DiagnosticQuestion[], answers: row.answers as DiagnosticAnswer[] | null, source: row.source };
}

/**
 * Today's row for this user — get-or-create. There is no model call on this
 * path anymore (the question set is a pure function of date+gender+lang+
 * hasPartner), so this no longer needs the claim/poll/reclaim dance a
 * paid-generation race used to require: claimDiagnosticCheckin's
 * duplicate-key handling still gives the one-row-per-user-per-day guarantee,
 * and fillDiagnosticCheckin's "still pending" condition still resolves a
 * same-instant double-create (whichever write lands first wins; the loser
 * re-reads and trusts it) — both are still real races, just no longer
 * expensive ones to lose.
 */
async function getOrCreateToday(userId: number, date: string, gender: Gender, lang: Lang): Promise<ReadyRow> {
  const existing = await db.getDiagnosticCheckinForToday(userId, date);
  if (existing && existing.source !== "pending") return asReadyRow(existing);

  // Only looked up when we're about to actually build a new set (not on the
  // fast path above, which is the common case on every day after the
  // first) — an extra DB round-trip on every getToday call would be wasted
  // once the day's row already exists.
  //
  // db.hasConfirmedPartner, not db.getPartnerOfUser: getToday is a tRPC
  // `.query`, and getPartnerOfUser's legacy shared-children fallback can
  // INSERT a partnership row as a side effect of merely being called —
  // opening today's check-in must never create a partnership the user
  // never agreed to (round-8 P2 fix). This also means hasPartner now
  // requires an actually-confirmed partnership, not just a truthy lookup.
  const hasPartner = await db.hasConfirmedPartner(userId);
  const questions = buildQuestionsForToday(gender, lang, date, hasPartner);

  // Reuse a still-"pending" row (a leftover claimed-but-unfilled row, or a
  // genuinely concurrent claim) rather than trying to insert a second one.
  const pendingRow = existing ?? (await db.claimDiagnosticCheckin(userId, date));
  const wrote = pendingRow && (await db.fillDiagnosticCheckin(pendingRow.id, questions, "curated"));
  if (wrote) return { date, questions, answers: null, source: "curated" };

  // Lost the race either way — to claim the row at all (a concurrent
  // request's insert won, or the DB is unavailable) or to fill it (a
  // concurrent request's fill beat ours to the still-"pending" row). Either
  // way, a peer may already have a real (possibly already-answered) row —
  // check before falling back to this request's own unpersisted attempt.
  const persisted = await db.getDiagnosticCheckinForToday(userId, date);
  if (persisted && persisted.source !== "pending") return asReadyRow(persisted);

  // Still nothing usable (genuine DB outage, or a peer's claim that hasn't
  // been filled in yet). The question set is pure and free to compute, so
  // hand it back unpersisted rather than failing the request — submitAnswers
  // will honestly reject a save against a day that was never actually
  // written under this row.
  return { date, questions, answers: null, source: "curated" };
}

export const dailyDiagnosticRouter = router({
  /** Today's question set for the caller — curated, always non-empty, no model call. */
  getToday: protectedProcedure
    // `date` is accepted but never read below — the server always computes
    // its own todayKey() authoritatively; a client-supplied date must never
    // decide what "today" means. It exists so the CLIENT can fold today's
    // date into this query's cache key (components/daily-diagnostic-card.tsx)
    // — a new calendar day is then a genuine cache miss instead of silently
    // reusing yesterday's cached response (see that file's own comment).
    .input(z.object({ lang: z.enum(["nl", "en", "ar"]).optional(), date: z.string().optional() }).optional())
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
    // Column-then-JSON precedence — the same gap resolveGender
    // (server/routers.ts) exists to close for getPartnerProfile/
    // syncWithPartner: a legacy row can have the users.gender COLUMN set
    // with the profileData.parentProfile.gender JSON copy never backfilled,
    // which used to fall through to the neutral fallback wording here even
    // though the column already answers it. Duplicated rather than imported
    // — routers.ts imports dailyDiagnosticRouter from this module, so
    // importing resolveGender back from routers.ts would be a cycle.
    const gender: Gender = ((ctx.user.gender || profileData?.parentProfile?.gender || "") as Gender);
    // The stored account language is not always the language the app is being
    // used in — an Arabic-UI user whose profile still says "nl" would be
    // handed Dutch questions, and Dutch leaking into an Arabic screen is a
    // defect in this product, not a cosmetic detail. Trust the client's
    // current UI language when it sends one (the schema above constrains it
    // to the known set); fall back to the account, then Dutch.
    const lang: Lang = input?.lang ?? ((ctx.user.language as Lang) || "nl");

    return getOrCreateToday(ctx.user.id, date, gender, lang);
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
