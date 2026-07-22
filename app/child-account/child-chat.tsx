import { useState, useRef, useEffect } from "react";
import { Text, View, ScrollView, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import { startScreenTracking, endScreenTracking } from "@/lib/app-usage-tracker";

interface ChatMessage {
  id: number;
  senderType: string;
  content: string;
  createdAt: Date | string;
  isRead: boolean | null;
}

export default function ChildChatScreen() {
  const colors = useColors();
  const router = useRouter();
  const { language, isRTL } = useI18n();
  const params = useLocalSearchParams<{ accountId: string }>();
  const accountId = Number(params.accountId) || 0;

  useEffect(() => {
    startScreenTracking("child-chat");
    return () => { endScreenTracking(); };
  }, []);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const textAlign = isRTL ? "right" as const : "left" as const;
  const flexDir = isRTL ? "row-reverse" as const : "row" as const;

  // Fetch messages
  const messagesQuery = trpc.familyChat.getMessages.useQuery(
    { childAccountId: accountId, limit: 50 },
    { refetchInterval: 10000 }
  );

  useEffect(() => {
    if (messagesQuery.data) {
      setMessages(messagesQuery.data as ChatMessage[]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 200);
    }
  }, [messagesQuery.data]);

  const sendMutation = trpc.familyChat.send.useMutation({
    onSuccess: () => {
      messagesQuery.refetch();
      setIsLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    },
    onError: () => setIsLoading(false),
  });

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    const msg = input.trim();
    setInput("");
    setIsLoading(true);
    sendMutation.mutate({
      childAccountId: accountId,
      senderType: "child" as const,
      content: msg,
    });
  };

  const formatTime = (dateStr: string | Date) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

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
              💬 {language === "ar" ? "رسائل الوالدين" : language === "nl" ? "Ouders chat" : "Parents chat"}
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
          {messages.length === 0 && (
            <View style={{ alignItems: "center", paddingVertical: 40 }}>
              <Text style={{ fontSize: 48, marginBottom: 16 }}>💬</Text>
              <Text style={{ color: colors.muted, textAlign: "center", lineHeight: 22 }}>
                {language === "ar" ? "لا توجد رسائل بعد.\nأرسل رسالة لوالديك!" : language === "nl" ? "Nog geen berichten.\nStuur een bericht naar je ouders!" : "No messages yet.\nSend a message to your parents!"}
              </Text>
            </View>
          )}

          {messages.map((msg) => (
            <View key={msg.id}>
              <View
                style={{
                  alignSelf: msg.senderType === "child" ? (isRTL ? "flex-start" : "flex-end") : (isRTL ? "flex-end" : "flex-start"),
                  backgroundColor: msg.senderType === "child" ? colors.primary : colors.surface,
                  borderRadius: 16,
                  padding: 12,
                  marginBottom: 4,
                  maxWidth: "80%",
                }}
              >
                <Text style={{ color: msg.senderType === "child" ? "#fff" : colors.foreground, textAlign, lineHeight: 20 }}>
                  {msg.content}
                </Text>
              </View>
              <Text style={{
                alignSelf: msg.senderType === "child" ? (isRTL ? "flex-start" : "flex-end") : (isRTL ? "flex-end" : "flex-start"),
                color: colors.muted,
                fontSize: 11,
                marginBottom: 12,
                paddingHorizontal: 4,
              }}>
                {formatTime(msg.createdAt)} {msg.senderType === "parent" ? (language === "ar" ? "الوالد" : "Ouder") : ""}
              </Text>
            </View>
          ))}
        </ScrollView>

        {/* Input */}
        <View style={{ flexDirection: flexDir, padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background }}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={language === "ar" ? "اكتب رسالتك..." : "Schrijf je bericht..."}
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
