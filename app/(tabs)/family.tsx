import { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  UIManager,
  Alert,
  Modal,
  TouchableOpacity,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/use-colors";
import { useAppState } from "@/lib/app-context";
import { calculateAgeInWeeks, getWeekInYear, getYearKey, isProfileComplete } from "@/lib/store";
import { DateTimeHeader } from "@/components/date-time-header";
import { useI18n } from "@/lib/i18n";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMultipleYearData } from "@/hooks/use-weekly-data";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/use-auth";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SyncToast } from "@/components/sync-toast";
import { ReportAiContent } from "@/components/report-ai-content";

import { authedFetch } from "@/lib/authed-fetch";
import { translateProfileValue } from "@/lib/profile-labels";
import { parsePlanText, groupIntoSections } from "@/lib/plan-blocks";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers";

/**
 * links.getPartnerProfile returns a union: a restricted payload omits
 * parentProfile/children/issues/dailyCheckins/etc. entirely (the security
 * boundary — see server/routers.ts). TypeScript's control-flow narrowing on
 * `.access === "full"` doesn't reach into nested closures (the IIFEs below
 * read partner data inside their own callback scope), so re-checking access
 * inline at each read site doesn't actually protect them. Narrow once
 * through this guard instead and read full-only fields off its result.
 */
type PartnerProfileData = inferRouterOutputs<AppRouter>["links"]["getPartnerProfile"];
type FullPartnerProfile = Extract<NonNullable<PartnerProfileData>, { access: "full" }>;
function isFullPartnerProfile(
  data: PartnerProfileData | undefined,
): data is FullPartnerProfile {
  return !!data && data.access === "full";
}

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const DAY_LETTERS = ["ZO", "MA", "DI", "WO", "DO", "VR", "ZA"];
function getChildIdString(birthDate: string, idx: number): string {
  const datePart = birthDate.replace(/-/g, "");
  const dayLetter = DAY_LETTERS[new Date(birthDate).getDay()];
  const seqPart = String(idx + 1).padStart(3, "0");
  return `${datePart}_${dayLetter}_${seqPart}`;
}

function gregorianToHijri(gDate: Date): {
  year: number;
  month: number;
  day: number;
  monthName: string;
  monthNameAR: string;
} {
  const d = gDate.getDate();
  const m = gDate.getMonth() + 1;
  const y = gDate.getFullYear();
  const jd =
    Math.floor((1461 * (y + 4800 + Math.floor((m - 14) / 12))) / 4) +
    Math.floor((367 * (m - 2 - 12 * Math.floor((m - 14) / 12))) / 12) -
    Math.floor(
      (3 * Math.floor((y + 4900 + Math.floor((m - 14) / 12)) / 100)) / 4,
    ) +
    d -
    32075;
  const l = jd - 2 - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  const lRem = l - 10631 * n + 354;
  const j =
    Math.floor((10985 - lRem) / 5316) * Math.floor((50 * lRem) / 17719) +
    Math.floor(lRem / 5670) * Math.floor((43 * lRem) / 15238);
  const lFinal =
    lRem -
    Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
    Math.floor(j / 16) * Math.floor((15238 * j) / 43) +
    29;
  const hMonth = Math.floor((24 * lFinal) / 709);
  const hDay = lFinal - Math.floor((709 * hMonth) / 24);
  const hYear = 30 * n + j - 30;
  const hijriMonths = [
    "Muharram",
    "Safar",
    "Rabee' al-Awwal",
    "Rabee' ath-Thaani",
    "Jumaada al-Oola",
    "Jumaada ath-Thaaniya",
    "Rajab",
    "Sha'baan",
    "Ramadhaan",
    "Shawwaal",
    "Dhul-Qi'dah",
    "Dhul-Hijjah",
  ];
  const hijriMonthsAR = [
    "المحرّم",
    "صفر",
    "ربيع الأول",
    "ربيع الثاني",
    "جمادى الأولى",
    "جمادى الثانية",
    "رجب",
    "شعبان",
    "رمضان",
    "شوال",
    "ذو القعدة",
    "ذو الحجة",
  ];
  return {
    year: hYear,
    month: hMonth,
    day: hDay,
    monthName: hijriMonths[(hMonth - 1) % 12] || "Muharram",
    monthNameAR: hijriMonthsAR[(hMonth - 1) % 12] || "المحرّم",
  };
}

function isFastingProhibited(hijriMonth: number, hijriDay: number): boolean {
  if (hijriMonth === 10 && hijriDay === 1) return true;
  if (hijriMonth === 12 && hijriDay === 10) return true;
  if (hijriMonth === 12 && hijriDay >= 11 && hijriDay <= 13) return true;
  return false;
}

interface DayInfo {
  name: string;
  reward: string;
  reason: string;
  evidence: string;
  fasting?: "recommended" | "prohibited" | "obligatory";
  parentAction?: string;
  preparation?: string;
  lang?: string;
}

interface UpcomingEvent {
  daysUntil: number;
  dayLabel: string;
  name: string;
  preparation?: string;
  lang?: string;
  fasting?: "recommended" | "prohibited" | "obligatory";
}

type Lang = "nl" | "en" | "ar";

function tx(lang: Lang, nl: string, en: string, ar: string): string {
  return lang === "ar" ? ar : lang === "en" ? en : nl;
}

