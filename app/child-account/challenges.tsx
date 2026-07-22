import { useState } from "react";
import { Text, View, ScrollView, TouchableOpacity } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";

type Challenge = { id: string; title: Record<string, string>; category: string; completed: boolean };

const DAILY_CHALLENGES: Record<string, Challenge[]> = {
  "12-14": [
    { id: "1", title: { ar: "صلِّ الفجر في وقته", nl: "Bid Fajr op tijd", en: "Pray Fajr on time" }, category: "prayer", completed: false },
    { id: "2", title: { ar: "ساعد أمك في شيء واحد", nl: "Help je moeder met iets", en: "Help your mother with something" }, category: "family", completed: false },
    { id: "3", title: { ar: "اقرأ صفحة من القرآن", nl: "Lees een pagina Qur'aan", en: "Read a page of Qur'aan" }, category: "quran", completed: false },
    { id: "4", title: { ar: "قل سبحان الله 33 مرة", nl: "Zeg SubhanAllaah 33 keer", en: "Say SubhanAllaah 33 times" }, category: "dhikr", completed: false },
    { id: "5", title: { ar: "تعلّم شيئاً جديداً اليوم", nl: "Leer vandaag iets nieuws", en: "Learn something new today" }, category: "learning", completed: false },
  ],
  "15-17": [
    { id: "1", title: { ar: "صلِّ جميع الصلوات في وقتها", nl: "Bid alle gebeden op tijd", en: "Pray all prayers on time" }, category: "prayer", completed: false },
    { id: "2", title: { ar: "اقرأ حزباً من القرآن", nl: "Lees een hizb Qur'aan", en: "Read one hizb of Qur'aan" }, category: "quran", completed: false },
    { id: "3", title: { ar: "أحسن إلى جارك أو زميلك", nl: "Wees goed voor je buur of klasgenoot", en: "Be kind to your neighbor or classmate" }, category: "akhlaq", completed: false },
    { id: "4", title: { ar: "مارس رياضة 30 دقيقة", nl: "Sport 30 minuten", en: "Exercise 30 minutes" }, category: "health", completed: false },
    { id: "5", title: { ar: "ادعُ لوالديك بعد كل صلاة", nl: "Maak du'aa voor je ouders na elk gebed", en: "Make du'aa for your parents after each prayer" }, category: "family", completed: false },
    { id: "6", title: { ar: "اقرأ حديثاً واحداً وافهم معناه", nl: "Lees één hadieth en begrijp de betekenis", en: "Read one hadith and understand its meaning" }, category: "learning", completed: false },
  ],
  "18+": [
    { id: "1", title: { ar: "صلِّ الفجر في المسجد", nl: "Bid Fajr in de moskee", en: "Pray Fajr in the masjid" }, category: "prayer", completed: false },
    { id: "2", title: { ar: "اقرأ جزءاً من القرآن", nl: "Lees een juz' van de Qur'aan", en: "Read one juz' of Qur'aan" }, category: "quran", completed: false },
    { id: "3", title: { ar: "تصدّق ولو بشيء يسير", nl: "Geef sadaqah, al is het weinig", en: "Give sadaqah, even if small" }, category: "akhlaq", completed: false },
    { id: "4", title: { ar: "اطلب العلم: اقرأ أو استمع لدرس", nl: "Zoek kennis: lees of luister naar een les", en: "Seek knowledge: read or listen to a lesson" }, category: "learning", completed: false },
    { id: "5", title: { ar: "أصلح بين اثنين أو انصح أخاك", nl: "Breng twee mensen samen of adviseer je broeder", en: "Reconcile between two or advise your brother" }, category: "akhlaq", completed: false },
    { id: "6", title: { ar: "خطط ليومك وحدد أهدافك", nl: "Plan je dag en stel doelen", en: "Plan your day and set goals" }, category: "learning", completed: false },
  ],
};

const CATEGORY_ICONS: Record<string, string> = {
  prayer: "🕌", quran: "📖", family: "👨‍👩‍👧‍👦", akhlaq: "💎", health: "💪", learning: "📚", dhikr: "📿",
};

export default function ChildChallengesScreen() {
  const colors = useColors();
  const router = useRouter();
  const { t, language, isRTL } = useI18n();
  const params = useLocalSearchParams<{ accountId: string; ageGroup: string }>();
  const ageGroup = params.ageGroup || "12-14";

  const [challenges, setChallenges] = useState<Challenge[]>(
    DAILY_CHALLENGES[ageGroup] || DAILY_CHALLENGES["12-14"]
  );

  const completedCount = challenges.filter(c => c.completed).length;
  const progress = challenges.length > 0 ? completedCount / challenges.length : 0;
  const toggleChallenge = (id: string) => setChallenges(prev => prev.map(c => c.id === id ? { ...c, completed: !c.completed } : c));

  const flexDir = isRTL ? "row-reverse" as const : "row" as const;
  const textAlign = isRTL ? "right" as const : "left" as const;

  return (
    <ScreenContainer className="p-4" edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={{ flexDirection: flexDir, alignItems: "center", marginBottom: 20 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
            <Text style={{ color: colors.primary, fontSize: 16 }}>{t("child_challenges.back")}</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ color: colors.foreground, fontSize: 20, fontWeight: "bold" }}>🎯 {t("child_challenges.title")}</Text>
          </View>
          <View style={{ width: 50 }} />
        </View>

        {/* Progress */}
        <View className="bg-surface rounded-2xl p-4 mb-4 border border-border items-center">
          <Text style={{ fontSize: 40 }}>{completedCount === challenges.length ? "🎉" : "💪"}</Text>
          <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "bold", marginTop: 8 }}>
            {completedCount} / {challenges.length}
          </Text>
          <View style={{ width: "100%", height: 8, backgroundColor: colors.border, borderRadius: 4, marginTop: 12, overflow: "hidden" }}>
            <View style={{ width: `${progress * 100}%`, height: "100%", backgroundColor: colors.success, borderRadius: 4 }} />
          </View>
          {completedCount === challenges.length && (
            <Text style={{ color: colors.success, marginTop: 8, fontWeight: "bold" }}>{t("child_challenges.all_done")}</Text>
          )}
        </View>

        {/* Challenges List */}
        {challenges.map(challenge => (
          <TouchableOpacity
            key={challenge.id}
            onPress={() => toggleChallenge(challenge.id)}
            style={{
              flexDirection: flexDir,
              alignItems: "center",
              padding: 16,
              marginBottom: 8,
              backgroundColor: challenge.completed ? colors.success + "15" : colors.surface,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: challenge.completed ? colors.success : colors.border,
            }}
          >
            <Text style={{ fontSize: 24, marginHorizontal: 12 }}>
              {challenge.completed ? "✅" : CATEGORY_ICONS[challenge.category] || "⬜"}
            </Text>
            <Text style={{
              flex: 1,
              textAlign,
              color: colors.foreground,
              fontSize: 15,
              textDecorationLine: challenge.completed ? "line-through" : "none",
              opacity: challenge.completed ? 0.7 : 1,
            }}>
              {challenge.title[language] || challenge.title.ar}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </ScreenContainer>
  );
}
