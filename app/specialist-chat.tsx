import React, { useState, useRef, useEffect } from "react";
import {
  Text,
  View,
  TextInput,
  FlatList,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { useI18n } from "@/lib/i18n";
import { getFunctionRoleLabel } from "@/lib/specialist-roles";

const tx = (lang: string, nl: string, en: string, ar: string) =>
  lang === "ar" ? ar : lang === "en" ? en : nl;

export default function SpecialistChatScreen() {
  const colors = useColors();
  const router = useRouter();
  const { id, name, roles } = useLocalSearchParams<{ id: string; name: string; roles?: string }>();
  const { user } = useAuth();
  const { language } = useI18n();
  const lang = language || "nl";
  const isRTL = lang === "ar";
  const [message, setMessage] = useState("");
  const flatListRef = useRef<FlatList>(null);

  const specialistId = parseInt(id || "0");
  const specialistName = decodeURIComponent(name || "Educational Supervisor");
  // Only present when opened from find-specialist (chatting WITH a specialist).
  // Specialist-initiated chats with parents pass no roles and keep the generic
  // subtitle below — parents don't have a functionRole to show.
  const specialistRoleLabel = roles
    ? roles.split(",").map((r) => getFunctionRoleLabel(r, lang as "ar" | "en" | "nl")).join(" • ")
    : null;

  const messagesQuery = trpc.specialist.getMessages.useQuery(
    { specialistId },
    { enabled: specialistId > 0, refetchInterval: 5000 }
  );

  const sendMutation = trpc.specialist.sendMessage.useMutation({
    onSuccess: () => {
      messagesQuery.refetch();
      setMessage("");
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
  });

  const messages_data = (messagesQuery.data || []).sort(
    (a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const sendMessage = () => {
    if (!message.trim()) return;
    sendMutation.mutate({
      specialistId,
      content: message.trim(),
    });
  };

  useEffect(() => {
    if (messages_data.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages_data.length]);

  const renderMessage = ({ item }: { item: any }) => {
    const isMe = item.senderId === user?.id;
    return (
      <View style={[s.msgRow, { justifyContent: isMe ? "flex-end" : "flex-start" }]}>
        <View style={[
          s.msgBubble,
          isMe ? { backgroundColor: "#2E7D32" } : { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }
        ]}>
          <Text style={[s.msgText, { color: isMe ? "#fff" : colors.foreground, textAlign: isRTL ? "right" : "left" }]}>
            {item.content}
          </Text>
          <Text style={[s.msgTime, { color: isMe ? "#ffffffaa" : colors.muted }]}>
            {new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <MaterialIcons name={isRTL ? "chevron-right" : "chevron-left"} size={28} color={colors.foreground} />
        </TouchableOpacity>
        <View style={s.headerInfo}>
          <View style={s.headerAvatar}>
            <MaterialIcons name="person" size={20} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.headerName, { color: colors.foreground }]} numberOfLines={1}>{specialistName}</Text>
            <Text style={[s.headerSubtitle, { color: colors.muted }]} numberOfLines={1}>
              {specialistRoleLabel || tx(lang, "Persoon met kennis", "Person of knowledge", "أهل العلم")}
            </Text>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Messages list */}
        {messagesQuery.isLoading ? (
          <View style={s.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : messages_data.length === 0 ? (
          <View style={s.emptyContainer}>
            <MaterialIcons name="chat-bubble-outline" size={48} color={colors.muted} />
            <Text style={[s.emptyText, { color: colors.muted, textAlign: isRTL ? "right" : "left" }]}>
              {tx(lang,
                "Stuur een bericht om het gesprek te starten. De pedagogisch begeleider kan jouw analyse en die van je kinderen inzien.",
                "Send a message to start the conversation. The educational supervisor can view your analysis and your children's analysis.",
                "أرسل رسالة لبدء المحادثة. يمكن للمشرف التربوي الاطلاع على تحليلك وتحليل أطفالك."
              )}
            </Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages_data}
            renderItem={renderMessage}
            keyExtractor={(item: any) => String(item.id)}
            contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          />
        )}

        {/* Input bar */}
        <View style={[s.inputBar, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <TextInput
            style={[s.input, { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border, textAlign: isRTL ? "right" : "left" }]}
            placeholder={tx(lang, "Typ een bericht...", "Type a message...", "اكتب رسالة...")}
            placeholderTextColor={colors.muted}
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={2000}
            returnKeyType="send"
            onSubmitEditing={sendMessage}
          />
          <TouchableOpacity
            style={[s.sendBtn, { backgroundColor: message.trim() ? "#2E7D32" : colors.surface }]}
            onPress={sendMessage}
            disabled={!message.trim() || sendMutation.isPending}
          >
            {sendMutation.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <MaterialIcons name="send" size={20} color={message.trim() ? "#fff" : colors.muted} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 10, borderBottomWidth: 0.5 },
  backBtn: { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  headerInfo: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  headerAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#2E7D32", justifyContent: "center", alignItems: "center" },
  headerName: { fontSize: 16, fontWeight: "700" },
  headerSubtitle: { fontSize: 11 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32, gap: 12 },
  emptyText: { fontSize: 14, lineHeight: 22, textAlign: "center" },
  msgRow: { flexDirection: "row", marginBottom: 8 },
  msgBubble: { maxWidth: "78%", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  msgText: { fontSize: 15, lineHeight: 21 },
  msgTime: { fontSize: 10, marginTop: 4, alignSelf: "flex-end" },
  inputBar: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 0.5, gap: 8 },
  input: { flex: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, maxHeight: 100, borderWidth: 1 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, justifyContent: "center", alignItems: "center" },
});
