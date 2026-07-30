import { useState } from "react";
import { ScrollView, Text, View, TextInput, TouchableOpacity, RefreshControl, ActivityIndicator, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";

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

  const [tab, setTab] = useState<"subs" | "coupons">("subs");
  const subs = admin.subscriptionsList.useQuery();
  const stats = admin.subscriptionStats.useQuery();
  const couponsQ = admin.couponsList.useQuery();
  const refetchAll = () => { subs.refetch(); stats.refetch(); couponsQ.refetch(); };

  const grant = admin.grantSubscription.useMutation({ onSuccess: refetchAll });
  const revoke = admin.revokeSubscription.useMutation({ onSuccess: refetchAll });
  const createCoupon = admin.createCoupon.useMutation({ onSuccess: refetchAll });
  const toggleCoupon = admin.setCouponActive.useMutation({ onSuccess: refetchAll });

  const [gUser, setGUser] = useState("");
  const [gDays, setGDays] = useState("365");
  const [cCode, setCCode] = useState("");
  const [cDays, setCDays] = useState("365");
  const [cPrice, setCPrice] = useState("15");
  const [cMax, setCMax] = useState("1");

  const fmt = (d: any) => { try { return new Date(d).toLocaleDateString(); } catch { return ""; } };
  const inp = { backgroundColor: colors.background, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, color: colors.foreground, borderWidth: 1, borderColor: colors.border, textAlign: align as "right" | "left" };
  const subsData = (subs.data as any[]) || [];
  const couponsData = (couponsQ.data as any[]) || [];

  function doGrant() {
    const uid = Number(gUser); const days = Number(gDays);
    if (!uid || !days) { Alert.alert("خطأ", "أدخل رقمَ المستخدم وعددَ الأيام."); return; }
    grant.mutate({ userId: uid, days }); setGUser("");
  }
  function doCreateCoupon() {
    const code = cCode.trim(); if (!code) { Alert.alert("خطأ", "أدخل رمزَ الكوبون."); return; }
    createCoupon.mutate({ code, durationDays: Number(cDays) || 365, priceCents: Math.round((Number(cPrice) || 0) * 100), maxUses: Number(cMax) || 1 });
    setCCode("");
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: colors.surface, borderBottomWidth: 0.5, borderBottomColor: colors.border, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()}><MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={24} color={colors.foreground} /></TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, flex: 1, textAlign: align }}>الاشتراكات والكوبونات</Text>
        <Text style={{ fontSize: 12, color: colors.muted }}>{(stats.data as any)?.active ?? 0} نشط</Text>
      </View>

      <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 8, padding: 12 }}>
        {(["subs", "coupons"] as const).map((t) => (
          <TouchableOpacity key={t} onPress={() => setTab(t)} style={{ flex: 1, backgroundColor: tab === t ? colors.primary : colors.surface, borderRadius: 10, paddingVertical: 9, alignItems: "center", borderWidth: 1, borderColor: tab === t ? colors.primary : colors.border }}>
            <Text style={{ color: tab === t ? "#fff" : colors.foreground, fontWeight: "700", fontSize: 13 }}>{t === "subs" ? "المشتركون" : "الكوبونات"}</Text>
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
                <TouchableOpacity onPress={doGrant} disabled={grant.isPending} style={{ backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontWeight: "700" }}>منح</Text></TouchableOpacity>
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
        ) : (
          <>
            <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 8, textAlign: align }}>إنشاء كوبون</Text>
              <TextInput value={cCode} onChangeText={setCCode} autoCapitalize="characters" placeholder="الرمز (مثل RABB-2026-XY)" placeholderTextColor={colors.muted} style={{ ...inp, marginBottom: 8 }} />
              <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 8, marginBottom: 8 }}>
                <TextInput value={cDays} onChangeText={setCDays} keyboardType="number-pad" placeholder="أيام" placeholderTextColor={colors.muted} style={{ ...inp, flex: 1 }} />
                <TextInput value={cPrice} onChangeText={setCPrice} keyboardType="decimal-pad" placeholder="السعر €" placeholderTextColor={colors.muted} style={{ ...inp, flex: 1 }} />
                <TextInput value={cMax} onChangeText={setCMax} keyboardType="number-pad" placeholder="مرّات" placeholderTextColor={colors.muted} style={{ ...inp, flex: 1 }} />
              </View>
              <TouchableOpacity onPress={doCreateCoupon} disabled={createCoupon.isPending} style={{ backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 11, alignItems: "center" }}><Text style={{ color: "#fff", fontWeight: "700" }}>إنشاء</Text></TouchableOpacity>
            </View>
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
        )}
      </ScrollView>
    </View>
  );
}
