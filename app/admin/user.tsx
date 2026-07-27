import { useLocalSearchParams, useRouter } from "expo-router";
import { View, Text, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";

const ROLES = [
  { key: "user", ar: "مستخدم", color: "#6B7280" },
  { key: "specialist", ar: "متخصص", color: "#E65100" },
  { key: "moderator", ar: "مشرف", color: "#7C3AED" },
  { key: "admin", ar: "مدير", color: "#2563EB" },
  { key: "super_admin", ar: "مالك", color: "#059669" },
];
const roleAr = (r: string) => ROLES.find((x) => x.key === r)?.ar || r;

export default function AdminUserDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = Number(id);
  const colors = useColors();
  const { isRTL } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const usersQ = trpc.admin.users.useQuery();
  const u = ((usersQ.data as any[]) || []).find((x) => x.id === userId);
  const updateRole = trpc.admin.updateUserRole.useMutation({ onSuccess: () => usersQ.refetch() });
  const deleteUser = (trpc.admin as any).deleteUser.useMutation({ onSuccess: () => router.back() });

  const changeRole = (role: string) => {
    if (!u) return;
    Alert.alert("تغيير الصلاحية", `تعيين «${u.name || u.email}» كـ «${roleAr(role)}»؟`, [
      { text: "إلغاء", style: "cancel" },
      { text: "تأكيد", onPress: () => updateRole.mutate({ userId, role }) },
    ]);
  };
  const remove = () => {
    if (!u) return;
    Alert.alert("حذف المستخدم", `حذف «${u.name || u.email}» نهائيًا؟ لا يمكن التراجع.`, [
      { text: "إلغاء", style: "cancel" },
      { text: "حذف", style: "destructive", onPress: () => deleteUser.mutate({ userId }) },
    ]);
  };

  const fmtDate = (d: any) => { try { return d ? new Date(d).toLocaleDateString("ar") : "—"; } catch { return "—"; } };
  const Row = ({ label, value }: { label: string; value: string }) => (
    <View style={{ flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
      <Text style={{ fontSize: 13, color: colors.muted }}>{label}</Text>
      <Text style={{ fontSize: 13, color: colors.foreground, fontWeight: "600", flexShrink: 1, textAlign: isRTL ? "left" : "right", marginHorizontal: 10 }}>{value}</Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: colors.surface, borderBottomWidth: 0.5, borderBottomColor: colors.border, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()}><MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={24} color={colors.foreground} /></TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, flex: 1, textAlign: isRTL ? "right" : "left" }}>تفاصيل المستخدم</Text>
      </View>

      {usersQ.isLoading ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
        : !u ? <Text style={{ textAlign: "center", marginTop: 40, color: colors.muted }}>لم يُعثر على المستخدم</Text>
        : (
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
            <View style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>{u.name || "—"}</Text>
              <Row label="البريد" value={u.email || "—"} />
              <Row label="الصلاحية" value={roleAr(u.role)} />
              <Row label="طريقة الدخول" value={u.loginMethod || u.provider || "—"} />
              <Row label="تاريخ التسجيل" value={fmtDate(u.createdAt)} />
              <Row label="آخر دخول" value={fmtDate(u.lastSignedIn || u.lastLoginAt)} />
              <Row label="الإشعارات" value={u.pushToken ? "مُفعّلة" : "غير مُفعّلة"} />
            </View>

            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginTop: 20, marginBottom: 8, textAlign: isRTL ? "right" : "left" }}>تغيير الصلاحية</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {ROLES.map((r) => (
                <TouchableOpacity key={r.key} disabled={r.key === u.role || updateRole.isPending} onPress={() => changeRole(r.key)}
                  style={{ backgroundColor: r.key === u.role ? r.color : r.color + "15", borderRadius: 10, paddingVertical: 9, paddingHorizontal: 13, opacity: r.key === u.role ? 0.5 : 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: r.key === u.role ? "#fff" : r.color }}>{r.ar}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity onPress={remove} disabled={deleteUser.isPending}
              style={{ marginTop: 28, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.error + "12", borderWidth: 1, borderColor: colors.error + "40", borderRadius: 12, paddingVertical: 14, opacity: deleteUser.isPending ? 0.6 : 1 }}>
              <MaterialIcons name="delete" size={20} color={colors.error} />
              <Text style={{ color: colors.error, fontWeight: "700", fontSize: 14 }}>حذف المستخدم</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
    </View>
  );
}
