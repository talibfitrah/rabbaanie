import { useLocalSearchParams, useRouter } from "expo-router";
import { View, Text, TouchableOpacity, ScrollView, RefreshControl, ActivityIndicator, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState } from "react";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { useL3 } from "@/lib/admin-text";
import { trpc } from "@/lib/trpc";

const ICONS: Record<string, string> = { families: "family-restroom", children: "child-care", specialists: "badge", teachers: "school" };

export default function AdminListScreen() {
  const { type } = useLocalSearchParams<{ type: string }>();
  const t = String(type || "families");
  const colors = useColors();
  const { isRTL } = useI18n();
  const L3 = useL3();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const TITLES: Record<string, string> = { families: L3("العائلات", "Gezinnen", "Families"), children: L3("الأطفال", "Kinderen", "Children"), specialists: L3("المشرفون التربويّون", "Pedagogisch begeleiders", "Educational specialists"), teachers: L3("المعلمون", "Leraren", "Teachers") };

  // Admin registries must reflect role changes immediately — the global
  // 5-min staleTime would otherwise show a newly-assigned specialist only later.
  const fresh = { staleTime: 0, refetchOnMount: "always" as const };
  const families = trpc.admin.families.useQuery(undefined, { enabled: t === "families", ...fresh });
  const children = trpc.admin.children.useQuery(undefined, { enabled: t === "children", ...fresh });
  const specialists = trpc.admin.specialists.useQuery(undefined, { enabled: t === "specialists", ...fresh });
  const teachers = trpc.admin.teachers.useQuery(undefined, { enabled: t === "teachers", ...fresh });
  const q = t === "families" ? families : t === "children" ? children : t === "specialists" ? specialists : teachers;

  const all = (q.data as any[]) || [];
  const rows = all.filter((r) => {
    const s = search.trim().toLowerCase();
    if (!s) return true;
    return JSON.stringify(r).toLowerCase().includes(s);
  });

  const titleOf = (r: any) => r.name || r.title || r.title_ar || r.email || "—";
  const subOf = (r: any) => {
    const parts: string[] = [];
    if (r.publicId) parts.push(`${L3("الرقم المميّز", "Uniek nummer", "Unique ID")}: ${r.publicId}`);
    parts.push(`#${r.id}`);
    if (t === "families") { parts.push(L3(`${r.memberCount ?? 0} أفراد`, `${r.memberCount ?? 0} leden`, `${r.memberCount ?? 0} members`), L3(`${r.childCount ?? 0} أطفال`, `${r.childCount ?? 0} kinderen`, `${r.childCount ?? 0} children`)); if (r.inviteCode) parts.push(`${L3("رمز", "Code", "Code")}: ${r.inviteCode}`); }
    else if (t === "children") { if (r.age != null) parts.push(L3(`${r.age} سنة`, `${r.age} jaar`, `${r.age} yrs`)); if (r.gender) parts.push(r.gender); if (r.familyName) parts.push(r.familyName); }
    else { if (r.email) parts.push(r.email); if (r.assignedCount != null) parts.push(L3(`${r.assignedCount} مُسندة`, `${r.assignedCount} toegewezen`, `${r.assignedCount} assigned`)); if (r.planCount != null) parts.push(L3(`${r.planCount} خطة`, `${r.planCount} plannen`, `${r.planCount} plans`)); }
    return parts.filter(Boolean).join(" · ");
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: colors.surface, borderBottomWidth: 0.5, borderBottomColor: colors.border, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()}><MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={24} color={colors.foreground} /></TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, flex: 1, textAlign: isRTL ? "right" : "left" }}>{TITLES[t] || L3("القائمة", "Lijst", "List")}</Text>
        {t === "specialists" && (
          <TouchableOpacity onPress={() => router.push("/admin/create-specialist" as any)} style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 4, backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}>
            <MaterialIcons name="person-add" size={16} color="#fff" /><Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>{L3("إضافة", "Toevoegen", "Add")}</Text>
          </TouchableOpacity>
        )}
        <Text style={{ fontSize: 12, color: colors.muted }}>{rows.length}</Text>
      </View>

      <View style={{ paddingHorizontal: 12, paddingTop: 12 }}>
        <TextInput value={search} onChangeText={setSearch} placeholder={L3("بحث…", "Zoeken…", "Search…")} placeholderTextColor={colors.muted}
          style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: colors.foreground, textAlign: isRTL ? "right" : "left", borderWidth: 1, borderColor: colors.border }} />
      </View>

      {q.isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : q.error ? (
        <Text style={{ textAlign: "center", marginTop: 40, color: colors.error, paddingHorizontal: 24, lineHeight: 22 }}>{L3("تعذّر التحميل. تأكد أنك مسجّل الدخول بحساب المالك (سجّل الخروج ثم الدخول مرة واحدة).", "Laden mislukt. Controleer of u bent ingelogd met het eigenaarsaccount (log één keer uit en weer in).", "Could not load. Make sure you're signed in with the owner account (sign out and back in once).")}</Text>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 40, gap: 10 }}
          refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={() => q.refetch()} tintColor={colors.primary} />}>
          {rows.map((r: any, i: number) => {
            // Specialists open a detail screen to assign families.
            const onPress = t === "specialists"
              ? () => router.push(`/admin/specialist?id=${r.id}&name=${encodeURIComponent(r.name || r.email || "")}` as any)
              : undefined;
            return (
              <TouchableOpacity key={r.id ?? i} onPress={onPress} disabled={!onPress} activeOpacity={onPress ? 0.7 : 1}
                style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12 }}>
                <MaterialIcons name={(ICONS[t] || "person") as any} size={22} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>{titleOf(r)}</Text>
                  {!!subOf(r) && <Text style={{ fontSize: 11, color: colors.muted, textAlign: isRTL ? "right" : "left", marginTop: 2 }}>{subOf(r)}</Text>}
                </View>
                {onPress && <MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={20} color={colors.muted} />}
              </TouchableOpacity>
            );
          })}
          {rows.length === 0 && <Text style={{ textAlign: "center", marginTop: 40, color: colors.muted }}>{L3("لا توجد بيانات", "Geen gegevens", "No data")}</Text>}
        </ScrollView>
      )}
    </View>
  );
}
