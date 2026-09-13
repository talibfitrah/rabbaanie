// Advice for each family life-event (Daa3iyah 2975): after logging an event the
// app asks a few clarifying questions about the situation, then shows advice
// tailored to the answers. Content is curated on Daa3iyah's manhaj — grounded in
// direct دليل (aayah «يقول الله تعالى» / authentic hadith / athar of the Sahaba),
// not madhhab-attribution — and reviewed by him before release. No AI at runtime.
import type { FamilyEventType } from "@/lib/family-events";
import adviceData from "@/data/family-event-advice.json";

export type Trilingual = { nl: string; en: string; ar: string };
export type ViewerGender = "man" | "woman";

// A clarifying question with a small set of answer options. `gender` restricts
// the question to that viewer (husband vs wife); absent = shown to both.
export interface AdviceQuestion {
  id: string;
  text: Trilingual;
  options: { value: string; label: Trilingual }[];
  gender?: ViewerGender;
}

// One piece of advice. `daleel` carries the proof (verse/hadith/athar) in full.
// `when` gates the item to specific answers; omit it for advice shown always.
// `gender` restricts the item to that viewer (marriage/divorce advice differs
// for husband vs wife, Daa3iyah 2975/2980); absent = shown to both.
export interface AdviceItem {
  body: Trilingual;
  daleel?: Trilingual;
  when?: { q: string; value: string }[];
  gender?: ViewerGender;
}

export interface EventAdviceConfig {
  type: FamilyEventType;
  intro: Trilingual;
  questions: AdviceQuestion[];
  advice: AdviceItem[];
}

// Where each event routes after its advice. The destination feature screens
// self-gate (e.g. /qasm needs ≥2 wives; /haid is women-only), so route by the
// user's own gender to a reachable screen — never one that bounces. Shared by
// the events hub and the advice screen. (See app/family-events.tsx.)
export function routeForEvent(k: FamilyEventType, isWoman: boolean): string {
  switch (k) {
    case "birth":
      return "/add-child";
    case "pregnancy":
      return isWoman ? "/haid?settings=1" : "/(tabs)/family";
    case "marriage":
      return isWoman ? "/(tabs)/family" : "/(tabs)/settings";
    case "divorce":
      return isWoman ? "/(tabs)/family" : "/(tabs)/settings";
  }
  const _exhaustive: never = k; // compile-time: a new FamilyEventType must be handled above
  void _exhaustive;
  return "/(tabs)/family"; // unreachable for valid input; safe fallback if called untyped
}

// Questions to ask this viewer: gender-neutral ones plus those for their gender.
export function questionsForGender(config: EventAdviceConfig, viewerGender: ViewerGender): AdviceQuestion[] {
  return config.questions.filter((q) => !q.gender || q.gender === viewerGender);
}

// Advice items that apply given the viewer's gender and answers: an item shows
// when its `gender` (if any) matches the viewer AND its `when` (if any) matches
// every answered clause. No `gender`/`when` → always applies.
export function adviceForAnswers(config: EventAdviceConfig, answers: Record<string, string>, viewerGender: ViewerGender): AdviceItem[] {
  return config.advice.filter((item) =>
    (!item.gender || item.gender === viewerGender) &&
    (!item.when || item.when.every((c) => answers[c.q] === c.value)),
  );
}

// Content curated on Daa3iyah's manhaj, verses verified against the Uthmani
// mushaf; lives in data/family-event-advice.json (bundled). See scratchpad
// verification reports for per-verse/hadith provenance.
export const EVENT_ADVICE = adviceData as unknown as Record<FamilyEventType, EventAdviceConfig>;
