// Trilingual labels for the raw enum values collected by the parent-profile
// onboarding form. This is the single source: app/(tabs)/family.tsx and
// app/spouse-profile.tsx both import from here, so neither screen owns a copy
// and the two cannot drift apart.
export const PROFILE_VALUE_LABELS: Record<
  string,
  { nl: string; en: string; ar: string }
> = {
  // Prayer
  altijd_5: { nl: "Altijd alle 5", en: "Always all 5", ar: "دائمًا الخمس" },
  meestal_4: { nl: "Meestal 4", en: "Usually 4", ar: "غالبًا 4" },
  soms_3: { nl: "Soms 3", en: "Sometimes 3", ar: "أحيانًا 3" },
  zelden_1_2: { nl: "Zelden (1-2)", en: "Rarely (1-2)", ar: "نادرًا (1-2)" },
  nooit: { nl: "Geen", en: "None", ar: "لا" },
  // Fajr
  altijd_op_tijd: {
    nl: "Altijd op tijd",
    en: "Always on time",
    ar: "دائمًا في وقتها",
  },
  meestal_op_tijd: {
    nl: "Meestal op tijd",
    en: "Usually on time",
    ar: "غالبًا في وقتها",
  },
  soms_op_tijd: {
    nl: "Soms op tijd",
    en: "Sometimes on time",
    ar: "أحيانًا في وقتها",
  },
  zelden_op_tijd: {
    nl: "Zelden op tijd",
    en: "Rarely on time",
    ar: "نادرًا في وقتها",
  },
  // Hijab
  ja_volledig: { nl: "Ja, volledig", en: "Yes, fully", ar: "نعم، كاملاً" },
  ja_gedeeltelijk: {
    nl: "Ja, gedeeltelijk",
    en: "Yes, partially",
    ar: "نعم، جزئيًا",
  },
  nee: { nl: "Nee", en: "No", ar: "لا" },
  nee_maar_bezig: {
    nl: "Nee, maar bezig",
    en: "No, but working on it",
    ar: "لا، لكنني بصدد ذلك",
  },
  // Knowledge sources
  geleerden_direct: {
    nl: "Direct bij geleerden",
    en: "Directly from scholars",
    ar: "مباشرة من العلماء",
  },
  studenten_van_kennis: {
    nl: "Studenten van kennis",
    en: "Students of knowledge",
    ar: "طلاب العلم",
  },
  moskee_lessen: {
    nl: "Moskee-lessen",
    en: "Mosque lessons",
    ar: "دروس المسجد",
  },
  boeken: { nl: "Boeken", en: "Books", ar: "الكتب" },
  online_lessen: {
    nl: "Online lessen",
    en: "Online lessons",
    ar: "دروس عبر الإنترنت",
  },
  youtube: { nl: "YouTube", en: "YouTube", ar: "يوتيوب" },
  sociale_media: {
    nl: "Sociale media",
    en: "Social media",
    ar: "وسائل التواصل",
  },
  geen: { nl: "Geen", en: "None", ar: "لا شيء" },
  // Family science
  ja_regelmatig: {
    nl: "Ja, regelmatig",
    en: "Yes, regularly",
    ar: "نعم، بانتظام",
  },
  ja_soms: { nl: "Ja, soms", en: "Yes, sometimes", ar: "نعم، أحيانًا" },
  // School type
  regulier: {
    nl: "Regulier onderwijs",
    en: "Regular education",
    ar: "تعليم نظامي",
  },
  thuisonderwijs: {
    nl: "Thuisonderwijs",
    en: "Homeschooling",
    ar: "تعليم منزلي",
  },
  islamitisch: {
    nl: "Islamitisch onderwijs",
    en: "Islamic education",
    ar: "تعليم إسلامي",
  },
  combinatie: { nl: "Combinatie", en: "Combination", ar: "مزيج" },
  anders: { nl: "Anders", en: "Other", ar: "أخرى" },
};

/**
 * Renders a raw profile enum value in the given language. Accepts a single
 * key, a comma-joined multi-value string (e.g. "geleerden_direct,boeken"),
 * or a string[] — each part is mapped independently and joined readably.
 * A key with no mapping falls back to itself rather than blanking or
 * throwing.
 */
export function translateProfileValue(
  val: string | string[] | undefined | null,
  lang: string,
): string {
  if (!val || (Array.isArray(val) && val.length === 0)) return "-";
  const parts = Array.isArray(val) ? val : String(val).split(",");
  const separator = lang === "ar" ? "، " : ", ";
  return parts
    .map((raw) => {
      const key = raw.trim();
      const entry = PROFILE_VALUE_LABELS[key];
      if (!entry) return key;
      return lang === "ar" ? entry.ar : lang === "nl" ? entry.nl : entry.en;
    })
    .join(separator);
}
