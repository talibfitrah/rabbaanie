import { useState } from "react";
import { ScrollView, Text, View, TouchableOpacity, TextInput, Alert, RefreshControl, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";

// Roles the owner can assign, with Arabic labels + a badge colour.
const ROLES: { key: string; ar: string; color: string }[] = [
  { key: "user", ar: "مستخدم", color: "#6B7280" },
  { key: "specialist", ar: "متخصص", color: "#E65100" },
  { key: "moderator", ar: "مشرف", color: "#7C3AED" },
  { key: "admin", ar: "مدير", color: "#2563EB" },
  { key: "super_admin", ar: "مالك", color: "#059669" },
];
const roleAr = (r: string) => ROLES.find((x) => x.key === r)?.ar || r;
const roleColor = (r: string) => ROLES.find((x) => x.key === r)?.color || "#6B7280";

export default function AdminUsersScreen() {
  const colors = useColors();
  const { isRTL } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const usersQuery = trpc.admin.users.useQuery();
  const updateRole = trpc.admin.updateUserRole.useMutation({ onSuccess: () => usersQuery.refetch() });

  const users = ((usersQuery.data as any[]) || []).filter((u) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (u.name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q);
  });

  const changeRole = (u: any, role: string) => {
    Alert.alert(
      "تغيير الصلاحية",
      `تعيين «${u.name || u.email}» كـ «${roleAr(role)}»؟`,
      [
        { text: "إلغاء", style: "cancel" },
        { text: "تأكيد", onPress: () => { updateRole.mutate({ userId: u.id, role }); setExpandedId(null); } },
      ]
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: colors.surface, borderBottomWidth: 0.5, borderBottomColor: colors.border, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, flex: 1, textAlign: isRTL ? "right" : "left" }}>
          إدارة المستخدمين والصلاحيات
        </Text>
        <Text style={{ fontSize: 12, color: colors.muted }}>{users.length}</Text>
      </View>

      {/* Search */}
      <View style={{ paddingHorizontal: 12, paddingTop: 12 }}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="ابحث بالاسم أو البريد"
          placeholderTextColor={colors.muted}
          style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: colors.foreground, textAlign: isRTL ? "right" : "left", borderWidth: 1, borderColor: colors.border }}
        />
      </View>

      {usersQuery.isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : usersQuery.error ? (
        <Text style={{ textAlign: "center", marginTop: 40, color: colors.error, paddingHorizontal: 24, lineHeight: 22 }}>
          تعذّر تحميل المستخدمين. تأكد أنك مسجّل الدخول بحساب المالك، وأعد المحاولة.
        </Text>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 40, gap: 10 }}
          refreshControl={<RefreshControl refreshing={usersQuery.isFetching} onRefresh={() => usersQuery.refetch()} tintColor={colors.primary} />}
        >
          {users.map((u: any) => (
            <View key={u.id} style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
              <TouchableOpacity
                onPress={() => setExpandedId(expandedId === u.id ? null : u.id)}
                style={{ padding: 14, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 10 }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>{u.name || "—"}</Text>
                  {!!u.email && <Text style={{ fontSize: 11, color: colors.muted, textAlign: isRTL ? "right" : "left" }}>{u.email}</Text>}
                </View>
                <View style={{ backgroundColor: roleColor(u.role) + "20", borderRadius: 10, paddingVertical: 3, paddingHorizontal: 8 }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: roleColor(u.role) }}>{roleAr(u.role)}</Text>
                </View>
                <MaterialIcons name={expandedId === u.id ? "keyboard-arrow-up" : "keyboard-arrow-down"} size={20} color={colors.muted} />
              </TouchableOpacity>
              {expandedId === u.id && (
                <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 8 }}>
                  <Text style={{ fontSize: 12, color: colors.muted, textAlign: isRTL ? "right" : "left" }}>اختر الصلاحية:</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: isRTL ? "flex-end" : "flex-start" }}>
                    {ROLES.map((r) => (
                      <TouchableOpacity
                        key={r.key}
                        disabled={r.key === u.role || updateRole.isPending}
                        onPress={() => changeRole(u, r.key)}
                        style={{ backgroundColor: r.key === u.role ? r.color : r.color + "15", borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, opacity: r.key === u.role ? 0.5 : 1 }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: "700", color: r.key === u.role ? "#fff" : r.color }}>{r.ar}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </View>
          ))}
          {users.length === 0 && <Text style={{ textAlign: "center", marginTop: 40, color: colors.muted }}>لا يوجد مستخدمون</Text>}
        </ScrollView>
      )}
    </View>
  );
}
