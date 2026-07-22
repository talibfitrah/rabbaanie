import { useState } from "react";
import { Text, View, ScrollView, TouchableOpacity, TextInput, Alert } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useI18n } from "@/lib/i18n";

export default function PeerGroupsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { t, language, isRTL } = useI18n();
  const [showCreate, setShowCreate] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [ageRange, setAgeRange] = useState<"12-14" | "15-17" | "18+">("12-14");
  const [gender, setGender] = useState<"male" | "female">("male");

  const flexDir = isRTL ? "row-reverse" as const : "row" as const;
  const textAlign = isRTL ? "right" as const : "left" as const;

  const GENDER_OPTIONS = [
    { key: "male" as const, label: { ar: "ذكور", nl: "Jongens", en: "Males" } },
    { key: "female" as const, label: { ar: "إناث", nl: "Meisjes", en: "Females" } },
  ];

  const createMutation = trpc.peerGroups.create.useMutation({
    onSuccess: (result) => {
      Alert.alert("✓", `${t("peers.created")}\n${t("peers.invite_code")}: ${result.inviteCode}`);
      setShowCreate(false);
      setGroupName("");
    },
  });

  const handleCreate = () => {
    if (!groupName.trim()) { Alert.alert("✗", t("peers.enter_name")); return; }
    createMutation.mutate({ name: groupName.trim(), ageRange, gender, parentApproval: true });
  };

  const BENEFITS: { icon: string; title: Record<string, string>; desc: Record<string, string> }[] = [
    { icon: "🛡️", title: { ar: "بيئة آمنة", nl: "Veilige omgeving", en: "Safe environment" }, desc: { ar: "تحت إشراف الوالدين - كل انضمام يحتاج موافقة", nl: "Onder toezicht van ouders - elk lidmaatschap vereist goedkeuring", en: "Under parental supervision - every membership requires approval" } },
    { icon: "📖", title: { ar: "تعلّم جماعي", nl: "Groepsleren", en: "Group learning" }, desc: { ar: "حفظ قرآن، مراجعة دروس، مسابقات علمية", nl: "Qur'aan memoriseren, lessen herhalen, kenniswedstrijden", en: "Qur'aan memorization, lesson review, knowledge competitions" } },
    { icon: "💪", title: { ar: "تشجيع متبادل", nl: "Wederzijdse aanmoediging", en: "Mutual encouragement" }, desc: { ar: "التحديات المشتركة تحفّز على الاستمرار", nl: "Gezamenlijke uitdagingen motiveren om door te gaan", en: "Shared challenges motivate to continue" } },
    { icon: "🤝", title: { ar: "صحبة صالحة", nl: "Goed gezelschap", en: "Good companionship" }, desc: { ar: "بناء صداقات على أساس الدين والأخلاق", nl: "Vriendschappen bouwen op basis van dien en akhlaaq", en: "Building friendships based on deen and akhlaaq" } },
  ];

  return (
    <ScreenContainer className="p-4" edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={{ flexDirection: flexDir, alignItems: "center", marginBottom: 20 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
            <Text style={{ color: colors.primary, fontSize: 16 }}>{t("peers.back")}</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ color: colors.foreground, fontSize: 20, fontWeight: "bold" }}>👥 {t("peers.title")}</Text>
          </View>
          <View style={{ width: 50 }} />
        </View>

        {/* Info */}
        <View style={{ backgroundColor: colors.primary + "15", borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: colors.primary + "30" }}>
          <Text style={{ color: colors.foreground, textAlign, lineHeight: 22, fontSize: 14 }}>{t("peers.info")}</Text>
        </View>

        {/* Create Button */}
        <TouchableOpacity onPress={() => setShowCreate(!showCreate)} style={{ backgroundColor: colors.primary, borderRadius: 12, padding: 14, alignItems: "center", marginBottom: 16 }}>
          <Text style={{ color: "#fff", fontWeight: "bold" }}>+ {t("peers.create_btn")}</Text>
        </TouchableOpacity>

        {/* Create Form */}
        {showCreate && (
          <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.foreground, fontWeight: "bold", textAlign, marginBottom: 8 }}>{t("peers.group_name")}:</Text>
            <TextInput
              value={groupName}
              onChangeText={setGroupName}
              placeholder={language === "ar" ? "مثال: مجموعة أبناء الحي" : language === "nl" ? "Bijv: Buurtkinderen groep" : "E.g.: Neighborhood kids group"}
              placeholderTextColor={colors.muted}
              style={{ backgroundColor: colors.background, borderRadius: 10, padding: 12, fontSize: 15, color: colors.foreground, textAlign, borderWidth: 1, borderColor: colors.border, marginBottom: 12 }}
            />

            {/* Age Range */}
            <Text style={{ color: colors.foreground, fontWeight: "bold", textAlign, marginBottom: 8 }}>{t("peers.age_range")}:</Text>
            <View style={{ flexDirection: flexDir, gap: 8, marginBottom: 12 }}>
              {(["12-14", "15-17", "18+"] as const).map(age => (
                <TouchableOpacity
                  key={age}
                  onPress={() => setAgeRange(age)}
                  style={{ flex: 1, backgroundColor: ageRange === age ? colors.primary : colors.background, borderRadius: 8, padding: 10, alignItems: "center", borderWidth: 1, borderColor: ageRange === age ? colors.primary : colors.border }}
                >
                  <Text style={{ color: ageRange === age ? "#fff" : colors.foreground, fontWeight: "bold" }}>{age}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Gender */}
            <Text style={{ color: colors.foreground, fontWeight: "bold", textAlign, marginBottom: 8 }}>{t("peers.gender")}:</Text>
            <View style={{ flexDirection: flexDir, gap: 8, marginBottom: 16 }}>
              {GENDER_OPTIONS.map(g => (
                <TouchableOpacity
                  key={g.key}
                  onPress={() => setGender(g.key)}
                  style={{ flex: 1, backgroundColor: gender === g.key ? colors.primary : colors.background, borderRadius: 8, padding: 10, alignItems: "center", borderWidth: 1, borderColor: gender === g.key ? colors.primary : colors.border }}
                >
                  <Text style={{ color: gender === g.key ? "#fff" : colors.foreground, fontWeight: "bold" }}>{g.label[language] || g.label.ar}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity onPress={handleCreate} disabled={createMutation.isPending} style={{ backgroundColor: colors.primary, borderRadius: 10, padding: 12, alignItems: "center" }}>
              <Text style={{ color: "#fff", fontWeight: "bold" }}>{createMutation.isPending ? "..." : t("peers.create_btn")}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Benefits */}
        <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "bold", textAlign, marginBottom: 12 }}>{t("peers.benefits")}</Text>
        {BENEFITS.map((item, i) => (
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
