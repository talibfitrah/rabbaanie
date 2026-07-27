import { useLocalSearchParams, useRouter } from "expo-router";
import { View, Text, TouchableOpacity, ScrollView, RefreshControl, ActivityIndicator, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState } from "react";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";

const TITLES: Record<string, string> = { families: "العائلات", children: "الأطفال", specialists: "المتخصصون", teachers: "المعلمون" };
const ICONS: Record<string, string> = { families: "family-restroom", children: "child-care", specialists: "badge", teachers: "school" };

export default function AdminListScreen() {
  const { type } = useLocalSearchParams<{ type: string }>();
  const t = String(type || "families");
  const colors = useColors();
  const { isRTL } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");

  const families = trpc.admin.families.useQuery(undefined, { enabled: t === "families" });
  const children = trpc.admin.children.useQuery(undefined, { enabled: t === "children" });
  const specialists = trpc.admin.specialists.useQuery(undefined, { enabled: t === "specialists" });
  const teachers = trpc.admin.teachers.useQuery(undefined, { enabled: t === "teachers" });
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
    if (t === "families") { parts.push(`${r.memberCount ?? 0} أفراد`, `${r.childCount ?? 0} أطفال`); if (r.inviteCode) parts.push(`رمز: ${r.inviteCode}`); }
    else if (t === "children") { if (r.age != null) parts.push(`${r.age} سنة`); if (r.gender) parts.push(r.gender); if (r.familyName) parts.push(r.familyName); }
    else { if (r.email) parts.push(r.email); if (r.assignedCount != null) parts.push(`${r.assignedCount} مُسندة`); if (r.planCount != null) parts.push(`${r.planCount} خطة`); }
    return parts.filter(Boolean).join(" · ");
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: colors.surface, borderBottomWidth: 0.5, borderBottomColor: colors.border, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()}><MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={24} color={colors.foreground} /></TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, flex: 1, textAlign: isRTL ? "right" : "left" }}>{TITLES[t] || "القائمة"}</Text>
        <Text style={{ fontSize: 12, color: colors.muted }}>{rows.length}</Text>
      </View>

      <View style={{ paddingHorizontal: 12, paddingTop: 12 }}>
        <TextInput value={search} onChangeText={setSearch} placeholder="بحث…" placeholderTextColor={colors.muted}
          style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: colors.foreground, textAlign: isRTL ? "right" : "left", borderWidth: 1, borderColor: colors.border }} />
      </View>

      {q.isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : q.error ? (
        <Text style={{ textAlign: "center", marginTop: 40, color: colors.error, paddingHorizontal: 24, lineHeight: 22 }}>تعذّر التحميل. تأكد أنك مسجّل الدخول بحساب المالك (سجّل الخروج ثم الدخول مرة واحدة).</Text>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 40, gap: 10 }}
          refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={() => q.refetch()} tintColor={colors.primary} />}>
          {rows.map((r: any, i: number) => (
            <View key={r.id ?? i} style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12 }}>
              <MaterialIcons name={(ICONS[t] || "person") as any} size={22} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>{titleOf(r)}</Text>
                {!!subOf(r) && <Text style={{ fontSize: 11, color: colors.muted, textAlign: isRTL ? "right" : "left", marginTop: 2 }}>{subOf(r)}</Text>}
              </View>
            </View>
          ))}
          {rows.length === 0 && <Text style={{ textAlign: "center", marginTop: 40, color: colors.muted }}>لا توجد بيانات</Text>}
        </ScrollView>
      )}
    </View>
  );
}
