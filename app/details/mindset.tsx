import { View, Text, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import knowledgeBase from "@/assets/data/mawsouah_knowledge.json";
import { useMemo } from "react";

export default function MindsetScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { language } = useI18n();
  const lang = language as "nl" | "en" | "ar";

  const tx = (nl: string, en: string, ar: string) =>
    lang === "ar" ? ar : lang === "en" ? en : nl;

  const mindsets = useMemo(() => {
    const all = (knowledgeBase as any).mindsets || [];
    return all.map((m: any) => ({
      title: lang === "ar" ? (m.titleAR || m.title) : lang === "en" ? (m.titleEN || m.title) : m.title,
      principle: lang === "ar" ? (m.principleAR || m.principle) : lang === "en" ? (m.principleEN || m.principle) : m.principle,
      application: lang === "ar" ? (m.applicationAR || m.application) : lang === "en" ? (m.applicationEN || m.application) : m.application,
    }));
  }, [lang]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40, paddingHorizontal: 20 }}
    >
      <Pressable onPress={() => router.back()} style={{ marginBottom: 16 }}>
        <Text style={{ color: colors.primary, fontSize: 14 }}>{tx("← Terug", "← Back", "← رجوع")}</Text>
      </Pressable>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <MaterialIcons name="psychology" size={28} color="#1565C0" />
        <Text style={{ fontSize: 22, fontWeight: "700", color: colors.foreground }}>{tx("Mindsets", "Mindsets", "مبادئ التربية")}</Text>
      </View>

      {mindsets.map((m: any, idx: number) => (
        <View
          key={idx}
          style={{
            backgroundColor: "#F8FBFF",
            borderRadius: 14,
            borderWidth: 1,
            borderColor: "#D6E4F0",
            padding: 16,
            marginBottom: 12,
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: "700", color: "#1565C0", textAlign: lang === "ar" ? "right" : "left", marginBottom: 6 }}>
            {m.title}
          </Text>
          <Text style={{ fontSize: 13, color: "#1F2937", lineHeight: 22, textAlign: lang === "ar" ? "right" : "left" }}>
            {m.principle}
          </Text>
          {m.application ? (
            <Text style={{ fontSize: 12, color: "#6B7B72", lineHeight: 20, marginTop: 8, textAlign: lang === "ar" ? "right" : "left" }}>
              {m.application}
            </Text>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}
