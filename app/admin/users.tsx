import { useState } from "react";
import { ScrollView, Text, View, TouchableOpacity, TextInput, RefreshControl, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { useL3 } from "@/lib/admin-text";
import { trpc } from "@/lib/trpc";

export default function AdminUsersScreen() {
  const colors = useColors();
  const { isRTL } = useI18n();
  const L3 = useL3();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [incompleteOnly, setIncompleteOnly] = useState(false);

  const ROLES = [
    { key: "user", label: L3("مستخدم", "Gebruiker", "User"), color: "#6B7280" },
    { key: "parent", label: L3("والد", "Ouder", "Parent"), color: "#0891B2" },
    { key: "specialist", label: L3("مشرف تربوي", "Pedagogisch begeleider", "Educational specialist"), color: "#E65100" },
    { key: "moderator", label: L3("مشرف", "Moderator", "Moderator"), color: "#7C3AED" },
    { key: "admin", label: L3("مدير", "Beheerder", "Admin"), color: "#2563EB" },
    { key: "super_admin", label: L3("مالك", "Eigenaar", "Owner"), color: "#059669" },
  ];
  const roleLabel = (r: string) => ROLES.find((x) => x.key === r)?.label || r;
  const roleColor = (r: string) => ROLES.find((x) => x.key === r)?.color || "#6B7280";
  const FILTERS = [{ key: "", label: L3("الكل", "Alle", "All") }, ...ROLES.map((r) => ({ key: r.key, label: r.label }))];

  const usersQuery = trpc.admin.users.useQuery();
  const users = ((usersQuery.data as any[]) || []).filter((u) => {
    const rs = Array.isArray(u.roles) && u.roles.length ? u.roles : [u.role];
    if (roleFilter && !rs.includes(roleFilter)) return false;
    if (incompleteOnly && u.profileComplete !== false) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (u.name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q);
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: colors.surface, borderBottomWidth: 0.5, borderBottomColor: colors.border, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()}><MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={24} color={colors.foreground} /></TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, flex: 1, textAlign: isRTL ? "right" : "left" }}>{L3("المستخدمون والصلاحيات", "Gebruikers & rechten", "Users & permissions")}</Text>
        <Text style={{ fontSize: 12, color: colors.muted }}>{users.length}</Text>
      </View>

      <View style={{ paddingHorizontal: 12, paddingTop: 12 }}>
        <TextInput value={search} onChangeText={setSearch} placeholder={L3("ابحث بالاسم أو البريد", "Zoek op naam of e-mail", "Search by name or email")} placeholderTextColor={colors.muted}
          style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: colors.foreground, textAlign: isRTL ? "right" : "left", borderWidth: 1, borderColor: colors.border }} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 10, flexDirection: isRTL ? "row-reverse" : "row" }}>
          {FILTERS.map((f) => (
            <TouchableOpacity key={f.key || "all"} onPress={() => setRoleFilter(f.key)}
              style={{ backgroundColor: roleFilter === f.key ? colors.primary : colors.surface, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14, borderWidth: 1, borderColor: roleFilter === f.key ? colors.primary : colors.border }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: roleFilter === f.key ? "#fff" : colors.foreground }}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity onPress={() => setIncompleteOnly(!incompleteOnly)}
          style={{ alignSelf: isRTL ? "flex-end" : "flex-start", flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 6, backgroundColor: incompleteOnly ? colors.error : colors.surface, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14, borderWidth: 1, borderColor: incompleteOnly ? colors.error : colors.border, marginBottom: 4 }}>
          <MaterialIcons name={incompleteOnly ? "check-box" : "check-box-outline-blank"} size={15} color={incompleteOnly ? "#fff" : colors.muted} />
          <Text style={{ fontSize: 12, fontWeight: "700", color: incompleteOnly ? "#fff" : colors.foreground }}>{L3("الملفات غير المكتملة فقط", "Alleen onvolledige profielen", "Incomplete profiles only")}</Text>
        </TouchableOpacity>
      </View>

      {usersQuery.isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : usersQuery.error ? (
        <Text style={{ textAlign: "center", marginTop: 40, color: colors.error, paddingHorizontal: 24, lineHeight: 22 }}>
          {L3("تعذّر تحميل المستخدمين. تأكد أنك مسجّل الدخول بحساب المالك (سجّل الخروج ثم الدخول مرة واحدة).", "Gebruikers laden mislukt. Controleer of u bent ingelogd met het eigenaarsaccount (log één keer uit en weer in).", "Could not load users. Make sure you're signed in with the owner account (sign out and back in once).")}
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
                <Text style={{ fontSize: 10, color: colors.muted, textAlign: isRTL ? "right" : "left" }}>{L3("الرقم المميّز: ", "Uniek nummer: ", "Unique ID: ") + (u.publicId || L3("لم يُنشأ بعد", "Nog niet aangemaakt", "Not created yet")) + "  ·  #" + u.id}</Text>
              </View>
              <View style={{ backgroundColor: roleColor(u.role) + "20", borderRadius: 10, paddingVertical: 3, paddingHorizontal: 8 }}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: roleColor(u.role) }}>{roleLabel(u.role)}</Text>
              </View>
              {u.profileComplete === false && (
                <View style={{ backgroundColor: colors.error + "20", borderRadius: 10, paddingVertical: 3, paddingHorizontal: 8 }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: colors.error }}>{L3("غير مكتمل", "Onvolledig", "Incomplete")}</Text>
                </View>
              )}
              <MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={20} color={colors.muted} />
            </TouchableOpacity>
          ))}
          {users.length === 0 && <Text style={{ textAlign: "center", marginTop: 40, color: colors.muted }}>{L3("لا يوجد مستخدمون", "Geen gebruikers", "No users")}</Text>}
        </ScrollView>
      )}
    </View>
  );
}
