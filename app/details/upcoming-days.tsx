import { useState, useMemo, useEffect } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, LayoutAnimation, Platform, UIManager } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useI18n } from "@/lib/i18n";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PRAYER_LOCATION_KEY, PRAYER_METHOD_KEY, CALC_METHODS, calculatePrayerTimes, getIslamicDate, type SavedPrayerLocation, type CalcMethod } from "@/lib/prayer-data";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Lang = "nl" | "en" | "ar";
function tx(lang: Lang, nl: string, en: string, ar: string): string {
  return lang === "ar" ? ar : lang === "en" ? en : nl;
}

function gregorianToHijri(gDate: Date): { year: number; month: number; day: number; monthName: string; monthNameAR: string } {
  const d = gDate.getDate(); const m = gDate.getMonth() + 1; const y = gDate.getFullYear();
  const jd = Math.floor((1461 * (y + 4800 + Math.floor((m - 14) / 12))) / 4) + Math.floor((367 * (m - 2 - 12 * Math.floor((m - 14) / 12))) / 12) - Math.floor((3 * Math.floor((y + 4900 + Math.floor((m - 14) / 12)) / 100)) / 4) + d - 32075;
  const l = (jd - 2) - 1948440 + 10632; const n = Math.floor((l - 1) / 10631);
  const lRem = l - 10631 * n + 354;
  const j = Math.floor((10985 - lRem) / 5316) * Math.floor((50 * lRem) / 17719) + Math.floor(lRem / 5670) * Math.floor((43 * lRem) / 15238);
  const lFinal = lRem - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) - Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
  const hMonth = Math.floor((24 * lFinal) / 709); const hDay = lFinal - Math.floor((709 * hMonth) / 24); const hYear = 30 * n + j - 30;
  const hijriMonths = ["Muharram","Safar","Rabee' al-Awwal","Rabee' ath-Thaani","Jumaada al-Oola","Jumaada ath-Thaaniya","Rajab","Sha'baan","Ramadhaan","Shawwaal","Dhul-Qi'dah","Dhul-Hijjah"];
  const hijriMonthsAR = ["المحرّم","صفر","ربيع الأول","ربيع الثاني","جمادى الأولى","جمادى الثانية","رجب","شعبان","رمضان","شوال","ذو القعدة","ذو الحجة"];
  return { year: hYear, month: hMonth, day: hDay, monthName: hijriMonths[(hMonth-1)%12]||"Muharram", monthNameAR: hijriMonthsAR[(hMonth-1)%12]||"المحرّم" };
}

function isFastingProhibited(m: number, d: number): boolean {
  if (m===10&&d===1) return true; if (m===12&&d===10) return true; if (m===12&&d>=11&&d<=13) return true; return false;
}

interface DayDetail {
  dayName: string;
  hijriDate: string;
  relLabel: string;
  events: { name: string; detail: string; fasting?: string; evidence?: string; parentAction?: string; preparation?: string }[];
}

