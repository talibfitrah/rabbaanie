import { Text, View, ScrollView, TouchableOpacity } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";

type Achievement = { id: string; title: Record<string, string>; description: Record<string, string>; icon: string; category: string; earned: boolean };

const ALL_ACHIEVEMENTS: Achievement[] = [
  { id: "1", title: { ar: "أول صلاة فجر", nl: "Eerste Fajr-gebed", en: "First Fajr prayer" }, description: { ar: "صليت الفجر في وقته لأول مرة", nl: "Je bad Fajr op tijd voor het eerst", en: "You prayed Fajr on time for the first time" }, icon: "🌅", category: "prayer", earned: true },
  { id: "2", title: { ar: "ختم جزء عمّ", nl: "Juz' 'Amma voltooid", en: "Completed Juz' 'Amma" }, description: { ar: "أكملت حفظ جزء عمّ", nl: "Je hebt Juz' 'Amma uit je hoofd geleerd", en: "You memorized Juz' 'Amma" }, icon: "📖", category: "quran", earned: true },
  { id: "3", title: { ar: "7 أيام متتالية", nl: "7 dagen op rij", en: "7 days in a row" }, description: { ar: "أكملت التحديات 7 أيام متتالية", nl: "Je voltooide uitdagingen 7 dagen op rij", en: "You completed challenges 7 days in a row" }, icon: "🔥", category: "challenge", earned: false },
  { id: "4", title: { ar: "مساعد الأسرة", nl: "Gezinshelper", en: "Family helper" }, description: { ar: "ساعدت أهلك 10 مرات", nl: "Je hielp je familie 10 keer", en: "You helped your family 10 times" }, icon: "🏠", category: "family", earned: false },
  { id: "5", title: { ar: "طالب علم", nl: "Kenniszoeker", en: "Knowledge seeker" }, description: { ar: "قرأت 5 أحاديث وفهمت معناها", nl: "Je las 5 ahaadieth en begreep ze", en: "You read 5 ahaadeeth and understood them" }, icon: "📚", category: "learning", earned: true },
  { id: "6", title: { ar: "الصائم", nl: "De Vastende", en: "The Fasting one" }, description: { ar: "صمت يوماً تطوعاً", nl: "Je vastte een dag vrijwillig", en: "You fasted a day voluntarily" }, icon: "🌙", category: "fasting", earned: false },
  { id: "7", title: { ar: "المتصدق", nl: "De Gever", en: "The Giver" }, description: { ar: "تصدقت 3 مرات", nl: "Je gaf 3 keer sadaqah", en: "You gave sadaqah 3 times" }, icon: "💰", category: "akhlaq", earned: false },
  { id: "8", title: { ar: "حافظ الورد", nl: "Wird-bewaker", en: "Wird keeper" }, description: { ar: "أكملت وردك اليومي 30 يوماً", nl: "Je voltooide je dagelijkse wird 30 dagen", en: "You completed your daily wird 30 days" }, icon: "⭐", category: "quran", earned: false },
  { id: "9", title: { ar: "الرياضي", nl: "De Sporter", en: "The Athlete" }, description: { ar: "مارست الرياضة 10 أيام", nl: "Je sportte 10 dagen", en: "You exercised 10 days" }, icon: "💪", category: "health", earned: false },
  { id: "10", title: { ar: "صلاة الجماعة", nl: "Groepsgebed", en: "Congregational prayer" }, description: { ar: "صليت في المسجد 5 مرات", nl: "Je bad 5 keer in de moskee", en: "You prayed in the masjid 5 times" }, icon: "🕌", category: "prayer", earned: false },
];

export default function ChildAchievementsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { t, language, isRTL } = useI18n();
  const params = useLocalSearchParams<{ accountId: string }>();

  const earnedCount = ALL_ACHIEVEMENTS.filter(a => a.earned).length;
  const flexDir = isRTL ? "row-reverse" as const : "row" as const;

  return (
    <ScreenContainer className="p-4" edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={{ flexDirection: flexDir, alignItems: "center", marginBottom: 20 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
            <Text style={{ color: colors.primary, fontSize: 16 }}>{t("child_achievements.back")}</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ color: colors.foreground, fontSize: 20, fontWeight: "bold" }}>🏆 {t("child_achievements.title")}</Text>
          </View>
          <View style={{ width: 50 }} />
        </View>

        {/* Stats */}
        <View className="bg-surface rounded-2xl p-4 mb-4 border border-border items-center">
          <Text style={{ fontSize: 48 }}>🏆</Text>
          <Text style={{ color: colors.foreground, fontSize: 24, fontWeight: "bold", marginTop: 8 }}>
            {earnedCount} / {ALL_ACHIEVEMENTS.length}
          </Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>{t("child_achievements.earned")}</Text>
        </View>

        {/* Achievements Grid */}
        <View style={{ flexDirection: flexDir, flexWrap: "wrap", gap: 12 }}>
          {ALL_ACHIEVEMENTS.map(achievement => (
            <View
              key={achievement.id}
              style={{
                width: "47%",
                backgroundColor: achievement.earned ? colors.surface : colors.background,
                borderRadius: 16,
                padding: 16,
                alignItems: "center",
                borderWidth: 1,
                borderColor: achievement.earned ? colors.success : colors.border,
                opacity: achievement.earned ? 1 : 0.5,
              }}
            >
              <Text style={{ fontSize: 36 }}>{achievement.icon}</Text>
              <Text style={{ color: colors.foreground, fontWeight: "bold", marginTop: 8, textAlign: "center", fontSize: 13 }}>
                {achievement.title[language] || achievement.title.ar}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 11, textAlign: "center", marginTop: 4 }}>
                {achievement.description[language] || achievement.description.ar}
              </Text>
              {achievement.earned && (
                <Text style={{ color: colors.success, marginTop: 4, fontSize: 12 }}>✅ {t("child_achievements.earned")}</Text>
              )}
            </View>
          ))}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
