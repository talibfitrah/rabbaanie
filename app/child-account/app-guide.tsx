import { Text, View, ScrollView, TouchableOpacity } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";

type AppReview = {
  name: string;
  category: Record<string, string>;
  ruling: "halal" | "haram" | "caution";
  reason: Record<string, string>;
  alternative?: Record<string, string>;
};

const APP_REVIEWS: AppReview[] = [
  { name: "TikTok", category: { ar: "تواصل", nl: "Sociaal", en: "Social" }, ruling: "haram", reason: { ar: "محتوى فاحش، موسيقى، تضييع وقت، فتن بصرية", nl: "Onzedelijke inhoud, muziek, tijdverspilling, visuele fitan", en: "Indecent content, music, time waste, visual fitan" }, alternative: { ar: "قناة يوتيوب إسلامية", nl: "Islamitisch YouTube-kanaal", en: "Islamic YouTube channel" } },
  { name: "Instagram", category: { ar: "تواصل", nl: "Sociaal", en: "Social" }, ruling: "haram", reason: { ar: "صور محرمة، مقارنات مؤذية، إضاعة وقت", nl: "Verboden afbeeldingen, schadelijke vergelijkingen, tijdverspilling", en: "Forbidden images, harmful comparisons, time waste" }, alternative: { ar: "تليغرام (قنوات إسلامية)", nl: "Telegram (Islamitische kanalen)", en: "Telegram (Islamic channels)" } },
  { name: "Snapchat", category: { ar: "تواصل", nl: "Sociaal", en: "Social" }, ruling: "haram", reason: { ar: "فلاتر تغيير الخلقة، محتوى زائل يشجع على التهور", nl: "Filters die de schepping veranderen, vluchtige inhoud die roekeloosheid aanmoedigt", en: "Filters changing creation, ephemeral content encouraging recklessness" }, alternative: { ar: "واتساب (للتواصل الضروري)", nl: "WhatsApp (voor noodzakelijke communicatie)", en: "WhatsApp (for necessary communication)" } },
  { name: "Twitter/X", category: { ar: "تواصل", nl: "Sociaal", en: "Social" }, ruling: "caution", reason: { ar: "يمكن استخدامه للعلم لكن فيه فتن كثيرة", nl: "Kan voor kennis gebruikt worden maar bevat veel fitan", en: "Can be used for knowledge but contains many fitan" }, alternative: { ar: "متابعة العلماء فقط", nl: "Volg alleen geleerden", en: "Follow scholars only" } },
  { name: "WhatsApp", category: { ar: "تواصل", nl: "Sociaal", en: "Social" }, ruling: "halal", reason: { ar: "أداة تواصل - الحكم على الاستخدام", nl: "Communicatiemiddel - het oordeel hangt af van gebruik", en: "Communication tool - ruling depends on usage" } },
  { name: "Telegram", category: { ar: "تواصل", nl: "Sociaal", en: "Social" }, ruling: "halal", reason: { ar: "قنوات علمية ودعوية كثيرة", nl: "Veel kennis- en da'wah-kanalen", en: "Many knowledge and da'wah channels" } },
  { name: "Fortnite", category: { ar: "ألعاب", nl: "Games", en: "Games" }, ruling: "haram", reason: { ar: "عنف، موسيقى، رقص محرم، إدمان", nl: "Geweld, muziek, verboden dans, verslaving", en: "Violence, music, forbidden dance, addiction" }, alternative: { ar: "ألعاب ذكاء أو رياضة حقيقية", nl: "Puzzelspellen of echte sport", en: "Puzzle games or real sports" } },
  { name: "PUBG", category: { ar: "ألعاب", nl: "Games", en: "Games" }, ruling: "haram", reason: { ar: "عنف، إدمان، تضييع وقت الصلاة", nl: "Geweld, verslaving, gebedstijd verspillen", en: "Violence, addiction, wasting prayer time" }, alternative: { ar: "رياضة حقيقية مع الأصدقاء", nl: "Echte sport met vrienden", en: "Real sports with friends" } },
  { name: "Minecraft", category: { ar: "ألعاب", nl: "Games", en: "Games" }, ruling: "caution", reason: { ar: "يمكن أن يكون تعليمياً لكن يسبب الإدمان", nl: "Kan educatief zijn maar veroorzaakt verslaving", en: "Can be educational but causes addiction" }, alternative: { ar: "تحديد وقت + وضع إبداعي فقط", nl: "Tijdslimiet + alleen creatieve modus", en: "Time limit + creative mode only" } },
  { name: "YouTube", category: { ar: "تعليم", nl: "Educatie", en: "Education" }, ruling: "caution", reason: { ar: "فيه خير كثير وشر كثير - يحتاج رقابة", nl: "Bevat veel goed en kwaad - heeft toezicht nodig", en: "Contains much good and evil - needs supervision" }, alternative: { ar: "يوتيوب كيدز أو قوائم محددة", nl: "YouTube Kids of specifieke afspeellijsten", en: "YouTube Kids or specific playlists" } },
  { name: "Ayat (Qur'aan)", category: { ar: "تعليم", nl: "Educatie", en: "Education" }, ruling: "halal", reason: { ar: "تطبيق قرآن ممتاز", nl: "Uitstekende Qur'aan-app", en: "Excellent Qur'aan app" } },
  { name: "Hisn al-Muslim", category: { ar: "تعليم", nl: "Educatie", en: "Education" }, ruling: "halal", reason: { ar: "أذكار وأدعية", nl: "Adhkaar en du'aa's", en: "Adhkaar and du'aas" } },
  { name: "Duolingo", category: { ar: "تعليم", nl: "Educatie", en: "Education" }, ruling: "halal", reason: { ar: "تعلم لغات - مفيد", nl: "Talen leren - nuttig", en: "Learning languages - useful" } },
];