// Exported so tests can assert real evidence-text output instead of grepping source.
export function getDetailedDays(now: Date, lang: Lang): DayDetail[] {
  const days: DayDetail[] = [];
  const daysArr = lang === "ar" ? ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"] :
    lang === "en" ? ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"] :
    ["Zondag","Maandag","Dinsdag","Woensdag","Donderdag","Vrijdag","Zaterdag"];
  const relLabels = [
    tx(lang,"Morgen","Tomorrow","غدًا"), tx(lang,"Overmorgen","Day after tomorrow","بعد غد"),
    tx(lang,"Over 3 dagen","In 3 days","بعد ٣ أيام"), tx(lang,"Over 4 dagen","In 4 days","بعد ٤ أيام"),
    tx(lang,"Over 5 dagen","In 5 days","بعد ٥ أيام"),
  ];

  for (let i = 1; i <= 5; i++) {
    const futureDate = new Date(now.getTime() + i * 86400000);
    const dow = futureDate.getDay();
    const fH = gregorianToHijri(futureDate);
    const noFast = isFastingProhibited(fH.month, fH.day);
    const events: DayDetail["events"] = [];

    if (dow === 5) {
      events.push({ name: "Jumu'ah", detail: tx(lang,"Beste dag — Soerah al-Kahf; salawaat; du'aa laatste uur","Best day — Surah al-Kahf; salawaat; du'aa last hour","أفضل يوم — سورة الكهف؛ الصلاة على النبي؛ الدعاء آخر ساعة"), evidence: tx(lang, "«Khayru yawmin tala'at 'alayhi ash-shams yawm al-Jumu'ah» — Muslim", "«The best day on which the sun rises is Friday» — Muslim", "«خير يوم طلعت عليه الشمس يوم الجمعة» — مسلم"), parentAction: tx(lang,"Lees Soerah al-Kahf als gezin","Read Surah al-Kahf as a family","اقرأوا سورة الكهف كعائلة"), preparation: tx(lang,"Ghusl; parfum; vroeg naar moskee","Ghusl; perfume; early to mosque","غسل؛ طيب؛ التبكير للمسجد") });
    }
    if ((dow === 1 || dow === 4) && !noFast) {
      events.push({ name: dow===1 ? tx(lang,"Maandag vasten","Monday fasting","صيام الاثنين") : tx(lang,"Donderdag vasten","Thursday fasting","صيام الخميس"), detail: tx(lang,"Daden worden voorgelegd terwijl u vast","Deeds are presented while you fast","تُعرض الأعمال وأنت صائم"), fasting: "recommended", evidence: tx(lang, "«Uhibbu an yurfa'a 'amalee wa ana saa'im» — Nasaa'i", "«I love that my deeds are raised while I am fasting» — an-Nasaa'i", "«أحب أن يُرفع عملي وأنا صائم» — النسائي"), parentAction: tx(lang,"Vast en evalueer de week met uw partner","Fast and evaluate the week with your partner","صم وقيّم الأسبوع مع شريكك") });
    }
    if ((fH.day===13||fH.day===14||fH.day===15) && !noFast) {
      events.push({ name: tx(lang,`Witte dag (${fH.day}e)`,`White day (${fH.day}th)`,`يوم أبيض (${fH.day})`), detail: tx(lang,"3 dagen = beloning hele maand","3 days = reward of whole month","٣ أيام = أجر صيام شهر"), fasting: "recommended", evidence: tx(lang, "«Idhaa sumta min ash-shahr thalaathatan fa-sum 13, 14, 15» — Tirmidhi", "«If you fast three days of the month, fast the 13th, 14th, and 15th» — at-Tirmidhi", "«إذا صمت من الشهر ثلاثاً فصم ثلاث عشرة وأربع عشرة وخمس عشرة» — الترمذي"), parentAction: tx(lang,"Leer kinderen over de witte dagen","Teach children about the white days","علّم الأولاد عن الأيام البيض") });
    }
    if (fH.month===12 && fH.day>=1 && fH.day<=8) {
      events.push({ name: tx(lang,`${fH.day}e Dhul-Hijjah`,`${fH.day}th Dhul-Hijjah`,`${fH.day} ذو الحجة`), detail: tx(lang,"Goede daden geliefder bij Allaah dan op enige andere dag","Good deeds more beloved to Allaah than any other day","العمل الصالح أحب إلى الله من أي يوم آخر"), fasting: "recommended", evidence: tx(lang, "«Maa min ayyaamin al-'amalu as-saalihu feehinna ahabbu ilaa Allaah...» — Tirmidhi", "«There are no days in which righteous deeds are more beloved to Allaah...» — at-Tirmidhi", "«ما من أيام العمل الصالح فيهن أحب إلى الله من هذه الأيام العشر» — الترمذي"), parentAction: tx(lang,"Vermeerder dhikr, sadaqah en takbier als gezin","Increase dhikr, sadaqah and takbeer as a family","أكثروا من الذكر والصدقة والتكبير كعائلة"), preparation: tx(lang,"Takbier; goede daden; geen nagels knippen","Takbeer; good deeds; no cutting nails","تكبير؛ أعمال صالحة؛ لا تقص الأظافر") });
    }
    if (fH.month===12 && fH.day===9) {
      events.push({ name: tx(lang,"Dag van 'Arafah","Day of 'Arafah","يوم عرفة"), detail: tx(lang,"Wist zonden van 2 jaar","Erases sins of 2 years","يكفّر ذنوب سنتين"), fasting: "recommended", evidence: tx(lang, "«Yukaffiru as-sanata allatee qablahu wal-sanata allatee ba'dahu» — Muslim", "«It expiates the sins of the preceding year and the following year» — Muslim", "«يكفّر السنة التي قبله والسنة التي بعده» — مسلم"), parentAction: tx(lang,"Vast als gezin! Maak veel du'aa","Fast as a family! Make much du'aa","صوموا كعائلة! أكثروا الدعاء"), preparation: tx(lang,"Neem intentie vasten; veel du'aa","Intend to fast; much du'aa","انوِ الصيام؛ أكثر من الدعاء") });
    }
    if (fH.month===12 && fH.day===10) {
      events.push({ name: tx(lang,"'Ied al-Adhaa","'Eid al-Adha","عيد الأضحى"), detail: tx(lang,"Grootste dag van het jaar","Greatest day of the year","أعظم أيام السنة"), fasting: "prohibited", parentAction: tx(lang,"Neem kinderen mee naar 'Ied-gebed; offer","Take children to 'Eid prayer; sacrifice","خذ الأولاد لصلاة العيد؛ الأضحية"), preparation: tx(lang,"Ghusl; mooiste kleding; takbier; 'Ied-gebed; offer","Ghusl; best clothes; takbeer; 'Eid prayer; sacrifice","غسل؛ أحسن الثياب؛ تكبير؛ صلاة العيد؛ الأضحية") });
    }
    if (fH.month===12 && fH.day>=11 && fH.day<=13) {
      events.push({ name: tx(lang,`Tashreeq ${fH.day-10}`,`Tashreeq ${fH.day-10}`,`تشريق ${fH.day-10}`), detail: tx(lang,"Eten, drinken en dhikr — vasten haraam","Eating, drinking and dhikr — fasting haraam","أكل وشرب وذكر — الصيام حرام"), fasting: "prohibited", parentAction: tx(lang,"Takbier na elk gebed; geniet als gezin","Takbeer after every prayer; enjoy as family","تكبير بعد كل صلاة؛ استمتع مع العائلة") });
    }
    if (fH.month===1 && fH.day===10) {
      events.push({ name: "'Aashoeraa", detail: tx(lang,"Wist zonden voorgaand jaar","Erases sins of previous year","يكفّر ذنوب السنة الماضية"), fasting: "recommended", evidence: tx(lang, "«Yukaffiru as-sanata allatee qablahu» — Muslim", "«It expiates the sins of the preceding year» — Muslim", "«يكفّر السنة التي قبله» — مسلم"), parentAction: tx(lang,"Vertel kinderen het verhaal van Moesaa","Tell children the story of Moosaa","اقصص على الأولاد قصة موسى") });
    }

    if (events.length === 0) {
      events.push({ name: tx(lang,"Gewone dag","Regular day","يوم عادي"), detail: tx(lang,"Ochtend-adhkaar; avond-adhkaar; Qur'aan","Morning adhkaar; evening adhkaar; Qur'aan","أذكار الصباح؛ أذكار المساء؛ القرآن") });
    }

    days.push({
      dayName: daysArr[dow],
      hijriDate: `${fH.day} ${lang==="ar" ? fH.monthNameAR : fH.monthName} ${fH.year}`,
      relLabel: relLabels[i-1],
      events,
    });
  }
  return days;
}

