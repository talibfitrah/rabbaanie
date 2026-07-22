import { useState } from "react";
import { Text, View, ScrollView, TouchableOpacity, TextInput, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useI18n } from "@/lib/i18n";

const UPDATE_TYPES = [
  { key: "daily_report", label: { ar: "تقرير يومي", nl: "Dagelijks rapport", en: "Daily report" }, icon: "📋" },
  { key: "achievement", label: { ar: "إنجاز", nl: "Prestatie", en: "Achievement" }, icon: "🏆" },
  { key: "concern", label: { ar: "ملاحظة/قلق", nl: "Opmerking/zorg", en: "Note/concern" }, icon: "⚠️" },
  { key: "wird", label: { ar: "ورد وعبادة", nl: "Wird en 'ibaadah", en: "Wird and worship" }, icon: "📖" },
  { key: "behavior", label: { ar: "سلوك", nl: "Gedrag", en: "Behavior" }, icon: "💎" },
  { key: "health", label: { ar: "صحة", nl: "Gezondheid", en: "Health" }, icon: "🏥" },
] as const;

export default function SharedUpdatesScreen() {
  const colors = useColors();
  const router = useRouter();
  const { t, language, isRTL } = useI18n();
  const params = useLocalSearchParams<{ childId: string; childName: string }>();
  const childId = Number(params.childId) || 0;
  const childName = params.childName || t("shared_updates.child");

  const [showForm, setShowForm] = useState(false);
  const [selectedType, setSelectedType] = useState<string>("daily_report");
  const [content, setContent] = useState("");

  const flexDir = isRTL ? "row-reverse" as const : "row" as const;
  const textAlign = isRTL ? "right" as const : "left" as const;

  const updatesQuery = trpc.sharedUpdates.list.useQuery({ childId, limit: 30 }, { enabled: childId > 0 });
  const createMutation = trpc.sharedUpdates.create.useMutation({
    onSuccess: () => { setContent(""); setShowForm(false); updatesQuery.refetch(); Alert.alert("✓", t("shared_updates.added")); },
  });
  const markReadMutation = trpc.sharedUpdates.markRead.useMutation();

  const updates = updatesQuery.data || [];

  const handleSubmit = () => {
    if (!content.trim()) { Alert.alert("✗", t("shared_updates.write_content")); return; }
    createMutation.mutate({ childId, updateType: selectedType as any, content: content.trim() });
  };

  return (
    <ScreenContainer className="p-4" edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={{ flexDirection: flexDir, alignItems: "center", marginBottom: 20 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
            <Text style={{ color: colors.primary, fontSize: 16 }}>{t("shared_updates.back")}</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ color: colors.foreground, fontSize: 20, fontWeight: "bold" }}>{t("shared_updates.title")} {childName}</Text>
          </View>
          <View style={{ width: 50 }} />
        </View>

        {/* Info Banner */}
        <View style={{ backgroundColor: colors.primary + "15", borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: colors.primary + "30" }}>
          <Text style={{ color: colors.foreground, textAlign, fontSize: 13, lineHeight: 20 }}>{t("shared_updates.info")}</Text>
        </View>

        {/* Add Update Button */}
        {!showForm && (
          <TouchableOpacity onPress={() => setShowForm(true)} style={{ backgroundColor: colors.primary, borderRadius: 12, padding: 14, alignItems: "center", marginBottom: 16 }}>
            <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 16 }}>+ {t("shared_updates.add")}</Text>
          </TouchableOpacity>
        )}

        {/* Add Update Form */}
        {showForm && (
          <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.foreground, fontWeight: "bold", textAlign, marginBottom: 12 }}>{t("shared_updates.type")}:</Text>
            <View style={{ flexDirection: flexDir, flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {UPDATE_TYPES.map(type => (
                <TouchableOpacity
                  key={type.key}
                  onPress={() => setSelectedType(type.key)}
                  style={{ backgroundColor: selectedType === type.key ? colors.primary + "20" : "transparent", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: selectedType === type.key ? colors.primary : colors.border }}
                >
                  <Text style={{ color: colors.foreground, fontSize: 13 }}>{type.icon} {type.label[language] || type.label.ar}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              value={content}
              onChangeText={setContent}
              placeholder={t("shared_updates.placeholder")}
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              style={{ backgroundColor: colors.background, borderRadius: 12, padding: 12, fontSize: 15, color: colors.foreground, textAlign, minHeight: 100, borderWidth: 1, borderColor: colors.border, marginBottom: 12 }}
            />

            <View style={{ flexDirection: flexDir, gap: 8 }}>
              <TouchableOpacity onPress={handleSubmit} disabled={createMutation.isPending} style={{ flex: 1, backgroundColor: colors.primary, borderRadius: 10, padding: 12, alignItems: "center" }}>
                <Text style={{ color: "#fff", fontWeight: "bold" }}>{createMutation.isPending ? "..." : t("shared_updates.send")}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowForm(false)} style={{ flex: 1, backgroundColor: colors.border, borderRadius: 10, padding: 12, alignItems: "center" }}>
                <Text style={{ color: colors.foreground, fontWeight: "bold" }}>{t("shared_updates.cancel")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Updates List */}
        <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "bold", textAlign, marginBottom: 12 }}>{t("shared_updates.previous")}</Text>

        {updates.length === 0 ? (
          <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 24, alignItems: "center" }}>
            <Text style={{ fontSize: 40 }}>📋</Text>
            <Text style={{ color: colors.muted, marginTop: 8 }}>{t("shared_updates.empty")}</Text>
          </View>
        ) : (
          updates.map((update: any, i: number) => {
            const typeInfo = UPDATE_TYPES.find(ut => ut.key === update.updateType) || UPDATE_TYPES[0];
            return (
              <TouchableOpacity
                key={i}
                onPress={() => { if (!update.isRead) markReadMutation.mutate({ updateId: update.id }); }}
                style={{ backgroundColor: update.isRead ? colors.surface : colors.primary + "10", borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: update.isRead ? colors.border : colors.primary + "30" }}
              >
                <View style={{ flexDirection: flexDir, justifyContent: "space-between", marginBottom: 6 }}>
                  <Text style={{ color: colors.foreground, fontWeight: "bold", fontSize: 14 }}>{typeInfo.icon} {typeInfo.label[language] || typeInfo.label.ar}</Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>{new Date(update.createdAt).toLocaleDateString(language === "ar" ? "ar-SA" : language === "nl" ? "nl-NL" : "en-US")}</Text>
                </View>
                <Text style={{ color: colors.foreground, textAlign, lineHeight: 22, fontSize: 14 }}>{update.content}</Text>
                {!update.isRead && <Text style={{ color: colors.primary, fontSize: 11, marginTop: 4 }}>{t("shared_updates.new")}</Text>}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