function getParentDayInfo(
  hijriMonth: number,
  hijriDay: number,
  dayOfWeek: number,
  lang: Lang,
): DayInfo[] {
  const days: DayInfo[] = [];

  if (dayOfWeek === 5) {
    days.push({
      name: "Jumu'ah",
      reward: tx(
        lang,
        "Uur van verhoring; licht tussen twee Jumu'ahs",
        "Hour of acceptance; light between two Jumu'ahs",
        "ساعة إجابة؛ نور بين الجمعتين",
      ),
      reason: tx(
        lang,
        "Beste dag — Aadam geschapen, Paradijs betreden, Dag des Oordeels",
        "Best day — Aadam created, entered Paradise, Day of Judgment",
        "أفضل يوم — خُلق آدم، أُدخل الجنة، يوم القيامة",
      ),
      evidence: tx(
        lang,
        "«Khayru yawmin tala'at 'alayhi ash-shams yawm al-Jumu'ah» — Muslim",
        "«Khayru yawmin tala'at 'alayhi ash-shams yawm al-Jumu'ah» — Muslim",
        "«خير يوم طلعت عليه الشمس يوم الجمعة» — مسلم",
      ),
      parentAction: tx(
        lang,
        "Du'aa voor kinderen bij naam; Soerah al-Kahf als gezin",
        "Du'aa for children by name; Soerah al-Kahf as a family",
        "الدعاء للأولاد بأسمائهم؛ سورة الكهف كعائلة",
      ),
    });
  }

  if (dayOfWeek === 1) {
    days.push({
      name: tx(lang, "Maandag — vasten", "Monday — fasting", "الاثنين — صيام"),
      reward: tx(
        lang,
        "Daden worden voorgelegd terwijl u vast",
        "Deeds are presented while you fast",
        "تُعرض الأعمال وأنت صائم",
      ),
      reason: tx(
        lang,
        "Geboortedag Profeet ﷺ; dag van openbaring",
        "Birthday of the Prophet ﷺ; day of revelation",
        "يوم ولادة النبي ﷺ؛ يوم نزول الوحي",
      ),
      evidence: tx(
        lang,
        "«Dhaalika yawmun wulidtu fiehi, wa fiehi unzila 'alayya» — Muslim",
        "«Dhaalika yawmun wulidtu fiehi, wa fiehi unzila 'alayya» — Muslim",
        "«ذلك يوم ولدت فيه، وفيه أُنزل عليّ» — مسلم",
      ),
      fasting: isFastingProhibited(hijriMonth, hijriDay)
        ? "prohibited"
        : "recommended",
      parentAction: tx(
        lang,
        "Vast en evalueer de week met uw partner",
        "Fast and evaluate the week with your partner",
        "صم وقيّم الأسبوع مع شريكك",
      ),
    });
  }

  if (dayOfWeek === 4) {
    days.push({
      name: tx(
        lang,
        "Donderdag — vasten",
        "Thursday — fasting",
        "الخميس — صيام",
      ),
      reward: tx(
        lang,
        "Poorten Paradijs open; vergeving voor iedereen behalve wie ruzie heeft",
        "Gates of Paradise open; forgiveness for all except those in dispute",
        "تُفتح أبواب الجنة؛ يُغفر لكل أحد إلا المتشاحنين",
      ),
      reason: tx(
        lang,
        "Daden worden voorgelegd aan Allaah",
        "Deeds are presented to Allaah",
        "تُعرض الأعمال على الله",
      ),
      evidence: tx(
        lang,
        "«Tuftahu abwaab al-Jannah yawm al-ithnayn wal-khamees» — Muslim",
        "«Tuftahu abwaab al-Jannah yawm al-ithnayn wal-khamees» — Muslim",
        "«تُفتح أبواب الجنة يوم الاثنين والخميس» — مسلم",
      ),
      fasting: isFastingProhibited(hijriMonth, hijriDay)
        ? "prohibited"
        : "recommended",
      parentAction: tx(
        lang,
        "Vast en los eventuele ruzies op",
        "Fast and resolve any disputes",
        "صم وأصلح أي خلاف",
      ),
    });
  }

  if (hijriDay === 13 || hijriDay === 14 || hijriDay === 15) {
    days.push({
      name: tx(
        lang,
        `Witte dag (${hijriDay}e)`,
        `White day (${hijriDay}th)`,
        `يوم أبيض (${hijriDay})`,
      ),
      reward: tx(
        lang,
        "3 dagen = beloning hele maand vasten",
        "3 days = reward of fasting the whole month",
        "٣ أيام = أجر صيام شهر كامل",
      ),
      reason: tx(
        lang,
        "Nachten verlicht door volle maan — soennah Profeet ﷺ",
        "Nights illuminated by the full moon — sunnah of the Prophet ﷺ",
        "ليالٍ مضيئة بالبدر — سنة النبي ﷺ",
      ),
      evidence: tx(
        lang,
        "«Idhaa sumta min ash-shahr thalaathatan fa-sum 13, 14, 15» — Tirmidhi, hasan",
        "«Idhaa sumta min ash-shahr thalaathatan fa-sum 13, 14, 15» — Tirmidhi, hasan",
        "«إذا صمت من الشهر ثلاثًا فصم ١٣ و١٤ و١٥» — الترمذي، حسن",
      ),
      fasting: isFastingProhibited(hijriMonth, hijriDay)
        ? "prohibited"
        : "recommended",
      parentAction: tx(
        lang,
        "Leer kinderen over de witte dagen",
        "Teach children about the white days",
        "علّم الأولاد عن الأيام البيض",
      ),
    });
  }

  if (hijriMonth === 1 && hijriDay === 10) {
    days.push({
      name: "'Aashoeraa",
      reward: tx(
        lang,
        "Wist zonden voorgaand jaar",
        "Erases sins of the previous year",
        "يكفّر ذنوب السنة الماضية",
      ),
      reason: tx(
        lang,
        "Allaah redde Moesaa; Fir'awn verdronken",
        "Allaah saved Moosaa; Fir'awn was drowned",
        "نجّى الله موسى؛ أُغرق فرعون",
      ),
      evidence: tx(
        lang,
        "«Yukaffiru as-sanata allatee qablahu» — Muslim",
        "«Yukaffiru as-sanata allatee qablahu» — Muslim",
        "«يكفّر السنة التي قبله» — مسلم",
      ),
      fasting: "recommended",
      parentAction: tx(
        lang,
        "Vertel kinderen het verhaal van Moesaa",
        "Tell children the story of Moosaa",
        "اقصص على الأولاد قصة موسى",
      ),
    });
  }

  if (hijriMonth === 1 && hijriDay === 9) {
    days.push({
      name: "Taasoe'aa",
      reward: tx(
        lang,
        "Samen met 'Aashoeraa vasten — onderscheiding",
        "Fasting with 'Aashoeraa — distinction",
        "صيامه مع عاشوراء — مخالفة",
      ),
      reason: tx(
        lang,
        "De Profeet ﷺ wilde de 9e erbij vasten als onderscheiding",
        "The Prophet ﷺ wanted to add the 9th as distinction",
        "أراد النبي ﷺ صيام التاسع مخالفةً",
      ),
      evidence: tx(
        lang,
        "«La'in baqeetu ilaa qaabil la-asoomanna at-taasi'» — Muslim",
        "«La'in baqeetu ilaa qaabil la-asoomanna at-taasi'» — Muslim",
        "«لئن بقيت إلى قابل لأصومنّ التاسع» — مسلم",
      ),
      fasting: "recommended",
      parentAction: tx(
        lang,
        "Bereid kinderen voor op vasten morgen",
        "Prepare children for fasting tomorrow",
        "جهّز الأولاد لصيام الغد",
      ),
    });
  }

  if (hijriMonth === 1 && hijriDay !== 9 && hijriDay !== 10) {
    days.push({
      name: tx(lang, "Muharram", "Muharram", "المحرّم"),
      reward: tx(
        lang,
        "Beste vasten na Ramadhaan",
        "Best fasting after Ramadhaan",
        "أفضل الصيام بعد رمضان",
      ),
      reason: tx(
        lang,
        "Shahru Allaah — maand van Allaah, heilig",
        "Shahru Allaah — month of Allaah, sacred",
        "شهر الله — شهر حرام",
      ),
      evidence: tx(
        lang,
        "«Afdalu as-siyaami ba'da Ramadhaan shahru Allaah al-Muharram» — Muslim",
        "«Afdalu as-siyaami ba'da Ramadhaan shahru Allaah al-Muharram» — Muslim",
        "«أفضل الصيام بعد رمضان شهر الله المحرّم» — مسلم",
      ),
      fasting: "recommended",
      parentAction: tx(
        lang,
        "Vermeerder goede daden als gezin",
        "Increase good deeds as a family",
        "أكثروا من الأعمال الصالحة كعائلة",
      ),
    });
  }

  if (hijriMonth === 8) {
    days.push({
      name: tx(lang, "Sha'baan", "Sha'baan", "شعبان"),
      reward: tx(
        lang,
        "Daden worden opgeheven naar Allaah",
        "Deeds are raised to Allaah",
        "تُرفع الأعمال إلى الله",
      ),
      reason: tx(
        lang,
        "Maand die mensen vergeten — Profeet ﷺ vastte er veel in",
        "Month people forget — Prophet ﷺ fasted much in it",
        "شهر يغفل عنه الناس — أكثر النبي ﷺ فيه الصيام",
      ),
      evidence: tx(
        lang,
        "«Uhibbu an yurfa'a 'amalee wa ana saa'im» — Nasaa'i, hasan",
        "«Uhibbu an yurfa'a 'amalee wa ana saa'im» — Nasaa'i, hasan",
        "«أحب أن يُرفع عملي وأنا صائم» — النسائي، حسن",
      ),
      fasting: hijriDay <= 15 ? "recommended" : undefined,
      parentAction: tx(
        lang,
        "Bereid Ramadhaan-doelen voor met kinderen",
        "Prepare Ramadhaan goals with children",
        "جهّز أهداف رمضان مع الأولاد",
      ),
    });
  }

  if (hijriMonth === 9) {
    days.push({
      name: tx(lang, "Ramadhaan", "Ramadhaan", "رمضان"),
      reward: tx(
        lang,
        "Vergeving voorgaande zonden; poorten Paradijs open",
        "Forgiveness of previous sins; gates of Paradise open",
        "مغفرة ما تقدم من الذنوب؛ تُفتح أبواب الجنة",
      ),
      reason: tx(
        lang,
        "Maand van de Qur'aan; shayaatien geketend",
        "Month of the Qur'aan; shayaateen chained",
        "شهر القرآن؛ تُصفّد الشياطين",
      ),
      evidence: tx(
        lang,
        "«Man saama Ramadhaan iemaanan wahtisaaban ghufira lahu» — Bukhaari & Muslim",
        "«Man saama Ramadhaan iemaanan wahtisaaban ghufira lahu» — Bukhaari & Muslim",
        "«من صام رمضان إيمانًا واحتسابًا غُفر له ما تقدم من ذنبه» — البخاري ومسلم",
      ),
      fasting: "obligatory",
      parentAction: tx(
        lang,
        "Qur'aan en taraawieh als gezin",
        "Qur'aan and taraaweeh as a family",
        "القرآن والتراويح كعائلة",
      ),
    });
    if (hijriDay >= 21) {
      days.push({
        name: tx(lang, "Laatste 10 nachten", "Last 10 nights", "العشر الأواخر"),
        reward: tx(
          lang,
          "Laylat al-Qadr = beter dan 1000 maanden",
          "Laylat al-Qadr = better than 1000 months",
          "ليلة القدر = خير من ألف شهر",
        ),
        reason: tx(
          lang,
          "Profeet ﷺ spande zich extra in en maakte gezin wakker",
          "Prophet ﷺ exerted extra effort and woke his family",
          "كان النبي ﷺ يجتهد ويوقظ أهله",
        ),
        evidence: tx(
          lang,
          "«Man qaama Laylat al-Qadr iemaanan wahtisaaban ghufira lahu» — Bukhaari & Muslim",
          "«Man qaama Laylat al-Qadr iemaanan wahtisaaban ghufira lahu» — Bukhaari & Muslim",
          "«من قام ليلة القدر إيمانًا واحتسابًا غُفر له ما تقدم من ذنبه» — البخاري ومسلم",
        ),
        parentAction: tx(
          lang,
          "Maak kinderen wakker voor du'aa in de nacht",
          "Wake children for du'aa at night",
          "أيقظ الأولاد للدعاء في الليل",
        ),
      });
    }
  }

  if (hijriMonth === 10 && hijriDay === 1) {
    days.push({
      name: tx(lang, "'Ied al-Fitr", "'Ied al-Fitr", "عيد الفطر"),
      reward: tx(
        lang,
        "Feestdag — vreugde na geduld",
        "Celebration — joy after patience",
        "عيد — فرحة بعد الصبر",
      ),
      reason: tx(
        lang,
        "Allaah gaf moslims twee feesten ter vervanging van jaahiliyyah",
        "Allaah gave Muslims two celebrations to replace jaahiliyyah",
        "أبدل الله المسلمين عيدين بدل أعياد الجاهلية",
      ),
      evidence: tx(
        lang,
        "«Qad abdala-kumaa Allaahu khayran: yawm al-Adhaa wa yawm al-Fitr» — Abu Daawoed",
        "«Qad abdala-kumaa Allaahu khayran: yawm al-Adhaa wa yawm al-Fitr» — Abu Daawoed",
        "«قد أبدلكما الله خيرًا: يوم الأضحى ويوم الفطر» — أبو داود",
      ),
      fasting: "prohibited",
      parentAction: tx(
        lang,
        "Vier met gezin; geef sadaqat al-fitr",
        "Celebrate with family; give sadaqat al-fitr",
        "احتفل مع العائلة؛ أخرج صدقة الفطر",
      ),
    });
  }

  if (hijriMonth === 10 && hijriDay >= 2 && hijriDay <= 7) {
    days.push({
      name: tx(lang, "6 dagen Shawwaal", "6 days Shawwaal", "٦ أيام شوال"),
      reward: tx(
        lang,
        "Ramadhaan + 6 = beloning heel jaar",
        "Ramadhaan + 6 = reward of a whole year",
        "رمضان + ٦ = أجر سنة كاملة",
      ),
      reason: tx(
        lang,
        "Elke goede daad x10: 30 + 6 = 360 dagen",
        "Every good deed x10: 30 + 6 = 360 days",
        "كل حسنة بعشر: ٣٠ + ٦ = ٣٦٠ يومًا",
      ),
      evidence: tx(
        lang,
        "«Man saama Ramadhaan thumma atba'ahu sittan min Shawwaal» — Muslim",
        "«Man saama Ramadhaan thumma atba'ahu sittan min Shawwaal» — Muslim",
        "«من صام رمضان ثم أتبعه ستًّا من شوال» — مسلم",
      ),
      fasting: "recommended",
      parentAction: tx(
        lang,
        "Vast samen met uw kinderen (indien oud genoeg)",
        "Fast together with your children (if old enough)",
        "صم مع أولادك (إن كانوا كبارًا بما يكفي)",
      ),
    });
  }

  if (hijriMonth === 12 && hijriDay >= 1 && hijriDay <= 9) {
    days.push({
      name: tx(
        lang,
        "Eerste 10 Dhul-Hijjah",
        "First 10 Dhul-Hijjah",
        "عشر ذي الحجة",
      ),
      reward: tx(
        lang,
        "Goede daden geliefder bij Allaah dan op enige andere dag",
        "Good deeds more beloved to Allaah than on any other day",
        "العمل الصالح أحب إلى الله من أي يوم آخر",
      ),
      reason: tx(
        lang,
        "Allaah zwoer erbij in Soerah al-Fajr",
        "Allaah swore by them in Soerah al-Fajr",
        "أقسم الله بها في سورة الفجر",
      ),
      evidence: tx(
        lang,
        "«Maa min ayyaamin al-'amalu as-saalihu ahabbu ilaa Allaah min haadhihi al-'ashr» — Bukhaari",
        "«Maa min ayyaamin al-'amalu as-saalihu ahabbu ilaa Allaah min haadhihi al-'ashr» — Bukhaari",
        "«ما من أيام العمل الصالح أحب إلى الله من هذه العشر» — البخاري",
      ),
      fasting: "recommended",
      parentAction: tx(
        lang,
        "Vermeerder dhikr, sadaqah en takbier als gezin",
        "Increase dhikr, sadaqah and takbeer as a family",
        "أكثروا من الذكر والصدقة والتكبير كعائلة",
      ),
    });
  }

  if (hijriMonth === 12 && hijriDay === 9) {
    days.push({
      name: tx(lang, "Dag van 'Arafah", "Day of 'Arafah", "يوم عرفة"),
      reward: tx(
        lang,
        "Wist zonden van 2 jaar (vorig + komend)",
        "Erases sins of 2 years (previous + coming)",
        "يكفّر ذنوب سنتين (ماضية وقادمة)",
      ),
      reason: tx(
        lang,
        "Meeste bevrijdingen uit het Vuur; Allaah maakt Zich trots",
        "Most liberations from the Fire; Allaah boasts",
        "أكثر يوم يُعتق فيه من النار؛ يباهي الله",
      ),
      evidence: tx(
        lang,
        "«Yukaffiru as-sanata allatee qablahu wal-sanata allatee ba'dahu» — Muslim",
        "«Yukaffiru as-sanata allatee qablahu wal-sanata allatee ba'dahu» — Muslim",
        "«يكفّر السنة التي قبله والسنة التي بعده» — مسلم",
      ),
      fasting: "recommended",
      parentAction: tx(
        lang,
        "Vast als gezin! Maak veel du'aa voor uw kinderen",
        "Fast as a family! Make much du'aa for your children",
        "صوموا كعائلة! أكثروا الدعاء لأولادكم",
      ),
    });
  }

  if (hijriMonth === 12 && hijriDay === 10) {
    days.push({
      name: tx(lang, "'Ied al-Adhaa", "'Ied al-Adhaa", "عيد الأضحى"),
      reward: tx(
        lang,
        "Grootste dag van het jaar",
        "Greatest day of the year",
        "أعظم أيام السنة",
      ),
      reason: tx(
        lang,
        "Salaah + offer + ramy + tawaaf — alles samen",
        "Salaah + sacrifice + ramy + tawaaf — all together",
        "صلاة + ذبح + رمي + طواف — كلها مجتمعة",
      ),
      evidence: tx(
        lang,
        "«Inna a'dhama al-ayyaami 'inda Allaah yawm an-nahr» — Abu Daawoed, sahieh",
        "«Inna a'dhama al-ayyaami 'inda Allaah yawm an-nahr» — Abu Daawoed, sahieh",
        "«إن أعظم الأيام عند الله يوم النحر» — أبو داود، صحيح",
      ),
      fasting: "prohibited",
      parentAction: tx(
        lang,
        "Verricht het offer; laat kinderen meekijken",
        "Perform the sacrifice; let children watch",
        "اذبح الأضحية؛ دع الأولاد يشاهدون",
      ),
    });
  }

  if (hijriMonth === 12 && hijriDay >= 11 && hijriDay <= 13) {
    days.push({
      name: tx(
        lang,
        `Tashreeq dag ${hijriDay - 10} van 3 (${hijriDay} DH)`,
        `Tashreeq day ${hijriDay - 10} of 3 (${hijriDay} DH)`,
        `يوم تشريق ${hijriDay - 10} من ٣ (${hijriDay} ذو الحجة)`,
      ),
      reward: tx(
        lang,
        "Dagen van eten, drinken en dhikr van Allaah — vasten is haraam",
        "Days of eating, drinking and dhikr of Allaah — fasting is haraam",
        "أيام أكل وشرب وذكر الله — الصيام حرام",
      ),
      reason: tx(
        lang,
        "3 dagen feest na 'Ied al-Adhaa; takbier na elk gebed; eten en drinken",
        "3 days of celebration after 'Ied al-Adhaa; takbeer after every prayer; eat and drink",
        "٣ أيام احتفال بعد عيد الأضحى؛ تكبير بعد كل صلاة؛ أكل وشرب",
      ),
      evidence: tx(
        lang,
        "«Ayyaamu at-tashreeq ayyaamu akl wa shurb wa dhikri Allaah» — Muslim",
        "«Ayyaamu at-tashreeq ayyaamu akl wa shurb wa dhikri Allaah» — Muslim",
        "«أيام التشريق أيام أكل وشرب وذكر الله» — مسلم",
      ),
      fasting: "prohibited",
      parentAction: tx(
        lang,
        "Takbier na elk gebed; geniet als gezin; eet en drink",
        "Takbeer after every prayer; enjoy as a family; eat and drink",
        "كبّر بعد كل صلاة؛ استمتع مع العائلة؛ كل واشرب",
      ),
    });
  }

  if (hijriMonth === 7) {
    days.push({
      name: tx(
        lang,
        "Rajab (heilige maand)",
        "Rajab (sacred month)",
        "رجب (شهر حرام)",
      ),
      reward: tx(
        lang,
        "Zonden wegen zwaarder; goede daden wegen zwaarder",
        "Sins weigh heavier; good deeds weigh heavier",
        "الذنوب أعظم؛ الحسنات أعظم",
      ),
      reason: tx(
        lang,
        "Een van de vier heilige maanden",
        "One of the four sacred months",
        "أحد الأشهر الحرم الأربعة",
      ),
      evidence: tx(
        lang,
        "«Minhaa arba'atun hurum» — Bukhaari & Muslim",
        "«Minhaa arba'atun hurum» — Bukhaari & Muslim",
        "«منها أربعة حُرُم» — البخاري ومسلم",
      ),
      parentAction: tx(
        lang,
        "Geen bid'ah — volg alleen de soennah",
        "No bid'ah — follow only the sunnah",
        "لا بدعة — اتبع السنة فقط",
      ),
    });
  }

  if (hijriMonth === 12 && hijriDay >= 1 && hijriDay <= 9) {
    days.push({
      name: tx(
        lang,
        "Voorbereiding 'Ied al-Adhaa",
        "Preparation 'Ied al-Adhaa",
        "التحضير لعيد الأضحى",
      ),
      reward: tx(
        lang,
        "Wie wil offeren: knip geen nagels/haar vanaf 1 DH",
        "Who wants to sacrifice: don't cut nails/hair from 1 DH",
        "من أراد أن يضحي: لا يقص أظافره/شعره من ١ ذي الحجة",
      ),
      reason: tx(
        lang,
        "Soennah voor wie een offer wil brengen",
        "Sunnah for whoever wants to sacrifice",
        "سنة لمن أراد أن يضحي",
      ),
      evidence: tx(
        lang,
        "«Idhaa dakhala al-'ashr wa araada ahadukum an yudahhiya fala yamassa min sha'rihi wa basharihi shay'an» — Muslim",
        "«Idhaa dakhala al-'ashr wa araada ahadukum an yudahhiya fala yamassa min sha'rihi wa basharihi shay'an» — Muslim",
        "«إذا دخل العشر وأراد أحدكم أن يضحي فلا يمسّ من شعره وبشره شيئًا» — مسلم",
      ),
      parentAction: tx(
        lang,
        "Koop offerdier; maak takbier; leer kinderen de takbier",
        "Buy sacrificial animal; make takbeer; teach children the takbeer",
        "اشترِ الأضحية؛ كبّر؛ علّم الأولاد التكبير",
      ),
      preparation: tx(
        lang,
        "Koop offerdier; geen nagels/haar knippen; takbier",
        "Buy sacrificial animal; no cutting nails/hair; takbeer",
        "شراء الأضحية؛ عدم قص الأظافر/الشعر؛ التكبير",
      ),
    });
  }

  if (hijriMonth === 12 && hijriDay === 10) {
    days.push({
      name: tx(
        lang,
        "Soennah van 'Ied al-Adhaa",
        "Sunnah of 'Ied al-Adhaa",
        "سنن عيد الأضحى",
      ),
      reward: tx(
        lang,
        "Elke druppel bloed van het offer = hasanah",
        "Every drop of blood from the sacrifice = hasanah",
        "كل قطرة دم من الأضحية = حسنة",
      ),
      reason: tx(
        lang,
        "Ghusl, mooiste kleding, takbier, 'Ied-gebed, offer na gebed, niet eten tot na offer",
        "Ghusl, best clothes, takbeer, 'Ied prayer, sacrifice after prayer, don't eat until after sacrifice",
        "غسل، أحسن الثياب، تكبير، صلاة العيد، الذبح بعد الصلاة، لا تأكل حتى تذبح",
      ),
      evidence: tx(
        lang,
        "«Maa 'amila Aadamiy yawm an-nahr 'amalan ahabba ilaa Allaah min ihraaqid-dam» — Tirmidhi, hasan",
        "«Maa 'amila Aadamiy yawm an-nahr 'amalan ahabba ilaa Allaah min ihraaqid-dam» — Tirmidhi, hasan",
        "«ما عمل آدمي يوم النحر عملًا أحب إلى الله من إهراق الدم» — الترمذي، حسن",
      ),
      parentAction: tx(
        lang,
        "Neem kinderen mee naar 'Ied-gebed; laat ze het offer zien",
        "Take children to 'Ied prayer; let them see the sacrifice",
        "خذ الأولاد لصلاة العيد؛ دعهم يرون الذبح",
      ),
      preparation: tx(
        lang,
        "Ghusl → mooiste kleding → takbier → 'Ied-gebed → offer → eet van offer",
        "Ghusl → best clothes → takbeer → 'Ied prayer → sacrifice → eat from sacrifice",
        "غسل → أحسن الثياب → تكبير → صلاة العيد → الذبح → الأكل من الأضحية",
      ),
    });
  }

  if (hijriMonth === 10 && hijriDay === 1) {
    days.push({
      name: tx(
        lang,
        "Soennah van 'Ied al-Fitr",
        "Sunnah of 'Ied al-Fitr",
        "سنن عيد الفطر",
      ),
      reward: tx(
        lang,
        "Vreugde voor de vastende; beloning bij Allaah",
        "Joy for the fasting person; reward is with Allaah",
        "فرحة للصائم؛ الأجر عند الله",
      ),
      reason: tx(
        lang,
        "Ghusl, mooiste kleding, dadels (oneven) voor gebed, takbier op weg",
        "Ghusl, best clothes, dates (odd number) before prayer, takbeer on the way",
        "غسل، أحسن الثياب، تمرات (وتر) قبل الصلاة، تكبير في الطريق",
      ),
      evidence: tx(
        lang,
        "«Kaana laa yakhruju yawm al-Fitr hattaa yat'ama» — Bukhaari",
        "«Kaana laa yakhruju yawm al-Fitr hattaa yat'ama» — Bukhaari",
        "«كان لا يخرج يوم الفطر حتى يَطعَم» — البخاري",
      ),
      parentAction: tx(
        lang,
        "Zakaat al-Fitr voor gebed; neem kinderen mee; feliciteer",
        "Zakaat al-Fitr before prayer; take children; congratulate",
        "زكاة الفطر قبل الصلاة؛ خذ الأولاد؛ هنّئ",
      ),
      preparation: tx(
        lang,
        "Ghusl → dadels eten → takbier → 'Ied-gebed → feliciteer",
        "Ghusl → eat dates → takbeer → 'Ied prayer → congratulate Muslims",
        "غسل → أكل التمر → تكبير → صلاة العيد → التهنئة",
      ),
    });
  }

  if (hijriMonth === 8 && hijriDay >= 20) {
    days.push({
      name: tx(
        lang,
        "Voorbereiding Ramadhaan",
        "Preparation Ramadhaan",
        "التحضير لرمضان",
      ),
      reward: tx(
        lang,
        "Wie zich voorbereidt haalt meer uit Ramadhaan",
        "Who prepares gets more out of Ramadhaan",
        "من استعدّ حصّل أكثر من رمضان",
      ),
      reason: tx(
        lang,
        "Maak een plan: Qur'aan-doelen, du'aa-lijst, sadaqah-plan",
        "Make a plan: Qur'aan goals, du'aa list, sadaqah plan",
        "ضع خطة: أهداف القرآن، قائمة الدعاء، خطة الصدقة",
      ),
      evidence: tx(
        lang,
        "«Shahrun mubaarakun farada Allaahu 'alaykum siyaamahu» — Nasaa'i",
        "«Shahrun mubaarakun farada Allaahu 'alaykum siyaamahu» — Nasaa'i",
        "«شهر مبارك فرض الله عليكم صيامه» — النسائي",
      ),
      parentAction: tx(
        lang,
        "Maak Ramadhaan-schema met kinderen; leer du'aa iftaar",
        "Make Ramadhaan schedule with children; learn du'aa iftaar",
        "ضع جدول رمضان مع الأولاد؛ تعلّم دعاء الإفطار",
      ),
      preparation: tx(
        lang,
        "Qur'aan-schema; du'aa-lijst; sadaqah-plan; schulden aflossen",
        "Qur'aan schedule; du'aa list; sadaqah plan; pay off debts",
        "جدول القرآن؛ قائمة الدعاء؛ خطة الصدقة؛ سداد الديون",
      ),
    });
  }

  const fastingDays = days.filter((d) => d.fasting === "recommended");
  if (fastingDays.length > 1) {
    days.push({
      name: tx(
        lang,
        "Samenloop vastendagen",
        "Overlapping fasting days",
        "تداخل أيام الصيام",
      ),
      reward: tx(
        lang,
        "Neem de intentie (niyyah) van de beste beloning!",
        "Take the intention (niyyah) of the best reward!",
        "انوِ نية أفضل الأجر!",
      ),
      reason: tx(
        lang,
        `${fastingDays.map((d) => d.name).join(" + ")} vallen samen`,
        `${fastingDays.map((d) => d.name).join(" + ")} overlap`,
        `${fastingDays.map((d) => d.name).join(" + ")} تتداخل`,
      ),
      evidence: tx(
        lang,
        "«Innamaa al-a'maalu bin-niyyaat» — Bukhaari & Muslim",
        "«Innamaa al-a'maalu bin-niyyaat» — Bukhaari & Muslim",
        "«إنما الأعمال بالنيات» — البخاري ومسلم",
      ),
    });
  }

  return days.map((d) => ({ ...d, lang }));
}