export default function UpcomingDaysScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { language, isRTL } = useI18n();
  const lang = language as Lang;
  const [expandedIdx, setExpandedIdx] = useState<number | null>(0);

  const detailedDays = useMemo(() => getDetailedDays(new Date(), lang), [lang]);

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={[st.topBar, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [st.backBtn, pressed && { opacity: 0.5 }]}>
          <MaterialIcons name={isRTL ? "chevron-right" : "chevron-left"} size={28} color="#1B4332" />
        </Pressable>
        <Text style={st.topTitle}>{tx(lang, "Komende 5 dagen", "Next 5 Days", "الأيام الخمسة القادمة")}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40, paddingHorizontal: 16 }} showsVerticalScrollIndicator={false}>
        {detailedDays.map((day, idx) => (
          <Pressable
            key={idx}
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setExpandedIdx(expandedIdx === idx ? null : idx);
            }}
            style={({ pressed }) => [st.dayBox, pressed && { opacity: 0.95 }]}
          >
            <View style={[st.dayHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <View style={st.dayNum}>
                <Text style={st.dayNumText}>{idx + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.dayTitle}>{day.relLabel} — {day.dayName}</Text>
                <Text style={st.dayHijri}>{day.hijriDate}</Text>
              </View>
              <MaterialIcons name={expandedIdx === idx ? "keyboard-arrow-up" : "keyboard-arrow-down"} size={22} color="#C4A35A" />
            </View>

            {expandedIdx === idx && (
              <View style={st.dayBody}>
                {day.events.map((ev, ei) => (
                  <View key={ei} style={[st.eventRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                    <View style={st.eventBullet} />
                    <View style={{ flex: 1 }}>
                      <View style={[st.eventNameRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                        <Text style={st.eventName}>{ev.name}</Text>
                        {ev.fasting === "recommended" && <View style={st.fastingBadge}><Text style={st.fastingText}>{tx(lang,"Vasten","Fasting","صيام")}</Text></View>}
                        {ev.fasting === "prohibited" && <View style={[st.fastingBadge, { backgroundColor: "#FFEBEE" }]}><Text style={[st.fastingText, { color: "#C62828" }]}>{tx(lang,"Niet vasten","No fasting","لا صيام")}</Text></View>}
                      </View>
                      <Text style={st.eventDetail}>{ev.detail}</Text>
                      {ev.evidence && <Text style={st.eventEvidence}>{ev.evidence}</Text>}
                      {ev.preparation && (
                        <View style={[st.eventExtra, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                          <MaterialIcons name="checklist" size={12} color="#6B7B72" />
                          <Text style={st.eventExtraText}>{ev.preparation}</Text>
                        </View>
                      )}
                      {ev.parentAction && (
                        <View style={[st.eventExtra, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                          <MaterialIcons name="family-restroom" size={12} color="#6B7B72" />
                          <Text style={st.eventExtraText}>{ev.parentAction}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  topBar: { alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  topTitle: { fontSize: 17, fontWeight: "700", color: "#C4A35A" },

  dayBox: { marginTop: 16, borderRadius: 14, borderWidth: 1, borderColor: "#E8ECE9", overflow: "hidden", backgroundColor: "#FFFDF8" },
  dayHeader: { alignItems: "center", gap: 10, padding: 14 },
  dayNum: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#C4A35A", alignItems: "center", justifyContent: "center" },
  dayNumText: { fontSize: 14, fontWeight: "700", color: "#FFFFFF" },
  dayTitle: { fontSize: 14, fontWeight: "700", color: "#1F2937" },
  dayHijri: { fontSize: 11, color: "#6B7B72", marginTop: 2 },

  dayBody: { paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 1, borderTopColor: "#F3F4F6" },
  eventRow: { alignItems: "flex-start", gap: 10, marginTop: 12 },
  eventBullet: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#C4A35A", marginTop: 5 },
  eventNameRow: { alignItems: "center", gap: 8 },
  eventName: { fontSize: 13, fontWeight: "700", color: "#1F2937" },
  eventDetail: { fontSize: 12, color: "#374151", lineHeight: 20, marginTop: 2 },
  eventEvidence: { fontSize: 10, color: "#9CA3AF", fontStyle: "italic", marginTop: 4 },
  eventExtra: { alignItems: "center", gap: 6, marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: "#F9FAFB" },
  eventExtraText: { flex: 1, fontSize: 11, color: "#6B7B72" },
  fastingBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: "#E8F5E9" },
  fastingText: { fontSize: 9, fontWeight: "600", color: "#2E7D32" },
});
