import { useState, useRef, useEffect } from "react";
import { Text, View, ScrollView, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import { startScreenTracking, endScreenTracking } from "@/lib/app-usage-tracker";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function ChildAskAIScreen() {
  const colors = useColors();
  const router = useRouter();
  const { language, isRTL } = useI18n();
  const params = useLocalSearchParams<{ accountId: string; ageGroup: string; gender: string }>();
  const accountId = Number(params.accountId) || 0;
  const ageGroup = params.ageGroup || "12-14";
  const gender = params.gender || "male";

  useEffect(() => {
    startScreenTracking("ask-ai");
    return () => { endScreenTracking(); };
  }, []);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const textAlign = isRTL ? "right" as const : "left" as const;
  const flexDir = isRTL ? "row-reverse" as const : "row" as const;

  const sendMutation = trpc.childAiChat.sendMessage.useMutation({
    onSuccess: (data: any) => {
      if (data.conversationId) setConversationId(data.conversationId);
      setMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
      setIsLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    },
    onError: () => {
      setMessages(prev => [...prev, { role: "assistant", content: language === "ar" ? "عذراً، حدث خطأ. حاول مرة أخرى." : "Sorry, er ging iets mis. Probeer opnieuw." }]);
      setIsLoading(false);
    },
  });

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    const userMsg = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setIsLoading(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

    sendMutation.mutate({
      childAccountId: accountId,
      message: userMsg,
      conversationId: conversationId || 0,
      childAge: typeof ageGroup === "string" ? parseInt(ageGroup) || 0 : (ageGroup || 0),
      childGender: gender,
    });
  };

  const welcomeMessage = language === "ar"
    ? "السلام عليكم! أنا مساعدك. يمكنك أن تسألني عن أي شيء يتعلق بدينك أو دراستك أو حياتك. سأجيبك بإذن الله بما يناسب عمرك."
    : language === "nl"
    ? "Assalaamu 'alaykum! Ik ben je helper. Je kunt me alles vragen over je dien, studie of leven. Ik zal je in shaa Allaah antwoorden op een manier die bij je leeftijd past."
    : "Assalaamu 'alaykum! I'm your helper. You can ask me anything about your deen, studies or life. I will answer you in shaa Allaah in a way suitable for your age.";

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* Header */}
        <View style={{ flexDirection: flexDir, alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
            <Text style={{ color: colors.primary, fontSize: 16 }}>{isRTL ? "→" : "←"}</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "bold" }}>
              🤖 {language === "ar" ? "اسأل الذكاء الاصطناعي" : language === "nl" ? "Vraag AI" : "Ask AI"}
            </Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1, padding: 16 }}
          contentContainerStyle={{ paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Welcome message */}
          {messages.length === 0 && (
            <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 12, maxWidth: "85%" }}>
              <Text style={{ color: colors.foreground, textAlign, lineHeight: 22 }}>{welcomeMessage}</Text>
            </View>
          )}

          {messages.map((msg, i) => (
            <View
              key={i}
              style={{
                alignSelf: msg.role === "user" ? (isRTL ? "flex-start" : "flex-end") : (isRTL ? "flex-end" : "flex-start"),
                backgroundColor: msg.role === "user" ? colors.primary : colors.surface,
                borderRadius: 16,
                padding: 12,
                marginBottom: 8,
                maxWidth: "85%",
              }}
            >
              <Text style={{ color: msg.role === "user" ? "#fff" : colors.foreground, textAlign, lineHeight: 22 }}>
                {msg.content}
              </Text>
            </View>
          ))}

          {isLoading && (
            <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 12, maxWidth: "60%", marginBottom: 8 }}>
              <Text style={{ color: colors.muted }}>...</Text>
            </View>
          )}
        </ScrollView>

        {/* Input */}
        <View style={{ flexDirection: flexDir, padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background }}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={language === "ar" ? "اكتب سؤالك هنا..." : "Stel je vraag hier..."}
            placeholderTextColor={colors.muted}
            style={{
              flex: 1,
              backgroundColor: colors.surface,
              borderRadius: 20,
              paddingHorizontal: 16,
              paddingVertical: 10,
              color: colors.foreground,
              borderWidth: 1,
              borderColor: colors.border,
              textAlign,
              maxHeight: 100,
            }}
            multiline
            returnKeyType="send"
            onSubmitEditing={handleSend}
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!input.trim() || isLoading}
            style={{
              backgroundColor: colors.primary,
              borderRadius: 20,
              width: 44,
              height: 44,
              alignItems: "center",
              justifyContent: "center",
              opacity: !input.trim() || isLoading ? 0.5 : 1,
            }}
          >
            <Text style={{ color: "#fff", fontSize: 18 }}>➤</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