function getUpcomingEvents(now: Date, lang: Lang): UpcomingEvent[] {
  const events: UpcomingEvent[] = [];
  const daysArr =
    lang === "ar"
      ? ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"]
      : lang === "en"
        ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
        : ["Zo", "Ma", "Di", "Wo", "Do", "Vr", "Za"];

  for (let i = 1; i <= 10; i++) {
    const futureDate = new Date(now.getTime() + i * 86400000);
    const futureDow = futureDate.getDay();
    const fH = gregorianToHijri(futureDate);
    const dayLabel = `${daysArr[futureDow]} ${fH.day} ${lang === "ar" ? fH.monthNameAR : fH.monthName}`;
    const noFasting = isFastingProhibited(fH.month, fH.day);

    if ((futureDow === 1 || futureDow === 4) && !noFasting)
      events.push({
        daysUntil: i,
        dayLabel,
        name:
          futureDow === 1
            ? tx(lang, "Maandag vasten", "Monday fasting", "صيام الاثنين")
            : tx(lang, "Donderdag vasten", "Thursday fasting", "صيام الخميس"),
        fasting: "recommended",
      });
    if (futureDow === 5)
      events.push({
        daysUntil: i,
        dayLabel,
        name: "Jumu'ah",
        preparation: tx(
          lang,
          "Soerah al-Kahf; du'aa laatste uur",
          "Soerah al-Kahf; du'aa last hour",
          "سورة الكهف؛ الدعاء آخر ساعة",
        ),
      });
    if ((fH.day === 13 || fH.day === 14 || fH.day === 15) && !noFasting)
      events.push({
        daysUntil: i,
        dayLabel,
        name: tx(
          lang,
          `Witte dag (${fH.day}e)`,
          `White day (${fH.day}th)`,
          `يوم أبيض (${fH.day})`,
        ),
        fasting: "recommended",
      });
    if (fH.month === 1 && fH.day === 10)
      events.push({
        daysUntil: i,
        dayLabel,
        name: "'Aashoeraa",
        fasting: "recommended",
        preparation: tx(
          lang,
          "Vast ook de 9e",
          "Also fast the 9th",
          "صم التاسع أيضًا",
        ),
      });
    if (fH.month === 1 && fH.day === 9)
      events.push({
        daysUntil: i,
        dayLabel,
        name: "Taasoe'aa",
        fasting: "recommended",
      });
    if (fH.month === 12 && fH.day === 9)
      events.push({
        daysUntil: i,
        dayLabel,
        name: tx(lang, "'Arafah — vast!", "'Arafah — fast!", "عرفة — صم!"),
        fasting: "recommended",
        preparation: tx(
          lang,
          "Neem intentie vasten; veel du'aa",
          "Take intention to fast; much du'aa",
          "انوِ الصيام؛ أكثر من الدعاء",
        ),
      });
    if (fH.month === 12 && fH.day >= 1 && fH.day <= 8)
      events.push({
        daysUntil: i,
        dayLabel,
        name: tx(
          lang,
          `${fH.day}e Dhul-Hijjah`,
          `${fH.day}th Dhul-Hijjah`,
          `${fH.day} ذو الحجة`,
        ),
        fasting: "recommended",
        preparation: tx(
          lang,
          "Goede daden; takbier; geen nagels knippen",
          "Good deeds; takbeer; no cutting nails",
          "أعمال صالحة؛ تكبير؛ لا تقص الأظافر",
        ),
      });
    if (fH.month === 12 && fH.day === 10)
      events.push({
        daysUntil: i,
        dayLabel,
        name: tx(lang, "'Ied al-Adhaa", "'Ied al-Adhaa", "عيد الأضحى"),
        fasting: "prohibited",
        preparation: tx(
          lang,
          "Ghusl; mooiste kleding; niet eten tot na offer; 'Ied-gebed",
          "Ghusl; best clothes; don't eat until after sacrifice; 'Ied prayer",
          "غسل؛ أحسن الثياب؛ لا تأكل حتى تذبح؛ صلاة العيد",
        ),
      });
    if (fH.month === 12 && fH.day >= 11 && fH.day <= 13)
      events.push({
        daysUntil: i,
        dayLabel,
        name: tx(
          lang,
          `Tashreeq dag ${fH.day - 10} van 3 (${fH.day} DH)`,
          `Tashreeq day ${fH.day - 10} of 3 (${fH.day} DH)`,
          `يوم تشريق ${fH.day - 10} من ٣ (${fH.day} ذو الحجة)`,
        ),
        fasting: "prohibited",
        preparation: tx(
          lang,
          "Takbier na elk gebed; eet en drink; geniet als gezin",
          "Takbeer after every prayer; eat and drink; enjoy as family",
          "تكبير بعد كل صلاة؛ كل واشرب؛ استمتع مع العائلة",
        ),
      });
    if (fH.month === 10 && fH.day === 1)
      events.push({
        daysUntil: i,
        dayLabel,
        name: tx(lang, "'Ied al-Fitr", "'Ied al-Fitr", "عيد الفطر"),
        fasting: "prohibited",
        preparation: tx(
          lang,
          "Zakaat al-Fitr; ghusl; dadels; takbier; 'Ied-gebed",
          "Zakaat al-Fitr; ghusl; dates; takbeer; 'Ied prayer",
          "زكاة الفطر؛ غسل؛ تمر؛ تكبير؛ صلاة العيد",
        ),
      });
    if (fH.month === 10 && fH.day >= 2 && fH.day <= 7)
      events.push({
        daysUntil: i,
        dayLabel,
        name: "6 Shawwaal",
        fasting: "recommended",
      });
    if (fH.month === 9 && fH.day === 1)
      events.push({
        daysUntil: i,
        dayLabel,
        name: tx(lang, "Ramadhaan begint!", "Ramadhaan starts!", "رمضان يبدأ!"),
        fasting: "obligatory",
        preparation: tx(
          lang,
          "Niyyah; sahoor; taraawieh",
          "Niyyah; sahoor; taraaweeh",
          "نية؛ سحور؛ تراويح",
        ),
      });
    if (fH.month === 9 && fH.day === 21)
      events.push({
        daysUntil: i,
        dayLabel,
        name: tx(lang, "Laatste 10 nachten", "Last 10 nights", "العشر الأواخر"),
        preparation: tx(
          lang,
          "I'tikaaf; extra nachtgebed; du'aa",
          "I'tikaaf; extra night prayer; du'aa",
          "اعتكاف؛ قيام ليل إضافي؛ دعاء",
        ),
      });
  }
  return events;
}

