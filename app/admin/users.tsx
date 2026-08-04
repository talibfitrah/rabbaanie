import { useState } from "react";
import { ScrollView, Text, View, TouchableOpacity, TextInput, RefreshControl, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";

const ROLES = [
  { key: "user", ar: "مستخدم", color: "#6B7280" },
  { key: "parent", ar: "والد", color: "#0891B2" },
  { key: "specialist", ar: "متخصص", color: "#E65100" },
  { key: "moderator", ar: "مشرف", color: "#7C3AED" },
  { key: "admin", ar: "مدير", color: "#2563EB" },
  { key: "super_admin", ar: "مالك", color: "#059669" },
];
const roleAr = (r: string) => ROLES.find((x) => x.key === r)?.ar || r;
const roleColor = (r: string) => ROLES.find((x) => x.key === r)?.color || "#6B7280";
const FILTERS = [{ key: "", ar: "الكل" }, ...ROLES.map((r) => ({ key: r.key, ar: r.ar }))];

export default function AdminUsersScreen() {
  const colors = useColors();
  const { isRTL } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");

  const usersQuery = trpc.admin.users.useQuery();
  const users = ((usersQuery.data as any[]) || []).filter((u) => {
    const rs = Array.isArray(u.roles) && u.roles.length ? u.roles : [u.role];
    if (roleFilter && !rs.includes(roleFilter)) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (u.name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q);
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: colors.surface, borderBottomWidth: 0.5, borderBottomColor: colors.border, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()}><MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={24} color={colors.foreground} /></TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, flex: 1, textAlign: isRTL ? "right" : "left" }}>المستخدمون والصلاحيات</Text>
        <Text style={{ fontSize: 12, color: colors.muted }}>{users.length}</Text>
      </View>

      <View style={{ paddingHorizontal: 12, paddingTop: 12 }}>
        <TextInput value={search} onChangeText={setSearch} placeholder="ابحث بالاسم أو البريد" placeholderTextColor={colors.muted}
          style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: colors.foreground, textAlign: isRTL ? "right" : "left", borderWidth: 1, borderColor: colors.border }} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 10, flexDirection: isRTL ? "row-reverse" : "row" }}>
          {FILTERS.map((f) => (
            <TouchableOpacity key={f.key || "all"} onPress={() => setRoleFilter(f.key)}
              style={{ backgroundColor: roleFilter === f.key ? colors.primary : colors.surface, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14, borderWidth: 1, borderColor: roleFilter === f.key ? colors.primary : colors.border }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: roleFilter === f.key ? "#fff" : colors.foreground }}>{f.ar}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {usersQuery.isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : usersQuery.error ? (
        <Text style={{ textAlign: "center", marginTop: 40, color: colors.error, paddingHorizontal: 24, lineHeight: 22 }}>
          تعذّر تحميل المستخدمين. تأكد أنك مسجّل الدخول بحساب المالك (سجّل الخروج ثم الدخول مرة واحدة).
        </Text>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 40, gap: 10 }}
          refreshControl={<RefreshControl refreshing={usersQuery.isFetching} onRefresh={() => usersQuery.refetch()} tintColor={colors.primary} />}
        >
          {users.map((u: any) => (
            <TouchableOpacity key={u.id} activeOpacity={0.7} onPress={() => router.push(`/admin/user?id=${u.id}` as any)}
              style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>{u.name || "—"}</Text>
                {!!u.email && <Text style={{ fontSize: 11, color: colors.muted, textAlign: isRTL ? "right" : "left" }}>{u.email}</Text>}
                <Text style={{ fontSize: 10, color: colors.muted, textAlign: isRTL ? "right" : "left" }}>{"الرقم المميّز: " + (u.publicId || "لم يُنشأ بعد") + "  ·  #" + u.id}</Text>
              </View>
              <View style={{ backgroundColor: roleColor(u.role) + "20", borderRadius: 10, paddingVertical: 3, paddingHorizontal: 8 }}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: roleColor(u.role) }}>{roleAr(u.role)}</Text>
              </View>
              <MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={20} color={colors.muted} />
            </TouchableOpacity>
          ))}
          {users.length === 0 && <Text style={{ textAlign: "center", marginTop: 40, color: colors.muted }}>لا يوجد مستخدمون</Text>}
        </ScrollView>
      )}
    </View>
  );
}
