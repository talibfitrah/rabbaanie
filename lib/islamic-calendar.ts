// Single source of truth mapping a Gregorian Date to its Islamic occasions
// (فضائل fadail + بدع bidah warnings), at day and month scope. Consumed by
// the calendar UI (built separately).
//
// NO-FABRICATION RULE: every `proofs` entry below is copied VERBATIM from the
// already-verified strings in app/details/upcoming-days.tsx's getDetailedDays
// (extracted programmatically, not retyped by hand, to rule out transcription
// error in the Arabic). Occasions with no verified proof yet are left with
// `proofs: []` and no detail text -- a vetted pipeline fills those in later.
import { getIslamicDate } from "./prayer-data";

export type Tri = { ar: string; nl: string; en: string };

/**
 * One piece of evidence for a fadila. Kept as a single trilingual blob
 * (not split into an Arabic quote + separate source citation) because the
 * verified strings ported from upcoming-days.tsx already interleave quote
 * and citation per language (e.g. "«...» — Muslim"); splitting that apart
 * would mean re-parsing verified religious text, which is exactly the kind
 * of risk the no-fabrication rule exists to avoid.
 */
export interface OccasionProof {
  text: Tri;
}

export interface Occasion {
  id: string; // stable, e.g. "jumuah", "white-day", "ashura", "bidah-mawlid"
  scope: "day" | "month";
  kind: "fadila" | "bidah";
  title: Tri;
  detail?: Tri; // empty/undefined when content pending
  proofs: OccasionProof[]; // [] when pending
  fasting?: "recommended" | "prohibited";
  parentAction?: Tri;
  preparation?: Tri;
}

export interface DayOccasions {
  day: Occasion[];
  month: Occasion[];
}

// Ported verbatim from app/details/upcoming-days.tsx's isFastingProhibited.
// Not imported from there: that file is a heavy RN screen component, and
// Step 5 (if applied) has it depend on THIS module -- importing back from it
// would make a cycle. Three lines is cheaper than untangling that.
function isFastingProhibited(month: number, day: number): boolean {
  if (month === 10 && day === 1) return true;
  if (month === 12 && day === 10) return true;
  if (month === 12 && day >= 11 && day <= 13) return true;
  return false;
}

/** A title-only occasion awaiting vetted content from the review pipeline. */
function pending(id: string, scope: Occasion["scope"], kind: Occasion["kind"], title: Tri, extra?: Partial<Occasion>): Occasion {
  return { id, scope, kind, title, proofs: [], ...extra };
}

