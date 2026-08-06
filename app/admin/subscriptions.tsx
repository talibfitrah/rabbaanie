import { useState } from "react";
import { ScrollView, Text, View, TextInput, TouchableOpacity, RefreshControl, ActivityIndicator, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import * as Clipboard from "expo-clipboard";
import { formatSubscriptionRemaining, PERPETUAL_DAYS } from "@/hooks/use-subscription";

/**
 * Admin management of subscriptions & coupons (msg 560/608). Grant/revoke
 * subscriptions, see who is subscribed, and create sellable coupon codes.
 * Uses the runtime tRPC proxy (vendored router type predates these procedures).
 */
export default function AdminSubscriptionsScreen() {
  const colors = useColors();
  const { isRTL } = useI18n();
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
    onError: (e: any) => Alert.alert("تعذّر المنح", e?.message || ""),
  });
  const revoke = admin.revokeSubscription.useMutation({ onSuccess: refetchAll });
  const setSub = admin.setSubscription.useMutation({
    onSuccess: refetchAll,
    onError: (e: any) => Alert.alert("تعذّر التعديل", e?.message || ""),
  });
  const createCoupon = admin.createCoupon.useMutation({ onSuccess: refetchAll });
  const toggleCoupon = admin.setCouponActive.useMutation({ onSuccess: refetchAll });
  const bulkCoupons = admin.createCouponsBulk.useMutation({ onSuccess: (r: any) => { refetchAll(); Alert.alert("تمّ", `أُنشئ ${r?.created ?? 0} كوبونًا.`); } });
  const couponsExportQ = admin.couponsExport.useQuery(undefined, { enabled: false });

  const [gUser, setGUser] = useState("");
  const [gDays, setGDays] = useState("365");
  const [cCode, setCCode] = useState("");
  const [cDays, setCDays] = useState("365");
  const [cPrice, setCPrice] = useState("15");
  const [cMax, setCMax] = useState("1");
  const [cCount, setCCount] = useState("10");

  // A perpetual grant is stored as a date ~100 years out, so every server-side
  // entitlement check (all of the form `status = active AND expiresAt >= now`)
  // keeps working with no nullable column. Anything past half that length was a
  // perpetual grant, so label it دائم rather than showing a year-2126 date. The
  // threshold is derived from PERPETUAL_DAYS so shortening one moves the other.
  const PERPETUAL_LABEL_CUTOFF_MS = (PERPETUAL_DAYS / 2) * 86400000;
  const fmt = (d: any) => {
    try {
      const t = new Date(d).getTime();
      if (t - Date.now() > PERPETUAL_LABEL_CUTOFF_MS) return "دائم";
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
    if (!uid) { Alert.alert("خطأ", "أدخل رقمَ المستخدم."); return; }
    if (!d) { Alert.alert("خطأ", "أدخل عددَ الأيام."); return; }
    // Clear only on success, and only here — the per-user buttons in the list
    // never read this field, so a shared onSuccess would wipe it under them.
    grant.mutate({ userId: uid, days: d }, { onSuccess: () => setGUser("") });
  }
  // A perpetual grant gives away a paid product for a century, and the button
  // sits in a wrapping row beside the one-year one, so its position shifts.
  // Cheap confirm beats noticing the mistap later in the subscriber list.
  function confirmPerpetual(userId: number, label: string) {
    Alert.alert(
      "اشتراكٌ دائم",
      `منح اشتراكٍ دائم لـ ${label}؟ لن ينتهيَ تلقائيًّا.`,
      [
        { text: "إلغاء", style: "cancel" },
        { text: "منح", onPress: () => grant.mutate({ userId, days: PERPETUAL_DAYS }) },
      ],
    );
  }
  function confirmSetLifetime(userId: number, label: string) {
    Alert.alert(
      "ضبط اشتراكٍ دائم",
      `ضبط اشتراك ${label} إلى دائم؟ سيحلّ محلّ الاشتراك الحاليّ ولن ينتهيَ تلقائيًّا.`,
      [
        { text: "إلغاء", style: "cancel" },
        { text: "ضبط", onPress: () => setSub.mutate({ userId, days: PERPETUAL_DAYS }) },
      ],
    );
  }
  function doCreateCoupon() {
    const code = cCode.trim(); if (!code) { Alert.alert("خطأ", "أدخل رمزَ الكوبون."); return; }
    createCoupon.mutate({ code, durationDays: Number(cDays) || 365, priceCents: Math.round((Number(cPrice) || 0) * 100), maxUses: Number(cMax) || 1 });
    setCCode("");
  }
  function doBulkCoupons() {
    const count = Number(cCount) || 0;
    if (count < 1) { Alert.alert("خطأ", "أدخل عددَ الكوبونات."); return; }
    bulkCoupons.mutate({ count, prefix: cCode.trim() || "RABB", durationDays: Number(cDays) || 365, priceCents: Math.round((Number(cPrice) || 0) * 100), maxUses: Number(cMax) || 1 });
  }
  async function doExportCoupons() {
    try {
      const res = await couponsExportQ.refetch();
      const csv = (res.data as any)?.csv;
      if (!csv) { Alert.alert("تعذّر", "لا كوبونات للتصدير."); return; }
      const FileSystem: any = await import("expo-file-system/legacy");
      const Sharing: any = await import("expo-sharing");
      const uri = FileSystem.documentDirectory + `coupons_${Date.now()}.csv`;
      await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "text/csv", dialogTitle: "تصدير الكوبونات" });
      else Alert.alert("تعذّرت المشاركة", "المشاركة غير متاحة على هذا الجهاز.");
    } catch (e: any) { Alert.alert("تعذّر التصدير", e?.message || ""); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: colors.surface, borderBottomWidth: 0.5, borderBottomColor: colors.border, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()}><MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={24} color={colors.foreground} /></TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, flex: 1, textAlign: align }}>الاشتراكات والكوبونات</Text>
        <Text style={{ fontSize: 12, color: colors.muted }}>{(stats.data as any)?.active ?? 0} نشط</Text>
      </View>

      <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 8, padding: 12 }}>
        {(["info", "subs", "coupons"] as const).map((t) => (
          <TouchableOpacity key={t} onPress={() => setTab(t)} style={{ flex: 1, backgroundColor: tab === t ? colors.primary : colors.surface, borderRadius: 10, paddingVertical: 9, alignItems: "center", borderWidth: 1, borderColor: tab === t ? colors.primary : colors.border }}>
            <Text style={{ color: tab === t ? "#fff" : colors.foreground, fontWeight: "700", fontSize: 12.5 }}>{t === "info" ? "المستخدمون" : t === "subs" ? "الاشتراكات" : "الكوبونات"}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 30 }} refreshControl={<RefreshControl refreshing={subs.isFetching || couponsQ.isFetching} onRefresh={refetchAll} />}>
        {tab === "subs" ? (
          <>
            <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 8, textAlign: align }}>منح اشتراك</Text>
              <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 8 }}>
                <TextInput value={gUser} onChangeText={setGUser} keyboardType="number-pad" placeholder="رقم المستخدم" placeholderTextColor={colors.muted} style={{ ...inp, flex: 1.4 }} />
                <TextInput value={gDays} onChangeText={setGDays} keyboardType="number-pad" placeholder="أيام" placeholderTextColor={colors.muted} style={{ ...inp, flex: 1 }} />
                <TouchableOpacity onPress={() => doGrant()} disabled={grant.isPending} style={{ backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontWeight: "700" }}>منح</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => doGrant(PERPETUAL_DAYS)} disabled={grant.isPending} style={{ backgroundColor: "#7C3AED", borderRadius: 10, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontWeight: "700" }}>دائم</Text></TouchableOpacity>
              </View>
            </View>
            {subs.isLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} /> : subsData.length === 0 ? (
              <Text style={{ color: colors.muted, textAlign: "center", marginTop: 30 }}>لا مشتركين بعد.</Text>
            ) : subsData.map((s) => {
              const active = s.status === "active" && new Date(s.expiresAt) > new Date();
              return (
                <View key={s.id} style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 13, marginBottom: 9, borderWidth: 1, borderColor: active ? colors.primary : colors.border }}>
                  <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, textAlign: align }}>مستخدم #{s.userId} · {s.source}</Text>
                      <Text style={{ fontSize: 11, color: colors.muted, textAlign: align, marginTop: 2 }}>{active ? "نشط" : "منتهٍ"} · إلى {fmt(s.expiresAt)}{s.couponCode ? ` · كوبون ${s.couponCode}` : ""}</Text>
                    </View>
                    {active ? <TouchableOpacity onPress={() => revoke.mutate({ id: s.id })}><Text style={{ color: "#c0392b", fontWeight: "700", fontSize: 12 }}>إلغاء</Text></TouchableOpacity> : null}
                  </View>
                </View>
              );
            })}
          </>
        ) : tab === "coupons" ? (
          <>
            <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 8, textAlign: align }}>إنشاء كوبون</Text>
              <TextInput value={cCode} onChangeText={setCCode} autoCapitalize="characters" placeholder="الرمز (مثل RABB-2026-XY)" placeholderTextColor={colors.muted} style={{ ...inp, marginBottom: 8 }} />
              <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 8, marginBottom: 8 }}>
                <TextInput value={cDays} onChangeText={setCDays} keyboardType="number-pad" placeholder="أيام" placeholderTextColor={colors.muted} style={{ ...inp, flex: 1 }} />
                <TextInput value={cPrice} onChangeText={setCPrice} keyboardType="decimal-pad" placeholder="السعر €" placeholderTextColor={colors.muted} style={{ ...inp, flex: 1 }} />
                <TextInput value={cMax} onChangeText={setCMax} keyboardType="number-pad" placeholder="مرّات" placeholderTextColor={colors.muted} style={{ ...inp, flex: 1 }} />
              </View>
              <TouchableOpacity onPress={doCreateCoupon} disabled={createCoupon.isPending} style={{ backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 11, alignItems: "center" }}><Text style={{ color: "#fff", fontWeight: "700" }}>إنشاء كوبونٍ واحد</Text></TouchableOpacity>
              <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 12 }} />
              <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 8, textAlign: align }}>توليدٌ بالجملة: يُستعمل «الرمز» أعلاه بادئةً لأكوادٍ عشوائيّة.</Text>
              <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 8 }}>
                <TextInput value={cCount} onChangeText={setCCount} keyboardType="number-pad" placeholder="العدد" placeholderTextColor={colors.muted} style={{ ...inp, flex: 1 }} />
                <TouchableOpacity onPress={doBulkCoupons} disabled={bulkCoupons.isPending} style={{ backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", flex: 2 }}><Text style={{ color: "#fff", fontWeight: "700" }}>{bulkCoupons.isPending ? "..." : "توليد عدّة كوبونات"}</Text></TouchableOpacity>
              </View>
            </View>
            <TouchableOpacity onPress={doExportCoupons} disabled={couponsExportQ.isFetching} style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 8, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary, borderRadius: 10, paddingVertical: 11, alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
              <MaterialIcons name="file-download" size={18} color={colors.primary} />
              <Text style={{ color: colors.primary, fontWeight: "800" }}>{couponsExportQ.isFetching ? "..." : "تصدير الكوبونات (Excel/CSV)"}</Text>
            </TouchableOpacity>
            {couponsQ.isLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} /> : couponsData.length === 0 ? (
              <Text style={{ color: colors.muted, textAlign: "center", marginTop: 30 }}>لا كوبونات بعد.</Text>
            ) : couponsData.map((c) => (
              <View key={c.id} style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 13, marginBottom: 9, borderWidth: 1, borderColor: c.active ? colors.primary : colors.border }}>
                <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground, textAlign: align }}>{c.code}</Text>
                    <Text style={{ fontSize: 11, color: colors.muted, textAlign: align, marginTop: 2 }}>{c.durationDays} يوم · {(c.priceCents / 100).toFixed(2)}€ · استُخدم {c.uses}/{c.maxUses}</Text>
                  </View>
                  <TouchableOpacity onPress={() => toggleCoupon.mutate({ id: c.id, active: !c.active })}>
                    <Text style={{ color: c.active ? "#c0392b" : colors.primary, fontWeight: "700", fontSize: 12 }}>{c.active ? "تعطيل" : "تفعيل"}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        ) : (
          <>
            <Text style={{ fontSize: 12, color: colors.muted, textAlign: align, marginBottom: 10, lineHeight: 19 }}>
              كلُّ مستخدمٍ سجّل فله اشتراكٌ عامّ (الخدمات العامة). امنحه الاشتراكَ الخاصّ ليصل إلى كلِّ الخدمات، أو ألغِه فيعود عامًّا.
            </Text>
            <TextInput value={search} onChangeText={setSearch} placeholder="ابحث بالرقم المميّز أو الاسم أو البريد" placeholderTextColor={colors.muted} style={{ ...inp, marginBottom: 10 }} />
            {infoQ.isLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} /> : (() => {
              const q = search.trim().toLowerCase();
              const list = infoData.filter((u: any) => !q || String(u.publicId || "").toLowerCase().includes(q) || String(u.name || "").toLowerCase().includes(q) || String(u.email || "").toLowerCase().includes(q) || `${u.firstName || ""} ${u.lastName || ""}`.toLowerCase().includes(q));
              if (list.length === 0) return <Text style={{ color: colors.muted, textAlign: "center", marginTop: 30 }}>لا مستخدمين.</Text>;
              return (
                <>
                  <Text style={{ fontSize: 11, color: colors.muted, textAlign: align, marginBottom: 8 }}>{list.length} مستخدمًا</Text>
                  {list.map((u: any) => {
                    const isSpecial = !!u.special;
                    const isLifetime = isSpecial && !!u.expiresAt && (new Date(u.expiresAt).getTime() - Date.now() > PERPETUAL_LABEL_CUTOFF_MS);
                    const displayName = (u.firstName || u.lastName) ? `${u.firstName || ""} ${u.lastName || ""}`.trim() : (u.name || "—");
                    const idText = u.publicId || `#${u.id}`;
                    return (
                      <View key={u.id} style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 13, marginBottom: 9, borderWidth: 1, borderColor: isSpecial ? colors.primary : colors.border }}>
                        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <Text style={{ flex: 1, fontSize: 15, fontWeight: "800", color: colors.foreground, textAlign: align }}>{displayName}</Text>
                          <View style={{ backgroundColor: (isSpecial ? colors.primary : colors.muted) + "22", borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3 }}>
                            <Text style={{ fontSize: 10.5, fontWeight: "700", color: isSpecial ? colors.primary : colors.muted }}>{isSpecial ? "خاصّ" : "عامّ"}</Text>
                          </View>
                        </View>
                        <TouchableOpacity onPress={() => { Clipboard.setStringAsync(idText); Alert.alert("تمّ النسخ", idText); }} style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 6, marginTop: 5 }}>
                          <MaterialIcons name="content-copy" size={13} color={colors.primary} />
                          <Text style={{ fontSize: 12.5, color: colors.primary, fontWeight: "700" }}>{idText}</Text>
                        </TouchableOpacity>
                        {u.email ? <Text style={{ fontSize: 12, color: colors.muted, textAlign: align, marginTop: 2 }}>{u.email}</Text> : null}
                        {u.phone ? <Text style={{ fontSize: 12, color: colors.muted, textAlign: align, marginTop: 2 }}>{u.phone}</Text> : null}
                        {isSpecial && u.expiresAt ? <Text style={{ fontSize: 12, color: colors.primary, fontWeight: "700", textAlign: align, marginTop: 4 }}>{formatSubscriptionRemaining(u.expiresAt, "ar")}</Text> : null}
                        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", marginTop: 10, gap: 8, flexWrap: "wrap" }}>
                          {!isSpecial ? (
                            <>
                              <TouchableOpacity onPress={() => grant.mutate({ userId: u.id, days: 365 })} disabled={grant.isPending} style={{ backgroundColor: colors.primary, borderRadius: 9, paddingVertical: 9, paddingHorizontal: 16 }}>
                                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>ترقية إلى اشتراكٍ خاصّ (سنة)</Text>
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => confirmPerpetual(u.id, displayName)} disabled={grant.isPending} style={{ backgroundColor: "#7C3AED", borderRadius: 9, paddingVertical: 9, paddingHorizontal: 16 }}>
                                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>اشتراكٌ دائم</Text>
                              </TouchableOpacity>
                            </>
                          ) : (
                            <>
                              <TouchableOpacity onPress={() => setSub.mutate({ userId: u.id, days: 365 })} disabled={setSub.isPending} style={{ backgroundColor: colors.primary, borderRadius: 9, paddingVertical: 9, paddingHorizontal: 16 }}>
                                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>ضبط: سنة واحدة</Text>
                              </TouchableOpacity>
                              {!isLifetime ? (
                                <>
                                  <TouchableOpacity onPress={() => confirmSetLifetime(u.id, displayName)} disabled={setSub.isPending} style={{ backgroundColor: "#7C3AED", borderRadius: 9, paddingVertical: 9, paddingHorizontal: 16 }}>
                                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>ضبط: دائم</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity onPress={() => grant.mutate({ userId: u.id, days: 365 })} disabled={grant.isPending} style={{ backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary, borderRadius: 9, paddingVertical: 9, paddingHorizontal: 16 }}>
                                    <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 12 }}>تمديد سنة</Text>
                                  </TouchableOpacity>
                                </>
                              ) : null}
                              <TouchableOpacity onPress={() => u.subscriptionId && revoke.mutate({ id: u.subscriptionId })} disabled={revoke.isPending} style={{ backgroundColor: "#c0392b", borderRadius: 9, paddingVertical: 9, paddingHorizontal: 16 }}>
                                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>إلغاء الاشتراك الخاصّ</Text>
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
