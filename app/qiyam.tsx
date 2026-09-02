import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useI18n } from "@/lib/i18n";
import { QIYAM_HADITH, QIYAM_INSTRUCTIONS } from "@/lib/islamic-reminders";

export default function QiyamScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { language } = useI18n();

  const instructions = QIYAM_INSTRUCTIONS[language] || QIYAM_INSTRUCTIONS.ar;
  const isRTL = language === "ar";

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, isRTL && styles.headerRTL]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
        >
          <MaterialIcons
            name={isRTL ? "arrow-forward" : "arrow-back"}
            size={26}
            color="#1B4332"
          />
        </Pressable>
        <Text style={[styles.headerTitle, isRTL && styles.textRTL]}>
          {language === "ar" ? "قيام الليل" : language === "en" ? "Night Prayer (Qiyaam)" : "Nachtgebed (Qiyaam)"}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
      >
        {/* Night atmosphere header */}
        <View style={styles.nightHeader}>
          <MaterialIcons name="nightlight-round" size={48} color="#C4A35A" />
          <Text style={[styles.nightTitle, isRTL && styles.textRTL]}>
            {language === "ar"
              ? "الثلث الأخير من الليل"
              : language === "en"
              ? "The Last Third of the Night"
              : "Het laatste derde deel van de nacht"}
          </Text>
          <Text style={[styles.nightSubtitle, isRTL && styles.textRTL]}>
            {language === "ar"
              ? "ينزل ربنا تبارك وتعالى كل ليلة إلى السماء الدنيا حين يبقى ثلث الليل الآخر"
              : language === "en"
              ? "Our Lord descends every night to the lowest heaven when the last third of the night remains"
              : "Onze Heer daalt elke nacht neer naar de laagste hemel wanneer het laatste derde van de nacht overblijft"}
          </Text>
        </View>

        {/* Hadith Card */}
        <View style={styles.hadithCard}>
          <View style={styles.hadithHeader}>
            <MaterialIcons name="menu-book" size={22} color="#1B4332" />
            <Text style={[styles.hadithLabel, isRTL && styles.textRTL]}>
              {language === "ar" ? "الحديث" : language === "en" ? "The Hadieth" : "De hadieth"}
            </Text>
          </View>
          <Text style={[styles.hadithText, isRTL && styles.textRTL]}>
            {QIYAM_HADITH.text}
          </Text>
          <Text style={[styles.hadithSource, isRTL && styles.textRTL]}>
            {QIYAM_HADITH.source}
          </Text>
          <View style={styles.explanationBox}>
            <Text style={[styles.explanationText, isRTL && styles.textRTL]}>
              {QIYAM_HADITH.explanation[language] || QIYAM_HADITH.explanation.ar}
            </Text>
          </View>
        </View>

        {/* Dhikr to say when waking up */}
        <View style={styles.dhikrCard}>
          <Text style={[styles.sectionTitle, isRTL && styles.textRTL]}>
            {language === "ar"
              ? "ما يقال عند الاستيقاظ ليلاً"
              : language === "en"
              ? "What to say when waking at night"
              : "Wat te zeggen bij het wakker worden 's nachts"}
          </Text>
          <Text style={[styles.dhikrText, isRTL && styles.textRTL]}>
            لَا إِلَٰهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
          </Text>
          <Text style={[styles.dhikrText, isRTL && styles.textRTL]}>
            الْحَمْدُ لِلَّهِ وَسُبْحَانَ اللَّهِ وَلَا إِلَٰهَ إِلَّا اللَّهُ وَاللَّهُ أَكْبَرُ وَلَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ
          </Text>
          <Text style={[styles.dhikrText, isRTL && styles.textRTL]}>
            اللَّهُمَّ اغْفِرْ لِي
          </Text>
          <View style={styles.rewardBox}>
            <MaterialIcons name="star" size={16} color="#C4A35A" />
            <Text style={[styles.rewardText, isRTL && styles.textRTL]}>
              {language === "ar"
                ? "استُجيب له، فإن توضأ وصلى قُبلت صلاته"
                : language === "en"
                ? "He will be answered. If he makes wudu and prays, his prayer will be accepted."
                : "Hij wordt verhoord. Als hij wudu maakt en bidt, wordt zijn gebed geaccepteerd."}
            </Text>
          </View>
        </View>

        {/* How to pray Qiyam */}
        <View style={styles.instructionsCard}>
          <Text style={[styles.sectionTitle, isRTL && styles.textRTL]}>
            {instructions.title}
          </Text>
          {instructions.steps.map((step, i) => (
            <Text key={i} style={[styles.stepText, isRTL && styles.textRTL]}>
              {step}
            </Text>
          ))}
          <View style={styles.duaBox}>
            <Text style={[styles.duaLabel, isRTL && styles.textRTL]}>
              {language === "ar"
                ? "دعاء استفتاح قيام الليل:"
                : language === "en"
                ? "Opening du'a for night prayer:"
                : "Openingsdu'a voor het nachtgebed:"}
            </Text>
            <Text style={[styles.duaText, isRTL && styles.textRTL]}>
              {instructions.dua}
            </Text>
          </View>
        </View>

        {/* Motivation */}
        <View style={styles.motivationCard}>
          <MaterialIcons name="favorite" size={24} color="#C4A35A" />
          <Text style={[styles.motivationText, isRTL && styles.textRTL]}>
            {language === "ar"
              ? "قال الله تعالى: ﴿تَتَجَافَىٰ جُنُوبُهُمْ عَنِ الْمَضَاجِعِ يَدْعُونَ رَبَّهُمْ خَوْفًا وَطَمَعًا وَمِمَّا رَزَقْنَاهُمْ يُنفِقُونَ﴾"
              : language === "en"
              ? "Allaah says: 'Their sides forsake their beds, to invoke their Lord in fear and hope, and they spend out of what We have bestowed on them.' [32:16]"
              : "Allaah zegt: 'Hun zijden verlaten hun bedden, om hun Heer aan te roepen in vrees en hoop, en zij besteden van wat Wij hun hebben geschonken.' [32:16]"}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0D1B2A",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#1B2838",
    borderBottomWidth: 1,
    borderBottomColor: "#2A3F54",
  },
  headerRTL: {
    flexDirection: "row-reverse",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#C4A35A20",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 20,
    fontWeight: "700",
    color: "#C4A35A",
  },
  textRTL: {
    textAlign: "right",
    writingDirection: "rtl",
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  nightHeader: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 8,
  },
  nightTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#C4A35A",
    textAlign: "center",
  },
  nightSubtitle: {
    fontSize: 14,
    color: "#8BA4B8",
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 16,
  },
  hadithCard: {
    backgroundColor: "#1B2838",
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: "#C4A35A40",
  },
  hadithHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  hadithLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#C4A35A",
  },
  hadithText: {
    fontSize: 16,
    color: "#E8E8E8",
    lineHeight: 28,
    textAlign: "right",
    writingDirection: "rtl",
  },
  hadithSource: {
    fontSize: 12,
    color: "#8BA4B8",
    marginTop: 10,
    textAlign: "right",
  },
  explanationBox: {
    backgroundColor: "#0D1B2A",
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
  },
  explanationText: {
    fontSize: 13,
    color: "#8BA4B8",
    lineHeight: 20,
  },
  dhikrCard: {
    backgroundColor: "#1B2838",
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: "#2A3F54",
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#C4A35A",
    marginBottom: 12,
  },
  dhikrText: {
    fontSize: 16,
    color: "#E8E8E8",
    lineHeight: 28,
    marginBottom: 8,
    textAlign: "right",
    writingDirection: "rtl",
  },
  rewardBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#C4A35A15",
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
  },
  rewardText: {
    flex: 1,
    fontSize: 13,
    color: "#C4A35A",
    lineHeight: 20,
  },
  instructionsCard: {
    backgroundColor: "#1B2838",
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: "#2A3F54",
  },
  stepText: {
    fontSize: 14,
    color: "#D0D0D0",
    lineHeight: 24,
    marginBottom: 4,
  },
  duaBox: {
    backgroundColor: "#0D1B2A",
    borderRadius: 10,
    padding: 14,
    marginTop: 12,
  },
  duaLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#8BA4B8",
    marginBottom: 6,
  },
  duaText: {
    fontSize: 15,
    color: "#E8E8E8",
    lineHeight: 26,
    textAlign: "right",
    writingDirection: "rtl",
  },
  motivationCard: {
    backgroundColor: "#1B2838",
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: "#C4A35A30",
    alignItems: "center",
    gap: 10,
  },
  motivationText: {
    fontSize: 15,
    color: "#D0D0D0",
    lineHeight: 26,
    textAlign: "center",
  },
});
