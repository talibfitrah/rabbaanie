import { useLocalSearchParams, useRouter } from "expo-router";
import { View, Text, TouchableOpacity, ScrollView, RefreshControl, ActivityIndicator, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState } from "react";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { useL3 } from "@/lib/admin-text";
import { trpc } from "@/lib/trpc";

// Assign / unassign families to one specialist.
export default function SpecialistDetailScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const specialistId = Number(id);
  const colors = useColors();
  const { isRTL } = useI18n();
  const L3 = useL3();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");

  const familiesQ = trpc.admin.families.useQuery();
  const specialistsQ = trpc.admin.specialists.useQuery();
  const spec = ((specialistsQ.data as any[]) || []).find((s) => s.id === specialistId);
  const assignedIds = new Set(((spec?.assignments as any[]) || []).filter((a) => a.status === "active").map((a) => a.familyId));

  const assign = (trpc.admin as any).assignFamily.useMutation({ onSuccess: () => specialistsQ.refetch() });
  const unassign = (trpc.admin as any).unassignFamily.useMutation({ onSuccess: () => specialistsQ.refetch() });
  const busy = assign.isPending || unassign.isPending;

  const toggle = (familyId: number) => {
    if (busy) return;
    if (assignedIds.has(familyId)) unassign.mutate({ specialistId, familyId });
    else assign.mutate({ specialistId, familyId });
  };

  const families = ((familiesQ.data as any[]) || []).filter((f) => {
    const s = search.trim().toLowerCase();
    return !s || (f.name || "").toLowerCase().includes(s) || String(f.inviteCode || "").toLowerCase().includes(s);
  });
  // Assigned first.
  families.sort((a, b) => Number(assignedIds.has(b.id)) - Number(assignedIds.has(a.id)));

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: colors.surface, borderBottomWidth: 0.5, borderBottomColor: colors.border, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()}><MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={24} color={colors.foreground} /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>{name || L3("مشرف تربوي", "Pedagogisch begeleider", "Educational specialist")}</Text>
          <Text style={{ fontSize: 11, color: colors.muted, textAlign: isRTL ? "right" : "left" }}>{L3(`${assignedIds.size} عائلة مُسندة`, `${assignedIds.size} gezinnen toegewezen`, `${assignedIds.size} families assigned`)}</Text>
        </View>
      </View>

      <View style={{ paddingHorizontal: 12, paddingTop: 12 }}>
        <Text style={{ fontSize: 12, color: colors.muted, textAlign: isRTL ? "right" : "left", marginBottom: 8 }}>{L3("اضغط على عائلة لإسنادها أو إلغاء إسنادها لهذا المشرف التربوي:", "Tik op een gezin om het aan deze begeleider toe te wijzen of de toewijzing op te heffen:", "Tap a family to assign it to this specialist, or to unassign it:")}</Text>
        <TextInput value={search} onChangeText={setSearch} placeholder={L3("بحث عن عائلة…", "Gezin zoeken…", "Search families…")} placeholderTextColor={colors.muted}
          style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: colors.foreground, textAlign: isRTL ? "right" : "left", borderWidth: 1, borderColor: colors.border }} />
      </View>

      {familiesQ.isLoading || specialistsQ.isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : familiesQ.error || specialistsQ.error ? (
        <Text style={{ textAlign: "center", marginTop: 40, color: colors.error, paddingHorizontal: 24, lineHeight: 22 }}>{L3("تعذّر التحميل. تأكد أنك مسجّل الدخول بحساب المالك.", "Laden mislukt. Controleer of u bent ingelogd met het eigenaarsaccount.", "Could not load. Make sure you're signed in with the owner account.")}</Text>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 40, gap: 10 }}
          refreshControl={<RefreshControl refreshing={specialistsQ.isFetching} onRefresh={() => { specialistsQ.refetch(); familiesQ.refetch(); }} tintColor={colors.primary} />}>
          {families.map((f: any) => {
            const on = assignedIds.has(f.id);
            return (
              <TouchableOpacity key={f.id} onPress={() => toggle(f.id)} disabled={busy}
                style={{ backgroundColor: on ? colors.primary + "12" : colors.surface, borderRadius: 14, borderWidth: 1, borderColor: on ? colors.primary + "50" : colors.border, padding: 14, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12, opacity: busy ? 0.6 : 1 }}>
                <MaterialIcons name={on ? "check-circle" : "radio-button-unchecked"} size={22} color={on ? colors.primary : colors.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>{f.name || "—"}</Text>
                  <Text style={{ fontSize: 11, color: colors.muted, textAlign: isRTL ? "right" : "left" }}>{L3(`${f.memberCount ?? 0} أفراد · ${f.childCount ?? 0} أطفال`, `${f.memberCount ?? 0} leden · ${f.childCount ?? 0} kinderen`, `${f.memberCount ?? 0} members · ${f.childCount ?? 0} children`)}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
          {families.length === 0 && <Text style={{ textAlign: "center", marginTop: 40, color: colors.muted }}>{L3("لا توجد عائلات", "Geen gezinnen", "No families")}</Text>}
        </ScrollView>
      )}
    </View>
  );
}
