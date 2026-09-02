import { ScrollView, Text, View, TouchableOpacity, RefreshControl, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { useL3 } from "@/lib/admin-text";
import { trpc } from "@/lib/trpc";

/**
 * Admin view of user feedback — contact messages & suggestions from the app and
 * the website (msg 564). Lets the admin read them and mark them as handled.
 */
export default function AdminFeedbackScreen() {
  const colors = useColors();
  const { isRTL } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const align = isRTL ? "right" : "left";
  const L3 = useL3();

  // Accessed via an untyped proxy: the app vendors a type-only copy of the server
  // router that predates these procedures; the tRPC HTTP proxy resolves them at runtime.
  const admin = (trpc as any).admin;
  const listQuery = admin.feedbackList.useQuery();
  const markRead = admin.feedbackMarkRead.useMutation({ onSuccess: () => listQuery.refetch() });
  const items = (listQuery.data as any[]) || [];

  const kindLabel = (k: string) => (k === "suggestion" ? L3("اقتراح", "Suggestie", "Suggestion") : L3("تواصل", "Contact", "Contact"));
  const kindColor = (k: string) => (k === "suggestion" ? "#7C3AED" : "#0891B2");
  const fmt = (d: any) => { try { return new Date(d).toLocaleString(); } catch { return ""; } };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: colors.surface, borderBottomWidth: 0.5, borderBottomColor: colors.border, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()}><MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={24} color={colors.foreground} /></TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, flex: 1, textAlign: align }}>{L3("الرسائل والاقتراحات", "Berichten & suggesties", "Messages & suggestions")}</Text>
        <Text style={{ fontSize: 12, color: colors.muted }}>{items.length}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 12 }} refreshControl={<RefreshControl refreshing={listQuery.isFetching} onRefresh={() => listQuery.refetch()} />}>
        {listQuery.isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : items.length === 0 ? (
          <Text style={{ color: colors.muted, textAlign: "center", marginTop: 40 }}>{L3("لا توجد رسائل بعد.", "Nog geen berichten.", "No messages yet.")}</Text>
        ) : (
          items.map((f) => {
            const isNew = f.status === "new";
            return (
              <View key={f.id} style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: isNew ? colors.primary : colors.border }}>
                <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <View style={{ backgroundColor: kindColor(f.kind), borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>{kindLabel(f.kind)}</Text>
                  </View>
                  <Text style={{ fontSize: 11, color: colors.muted }}>{f.source === "web" ? L3("الموقع", "Website", "Website") : L3("التطبيق", "App", "App")} · {String(f.language || "").toUpperCase()}</Text>
                  {isNew && <View style={{ backgroundColor: colors.primary, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}><Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>{L3("جديد", "Nieuw", "New")}</Text></View>}
                  <Text style={{ fontSize: 10, color: colors.muted, marginLeft: isRTL ? 0 : "auto", marginRight: isRTL ? "auto" : 0 }}>{fmt(f.createdAt)}</Text>
                </View>
                {(f.name || f.email) ? (
                  <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 4, textAlign: align }}>{[f.name, f.email].filter(Boolean).join(" · ")}</Text>
                ) : null}
                <Text style={{ fontSize: 14, color: colors.foreground, lineHeight: 22, textAlign: align }}>{f.message}</Text>
                {isNew && (
                  <TouchableOpacity onPress={() => markRead.mutate({ id: f.id })} style={{ alignSelf: isRTL ? "flex-start" : "flex-end", marginTop: 10, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 4 }}>
                    <MaterialIcons name="done" size={16} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "700" }}>{L3("تمّت المعالجة", "Afgehandeld", "Mark handled")}</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
