import { useState, useEffect, useCallback, useRef } from "react";
import { ScrollView, Text, View, TextInput, TouchableOpacity, ActivityIndicator, Linking, Alert, Platform } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { formatSubscriptionRemaining, invalidateSubscriptionCache, isPerpetualExpiry, subscriptionFetch } from "@/hooks/use-subscription";
import { DISTRIBUTION_CHANNEL } from "@/lib/distribution";
import { usePlayBilling } from "@/lib/play-billing";

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

  const [status, setStatus] = useState<{ subscribed: boolean; expiresAt?: string; playAccountTag?: string } | null>(null);
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

  // Tracks which account the newest request was for. Without it, switching
  // accounts can let the previous user's slower response land last and leave
  // THEIR playAccountTag in state — the tag is then sent with the new user's
  // purchase, the server compares it against the session it actually sees, and
  // rejects with account_mismatch. The money is taken by Play but no
  // entitlement is granted until the purchase is re-verified.
  const statusRequestFor = useRef<number | undefined>(undefined);
  const loadStatus = useCallback(async () => {
    if (!uid) { setLoading(false); return; }
    statusRequestFor.current = uid;
    try {
      const r = await subscriptionFetch(`status?userId=${uid}`);
      const data = await r.json();
      if (statusRequestFor.current !== uid) return;
      setStatus(data);
    } catch { /* ignore */ } finally {
      // Inside the same guard as setStatus: a late response for the previous
      // account would otherwise clear the spinner for the new one while its
      // status is still null, flashing the not-subscribed card.
      if (statusRequestFor.current === uid) setLoading(false);
    }
  }, [uid]);
  // Same sequence guard as loadStatus, and for a sharper reason: these fields
  // feed infoComplete, which authorizes the Play purchase. Left unguarded, a
  // new user inherits the previous account's name, address and phone, so
  // infoComplete stays true and their membership is bought against — and
  // recorded with — someone else's details.
  const infoRequestFor = useRef<number | undefined>(undefined);
  const loadInfo = useCallback(async () => {
    if (!uid) return;
    infoRequestFor.current = uid;
    try {
      const r = await subscriptionFetch(`info?userId=${uid}`);
      const d = await r.json();
      if (infoRequestFor.current !== uid) return;
      if (d) {
        setFirstName(d.firstName || ""); setLastName(d.lastName || ""); setMaritalStatus(d.maritalStatus || "");
        setAddress(d.address || ""); setEmail(d.email || ((user as any)?.email as string) || ""); setPhone(d.phone || "");
      }
    } catch { /* ignore */ }
  }, [uid, user]);
  // Drop the previous account's status the instant uid changes. Dropping only
  // out-of-order responses is not enough: until the new one lands, the card
  // still renders with the old user's playAccountTag and a live Subscribe
  // button, which is exactly the account_mismatch-after-payment this guards.
  useEffect(() => {
    setStatus(null);
    setLoading(true);
    // Clear the subscriber details too — they gate the purchase.
    setFirstName(""); setLastName(""); setMaritalStatus("");
    setAddress(""); setEmail(""); setPhone("");
  }, [uid]);
  useEffect(() => { loadStatus(); loadInfo(); }, [loadStatus, loadInfo]);

  // Play Billing is inert on the sideload channel (see lib/play-billing.ts), so
  // this hook is safe to mount unconditionally.
  const play = usePlayBilling(status?.playAccountTag);
  // A verified Play purchase changes entitlement server-side; pull the new
  // status so the banner flips to "subscribed" without leaving the screen.
  useEffect(() => { if (play.purchased) loadStatus(); }, [play.purchased, loadStatus]);
  // Re-check on focus so a Stripe payment completed in the external browser is
  // reflected when the user returns, and drop the shared cache so the rest of
  // the app unlocks too.
  useFocusEffect(
    useCallback(() => {
      invalidateSubscriptionCache();
      loadStatus();
    }, [loadStatus])
  );

  /** POST the subscriber details. Shared by the Save button and the Play
   *  purchase, which must not proceed without them on record. */
  async function persistInfo(): Promise<boolean> {
    if (!uid || !infoComplete) return false;
    try {
      const r = await subscriptionFetch("info", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: uid, info }) });
      const d = await r.json();
      return !!d?.ok;
    } catch { return false; }
  }

  async function saveInfo() {
    if (!uid) { Alert.alert(L3("سجّل الدخول", "Log in", "Log in"), L3("سجّل الدخول أوّلًا.", "Log eerst in.", "Please log in first.")); return; }
    if (!infoComplete) { setMsg(L3("أكمِل جميعَ الحقول أوّلًا.", "Vul eerst alle velden in.", "Please complete all fields first.")); return; }
    setBusy(true); setMsg("");
    const ok = await persistInfo();
    setMsg(ok ? L3("حُفظت معلوماتك ✓", "Uw gegevens zijn opgeslagen ✓", "Your details are saved ✓") : L3("تعذّر الحفظ.", "Opslaan mislukt.", "Could not save."));
    setBusy(false);
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
                {status.expiresAt && !isPerpetualExpiry(status.expiresAt) ? <Text style={{ fontSize: 13, color: colors.muted, marginTop: 6, textAlign: "center" }}>{L3("ساري إلى", "Geldig tot", "Valid until")} {fmtDate(status.expiresAt)}</Text> : null}
                {status.expiresAt ? <Text style={{ fontSize: 13, color: colors.primary, fontWeight: "800", marginTop: 4, textAlign: "center" }}>{formatSubscriptionRemaining(status.expiresAt, language)}</Text> : null}
                {/* Required, not a nicety: Play's subscription guidance says the
                    app "should include a link on a settings or preferences
                    screen that allows users to manage their subscriptions".
                    Telling them where to cancel in prose (as the purchase card
                    does) is not the same as giving them the link.

                    Play channel only — a sideload install has no Play
                    subscription to manage, and its Stripe membership is
                    cancelled on the website.

                    Not narrowed to source === "play": the generic subscriptions
                    URL lists whatever the user actually has, so it is right for
                    a coupon or legacy Stripe member too, and it is the one the
                    Play reviewer will look for on a demo account whose
                    membership did not come from Play. */}
                {DISTRIBUTION_CHANNEL === "github" || Platform.OS !== "android" ? null : (
                  <TouchableOpacity
                    accessibilityRole="link"
                    onPress={() => Linking.openURL("https://play.google.com/store/account/subscriptions").catch(() => {})}
                    style={{ minHeight: 44, justifyContent: "center", alignItems: "center", marginTop: 10 }}
                  >
                    <Text style={{ fontSize: 13, color: colors.primary, fontWeight: "700", textDecorationLine: "underline", textAlign: "center" }}>
                      {L3("إدارة الاشتراك في Google Play", "Abonnement beheren in Google Play", "Manage subscription in Google Play")}
                    </Text>
                  </TouchableOpacity>
                )}
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
                {/* Same rule as the purchase card below: on Play the price
                    comes from Play, because it is set per country and
                    includes local tax. Showing a hardcoded €12 here while the
                    button shows the real local price is the price
                    discrepancy this whole change exists to remove. */}
                {DISTRIBUTION_CHANNEL === "github" ? (
                  <Text style={{ fontSize: 12, color: colors.primary, fontWeight: "800", marginBottom: 4, textAlign: align }}>€12 <Text style={{ fontSize: 10, color: colors.muted, fontWeight: "600" }}>{L3("/ سنة", "/ jaar", "/ year")}</Text></Text>
                ) : (
                  <Text style={{ fontSize: 12, color: colors.primary, fontWeight: "800", marginBottom: 4, textAlign: align }}>{play.offer ? play.offer.displayPrice : "€12"}<Text style={{ fontSize: 10, color: colors.muted, fontWeight: "600" }}> {L3("/ سنة", "/ jaar", "/ year")}</Text></Text>
                )}
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
                  {/* On Play, show Play's own price string rather than a
                      hardcoded €12: Play sets the price per country and folds
                      in local tax, so the hardcoded figure would be wrong for
                      most buyers and misstate the charge before they confirm. */}
                  {DISTRIBUTION_CHANNEL === "github" ? (
                    <Text style={{ fontSize: 22, fontWeight: "800", color: colors.foreground, textAlign: align }}>€12<Text style={{ fontSize: 14, color: colors.muted, fontWeight: "600" }}> / {L3("سنة", "jaar", "year")}</Text></Text>
                  ) : (
                    <Text style={{ fontSize: 22, fontWeight: "800", color: colors.foreground, textAlign: align }}>{play.offer ? play.offer.displayPrice : "€12"}<Text style={{ fontSize: 14, color: colors.muted, fontWeight: "600" }}> / {L3("سنة", "jaar", "year")}</Text></Text>
                  )}
                  <Text style={{ fontSize: 13, color: colors.muted, marginTop: 6, textAlign: align, lineHeight: 20 }}>{L3("ادعم ربّانيّ باشتراكٍ سنويّ، بلا إعلانات، ولكلّ العائلة.", "Steun Rabbaanie met een jaarabonnement, advertentievrij, voor het hele gezin.", "Support Rabbaanie with an annual subscription, ad-free, for the whole family.")}</Text>
                  {/* One button per channel, never both: Stripe is an outside
                      payment method that a Play build may not link to, and Play
                      Billing has no purchase context in a sideload install.
                      The Play button also waits on playAccountTag, not just the
                      price: without the tag the server rejects the purchase with
                      account_mismatch, so offering the button first would take
                      the user into Play's payment sheet only to fail after. A
                      server that predates the tag therefore shows the notice
                      below rather than a button that cannot work. */}
                  {DISTRIBUTION_CHANNEL === "github" ? (
                    <TouchableOpacity onPress={subscribe} disabled={busy} style={{ backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 14, opacity: busy ? 0.6 : 1 }}>
                      {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{L3("اشترك الآن", "Nu abonneren", "Subscribe now")}</Text>}
                    </TouchableOpacity>
                  ) : (play.offer && status?.playAccountTag) || play.error === "verify_failed" || play.recoverable ? (
                    <>
                      {/* Same precondition as the Stripe and coupon paths: a
                          membership without the subscriber's details on record
                          leaves an account we cannot service. Checked before
                          Play's sheet opens, not after money has moved.

                          Skipped on a verify_failed retry, and that exception is
                          the whole point. purchase() runs its recovery branches
                          above the offer/tag check precisely so a stranded user
                          can re-verify when the network is bad — and this button
                          was undoing it, because the details POST fails for the
                          same reason the verification did. The user tapped retry,
                          saw "your details could not be saved", and
                          play.purchase() was never reached, so no re-verification
                          ever happened. Their money is already with Google; the
                          details are not what is missing. */}
                      <TouchableOpacity onPress={async () => { if (play.error !== "verify_failed" && !play.recoverable) { if (!infoComplete) { setMsg(L3("أكمِل جميعَ الحقول أوّلًا.", "Vul eerst alle velden in.", "Please complete all fields first.")); return; } setBusy(true); const saved = await persistInfo(); setBusy(false); if (!saved) { setMsg(L3("تعذّر حفظ بياناتك، فلم يبدأ الشراء.", "Uw gegevens konden niet worden opgeslagen; de aankoop is niet gestart.", "Your details could not be saved, so the purchase was not started.")); return; } } play.purchase(); }} disabled={play.busy || busy} style={{ backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 14, opacity: play.busy || busy ? 0.6 : 1 }}>
                        {play.busy || busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{L3("اشترك الآن", "Nu abonneren", "Subscribe now")}</Text>}
                      </TouchableOpacity>
                      {/* Play requires the renewal terms to be visible before
                          purchase, and users must be told where to cancel. */}
                      <Text style={{ fontSize: 11.5, color: colors.muted, marginTop: 10, textAlign: align, lineHeight: 18 }}>
                        {L3("يتجدّد الاشتراك سنويًّا تلقائيًّا حتّى تُلغيه من إعدادات اشتراكات Google Play.", "Het abonnement wordt jaarlijks automatisch verlengd totdat u het opzegt via de abonnementen-instellingen van Google Play.", "The subscription renews annually until you cancel it in your Google Play subscription settings.")}
                      </Text>
                    </>
                  ) : (
                    /* Never a bare "loading…" that can hang forever: on iOS, on
                       web, and against a server that predates playAccountTag the
                       purchase path genuinely never becomes available, so the
                       message has to name the coupon fallback instead of leaving
                       the user staring at a spinner. */
                    <Text style={{ fontSize: 13, color: colors.muted, marginTop: 14, textAlign: align, lineHeight: 20 }}>
                      {play.loading
                        ? L3("جارٍ تحميل خيارات الاشتراك…", "Abonnementsopties laden…", "Loading subscription options…")
                        : play.error === "unavailable"
                          ? L3("تعذّر الاتصال بمتجر Google Play. تحقّق من اتصالك ثمّ أعِد المحاولة. وإن كان لديك رمز، فعّله أدناه.", "Kan geen verbinding maken met de Google Play Store. Controleer uw verbinding en probeer het opnieuw. Heeft u een code? Activeer die hieronder.", "Could not reach the Google Play Store. Check your connection and try again. If you have a code, redeem it below.")
                          : L3("الاشتراك داخل التطبيق غير متاحٍ هنا حاليًّا. إن كان لديك رمز، فعّله أدناه.", "Abonneren in de app is hier momenteel niet beschikbaar. Heeft u een code? Activeer die hieronder.", "In-app subscribing isn't available here right now. If you have a code, redeem it below.")}
                    </Text>
                  )}
                  {["verify_failed", "purchase_failed", "purchase_pending", "purchase_foreign", "verify_gone"].includes(play.error || "") ? (
                    /* purchase_pending is not a failure — a slow payment method
                       (cash at a store, some carrier billing) has been chosen and
                       Play will deliver the purchase once the money clears, so it
                       is shown in a neutral colour with different wording. */
                    <Text style={{ fontSize: 12.5, color: ["purchase_pending", "purchase_foreign"].includes(play.error || "") ? colors.muted : "#B3261E", marginTop: 10, textAlign: align, lineHeight: 19 }}>
                      {play.error === "purchase_pending"
                        ? L3("دفعتك قيدُ المعالجة لدى Google Play. سيُفعَّل اشتراكك تلقائيًّا بمجرّد اكتمالها.", "Uw betaling wordt nog verwerkt door Google Play. Uw abonnement wordt automatisch geactiveerd zodra dat klaar is.", "Your payment is still being processed by Google Play. Your membership activates automatically once it completes.")
                        : play.error === "purchase_foreign"
                        ? L3("يوجد على هذا الجهاز اشتراكٌ اشتُري بحسابٍ آخر في ربّانيّ. سجّل الدخول بذلك الحساب، أو استخدم حساب Google مختلفًا للشراء.", "Op dit apparaat staat een abonnement dat met een ander Rabbaanie-account is gekocht. Log in met dat account, of gebruik een ander Google-account om te kopen.", "This device has a membership bought with a different Rabbaanie account. Sign in with that account, or use a different Google account to purchase.")
                        : play.error === "verify_gone"
                        ? L3("لم يعُد Google Play يُبلغ عن هذا الشراء. إن كنت قد دُفعت ولم يُفعَّل اشتراكك، فتواصل مع الدعم.", "Google Play meldt deze aankoop niet meer. Als u heeft betaald en uw abonnement niet actief is, neem dan contact op met support.", "Google Play no longer reports that purchase. If you were charged and your membership is not active, please contact support.")
                        : play.error === "verify_failed"
                          ? L3("تمّ الدفع، لكن تعذّر تأكيده الآن. لن تُخصم منك مرّةً أخرى — أعِد فتح هذه الصفحة بعد قليل.", "De betaling is gelukt, maar kon nu niet worden bevestigd. U wordt niet nogmaals belast — open deze pagina straks opnieuw.", "Payment went through but could not be confirmed yet. You will not be charged again — reopen this page shortly.")
                          : L3("تعذّر إتمام عمليّة الشراء. حاول مرّةً أخرى.", "De aankoop kon niet worden voltooid. Probeer het opnieuw.", "The purchase could not be completed. Please try again.")}
                    </Text>
                  ) : null}
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
