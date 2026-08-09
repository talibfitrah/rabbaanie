import { useState, useEffect } from "react";
import { Text, View, ScrollView, TouchableOpacity, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { activityTracker } from "@/lib/activity-tracker";
import {
  startScreenTracking,
  endScreenTracking,
  saveSessionsLocally,
  fetchAndStoreExternalUsage,
  isNativeModuleAvailable,
  isUsageStatsPermissionGranted,
  syncUsageToServer,
} from "@/lib/app-usage-tracker";
import {
  hideMonitoringNotice,
  runNoticeGatedCollection,
} from "@/lib/monitoring-notice";
import { CHILD_MONITORING_ENABLED } from "@/lib/distribution";
import { trpc } from "@/lib/trpc";

// Daily wird based on age group (trilingual)
const DAILY_WIRD: Record<
  string,
  Record<string, { quran: string; dhikr: string; dua: string }>
> = {
  "12-14": {
    ar: {
      quran: "قراءة صفحة واحدة من القرآن",
      dhikr: "سبحان الله وبحمده 33 مرة",
      dua: "اللهم اغفر لي ولوالديّ",
    },
    nl: {
      quran: "Lees één pagina Qur'aan",
      dhikr: "SubhanAllaahi wa bihamdihi 33x",
      dua: "Allaahummagh-fir li wa liwaalidayya",
    },
    en: {
      quran: "Read one page of Qur'aan",
      dhikr: "SubhanAllaahi wa bihamdihi 33x",
      dua: "Allaahummagh-fir li wa liwaalidayya",
    },
  },
  "15-17": {
    ar: {
      quran: "قراءة صفحتين من القرآن",
      dhikr: "أذكار الصباح والمساء",
      dua: "اللهم إني أعوذ بك من علم لا ينفع",
    },
    nl: {
      quran: "Lees twee pagina's Qur'aan",
      dhikr: "Ochtend- en avond-adhkaar",
      dua: "Allaahoemma inni a'oedhu bika min 'ilmin laa yanfa'",
    },
    en: {
      quran: "Read two pages of Qur'aan",
      dhikr: "Morning and evening adhkaar",
      dua: "Allaahummaa inni a'oodhu bika min 'ilmin laa yanfa'",
    },
  },
  "18+": {
    ar: {
      quran: "قراءة حزب من القرآن",
      dhikr: "أذكار الصباح والمساء كاملة",
      dua: "دعاء الاستخارة عند كل قرار",
    },
    nl: {
      quran: "Lees een hizb van de Qur'aan",
      dhikr: "Volledige ochtend- en avond-adhkaar",
      dua: "Istikhaara-du'aa bij elke beslissing",
    },
    en: {
      quran: "Read one hizb of Qur'aan",
      dhikr: "Full morning and evening adhkaar",
      dua: "Istikhaara du'aa for every decision",
    },
  },
};

// Fitna warnings (trilingual)
const FITNA_WARNINGS: Record<
  string,
  Record<string, Record<string, string[]>>
> = {
  "12-14": {
    male: {
      ar: [
        "احذر من الألعاب التي تحتوي على موسيقى أو صور محرمة",
        "لا تقبل صداقات من مجهولين على الإنترنت",
        "إذا رأيت شيئاً مخيفاً أو محرماً، أخبر والديك فوراً",
      ],
      nl: [
        "Pas op voor games met muziek of verboden afbeeldingen",
        "Accepteer geen vriendschappen van onbekenden online",
        "Als je iets engs of haraams ziet, vertel het direct aan je ouders",
      ],
      en: [
        "Beware of games with music or forbidden images",
        "Don't accept friendships from strangers online",
        "If you see something scary or haram, tell your parents immediately",
      ],
    },
    female: {
      ar: [
        "لا تشاركي صورك مع أي شخص على الإنترنت",
        "احذري من التطبيقات التي تطلب معلومات شخصية",
        "إذا أزعجك أحد، أخبري والديك فوراً",
      ],
      nl: [
        "Deel je foto's niet met iemand online",
        "Pas op voor apps die persoonlijke informatie vragen",
        "Als iemand je lastigvalt, vertel het direct aan je ouders",
      ],
      en: [
        "Don't share your photos with anyone online",
        "Beware of apps that ask for personal information",
        "If someone bothers you, tell your parents immediately",
      ],
    },
  },
  "15-17": {
    male: {
      ar: [
        "غض البصر عبادة عظيمة - استعن بالله",
        "الصحبة الصالحة حصن من الفتن",
        "إذا وقعت في ذنب، بادر بالتوبة ولا تيأس من رحمة الله",
        "احذر من المواقع والتطبيقات المشبوهة",
      ],
      nl: [
        "Het neerslaan van de blik is een grote 'ibaadah - vraag Allaah om hulp",
        "Goed gezelschap is een bescherming tegen fitan",
        "Als je een zonde begaat, haast je met tawbah en wanhoop niet",
        "Pas op voor verdachte websites en apps",
      ],
      en: [
        "Lowering the gaze is a great act of worship - seek Allaah's help",
        "Good companionship is a fortress against fitan",
        "If you commit a sin, hasten to repent and don't despair",
        "Beware of suspicious websites and apps",
      ],
    },
    female: {
      ar: [
        "حجابك عزتك - لا تتنازلي عنه لإرضاء أحد",
        "احذري من العلاقات العاطفية - هي باب للندم",
        "الصحبة الصالحة تعينك على طاعة الله",
        "إذا تعرضتِ لمضايقة، أخبري والديك فوراً",
      ],
      nl: [
        "Je hijaab is je eer - geef het niet op om iemand te behagen",
        "Pas op voor emotionele relaties - ze leiden tot spijt",
        "Goed gezelschap helpt je bij gehoorzaamheid aan Allaah",
        "Als je wordt lastiggevallen, vertel het direct aan je ouders",
      ],
      en: [
        "Your hijab is your honor - don't give it up to please anyone",
        "Beware of emotional relationships - they lead to regret",
        "Good companionship helps you obey Allaah",
        "If you're harassed, tell your parents immediately",
      ],
    },
  },
  "18+": {
    male: {
      ar: [
        "بادر بالزواج إن استطعت - وإلا فعليك بالصوم",
        "اجعل لنفسك ورداً يومياً يحصّنك من الفتن",
        "ابتعد عن مواطن الشبهات والخلوة المحرمة",
        "اختر أصدقاءك بعناية - الصاحب ساحب",
      ],
      nl: [
        "Haast je met het huwelijk als je kunt - anders vast",
        "Maak een dagelijkse wird die je beschermt tegen fitan",
        "Vermijd plaatsen van twijfel en verboden afzondering",
        "Kies je vrienden zorgvuldig - de metgezel trekt mee",
      ],
      en: [
        "Hasten to marriage if you can - otherwise fast",
        "Make a daily wird that protects you from fitan",
        "Stay away from places of doubt and forbidden seclusion",
        "Choose your friends carefully - companions influence you",
      ],
    },
    female: {
      ar: [
        "لا تخضعي بالقول فيطمع الذي في قلبه مرض",
        "الزواج نصف الدين - اختاري صاحب الدين والخلق",
        "احذري من وسائل التواصل التي تعرض القدوات السيئة",
        "كوني قدوة لمن حولك في الحشمة والعفة",
      ],
      nl: [
        "Wees niet zacht in spraak zodat degene met ziekte in zijn hart niet begeert",
        "Huwelijk is de helft van het geloof - kies iemand met dien en karakter",
        "Pas op voor sociale media die slechte rolmodellen tonen",
        "Wees een voorbeeld in bescheidenheid en kuisheid",
      ],
      en: [
        "Don't be soft in speech so that one with disease in his heart desires",
        "Marriage is half of faith - choose someone with deen and character",
        "Beware of social media showing bad role models",
        "Be an example of modesty and chastity",
      ],
    },
  },
};

// Salaf stories (trilingual)
const SALAF_STORIES: Record<string, { title: string; story: string }[]> = {
  ar: [
    {
      title: "عمر بن الخطاب في شبابه",
      story:
        "كان عمر رضي الله عنه شديداً على نفسه، يحاسبها قبل أن يحاسبه الله. قال: حاسبوا أنفسكم قبل أن تحاسبوا.",
    },
    {
      title: "أسامة بن زيد - قائد الجيش وهو شاب",
      story:
        "أمّر النبي ﷺ أسامة بن زيد على جيش فيه أبو بكر وعمر وهو ابن 18 سنة.",
    },
    {
      title: "فاطمة الزهراء - قدوة البنات",
      story:
        "كانت فاطمة رضي الله عنها تخدم أباها وزوجها وتربي أبناءها. كانت أشبه الناس بالنبي ﷺ.",
    },
    {
      title: "أسماء بنت أبي بكر - ذات النطاقين",
      story: "حملت الطعام للنبي ﷺ وأبيها في الهجرة وهي حامل. شجاعة وإيمان.",
    },
  ],
  nl: [
    {
      title: "'Umar ibn al-Khattaab in zijn jeugd",
      story:
        "'Umar was streng voor zichzelf en hield zichzelf verantwoordelijk voordat Allaah hem ter verantwoording zou roepen.",
    },
    {
      title: "Usaamah ibn Zayd - legerleider als jongere",
      story:
        "De Profeet ﷺ stelde Usaamah aan als leider van een leger met Abu Bakr en 'Umar erin, op 18-jarige leeftijd.",
    },
    {
      title: "Faatimah az-Zahraa - rolmodel voor meisjes",
      story:
        "Faatimah diende haar vader, haar man en voedde haar kinderen op. Zij leek het meest op de Profeet ﷺ.",
    },
    {
      title: "Asmaa bint Abi Bakr - Dhaat an-Nitaaqayn",
      story:
        "Zij droeg voedsel naar de Profeet ﷺ en haar vader tijdens de hijrah terwijl ze zwanger was. Moed en imaan.",
    },
  ],
  en: [
    {
      title: "'Umar ibn al-Khattaab in his youth",
      story:
        "'Umar was strict with himself, holding himself accountable before Allaah would hold him accountable.",
    },
    {
      title: "Usaamah ibn Zayd - army leader as a youth",
      story:
        "The Prophet ﷺ appointed Usaamah as leader of an army with Abu Bakr and 'Umar in it, at age 18.",
    },
    {
      title: "Faatimah az-Zahraa - role model for girls",
      story:
        "Faatimah served her father, husband and raised her children. She resembled the Prophet ﷺ the most.",
    },
    {
      title: "Asmaa bint Abi Bakr - Dhaat an-Nitaaqayn",
      story:
        "She carried food to the Prophet ﷺ and her father during hijrah while pregnant. Courage and faith.",
    },
  ],
};

export default function ChildHomeScreen() {
  const colors = useColors();
  const router = useRouter();
  const { t, language } = useI18n();
  const params = useLocalSearchParams<{
    accountId: string;
    ageGroup: string;
    gender: string;
  }>();
  const ageGroup = params.ageGroup || "12-14";
  const gender = params.gender || "male";
  const accountId = params.accountId || "0";

  const bulkLogMutation = trpc.childAppUsage.bulkLog.useMutation();

  // Initialize activity tracking for child session + sync external usage
  useEffect(() => {
    const id = Number(accountId) || 0;
    let cancelled = false;
    if (id > 0) {
      activityTracker.init(id);
      // Auto-sync external app usage on open (Android native builds only).
      //
      // CHILD_MONITORING_ENABLED is checked first, and deliberately not only
      // isNativeModuleAvailable(). Child mode itself ships on both channels now,
      // so the route-level channel block that used to make this file
      // unreachable on Play is gone — leaving the native module's absence as the
      // only thing preventing PACKAGE_USAGE_STATS collection in a Play build.
      // That is an accident of the autolinking exclusion in app.config.ts, not a
      // decision: any change to withPlayMonitoringDisabled would silently turn
      // collection back on here. The channel is the actual invariant, so state it.
      if (CHILD_MONITORING_ENABLED && isNativeModuleAvailable()) {
        // Play's Stalkerware policy requires a persistent notice on the
        // monitored device whenever monitoring is active. Gate it on the
        // permission actually being granted: with no permission nothing is
        // collected, and a notice claiming otherwise would be a lie.
        if (isUsageStatsPermissionGranted()) {
          void (async () => {
            await runNoticeGatedCollection({
              language,
              isCancelled: () => cancelled,
              keepNoticeVisible: true,
              collect: async () => {
                await fetchAndStoreExternalUsage();
                if (cancelled) return;

                const data = await syncUsageToServer(id, "");
                if (!cancelled && data && data.apps.length > 0) {
                  bulkLogMutation.mutate({
                    childAccountId: id,
                    date: data.date,
                    apps: data.apps,
                  });
                }
              },
            });
          })().catch((error) => {
            console.warn("[Monitoring] Usage sync failed:", error);
          });
        }
      }
    }
    startScreenTracking("child-home");
    return () => {
      cancelled = true;
      endScreenTracking();
      saveSessionsLocally();
      activityTracker.endSession();
      // "Logout" here is a back-navigation to /(tabs), so this teardown is the
      // only hook that runs when the child session ends.
      hideMonitoringNotice();
    };
  }, [accountId, language]);

  const [wirdCompleted, setWirdCompleted] = useState({
    quran: false,
    dhikr: false,
    dua: false,
  });
  const wird = DAILY_WIRD[ageGroup]?.[language] || DAILY_WIRD["12-14"].ar;
  const warnings = FITNA_WARNINGS[ageGroup]?.[gender]?.[language] || [];
  const stories = SALAF_STORIES[language] || SALAF_STORIES.ar;
  const todayStory = stories[new Date().getDay() % stories.length];

  const isRTL = language === "ar";
  const textAlign = isRTL ? ("right" as const) : ("left" as const);
  const flexDir = isRTL ? ("row-reverse" as const) : ("row" as const);

  return (
    <ScreenContainer className="p-4" edges={["top", "bottom", "left", "right"]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="items-center gap-2 mb-6">
          <Text className="text-3xl font-bold text-foreground">
            {language === "ar"
              ? "السلام عليكم 🌟"
              : language === "nl"
                ? "Assalaamu 'alaykum 🌟"
                : "Assalaamu 'alaykum 🌟"}
          </Text>
          <Text className="text-base text-muted">
            {new Date().toLocaleDateString(
              language === "ar"
                ? "ar-SA"
                : language === "nl"
                  ? "nl-NL"
                  : "en-US",
              { weekday: "long", day: "numeric", month: "long" },
            )}
          </Text>
        </View>

        {/* Daily Wird Section */}
        <View className="bg-surface rounded-2xl p-4 mb-4 border border-border">
          <Text
            style={{
              fontSize: 18,
              fontWeight: "bold",
              color: colors.foreground,
              marginBottom: 12,
              textAlign,
            }}
          >
            📖 {t("child_home.daily_wird")}
          </Text>
          {Object.entries(wird).map(([key, text]) => (
            <TouchableOpacity
              key={key}
              onPress={() =>
                setWirdCompleted((prev) => ({
                  ...prev,
                  [key]: !prev[key as keyof typeof prev],
                }))
              }
              style={{
                flexDirection: flexDir,
                alignItems: "center",
                padding: 12,
                marginBottom: 8,
                backgroundColor: wirdCompleted[
                  key as keyof typeof wirdCompleted
                ]
                  ? colors.success + "20"
                  : "transparent",
                borderRadius: 12,
                borderWidth: 1,
                borderColor: wirdCompleted[key as keyof typeof wirdCompleted]
                  ? colors.success
                  : colors.border,
              }}
            >
              <Text style={{ fontSize: 20, marginHorizontal: 12 }}>
                {wirdCompleted[key as keyof typeof wirdCompleted] ? "✅" : "⬜"}
              </Text>
              <Text
                style={{
                  flex: 1,
                  textAlign,
                  color: colors.foreground,
                  fontSize: 15,
                }}
              >
                {text}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Fitna Warnings */}
        <View
          className="bg-surface rounded-2xl p-4 mb-4 border border-border"
          style={{ borderColor: colors.warning }}
        >
          <Text
            style={{
              fontSize: 18,
              fontWeight: "bold",
              color: colors.foreground,
              marginBottom: 12,
              textAlign,
            }}
          >
            ⚠️ {t("child_home.warnings")}
          </Text>
          {warnings.map((warning, i) => (
            <View
              key={i}
              style={{
                flexDirection: flexDir,
                marginBottom: 8,
                alignItems: "flex-start",
              }}
            >
              <Text
                style={{
                  color: colors.warning,
                  marginHorizontal: 8,
                  fontSize: 16,
                }}
              >
                •
              </Text>
              <Text
                style={{
                  flex: 1,
                  textAlign,
                  color: colors.foreground,
                  fontSize: 14,
                  lineHeight: 22,
                }}
              >
                {warning}
              </Text>
            </View>
          ))}
        </View>

        {/* Salaf Story */}
        <View className="bg-surface rounded-2xl p-4 mb-4 border border-border">
          <Text
            style={{
              fontSize: 18,
              fontWeight: "bold",
              color: colors.foreground,
              marginBottom: 8,
              textAlign,
            }}
          >
            📚 {t("child_home.salaf_story")}: {todayStory.title}
          </Text>
          <Text
            style={{
              color: colors.foreground,
              fontSize: 14,
              lineHeight: 24,
              textAlign,
            }}
          >
            {todayStory.story}
          </Text>
        </View>

        {/* Quick Actions Grid */}
        <View
          style={{
            flexDirection: flexDir,
            flexWrap: "wrap",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <TouchableOpacity
            onPress={() =>
              router.push({
                pathname: "/child-account/ask-ai",
                params: { accountId, ageGroup, gender },
              })
            }
            style={{
              width: "47%",
              backgroundColor: colors.surface,
              borderRadius: 16,
              padding: 16,
              alignItems: "center",
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ fontSize: 32 }}>🤖</Text>
            <Text
              style={{
                color: colors.foreground,
                fontWeight: "bold",
                marginTop: 8,
              }}
            >
              {language === "ar"
                ? "اسأل"
                : language === "nl"
                  ? "Vraag AI"
                  : "Ask AI"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() =>
              router.push({
                pathname: "/child-account/child-chat",
                params: { accountId },
              })
            }
            style={{
              width: "47%",
              backgroundColor: colors.surface,
              borderRadius: 16,
              padding: 16,
              alignItems: "center",
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ fontSize: 32 }}>💬</Text>
            <Text
              style={{
                color: colors.foreground,
                fontWeight: "bold",
                marginTop: 8,
              }}
            >
              {language === "ar"
                ? "رسائل الوالدين"
                : language === "nl"
                  ? "Ouders chat"
                  : "Parents chat"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() =>
              router.push({
                pathname: "/child-account/my-tasks",
                params: { accountId },
              })
            }
            style={{
              width: "47%",
              backgroundColor: colors.surface,
              borderRadius: 16,
              padding: 16,
              alignItems: "center",
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ fontSize: 32 }}>📋</Text>
            <Text
              style={{
                color: colors.foreground,
                fontWeight: "bold",
                marginTop: 8,
              }}
            >
              {language === "ar"
                ? "مهامي"
                : language === "nl"
                  ? "Mijn taken"
                  : "My tasks"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() =>
              router.push({
                pathname: "/child-account/advisor",
                params: { accountId, ageGroup, gender },
              })
            }
            style={{
              width: "47%",
              backgroundColor: colors.surface,
              borderRadius: 16,
              padding: 16,
              alignItems: "center",
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ fontSize: 32 }}>🧑‍🏫</Text>
            <Text
              style={{
                color: colors.foreground,
                fontWeight: "bold",
                marginTop: 8,
              }}
            >
              {t("child_home.advisor")}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() =>
              router.push({
                pathname: "/child-account/challenges",
                params: { accountId, ageGroup },
              })
            }
            style={{
              width: "47%",
              backgroundColor: colors.surface,
              borderRadius: 16,
              padding: 16,
              alignItems: "center",
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ fontSize: 32 }}>🎯</Text>
            <Text
              style={{
                color: colors.foreground,
                fontWeight: "bold",
                marginTop: 8,
              }}
            >
              {t("child_home.challenges")}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() =>
              router.push({
                pathname: "/child-account/achievements",
                params: { accountId },
              })
            }
            style={{
              width: "47%",
              backgroundColor: colors.surface,
              borderRadius: 16,
              padding: 16,
              alignItems: "center",
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ fontSize: 32 }}>🏆</Text>
            <Text
              style={{
                color: colors.foreground,
                fontWeight: "bold",
                marginTop: 8,
              }}
            >
              {t("child_home.achievements")}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() =>
              router.push({
                pathname: "/child-account/app-guide",
                params: { ageGroup },
              })
            }
            style={{
              width: "47%",
              backgroundColor: colors.surface,
              borderRadius: 16,
              padding: 16,
              alignItems: "center",
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ fontSize: 32 }}>📱</Text>
            <Text
              style={{
                color: colors.foreground,
                fontWeight: "bold",
                marginTop: 8,
              }}
            >
              {t("child_home.app_guide")}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Emergency Button */}
        <TouchableOpacity
          onPress={() => {
            Alert.alert(
              "🆘 " + t("child_home.emergency_title"),
              language === "ar"
                ? "لا تقلق، الله غفور رحيم. هل تريد التحدث مع المستشار أو إبلاغ والديك؟"
                : language === "nl"
                  ? "Maak je geen zorgen, Allaah is Vergevingsgezind. Wil je met de adviseur praten of je ouders informeren?"
                  : "Don't worry, Allaah is Most Forgiving. Do you want to talk to the advisor or inform your parents?",
              [
                {
                  text: t("child_home.advisor"),
                  onPress: () =>
                    router.push({
                      pathname: "/child-account/advisor",
                      params: {
                        accountId,
                        ageGroup,
                        gender,
                        emergency: "true",
                      },
                    }),
                },
                {
                  text:
                    language === "ar"
                      ? "إبلاغ والديّ"
                      : language === "nl"
                        ? "Ouders informeren"
                        : "Inform parents",
                  onPress: () =>
                    Alert.alert("✓", t("child_home.emergency_sent")),
                },
                {
                  text:
                    language === "ar"
                      ? "إلغاء"
                      : language === "nl"
                        ? "Annuleren"
                        : "Cancel",
                  style: "cancel",
                },
              ],
            );
          }}
          style={{
            backgroundColor: colors.error,
            borderRadius: 16,
            padding: 16,
            alignItems: "center",
            marginTop: 8,
          }}
        >
          <Text style={{ color: "#fff", fontSize: 18, fontWeight: "bold" }}>
            🆘 {t("child_home.emergency_title")}
          </Text>
        </TouchableOpacity>

        {/* Message to parents */}
        <View style={{ flexDirection: flexDir, gap: 12, marginTop: 16 }}>
          <TouchableOpacity
            onPress={() => Alert.alert("💚", t("child_home.thanks_parents"))}
            style={{
              flex: 1,
              backgroundColor: colors.success + "20",
              borderRadius: 12,
              padding: 12,
              alignItems: "center",
            }}
          >
            <Text style={{ color: colors.success, fontWeight: "bold" }}>
              💚 {t("child_home.thanks_parents")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => Alert.alert("🤲", t("child_home.need_help"))}
            style={{
              flex: 1,
              backgroundColor: colors.primary + "20",
              borderRadius: 12,
              padding: 12,
              alignItems: "center",
            }}
          >
            <Text style={{ color: colors.primary, fontWeight: "bold" }}>
              🤲 {t("child_home.need_help")}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Logout */}
        <TouchableOpacity
          onPress={() => router.replace("/(tabs)")}
          style={{ padding: 16, alignItems: "center", marginTop: 16 }}
        >
          <Text className="text-muted">{t("child_home.logout")}</Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
}
