// Pure parser: Quranic Arabic Corpus morphology (mustafa0x/quran-morphology
// fork, GPL — credit corpus.quran.com) -> an Arabic صرف analysis for the mushaf
// word popup. No I/O here — operates on the per-word segment tuples already
// fetched/cached by app/(tabs)/concepts.tsx from the per-surah JSON built by
// scripts/build-morphology-data.mjs.
//
// TAG is always exactly "N" | "P" | "V" in this data; the real subtype (PN,
// DEM, ACT_PCPL, CONJ, DET, a verb's tense, ...) lives in the FIRST feature
// token instead — confirmed by exhaustively scanning all 130,030 source lines.
// A LATER bare token can carry the exact same text as a subtype code with a
// completely different meaning (bare "P" = حرف جر when it's the head token of
// a particle, but = جمع/plural when it's a trailing gender-number attribute on
// a noun; same clash for "ACC" and "IMPV"). This file resolves that by
// POSITION — only the head token (index 0) can set `kind` — which is the one
// rule verified to hold for every line in the corpus, rather than by
// re-testing a dictionary (which cannot tell the two "P"s apart) or by TAG
// alone (COND/INTG legitimately set `kind` for both N and P).
//
// Person+gender+number is FUSED into one token (e.g. "2MS", "3FP", "1P") —
// substring tests like `.includes("2P")` silently miss every gendered form
// (`"2MS".includes("2P")` is false). This decodes each token character by
// character against `pronoun_attrs` instead.

interface TermsShape {
  types: Record<string, string>;
  particles: Record<string, string>;
  noun_forms: Record<string, string>;
  noun_grammar: Record<string, string>;
  attrs: Record<string, string>;
  verb_forms_tri: string[];
  verb_forms_quad: string[];
  verb_tenses: Record<string, string>;
  verb_grammar: Record<string, string>;
  pronoun_attrs: Record<string, string>;
  labels: Record<string, string>;
  other: Record<string, string>;
}

// Verbatim from mustafa0x/quran-morphology's morphology-terms-ar.json (shipped
// in the same repo as the data, so guaranteed aligned to this tag vocabulary).
const TERMS: TermsShape = {
  types: {
    N: "اسم", PN: "علم", PRON: "ضمير",
    DEM: "اسم اشارة", REL: "اسم موصول",
    T: "ظرف زمان", LOC: "ظرف مكان",
    V: "فعل", NV: "اسم فعل",
    COND: "شرطية", INTG: "استفهامية",
  },
  particles: {
    P: "حرف جر",
    EMPH: "لام التوكيد", IMPV: "لام الامر", PRP: "لام التعليل",
    CONJ: "حرف عطف", SUB: "حرف مصدري", ACC: "حرف نصب", AMD: "حرف استدراك",
    ANS: "حرف جواب", AVR: "حرف ردع", CAUS: "حرف سببية", CERT: "حرف تحقيق",
    CIRC: "حرف حال", COM: "واو المعية", EQ: "حرف تسوية", EXH: "حرف تحضيض",
    EXL: "حرف تفصيل", EXP: "أداة استثناء", FUT: "حرف استقبال", INC: "حرف ابتداء",
    INT: "حرف تفسير", NEG: "حرف نفي", PREV: "حرف كاف", PRO: "حرف نهي",
    REM: "حرف استئنافية", RES: "أداة حصر", RET: "حرف اضراب",
    RSLT: "حرف واقع في جواب الشرط", SUP: "حرف زائد", SUR: "حرف فجاءة", VOC: "حرف نداء",
    ATT: "حرف تنبيه", DIST: "لام البعد", ADDR: "حرف خطاب",
    INL: "حروف مقطعة",
  },
  noun_forms: { ACT_PCPL: "اسم فاعل", PASS_PCPL: "اسم مفعول", VN: "مصدر" },
  noun_grammar: { NOM: "مرفوع", ACC: "منصوب", GEN: "مجرور" },
  attrs: { ADJ: "نعت", INDEF: "نكرة", PASS: "لم يسمّ فاعله" },
  verb_forms_tri: [
    "فَعَلَ", "فَعَّلَ", "فاعَلَ", "أَفْعَلَ", "تَفَعَّلَ", "تَفاعَلَ",
    "انْفَعَلَ", "افْتَعَلَ", "افْعَلَّ", "اسْتَفْعَلَ", "افْعالَّ",
  ],
  verb_forms_quad: ["فَعْلَلَ", "تَفَعْلَلَ", "افْعَنْلَلَ", "افْعَلَلَّ"],
  verb_tenses: { PERF: "ماض", IMPF: "مضارع", IMPV: "أمر" },
  verb_grammar: { IND: "مرفوع", SUBJ: "منصوب", JUS: "مجزوم" },
  pronoun_attrs: {
    "1": "متكلم", "2": "مخاطب", "3": "غائب",
    M: "مذكر", F: "مؤنث",
    S: "مفرد", D: "مثنى", P: "جمع",
  },
  labels: { ROOT: "الجذر", LEM: "الصيغة", MOOD: "الإعراب", VF: "باب الفعل" },
  other: { PREFIX: "بادئة", SUFFIX: "لاحقة", DET: "ال" },
};

