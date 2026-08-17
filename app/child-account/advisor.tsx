import { useState, useRef } from "react";
import { Text, View, ScrollView, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";

type Message = { id: string; role: "user" | "advisor"; text: string };

// Trilingual advisor responses. Exported so tests can assert real content
// instead of grepping source.
export const RESPONSES: Record<string, Record<string, string[]>> = {
  default: {
    ar: ["أحسنت أنك تسأل. قال النبي ﷺ: \"من سلك طريقاً يلتمس فيه علماً سهّل الله له به طريقاً إلى الجنة\"", "تذكّر أن الله يحبك ويريد لك الخير. استعن بالله ولا تعجز.", "هل تريد أن نتحدث أكثر عن هذا الموضوع؟"],
    nl: ["Goed dat je vraagt. De Profeet ﷺ zei: \"Wie een pad bewandelt op zoek naar kennis, Allaah maakt voor hem een pad naar het Paradijs\"", "Onthoud dat Allaah van je houdt en het goede voor je wil.", "Wil je hier meer over praten?"],
    en: ["Good that you ask. The Prophet ﷺ said: \"Whoever treads a path seeking knowledge, Allaah makes easy for him a path to Paradise\"", "Remember that Allaah loves you and wants good for you.", "Would you like to talk more about this?"],
  },
  emergency: {
    ar: ["لا تقلق، باب التوبة مفتوح. قال الله تعالى: \"قل يا عبادي الذين أسرفوا على أنفسهم لا تقنطوا من رحمة الله\"", "أول خطوة: توضأ وصلِّ ركعتين. ثم استغفر الله بصدق.", "لا تيأس أبداً. كل ابن آدم خطّاء وخير الخطائين التوابون."],
    nl: ["Maak je geen zorgen, de deur van tawbah staat open. Allaah zegt: \"Zeg: O Mijn dienaren die buitensporig zijn geweest, wanhoop niet aan de Genade van Allaah\"", "Eerste stap: maak wudoo en bid twee raka'aat. Vraag dan oprecht vergiffenis.", "Wanhoop nooit. Alle kinderen van Aadam maken fouten, en de besten zijn degenen die berouw tonen."],
    en: ["Don't worry, the door of tawbah is open. Allaah says: \"Say: O My servants who have transgressed, do not despair of the Mercy of Allaah\"", "First step: make wudoo and pray two raka'aat. Then sincerely seek forgiveness.", "Never despair. All children of Aadam make mistakes, and the best are those who repent."],
  },
  phone: {
    ar: ["الهاتف أداة - يمكن أن يكون نعمة أو نقمة. اجعله وسيلة للخير.", "نصيحة: حدد وقتاً للهاتف والتزم به. واجعل أول ما تفتحه تطبيق القرآن.", "إذا وجدت نفسك تقضي وقتاً طويلاً، استبدل ذلك بنشاط مفيد."],
    nl: ["De telefoon is een hulpmiddel - het kan een zegen of een vloek zijn. Gebruik het voor het goede.", "Tip: stel een tijdslimiet in en houd je eraan. Open eerst een Qur'aan-app.", "Als je merkt dat je te veel tijd besteedt, vervang het door een nuttige activiteit."],
    en: ["The phone is a tool - it can be a blessing or a curse. Use it for good.", "Tip: set a time limit and stick to it. Open a Qur'aan app first.", "If you find yourself spending too much time, replace it with a useful activity."],
  },
  friends: {
    ar: ["قال النبي ﷺ: \"الرجل على دين خليله فلينظر أحدكم من يخالل\"", "الصديق الصالح يعينك على طاعة الله.", "إذا كان أصدقاؤك يفعلون أشياء خاطئة، انصحهم بلطف. وإن لم يستجيبوا، ابتعد عنهم."],
    nl: ["De Profeet ﷺ zei: \"Een persoon volgt de religie van zijn vriend, dus laat ieder van jullie kijken wie hij bevriend\"", "Een goede vriend helpt je bij gehoorzaamheid aan Allaah.", "Als je vrienden verkeerde dingen doen, adviseer ze vriendelijk. Als ze niet luisteren, neem afstand."],
    en: ["The Prophet ﷺ said: \"A person follows the religion of his friend, so let each of you look at whom he befriends\"", "A good friend helps you obey Allaah.", "If your friends do wrong things, advise them kindly. If they don't listen, distance yourself."],
  },
  prayer: {
    ar: ["قال النبي ﷺ: \"رأس الأمر الإسلام، وعموده الصلاة، وذروة سنامه الجهاد\"", "نصيحة: صلِّ في أول الوقت. واجعل لنفسك مكاناً هادئاً للصلاة.", "إذا فاتتك صلاة، اقضها فوراً واستغفر الله."],
    nl: ["De Profeet ﷺ zei: \"Het hoofd van de zaak is de Islam, de pilaar ervan is het gebed, en de top van zijn bult is de jihaad\"", "Tip: bid aan het begin van de tijd. Maak een rustige plek voor je gebed.", "Als je een gebed mist, haal het direct in en vraag Allaah om vergiffenis."],
    en: ["The Prophet ﷺ said: \"The head of the matter is Islam, its pillar is prayer, and the peak of its hump is jihaad\"", "Tip: pray at the beginning of the time. Make a quiet place for your prayer.", "If you miss a prayer, make it up immediately and seek Allaah's forgiveness."],
  },
};

// Keywords per language for topic detection
const KEYWORDS: Record<string, Record<string, string[]>> = {
  emergency: { ar: ["فتنة", "ذنب", "حرام", "أخطأت"], nl: ["fitnah", "zonde", "haraam", "fout"], en: ["fitnah", "sin", "haram", "mistake"] },
  phone: { ar: ["هاتف", "جوال", "شاشة", "تطبيق"], nl: ["telefoon", "scherm", "app"], en: ["phone", "screen", "app"] },
  friends: { ar: ["صديق", "أصحاب", "رفقة", "صحبة"], nl: ["vriend", "gezelschap"], en: ["friend", "companion"] },
  prayer: { ar: ["صلاة", "صلا", "أصلي"], nl: ["gebed", "salaat", "bidden"], en: ["prayer", "salah", "pray"] },
};

export default function ChildAdvisorScreen() {
  const colors = useColors();
  const router = useRouter();
  const { t, language, isRTL } = useI18n();
  const params = useLocalSearchParams<{ accountId: string; ageGroup: string; gender: string; emergency: string }>();
  const isEmergency = params.emergency === "true";
  const scrollRef = useRef<ScrollView>(null);

  const welcomeMsg: Record<string, { normal: string; emergency: string }> = {
    ar: { normal: "السلام عليكم! أنا مستشارك. يمكنك أن تسألني عن أي شيء. كيف أساعدك اليوم؟", emergency: "أعوذ بالله من الشيطان الرجيم. لا تقلق، أنت في مكان آمن. باب التوبة مفتوح دائماً. كيف يمكنني مساعدتك؟" },
    nl: { normal: "Assalaamu 'alaykum! Ik ben je adviseur. Je kunt me alles vragen. Hoe kan ik je vandaag helpen?", emergency: "A'oedhu billaahi min ash-shaytaan ir-rajiem. Maak je geen zorgen, je bent veilig. De deur van tawbah staat altijd open. Hoe kan ik je helpen?" },
    en: { normal: "Assalaamu 'alaykum! I'm your advisor. You can ask me anything. How can I help you today?", emergency: "A'oodhu billaahi min ash-shaytaan ir-rajeem. Don't worry, you're safe. The door of tawbah is always open. How can I help you?" },
  };

  const [messages, setMessages] = useState<Message[]>([
    { id: "1", role: "advisor", text: isEmergency ? welcomeMsg[language]?.emergency || welcomeMsg.ar.emergency : welcomeMsg[language]?.normal || welcomeMsg.ar.normal },
  ]);
  const [input, setInput] = useState("");

  const getResponse = (userText: string): string => {
    const lower = userText.toLowerCase();
    for (const [topic, langs] of Object.entries(KEYWORDS)) {
      const kws = langs[language] || langs.ar;
      if (kws.some(kw => lower.includes(kw))) {
        const responses = RESPONSES[topic]?.[language] || RESPONSES[topic]?.ar || [];
        return responses[Math.floor(Math.random() * responses.length)];
      }
    }
    const defaults = RESPONSES.default[language] || RESPONSES.default.ar;
    return defaults[Math.floor(Math.random() * defaults.length)];
  };

  const handleSend = () => {
    if (!input.trim()) return;
    const userMsg: Message = { id: Date.now().toString(), role: "user", text: input.trim() };
    const response = getResponse(input.trim());
    const advisorMsg: Message = { id: (Date.now() + 1).toString(), role: "advisor", text: response };
    setMessages(prev => [...prev, userMsg, advisorMsg]);
    setInput("");
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const flexDir = isRTL ? "row-reverse" as const : "row" as const;
  const textAlign = isRTL ? "right" as const : "left" as const;

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        {/* Header */}
        <View style={{ flexDirection: flexDir, alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
            <Text style={{ color: colors.primary, fontSize: 16 }}>{t("child_advisor.back")}</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "bold" }}>💬 {t("child_advisor.title")}</Text>
          </View>
          <View style={{ width: 50 }} />
        </View>

        {/* Messages */}
        <ScrollView ref={scrollRef} style={{ flex: 1, padding: 16 }} contentContainerStyle={{ gap: 12 }}>
          {messages.map(msg => (
            <View
              key={msg.id}
              style={{
                alignSelf: msg.role === "user" ? (isRTL ? "flex-start" : "flex-end") : (isRTL ? "flex-end" : "flex-start"),
                maxWidth: "80%",
                backgroundColor: msg.role === "user" ? colors.primary : colors.surface,
                borderRadius: 16,
                padding: 12,
                borderWidth: msg.role === "advisor" ? 1 : 0,
                borderColor: colors.border,
              }}
            >
              <Text style={{ color: msg.role === "user" ? "#fff" : colors.foreground, fontSize: 15, lineHeight: 24, textAlign }}>
                {msg.text}
              </Text>
            </View>
          ))}
        </ScrollView>

        {/* Input */}
        <View style={{ flexDirection: flexDir, padding: 12, borderTopWidth: 1, borderTopColor: colors.border, gap: 8 }}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={t("child_advisor.placeholder")}
            placeholderTextColor={colors.muted}
            returnKeyType="send"
            onSubmitEditing={handleSend}
            style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: colors.foreground, textAlign }}
          />
          <TouchableOpacity
            onPress={handleSend}
            style={{ backgroundColor: colors.primary, borderRadius: 20, width: 40, height: 40, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: "#fff", fontSize: 18 }}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
