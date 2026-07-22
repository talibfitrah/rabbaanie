import { useState, useMemo, useEffect } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, TouchableOpacity, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppState } from "@/lib/app-context";
import { useI18n } from "@/lib/i18n";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PRAYER_LOCATION_KEY, PRAYER_METHOD_KEY, CALC_METHODS, getIslamicDate, getCityAR, calculatePrayerTimes, type SavedPrayerLocation, type CalcMethod } from "@/lib/prayer-data";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";

type Lang = "nl" | "en" | "ar";
function tx(lang: Lang, nl: string, en: string, ar: string): string {
  return lang === "ar" ? ar : lang === "en" ? en : nl;
}

interface DailyTip {
  id: string;
  title: string;
  detail: string;
  evidence?: string;
  category: "islamic" | "parenting" | "place" | "season";
}

export default function TipsTodayScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { state, markTipCompleted, unmarkTipCompleted } = useAppState();
  const { language, isRTL } = useI18n();
  const lang = language as Lang;
  const [prayerLocation, setPrayerLocation] = useState<SavedPrayerLocation | null>(null);
  const [prayerMethod, setPrayerMethod] = useState<CalcMethod>(CALC_METHODS[0]);
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  // Get today's completions
  const todayCompletions = useMemo(() => {
    return (state.dailyTipCompletions || []).filter((c) => c.date === todayStr);
  }, [state.dailyTipCompletions, todayStr]);

  const isTipCompleted = (tipId: string) => todayCompletions.some((c) => c.tipId === tipId);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(PRAYER_LOCATION_KEY),
      AsyncStorage.getItem(PRAYER_METHOD_KEY),
    ]).then(([locVal, methodVal]) => {
      if (locVal) { try { setPrayerLocation(JSON.parse(locVal)); } catch (_) {} }
      if (methodVal) {
        const found = CALC_METHODS.find(m => m.id === methodVal);
        if (found) setPrayerMethod(found);
      }
    });
  }, []);

  const prayerTimes = useMemo(() => {
    if (!prayerLocation) return null;
    return calculatePrayerTimes(now, prayerLocation.lat, prayerLocation.lng, prayerMethod, prayerLocation.tz);
  }, [prayerLocation]);

  const hijri = useMemo(() => {
    return getIslamicDate(now, prayerTimes?.maghrib || null, prayerLocation?.tz);
  }, [prayerTimes, prayerLocation]);

  const dayOfWeek = now.getDay();
  const cityName = prayerLocation?.city || state.locationSettings?.city || "";
  const displayCity = lang === "ar" ? getCityAR(cityName) : cityName;

  const currentSeason = useMemo(() => {
    const month = now.getMonth();
    if (month >= 2 && month <= 4) return tx(lang, "Lente", "Spring", "الربيع");
    if (month >= 5 && month <= 7) return tx(lang, "Zomer", "Summer", "الصيف");
    if (month >= 8 && month <= 10) return tx(lang, "Herfst", "Autumn", "الخريف");
    return tx(lang, "Winter", "Winter", "الشتاء");
  }, []);

  // ============ DAILY TIPS WITH UNIQUE IDS ============

  const allTips: DailyTip[] = useMemo(() => {
    const tips: DailyTip[] = [];

    // === ISLAMIC TIPS (based on day/hijri) ===
    if (dayOfWeek === 5) {
      tips.push({ id: "friday_kahf", category: "islamic", title: tx(lang, "Soerah al-Kahf", "Surah al-Kahf", "سورة الكهف"), detail: tx(lang, "Lees Soerah al-Kahf — licht tussen twee Jumu'ahs", "Read Surah al-Kahf — light between two Jumu'ahs", "اقرأ سورة الكهف — نور بين الجمعتين"), evidence: tx(lang, "\u00abMan qara'a Soerat al-Kahf yawm al-Jumu'ah adaa'a lahu min an-noor\u00bb \u2014 Haakim", "\u00abWhoever reads Surah al-Kahf on Friday, light will shine for him between the two Fridays\u00bb \u2014 al-Haakim", "\u00abمن قرأ سورة الكهف يوم الجمعة أضاء له من النور ما بين الجمعتين\u00bb \u2014 الحاكم") });
      tips.push({ id: "friday_salawaat", category: "islamic", title: tx(lang, "Salawaat", "Salawaat", "الصلاة على النبي \uFDFA"), detail: tx(lang, "Vermeerder salawaat op de Profeet \uFDFA", "Increase salawaat upon the Prophet \uFDFA", "أكثر من الصلاة على النبي \uFDFA"), evidence: tx(lang, "\u00abAkthiroo min as-salaati 'alayya yawm al-Jumu'ah\u00bb \u2014 Abu Daawoed", "\u00abIncrease in sending blessings upon me on Friday\u00bb \u2014 Abu Dawood", "\u00abأكثروا من الصلاة عليّ يوم الجمعة\u00bb \u2014 أبو داود") });
      tips.push({ id: "friday_duaa", category: "islamic", title: tx(lang, "Du'aa", "Du'aa", "الدعاء"), detail: tx(lang, "Zoek het uur van verhoring — laatste uur voor Maghrib", "Seek the hour of acceptance — last hour before Maghrib", "تحرّ ساعة الإجابة — آخر ساعة قبل المغرب"), evidence: tx(lang, "\u00abFeehaa saa'atun laa yuwaafiquhaa 'abdun muslim...\u00bb \u2014 Bukhaari & Muslim", "\u00abThere is an hour on Friday in which no Muslim servant asks Allaah...\u00bb \u2014 al-Bukhaari & Muslim", "\u00abفيها ساعة لا يوافقها عبد مسلم وهو قائم يصلي يسأل الله شيئاً إلا أعطاه إياه\u00bb \u2014 البخاري ومسلم") });
    } else if (dayOfWeek === 1 || dayOfWeek === 4) {
      tips.push({ id: "sunnah_fasting", category: "islamic", title: tx(lang, "Soennah vasten", "Sunnah fasting", "صيام السنة"), detail: tx(lang, "Vast vandaag — daden worden voorgelegd aan Allaah", "Fast today — deeds are presented to Allaah", "صم اليوم — تُعرض الأعمال على الله"), evidence: tx(lang, "\u00abUhibbu an yurfa'a 'amalee wa ana saa'im\u00bb \u2014 Nasaa'i", "\u00abI love that my deeds are raised while I am fasting\u00bb \u2014 an-Nasaa'i", "\u00abأحب أن يُرفع عملي وأنا صائم\u00bb \u2014 النسائي") });
    }
    if (hijri.month === 12 && hijri.day >= 1 && hijri.day <= 10) {
      tips.push({ id: "dhulhijjah_takbeer", category: "islamic", title: tx(lang, "Takbier", "Takbeer", "التكبير"), detail: tx(lang, "Takbier na elk gebed — onbeperkt takbier", "Takbeer after every prayer — unrestricted takbeer", "التكبير بعد كل صلاة — التكبير المطلق") });
    }
    if (hijri.day === 13 || hijri.day === 14 || hijri.day === 15) {
      tips.push({ id: "white_days_fasting", category: "islamic", title: tx(lang, "Witte dagen", "White days", "الأيام البيض"), detail: tx(lang, "Vasten = beloning hele maand", "Fasting = reward of whole month", "الصيام = أجر صيام شهر كامل"), evidence: tx(lang, "\u00abIdhaa sumta min ash-shahr thalaathatan...\u00bb \u2014 Tirmidhi", "\u00abIf you fast three days of the month...\u00bb \u2014 at-Tirmidhi", "\u00abإذا صمت من الشهر ثلاثاً فصم ثلاث عشرة وأربع عشرة وخمس عشرة\u00bb \u2014 الترمذي") });
    }

    // Always include daily adhkaar & Qur'aan
    tips.push({ id: "morning_adhkaar", category: "islamic", title: tx(lang, "Ochtend-adhkaar", "Morning adhkaar", "أذكار الصباح"), detail: tx(lang, "Begin uw dag met de ochtend-adhkaar", "Start your day with morning adhkaar", "ابدأ يومك بأذكار الصباح") });
    tips.push({ id: "daily_quran", category: "islamic", title: tx(lang, "Qur'aan", "Qur'aan", "القرآن"), detail: tx(lang, "Lees dagelijks minstens 1 pagina", "Read at least 1 page daily", "اقرأ صفحة واحدة يومياً على الأقل") });
    tips.push({ id: "evening_adhkaar", category: "islamic", title: tx(lang, "Avond-adhkaar", "Evening adhkaar", "أذكار المساء"), detail: tx(lang, "Sluit uw dag af met de avond-adhkaar", "End your day with evening adhkaar", "اختم يومك بأذكار المساء") });

    // === PARENTING TIPS (daily rotation based on day of year) ===
    const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
    const parentingTipsPool = [
      { id: "parent_listen", title: tx(lang, "Luister naar uw kind", "Listen to your child", "استمع لطفلك"), detail: tx(lang, "Neem 10 minuten om echt te luisteren naar uw kind vandaag", "Take 10 minutes to truly listen to your child today", "خصص 10 دقائق للاستماع الحقيقي لطفلك اليوم") },
      { id: "parent_praise", title: tx(lang, "Complimenteer uw kind", "Praise your child", "امدح طفلك"), detail: tx(lang, "Geef vandaag minstens 3 oprechte complimenten", "Give at least 3 sincere compliments today", "قدم 3 مدحات صادقة على الأقل اليوم") },
      { id: "parent_play", title: tx(lang, "Speel met uw kind", "Play with your child", "العب مع طفلك"), detail: tx(lang, "Besteed 15 minuten aan spelen — op hun niveau", "Spend 15 minutes playing — at their level", "اقضِ 15 دقيقة في اللعب — على مستواهم") },
      { id: "parent_duaa", title: tx(lang, "Du'aa voor kinderen", "Du'aa for children", "الدعاء للأبناء"), detail: tx(lang, "Maak du'aa voor uw kinderen — het wapen van de gelovige", "Make du'aa for your children — the weapon of the believer", "ادعُ لأبنائك — سلاح المؤمن") },
      { id: "parent_teach", title: tx(lang, "Leer uw kind iets", "Teach your child something", "علّم طفلك شيئاً"), detail: tx(lang, "Leer vandaag een nieuw woord, hadieth of vaardigheid", "Teach a new word, hadith or skill today", "علّم كلمة جديدة أو حديثاً أو مهارة اليوم") },
      { id: "parent_patience", title: tx(lang, "Geduld oefenen", "Practice patience", "تدرّب على الصبر"), detail: tx(lang, "Reageer vandaag met geduld — niet met boosheid", "Respond today with patience — not anger", "استجب اليوم بالصبر — لا بالغضب") },
      { id: "parent_story", title: tx(lang, "Vertel een verhaal", "Tell a story", "احكِ قصة"), detail: tx(lang, "Vertel een verhaal van de Profeten of Sahaba voor het slapen", "Tell a story of the Prophets or Sahaba before bed", "احكِ قصة من قصص الأنبياء أو الصحابة قبل النوم") },
      { id: "parent_hug", title: tx(lang, "Omhels uw kind", "Hug your child", "احتضن طفلك"), detail: tx(lang, "Een warme omhelzing — de Profeet \uFDFA kuste zijn kleinkinderen", "A warm hug — the Prophet \uFDFA kissed his grandchildren", "عناق دافئ — كان النبي \uFDFA يقبّل أحفاده") },
      { id: "parent_meal", title: tx(lang, "Eet samen", "Eat together", "كُل معهم"), detail: tx(lang, "Eet minstens één maaltijd samen als gezin", "Eat at least one meal together as a family", "تناول وجبة واحدة على الأقل مع العائلة") },
      { id: "parent_screen", title: tx(lang, "Schermtijd beperken", "Limit screen time", "حدّد وقت الشاشة"), detail: tx(lang, "Beperk schermtijd — meer face-to-face interactie", "Limit screen time — more face-to-face interaction", "قلل وقت الشاشة — زد التواصل المباشر") },
      { id: "parent_nature", title: tx(lang, "Buiten spelen", "Outdoor play", "اللعب في الخارج"), detail: tx(lang, "Neem uw kinderen mee naar buiten — frisse lucht en beweging", "Take your children outside — fresh air and movement", "اصطحب أطفالك للخارج — هواء نقي وحركة") },
      { id: "parent_quran_child", title: tx(lang, "Qur'aan met kinderen", "Qur'aan with children", "القرآن مع الأطفال"), detail: tx(lang, "Lees samen Qur'aan — zelfs 5 minuten telt", "Read Qur'aan together — even 5 minutes counts", "اقرأ القرآن معهم — حتى 5 دقائق تُحسب") },
      { id: "parent_kindword", title: tx(lang, "Zeg iets liefs", "Say something kind", "قل كلمة طيبة"), detail: tx(lang, "Zeg 'ik hou van je' of 'ik ben trots op je'", "Say 'I love you' or 'I'm proud of you'", "قل 'أحبك' أو 'أنا فخور بك'") },
      { id: "parent_spouse", title: tx(lang, "Waardeer uw partner", "Appreciate your spouse", "قدّر شريكك"), detail: tx(lang, "Bedank uw partner voor iets specifieks vandaag", "Thank your partner for something specific today", "اشكر شريكك على شيء محدد اليوم") },
    ];

    // Pick 3 parenting tips based on day rotation
    const startIdx = dayOfYear % parentingTipsPool.length;
    for (let i = 0; i < 3; i++) {
      const tip = parentingTipsPool[(startIdx + i) % parentingTipsPool.length];
      tips.push({ ...tip, category: "parenting" });
    }

    // === PLACE TIPS ===
    if (cityName) {
      tips.push({ id: "place_gaze", category: "place", title: tx(lang, "Fitnah op straat", "Fitnah on streets", "الفتن في الشوارع"), detail: tx(lang, "Let op visuele fitnah — sla de blik neer", "Beware of visual fitnah — lower your gaze", "احذر الفتن البصرية — غض بصرك") });
      tips.push({ id: "place_mosque", category: "place", title: tx(lang, "Moskee", "Mosque", "المسجد"), detail: tx(lang, "Bid in de moskee als het mogelijk is", "Pray in the mosque if possible", "صلِّ في المسجد إن أمكن") });
    }

    // === SEASON TIPS ===
    if (currentSeason === tx(lang, "Zomer", "Summer", "الصيف")) {
      tips.push({ id: "season_long_day", category: "season", title: tx(lang, "Lange dagen", "Long days", "أيام طويلة"), detail: tx(lang, "Benut de lange dagen voor extra ibadah", "Use long days for extra ibadah", "استغل طول النهار للعبادة") });
    } else if (currentSeason === tx(lang, "Winter", "Winter", "الشتاء")) {
      tips.push({ id: "season_short_fast", category: "season", title: tx(lang, "Kort vasten", "Short fasting", "صيام قصير"), detail: tx(lang, "Korte dagen — makkelijker om te vasten", "Short days — easier to fast", "أيام قصيرة — أسهل للصيام") });
      tips.push({ id: "season_long_night", category: "season", title: tx(lang, "Lange nachten", "Long nights", "ليالٍ طويلة"), detail: tx(lang, "Benut de lange nachten voor qiyaam", "Use long nights for qiyaam", "استغل طول الليل لقيام الليل") });
    }

    return tips;
  }, [dayOfWeek, hijri, cityName, currentSeason]);

  // Group tips by category
  const islamicTips = allTips.filter(t => t.category === "islamic");
  const parentingTips = allTips.filter(t => t.category === "parenting");
  const placeTips = allTips.filter(t => t.category === "place");
  const seasonTips = allTips.filter(t => t.category === "season");

  // Completion stats
  const completedCount = todayCompletions.length;
  const totalTips = allTips.length;
  const completionPercent = totalTips > 0 ? Math.round((completedCount / totalTips) * 100) : 0;

  const handleToggleTip = async (tipId: string) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const completed = isTipCompleted(tipId);
    if (completed) {
      await unmarkTipCompleted(tipId);
    } else {
      await markTipCompleted(tipId);
    }
  };

  const renderTipRow = (tip: DailyTip, bulletColor: string) => {
    const completed = isTipCompleted(tip.id);
    return (
      <View key={tip.id} style={[st.tipRow, completed && { backgroundColor: "#F0FDF4" }]}>
        <TouchableOpacity
          onPress={() => handleToggleTip(tip.id)}
          style={[st.checkbox, completed && st.checkboxChecked]}
        >
          {completed && <MaterialIcons name="check" size={14} color="#fff" />}
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[st.tipTitle, completed && { textDecorationLine: "line-through", color: "#9CA3AF" }]}>{tip.title}</Text>
          <Text style={[st.tipDetail, completed && { color: "#9CA3AF" }]}>{tip.detail}</Text>
          {tip.evidence && <Text style={st.tipEvidence}>{tip.evidence}</Text>}
        </View>
      </View>
    );
  };

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={st.topBar}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [st.backBtn, pressed && { opacity: 0.5 }]}>
          <MaterialIcons name={isRTL ? "chevron-right" : "chevron-left"} size={28} color="#1B4332" />
        </Pressable>
        <Text style={st.topTitle}>{tx(lang, "Dagelijkse tips", "Daily Tips", "نصائح اليوم")}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40, paddingHorizontal: 16 }} showsVerticalScrollIndicator={false}>

        {/* Progress Summary */}
        <View style={st.progressBox}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={st.progressTitle}>
              {tx(lang, "Voortgang vandaag", "Today's Progress", "تقدم اليوم")}
            </Text>
            <Text style={st.progressPercent}>{completionPercent}%</Text>
          </View>
          <View style={st.progressBarBg}>
            <View style={[st.progressBarFill, { width: `${completionPercent}%` }]} />
          </View>
          <Text style={st.progressCount}>
            {completedCount}/{totalTips} {tx(lang, "voltooid", "completed", "مكتمل")}
          </Text>
        </View>

        {/* Islamic Section */}
        {islamicTips.length > 0 && (
          <View style={st.sectionBox}>
            <View style={[st.sectionHeader, { backgroundColor: "#E8F5E9" }]}>
              <MaterialIcons name="date-range" size={20} color="#1B4332" />
              <Text style={[st.sectionHeaderText, { color: "#1B4332" }]}>{tx(lang, "Islamitische dag", "Islamic Day", "اليوم الإسلامي")} — {hijri.day} {lang === "ar" ? hijri.monthNameAR : hijri.monthName}</Text>
            </View>
            {islamicTips.map((tip) => renderTipRow(tip, "#1B4332"))}
          </View>
        )}

        {/* Parenting Section */}
        {parentingTips.length > 0 && (
          <View style={st.sectionBox}>
            <View style={[st.sectionHeader, { backgroundColor: "#FFF8E1" }]}>
              <MaterialIcons name="family-restroom" size={20} color="#F57F17" />
              <Text style={[st.sectionHeaderText, { color: "#F57F17" }]}>{tx(lang, "Opvoedtips", "Parenting Tips", "نصائح تربوية")}</Text>
            </View>
            {parentingTips.map((tip) => renderTipRow(tip, "#F57F17"))}
          </View>
        )}

        {/* Place Section */}
        {placeTips.length > 0 && (
          <View style={st.sectionBox}>
            <View style={[st.sectionHeader, { backgroundColor: "#E3F2FD" }]}>
              <MaterialIcons name="place" size={20} color="#1565C0" />
              <Text style={[st.sectionHeaderText, { color: "#1565C0" }]}>{tx(lang, "Plaatsadvies", "Place Tips", "نصائح المكان")} — {displayCity || "?"}</Text>
            </View>
            {placeTips.map((tip) => renderTipRow(tip, "#1565C0"))}
          </View>
        )}

        {/* Season Section */}
        {seasonTips.length > 0 && (
          <View style={st.sectionBox}>
            <View style={[st.sectionHeader, { backgroundColor: "#FFF3E0" }]}>
              <MaterialIcons name="wb-sunny" size={20} color="#E65100" />
              <Text style={[st.sectionHeaderText, { color: "#E65100" }]}>{tx(lang, "Seizoensadvies", "Season Tips", "نصائح الموسم")} — {currentSeason}</Text>
            </View>
            {seasonTips.map((tip) => renderTipRow(tip, "#E65100"))}
          </View>
        )}

      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  topTitle: { fontSize: 17, fontWeight: "700", color: "#1B4332" },

  progressBox: { marginTop: 16, backgroundColor: "#F0FDF4", borderRadius: 14, padding: 16, borderWidth: 1, borderColor: "#BBF7D0" },
  progressTitle: { fontSize: 14, fontWeight: "700", color: "#166534" },
  progressPercent: { fontSize: 22, fontWeight: "900", color: "#DC2626" },
  progressBarBg: { height: 10, backgroundColor: "#E5E7EB", borderRadius: 5, overflow: "hidden", marginTop: 8 },
  progressBarFill: { height: 10, backgroundColor: "#059669", borderRadius: 5 },
  progressCount: { fontSize: 12, color: "#6B7280", marginTop: 6 },

  sectionBox: { marginTop: 20, borderRadius: 14, borderWidth: 1, borderColor: "#E8ECE9", overflow: "hidden" },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 12 },
  sectionHeaderText: { fontSize: 14, fontWeight: "700" },

  tipRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: "#F3F4F6" },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: "#D1D5DB", alignItems: "center", justifyContent: "center", marginTop: 2 },
  checkboxChecked: { backgroundColor: "#059669", borderColor: "#059669" },
  tipTitle: { fontSize: 14, fontWeight: "700", color: "#1F2937" },
  tipDetail: { fontSize: 12, color: "#374151", lineHeight: 20, marginTop: 2 },
  tipEvidence: { fontSize: 10, color: "#9CA3AF", fontStyle: "italic", marginTop: 4 },
});
