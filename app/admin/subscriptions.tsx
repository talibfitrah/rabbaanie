import { useState } from "react";
import { ScrollView, Text, View, TextInput, TouchableOpacity, RefreshControl, ActivityIndicator, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { useL3 } from "@/lib/admin-text";
import { trpc } from "@/lib/trpc";
import * as Clipboard from "expo-clipboard";
import { formatSubscriptionRemaining, isPerpetualExpiry, PERPETUAL_DAYS } from "@/hooks/use-subscription";

/**
 * Admin management of subscriptions & coupons (msg 560/608). Grant/revoke
 * subscriptions, see who is subscribed, and create sellable coupon codes.
 * Uses the runtime tRPC proxy (vendored router type predates these procedures).
 */
export default function AdminSubscriptionsScreen() {
  const colors = useColors();
  const { isRTL, language } = useI18n();
  const L3 = useL3();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const align = isRTL ? "right" : "left";
  const admin = (trpc as any).admin;

  const [tab, setTab] = useState<"info" | "subs" | "coupons">("info");
  const [search, setSearch] = useState("");
  const subs = admin.subscriptionsList.useQuery();
  const stats = admin.subscriptionStats.useQuery();
  const couponsQ = admin.couponsList.useQuery();
  const infoQ = admin.subscribersOverview.useQuery();
  const refetchAll = () => { subs.refetch(); stats.refetch(); couponsQ.refetch(); infoQ.refetch(); };

  // Without onError a rejected grant is a silent no-op — and the دائم buttons
  // send 36500 days, which an API still on the old 3650-day cap rejects. The
  // app and the API ship separately, so that window is real.
  const grant = admin.grantSubscription.useMutation({
    onSuccess: refetchAll,
    onError: (e: any) => Alert.alert(L3("تعذّر المنح", "Toekennen mislukt", "Grant failed"), e?.message || ""),
  });
  const revoke = admin.revokeSubscription.useMutation({ onSuccess: refetchAll });
  const setSub = admin.setSubscription.useMutation({
    onSuccess: refetchAll,
    onError: (e: any) => Alert.alert(L3("تعذّر التعديل", "Wijzigen mislukt", "Update failed"), e?.message || ""),
  });
  const createCoupon = admin.createCoupon.useMutation({ onSuccess: refetchAll });
  const toggleCoupon = admin.setCouponActive.useMutation({ onSuccess: refetchAll });
  const bulkCoupons = admin.createCouponsBulk.useMutation({ onSuccess: (r: any) => { refetchAll(); Alert.alert(L3("تمّ", "Klaar", "Done"), L3(`أُنشئ ${r?.created ?? 0} كوبونًا.`, `${r?.created ?? 0} coupons aangemaakt.`, `Created ${r?.created ?? 0} coupons.`)); } });
  const couponsExportQ = admin.couponsExport.useQuery(undefined, { enabled: false });

  const [gUser, setGUser] = useState("");
  const [gDays, setGDays] = useState("365");
  const [cCode, setCCode] = useState("");
  const [cDays, setCDays] = useState("365");
  const [cPrice, setCPrice] = useState("15");
  const [cMax, setCMax] = useState("1");
  const [cCount, setCCount] = useState("10");

  const fmt = (d: any) => {
    try {
      if (isPerpetualExpiry(d)) return L3("دائم", "Levenslang", "Lifetime");
      return new Date(d).toLocaleDateString();
    } catch { return ""; }
  };
  const inp = { backgroundColor: colors.background, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, color: colors.foreground, borderWidth: 1, borderColor: colors.border, textAlign: align as "right" | "left" };
  const subsData = (subs.data as any[]) || [];
  const couponsData = (couponsQ.data as any[]) || [];
  const infoData = (infoQ.data as any[]) || [];

  function doGrant(days?: number) {
    const uid = Number(gUser); const d = days ?? Number(gDays);
    // The دائم button supplies its own days, so only the user number is missing.
    if (!uid) { Alert.alert(L3("خطأ", "Fout", "Error"), L3("أدخل رقمَ المستخدم.", "Voer het gebruikersnummer in.", "Enter the user number.")); return; }
    if (!d) { Alert.alert(L3("خطأ", "Fout", "Error"), L3("أدخل عددَ الأيام.", "Voer het aantal dagen in.", "Enter the number of days.")); return; }
    // Clear only on success, and only here — the per-user buttons in the list
    // never read this field, so a shared onSuccess would wipe it under them.
    grant.mutate({ userId: uid, days: d }, { onSuccess: () => setGUser("") });
  }
  // A perpetual grant gives away a paid product for a century, and the button
  // sits in a wrapping row beside the one-year one, so its position shifts.
  // Cheap confirm beats noticing the mistap later in the subscriber list.
  function confirmPerpetual(userId: number, label: string) {
    Alert.alert(
      L3("اشتراكٌ دائم", "Levenslang abonnement", "Lifetime subscription"),
      L3(`منح اشتراكٍ دائم لـ ${label}؟ لن ينتهيَ تلقائيًّا.`, `${label} een levenslang abonnement toekennen? Het verloopt niet automatisch.`, `Grant ${label} a lifetime subscription? It will not expire automatically.`),
      [
        { text: L3("إلغاء", "Annuleren", "Cancel"), style: "cancel" },
        { text: L3("منح", "Toekennen", "Grant"), onPress: () => grant.mutate({ userId, days: PERPETUAL_DAYS }) },
      ],
    );
  }
  function confirmSetLifetime(userId: number, label: string) {
    Alert.alert(
      L3("ضبط اشتراكٍ دائم", "Instellen op levenslang", "Set to lifetime"),
      L3(`ضبط اشتراك ${label} إلى دائم؟ سيحلّ محلّ الاشتراك الحاليّ ولن ينتهيَ تلقائيًّا.`, `Het abonnement van ${label} op levenslang zetten? Dit vervangt het huidige abonnement en verloopt niet automatisch.`, `Set ${label}'s subscription to lifetime? This replaces the current subscription and will not expire automatically.`),
      [
        { text: L3("إلغاء", "Annuleren", "Cancel"), style: "cancel" },
        { text: L3("ضبط", "Instellen", "Set"), onPress: () => setSub.mutate({ userId, days: PERPETUAL_DAYS }) },
      ],
    );
  }
  function confirmSetOneYear(userId: number, label: string, wasLifetime: boolean) {
    Alert.alert(
      L3("ضبط سنةٍ واحدة", "Instellen op één jaar", "Set to one year"),
      wasLifetime
        ? L3(`${label} لديه اشتراكٌ دائم. ضبطه إلى سنةٍ واحدة سينهي الدوامَ نهائيًّا. لا يمكن التراجع إلّا بمنح دائمٍ جديد.`, `${label} heeft een levenslang abonnement. Instellen op één jaar beëindigt dat definitief; alleen een nieuwe levenslange toekenning maakt het ongedaan.`, `${label} has a lifetime subscription. Setting it to one year ends that permanently; only a new lifetime grant can undo it.`)
        : L3(`ضبط اشتراك ${label} إلى سنةٍ واحدة؟ سيحلّ محلّ الاشتراك الحاليّ.`, `Het abonnement van ${label} op één jaar zetten? Dit vervangt het huidige abonnement.`, `Set ${label}'s subscription to one year? This replaces the current subscription.`),
      [
        { text: L3("إلغاء", "Annuleren", "Cancel"), style: "cancel" },
        { text: L3("ضبط", "Instellen", "Set"), onPress: () => setSub.mutate({ userId, days: 365 }) },
      ],
    );
  }
  function doCreateCoupon() {
    const code = cCode.trim(); if (!code) { Alert.alert(L3("خطأ", "Fout", "Error"), L3("أدخل رمزَ الكوبون.", "Voer de couponcode in.", "Enter the coupon code.")); return; }
    createCoupon.mutate({ code, durationDays: Number(cDays) || 365, priceCents: Math.round((Number(cPrice) || 0) * 100), maxUses: Number(cMax) || 1 });
    setCCode("");
  }
  function doBulkCoupons() {
    const count = Number(cCount) || 0;
    if (count < 1) { Alert.alert(L3("خطأ", "Fout", "Error"), L3("أدخل عددَ الكوبونات.", "Voer het aantal coupons in.", "Enter the number of coupons.")); return; }
    bulkCoupons.mutate({ count, prefix: cCode.trim() || "RABB", durationDays: Number(cDays) || 365, priceCents: Math.round((Number(cPrice) || 0) * 100), maxUses: Number(cMax) || 1 });
  }
  async function doExportCoupons() {
    try {
      const res = await couponsExportQ.refetch();
      const csv = (res.data as any)?.csv;
      if (!csv) { Alert.alert(L3("تعذّر", "Niet mogelijk", "Unavailable"), L3("لا كوبونات للتصدير.", "Geen coupons om te exporteren.", "No coupons to export.")); return; }
      const FileSystem: any = await import("expo-file-system/legacy");
      const Sharing: any = await import("expo-sharing");
      const uri = FileSystem.documentDirectory + `coupons_${Date.now()}.csv`;
      await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "text/csv", dialogTitle: L3("تصدير الكوبونات", "Coupons exporteren", "Export coupons") });
      else Alert.alert(L3("تعذّرت المشاركة", "Delen mislukt", "Sharing failed"), L3("المشاركة غير متاحة على هذا الجهاز.", "Delen is niet beschikbaar op dit apparaat.", "Sharing is not available on this device."));
    } catch (e: any) { Alert.alert(L3("تعذّر التصدير", "Exporteren mislukt", "Export failed"), e?.message || ""); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: colors.surface, borderBottomWidth: 0.5, borderBottomColor: colors.border, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()}><MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={24} color={colors.foreground} /></TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, flex: 1, textAlign: align }}>{L3("الاشتراكات والكوبونات", "Abonnementen & coupons", "Subscriptions & coupons")}</Text>
        <Text style={{ fontSize: 12, color: colors.muted }}>{(stats.data as any)?.active ?? 0} {L3("نشط", "actief", "active")}</Text>
      </View>

      <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 8, padding: 12 }}>
        {(["info", "subs", "coupons"] as const).map((t) => (
          <TouchableOpacity key={t} onPress={() => setTab(t)} style={{ flex: 1, backgroundColor: tab === t ? colors.primary : colors.surface, borderRadius: 10, paddingVertical: 9, alignItems: "center", borderWidth: 1, borderColor: tab === t ? colors.primary : colors.border }}>
            <Text style={{ color: tab === t ? "#fff" : colors.foreground, fontWeight: "700", fontSize: 12.5 }}>{t === "info" ? L3("المستخدمون", "Gebruikers", "Users") : t === "subs" ? L3("الاشتراكات", "Abonnementen", "Subscriptions") : L3("الكوبونات", "Coupons", "Coupons")}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 30 }} refreshControl={<RefreshControl refreshing={subs.isFetching || couponsQ.isFetching} onRefresh={refetchAll} />}>
        {tab === "subs" ? (
          <>
            <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 8, textAlign: align }}>{L3("منح اشتراك", "Abonnement toekennen", "Grant subscription")}</Text>
              <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 8 }}>
                <TextInput value={gUser} onChangeText={setGUser} keyboardType="number-pad" placeholder={L3("رقم المستخدم", "Gebruikersnummer", "User number")} placeholderTextColor={colors.muted} style={{ ...inp, flex: 1.4 }} />
                <TextInput value={gDays} onChangeText={setGDays} keyboardType="number-pad" placeholder={L3("أيام", "Dagen", "Days")} placeholderTextColor={colors.muted} style={{ ...inp, flex: 1 }} />
                <TouchableOpacity onPress={() => doGrant()} disabled={grant.isPending} style={{ backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontWeight: "700" }}>{L3("منح", "Toekennen", "Grant")}</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => doGrant(PERPETUAL_DAYS)} disabled={grant.isPending} style={{ backgroundColor: "#7C3AED", borderRadius: 10, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontWeight: "700" }}>{L3("دائم", "Levenslang", "Lifetime")}</Text></TouchableOpacity>
              </View>
            </View>
            {subs.isLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} /> : subsData.length === 0 ? (
              <Text style={{ color: colors.muted, textAlign: "center", marginTop: 30 }}>{L3("لا مشتركين بعد.", "Nog geen abonnees.", "No subscribers yet.")}</Text>
            ) : subsData.map((s) => {
              const active = s.status === "active" && new Date(s.expiresAt) > new Date();
              return (
                <View key={s.id} style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 13, marginBottom: 9, borderWidth: 1, borderColor: active ? colors.primary : colors.border }}>
                  <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, textAlign: align }}>{L3("مستخدم", "Gebruiker", "User")} #{s.userId} · {s.source}</Text>
                      <Text style={{ fontSize: 11, color: colors.muted, textAlign: align, marginTop: 2 }}>{active ? L3("نشط", "actief", "active") : L3("منتهٍ", "verlopen", "expired")} · {L3("إلى", "tot", "until")} {fmt(s.expiresAt)}{s.couponCode ? L3(` · كوبون ${s.couponCode}`, ` · coupon ${s.couponCode}`, ` · coupon ${s.couponCode}`) : ""}</Text>
                    </View>
                    {active ? <TouchableOpacity onPress={() => revoke.mutate({ id: s.id })}><Text style={{ color: "#c0392b", fontWeight: "700", fontSize: 12 }}>{L3("إلغاء", "Intrekken", "Revoke")}</Text></TouchableOpacity> : null}
                  </View>
                </View>
              );
            })}
          </>
        ) : tab === "coupons" ? (
          <>
            <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 8, textAlign: align }}>{L3("إنشاء كوبون", "Coupon aanmaken", "Create coupon")}</Text>
              <TextInput value={cCode} onChangeText={setCCode} autoCapitalize="characters" placeholder={L3("الرمز (مثل RABB-2026-XY)", "Code (bijv. RABB-2026-XY)", "Code (e.g. RABB-2026-XY)")} placeholderTextColor={colors.muted} style={{ ...inp, marginBottom: 8 }} />
              <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 8, marginBottom: 8 }}>
                <TextInput value={cDays} onChangeText={setCDays} keyboardType="number-pad" placeholder={L3("أيام", "Dagen", "Days")} placeholderTextColor={colors.muted} style={{ ...inp, flex: 1 }} />
                <TextInput value={cPrice} onChangeText={setCPrice} keyboardType="decimal-pad" placeholder={L3("السعر €", "Prijs €", "Price €")} placeholderTextColor={colors.muted} style={{ ...inp, flex: 1 }} />
                <TextInput value={cMax} onChangeText={setCMax} keyboardType="number-pad" placeholder={L3("مرّات", "Max. gebruik", "Max uses")} placeholderTextColor={colors.muted} style={{ ...inp, flex: 1 }} />
              </View>
              <TouchableOpacity onPress={doCreateCoupon} disabled={createCoupon.isPending} style={{ backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 11, alignItems: "center" }}><Text style={{ color: "#fff", fontWeight: "700" }}>{L3("إنشاء كوبونٍ واحد", "Eén coupon aanmaken", "Create one coupon")}</Text></TouchableOpacity>
              <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 12 }} />
              <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 8, textAlign: align }}>{L3("توليدٌ بالجملة: يُستعمل «الرمز» أعلاه بادئةً لأكوادٍ عشوائيّة.", "Bulk aanmaken: de code hierboven wordt het voorvoegsel van willekeurige codes.", "Bulk generation: the code above becomes the prefix of random codes.")}</Text>
              <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 8 }}>
                <TextInput value={cCount} onChangeText={setCCount} keyboardType="number-pad" placeholder={L3("العدد", "Aantal", "Count")} placeholderTextColor={colors.muted} style={{ ...inp, flex: 1 }} />
                <TouchableOpacity onPress={doBulkCoupons} disabled={bulkCoupons.isPending} style={{ backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", flex: 2 }}><Text style={{ color: "#fff", fontWeight: "700" }}>{bulkCoupons.isPending ? "..." : L3("توليد عدّة كوبونات", "Meerdere coupons aanmaken", "Generate multiple coupons")}</Text></TouchableOpacity>
              </View>
            </View>
            <TouchableOpacity onPress={doExportCoupons} disabled={couponsExportQ.isFetching} style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 8, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary, borderRadius: 10, paddingVertical: 11, alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
              <MaterialIcons name="file-download" size={18} color={colors.primary} />
              <Text style={{ color: colors.primary, fontWeight: "800" }}>{couponsExportQ.isFetching ? "..." : L3("تصدير الكوبونات (Excel/CSV)", "Coupons exporteren (Excel/CSV)", "Export coupons (Excel/CSV)")}</Text>
            </TouchableOpacity>
            {couponsQ.isLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} /> : couponsData.length === 0 ? (
              <Text style={{ color: colors.muted, textAlign: "center", marginTop: 30 }}>{L3("لا كوبونات بعد.", "Nog geen coupons.", "No coupons yet.")}</Text>
            ) : couponsData.map((c) => (
              <View key={c.id} style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 13, marginBottom: 9, borderWidth: 1, borderColor: c.active ? colors.primary : colors.border }}>
                <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground, textAlign: align }}>{c.code}</Text>
                    <Text style={{ fontSize: 11, color: colors.muted, textAlign: align, marginTop: 2 }}>{c.durationDays} {L3("يوم", "dagen", "days")} · {(c.priceCents / 100).toFixed(2)}€ · {L3("استُخدم", "gebruikt", "used")} {c.uses}/{c.maxUses}</Text>
                  </View>
                  <TouchableOpacity onPress={() => toggleCoupon.mutate({ id: c.id, active: !c.active })}>
                    <Text style={{ color: c.active ? "#c0392b" : colors.primary, fontWeight: "700", fontSize: 12 }}>{c.active ? L3("تعطيل", "Uitschakelen", "Disable") : L3("تفعيل", "Inschakelen", "Enable")}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        ) : (
          <>
            <Text style={{ fontSize: 12, color: colors.muted, textAlign: align, marginBottom: 10, lineHeight: 19 }}>
              {L3("كلُّ مستخدمٍ سجّل فله اشتراكٌ عامّ (الخدمات العامة). امنحه الاشتراكَ الخاصّ ليصل إلى كلِّ الخدمات، أو ألغِه فيعود عامًّا.", "Elke geregistreerde gebruiker heeft een algemeen abonnement (algemene diensten). Ken het speciale abonnement toe voor toegang tot alle diensten, of trek het in om terug te keren naar algemeen.", "Every registered user has a general subscription (general services). Grant the special subscription for access to all services, or revoke it to return to general.")}
            </Text>
            <TextInput value={search} onChangeText={setSearch} placeholder={L3("ابحث بالرقم المميّز أو الاسم أو البريد", "Zoek op ID, naam of e-mail", "Search by ID, name or email")} placeholderTextColor={colors.muted} style={{ ...inp, marginBottom: 10 }} />
            {infoQ.isLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} /> : (() => {
              const q = search.trim().toLowerCase();
              const list = infoData.filter((u: any) => !q || String(u.publicId || "").toLowerCase().includes(q) || String(u.name || "").toLowerCase().includes(q) || String(u.email || "").toLowerCase().includes(q) || `${u.firstName || ""} ${u.lastName || ""}`.toLowerCase().includes(q));
              if (list.length === 0) return <Text style={{ color: colors.muted, textAlign: "center", marginTop: 30 }}>{L3("لا مستخدمين.", "Geen gebruikers.", "No users.")}</Text>;
              return (
                <>
                  <Text style={{ fontSize: 11, color: colors.muted, textAlign: align, marginBottom: 8 }}>{list.length} {L3("مستخدمًا", "gebruikers", "users")}</Text>
                  {list.map((u: any) => {
                    const isSpecial = !!u.special;
                    const isLifetime = isSpecial && !!u.expiresAt && isPerpetualExpiry(u.expiresAt);
                    const displayName = (u.firstName || u.lastName) ? `${u.firstName || ""} ${u.lastName || ""}`.trim() : (u.name || "—");
                    const idText = u.publicId || `#${u.id}`;
                    return (
                      <View key={u.id} style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 13, marginBottom: 9, borderWidth: 1, borderColor: isSpecial ? colors.primary : colors.border }}>
                        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <Text style={{ flex: 1, fontSize: 15, fontWeight: "800", color: colors.foreground, textAlign: align }}>{displayName}</Text>
                          <View style={{ backgroundColor: (isSpecial ? colors.primary : colors.muted) + "22", borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3 }}>
                            <Text style={{ fontSize: 10.5, fontWeight: "700", color: isSpecial ? colors.primary : colors.muted }}>{isSpecial ? L3("خاصّ", "Speciaal", "Special") : L3("عامّ", "Algemeen", "General")}</Text>
                          </View>
                        </View>
                        <TouchableOpacity onPress={() => { Clipboard.setStringAsync(idText); Alert.alert(L3("تمّ النسخ", "Gekopieerd", "Copied"), idText); }} style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 6, marginTop: 5 }}>
                          <MaterialIcons name="content-copy" size={13} color={colors.primary} />
                          <Text style={{ fontSize: 12.5, color: colors.primary, fontWeight: "700" }}>{idText}</Text>
                        </TouchableOpacity>
                        {u.email ? <Text style={{ fontSize: 12, color: colors.muted, textAlign: align, marginTop: 2 }}>{u.email}</Text> : null}
                        {u.phone ? <Text style={{ fontSize: 12, color: colors.muted, textAlign: align, marginTop: 2 }}>{u.phone}</Text> : null}
                        {isSpecial && u.expiresAt ? <Text style={{ fontSize: 12, color: colors.primary, fontWeight: "700", textAlign: align, marginTop: 4 }}>{formatSubscriptionRemaining(u.expiresAt, language)}</Text> : null}
                        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", marginTop: 10, gap: 8, flexWrap: "wrap" }}>
                          {!isSpecial ? (
                            <>
                              <TouchableOpacity onPress={() => grant.mutate({ userId: u.id, days: 365 })} disabled={grant.isPending} style={{ backgroundColor: colors.primary, borderRadius: 9, paddingVertical: 9, paddingHorizontal: 16 }}>
                                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>{L3("ترقية إلى اشتراكٍ خاصّ (سنة)", "Upgraden naar speciaal (1 jaar)", "Upgrade to special (1 year)")}</Text>
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => confirmPerpetual(u.id, displayName)} disabled={grant.isPending} style={{ backgroundColor: "#7C3AED", borderRadius: 9, paddingVertical: 9, paddingHorizontal: 16 }}>
                                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>{L3("اشتراكٌ دائم", "Levenslang abonnement", "Lifetime subscription")}</Text>
                              </TouchableOpacity>
                            </>
                          ) : (
                            <>
                              <TouchableOpacity onPress={() => confirmSetOneYear(u.id, displayName, isLifetime)} disabled={setSub.isPending} style={{ backgroundColor: colors.primary, borderRadius: 9, paddingVertical: 9, paddingHorizontal: 16 }}>
                                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>{L3("ضبط: سنة واحدة", "Instellen: één jaar", "Set: one year")}</Text>
                              </TouchableOpacity>
                              {!isLifetime ? (
                                <>
                                  <TouchableOpacity onPress={() => confirmSetLifetime(u.id, displayName)} disabled={setSub.isPending} style={{ backgroundColor: "#7C3AED", borderRadius: 9, paddingVertical: 9, paddingHorizontal: 16 }}>
                                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>{L3("ضبط: دائم", "Instellen: levenslang", "Set: lifetime")}</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity onPress={() => grant.mutate({ userId: u.id, days: 365 })} disabled={grant.isPending} style={{ backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary, borderRadius: 9, paddingVertical: 9, paddingHorizontal: 16 }}>
                                    <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 12 }}>{L3("تمديد سنة", "Eén jaar verlengen", "Extend one year")}</Text>
                                  </TouchableOpacity>
                                </>
                              ) : null}
                              <TouchableOpacity onPress={() => u.subscriptionId && revoke.mutate({ id: u.subscriptionId })} disabled={revoke.isPending} style={{ backgroundColor: "#c0392b", borderRadius: 9, paddingVertical: 9, paddingHorizontal: 16 }}>
                                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>{L3("إلغاء الاشتراك الخاصّ", "Speciaal abonnement intrekken", "Revoke special subscription")}</Text>
                              </TouchableOpacity>
                            </>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </>
              );
            })()}
          </>
        )}
      </ScrollView>
    </View>
  );
}
