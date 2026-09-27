import type { Advisory, DayStatus, Flow, NoteKey, PermittedKey, Rulings } from "./haid";
type Lang = "nl" | "en" | "ar";
const t = (l: Lang, nl: string, en: string, ar: string) => (l === "ar" ? ar : l === "en" ? en : nl);
// Arabic number–noun agreement for a day count (1–99, the only range cycles hit):
// 1 → يوم, 2 → يومين (dual), 3–10 → «N أيّام», 11+ → «N يومًا» (tamyiiz). The digit
// glyphs are converted to the user's numeral system by dig() at the call site.
const arDays = (n: number) => (n === 1 ? "يوم" : n === 2 ? "يومين" : n <= 10 ? `${n} أيّام` : `${n} يومًا`);

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
    overview: {
      cycleDay: (n: number) => t(l, `Dag ${n} van je cyclus`, `Day ${n} of your cycle`, `اليوم ${n} من الدورة`),
      nextHaid: (n: number) => t(l,
        n < 0 ? `Menstruatie ${-n} ${-n === 1 ? "dag" : "dagen"} te laat` : n === 0 ? `Menstruatie verwacht vandaag` : n === 1 ? `Volgende menstruatie morgen` : `Volgende menstruatie over ${n} dagen`,
        n < 0 ? `Menstruation ${-n} ${-n === 1 ? "day" : "days"} late` : n === 0 ? `Menstruation expected today` : n === 1 ? `Next menstruation tomorrow` : `Next menstruation in ${n} days`,
        n < 0 ? `الحيض متأخِّرٌ ${-n === 1 ? "يومًا" : arDays(-n)}` : n === 0 ? `الحيض متوقَّع اليوم` : n === 1 ? `الحيض القادم غدًا` : `الحيض القادم بعد ${arDays(n)}`),
      fertileIn: (n: number) => t(l, n <= 0 ? `Je bent nu in je vruchtbare dagen` : n === 1 ? `Vruchtbare dagen vanaf morgen` : `Vruchtbare dagen over ${n} dagen`, n <= 0 ? `You are in your fertile days now` : n === 1 ? `Fertile days from tomorrow` : `Fertile days in ${n} days`, n <= 0 ? `أنتِ في أيّام الخصوبة الآن` : n === 1 ? `أيّام الخصوبة تبدأ غدًا` : `أيّام الخصوبة بعد ${arDays(n)}`),
      breakdownTitle: t(l, `Je cyclus`, `Your cycle`, `دورتكِ`),
      personalizedNote: t(l, `Wordt nauwkeuriger naarmate je meer registreert.`, `Gets more accurate as you log more.`, `تزداد دقّةً كلّما سجّلتِ أكثر.`),
      phase: { menses: t(l, `Menstruatie`, `Menstruation`, `الحيض`), follicular: t(l, `Reinheid (voor eisprong)`, `Purity (before ovulation)`, `طُهر (قبل الإباضة)`), fertile: t(l, `Vruchtbare dagen`, `Fertile days`, `أيّام الخصوبة`), luteal: t(l, `Reinheid (na eisprong)`, `Purity (after ovulation)`, `طُهر (بعد الإباضة)`) } satisfies Record<string, string>,
      pctDays: (pct: number, d: number) => t(l, `${pct}% · ${d} ${d === 1 ? "dag" : "dagen"}`, `${pct}% · ${d} ${d === 1 ? "day" : "days"}`, `${pct}٪ · ${arDays(d)}`),
    },
    log: {
      startedToday: t(l, `Bloeding gestart vandaag`, `Bleeding started today`, `بدأ الدم اليوم`),
      stillBleeding: t(l, `Nog steeds bloeding?`, `Still bleeding?`, `هل ما زال الدم؟`),
      yesStill: t(l, `Ja, nog steeds`, `Yes, still`, `نعم، ما زال`),
      stopped: t(l, `Gestopt`, `Stopped`, `انقطع`),
      confirmHint: t(l, `Bevestig zodat je status klopt.`, `Confirm so your status is accurate.`, `أكّدي لتظهر حالتكِ بدقّة.`),
      loggedLegend: t(l, `Geregistreerd`, `Logged`, `مسجَّل`),
      assumedLegend: t(l, `Aangenomen (nog niet bevestigd)`, `Assumed (not yet confirmed)`, `محسوب (لم يُؤكَّد)`),
    },
    medical: {
      title: t(l, `Medische informatie (geen religieus oordeel)`, `Medical information (not a religious ruling)`, `معلومات طبّيّة (لا حكم شرعيّ)`),
      addBirthDate: t(l, `Vul je geboortedatum in je profiel in voor informatie die bij je leeftijd past.`, `Add your date of birth in your profile to see information suited to your age.`, `أضيفي تاريخ ميلادكِ في ملفّكِ الشخصيّ لعرض معلوماتٍ تناسب سنَّكِ.`),
      teen: t(l, `In de eerste jaren na je eerste menstruatie kan de cyclus onregelmatig zijn; dat is meestal normaal. Blijf registreren zodat de app jouw eigen patroon leert kennen.`, `In the first years after your first period the cycle can be irregular; this is usually normal. Keep logging so the app learns your own pattern.`, `في السنوات الأولى بعد بلوغكِ قد تكون الدورة غير منتظمة، وهذا طبيعيّ غالبًا. واظبي على التسجيل حتى يتعرّف التطبيق على نمطكِ الخاصّ.`),
      prime: t(l, `Op deze leeftijd is de cyclus meestal regelmatig (21 tot 35 dagen, gemiddeld ongeveer 28). De vruchtbare dagen lopen van ongeveer vijf dagen vóór de eisprong tot de dag erna; dan is de kans op zwangerschap het grootst.`, `At this age the cycle is usually regular (21 to 35 days, on average about 28). The fertile days run from about five days before ovulation to the day after it, when the chance of conception is highest.`, `غالبًا تكون الدورة منتظمة في هذه السنّ (بين 21 و35 يومًا، ومتوسّطها نحو 28). وأيّام الخصوبة تمتدّ من نحو خمسة أيّام قبل الإباضة إلى اليوم الذي يليها، وفيها أعلى القدرة على الحمل.`),
      declining: t(l, `De cyclus kan nog regelmatig zijn, maar de vruchtbaarheid neemt geleidelijk af, vooral na je 35e, en de cyclus kan iets korter worden. Wil je zwanger worden en lukt dat na verloop van tijd niet, raadpleeg dan een arts.`, `The cycle may still be regular, but fertility gradually declines, especially after 35, and cycles may shorten slightly. If you wish to conceive and it does not happen after some time, consult a doctor.`, `قد تظلّ الدورة منتظمة، لكنّ القدرة على الحمل تتناقص تدريجيًّا لا سيّما بعد الخامسة والثلاثين، وقد تقصُر الدورة قليلًا. إن رغبتِ في الحمل ولم يتيسّر بعد مدّة فاستشيري الطبيب.`),
      perimenopause: t(l, `Naarmate de overgang nadert kan de cyclus onregelmatig worden: langer, korter of soms overgeslagen, en de vruchtbaarheid neemt af zonder helemaal te verdwijnen. De menopauze is bereikt na twaalf maanden zonder menstruatie. (De regels rond de overgang vind je in het gedeelte met de bepalingen.)`, `As menopause approaches the cycle may become irregular: longer, shorter, or sometimes skipped, and fertility declines without fully disappearing. Menopause is reached after twelve consecutive months without a period. (The rulings on menopause are in the rulings section.)`, `مع اقتراب سنّ اليأس قد تصبح الدورة غير منتظمة: تطول أو تقصُر أو تنقطع أحيانًا، وتقلّ القدرة على الحمل دون أن تنعدم تمامًا، وبلوغُه يكون بانقطاع الحيض سنةً كاملة. (وأحكام سنّ اليأس تجدينها في قسم الأحكام.)`),
    },
  };
}