function AdviceCard({
  title,
  icon,
  children,
  colors,
  accentColor,
  isRTL,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
  colors: any;
  accentColor?: string;
  isRTL?: boolean;
}) {
  const accent = accentColor || colors.primary;
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: 16,
        borderLeftWidth: isRTL ? 0 : 4,
        borderLeftColor: isRTL ? undefined : accent,
        borderRightWidth: isRTL ? 4 : 0,
        borderRightColor: isRTL ? accent : undefined,
        padding: 14,
        marginBottom: 10,
        shadowColor: "#000",
        shadowOpacity: 0.04,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
      }}
    >
      <View
        style={{
          flexDirection: isRTL ? "row-reverse" : "row",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <Text style={{ fontSize: 16, marginRight: 8 }}>{icon}</Text>
        <Text style={{ color: accent, fontSize: 13, fontWeight: "700" }}>
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

function ExpandableSection({
  title,
  children,
  defaultExpanded = false,
  colors,
  isRTL,
}: {
  title: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  colors: any;
  isRTL?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
  };
  return (
    <View style={{ marginBottom: 8 }}>
      <Pressable
        onPress={toggle}
        style={({ pressed }) => [
          {
            flexDirection: isRTL ? "row-reverse" : "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingVertical: 9,
            paddingHorizontal: 12,
            backgroundColor: colors.surface,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: colors.border,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <Text
          style={{
            color: colors.foreground,
            fontSize: 12,
            fontWeight: "600",
            flex: 1,
          }}
        >
          {title}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 10 }}>
          {expanded ? "▲" : "▼"}
        </Text>
      </Pressable>
      {expanded && (
        <View
          style={{
            paddingHorizontal: 12,
            paddingVertical: 8,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderTopWidth: 0,
            borderColor: colors.border,
            borderBottomLeftRadius: 10,
            borderBottomRightRadius: 10,
            marginTop: -1,
          }}
        >
          {children}
        </View>
      )}
    </View>
  );
}

function AdviceSectionCollapsible({
  title,
  content,
  colors,
  isRTL,
}: {
  title: string;
  content: string;
  colors: any;
  isRTL?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
  };
  return (
    <View style={{ marginBottom: 6 }}>
      <Pressable
        onPress={toggle}
        style={({ pressed }) => [
          {
            flexDirection: isRTL ? "row-reverse" : "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingVertical: 10,
            paddingHorizontal: 14,
            backgroundColor: expanded ? colors.primary + "10" : colors.surface,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: expanded ? colors.primary + "30" : colors.border,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <Text
          style={{
            color: colors.foreground,
            fontSize: 13,
            fontWeight: "700",
            flex: 1,
            textAlign: isRTL ? "right" : "left",
          }}
        >
          {title}
        </Text>
        <Text style={{ color: colors.primary, fontSize: 12 }}>
          {expanded ? "▲" : "▼"}
        </Text>
      </Pressable>
      {expanded && (
        <View
          style={{
            paddingHorizontal: 14,
            paddingVertical: 12,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderTopWidth: 0,
            borderColor: colors.border,
            borderBottomLeftRadius: 10,
            borderBottomRightRadius: 10,
            marginTop: -1,
          }}
        >
          <Text
            style={{
              color: colors.foreground,
              fontSize: 13,
              lineHeight: 22,
              textAlign: isRTL ? "right" : "left",
            }}
          >
            {content}
          </Text>
        </View>
      )}
    </View>
  );
}

/**
 * getSpouseAdvice's prompt (server/advice.ts) groups its suggestions into
 * 2-4 themed sections, each opening with "1. <heading>" on its own line and
 * "- " bulleted suggestions under it -- the same numbered-outline shape
 * treatment plans use, parsed the same way, so it renders through the same
 * collapsible-section component (AdviceSectionCollapsible) instead of one
 * flat block of text carrying literal "1." and "-" markup.
 *
 * Falls back to the plain, unparsed text when it has no real headings (older
 * cached advice predating this format, or a future prompt revert) so that
 * case still reads exactly as it always has.
 */
function SpouseAdviceSections({
  advice,
  colors,
  isRTL,
  language,
}: {
  advice: string;
  colors: any;
  isRTL?: boolean;
  language: string;
}) {
  const sections = groupIntoSections(parsePlanText(advice), language);
  if (sections.length === 1 && sections[0].synthetic) {
    return (
      <Text
        style={{
          color: colors.foreground,
          fontSize: 13,
          lineHeight: 20,
          textAlign: isRTL ? "right" : "left",
        }}
      >
        {advice}
      </Text>
    );
  }
  return (
    <View style={{ gap: 4 }}>
      {sections.map((sec, idx) => (
        <AdviceSectionCollapsible
          key={idx}
          title={sec.title}
          content={sec.blocks
            .map((b) => ("text" in b ? (b.type === "task" ? `• ${b.text}` : b.text) : ""))
            .filter(Boolean)
            .join("\n")}
          colors={colors}
          isRTL={isRTL}
        />
      ))}
    </View>
  );
}

function DayDetailCard({
  info,
  colors,
  lang,
  isRTL,
}: {
  info: DayInfo;
  colors: any;
  lang: Lang;
  isRTL?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
  };
  const chipColor =
    info.fasting === "prohibited"
      ? colors.error
      : info.fasting === "recommended"
        ? colors.success
        : info.fasting === "obligatory"
          ? colors.primary
          : colors.muted;
  const chipLabel =
    info.fasting === "prohibited"
      ? tx(lang, "Vasten haraam", "Fasting prohibited", "الصيام حرام")
      : info.fasting === "recommended"
        ? tx(lang, "Vasten soennah", "Fasting sunnah", "الصيام سنة")
        : info.fasting === "obligatory"
          ? tx(lang, "Vasten verplicht", "Fasting obligatory", "الصيام واجب")
          : null;

  return (
    <View style={{ marginBottom: 6 }}>
      <Pressable
        onPress={toggle}
        style={({ pressed }) => [
          {
            flexDirection: isRTL ? "row-reverse" : "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingVertical: 8,
            paddingHorizontal: 10,
            backgroundColor: colors.surface,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: chipColor + "40",
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: colors.foreground,
              fontSize: 12,
              fontWeight: "700",
            }}
          >
            {info.name}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 10, marginTop: 2 }}>
            {info.reward}
          </Text>
        </View>
        {chipLabel && (
          <View
            style={{
              backgroundColor: chipColor + "18",
              borderRadius: 8,
              paddingHorizontal: 6,
              paddingVertical: 2,
              marginLeft: 6,
            }}
          >
            <Text style={{ color: chipColor, fontSize: 8, fontWeight: "700" }}>
              {chipLabel}
            </Text>
          </View>
        )}
        <Text style={{ color: colors.muted, fontSize: 10, marginLeft: 6 }}>
          {expanded ? "▲" : "▼"}
        </Text>
      </Pressable>
      {expanded && (
        <View
          style={{
            paddingHorizontal: 12,
            paddingVertical: 8,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderTopWidth: 0,
            borderColor: chipColor + "40",
            borderBottomLeftRadius: 10,
            borderBottomRightRadius: 10,
            marginTop: -1,
          }}
        >
          <Text
            style={{
              color: colors.foreground,
              fontSize: 10,
              fontWeight: "600",
              marginBottom: 3,
            }}
          >
            {tx(lang, "Waarom bijzonder:", "Why special:", "لماذا مميز:")}
          </Text>
          <Text
            style={{
              color: colors.foreground,
              fontSize: 10,
              lineHeight: 15,
              marginBottom: 6,
            }}
          >
            {info.reason}
          </Text>
          <Text
            style={{
              color: colors.primary,
              fontSize: 10,
              fontWeight: "600",
              marginBottom: 3,
            }}
          >
            {tx(lang, "Bewijs:", "Evidence:", "الدليل:")}
          </Text>
          <Text
            style={{
              color: colors.muted,
              fontSize: 10,
              lineHeight: 15,
              fontStyle: "italic",
              marginBottom: 6,
            }}
          >
            {info.evidence}
          </Text>
          {info.preparation && (
            <>
              <Text
                style={{
                  color: "#7c3aed",
                  fontSize: 10,
                  fontWeight: "600",
                  marginBottom: 3,
                  marginTop: 6,
                }}
              >
                {tx(lang, "Voorbereiding:", "Preparation:", "التحضير:")}
              </Text>
              <Text
                style={{
                  color: colors.foreground,
                  fontSize: 10,
                  lineHeight: 15,
                  marginBottom: 6,
                }}
              >
                {info.preparation}
              </Text>
            </>
          )}
          {info.parentAction && (
            <>
              <Text
                style={{
                  color: colors.success,
                  fontSize: 10,
                  fontWeight: "600",
                  marginBottom: 3,
                }}
              >
                {tx(
                  lang,
                  "Actie voor ouders:",
                  "Action for parents:",
                  "إجراء للوالدين:",
                )}
              </Text>
              <Text
                style={{
                  color: colors.foreground,
                  fontSize: 10,
                  lineHeight: 15,
                }}
              >
                {info.parentAction}
              </Text>
            </>
          )}
        </View>
      )}
    </View>
  );
}

function StatusBadge({
  label,
  status,
  colors,
  isRTL,
}: {
  label: string;
  status: "good" | "warning" | "neutral";
  colors: any;
  isRTL?: boolean;
}) {
  const textColor =
    status === "good"
      ? colors.success
      : status === "warning"
        ? colors.warning
        : colors.muted;
  const bgColor = textColor + "15";
  const icon = status === "good" ? "✓" : status === "warning" ? "!" : "•";
  return (
    <View
      style={{
        flexDirection: isRTL ? "row-reverse" : "row",
        alignItems: "center",
        backgroundColor: bgColor,
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 4,
      }}
    >
      <Text style={{ fontSize: 9, marginRight: 3, color: textColor }}>
        {icon}
      </Text>
      <Text style={{ fontSize: 10, fontWeight: "500", color: textColor }}>
        {label}
      </Text>
    </View>
  );
}

export default function FamilyScreen() {
  const { t, language, isRTL } = useI18n();
  const lang = language as Lang;
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { state, loading, removeChild, rehydrateFromServer } = useAppState();
  const { isAuthenticated } = useAuth();
  const myIdQuery = trpc.links.getMyId.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchOnMount: "always",
  });
  const coParentsQuery = trpc.links.coParents.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchOnMount: "always",
    staleTime: 0,
  });
  const partnerProfileQuery = trpc.links.getPartnerProfile.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchOnMount: "always",
    staleTime: 0,
  });
  // Narrowed once here so every full-only-field read below (including
  // inside IIFE callbacks, where control-flow narrowing on `.access`
  // doesn't reach) goes through a properly typed value instead of the raw
  // union — see isFullPartnerProfile.
  const fullPartnerProfile = isFullPartnerProfile(partnerProfileQuery.data)
    ? partnerProfileQuery.data
    : null;
  const shareProgressMutation = trpc.links.shareWeeklyProgress.useMutation();
  const syncMutation = trpc.links.syncWithPartner.useMutation();

  // Auto-refetch partner data when authentication state changes
  useEffect(() => {
    if (isAuthenticated) {
      coParentsQuery.refetch();
      partnerProfileQuery.refetch();
      myIdQuery.refetch();
    }
  }, [isAuthenticated]);

  // Compute year keys for all children and fetch data from server
  const familyChildYearKeys = useMemo(() => {
    return (state?.children || []).map((child) => {
      const age = child.birthDate ? calculateAgeInWeeks(child.birthDate) : null;
      return age ? `Jaar ${age.years}` : "Jaar 0";
    });
  }, [state?.children]);
  const familyYearDataMap = useMultipleYearData(familyChildYearKeys);
  const [dayInfoList, setDayInfoList] = useState<DayInfo[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([]);
  const [llmAdvice, setLlmAdvice] = useState<string | null>(null);
  const [llmSections, setLlmSections] = useState<
    { title: string; icon?: string; content: string }[]
  >([]);
  const [llmLoading, setLlmLoading] = useState(false);
  const [spouseAdvice, setSpouseAdvice] = useState<{
    advice: string;
    tips: string[];
  } | null>(null);
  const [spouseAdviceLoading, setSpouseAdviceLoading] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState<"success" | "info" | "error">(
    "success",
  );
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [qrValue, setQrValue] = useState("");
  const [qrLabel, setQrLabel] = useState("");
  const showQr = (value: string, label: string) => {
    setQrValue(value);
    setQrLabel(label);
    setQrModalVisible(true);
  };
  const showToast = (
    msg: string,
    type: "success" | "info" | "error" = "success",
  ) => {
    setToastMessage(msg);
    setToastType(type);
    setToastVisible(true);
  };

  useEffect(() => {
    const now = new Date();
    const hijri = gregorianToHijri(now);
    setDayInfoList(
      getParentDayInfo(hijri.month, hijri.day, now.getDay(), lang),
    );
    setUpcomingEvents(getUpcomingEvents(now, lang));
  }, [language]);

  useEffect(() => {
    if (state.parentProfileCompleted) {
      loadCachedFamilyAdvice();
    }
  }, [state.parentProfileCompleted, language]);

  async function loadCachedFamilyAdvice() {
    try {
      const cacheKey = `family_advice_${language}`;
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        const { advice, sections, timestamp, calendarWeek } =
          JSON.parse(cached);
        // Calculate current calendar week (ISO week number)
        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const currentCalendarWeek = Math.ceil(
          ((now.getTime() - startOfYear.getTime()) / 86400000 +
            startOfYear.getDay() +
            1) /
            7,
        );
        // Cache is valid if same calendar week (or if calendarWeek not stored yet, fallback to 7-day check)
        const isSameWeek = calendarWeek
          ? calendarWeek === currentCalendarWeek
          : (Date.now() - timestamp) / (1000 * 60 * 60) < 168;
        if (isSameWeek && (advice || (sections && sections.length > 0))) {
          setLlmAdvice(advice);
          if (sections) setLlmSections(sections);
          return;
        }
      }
    } catch (e) {}
    // Clear stale caches from other languages
    try {
      const allLangs = ["nl", "en", "ar"];
      for (const l of allLangs) {
        if (l !== language) await AsyncStorage.removeItem(`family_advice_${l}`);
      }
    } catch (_) {}
    fetchParentAdvice();
  }

  async function fetchParentAdvice() {
    setLlmLoading(true);
    try {
      const now = new Date();
      const hijri = gregorianToHijri(now);
      const month = now.getMonth();
      const season =
        lang === "ar"
          ? month >= 2 && month <= 4
            ? "ربيع"
            : month >= 5 && month <= 7
              ? "صيف"
              : month >= 8 && month <= 10
                ? "خريف"
                : "شتاء"
          : lang === "en"
            ? month >= 2 && month <= 4
              ? "Spring"
              : month >= 5 && month <= 7
                ? "Summer"
                : month >= 8 && month <= 10
                  ? "Autumn"
                  : "Winter"
            : month >= 2 && month <= 4
              ? "Lente"
              : month >= 5 && month <= 7
                ? "Zomer"
                : month >= 8 && month <= 10
                  ? "Herfst"
                  : "Winter";
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);
      const response = await authedFetch(`/api/advice/general`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          parentProfile: state.parentProfile,
          childrenCount: state.children.length,
          childrenAges: state.children.map((c) => {
            if (!c.birthDate)
              return tx(lang, "onbekend", "unknown", "غير معروف");
            return `${c.name}: ${now.getFullYear() - new Date(c.birthDate).getFullYear()} ${tx(lang, "jaar", "years", "سنة")}`;
          }),
          childrenDetails: state.children.map((c) => {
            const env = state.environments.find((e) => e.childId === c.id);
            return {
              name: c.name,
              gender: c.gender,
              birthDate: c.birthDate,
              environment: env
                ? {
                    education: env.education,
                    islamicEducation: env.islamicEducation,
                    friends: env.friends,
                    mediaUse: env.mediaUse,
                    goodThinking: env.goodThinking,
                    goodFeeling: env.goodFeeling,
                    goodSpeaking: env.goodSpeaking,
                    goodDoing: env.goodDoing,
                    badThinking: env.badThinking,
                    badFeeling: env.badFeeling,
                    badSpeaking: env.badSpeaking,
                    badDoing: env.badDoing,
                  }
                : null,
            };
          }),
          adviceType: "per_child",
          season,
          islamicContext: dayInfoList.map((d) => d.name).join("; "),
          location:
            state.locationSettings?.city ||
            (state.parentProfile as any).city ||
            "Nederland",
          gpsEnabled: state.locationSettings?.gpsEnabled || false,
          language,
          hijriMonth: hijri.month,
          hijriDay: hijri.day,
          dayOfWeek: now.getDay(),
        }),
      });
      clearTimeout(timeoutId);
      const data = await response.json();
      const adviceText = data.advice || null;
      const sections = data.sections || [];
      setLlmAdvice(adviceText);
      setLlmSections(sections);
      if (adviceText || sections.length > 0) {
        const cacheKey = `family_advice_${language}`;
        const startOfYear = new Date(new Date().getFullYear(), 0, 1);
        const currentCalendarWeek = Math.ceil(
          ((Date.now() - startOfYear.getTime()) / 86400000 +
            startOfYear.getDay() +
            1) /
            7,
        );
        await AsyncStorage.setItem(
          cacheKey,
          JSON.stringify({
            advice: adviceText,
            sections,
            timestamp: Date.now(),
            calendarWeek: currentCalendarWeek,
          }),
        );
      }
    } catch (e) {
      try {
        const cacheKey = `family_advice_${language}`;
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) {
          const { advice } = JSON.parse(cached);
          if (advice) {
            setLlmAdvice(advice);
            return;
          }
        }
      } catch (e2) {}
      setLlmAdvice(null);
    } finally {
      setLlmLoading(false);
    }
  }

  async function fetchSpouseAdvice() {
    if (!isAuthenticated) return;
    setSpouseAdviceLoading(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000);
      const response = await authedFetch(`/api/advice/getSpouseAdvice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ language }),
      });
      clearTimeout(timeoutId);
      const data = await response.json();
      if (data?.result?.data) {
        const result = data.result.data;
        setSpouseAdvice({
          advice: result.advice || "",
          tips: result.tips || [],
        });
        const startOfYear = new Date(new Date().getFullYear(), 0, 1);
        const currentCalendarWeek = Math.ceil(
          ((Date.now() - startOfYear.getTime()) / 86400000 +
            startOfYear.getDay() +
            1) /
            7,
        );
        await AsyncStorage.setItem(
          `spouse_advice_${language}`,
          JSON.stringify({
            ...result,
            timestamp: Date.now(),
            calendarWeek: currentCalendarWeek,
          }),
        );
      }
    } catch (e) {
      try {
        const cached = await AsyncStorage.getItem(`spouse_advice_${language}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          setSpouseAdvice({
            advice: parsed.advice || "",
            tips: parsed.tips || [],
          });
        }
      } catch (e2) {}
    } finally {
      setSpouseAdviceLoading(false);
    }
  }

  // Load cached spouse advice on mount
  useEffect(() => {
    if (isAuthenticated && state.parentProfileCompleted) {
      AsyncStorage.getItem(`spouse_advice_${language}`).then((cached) => {
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            // Week-based cache: valid until calendar week changes
            const now = new Date();
            const startOfYear = new Date(now.getFullYear(), 0, 1);
            const currentCalendarWeek = Math.ceil(
              ((now.getTime() - startOfYear.getTime()) / 86400000 +
                startOfYear.getDay() +
                1) /
                7,
            );
            const isSameWeek = parsed.calendarWeek
              ? parsed.calendarWeek === currentCalendarWeek
              : (Date.now() - (parsed.timestamp || 0)) / 3600000 < 168;
            if (isSameWeek && (parsed.advice || parsed.tips?.length > 0)) {
              setSpouseAdvice({
                advice: parsed.advice || "",
                tips: parsed.tips || [],
              });
            }
          } catch (e) {}
        }
      });
    }
  }, [isAuthenticated, state.parentProfileCompleted, language]);

  if (loading) {
    return (
      <View
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: colors.background }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  if (!isProfileComplete({ parentProfile: state.parentProfile, children: state.children })) {
    setTimeout(() => router.replace("/onboarding"), 0);
    return (
      <View
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: colors.background }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  if (!state.parentProfileCompleted) {
    return (
      <View
        className="flex-1 justify-center px-6"
        style={{ backgroundColor: colors.background, paddingTop: insets.top }}
      >
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: 20,
            padding: 24,
            borderWidth: 1,
            borderColor: colors.primary + "40",
          }}
        >
          <Text
            style={{
              color: colors.foreground,
              fontSize: 18,
              fontWeight: "800",
              marginBottom: 8,
            }}
          >
            {tx(
              lang,
              "Vul eerst uw profiel in",
              "Fill in your profile first",
              "أكمل ملفك الشخصي أولاً",
            )}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 16 }}>
            {tx(
              lang,
              "Nodig voor adviezen op maat.",
              "Required for personalized advice.",
              "مطلوب للنصائح المخصصة.",
            )}
          </Text>
          <Pressable
            onPress={() => router.push("/onboarding/parent-profile")}
            style={({ pressed }) => [
              {
                backgroundColor: colors.primary,
                borderRadius: 10,
                paddingVertical: 12,
                alignItems: "center" as const,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>
              {tx(lang, "Invullen", "Fill in", "أكمل")}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const pp = state.parentProfile as any;


  function translateValue(val: string | string[] | undefined): string {
    if (!val || (Array.isArray(val) && val.length === 0)) return "—";
    return translateProfileValue(val, lang);
  }

  const analysisItems: {
    label: string;
    status: "good" | "warning" | "neutral";
  }[] = [];
  if (pp.prayer === "altijd_5")
    analysisItems.push({
      label: tx(lang, "Gebed", "Prayer", "الصلاة"),
      status: "good",
    });
  else if (pp.prayer)
    analysisItems.push({
      label: tx(lang, "Gebed", "Prayer", "الصلاة"),
      status: "warning",
    });
  if (pp.fajr === "altijd_op_tijd")
    analysisItems.push({
      label: tx(lang, "Fajr", "Fajr", "الفجر"),
      status: "good",
    });
  else if (pp.fajr)
    analysisItems.push({
      label: tx(lang, "Fajr", "Fajr", "الفجر"),
      status: "warning",
    });
  if (pp.familyScience === "ja_volledig")
    analysisItems.push({
      label: tx(lang, "Gezinskunde", "Family science", "علم الأسرة"),
      status: "good",
    });
  else
    analysisItems.push({
      label: tx(lang, "Gezinskunde", "Family science", "علم الأسرة"),
      status: "warning",
    });
  if (pp.hijab)
    analysisItems.push({
      label: tx(lang, "Hijaab", "Hijab", "الحجاب"),
      status: pp.hijab === "ja_volledig" ? "good" : "warning",
    });
  if (pp.partnerRelationQuality) {
    const good =
      pp.partnerRelationQuality.toLowerCase().includes("goed") ||
      pp.partnerRelationQuality.toLowerCase().includes("sterk");
    analysisItems.push({
      label: tx(lang, "Partner", "Partner", "الشريك"),
      status: good ? "good" : "warning",
    });
  }

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top }}>
        <DateTimeHeader />
      </View>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingTop: 10,
          paddingBottom: insets.bottom + 100,
          paddingHorizontal: 16,
        }}
      >
        <View
          style={{
            flexDirection: isRTL ? "row-reverse" : "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <View
            style={{
              flexDirection: isRTL ? "row-reverse" : "row",
              alignItems: "center",
              gap: 10,
            }}
          >
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                backgroundColor:
                  pp.gender === "vrouw" ? "#AD145715" : "#0277BD15",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 20 }}>
                {pp.gender === "vrouw" ? "🧕" : "🧔"}
              </Text>
            </View>
            <View>
              <Text
                style={{
                  color: colors.foreground,
                  fontSize: 18,
                  fontWeight: "800",
                }}
              >
                {t("tabs.family")}
              </Text>
              {pp.firstName ? (
                <Text style={{ color: colors.muted, fontSize: 11 }}>
                  {pp.firstName} {pp.lastName || ""}
                </Text>
              ) : null}
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <Pressable
              onPress={() => {
                syncMutation.mutate(undefined, {
                  onSuccess: async (res: any) => {
                    if (res?.success) {
                      const m = res.merged;
                      const total =
                        (m?.children || 0) +
                        (m?.environments || 0) +
                        (m?.issues || 0) +
                        (m?.actionPlans || 0);
                      await rehydrateFromServer();
                      // Save sync report
                      try {
                        const report = {
                          timestamp: new Date().toISOString(),
                          merged: m,
                          total,
                        };
                        const existing =
                          await AsyncStorage.getItem("sync_reports");
                        const reports = existing ? JSON.parse(existing) : [];
                        reports.unshift(report);
                        await AsyncStorage.setItem(
                          "sync_reports",
                          JSON.stringify(reports.slice(0, 50)),
                        );
                      } catch {}
                      if (total > 0) {
                        const parts: string[] = [];
                        if (m?.children)
                          parts.push(
                            lang === "ar"
                              ? `${m.children} \u0637\u0641\u0644`
                              : lang === "en"
                                ? `${m.children} child(ren)`
                                : `${m.children} kind(eren)`,
                          );
                        if (m?.environments)
                          parts.push(
                            lang === "ar"
                              ? `${m.environments} \u0628\u064a\u0626\u0629`
                              : lang === "en"
                                ? `${m.environments} environment(s)`
                                : `${m.environments} omgeving(en)`,
                          );
                        if (m?.issues)
                          parts.push(
                            lang === "ar"
                              ? `${m.issues} \u0645\u0634\u0643\u0644\u0629`
                              : lang === "en"
                                ? `${m.issues} issue(s)`
                                : `${m.issues} probleem/problemen`,
                          );
                        if (m?.actionPlans)
                          parts.push(
                            lang === "ar"
                              ? `${m.actionPlans} \u062e\u0637\u0629 \u0639\u0644\u0627\u062c`
                              : lang === "en"
                                ? `${m.actionPlans} plan(s)`
                                : `${m.actionPlans} actieplan(nen)`,
                          );
                        const detail = parts.join(" + ");
                        showToast(
                          lang === "ar"
                            ? `\u062a\u0645\u062a \u0627\u0644\u0645\u0632\u0627\u0645\u0646\u0629: ${detail}`
                            : lang === "en"
                              ? `Synced: ${detail}`
                              : `Gesynchroniseerd: ${detail}`,
                          "success",
                        );
                      } else {
                        showToast(
                          tx(
                            lang,
                            "Alles is up-to-date",
                            "Everything is up-to-date",
                            "\u0643\u0644 \u0634\u064a\u0621 \u0645\u062d\u062f\u0651\u062b",
                          ),
                          "info",
                        );
                      }
                    } else {
                      // The access gate makes syncWithPartner return
                      // success:false where it used to succeed (ungated wife,
                      // unconfirmed partnership, unresolvable gender). Without
                      // this branch that lands in the same silence as success
                      // and the button reads as dead — the defect fe9cf3a fixed
                      // on Subscribe. ponytail: one wording for every refusal;
                      // res.message is English-only, and the specific
                      // permission state already has a home on spouse-profile.
                      showToast(
                        tx(
                          lang,
                          "Synchroniseren is niet gelukt",
                          "Could not sync",
                          "تعذّرت المزامنة",
                        ),
                        "info",
                      );
                    }
                  },
                });
              }}
              style={({ pressed }) => [
                {
                  backgroundColor: "#E8F5E9",
                  borderRadius: 8,
                  paddingHorizontal: 8,
                  paddingVertical: 5,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <MaterialIcons name="sync" size={16} color="#1B4332" />
            </Pressable>
            <Pressable
              onPress={() => router.push("/(tabs)/messages" as any)}
              style={({ pressed }) => [
                {
                  backgroundColor: colors.primary + "15",
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text
                style={{
                  color: colors.primary,
                  fontSize: 10,
                  fontWeight: "600",
                }}
              >
                {tx(lang, "Berichten", "Messages", "الرسائل")}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/(tabs)/family-hub" as any)}
              style={({ pressed }) => [
                {
                  backgroundColor: colors.primary + "15",
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text
                style={{
                  color: colors.primary,
                  fontSize: 10,
                  fontWeight: "600",
                }}
              >
                {tx(lang, "Gezinsbeheer", "Family Hub", "إدارة الأسرة")}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/onboarding/parent-profile")}
              style={({ pressed }) => [
                {
                  backgroundColor: colors.primary + "15",
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text
                style={{
                  color: colors.primary,
                  fontSize: 10,
                  fontWeight: "600",
                }}
              >
                {t("settings.edit_btn")}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Parent ID Card / Login prompt */}
        {!isAuthenticated && (
          <Pressable
            onPress={() => router.push("/login" as any)}
            style={({ pressed }) => [
              {
                backgroundColor: colors.primary + "08",
                borderRadius: 12,
                padding: 14,
                marginBottom: 12,
                borderWidth: 1,
                borderColor: colors.primary + "30",
                flexDirection: isRTL ? "row-reverse" : "row",
                alignItems: "center",
                gap: 10,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: colors.primary + "15",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <MaterialIcons name="login" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: colors.foreground,
                  fontSize: 13,
                  fontWeight: "600",
                  textAlign: isRTL ? "right" : "left",
                }}
              >
                {tx(
                  lang,
                  "Inloggen voor synchronisatie",
                  "Sign in for sync",
                  "تسجيل الدخول للمزامنة",
                )}
              </Text>
              <Text
                style={{
                  color: colors.muted,
                  fontSize: 11,
                  textAlign: isRTL ? "right" : "left",
                }}
              >
                {tx(
                  lang,
                  "Log in om gegevens te delen met uw partner",
                  "Sign in to share data with your partner",
                  "سجّل الدخول لمشاركة البيانات مع شريكك",
                )}
              </Text>
            </View>
            <MaterialIcons
              name={isRTL ? "chevron-left" : "chevron-right"}
              size={20}
              color={colors.muted}
            />
          </Pressable>
        )}
        {isAuthenticated && myIdQuery.data?.publicId && (
          <Pressable
            onPress={() => router.push("/network" as any)}
            style={({ pressed }) => [
              {
                backgroundColor: colors.primary + "08",
                borderRadius: 12,
                padding: 12,
                marginBottom: 12,
                borderWidth: 1,
                borderColor: colors.primary + "30",
                flexDirection: isRTL ? "row-reverse" : "row",
                alignItems: "center",
                justifyContent: "space-between",
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <View
              style={{
                flexDirection: isRTL ? "row-reverse" : "row",
                alignItems: "center",
                gap: 10,
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: colors.primary + "15",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: 16 }}>🆔</Text>
              </View>
              <View>
                <Text style={{ color: colors.muted, fontSize: 10 }}>
                  {tx(lang, "Mijn ID", "My ID", "هويتي")}
                </Text>
                <Text
                  style={{
                    color: colors.primary,
                    fontSize: 14,
                    fontWeight: "800",
                    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                    letterSpacing: 1,
                  }}
                >
                  {myIdQuery.data.publicId}
                </Text>
              </View>
            </View>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <Pressable
                onPress={() =>
                  showQr(
                    myIdQuery.data!.publicId!,
                    tx(lang, "Mijn QR-code", "My QR Code", "رمز QR الخاص بي"),
                  )
                }
                style={({ pressed }) => [
                  {
                    opacity: pressed ? 0.7 : 1,
                    backgroundColor: colors.primary + "20",
                    borderRadius: 8,
                    padding: 6,
                  },
                ]}
              >
                <MaterialIcons
                  name="qr-code"
                  size={18}
                  color={colors.primary}
                />
              </Pressable>
              <Text
                style={{
                  color: colors.primary,
                  fontSize: 11,
                  fontWeight: "600",
                }}
              >
                {tx(
                  lang,
                  "Netwerk \u2192",
                  "Network \u2192",
                  "\u0627\u0644\u0634\u0628\u0643\u0629 \u2192",
                )}
              </Text>
            </View>
          </Pressable>
        )}

        {dayInfoList.length > 0 && (
          <AdviceCard
            title={tx(
              lang,
              "Vandaag — voor ouders",
              "Today — for parents",
              "اليوم — للوالدين",
            )}
            icon="📅"
            colors={colors}
            accentColor="#059669"
            isRTL={isRTL}
          >
            {dayInfoList.map((info, idx) => (
              <DayDetailCard
                key={idx}
                info={info}
                colors={colors}
                lang={lang}
                isRTL={isRTL}
              />
            ))}
          </AdviceCard>
        )}

        <AdviceCard
          title={tx(lang, "Analyse", "Analysis", "التحليل")}
          icon="📊"
          colors={colors}
          isRTL={isRTL}
        >
          <View
            style={{
              flexDirection: isRTL ? "row-reverse" : "row",
              flexWrap: "wrap",
              gap: 6,
            }}
          >
            {analysisItems.map((item, idx) => (
              <StatusBadge
                key={idx}
                label={item.label}
                status={item.status}
                colors={colors}
                isRTL={isRTL}
              />
            ))}
          </View>
        </AdviceCard>

        <ExpandableSection
          title={tx(
            lang,
            "Persoonlijk advies per kind",
            "Personal advice per child",
            "نصائح شخصية لكل ابن",
          )}
          colors={colors}
          isRTL={isRTL}
          defaultExpanded={true}
        >
          {llmLoading ? (
            <View style={{ alignItems: "center", paddingVertical: 12 }}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={{ color: colors.muted, fontSize: 10, marginTop: 6 }}>
                {tx(
                  lang,
                  "Even geduld...",
                  "Please wait...",
                  "جارٍ إعداد نصيحتك...",
                )}
              </Text>
            </View>
          ) : llmSections.length > 0 ? (
            <View style={{ gap: 4 }}>
              {llmSections.map((sec, idx) => (
                <AdviceSectionCollapsible
                  key={idx}
                  title={sec.title}
                  content={sec.content}
                  colors={colors}
                  isRTL={isRTL}
                />
              ))}
              <ReportAiContent
                content={llmSections
                  .map((section) => `${section.title}\n${section.content}`)
                  .join("\n\n")}
                surface="family-parent-advice-sections"
              />
            </View>
          ) : llmAdvice ? (
            <View>
              <Text
                style={{
                  color: colors.foreground,
                  fontSize: 13,
                  lineHeight: 20,
                  textAlign: isRTL ? "right" : "left",
                }}
              >
                {llmAdvice}
              </Text>
              <ReportAiContent
                content={llmAdvice}
                surface="family-parent-advice"
              />
            </View>
          ) : (
            <Text style={{ color: colors.muted, fontSize: 11 }}>
              {tx(
                lang,
                "Tik Vernieuw voor advies.",
                "Tap Refresh for advice.",
                "اضغط تحديث للحصول على نصيحة.",
              )}
            </Text>
          )}
        </ExpandableSection>

        {upcomingEvents.length > 0 && (
          <ExpandableSection
            title={tx(
              lang,
              `Komende 10 dagen (${upcomingEvents.length})`,
              `Next 10 days (${upcomingEvents.length})`,
              `الأيام العشر القادمة (${upcomingEvents.length})`,
            )}
            colors={colors}
            isRTL={isRTL}
            defaultExpanded={true}
          >
            {upcomingEvents.map((ev, idx) => {
              const chipColor =
                ev.fasting === "prohibited"
                  ? colors.error
                  : ev.fasting === "recommended"
                    ? colors.success
                    : colors.primary;
              return (
                <View
                  key={idx}
                  style={{
                    flexDirection: isRTL ? "row-reverse" : "row",
                    alignItems: "flex-start",
                    paddingVertical: 5,
                    borderBottomWidth:
                      idx < upcomingEvents.length - 1 ? 0.5 : 0,
                    borderBottomColor: colors.border,
                  }}
                >
                  <View style={{ width: 24, alignItems: "center" }}>
                    <Text
                      style={{
                        color: colors.muted,
                        fontSize: 9,
                        fontWeight: "700",
                      }}
                    >
                      +{ev.daysUntil}
                    </Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 6 }}>
                    <View
                      style={{
                        flexDirection: isRTL ? "row-reverse" : "row",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <Text
                        style={{
                          color: colors.foreground,
                          fontSize: 11,
                          fontWeight: "600",
                        }}
                      >
                        {ev.name}
                      </Text>
                      {ev.fasting && (
                        <View
                          style={{
                            backgroundColor: chipColor + "18",
                            borderRadius: 6,
                            paddingHorizontal: 5,
                            paddingVertical: 1,
                          }}
                        >
                          <Text
                            style={{
                              color: chipColor,
                              fontSize: 7,
                              fontWeight: "700",
                            }}
                          >
                            {ev.fasting === "prohibited"
                              ? "⛔"
                              : ev.fasting === "recommended"
                                ? "✓"
                                : "●"}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text
                      style={{ color: colors.muted, fontSize: 9, marginTop: 1 }}
                    >
                      {ev.dayLabel}
                    </Text>
                    {ev.preparation && (
                      <Text
                        style={{
                          color: colors.primary,
                          fontSize: 9,
                          marginTop: 2,
                          fontStyle: "italic",
                        }}
                      >
                        {ev.preparation}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </ExpandableSection>
        )}

        <ExpandableSection
          title={tx(lang, "Profiel", "Profile", "الملف الشخصي")}
          colors={colors}
          isRTL={isRTL}
        >
          <InfoRow
            label={tx(lang, "Gebed", "Prayer", "الصلاة")}
            value={translateValue(pp.prayer)}
            colors={colors}
            isRTL={isRTL}
          />
          <InfoRow
            label={tx(lang, "Fajr", "Fajr", "الفجر")}
            value={translateValue(pp.fajr)}
            colors={colors}
            isRTL={isRTL}
          />
          <InfoRow
            label={tx(lang, "Hijaab", "Hijab", "الحجاب")}
            value={translateValue(pp.hijab)}
            colors={colors}
            isRTL={isRTL}
          />
          <InfoRow
            label={tx(lang, "Kennis", "Knowledge", "المعرفة")}
            value={translateValue(pp.knowledgeSource)}
            colors={colors}
            isRTL={isRTL}
          />
          <InfoRow
            label={tx(lang, "Gezinskunde", "Family science", "علم الأسرة")}
            value={translateValue(pp.familyScience)}
            colors={colors}
            isRTL={isRTL}
          />
          <InfoRow
            label={tx(lang, "Onderwijs", "Education", "التعليم")}
            value={translateValue(pp.schoolType)}
            colors={colors}
            isRTL={isRTL}
          />
        </ExpandableSection>

        <Pressable
          onPress={() => {
            fetchParentAdvice();
            fetchSpouseAdvice();
          }}
          style={({ pressed }) => [
            {
              backgroundColor: colors.primary,
              borderRadius: 10,
              paddingVertical: 11,
              alignItems: "center",
              opacity: pressed ? 0.85 : 1,
              marginTop: 4,
              marginBottom: 14,
            },
          ]}
        >
          <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>
            {tx(lang, "Vernieuw", "Refresh", "تحديث")}
          </Text>
        </Pressable>

        {/* Spouse Advice Section */}
        {isAuthenticated && (
          <ExpandableSection
            title={tx(
              lang,
              "Acties voor uw partner",
              "Actions for your spouse",
              "اقتراحات لشريك حياتك",
            )}
            colors={colors}
            isRTL={isRTL}
            defaultExpanded={false}
          >
            {spouseAdviceLoading ? (
              <View style={{ alignItems: "center", paddingVertical: 12 }}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text
                  style={{ color: colors.muted, fontSize: 10, marginTop: 6 }}
                >
                  {tx(
                    lang,
                    "Even geduld...",
                    "Please wait...",
                    "جارٍ التحليل...",
                  )}
                </Text>
              </View>
            ) : spouseAdvice ? (
              <View style={{ gap: 8 }}>
                {spouseAdvice.advice ? (
                  <SpouseAdviceSections
                    advice={spouseAdvice.advice}
                    colors={colors}
                    isRTL={isRTL}
                    language={language}
                  />
                ) : null}
                {spouseAdvice.tips && spouseAdvice.tips.length > 0 ? (
                  <View style={{ gap: 4, marginTop: 4 }}>
                    {spouseAdvice.tips.map((tip, idx) => (
                      <View
                        key={idx}
                        style={{
                          flexDirection: isRTL ? "row-reverse" : "row",
                          gap: 6,
                          alignItems: "flex-start",
                        }}
                      >
                        <Text
                          style={{
                            color: colors.primary,
                            fontSize: 12,
                            fontWeight: "700",
                          }}
                        >
                          •
                        </Text>
                        <Text
                          style={{
                            color: colors.foreground,
                            fontSize: 12,
                            lineHeight: 18,
                            flex: 1,
                            textAlign: isRTL ? "right" : "left",
                          }}
                        >
                          {tip}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                <ReportAiContent
                  content={[spouseAdvice.advice, ...spouseAdvice.tips]
                    .filter(Boolean)
                    .join("\n")}
                  surface="family-spouse-advice"
                />
              </View>
            ) : (
              <Text
                style={{
                  color: colors.muted,
                  fontSize: 11,
                  textAlign: isRTL ? "right" : "left",
                }}
              >
                {tx(
                  lang,
                  "Tik Vernieuw voor suggesties die u met uw partner kunt doen.",
                  "Tap Refresh for direct actions you can do with your spouse.",
                  "اضغط تحديث للحصول على اقتراحات عملية مع شريكك.",
                )}
              </Text>
            )}
          </ExpandableSection>
        )}

        {/* ═══════ PARTNER CARD ═══════ */}
        {isAuthenticated && (coParentsQuery.data ?? []).length > 0 && (
          <View style={{ marginBottom: 14 }}>
            <Text
              style={{
                color: colors.foreground,
                fontSize: 14,
                fontWeight: "700",
                marginBottom: 8,
                textAlign: isRTL ? "right" : "left",
              }}
            >
              {tx(lang, "Partner", "Spouse", "الزوجة")}
            </Text>
            {(coParentsQuery.data ?? []).map((cp: any) => (
              <Pressable
                key={cp.id}
                onPress={() => router.push("/(tabs)/messages" as any)}
                style={({ pressed }) => [
                  {
                    backgroundColor: colors.primary + "08",
                    borderRadius: 14,
                    padding: 14,
                    borderWidth: 1.5,
                    borderColor: colors.primary + "25",
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <View
                  style={{
                    flexDirection: isRTL ? "row-reverse" : "row",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      backgroundColor: colors.primary + "20",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ fontSize: 20 }}>
                      {pp.gender === "man" ? "🧕" : "🧔"}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        color: colors.foreground,
                        fontSize: 14,
                        fontWeight: "700",
                      }}
                    >
                      {cp.name ||
                        (cp.role === "mother"
                          ? tx(lang, "Moeder", "Mother", "الأم")
                          : tx(lang, "Vader", "Father", "الأب"))}
                    </Text>
                    <View
                      style={{
                        flexDirection: isRTL ? "row-reverse" : "row",
                        alignItems: "center",
                        gap: 6,
                        marginTop: 3,
                      }}
                    >
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: colors.success,
                        }}
                      />
                      <Text style={{ color: colors.muted, fontSize: 10 }}>
                        {tx(lang, "Verbonden", "Connected", "متصل/ة")}
                      </Text>
                      <Text style={{ color: colors.muted, fontSize: 10 }}>
                        •
                      </Text>
                      <Text style={{ color: colors.muted, fontSize: 10 }}>
                        {cp.sharedChildren?.length || 0}{" "}
                        {tx(
                          lang,
                          "gedeelde kinderen",
                          "shared children",
                          "أطفال مشتركين",
                        )}
                      </Text>
                    </View>
                  </View>
                  <View
                    style={{
                      backgroundColor: colors.primary + "15",
                      borderRadius: 8,
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                    }}
                  >
                    <Text
                      style={{
                        color: colors.primary,
                        fontSize: 10,
                        fontWeight: "600",
                      }}
                    >
                      {tx(lang, "Chat", "Chat", "محادثة")}
                    </Text>
                  </View>
                </View>
                {/* Sync button */}
                <Pressable
                  onPress={() => {
                    syncMutation.mutate(undefined, {
                      onSuccess: async (res: any) => {
                        if (res?.success) {
                          const m = res.merged;
                          const total =
                            (m?.children || 0) +
                            (m?.environments || 0) +
                            (m?.issues || 0) +
                            (m?.actionPlans || 0);
                          await rehydrateFromServer();
                          // Save sync report
                          try {
                            const report = {
                              timestamp: new Date().toISOString(),
                              merged: m,
                              total,
                            };
                            const existing =
                              await AsyncStorage.getItem("sync_reports");
                            const reports = existing
                              ? JSON.parse(existing)
                              : [];
                            reports.unshift(report);
                            await AsyncStorage.setItem(
                              "sync_reports",
                              JSON.stringify(reports.slice(0, 50)),
                            );
                          } catch {}
                          if (total > 0) {
                            const parts: string[] = [];
                            if (m?.children)
                              parts.push(
                                lang === "ar"
                                  ? `${m.children} \u0637\u0641\u0644`
                                  : lang === "en"
                                    ? `${m.children} child(ren)`
                                    : `${m.children} kind(eren)`,
                              );
                            if (m?.environments)
                              parts.push(
                                lang === "ar"
                                  ? `${m.environments} \u0628\u064a\u0626\u0629`
                                  : lang === "en"
                                    ? `${m.environments} environment(s)`
                                    : `${m.environments} omgeving(en)`,
                              );
                            if (m?.issues)
                              parts.push(
                                lang === "ar"
                                  ? `${m.issues} \u0645\u0634\u0643\u0644\u0629`
                                  : lang === "en"
                                    ? `${m.issues} issue(s)`
                                    : `${m.issues} probleem/problemen`,
                              );
                            if (m?.actionPlans)
                              parts.push(
                                lang === "ar"
                                  ? `${m.actionPlans} \u062e\u0637\u0629 \u0639\u0644\u0627\u062c`
                                  : lang === "en"
                                    ? `${m.actionPlans} plan(s)`
                                    : `${m.actionPlans} actieplan(nen)`,
                              );
                            const detail = parts.join(" + ");
                            showToast(
                              lang === "ar"
                                ? `\u062a\u0645\u062a \u0627\u0644\u0645\u0632\u0627\u0645\u0646\u0629: ${detail}`
                                : lang === "en"
                                  ? `Synced: ${detail}`
                                  : `Gesynchroniseerd: ${detail}`,
                              "success",
                            );
                          } else {
                            showToast(
                              tx(
                                lang,
                                "Alles is up-to-date",
                                "Everything is up-to-date",
                                "\u0643\u0644 \u0634\u064a\u0621 \u0645\u062d\u062f\u0651\u062b",
                              ),
                              "info",
                            );
                          }
                        } else {
                          // Second sync button, same refusal path as above.
                          showToast(
                            tx(
                              lang,
                              "Synchroniseren is niet gelukt",
                              "Could not sync",
                              "تعذّرت المزامنة",
                            ),
                            "info",
                          );
                        }
                      },
                    });
                  }}
                  style={({ pressed }) => [
                    {
                      flexDirection: isRTL ? "row-reverse" : "row",
                      alignItems: "center",
                      gap: 6,
                      marginTop: 10,
                      backgroundColor: colors.success + "12",
                      borderRadius: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  {syncMutation.isPending ? (
                    <ActivityIndicator size="small" color={colors.success} />
                  ) : (
                    <Text style={{ fontSize: 14 }}>{"\u21BB"}</Text>
                  )}
                  <Text
                    style={{
                      color: colors.success,
                      fontSize: 11,
                      fontWeight: "600",
                      flex: 1,
                      textAlign: isRTL ? "right" : "left",
                    }}
                  >
                    {syncMutation.isPending
                      ? tx(
                          lang,
                          "Synchroniseren...",
                          "Syncing...",
                          "جارٍ المزامنة...",
                        )
                      : tx(
                          lang,
                          "Synchroniseer met partner",
                          "Sync with partner",
                          "مزامنة مع الشريك/ة",
                        )}
                  </Text>
                </Pressable>
              </Pressable>
            ))}
          </View>
        )}

        {/* ═══════ WIFE PROFILE BUTTON ═══════ */}
        {isAuthenticated && partnerProfileQuery.data && (
          <Pressable
            onPress={() => router.push("/spouse-profile" as any)}
            style={({ pressed }) => [
              {
                backgroundColor: "#FFF0F5",
                borderRadius: 14,
                padding: 14,
                marginBottom: 12,
                borderWidth: 1.5,
                borderColor: "#F9A8D4",
                flexDirection: isRTL ? "row-reverse" : "row",
                alignItems: "center",
                gap: 12,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: "#F9A8D4",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <MaterialIcons name="person" size={24} color="#9D174D" />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "700",
                  color: "#9D174D",
                  textAlign: isRTL ? "right" : "left",
                }}
              >
                {/* Label follows the PARTNER's gender — a wife opening this sees
                    "my husband's profile", not "my wife's". */}
                {partnerProfileQuery.data.gender === "man"
                  ? tx(lang, "Profiel van mijn man", "My husband's profile", "ملف زوجي")
                  : partnerProfileQuery.data.gender === "vrouw"
                    ? tx(lang, "Profiel van mijn vrouw", "My wife's profile", "ملف زوجتي")
                    : tx(lang, "Profiel van mijn partner", "My partner's profile", "ملف شريكي")}
              </Text>
              <Text
                style={{
                  fontSize: 11,
                  color: "#BE185D",
                  marginTop: 2,
                  textAlign: isRTL ? "right" : "left",
                }}
              >
                {tx(
                  lang,
                  "Bekijk en bewerk het profiel",
                  "View and edit profile",
                  "عرض وتعديل الملف",
                )}
              </Text>
            </View>
            <MaterialIcons
              name={isRTL ? "chevron-left" : "chevron-right"}
              size={22}
              color="#9D174D"
            />
          </Pressable>
        )}

        {/* ═══════ PARTNER ANSWERS & INTERACTION ═══════ */}
        {/* Restricted payloads omit dailyCheckins/dailyTipCompletions/parentProfile
            entirely — gate on full access so the panel never fabricates "not
            completed" from a lack of access. Gender-only fields (the button
            above) stay safe to show either way. */}
        {isAuthenticated &&
          fullPartnerProfile && (
          <ExpandableSection
            title={tx(
              lang,
              "Activiteit partner",
              "Partner Activity",
              "نشاط الشريك/ة",
            )}
            colors={colors}
            isRTL={isRTL}
            defaultExpanded={false}
          >
            <View style={{ gap: 10 }}>
              {/* Partner's daily check-in status */}
              {(() => {
                const pCheckins = fullPartnerProfile?.dailyCheckins || [];
                const today = new Date().toISOString().slice(0, 10);
                const todayCheckin = pCheckins.find(
                  (c: any) => c.date === today,
                );
                const recentCheckins = pCheckins.filter((c: any) => {
                  const d = new Date(c.date);
                  const now = new Date();
                  return now.getTime() - d.getTime() < 7 * 24 * 60 * 60 * 1000;
                });
                return (
                  <View
                    style={{
                      backgroundColor: colors.surface,
                      borderRadius: 10,
                      padding: 10,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <Text
                      style={{
                        color: colors.foreground,
                        fontSize: 11,
                        fontWeight: "700",
                        marginBottom: 6,
                        textAlign: isRTL ? "right" : "left",
                      }}
                    >
                      {tx(
                        lang,
                        "Dagelijkse check-in",
                        "Daily Check-in",
                        "المراجعة اليومية",
                      )}
                    </Text>
                    <View
                      style={{
                        flexDirection: isRTL ? "row-reverse" : "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <View
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 12,
                          backgroundColor: todayCheckin
                            ? colors.success + "20"
                            : colors.warning + "20",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text style={{ fontSize: 12 }}>
                          {todayCheckin ? "✓" : "•"}
                        </Text>
                      </View>
                      <Text
                        style={{
                          color: todayCheckin ? colors.success : colors.muted,
                          fontSize: 11,
                          flex: 1,
                          textAlign: isRTL ? "right" : "left",
                        }}
                      >
                        {todayCheckin
                          ? tx(
                              lang,
                              "Vandaag ingevuld",
                              "Completed today",
                              "أكمل اليوم",
                            )
                          : tx(
                              lang,
                              "Nog niet ingevuld vandaag",
                              "Not completed today",
                              "لم يكمل اليوم",
                            )}
                      </Text>
                      <Text style={{ color: colors.muted, fontSize: 9 }}>
                        {recentCheckins.length}/7{" "}
                        {tx(lang, "deze week", "this week", "هذا الأسبوع")}
                      </Text>
                    </View>
                  </View>
                );
              })()}

              {/* Partner's daily tip interaction */}
              {(() => {
                const pTips = fullPartnerProfile?.dailyTipCompletions || [];
                const today = new Date().toISOString().slice(0, 10);
                const todayTips = pTips.filter((t: any) => t.date === today);
                const weekTips = pTips.filter((t: any) => {
                  const d = new Date(t.date);
                  const now = new Date();
                  return now.getTime() - d.getTime() < 7 * 24 * 60 * 60 * 1000;
                });
                return (
                  <View
                    style={{
                      backgroundColor: colors.surface,
                      borderRadius: 10,
                      padding: 10,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <Text
                      style={{
                        color: colors.foreground,
                        fontSize: 11,
                        fontWeight: "700",
                        marginBottom: 6,
                        textAlign: isRTL ? "right" : "left",
                      }}
                    >
                      {tx(
                        lang,
                        "Dagelijkse tips",
                        "Daily Tips",
                        "النصائح اليومية",
                      )}
                    </Text>
                    <View
                      style={{
                        flexDirection: isRTL ? "row-reverse" : "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <View
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 12,
                          backgroundColor:
                            todayTips.length > 0
                              ? colors.success + "20"
                              : colors.warning + "20",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text style={{ fontSize: 12 }}>
                          {todayTips.length > 0 ? "✓" : "•"}
                        </Text>
                      </View>
                      <Text
                        style={{
                          color:
                            todayTips.length > 0
                              ? colors.success
                              : colors.muted,
                          fontSize: 11,
                          flex: 1,
                          textAlign: isRTL ? "right" : "left",
                        }}
                      >
                        {todayTips.length > 0
                          ? tx(
                              lang,
                              `${todayTips.length} tip(s) voltooid vandaag`,
                              `${todayTips.length} tip(s) completed today`,
                              `${todayTips.length} نصيحة مكتملة اليوم`,
                            )
                          : tx(
                              lang,
                              "Nog geen tips voltooid vandaag",
                              "No tips completed today",
                              "لم يكمل نصائح اليوم",
                            )}
                      </Text>
                      <Text style={{ color: colors.muted, fontSize: 9 }}>
                        {weekTips.length}{" "}
                        {tx(lang, "deze week", "this week", "هذا الأسبوع")}
                      </Text>
                    </View>
                  </View>
                );
              })()}

              {/* Partner's profile answers summary */}
              {(() => {
                const pp = fullPartnerProfile?.parentProfile;
                if (!pp) return null;
                return (
                  <View
                    style={{
                      backgroundColor: colors.surface,
                      borderRadius: 10,
                      padding: 10,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <Text
                      style={{
                        color: colors.foreground,
                        fontSize: 11,
                        fontWeight: "700",
                        marginBottom: 6,
                        textAlign: isRTL ? "right" : "left",
                      }}
                    >
                      {tx(
                        lang,
                        "Profiel partner",
                        "Partner Profile",
                        "ملف الشريك",
                      )}
                    </Text>
                    {pp.prayer && (
                      <View
                        style={{
                          flexDirection: isRTL ? "row-reverse" : "row",
                          justifyContent: "space-between",
                          paddingVertical: 3,
                        }}
                      >
                        <Text style={{ color: colors.muted, fontSize: 10 }}>
                          {tx(lang, "Gebed", "Prayer", "الصلاة")}
                        </Text>
                        <Text
                          style={{
                            color: colors.foreground,
                            fontSize: 10,
                            fontWeight: "600",
                          }}
                        >
                          {translateValue(pp.prayer)}
                        </Text>
                      </View>
                    )}
                    {pp.fajr && (
                      <View
                        style={{
                          flexDirection: isRTL ? "row-reverse" : "row",
                          justifyContent: "space-between",
                          paddingVertical: 3,
                        }}
                      >
                        <Text style={{ color: colors.muted, fontSize: 10 }}>
                          {tx(lang, "Fajr", "Fajr", "الفجر")}
                        </Text>
                        <Text
                          style={{
                            color: colors.foreground,
                            fontSize: 10,
                            fontWeight: "600",
                          }}
                        >
                          {translateValue(pp.fajr)}
                        </Text>
                      </View>
                    )}
                    {pp.hijab && (
                      <View
                        style={{
                          flexDirection: isRTL ? "row-reverse" : "row",
                          justifyContent: "space-between",
                          paddingVertical: 3,
                        }}
                      >
                        <Text style={{ color: colors.muted, fontSize: 10 }}>
                          {tx(lang, "Hijaab", "Hijab", "الحجاب")}
                        </Text>
                        <Text
                          style={{
                            color: colors.foreground,
                            fontSize: 10,
                            fontWeight: "600",
                          }}
                        >
                          {translateValue(pp.hijab)}
                        </Text>
                      </View>
                    )}
                    {pp.knowledgeSource && (
                      <View
                        style={{
                          flexDirection: isRTL ? "row-reverse" : "row",
                          justifyContent: "space-between",
                          paddingVertical: 3,
                        }}
                      >
                        <Text style={{ color: colors.muted, fontSize: 10 }}>
                          {tx(lang, "Kennis", "Knowledge", "المعرفة")}
                        </Text>
                        <Text
                          style={{
                            color: colors.foreground,
                            fontSize: 10,
                            fontWeight: "600",
                          }}
                        >
                          {translateValue(pp.knowledgeSource)}
                        </Text>
                      </View>
                    )}
                    {pp.familyScience && (
                      <View
                        style={{
                          flexDirection: isRTL ? "row-reverse" : "row",
                          justifyContent: "space-between",
                          paddingVertical: 3,
                        }}
                      >
                        <Text style={{ color: colors.muted, fontSize: 10 }}>
                          {tx(
                            lang,
                            "Gezinskunde",
                            "Family science",
                            "علم الأسرة",
                          )}
                        </Text>
                        <Text
                          style={{
                            color: colors.foreground,
                            fontSize: 10,
                            fontWeight: "600",
                          }}
                        >
                          {translateValue(pp.familyScience)}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })()}
            </View>
          </ExpandableSection>
        )}

        <View
          style={{
            flexDirection: isRTL ? "row-reverse" : "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <Text
            style={{
              color: colors.foreground,
              fontSize: 14,
              fontWeight: "700",
            }}
          >
            {tx(lang, "Kinderen", "Children", "الأطفال")} (
            {state.children.length})
          </Text>
          <Pressable
            onPress={() => router.push("/add-child" as any)}
            style={({ pressed }) => [
              {
                backgroundColor: colors.primary + "15",
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 5,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Text
              style={{ color: colors.primary, fontSize: 10, fontWeight: "600" }}
            >
              + {tx(lang, "Toevoegen", "Add", "إضافة")}
            </Text>
          </Pressable>
        </View>
        {[...state.children]
          .sort((a, b) => {
            // Sort by age: oldest first
            if (!a.birthDate && !b.birthDate) return 0;
            if (!a.birthDate) return 1;
            if (!b.birthDate) return -1;
            return (
              new Date(a.birthDate).getTime() - new Date(b.birthDate).getTime()
            );
          })
          .map((child, childIdx) => {
            const age = child.birthDate
              ? calculateAgeInWeeks(child.birthDate)
              : null;
            const env = state.environments.find((e) => e.childId === child.id);
            // Calculate weekly progress for this child
            const yearKey = age ? `Jaar ${age.years}` : "Jaar 0";
            const weekNum = age ? getWeekInYear(age.totalWeeks, age.years) : 1;
            const yearData = familyYearDataMap[yearKey];
            const weekData = yearData?.weeks?.find(
              (w: any) => w.week === weekNum,
            );
            const totalGoals = weekData
              ? (weekData.parent?.length || 0) + (weekData.child?.length || 0)
              : 0;
            return (
              <Pressable
                key={child.id}
                onPress={() => router.push(`/child/${child.id}`)}
                style={({ pressed }) => [
                  {
                    backgroundColor: colors.surface,
                    borderRadius: 14,
                    padding: 14,
                    marginBottom: 10,
                    borderWidth: 1,
                    borderColor: colors.border,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <View
                  style={{
                    flexDirection: isRTL ? "row-reverse" : "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        color: colors.foreground,
                        fontSize: 13,
                        fontWeight: "700",
                      }}
                    >
                      {(() => {
                        const m = child.name.match(
                          /^(Kind|Child|\u0637\u0641\u0644)\s*(\d+)$/,
                        );
                        return m
                          ? tx(
                              lang,
                              `Kind ${m[2]}`,
                              `Child ${m[2]}`,
                              `\u0637\u0641\u0644 ${m[2]}`,
                            )
                          : child.name;
                      })()}
                    </Text>
                    <Text
                      style={{
                        color: colors.muted,
                        fontSize: 10,
                        marginTop: 2,
                      }}
                    >
                      {child.gender === "jongen"
                        ? tx(lang, "Jongen", "Boy", "ولد")
                        : child.gender === "meisje"
                          ? tx(lang, "Meisje", "Girl", "بنت")
                          : tx(
                              lang,
                              "Onbekend",
                              "Unknown",
                              "الجنس غير معروف",
                            )}{" "}
                      —{" "}
                      {age
                        ? `${age.years}${tx(lang, "j", "y", "س")} ${age.months}${tx(lang, "m", "m", "ش")}`
                        : tx(
                            lang,
                            "geen geboortedatum",
                            "no birthdate",
                            "لا يوجد تاريخ ميلاد",
                          )}
                      {env?.completed ? " ✓" : ""}
                    </Text>
                    {(!child.profileCompleted ||
                      child.laterInvullen ||
                      !child.birthDate) && (
                      <Text
                        style={{
                          color: colors.warning,
                          fontSize: 10,
                          marginTop: 3,
                          fontWeight: "600",
                        }}
                      >
                        {tx(
                          lang,
                          "⚠ Profiel invullen",
                          "⚠ Complete profile",
                          "⚠ أكمل الملف الشخصي",
                        )}
                      </Text>
                    )}
                  </View>
                  <View
                    style={{
                      flexDirection: isRTL ? "row-reverse" : "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Pressable
                      onPress={() =>
                        router.push(`/child-profile/${child.id}` as any)
                      }
                      style={({ pressed }) => [
                        {
                          opacity: pressed ? 0.7 : 1,
                          backgroundColor: colors.success + "12",
                          borderRadius: 6,
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: colors.success,
                          fontSize: 11,
                          fontWeight: "600",
                        }}
                      >
                        {tx(lang, "Profiel", "Profile", "ملف")}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => router.push(`/child/${child.id}`)}
                      style={({ pressed }) => [
                        {
                          opacity: pressed ? 0.7 : 1,
                          backgroundColor: colors.primary + "12",
                          borderRadius: 6,
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: colors.primary,
                          fontSize: 11,
                          fontWeight: "600",
                        }}
                      >
                        {tx(lang, "Bewerken", "Edit", "تعديل")}
                      </Text>
                    </Pressable>
                    {child.birthDate && (
                      <Pressable
                        onPress={() =>
                          showQr(
                            getChildIdString(child.birthDate!, childIdx),
                            `${child.name} - QR`,
                          )
                        }
                        style={({ pressed }) => [
                          {
                            opacity: pressed ? 0.7 : 1,
                            backgroundColor: colors.primary + "12",
                            borderRadius: 6,
                            padding: 4,
                          },
                        ]}
                      >
                        <MaterialIcons
                          name="qr-code"
                          size={16}
                          color={colors.primary}
                        />
                      </Pressable>
                    )}
                      <Pressable
                        onPress={() =>
                          router.push(
                            `/child-account/parent-monitor?childId=${child.id}&childName=${encodeURIComponent(child.name || "")}` as any,
                          )
                        }
                        style={({ pressed }) => [
                          {
                            opacity: pressed ? 0.7 : 1,
                            backgroundColor: "#8B5CF6" + "15",
                            borderRadius: 6,
                            padding: 4,
                          },
                        ]}
                      >
                        <MaterialIcons
                          name="monitor"
                          size={16}
                          color="#8B5CF6"
                        />
                      </Pressable>
                  </View>
                </View>
                {/* Treatment issues for this child */}
                {(() => {
                  const childIssues = (state.issues || []).filter(
                    (i) => i.childId === child.id && !i.resolved,
                  );
                  if (childIssues.length === 0) return null;
                  return (
                    <View
                      style={{
                        marginTop: 8,
                        paddingTop: 8,
                        borderTopWidth: 1,
                        borderTopColor: colors.border,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: isRTL ? "row-reverse" : "row",
                          alignItems: "center",
                          gap: 6,
                          marginBottom: 4,
                        }}
                      >
                        <View
                          style={{
                            backgroundColor: colors.error + "15",
                            borderRadius: 10,
                            paddingHorizontal: 6,
                            paddingVertical: 2,
                          }}
                        >
                          <Text
                            style={{
                              color: colors.error,
                              fontSize: 10,
                              fontWeight: "700",
                            }}
                          >
                            {childIssues.length}
                          </Text>
                        </View>
                        <Text
                          style={{
                            color: colors.error,
                            fontSize: 10,
                            fontWeight: "600",
                          }}
                        >
                          {tx(
                            lang,
                            "Openstaande problemen",
                            "Open issues",
                            "مشكلات مفتوحة",
                          )}
                        </Text>
                      </View>
                      {childIssues.slice(0, 2).map((issue) => (
                        <View
                          key={issue.id}
                          style={{
                            backgroundColor: colors.error + "08",
                            borderRadius: 8,
                            padding: 8,
                            marginBottom: 4,
                          }}
                        >
                          <Text
                            style={{ color: colors.foreground, fontSize: 10 }}
                            numberOfLines={1}
                          >
                            {issue.description}
                          </Text>
                          {issue.treatmentPlan && (
                            <Text
                              style={{
                                color: colors.primary,
                                fontSize: 9,
                                marginTop: 2,
                              }}
                              numberOfLines={1}
                            >
                              {tx(lang, "Plan:", "Plan:", "الخطة:")}{" "}
                              {issue.treatmentPlan}
                            </Text>
                          )}
                        </View>
                      ))}
                      {childIssues.length > 2 && (
                        <Text
                          style={{
                            color: colors.muted,
                            fontSize: 9,
                            textAlign: isRTL ? "right" : "left",
                          }}
                        >
                          +{childIssues.length - 2}{" "}
                          {tx(lang, "meer", "more", "أخرى")}
                        </Text>
                      )}
                    </View>
                  );
                })()}
                {/* Week progress bar + share button */}
                {age && (
                  <View
                    style={{
                      marginTop: 8,
                      paddingTop: 8,
                      borderTopWidth: 1,
                      borderTopColor: colors.border,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: isRTL ? "row-reverse" : "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 4,
                      }}
                    >
                      <Text style={{ color: colors.muted, fontSize: 9 }}>
                        {tx(
                          lang,
                          `Week ${weekNum} • ${yearKey}`,
                          `Week ${weekNum} • Year ${age.years}`,
                          `الأسبوع ${weekNum} • السنة ${age.years}`,
                        )}
                      </Text>
                      {isAuthenticated &&
                        (coParentsQuery.data ?? []).length > 0 && (
                          <Pressable
                            onPress={() => {
                              shareProgressMutation.mutate({
                                childName: child.name,
                                weekNumber: weekNum,
                                completedGoals: 0,
                                totalGoals: totalGoals,
                                progressPercent: totalGoals > 0 ? 0 : 0,
                              });
                              Alert.alert(
                                tx(lang, "Gedeeld!", "Shared!", "تم المشاركة!"),
                                tx(
                                  lang,
                                  "Voortgang gedeeld met partner",
                                  "Progress shared with partner",
                                  "تم مشاركة التقدم مع الشريك/ة",
                                ),
                              );
                            }}
                            style={({ pressed }) => [
                              {
                                opacity: pressed ? 0.7 : 1,
                                backgroundColor: colors.success + "15",
                                borderRadius: 6,
                                paddingHorizontal: 6,
                                paddingVertical: 3,
                              },
                            ]}
                          >
                            <Text
                              style={{
                                color: colors.success,
                                fontSize: 9,
                                fontWeight: "600",
                              }}
                            >
                              {tx(lang, "↻ Delen", "↻ Share", "↻ مشاركة")}
                            </Text>
                          </Pressable>
                        )}
                    </View>
                    <View
                      style={{
                        height: 4,
                        backgroundColor: colors.border,
                        borderRadius: 2,
                        overflow: "hidden",
                      }}
                    >
                      <View
                        style={{
                          height: 4,
                          backgroundColor: colors.primary,
                          borderRadius: 2,
                          width: "0%",
                        }}
                      />
                    </View>
                  </View>
                )}
              </Pressable>
            );
          })}
      </ScrollView>
      <SyncToast
        visible={toastVisible}
        message={toastMessage}
        type={toastType}
        onHide={() => setToastVisible(false)}
      />
      {/* QR Code Modal */}
      <Modal
        visible={qrModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setQrModalVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.6)",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <View
            style={{
              backgroundColor: colors.background,
              borderRadius: 20,
              padding: 32,
              alignItems: "center",
              width: 300,
              gap: 16,
            }}
          >
            <Text
              style={{
                fontSize: 16,
                fontWeight: "700",
                color: colors.foreground,
                textAlign: "center",
              }}
            >
              {qrLabel}
            </Text>
            <View
              style={{ backgroundColor: "#fff", padding: 16, borderRadius: 12 }}
            >
              <QRCode value={qrValue || "empty"} size={180} />
            </View>
            <Text
              style={{
                fontSize: 14,
                fontWeight: "600",
                color: colors.primary,
                fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
              }}
            >
              {qrValue}
            </Text>
            <Text
              style={{ fontSize: 11, color: colors.muted, textAlign: "center" }}
            >
              {tx(
                lang,
                "Laat de andere persoon deze code scannen",
                "Let the other person scan this code",
                "اجعل الشخص الآخر يمسح هذا الرمز",
              )}
            </Text>
            <TouchableOpacity
              onPress={() => setQrModalVisible(false)}
              style={{
                backgroundColor: colors.primary,
                paddingVertical: 12,
                paddingHorizontal: 32,
                borderRadius: 10,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>
                {tx(lang, "Sluiten", "Close", "إغلاق")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function InfoRow({
  label,
  value,
  colors,
  isRTL,
}: {
  label: string;
  value: string;
  colors: any;
  isRTL?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: isRTL ? "row-reverse" : "row",
        justifyContent: "space-between",
        paddingVertical: 2,
      }}
    >
      <Text style={{ color: colors.muted, fontSize: 10, flex: 1 }}>
        {label}
      </Text>
      <Text
        style={{
          color: colors.foreground,
          fontSize: 10,
          flex: 1.5,
          textAlign: isRTL ? "right" : "left",
          fontWeight: "500",
        }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}