export function getDayOccasions(date: Date): DayOccasions {
  const hijri = getIslamicDate(date, null);
  const { month, day } = hijri;
  const dow = date.getDay(); // 0=Sun..6=Sat
  const noFast = isFastingProhibited(month, day);

  const dayOccasions: Occasion[] = [];
  const monthOccasions: Occasion[] = [];

  // ================= ported fadail (verbatim content) =================

  if (dow === 5) {
    dayOccasions.push({
      id: "jumuah", scope: "day", kind: "fadila",
      title: { ar: "الجمعة", nl: "Jumu'ah (vrijdag)", en: "Jumu'ah (Friday)" },
      detail: { nl: "Beste dag — Soerah al-Kahf; salawaat; du'aa laatste uur", en: "Best day — Surah al-Kahf; salawaat; du'aa last hour", ar: "أفضل يوم — سورة الكهف؛ الصلاة على النبي؛ الدعاء آخر ساعة" },
      proofs: [{ text: { nl: "«Khayru yawmin tala'at 'alayhi ash-shams yawm al-Jumu'ah» — Muslim", en: "«The best day on which the sun rises is Friday» — Muslim", ar: "«خير يوم طلعت عليه الشمس يوم الجمعة» — مسلم" } }],
      parentAction: { nl: "Lees Soerah al-Kahf als gezin", en: "Read Surah al-Kahf as a family", ar: "اقرأوا سورة الكهف كعائلة" },
      preparation: { nl: "Ghusl; parfum; vroeg naar moskee", en: "Ghusl; perfume; early to mosque", ar: "غسل؛ طيب؛ التبكير للمسجد" },
    });
  }

  if ((dow === 1 || dow === 4) && !noFast) {
    const isMonday = dow === 1;
    dayOccasions.push({
      id: isMonday ? "monday-fasting" : "thursday-fasting", scope: "day", kind: "fadila",
      title: isMonday
        ? { ar: "صيام الاثنين", nl: "Maandag vasten", en: "Monday fasting" }
        : { ar: "صيام الخميس", nl: "Donderdag vasten", en: "Thursday fasting" },
      detail: { nl: "Daden worden voorgelegd terwijl u vast", en: "Deeds are presented while you fast", ar: "تُعرض الأعمال وأنت صائم" },
      proofs: [{ text: { nl: "«Uhibbu an yurfa'a 'amalee wa ana saa'im» — Nasaa'i", en: "«I love that my deeds are raised while I am fasting» — an-Nasaa'i", ar: "«أحب أن يُرفع عملي وأنا صائم» — النسائي" } }],
      fasting: "recommended",
      parentAction: { nl: "Vast en evalueer de week met uw partner", en: "Fast and evaluate the week with your partner", ar: "صم وقيّم الأسبوع مع شريكك" },
    });
  }

  if ((day === 13 || day === 14 || day === 15) && !noFast) {
    dayOccasions.push({
      id: "white-day", scope: "day", kind: "fadila",
      title: { nl: `Witte dag (${day}e)`, en: `White day (${day}th)`, ar: `يوم أبيض (${day})` },
      detail: { nl: "3 dagen = beloning hele maand", en: "3 days = reward of whole month", ar: "٣ أيام = أجر صيام شهر" },
      proofs: [{ text: { nl: "«Idhaa sumta min ash-shahr thalaathatan fa-sum 13, 14, 15» — Tirmidhi", en: "«If you fast three days of the month, fast the 13th, 14th, and 15th» — at-Tirmidhi", ar: "«إذا صمت من الشهر ثلاثاً فصم ثلاث عشرة وأربع عشرة وخمس عشرة» — الترمذي" } }],
      fasting: "recommended",
      parentAction: { nl: "Leer kinderen over de witte dagen", en: "Teach children about the white days", ar: "علّم الأولاد عن الأيام البيض" },
    });
  }

  if (month === 12 && day >= 1 && day <= 8) {
    dayOccasions.push({
      id: "dhul-hijjah-first-ten", scope: "day", kind: "fadila",
      title: { nl: `${day}e Dhul-Hijjah`, en: `${day}th Dhul-Hijjah`, ar: `${day} ذو الحجة` },
      detail: { nl: "Goede daden geliefder bij Allaah dan op enige andere dag", en: "Good deeds more beloved to Allaah than any other day", ar: "العمل الصالح أحب إلى الله من أي يوم آخر" },
      proofs: [{ text: { nl: "«Maa min ayyaamin al-'amalu as-saalihu feehinna ahabbu ilaa Allaah...» — Tirmidhi", en: "«There are no days in which righteous deeds are more beloved to Allaah...» — at-Tirmidhi", ar: "«ما من أيام العمل الصالح فيهن أحب إلى الله من هذه الأيام العشر» — الترمذي" } }],
      fasting: "recommended",
      parentAction: { nl: "Vermeerder dhikr, sadaqah en takbier als gezin", en: "Increase dhikr, sadaqah and takbeer as a family", ar: "أكثروا من الذكر والصدقة والتكبير كعائلة" },
      preparation: { nl: "Takbier; goede daden; geen nagels knippen", en: "Takbeer; good deeds; no cutting nails", ar: "تكبير؛ أعمال صالحة؛ لا تقص الأظافر" },
    });
  }

  if (month === 12 && day === 9) {
    dayOccasions.push({
      id: "arafah", scope: "day", kind: "fadila",
      title: { nl: "Dag van 'Arafah", en: "Day of 'Arafah", ar: "يوم عرفة" },
      detail: { nl: "Wist zonden van 2 jaar", en: "Erases sins of 2 years", ar: "يكفّر ذنوب سنتين" },
      proofs: [{ text: { nl: "«Yukaffiru as-sanata allatee qablahu wal-sanata allatee ba'dahu» — Muslim", en: "«It expiates the sins of the preceding year and the following year» — Muslim", ar: "«يكفّر السنة التي قبله والسنة التي بعده» — مسلم" } }],
      fasting: "recommended",
      parentAction: { nl: "Vast als gezin! Maak veel du'aa", en: "Fast as a family! Make much du'aa", ar: "صوموا كعائلة! أكثروا الدعاء" },
      preparation: { nl: "Neem intentie vasten; veel du'aa", en: "Intend to fast; much du'aa", ar: "انوِ الصيام؛ أكثر من الدعاء" },
    });
  }

  if (month === 12 && day === 10) {
    dayOccasions.push({
      id: "eid-al-adha", scope: "day", kind: "fadila",
      title: { nl: "'Ied al-Adhaa", en: "'Eid al-Adha", ar: "عيد الأضحى" },
      detail: { nl: "Grootste dag van het jaar", en: "Greatest day of the year", ar: "أعظم أيام السنة" },
      proofs: [],
      fasting: "prohibited",
      parentAction: { nl: "Neem kinderen mee naar 'Ied-gebed; offer", en: "Take children to 'Eid prayer; sacrifice", ar: "خذ الأولاد لصلاة العيد؛ الأضحية" },
      preparation: { nl: "Ghusl; mooiste kleding; takbier; 'Ied-gebed; offer", en: "Ghusl; best clothes; takbeer; 'Eid prayer; sacrifice", ar: "غسل؛ أحسن الثياب؛ تكبير؛ صلاة العيد؛ الأضحية" },
    });
  }

  if (month === 12 && day >= 11 && day <= 13) {
    const n = day - 10;
    dayOccasions.push({
      id: "tashreeq", scope: "day", kind: "fadila",
      title: { nl: `Tashreeq ${n}`, en: `Tashreeq ${n}`, ar: `تشريق ${n}` },
      detail: { nl: "Eten, drinken en dhikr — vasten haraam", en: "Eating, drinking and dhikr — fasting haraam", ar: "أكل وشرب وذكر — الصيام حرام" },
      proofs: [],
      fasting: "prohibited",
      parentAction: { nl: "Takbier na elk gebed; geniet als gezin", en: "Takbeer after every prayer; enjoy as family", ar: "تكبير بعد كل صلاة؛ استمتع مع العائلة" },
    });
  }

  if (month === 1 && day === 10) {
    dayOccasions.push({
      id: "ashura", scope: "day", kind: "fadila",
      title: { nl: "'Aashoeraa", en: "'Aashoeraa", ar: "عاشوراء" },
      detail: { nl: "Wist zonden voorgaand jaar", en: "Erases sins of previous year", ar: "يكفّر ذنوب السنة الماضية" },
      proofs: [{ text: { nl: "«Yukaffiru as-sanata allatee qablahu» — Muslim", en: "«It expiates the sins of the preceding year» — Muslim", ar: "«يكفّر السنة التي قبله» — مسلم" } }],
      fasting: "recommended",
      parentAction: { nl: "Vertel kinderen het verhaal van Moesaa", en: "Tell children the story of Moosaa", ar: "اقصص على الأولاد قصة موسى" },
    });

    // Coexists with the fadila above -- عاشوراء carries real virtue AND has
    // widespread local innovations attached to it; both are shown.
    dayOccasions.push(pending("bidah-ashura", "day", "bidah", { ar: "بدع عاشوراء", nl: "Innovaties rond Aashoera", en: "Innovations around Ashura" }));
  }

  // ================= new fadila slots: title only, content pending =================

  if (month === 9 && day >= 21 && day <= 30) {
    dayOccasions.push(pending("ramadan-last-ten", "day", "fadila", { ar: "العشر الأواخر من رمضان", nl: "Laatste tien dagen van Ramadan", en: "Last ten days of Ramadan" }));
  }
  if (month === 9 && [21, 23, 25, 27, 29].includes(day)) {
    dayOccasions.push(pending("laylat-al-qadr", "day", "fadila", { ar: "ليلة القدر (مرشحة)", nl: "Laylat al-Qadr (mogelijke nacht)", en: "Laylat al-Qadr (candidate night)" }));
  }
  if (month === 10 && day === 1) {
    dayOccasions.push(pending("eid-al-fitr", "day", "fadila", { ar: "عيد الفطر", nl: "Eid al-Fitr", en: "Eid al-Fitr" }, { fasting: "prohibited" }));
  }
  if (month === 10 && day >= 2 && day <= 30) {
    dayOccasions.push(pending("six-of-shawwal", "day", "fadila", { ar: "صيام الست من شوال", nl: "Zes dagen van Shawwal", en: "Six days of Shawwal" }));
  }
  if (month === 1 && day === 9) {
    dayOccasions.push(pending("tasua", "day", "fadila", { ar: "تاسوعاء", nl: "Tasoe'aa", en: "Tasu'a" }));
  }
  if (month === 1 && day >= 1 && day <= 9) {
    dayOccasions.push(pending("muharram-first-ten", "day", "fadila", { ar: "العشر الأوائل من محرم", nl: "Eerste tien dagen van Muharram", en: "First ten days of Muharram" }));
  }

  // ================= new bidah warning slots (day scope): title only =================

  if (month === 7 && day === 27) {
    dayOccasions.push(pending("bidah-isra-miraj", "day", "bidah", { ar: "الاحتفال بالإسراء والمعراج", nl: "Viering van al-Israa' wal-Mi'raaj", en: "Celebration of al-Isra' wal-Mi'raj" }));
  }
  if (month === 8 && day === 15) {
    dayOccasions.push(pending("bidah-mid-shaban", "day", "bidah", { ar: "بدع ليلة النصف من شعبان", nl: "Innovaties van de nacht van half Sha'baan", en: "Innovations of the night of mid-Sha'ban" }));
  }
  if (month === 3 && day === 12) {
    dayOccasions.push(pending("bidah-mawlid", "day", "bidah", { ar: "الاحتفال بالمولد", nl: "Viering van de Mawlid", en: "Mawlid celebration" }));
  }
  if (month === 1 && day === 1) {
    dayOccasions.push(pending("bidah-hijri-new-year", "day", "bidah", { ar: "الاحتفال برأس السنة الهجرية", nl: "Viering van het islamitische nieuwjaar", en: "Celebration of the Islamic new year" }));
  }

  // ================= month-scope occasions =================

  if (month === 9) monthOccasions.push(pending("ramadan", "month", "fadila", { ar: "رمضان", nl: "Ramadan", en: "Ramadan" }));
  if (month === 8) monthOccasions.push(pending("shaban", "month", "fadila", { ar: "شعبان", nl: "Sha'baan", en: "Sha'ban" }));
  if ([11, 12, 1, 7].includes(month)) monthOccasions.push(pending("sacred-months", "month", "fadila", { ar: "الأشهر الحرم", nl: "De heilige maanden", en: "The sacred months" }));
  if (month === 7) monthOccasions.push(pending("bidah-rajab", "month", "bidah", { ar: "بدع شهر رجب", nl: "Innovaties van de maand Rajab", en: "Innovations of the month of Rajab" }));
  if (month === 3) monthOccasions.push(pending("bidah-mawlid-month", "month", "bidah", { ar: "بدع المولد", nl: "Innovaties rond de Mawlid", en: "Innovations around the Mawlid" }));

  return { day: dayOccasions, month: monthOccasions };
}