const RULING_CONFIG: Record<string, Record<string, { color: string; label: string; bg: string }>> = {
  halal: { ar: { color: "#22C55E", label: "✅ مباح", bg: "#22C55E20" }, nl: { color: "#22C55E", label: "✅ Toegestaan", bg: "#22C55E20" }, en: { color: "#22C55E", label: "✅ Permissible", bg: "#22C55E20" } },
  haram: { ar: { color: "#EF4444", label: "❌ محرم", bg: "#EF444420" }, nl: { color: "#EF4444", label: "❌ Verboden", bg: "#EF444420" }, en: { color: "#EF4444", label: "❌ Forbidden", bg: "#EF444420" } },
  caution: { ar: { color: "#F59E0B", label: "⚠️ حذر", bg: "#F59E0B20" }, nl: { color: "#F59E0B", label: "⚠️ Voorzichtig", bg: "#F59E0B20" }, en: { color: "#F59E0B", label: "⚠️ Caution", bg: "#F59E0B20" } },
};

export default function AppGuideScreen() {
  const colors = useColors();
  const router = useRouter();
  const { t, language, isRTL } = useI18n();
  const params = useLocalSearchParams<{ ageGroup: string }>();

  const categories = Array.from(new Set(APP_REVIEWS.map(a => a.category[language] || a.category.ar)));
  const flexDir = isRTL ? "row-reverse" as const : "row" as const;
  const textAlign = isRTL ? "right" as const : "left" as const;

  return (
    <ScreenContainer className="p-4" edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={{ flexDirection: flexDir, alignItems: "center", marginBottom: 20 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
            <Text style={{ color: colors.primary, fontSize: 16 }}>{t("child_appguide.back")}</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ color: colors.foreground, fontSize: 20, fontWeight: "bold" }}>📱 {t("child_appguide.title")}</Text>
          </View>
          <View style={{ width: 50 }} />
        </View>

        {/* Info */}
        <View className="bg-surface rounded-2xl p-4 mb-4 border border-border">
          <Text style={{ color: colors.foreground, textAlign, lineHeight: 22 }}>
            {t("child_appguide.info")}
          </Text>
        </View>

        {/* Apps by category */}
        {categories.map(category => (
          <View key={category} style={{ marginBottom: 16 }}>
            <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "bold", textAlign, marginBottom: 8 }}>
              {category}
            </Text>
            {APP_REVIEWS.filter(a => (a.category[language] || a.category.ar) === category).map((app, i) => {
              const config = RULING_CONFIG[app.ruling]?.[language] || RULING_CONFIG[app.ruling]?.ar;
              return (
                <View
                  key={i}
                  style={{ backgroundColor: config.bg, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: config.color + "40" }}
                >
                  <View style={{ flexDirection: flexDir, justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ color: colors.foreground, fontWeight: "bold", fontSize: 15 }}>{app.name}</Text>
                    <Text style={{ color: config.color, fontSize: 13, fontWeight: "bold" }}>{config.label}</Text>
                  </View>
                  <Text style={{ color: colors.muted, textAlign, marginTop: 4, fontSize: 13, lineHeight: 20 }}>
                    {app.reason[language] || app.reason.ar}
                  </Text>
                  {app.alternative ? (
                    <Text style={{ color: colors.success, textAlign, marginTop: 4, fontSize: 12 }}>
                      {t("child_appguide.alternative")}: {app.alternative[language] || app.alternative.ar}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </ScreenContainer>
  );
}
