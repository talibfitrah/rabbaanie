import { useState } from "react";
import { Text, View, ScrollView, TouchableOpacity, TextInput, Alert } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useI18n } from "@/lib/i18n";

export default function NeighborhoodScreen() {
  const colors = useColors();
  const router = useRouter();
  const { t, language, isRTL } = useI18n();
  const [showJoin, setShowJoin] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDesc, setNewGroupDesc] = useState("");

  const flexDir = isRTL ? "row-reverse" as const : "row" as const;
  const textAlign = isRTL ? "right" as const : "left" as const;

  const joinMutation = trpc.neighborhood.join.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        Alert.alert("✓", t("neighborhood.joined"));
        setShowJoin(false);
        setInviteCode("");
      } else {
        Alert.alert("✗", t("neighborhood.invalid_code"));
      }
    },
  });

  const createMutation = trpc.neighborhood.create.useMutation({
    onSuccess: (result) => {
      Alert.alert("✓", `${t("neighborhood.created")}\n${t("neighborhood.invite_code")}: ${result.inviteCode}`);
      setShowCreate(false);
      setNewGroupName("");
      setNewGroupDesc("");
    },
  });

  const handleJoin = () => {
    if (!inviteCode.trim()) { Alert.alert("✗", t("neighborhood.enter_code")); return; }
    joinMutation.mutate({ inviteCode: inviteCode.trim() });
  };

  const handleCreate = () => {
    if (!newGroupName.trim()) { Alert.alert("✗", t("neighborhood.enter_name")); return; }
    createMutation.mutate({ name: newGroupName.trim(), description: newGroupDesc.trim() || undefined });
  };

  const ACTIVITIES: { icon: string; title: Record<string, string>; desc: Record<string, string> }[] = [
    { icon: "📖", title: { ar: "دروس علمية", nl: "Kennislessen", en: "Knowledge lessons" }, desc: { ar: "حلقات قرآن، دروس فقه، سيرة", nl: "Qur'aan-cirkels, fiqh-lessen, sierah", en: "Qur'aan circles, fiqh lessons, seerah" } },
    { icon: "👶", title: { ar: "أنشطة أطفال", nl: "Kinderactiviteiten", en: "Children activities" }, desc: { ar: "ألعاب تربوية، مسابقات، رحلات", nl: "Educatieve spellen, wedstrijden, uitjes", en: "Educational games, competitions, trips" } },
    { icon: "🤝", title: { ar: "تعاون", nl: "Samenwerking", en: "Cooperation" }, desc: { ar: "مساعدة الجيران، تبادل خبرات", nl: "Buren helpen, ervaringen uitwisselen", en: "Help neighbors, exchange experiences" } },
    { icon: "🕌", title: { ar: "صلاة جماعة", nl: "Gezamenlijk gebed", en: "Congregational prayer" }, desc: { ar: "تنسيق صلاة الفجر والعشاء", nl: "Fajr en 'Ishaa coördineren", en: "Coordinate Fajr and 'Ishaa" } },
    { icon: "⚽", title: { ar: "رياضة", nl: "Sport", en: "Sports" }, desc: { ar: "أنشطة رياضية مشتركة", nl: "Gezamenlijke sportactiviteiten", en: "Joint sports activities" } },
  ];

  return (
    <ScreenContainer className="p-4" edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={{ flexDirection: flexDir, alignItems: "center", marginBottom: 20 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
            <Text style={{ color: colors.primary, fontSize: 16 }}>{t("neighborhood.back")}</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ color: colors.foreground, fontSize: 20, fontWeight: "bold" }}>🏘️ {t("neighborhood.title")}</Text>
          </View>
          <View style={{ width: 50 }} />
        </View>

        {/* Info */}
        <View style={{ backgroundColor: colors.primary + "15", borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: colors.primary + "30" }}>
          <Text style={{ color: colors.foreground, textAlign, lineHeight: 22, fontSize: 14 }}>{t("neighborhood.info")}</Text>
        </View>

        {/* Action Buttons */}
        <View style={{ flexDirection: flexDir, gap: 12, marginBottom: 20 }}>
          <TouchableOpacity
            onPress={() => { setShowJoin(true); setShowCreate(false); }}
            style={{ flex: 1, backgroundColor: colors.primary, borderRadius: 12, padding: 14, alignItems: "center" }}
          >
            <Text style={{ color: "#fff", fontWeight: "bold" }}>{t("neighborhood.join_btn")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { setShowCreate(true); setShowJoin(false); }}
            style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 12, padding: 14, alignItems: "center", borderWidth: 1, borderColor: colors.border }}
          >
            <Text style={{ color: colors.foreground, fontWeight: "bold" }}>{t("neighborhood.create_btn")}</Text>
          </TouchableOpacity>
        </View>

        {/* Join Form */}
        {showJoin && (
          <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.foreground, fontWeight: "bold", textAlign, marginBottom: 8 }}>{t("neighborhood.enter_code")}:</Text>
            <TextInput
              value={inviteCode}
              onChangeText={setInviteCode}
              placeholder="ABC12345"
              placeholderTextColor={colors.muted}
              autoCapitalize="characters"
              returnKeyType="done"
              onSubmitEditing={handleJoin}
              style={{ backgroundColor: colors.background, borderRadius: 10, padding: 12, fontSize: 16, color: colors.foreground, textAlign: "center", borderWidth: 1, borderColor: colors.border, marginBottom: 12, letterSpacing: 2 }}
            />
            <TouchableOpacity onPress={handleJoin} disabled={joinMutation.isPending} style={{ backgroundColor: colors.primary, borderRadius: 10, padding: 12, alignItems: "center" }}>
              <Text style={{ color: "#fff", fontWeight: "bold" }}>{joinMutation.isPending ? "..." : t("neighborhood.join_btn")}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Create Form */}
        {showCreate && (
          <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.foreground, fontWeight: "bold", textAlign, marginBottom: 8 }}>{t("neighborhood.group_name")}:</Text>
            <TextInput
              value={newGroupName}
              onChangeText={setNewGroupName}
              placeholder={language === "ar" ? "مثال: مجموعة حي النور" : language === "nl" ? "Bijv: Buurtgroep An-Noor" : "E.g.: An-Noor Neighborhood"}
              placeholderTextColor={colors.muted}
              style={{ backgroundColor: colors.background, borderRadius: 10, padding: 12, fontSize: 15, color: colors.foreground, textAlign, borderWidth: 1, borderColor: colors.border, marginBottom: 12 }}
            />
            <Text style={{ color: colors.foreground, fontWeight: "bold", textAlign, marginBottom: 8 }}>{t("neighborhood.description")}:</Text>
            <TextInput
              value={newGroupDesc}
              onChangeText={setNewGroupDesc}
              placeholder={language === "ar" ? "وصف قصير للمجموعة" : language === "nl" ? "Korte beschrijving" : "Short description"}
              placeholderTextColor={colors.muted}
              multiline
              style={{ backgroundColor: colors.background, borderRadius: 10, padding: 12, fontSize: 15, color: colors.foreground, textAlign, borderWidth: 1, borderColor: colors.border, marginBottom: 12, minHeight: 60 }}
            />
            <TouchableOpacity onPress={handleCreate} disabled={createMutation.isPending} style={{ backgroundColor: colors.primary, borderRadius: 10, padding: 12, alignItems: "center" }}>
              <Text style={{ color: "#fff", fontWeight: "bold" }}>{createMutation.isPending ? "..." : t("neighborhood.create_btn")}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Activities Types */}
        <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "bold", textAlign, marginBottom: 12 }}>{t("neighborhood.activities_types")}</Text>
        {ACTIVITIES.map((item, i) => (
          <View key={i} style={{ flexDirection: flexDir, backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border, alignItems: "center" }}>
            <Text style={{ fontSize: 28, marginHorizontal: 12 }}>{item.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.foreground, fontWeight: "bold", textAlign }}>{item.title[language] || item.title.ar}</Text>
              <Text style={{ color: colors.muted, textAlign, fontSize: 13 }}>{item.desc[language] || item.desc.ar}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </ScreenContainer>
  );
}
