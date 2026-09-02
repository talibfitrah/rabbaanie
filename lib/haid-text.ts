import type { Advisory, DayStatus, Flow, NoteKey, PermittedKey, Rulings } from "./haid";
type Lang = "nl" | "en" | "ar";
const t = (l: Lang, nl: string, en: string, ar: string) => (l === "ar" ? ar : l === "en" ? en : nl);

export function haidText(l: Lang) {
  return {
    status: {
      haid: t(l, "Menstruatie (hayd)", "Menses (hayd)", "حيض"),
      nifas: t(l, "Kraambloeding (nifaas)", "Postpartum bleeding (nifaas)", "نفاس"),
      istihada: t(l, "Istihaadah (geen menstruatie)", "Istihaadah (not menses)", "استحاضة"),
      tuhr_pending_ghusl: t(l, "Rein — ghusl nog te doen", "Pure — ghusl still due", "طُهر — الغسل واجب"),
      tuhr: t(l, "Rein", "Pure", "طُهر"),
    } satisfies Record<DayStatus, string>,
    prayer: {
      excused: t(l, "Gebed: vrijgesteld, geen inhaal", "Prayer: excused, no make-up", "الصلاة: ساقطة بلا قضاء"),
      due_after_ghusl: t(l, "Gebed: verplicht na de ghusl", "Prayer: obligatory after ghusl", "الصلاة: واجبة بعد الغسل"),
      obligatory: t(l, "Gebed: verplicht", "Prayer: obligatory", "الصلاة: واجبة"),
    } satisfies Record<Rulings["prayer"], string>,
    fasting: {
      forbidden_qadaa: t(l, "Vasten: niet toegestaan, later inhalen", "Fasting: not allowed, make up later", "الصيام: لا يصحّ، ويُقضى"),
      allowed: t(l, "Vasten: toegestaan", "Fasting: allowed", "الصيام: جائز"),
    } satisfies Record<Rulings["fasting"], string>,
    intercourse: {
      forbidden: t(l, "Gemeenschap: niet toegestaan", "Intercourse: not permitted", "الجماع: لا يحلّ"),
      after_ghusl: t(l, "Gemeenschap: na de ghusl", "Intercourse: after ghusl", "الجماع: بعد الغسل"),
      permitted: t(l, "Gemeenschap: toegestaan", "Intercourse: permitted", "الجماع: يحلّ"),
      permitted_with_note: t(l, "Gemeenschap: toegestaan (zie opmerking)", "Intercourse: permitted (see note)", "الجماع: يحلّ (انظري التنبيه)"),
    } satisfies Record<Rulings["intercourse"], string>,
    ghusl: {
      due: t(l, "Ghusl: verplicht", "Ghusl: due", "الغسل: واجب"),
      none: t(l, "Ghusl: niet vereist", "Ghusl: not required", "الغسل: غير مطلوب"),
    } satisfies Record<Rulings["ghusl"], string>,
    permitted: {
      quran_recitation: t(l, "Qur'aan reciteren", "Reciting the Qur'aan", "قراءة القرآن"),
      touching_mushaf: t(l, "De mushaf aanraken", "Touching the mushaf", "مسّ المصحف"),
      staying_in_mosque: t(l, "In de moskee verblijven", "Staying in the mosque", "المكث في المسجد"),
      dhikr_dua: t(l, "Dhikr en du'aa", "Dhikr and du'aa", "الذكر والدعاء"),
    } satisfies Record<PermittedKey, string>,
    notes: {
      kaffarah_info: t(l, "Wie gemeenschap had tijdens de menstruatie: de overlevering noemt een sadaqah van een dinar of een halve dinar (Aboe Daawoed 264) — ter informatie.", "Intercourse during menses: the narration mentions a charity of a dinar or half a dinar (Abu Dawud 264) — for information.", "من جامع في الحيض: ورد في الحديث التصدق بدينار أو نصف دينار [أبو داود ٢٦٤] — للعلم لا للإلزام."),
      istihada_wudu_per_prayer_may_combine: t(l, "Wudoe' voor elk verplicht gebed; twee gebeden mogen met één wudoe' worden samengevoegd.", "Wudoo' for each obligatory prayer; two prayers may be combined with one wudoo'.", "الوضوء لكل فريضة، ويجوز الجمع بين صلاتين بوضوء واحد."),
      istihada_intercourse_caution: t(l, "Gemeenschap is toegestaan; houd rekening met het aanhoudende bloed.", "Intercourse is permitted; be mindful of the continuing bleeding.", "الجماع مباح مع مراعاة استمرار الدم."),
      prayer_of_this_time_due_after_ghusl: t(l, "Het gebed van dit tijdstip is verplicht na de ghusl (alleen dit gebed).", "The prayer of this time is due after ghusl (this prayer only).", "صلاة هذا الوقت واجبة بعد الغسل (هذه الصلاة وحدها)."),
      qadaa_prayer_if_missed_at_onset: t(l, "Had u het gebed van het tijdstip waarop het bloed begon nog niet verricht, haal het dan in na de reinheid.", "If you had not yet prayed the prayer of the time the bleeding began, make it up after purity.", "إن لم تكوني صلّيتِ صلاة الوقت الذي نزل فيه الدم فاقضيها بعد الطهر."),
      fasting_qadaa_required: t(l, "Gemiste vastendagen van Ramadaan worden later ingehaald.", "Missed Ramadaan fasts are made up later.", "أيام رمضان تُقضى بعد الطهر."),
    } satisfies Record<NoteKey, string>,
    advisory: {
      see_doctor: t(l, "Bloeding langer dan 15 dagen: raadpleeg een arts (medisch advies, geen oordeel).", "Bleeding beyond 15 days: see a doctor (medical advice, not a ruling).", "استمرار الدم أكثر من ١٥ يومًا: راجعي الطبيب (تنبيه طبي لا حكم)."),
      bleeding_in_pregnancy: t(l, "Bloedverlies tijdens zwangerschap: raadpleeg direct een arts.", "Bleeding during pregnancy: see a doctor promptly.", "نزول الدم أثناء الحمل: راجعي الطبيب فورًا."),
    } satisfies Record<Advisory, string>,
    flow: {
      blood: t(l, "Bloed", "Blood", "نزل الدم"),
      spotting: t(l, "Geel/bruin (safraa/kudrah)", "Yellow/brown (safra/kudra)", "صفرة أو كدرة"),
      dry: t(l, "Gestopt / droog", "Stopped / dry", "انقطع الدم"),
    } satisfies Record<Flow, string>,
    consent: t(l,
      "Uw aan uw account gekoppelde echtgenoot ziet al deze gegevens. Door in te schakelen geeft u daar toestemming voor; uitschakelen verwijdert de gegevens.",
      "The husband linked to your account sees all of this data. Enabling gives that permission; disabling deletes the data.",
      "زوجكِ المرتبط بحسابكِ يرى هذه البيانات كلها. بتفعيل الميزة تأذنين بذلك، وإيقافها يحذف البيانات."),
    fertileWarning: t(l, "Schatting op basis van eerdere cycli — niet betrouwbaar om zwangerschap te voorkomen.", "An estimate from previous cycles — not reliable for preventing pregnancy.", "تقدير مبني على الدورات السابقة، ولا يُعتمد عليه لمنع الحمل."),
  };
}
