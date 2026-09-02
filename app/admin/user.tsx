import { useLocalSearchParams, useRouter } from "expo-router";
import { View, Text, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { useL3 } from "@/lib/admin-text";
import { trpc } from "@/lib/trpc";

export default function AdminUserDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = Number(id);
  const colors = useColors();
  const { isRTL, language } = useI18n();
  const L3 = useL3();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const ROLES = [
    { key: "user", label: L3("مستخدم", "Gebruiker", "User"), color: "#6B7280" },
    { key: "parent", label: L3("والد", "Ouder", "Parent"), color: "#0891B2" },
    { key: "specialist", label: L3("مشرف تربوي", "Pedagogisch begeleider", "Educational specialist"), color: "#E65100" },
    { key: "moderator", label: L3("مشرف", "Moderator", "Moderator"), color: "#7C3AED" },
    { key: "admin", label: L3("مدير", "Beheerder", "Admin"), color: "#2563EB" },
    { key: "super_admin", label: L3("مالك", "Eigenaar", "Owner"), color: "#059669" },
  ];
  const roleLabel = (r: string) => ROLES.find((x) => x.key === r)?.label || r;

  const MISSING_FIELD_LABELS: Record<string, string> = {
    firstName: L3("الاسم الأول", "Voornaam", "First name"),
    lastName: L3("اسم العائلة", "Achternaam", "Last name"),
    birthDate: L3("تاريخ الميلاد", "Geboortedatum", "Date of birth"),
    address: L3("العنوان", "Adres", "Address"),
    phoneNumber: L3("رقم الهاتف", "Telefoonnummer", "Phone number"),
    gender: L3("الجنس", "Geslacht", "Gender"),
    maritalStatus: L3("الحالة الاجتماعية", "Burgerlijke staat", "Marital status"),
    children: L3("عدد الأبناء", "Aantal kinderen", "Number of children"),
  };

  const utils = trpc.useUtils();
  const usersQ = trpc.admin.users.useQuery();
  const u = ((usersQ.data as any[]) || []).find((x) => x.id === userId);
  const updateRoles = (trpc.admin as any).updateUserRoles.useMutation({ onSuccess: () => usersQ.refetch() });
  const deleteUser = (trpc.admin as any).deleteUser.useMutation({
    onSuccess: () => {
      // admin.users stays fresh 5min / cached 24h (app/_layout.tsx), so without
      // this write the list we navigate back to still shows the deleted user.
      router.back();
      (utils.admin.users as any).setData(undefined, (old: any[] | undefined) =>
        (old || []).filter((x) => x.id !== userId),
      );
      // dashboard and families read the same rows and carry the same 5min
      // staleTime, so invalidating only this list leaves the tile saying "42"
      // over a list of 41 — the contradiction the server-side filters were
      // added to remove — for up to five minutes after a delete.
      return Promise.all([
        utils.admin.users.invalidate(),
        utils.admin.dashboard.invalidate(),
        utils.admin.families.invalidate(),
      ]);
    },
    // The server can refuse a deletion outright — the deployed API rejects the
    // owner account and any super_admin target, this repo's copy rejects a
    // caller who is not super_admin. Without this the throw was swallowed: no
    // alert, no navigation, row unchanged — indistinguishable from a no-op.
    onError: (e: any) =>
      Alert.alert(L3("تعذّر حذف المستخدم", "Gebruiker verwijderen mislukt", "Could not delete user"), e?.message || L3("حدث خطأ. حاول مرة أخرى.", "Er is een fout opgetreden. Probeer het opnieuw.", "Something went wrong. Please try again.")),
  });

  const currentRoles: string[] = Array.isArray(u?.roles) && u.roles.length ? u.roles : (u?.role ? [u.role] : []);
  const toggleRole = (role: string) => {
    if (!u || updateRoles.isPending) return;
    const has = currentRoles.includes(role);
    let next = has ? currentRoles.filter((r) => r !== role) : [...currentRoles, role];
    if (!next.length) next = ["user"];
    updateRoles.mutate({ userId, roles: next });
  };
  const remove = () => {
    if (!u) return;
    Alert.alert(L3("حذف المستخدم", "Gebruiker verwijderen", "Delete user"), L3(`حذف «${u.name || u.email}» نهائيًا؟ لا يمكن التراجع.`, `«${u.name || u.email}» definitief verwijderen? Dit kan niet ongedaan worden gemaakt.`, `Permanently delete "${u.name || u.email}"? This cannot be undone.`), [
      { text: L3("إلغاء", "Annuleren", "Cancel"), style: "cancel" },
      { text: L3("حذف", "Verwijderen", "Delete"), style: "destructive", onPress: () => deleteUser.mutate({ userId }) },
    ]);
  };

  const fmtDate = (d: any) => { try { return d ? new Date(d).toLocaleDateString(language) : "—"; } catch { return "—"; } };
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
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, flex: 1, textAlign: isRTL ? "right" : "left" }}>{L3("تفاصيل المستخدم", "Gebruikersgegevens", "User details")}</Text>
      </View>

      {usersQ.isLoading ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
        : !u ? <Text style={{ textAlign: "center", marginTop: 40, color: colors.muted }}>{L3("لم يُعثر على المستخدم", "Gebruiker niet gevonden", "User not found")}</Text>
        : (
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
            <View style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>{u.name || "—"}</Text>
              <Row label={L3("الرقم المميّز (رباني)", "Uniek nummer (Rabbaanie)", "Unique ID (Rabbaanie)")} value={u.publicId || L3("لم يُنشأ بعد", "Nog niet aangemaakt", "Not created yet")} />
              <Row label={L3("الرقم الداخلي", "Intern nummer", "Internal ID")} value={String(u.id)} />
              <Row label={L3("البريد", "E-mail", "Email")} value={u.email || "—"} />
              <Row label={L3("الصلاحيات", "Rechten", "Permissions")} value={currentRoles.map(roleLabel).join(L3("، ", ", ", ", ")) || "—"} />
              <Row label={L3("طريقة الدخول", "Inlogmethode", "Login method")} value={u.loginMethod || u.provider || "—"} />
              <Row label={L3("تاريخ التسجيل", "Geregistreerd op", "Registered on")} value={fmtDate(u.createdAt)} />
              <Row label={L3("آخر دخول", "Laatst ingelogd", "Last login")} value={fmtDate(u.lastSignedIn || u.lastLoginAt)} />
              <Row label={L3("الإشعارات", "Meldingen", "Notifications")} value={u.pushToken ? L3("مُفعّلة", "Ingeschakeld", "Enabled") : L3("غير مُفعّلة", "Uitgeschakeld", "Disabled")} />
              <Row label={L3("الموقع", "Locatie", "Location")} value={u.city || (u.lat && u.lng ? L3(`${u.lat}، ${u.lng}`, `${u.lat}, ${u.lng}`, `${u.lat}, ${u.lng}`) : L3("غير معروف", "Onbekend", "Unknown"))} />
              {u.lat && u.lng ? (
                <TouchableOpacity onPress={() => Linking.openURL(`https://www.google.com/maps?q=${u.lat},${u.lng}`)} style={{ marginTop: 10, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 6 }}>
                  <MaterialIcons name="place" size={18} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "600" }}>{L3("فتح موقع المستخدم في الخرائط", "Locatie openen in Kaarten", "Open location in Maps")}</Text>
                </TouchableOpacity>
              ) : null}
              <Row label={L3("اكتمال الملف الشخصي", "Profiel compleet", "Profile complete")} value={u.profileComplete === false ? L3("غير مكتمل", "Onvolledig", "Incomplete") : u.profileComplete === true ? L3("مكتمل", "Compleet", "Complete") : "—"} />
              {u.profileComplete === false && Array.isArray(u.missingProfileFields) && u.missingProfileFields.length > 0 && (
                <Text style={{ fontSize: 12, color: colors.error, textAlign: isRTL ? "right" : "left", marginTop: 4 }}>
                  {L3("الحقول الناقصة: ", "Ontbrekende velden: ", "Missing fields: ") + u.missingProfileFields.map((k: string) => MISSING_FIELD_LABELS[k] || k).join(L3("، ", ", ", ", "))}
                </Text>
              )}
            </View>

            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginTop: 20, marginBottom: 4, textAlign: isRTL ? "right" : "left" }}>{L3("الصلاحيات", "Rechten", "Permissions")}</Text>
            <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 8, textAlign: isRTL ? "right" : "left" }}>{L3("يمكن للمستخدم أن يحمل أكثر من صلاحية (اضغط لإضافة/إزالة)", "Een gebruiker kan meerdere rechten hebben (tik om toe te voegen of te verwijderen)", "A user can hold more than one permission (tap to add or remove)")}</Text>
            <View style={{ flexDirection: isRTL ? "row-reverse" : "row", flexWrap: "wrap", gap: 8 }}>
              {ROLES.map((r) => {
                const on = currentRoles.includes(r.key);
                return (
                  <TouchableOpacity key={r.key} disabled={updateRoles.isPending} onPress={() => toggleRole(r.key)}
                    style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 5, backgroundColor: on ? r.color : r.color + "15", borderRadius: 10, paddingVertical: 9, paddingHorizontal: 13 }}>
                    <MaterialIcons name={on ? "check" : "add"} size={15} color={on ? "#fff" : r.color} />
                    <Text style={{ fontSize: 13, fontWeight: "700", color: on ? "#fff" : r.color }}>{r.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity onPress={remove} disabled={deleteUser.isPending}
              style={{ marginTop: 28, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.error + "12", borderWidth: 1, borderColor: colors.error + "40", borderRadius: 12, paddingVertical: 14, opacity: deleteUser.isPending ? 0.6 : 1 }}>
              <MaterialIcons name="delete" size={20} color={colors.error} />
              <Text style={{ color: colors.error, fontWeight: "700", fontSize: 14 }}>{L3("حذف المستخدم", "Gebruiker verwijderen", "Delete user")}</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
    </View>
  );
}