// Head-token (index 0) subtype dictionary — the only position where a bare
// code may set `kind`. DET isn't a particles code (it lives under `other`)
// but behaves exactly like one here (always the sole head token of its own
// "ال" segment).
const SUBTYPE_LABELS: Record<string, string> = {
  ...TERMS.types,
  ...TERMS.particles,
  ...TERMS.noun_forms,
  DET: TERMS.other.DET,
};

// UI-facing field labels, reused by the concepts.tsx popup so it never
// hardcodes its own Arabic grammar-label strings.
export const MORPH_LABELS = {
  root: TERMS.labels.ROOT,
  lemma: TERMS.labels.LEM,
  verbForm: TERMS.labels.VF,
};

export type MorphSegmentTuple = [form: string, tag: string, features: string];

export interface WordSegmentAnalysis {
  form: string;
  kind: string;
  details: string[];
  root?: string;
  lemma?: string;
  verbForm?: string;
}

export interface WordMorphology {
  segments: WordSegmentAnalysis[];
  root?: string;
  lemma?: string;
}

// At most one digit (1/2/3) then at most one of M/F then at most one of
// S/D/P, nothing else — matches "2MS", "3FP", "1P", "MS", "P", "D", never a
// multi-letter code like "ADJ" or "SUB" (verified against every bare token
// that occurs in the real corpus).
const FUSED_PGN = /^[123]?[MF]?[SDP]?$/;

function decodeFusedPgn(token: string, details: string[]) {
  for (const ch of token) {
    const label = TERMS.pronoun_attrs[ch];
    if (label) details.push(label);
  }
}

// VF:n indexes the triliteral verb-form table (11 entries, forms I-XI) except
// for quadriliteral roots (4 consonants, e.g. ROOT:زلزل), which index the
// separate 4-entry table instead — the corpus reuses the same 1..4 numbering
// for both, so the table choice must come from the root, not from n alone.
function verbFormLabel(vf: string, root: string | undefined): string | undefined {
  const n = Number(vf);
  if (!Number.isInteger(n) || n < 1) return undefined;
  const table = root && [...root].length === 4 ? TERMS.verb_forms_quad : TERMS.verb_forms_tri;
  return table[n - 1];
}

function analyzeSegment([form, tag, featuresStr]: MorphSegmentTuple): WordSegmentAnalysis {
  const tokens = (featuresStr || "").split("|").filter(Boolean);
  let kind = tag === "V" ? TERMS.types.V : tag === "N" ? TERMS.types.N : TERMS.particles.P;
  const details: string[] = [];
  let root: string | undefined;
  let lemma: string | undefined;
  let vfRaw: string | undefined;

  tokens.forEach((token, i) => {
    const colon = token.indexOf(":");
    if (colon !== -1) {
      const key = token.slice(0, colon);
      const val = token.slice(colon + 1);
      if (key === "ROOT") root = val;
      else if (key === "LEM") lemma = val;
      else if (key === "MOOD") {
        const label = TERMS.verb_grammar[val];
        if (label) details.push(label);
      } else if (key === "VF") vfRaw = val;
      // FAM and anything else: not part of this popup's field set — skip.
      return;
    }
    if (i === 0) {
      if (tag === "V") {
        const tense = TERMS.verb_tenses[token];
        if (tense) details.push(tense);
      } else {
        kind = SUBTYPE_LABELS[token] ?? kind;
      }
      return;
    }
    if (token === "PREF") { details.push(TERMS.other.PREFIX); return; }
    if (token === "SUFF") { details.push(TERMS.other.SUFFIX); return; }
    if (token === "NOM" || token === "GEN" || token === "ACC") {
      details.push(TERMS.noun_grammar[token]);
      return;
    }
    if (token === "ADJ" || token === "INDEF" || token === "PASS") {
      details.push(TERMS.attrs[token]);
      return;
    }
    if (FUSED_PGN.test(token)) { decodeFusedPgn(token, details); return; }
    // A SECOND subtype/tense token (only the first could set `kind`): keep it as a
    // detail rather than dropping it, e.g. PN|ACT_PCPL, NV|IMPF, LOC|ACT_PCPL. Try
    // verb_tenses before SUBTYPE_LABELS so a trailing IMPV reads «أمر» (tense), not
    // «لام الامر» (the particle sense, which only applies as a head token).
    const extra = TERMS.verb_tenses[token] || SUBTYPE_LABELS[token];
    if (extra) { details.push(extra); return; }
    // Unknown code: skip silently — never show a raw code to the user.
  });

  const verbForm = vfRaw ? verbFormLabel(vfRaw, root) : undefined;
  return { form, kind, details, root, lemma, verbForm };
}

/** Analyze one word's ordered segments (as grouped in the built per-surah
 * JSON) into a theme-agnostic Arabic صرف structure for the word popup. */
export function analyzeWord(segmentTuples: MorphSegmentTuple[]): WordMorphology {
  const segments = segmentTuples.map(analyzeSegment);
  const withRoot = segments.find((s) => s.root);
  const withLemma = withRoot ?? segments.find((s) => s.lemma);
  return { segments, root: withRoot?.root, lemma: withLemma?.lemma };
}
