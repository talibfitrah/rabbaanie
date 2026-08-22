/**
 * Name fidelity standard — the AI must reproduce every personal name (the
 * parent/user, the spouse, and each child) exactly as it is stored: same
 * script, same spelling, character for character. Never transliterate,
 * translate, shorten, nickname, or re-spell a name.
 *
 * Root cause this guards: an LLM asked to write Arabic prose containing a
 * name will sometimes "normalize" or re-transliterate it from a Latin form,
 * or simply mis-spell a visually/phonetically similar letter (e.g. ص/س) —
 * this is how the parent's own name صهيب came out سهيب in generated advice.
 *
 * This is a prompt instruction, not a deterministic filter: it strongly
 * reduces but cannot 100% guarantee model compliance — the model can still
 * ignore it. A verbatim post-processing check is out of scope; keeping this
 * text identical everywhere it is used is the proportionate fix.
 *
 * One canonical copy per language. Every system prompt that receives a
 * parent/spouse/child name interpolates the matching entry below instead of
 * repeating the wording, so the standard has exactly one source of truth.
 */
export const NAME_FIDELITY_RULE = {
  ar: `قاعدة الأمانة في الأسماء (ملزمة بلا استثناء): انقل كل اسم شخصي (اسم الوالد، اسم الشريك، واسم كل طفل) كما ورد بالضبط في البيانات المُعطاة لك في هذا النص — نفس الحروف ونفس الرسم، حرفًا بحرف. لا تُترجم الاسم، ولا تُعرّبه بنطق آخر، ولا تُقصّره، ولا تستبدله بكنية، ولا "تصحّح" رسمه أبدًا. إن لم تكن متأكدًا من رسم الاسم، انسخه حرفيًا من البيانات؛ لا تخمّنه.`,
  en: `NAME FIDELITY RULE (binding, no exceptions): Reproduce every personal name (the parent, the spouse, and each child) EXACTLY as it appears in the data provided in this prompt — identical script and spelling, character for character. Never transliterate, translate, shorten, nickname, or re-spell a name. If unsure of a spelling, copy it verbatim from the data; never guess or "correct" it.`,
  nl: `NAAMTROUW-REGEL (bindend, geen uitzonderingen): Neem elke persoonlijke naam (die van de ouder, de partner, en elk kind) EXACT over zoals die in de aangeleverde gegevens in deze prompt staat — hetzelfde schrift en dezelfde spelling, letter voor letter. Vertaal, transcribeer of verkort een naam nooit, verzin er geen koosnaampje voor, en "verbeter" de spelling nooit. Twijfel je over de spelling: neem hem dan letterlijk over uit de gegevens; raad nooit.`,
} as const;
