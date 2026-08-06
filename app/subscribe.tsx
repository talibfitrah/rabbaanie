import { useState, useEffect, useCallback } from "react";
import { ScrollView, Text, View, TextInput, TouchableOpacity, ActivityIndicator, Linking, Alert } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { invalidateSubscriptionCache, subscriptionFetch } from "@/hooks/use-subscription";
import { DISTRIBUTION_CHANNEL } from "@/lib/distribution";

/**
 * Annual subscription (msg 560/608): shows the member's status, lets them
 * subscribe via Stripe checkout, or redeem a coupon code.
 */
export default function SubscribeScreen() {
  const colors = useColors();
  const { language, isRTL } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, isAuthenticated } = useAuth();
  const uid = (user as any)?.id as number | undefined;
  const L3 = (ar: string, nl: string, en: string) => (language === "ar" ? ar : language === "en" ? en : nl);
  const align = isRTL ? "right" : "left";

  const [status, setStatus] = useState<{ subscribed: boolean; expiresAt?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [coupon, setCoupon] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  // Required subscriber info (msg 636)
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [maritalStatus, setMaritalStatus] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState(((user as any)?.email as string) || "");
  const [phone, setPhone] = useState("");
  const info = { firstName: firstName.trim(), lastName: lastName.trim(), maritalStatus, address: address.trim(), email: email.trim(), phone: phone.trim() };
  const infoComplete = Object.values(info).every(Boolean);
  const MARITAL = [
    { k: "single", ar: "أعزب/عزباء", nl: "Alleenstaand", en: "Single" },
    { k: "married", ar: "متزوّج/ة", nl: "Getrouwd", en: "Married" },
    { k: "widowed", ar: "أرمل/ة", nl: "Weduwe", en: "Widowed" },
    { k: "divorced", ar: "مطلّق/ة", nl: "Gescheiden", en: "Divorced" },
  ];
  // Tier explainer (msg 720): what General (free) vs Special (paid) unlocks.
  const GENERAL = [
    { k: "adhkar", icon: "auto-stories", ar: "الأذكار", nl: "Adhkaar", en: "Adhkaar" },
    { k: "prayer", icon: "mosque", ar: "الصلاة والمواقيت", nl: "Gebedstijden", en: "Prayer times" },
    { k: "fitrah", icon: "eco", ar: "الفطرة", nl: "Fitrah", en: "Fitrah" },
    { k: "self", icon: "balance", ar: "ضبط النفس", nl: "Zelfbeheersing", en: "Self-control" },
    { k: "sunnah", icon: "wb-sunny", ar: "رفيق السنّة", nl: "Sunnah-metgezel", en: "Sunnah companion" },
    { k: "library", icon: "local-library", ar: "المكتبة", nl: "Bibliotheek", en: "Library" },
  ];
  const SPECIAL = [
    { k: "advisor", icon: "forum", ar: "المستشار التربويّ", nl: "Slimme adviseur", en: "Smart advisor" },
    { k: "children", icon: "description", ar: "تحليل بيئة الأطفال", nl: "Kindanalyse", en: "Child analysis" },
    { k: "advice", icon: "lightbulb", ar: "النصائح الشخصيّة", nl: "Persoonlijk advies", en: "Personal advice" },
    { k: "weekly", icon: "event", ar: "الخطّة الأسبوعيّة", nl: "Weekplan", en: "Weekly plan" },
    { k: "treat", icon: "healing", ar: "خطط العلاج", nl: "Behandelplannen", en: "Treatment plans" },
    { k: "family", icon: "home", ar: "إدارة العائلة", nl: "Gezinsbeheer", en: "Family" },
    { k: "messages", icon: "mail", ar: "مراسلة المتخصّصين", nl: "Berichten", en: "Messages" },
    { k: "network", icon: "hub", ar: "الشبكة والربط", nl: "Netwerk", en: "Network" },
  ];

  const loadStatus = useCallback(async () => {
    if (!uid) { setLoading(false); return; }
    try {
      const r = await subscriptionFetch(`status?userId=${uid}`);
      setStatus(await r.json());
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [uid]);
  const loadInfo = useCallback(async () => {
    if (!uid) return;
    try {
      const r = await subscriptionFetch(`info?userId=${uid}`);
      const d = await r.json();
      if (d) {
        setFirstName(d.firstName || ""); setLastName(d.lastName || ""); setMaritalStatus(d.maritalStatus || "");
        setAddress(d.address || ""); setEmail(d.email || ((user as any)?.email as string) || ""); setPhone(d.phone || "");
      }
    } catch { /* ignore */ }
  }, [uid, user]);
  useEffect(() => { loadStatus(); loadInfo(); }, [loadStatus, loadInfo]);
  // Re-check on focus so a Stripe payment completed in the external browser is
  // reflected when the user returns, and drop the shared cache so the rest of
  // the app unlocks too.
  useFocusEffect(
    useCallback(() => {
      invalidateSubscriptionCache();
      loadStatus();
    }, [loadStatus])
  );

  async function saveInfo() {
    if (!uid) { Alert.alert(L3("سجّل الدخول", "Log in", "Log in"), L3("سجّل الدخول أوّلًا.", "Log eerst in.", "Please log in first.")); return; }
    if (!infoComplete) { setMsg(L3("أكمِل جميعَ الحقول أوّلًا.", "Vul eerst alle velden in.", "Please complete all fields first.")); return; }
    setBusy(true); setMsg("");
    try {
      const r = await subscriptionFetch("info", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: uid, info }) });
      const d = await r.json();
      setMsg(d.ok ? L3("حُفظت معلوماتك ✓", "Uw gegevens zijn opgeslagen ✓", "Your details are saved ✓") : L3("تعذّر الحفظ.", "Opslaan mislukt.", "Could not save."));
    } catch { setMsg(L3("تعذّر الاتصال.", "Verbinding mislukt.", "Connection failed.")); } finally { setBusy(false); }
  }

  async function subscribe() {
    // Stripe is the sideload channel's payment path only. Opening its checkout
    // from a Play build is an in-app link to a payment method outside Play
    // billing — the thing the payments policy actually forbids, and grounds for
    // removal. The guard lives here as well as on the button so a future call
    // site cannot reintroduce it by rendering its own "subscribe" control.
    // Play billing (expo-iap) replaces this branch when the client half ships.
    if (DISTRIBUTION_CHANNEL === "play") return;
    if (!isAuthenticated || !uid) { Alert.alert(L3("سجّل الدخول", "Log in", "Log in"), L3("سجّل الدخول أوّلًا لتشترك.", "Log eerst in om te abonneren.", "Please log in first to subscribe.")); return; }
    if (!infoComplete) { setMsg(L3("أكمِل جميعَ الحقول أوّلًا.", "Vul eerst alle velden in.", "Please complete all fields first.")); return; }
    setBusy(true); setMsg("");
    try {
      const r = await subscriptionFetch("checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: uid, lang: language, info }) });
      const d = await r.json();
      if (d.url) Linking.openURL(d.url);
      else setMsg(L3("الدفعُ غير مفعّلٍ بعد. جرّب كوبونًا أو عُد لاحقًا.", "Betalen is nog niet actief. Probeer een coupon of kom later terug.", "Payment isn't active yet. Try a coupon or come back later."));
    } catch { setMsg(L3("تعذّر الاتصال.", "Verbinding mislukt.", "Connection failed.")); } finally { setBusy(false); }
  }

  async function redeem() {
    const code = coupon.trim();
    if (!code) return;
    if (!uid) { Alert.alert(L3("سجّل الدخول", "Log in", "Log in"), L3("سجّل الدخول أوّلًا.", "Log eerst in.", "Please log in first.")); return; }
    if (!infoComplete) { setMsg(L3("أكمِل جميعَ الحقول أوّلًا.", "Vul eerst alle velden in.", "Please complete all fields first.")); return; }
    setBusy(true); setMsg("");
    try {
      const r = await subscriptionFetch("redeem-coupon", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, userId: uid, info, channel: DISTRIBUTION_CHANNEL }) });
      const d = await r.json();
      if (d.ok) {
        setMsg(L3("تمّ تفعيلُ اشتراكك ✓", "Uw abonnement is geactiveerd ✓", "Your subscription is active ✓"));
        setCoupon("");
        loadStatus();
        // Entitlement just changed: drop the shared cache so the premium screens
        // (Weekly, Treatments, Personal Advice) refetch and unlock on next
        // navigation instead of staying paywalled until a cold restart.
        invalidateSubscriptionCache();
      }
      else {
        const e = d.error;
        // "not_available": a sold coupon on the Play build. Deliberately says
        // nothing about where it can be used — naming the website would be
        // exactly the steering Play's payments policy forbids.
        setMsg(e === "not_available" ? L3("لا يمكن تفعيل هذا الرمز هنا. تواصل مع الدعم.", "Deze code kan hier niet worden geactiveerd. Neem contact op met support.", "This code cannot be activated here. Please contact support.")
          : e === "already_redeemed" ? L3("استُخدم هذا الكوبون من حسابك.", "Deze coupon is al gebruikt op uw account.", "This coupon was already used on your account.")
          : e === "used_up" ? L3("استُنفد هذا الكوبون.", "Deze coupon is opgebruikt.", "This coupon is used up.")
          : e === "expired" || e === "inactive" ? L3("هذا الكوبون غيرُ صالح.", "Deze coupon is niet geldig.", "This coupon is not valid.")
          : L3("كوبونٌ غيرُ صحيح.", "Ongeldige coupon.", "Invalid coupon."));
      }
    } catch { setMsg(L3("تعذّر الاتصال.", "Verbinding mislukt.", "Connection failed.")); } finally { setBusy(false); }
  }

  const fmtDate = (d?: string) => { if (!d) return ""; try { return new Date(d).toLocaleDateString(language === "ar" ? "ar" : language === "nl" ? "nl" : "en"); } catch { return ""; } };
  const inputStyle = { backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: colors.foreground, textAlign: align as "right" | "left", borderWidth: 1, borderColor: colors.border };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: colors.surface, borderBottomWidth: 0.5, borderBottomColor: colors.border, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()}><MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={24} color={colors.foreground} /></TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, flex: 1, textAlign: align }}>{L3("الاشتراك السنويّ", "Jaarabonnement", "Annual subscription")}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} /> : (
          <>
            {/* Status banner (msg 701): clearly show paid / not-paid */}
            {status?.subscribed ? (
              <View style={{ backgroundColor: colors.primary + "12", borderColor: colors.primary, borderWidth: 1.5, borderRadius: 16, padding: 18, alignItems: "center", marginBottom: 14 }}>
                <MaterialIcons name="verified" size={40} color={colors.primary} />
                <Text style={{ fontSize: 17, fontWeight: "800", color: colors.foreground, marginTop: 8, textAlign: "center" }}>{L3("أنت مشترك", "U bent geabonneerd", "You are subscribed")}</Text>
                <Text style={{ fontSize: 13, color: colors.muted, marginTop: 6, textAlign: "center" }}>{L3("ساري إلى", "Geldig tot", "Valid until")} {fmtDate(status.expiresAt)}</Text>
              </View>
            ) : (
              <View style={{ backgroundColor: "#FFF7E6", borderColor: "#E9C46A", borderWidth: 1.5, borderRadius: 16, padding: 16, marginBottom: 14 }}>
                <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 8 }}>
                  <MaterialIcons name="info-outline" size={22} color="#B8860B" />
                  <Text style={{ fontSize: 15, fontWeight: "800", color: "#7A5B00", flex: 1, textAlign: align }}>{L3("أنت غير مشترك", "U bent niet geabonneerd", "You are not subscribed")}</Text>
                </View>
                <Text style={{ fontSize: 13, color: "#7A5B00", marginTop: 6, textAlign: align, lineHeight: 20 }}>{L3("اشترك لدعم ربّانيّ والاستفادة الكاملة، أو فعّل كوبونًا.", "Abonneer om Rabbaanie te steunen en volledig te profiteren, of activeer een coupon.", "Subscribe to support Rabbaanie and get full access, or redeem a coupon.")}</Text>
              </View>
            )}

            {/* Tier explainer (msg 720): General (free) vs Special (paid), with icons */}
            <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 10, marginBottom: 14 }}>
              <View style={{ flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12 }}>
                <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <MaterialIcons name="eco" size={20} color={colors.primary} />
                  <Text style={{ fontWeight: "800", fontSize: 13, color: colors.foreground, flex: 1, textAlign: align }}>{L3("العامّ", "Algemeen", "General")}</Text>
                </View>
                <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 10, textAlign: align }}>{L3("مجّانيّ — بإدخال بياناتك", "Gratis — met uw gegevens", "Free — with your details")}</Text>
                {GENERAL.map((s) => (
                  <View key={s.k} style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 6, marginBottom: 7 }}>
                    <MaterialIcons name={s.icon as any} size={15} color={colors.muted} />
                    <Text style={{ fontSize: 11.5, color: colors.foreground, flex: 1, textAlign: align }}>{L3(s.ar, s.nl, s.en)}</Text>
                  </View>
                ))}
              </View>
              <View style={{ flex: 1, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.primary, borderRadius: 14, padding: 12 }}>
                <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <MaterialIcons name="workspace-premium" size={20} color={colors.primary} />
                  <Text style={{ fontWeight: "800", fontSize: 13, color: colors.foreground, flex: 1, textAlign: align }}>{L3("الخاصّ", "Speciaal", "Special")}</Text>
                </View>
                <Text style={{ fontSize: 12, color: colors.primary, fontWeight: "800", marginBottom: 4, textAlign: align }}>€12 <Text style={{ fontSize: 10, color: colors.muted, fontWeight: "600" }}>{L3("/ سنة", "/ jaar", "/ year")}</Text></Text>
                <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 10, textAlign: align }}>{L3("كلُّ ما في العامّ، وزيادةً:", "Alles van Algemeen, plus:", "Everything in General, plus:")}</Text>
                {SPECIAL.map((s) => (
                  <View key={s.k} style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 6, marginBottom: 7 }}>
                    <MaterialIcons name={s.icon as any} size={15} color={colors.primary} />
                    <Text style={{ fontSize: 11.5, color: colors.foreground, flex: 1, textAlign: align }}>{L3(s.ar, s.nl, s.en)}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Subscriber info — always shown, editable, savable (msg 701) */}
            <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 12 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 8, textAlign: align }}>{L3("معلوماتي", "Mijn gegevens", "My details")}</Text>
              <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 8, marginBottom: 8 }}>
                <TextInput value={firstName} onChangeText={setFirstName} placeholder={L3("الاسم", "Voornaam", "First name")} placeholderTextColor={colors.muted} style={{ ...inputStyle, flex: 1 }} />
                <TextInput value={lastName} onChangeText={setLastName} placeholder={L3("اللقب", "Achternaam", "Last name")} placeholderTextColor={colors.muted} style={{ ...inputStyle, flex: 1 }} />
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {MARITAL.map((m) => (
                  <TouchableOpacity key={m.k} onPress={() => setMaritalStatus(m.k)} style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: maritalStatus === m.k ? colors.primary : colors.border, backgroundColor: maritalStatus === m.k ? colors.primary : colors.background }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: maritalStatus === m.k ? "#fff" : colors.foreground }}>{L3(m.ar, m.nl, m.en)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput value={address} onChangeText={setAddress} placeholder={L3("العنوان", "Adres", "Address")} placeholderTextColor={colors.muted} style={{ ...inputStyle, marginBottom: 8 }} />
              <TextInput value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder={L3("البريد الإلكترونيّ", "E-mail", "Email")} placeholderTextColor={colors.muted} style={{ ...inputStyle, marginBottom: 8 }} />
              <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder={L3("الهاتف", "Telefoon", "Phone")} placeholderTextColor={colors.muted} style={{ ...inputStyle, marginBottom: 10 }} />
              <TouchableOpacity onPress={saveInfo} disabled={busy} style={{ backgroundColor: colors.background, borderWidth: 1.5, borderColor: colors.primary, borderRadius: 12, paddingVertical: 12, alignItems: "center", opacity: busy ? 0.6 : 1 }}>
                <Text style={{ color: colors.primary, fontWeight: "800", fontSize: 14 }}>{L3("حفظ معلوماتي", "Mijn gegevens opslaan", "Save my details")}</Text>
              </TouchableOpacity>
            </View>

            {/* Subscribe + coupon — only when not subscribed */}
            {!status?.subscribed && (
              <>
                <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 18, marginBottom: 14 }}>
                  <Text style={{ fontSize: 22, fontWeight: "800", color: colors.foreground, textAlign: align }}>€12<Text style={{ fontSize: 14, color: colors.muted, fontWeight: "600" }}> / {L3("سنة", "jaar", "year")}</Text></Text>
                  <Text style={{ fontSize: 13, color: colors.muted, marginTop: 6, textAlign: align, lineHeight: 20 }}>{L3("ادعم ربّانيّ باشتراكٍ سنويّ، بلا إعلانات، ولكلّ العائلة.", "Steun Rabbaanie met een jaarabonnement, advertentievrij, voor het hele gezin.", "Support Rabbaanie with an annual subscription, ad-free, for the whole family.")}</Text>
                  {/* Naming the price is fine on both channels — it describes our
                      own product. Only the *button* is channel-specific: on Play
                      it would open Stripe, an outside payment method, so it is
                      replaced by a plain note until Play billing ships. */}
                  {DISTRIBUTION_CHANNEL === "github" ? (
                    <TouchableOpacity onPress={subscribe} disabled={busy} style={{ backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 14, opacity: busy ? 0.6 : 1 }}>
                      {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{L3("اشترك الآن", "Nu abonneren", "Subscribe now")}</Text>}
                    </TouchableOpacity>
                  ) : (
                    <Text style={{ fontSize: 13, color: colors.muted, marginTop: 14, textAlign: align, lineHeight: 20 }}>
                      {L3("الاشتراك داخل التطبيق قادمٌ قريبًا. إن كان لديك رمز، فعّله أدناه.", "Abonneren in de app komt binnenkort. Heeft u een code? Activeer die hieronder.", "In-app subscribing is coming soon. If you have a code, redeem it below.")}
                    </Text>
                  )}
                </View>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.muted, marginBottom: 6, textAlign: align }}>{L3("لديك كوبون؟", "Heeft u een coupon?", "Have a coupon?")}</Text>
                <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 8 }}>
                  <TextInput value={coupon} onChangeText={setCoupon} autoCapitalize="characters" placeholder={L3("رمز الكوبون", "Couponcode", "Coupon code")} placeholderTextColor={colors.muted} style={{ ...inputStyle, flex: 1 }} />
                  <TouchableOpacity onPress={redeem} disabled={busy || !coupon.trim()} style={{ backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 18, alignItems: "center", justifyContent: "center", opacity: busy || !coupon.trim() ? 0.5 : 1 }}>
                    <Text style={{ color: "#fff", fontWeight: "700" }}>{L3("تفعيل", "Activeren", "Redeem")}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </>
        )}
        {!!msg && <Text style={{ fontSize: 13, color: colors.primary, marginTop: 14, textAlign: "center" }}>{msg}</Text>}
      </ScrollView>
    </View>
  );
}
