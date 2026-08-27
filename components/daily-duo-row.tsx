import { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { DailyDiagnosticCard } from "@/components/daily-diagnostic-card";
import { DailyDeedsCard } from "@/components/daily-deeds-card";

type Lang = "nl" | "en" | "ar";

function tx(lang: Lang, nl: string, en: string, ar: string): string {
  if (lang === "en") return en;
  if (lang === "ar") return ar;
  return nl;
}

interface Props {
  lang: Lang;
  isRTL: boolean;
}

/**
 * Collapsed entry point for the two daily cards (personal review + daily
 * deeds), replacing what used to be two separate full-width cards on the
 * home screen. Both halves below are static — no data query in this
 * component — so nothing loads on the home mount. Tapping a half mounts the
 * matching full card, which is what starts its own fetch — mounting it IS
 * the tap (see DailyDiagnosticCard's cost-guard comment).
 */
export function DailyDuoRow({ lang, isRTL }: Props) {
  const [open, setOpen] = useState<"review" | "deeds" | null>(null);

  return (
    <>
      <View style={{ flexDirection: "row", gap: 10, marginHorizontal: 16, marginBottom: 16 }}>
        <Pressable
          onPress={() => setOpen((prev) => (prev === "review" ? null : "review"))}
          style={({ pressed }) => [s.half, pressed && { opacity: 0.85 }]}
        >
          <MaterialIcons name="check-circle" size={16} color="#1B4332" />
          <Text style={[s.label, { textAlign: lang === "ar" ? "right" : "left" }]} numberOfLines={1}>
            {tx(lang, "Persoonlijke evaluatie", "Personal review", "المراجعة الشخصية")}
          </Text>
          <MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={16} color="#C4A35A" />
        </Pressable>
        <Pressable
          onPress={() => setOpen((prev) => (prev === "deeds" ? null : "deeds"))}
          style={({ pressed }) => [s.half, pressed && { opacity: 0.85 }]}
        >
          <MaterialIcons name="check-circle" size={16} color="#1B4332" />
          <Text style={[s.label, { textAlign: lang === "ar" ? "right" : "left" }]} numberOfLines={1}>
            {tx(lang, "Dagelijkse daden", "Daily deeds", "الأعمال اليومية")}
          </Text>
          <MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={16} color="#C4A35A" />
        </Pressable>
      </View>
      {open === "review" && <DailyDiagnosticCard lang={lang} />}
      {open === "deeds" && <DailyDeedsCard lang={lang} />}
    </>
  );
}

const s = StyleSheet.create({
  half: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F1F8F2",
    borderWidth: 1,
    borderColor: "#1B433233",
    borderRadius: 12,
    padding: 13,
  },
  label: { flex: 1, fontSize: 13.5, fontWeight: "800", color: "#1B4332" },
});
