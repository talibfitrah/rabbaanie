import { useState } from "react";
import { View, Text, Pressable, Modal, ScrollView, TouchableOpacity } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { WifeCycleStatus } from "@/components/wife-cycle-status";
import type { PartnerListEntry } from "@/lib/partner-types";

type Lang = "nl" | "en" | "ar";
const tx = (l: Lang, nl: string, en: string, ar: string) =>
  l === "ar" ? ar : l === "en" ? en : nl;

/**
 * Per-wife action buttons — «الحيض وأثره» (husband-only) + her/his profile —
 * shown ONLY for a CURRENT confirmed spouse (never a divorced ex co-parent that
 * getCoParents also surfaces). Owns its own cycle-status modal. Used on both the
 * family tab and the home screen so the gate + modal live in exactly one place.
 *
 * `cp.id` is the partner's user id (from getCoParents) — the same id
 * cycle.getPartner and /spouse-profile take. The pronoun follows the VIEWER's
 * gender (spouse relationship), robust even when the partner's own gender is unset.
 */
export function WifeCardActions({
  cp,
  partners,
  viewerGender,
}: {
  cp: { id: number; name?: string | null };
  partners: PartnerListEntry[];
  viewerGender?: string | null;
}) {
  const router = useRouter();
  const colors = useColors();
  const { language, isRTL } = useI18n();
  const lang = language as Lang;
  const [cycleOpen, setCycleOpen] = useState(false);

  if (!partners.some((p) => p.id === cp.id && p.confirmed)) return null;
  const wifeName = cp.name || tx(lang, "Partner", "Spouse", "الزوجة");
  const pill = {
    flex: 1,
    flexDirection: (isRTL ? "row-reverse" : "row") as "row" | "row-reverse",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
  };

  return (
    <>
      <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 8, marginTop: 10 }}>
        {viewerGender === "man" && (
          <Pressable
            onPress={() => setCycleOpen(true)}
            style={({ pressed }) => [
              { ...pill, backgroundColor: "#E11D48" + "12", borderColor: "#E11D48" + "30", opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <MaterialIcons name="favorite" size={15} color="#E11D48" />
            <Text style={{ color: "#E11D48", fontSize: 11, fontWeight: "700" }}>
              {tx(lang, "Menstruatie", "Menses", "الحيض وأثره")}
            </Text>
          </Pressable>
        )}
        <Pressable
          onPress={() =>
            router.push({ pathname: "/spouse-profile", params: { partnerId: String(cp.id) } } as any)
          }
          style={({ pressed }) => [
            { ...pill, backgroundColor: colors.primary + "12", borderColor: colors.primary + "30", opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <MaterialIcons name="person" size={15} color={colors.primary} />
          <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "700" }}>
            {viewerGender === "vrouw" ? tx(lang, "Profiel", "Profile", "ملفه") : tx(lang, "Profiel", "Profile", "ملفها")}
          </Text>
        </Pressable>
      </View>

      <Modal
        visible={cycleOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCycleOpen(false)}
        supportedOrientations={["portrait", "portrait-upside-down", "landscape"]}
      >
        <ScrollView
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)" }}
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", alignItems: "center" }}
        >
          <View style={{ backgroundColor: colors.background, borderRadius: 20, padding: 24, width: 320, maxWidth: "90%", gap: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>
              {tx(lang, "Menstruatie en gevolg", "Menses & ruling", "الحيض وأثره")} — {wifeName}
            </Text>
            <WifeCycleStatus
              wifeId={cp.id}
              emptyFallback={
                <Text style={{ fontSize: 13, color: colors.muted, textAlign: isRTL ? "right" : "left" }}>
                  {tx(lang, "Nog geen cyclusinfo gedeeld.", "No cycle info shared yet.", "لم تُشارَك معلومات الدورة بعد.")}
                </Text>
              }
            />
            <TouchableOpacity
              onPress={() => setCycleOpen(false)}
              style={{ backgroundColor: colors.primary, paddingVertical: 12, borderRadius: 10, alignItems: "center", marginTop: 4 }}
            >
              <Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>{tx(lang, "Sluiten", "Close", "إغلاق")}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </Modal>
    </>
  );
}
