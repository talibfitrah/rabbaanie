import { useState, useEffect, useCallback, useRef } from "react";
import {
  ScrollView,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Alert,
  Platform,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import {
  formatSubscriptionRemaining,
  invalidateSubscriptionCache,
  isPerpetualExpiry,
  subscriptionFetch,
} from "@/hooks/use-subscription";
import { DISTRIBUTION_CHANNEL, couponPolicyChannel } from "@/lib/distribution";
import { usePlayBilling } from "@/lib/play-billing";
import {
  MARITAL_OPTIONS,
  buildSubscriberInfo,
  isKnownMaritalStatus,
  isSubscriberInfoComplete,
  type SubscriberInfoExtras,
} from "@/lib/subscriber-info";

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
  const L3 = (ar: string, nl: string, en: string) =>
    language === "ar" ? ar : language === "en" ? en : nl;
  const align = isRTL ? "right" : "left";
  // The storefront named in the billing-error copy. iOS now arms the same
  // purchase path, so this copy renders on the App Store build too — naming
  // "Google Play" there is wrong and an App Review reject. One label per build,
  // interpolated into each message below.
  const storeName = DISTRIBUTION_CHANNEL === "apple" ? "App Store" : "Google Play";
  // The "use a different X to buy" phrase reads differently per store: the App
  // Store buys against an Apple ID, not a separate app account like Google's.
  const otherAccount =
    DISTRIBUTION_CHANNEL === "apple"
      ? L3("معرّف Apple آخر", "een andere Apple ID", "a different Apple ID")
      : L3(
          "حساب Google مختلف",
          "een ander Google-account",
          "a different Google account",
        );

  const [status, setStatus] = useState<{
    subscribed: boolean;
    expiresAt?: string;
    playAccountTag?: string;
    // The Apple analog of playAccountTag, returned by /status on iOS. Folded
    // into playAccountTag below so the billing hook — whose signature and call
    // site are pinned to a single tag argument — carries it on iOS unchanged.
    appleAccountToken?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [coupon, setCoupon] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  // Not the shared `msg` below: that renders once under the coupon block, ~60
  // lines of JSX past the Subscribe button, so a refusal reported there is off
  // screen at the moment of the press and the button reads as dead (seen on a
  // real device, Play internal-testing build). Beside the button it also stays
  // visible across a retry, which scrolling to that footer would not: React
  // bails on setting the identical string, so a second press would move nothing.
  const [purchaseRefusal, setPurchaseRefusal] = useState("");
  // Which paid tier the sideload buyer has picked (msg checkout `tier`).
  const [selectedTier, setSelectedTier] = useState<
    "ghars" | "namaa" | "ithmaar"
  >("namaa");
  // Required subscriber info (msg 636)
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [maritalStatus, setMaritalStatus] = useState("");
  const [streetHouseNumber, setStreetHouseNumber] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [email, setEmail] = useState(((user as any)?.email as string) || "");
  const [phone, setPhone] = useState("");
  // Held only to be handed back untouched on save — see SubscriberInfoExtras.
  const [extras, setExtras] = useState<SubscriberInfoExtras>({});
  // Separates "loaded, nothing stored" from "the load failed". Saving in the
  // second case sends no optional fields, and the server's .set({ ...data })
  // upsert turns each omitted one into null — erasing the gender most existing
  // subscribers have on record. ponytail: covers a failed fetch only; a 500
  // answers 200 with a null body, which no client can tell from an empty one.
  const [infoLoaded, setInfoLoaded] = useState(false);
  // All three paths refetch before submitting; only Save and the Play purchase
  // REFUSE when that still fails, because both need a live session anyway, so
  // refusing costs nothing.
  //
  // Redeeming and checking out deliberately proceed instead, and this is an
  // accepted trade rather than an oversight. Refusing them protects one field:
  // of the stored records, gender is set on 7 and kunya, postcode and
  // addressLine2 on none, and gender is also held on users.gender. Against that
  // it would cost a paying customer the coupon they already bought or the
  // purchase they came to make — /redeem-coupon takes no session by design and
  // is how someone whose token went stale regains access at all. A stale token
  // also makes checkout anonymous server-side, where it INSERTs a pending row
  // and erases nothing; only a live session with a persistently failing /info
  // reaches the upsert, which the refetch above already makes rare.
  // ponytail: PATCH semantics server-side would remove the trade entirely.
  const infoNotLoadedMsg = L3(
    "تعذّر تحميل معلوماتك. أعِد فتح الصفحة ثمّ حاول.",
    "Uw gegevens konden niet worden geladen. Open deze pagina opnieuw en probeer het dan.",
    "Your details could not be loaded. Reopen this page and try again.",
  );
  // Said whenever the server refuses the DETAILS rather than the code or the
  // payment. Each route spells that refusal differently — "missing_info" on
  // checkout and redeem, "incomplete" on info — and only some carry a message
  // of their own, so all three land here rather than on wording that blames
  // the coupon or claims payment is switched off.
  const detailsRefusedMsg = L3(
    "راجِع معلوماتك أعلاه ثمّ أعِد المحاولة.",
    "Controleer uw gegevens hierboven en probeer het opnieuw.",
    "Please check your details above and try again.",
  );
  const fields = {
    firstName,
    lastName,
    maritalStatus,
    streetHouseNumber,
    city,
    country,
    email,
    phone,
  };
  const infoComplete = isSubscriberInfoComplete(fields);
  // Tier explainer (msg 720): what General (free) vs Special (paid) unlocks.
  const GENERAL = [
    {
      k: "adhkar",
      icon: "auto-stories",
      ar: "الأذكار",
      nl: "Adhkaar",
      en: "Adhkaar",
    },
    {
      k: "prayer",
      icon: "mosque",
      ar: "الصلاة والمواقيت",
      nl: "Gebedstijden",
      en: "Prayer times",
    },
    { k: "fitrah", icon: "eco", ar: "الفطرة", nl: "Fitrah", en: "Fitrah" },
    {
      k: "self",
      icon: "balance",
      ar: "ضبط النفس",
      nl: "Zelfbeheersing",
      en: "Self-control",
    },
    {
      k: "sunnah",
      icon: "wb-sunny",
      ar: "رفيق السنّة",
      nl: "Sunnah-metgezel",
      en: "Sunnah companion",
    },
    {
      k: "library",
      icon: "local-library",
      ar: "المكتبة",
      nl: "Bibliotheek",
      en: "Library",
    },
  ];
  const SPECIAL = [
    {
      k: "advisor",
      icon: "forum",
      ar: "المستشار التربويّ",
      nl: "Slimme adviseur",
      en: "Smart advisor",
    },
    {
      k: "children",
      icon: "description",
      ar: "تحليل بيئة الأطفال",
      nl: "Kindanalyse",
      en: "Child analysis",
    },
    {
      k: "advice",
      icon: "lightbulb",
      ar: "النصائح الشخصيّة",
      nl: "Persoonlijk advies",
      en: "Personal advice",
    },
    {
      k: "weekly",
      icon: "event",
      ar: "الخطّة الأسبوعيّة",
      nl: "Weekplan",
      en: "Weekly plan",
    },
    {
      k: "treat",
      icon: "healing",
      ar: "خطط العلاج",
      nl: "Behandelplannen",
      en: "Treatment plans",
    },
    {
      k: "family",
      icon: "home",
      ar: "إدارة العائلة",
      nl: "Gezinsbeheer",
      en: "Family",
    },
    {
      k: "messages",
      icon: "mail",
      ar: "مراسلة المتخصّصين",
      nl: "Berichten",
      en: "Messages",
    },
    {
      k: "network",
      icon: "hub",
      ar: "الشبكة والربط",
      nl: "Netwerk",
      en: "Network",
    },
  ];
  const TIERS = [
    {
      key: "ghars",
      name: L3("غَرْس", "Ghars", "Ghars"),
      price: "€25",
      advisor: L3(
        "استشارة واحدة في الأسبوع",
        "adviseur 1× per week",
        "advisor 1×/week",
      ),
      tips: L3("نصيحة أسبوعية", "1 tip per week", "1 tip/week"),
    },
    {
      key: "namaa",
      name: L3("نَماء", "Namaa", "Namaa"),
      price: "€30",
      advisor: L3(
        "٣ استشارات في الأسبوع",
        "adviseur 3× per week",
        "advisor 3×/week",
      ),
      tips: L3("نصيحتان في الأسبوع", "2 tips per week", "2 tips/week"),
    },
    {
      key: "ithmaar",
      name: L3("إثمار", "Ithmaar", "Ithmaar"),
      price: "€40",
      advisor: L3(
        "استشارات بلا حدّ",
        "adviseur onbeperkt",
        "unlimited advisor",
      ),
      tips: L3("نصائح عند الطلب", "tips op aanvraag", "tips on demand"),
    },
  ] as const;

  // Tracks which account the newest request was for. Without it, switching
  // accounts can let the previous user's slower response land last and leave
  // THEIR playAccountTag in state — the tag is then sent with the new user's
  // purchase, the server compares it against the session it actually sees, and
  // rejects with account_mismatch. The money is taken by Play but no
  // entitlement is granted until the purchase is re-verified.
  const statusRequestFor = useRef<number | undefined>(undefined);
  const loadStatus = useCallback(async () => {
    if (!uid) {
      setLoading(false);
      return;
    }
    statusRequestFor.current = uid;
    try {
      const r = await subscriptionFetch(`status?userId=${uid}`);
      const data = await r.json();
      if (statusRequestFor.current !== uid) return;
      // On iOS the server issues the tag as appleAccountToken. Fold it into
      // playAccountTag so usePlayBilling — whose two-argument signature and
      // `usePlayBilling(status?.playAccountTag, uid)` call site are both pinned
      // by tests — feeds StoreKit the App Store tag through the same channel
      // Android uses for its obfuscatedAccountId tag.
      setStatus(
        DISTRIBUTION_CHANNEL === "apple" && data?.appleAccountToken
          ? { ...data, playAccountTag: data.appleAccountToken }
          : data,
      );
    } catch {
      /* ignore */
    } finally {
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
  // fillForm=false is the retry path: it needs what is STORED, and must not
  // touch the inputs. Refilling them mid-submit replaced whatever the user had
  // just typed with the stored values, so they were shown "saved ✓" beside a
  // form that had silently reverted — and a stale stored status cleared the
  // chip, so the next Save wrote the old details back over the new ones.
  const loadInfo = useCallback(
    async (fillForm = true): Promise<SubscriberInfoExtras | null> => {
      if (!uid) return null;
      infoRequestFor.current = uid;
      let loaded: SubscriberInfoExtras = {};
      try {
        const r = await subscriptionFetch(`info?userId=${uid}`);
        // An error body is still JSON: a 401 parses to a truthy object, which
        // blanked every field and then counted as a successful load — so the
        // erasure guard below would have passed on data never actually loaded.
        if (!r.ok) return null;
        const d = await r.json();
        if (infoRequestFor.current !== uid) return null;
        if (d) {
          if (fillForm) {
            setFirstName(d.firstName || "");
            setLastName(d.lastName || "");
            // Screened, not trusted: a stored value from the old vocabulary would
            // select no chip yet still count as filled in, so every submit would be
            // refused for a reason the user never sees.
            setMaritalStatus(
              isKnownMaritalStatus(d.maritalStatus) ? d.maritalStatus : "",
            );
            setStreetHouseNumber(d.streetHouseNumber || "");
            setCity(d.city || "");
            setCountry(d.country || "");
            setEmail(d.email || ((user as any)?.email as string) || "");
            setPhone(d.phone || "");
          }
          loaded = {
            kunya: d.kunya,
            gender: d.gender,
            addressLine2: d.addressLine2,
            postcode: d.postcode,
          };
          setExtras(loaded);
        }
        // Also true when there is no record yet: nothing stored is nothing to erase.
        setInfoLoaded(true);
        // Returned as well as stored, because a caller retrying after a failed
        // first load needs them NOW: setExtras is not visible until the next
        // render, so the payload it is about to build would still carry the empty
        // extras and erase precisely what this refetch just recovered.
        return loaded;
      } catch {
        return null;
      }
    },
    [uid, user],
  );
  // Drop the previous account's status the instant uid changes. Dropping only
  // out-of-order responses is not enough: until the new one lands, the card
  // still renders with the old user's playAccountTag and a live Subscribe
  // button, which is exactly the account_mismatch-after-payment this guards.
  useEffect(() => {
    setStatus(null);
    setLoading(true);
    // Clear the subscriber details too — they gate the purchase.
    setFirstName("");
    setLastName("");
    setMaritalStatus("");
    // Email falls back to the session's own address, exactly as loadInfo does.
    // Blanking it outright dropped a prefill the user never typed, and since
    // email is one of the fields infoComplete requires, an account whose
    // /info fetch then failed could not reach the Subscribe button at all.
    setStreetHouseNumber("");
    setCity("");
    setCountry("");
    setExtras({});
    setInfoLoaded(false);
    setEmail(((user as any)?.email as string) || "");
    setPhone("");
    // The typed code and the last message belong to the previous account too: a
    // coupon entered under one account stayed in the box across a switch and
    // could be redeemed into the next one.
    setCoupon("");
    setMsg("");
  }, [uid]);
  useEffect(() => {
    loadStatus();
    loadInfo();
  }, [loadStatus, loadInfo]);

  // Play Billing is inert on the sideload channel (see lib/play-billing.ts), so
  // this hook is safe to mount unconditionally.
  const play = usePlayBilling(status?.playAccountTag, uid);
  // A verified Play purchase changes entitlement server-side; pull the new
  // status so the banner flips to "subscribed" without leaving the screen.
  useEffect(() => {
    if (play.purchased) loadStatus();
  }, [play.purchased, loadStatus]);
  // Re-check on focus so a Stripe payment completed in the external browser is
  // reflected when the user returns, and drop the shared cache so the rest of
  // the app unlocks too.
  useFocusEffect(
    useCallback(() => {
      invalidateSubscriptionCache();
      loadStatus();
    }, [loadStatus]),
  );

  /**
   * What the server already stores, refetching once when the first load failed.
   * null only when we still do not know — the state in which submitting erases
   * the optional fields, because the server nulls every one the client omits.
   */
  async function currentExtras(): Promise<SubscriberInfoExtras | null> {
    return infoLoaded ? extras : await loadInfo(false);
  }

  /** POST the subscriber details. Shared by the Save button and the Play
   *  purchase, which must not proceed without them on record. */
  async function persistInfo(): Promise<{ ok: boolean; message?: string }> {
    if (!uid || !infoComplete) return { ok: false };
    // Refusing here is the point: see infoLoaded. Saving without knowing what
    // is already stored deletes it.
    const ex = await currentExtras();
    if (!ex) return { ok: false, message: infoNotLoadedMsg };
    try {
      const r = await subscriptionFetch("info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: uid,
          info: buildSubscriberInfo(fields, ex),
          lang: language,
        }),
      });
      const d = await r.json();
      // The server's own reason travels with the refusal — a name it will not
      // accept, a marital status it no longer knows. Returning a bare false is
      // what left a Play buyer with "could not be saved" and nothing to fix.
      // This route spells the same refusal "incomplete" and sends no message,
      // which is why Save alone still said "Could not save".
      return {
        ok: !!d?.ok,
        message:
          d?.message ||
          (d?.error === "incomplete" ? detailsRefusedMsg : undefined),
      };
    } catch {
      return { ok: false };
    }
  }

  async function saveInfo() {
    // Saving the details is the fix for whatever the purchase refused them for,
    // so its verdict replaces that refusal rather than sitting under it — the
    // alternative is "saved ✓" in the footer above a stale complaint about the
    // same fields, still beside the Subscribe button.
    setPurchaseRefusal("");
    if (!uid) {
      Alert.alert(
        L3("سجّل الدخول", "Log in", "Log in"),
        L3("سجّل الدخول أوّلًا.", "Log eerst in.", "Please log in first."),
      );
      return;
    }
    if (!infoComplete) {
      setMsg(
        L3(
          "أكمِل جميعَ الحقول أوّلًا.",
          "Vul eerst alle velden in.",
          "Please complete all fields first.",
        ),
      );
      return;
    }
    setBusy(true);
    setMsg("");
    const saved = await persistInfo();
    setMsg(
      saved.ok
        ? L3(
            "حُفظت معلوماتك ✓",
            "Uw gegevens zijn opgeslagen ✓",
            "Your details are saved ✓",
          )
        : saved.message ||
            L3("تعذّر الحفظ.", "Opslaan mislukt.", "Could not save."),
    );
    setBusy(false);
  }

  async function subscribe() {
    // Stripe is the sideload channel's payment path only. Opening its checkout
    // from a STORE build is an in-app link to a payment method outside that
    // store's billing — what both Google's and Apple's payments policies forbid
    // outright, and grounds for removal. The guard lives here as well as on the
    // button so a future call site cannot reintroduce it by rendering its own
    // "subscribe" control.
    //
    // Tested as "not github" rather than "is play". The original spelling was
    // written when those were the only two channels, so introducing "apple"
    // silently switched this defence OFF on the strictest of the three — the
    // very reintroduction the paragraph above says the guard exists to stop.
    // An unrecognised channel must fail closed to refusing Stripe, never open.
    // Store billing (expo-iap) replaces this branch per channel.
    if (DISTRIBUTION_CHANNEL !== "github") return;
    if (!isAuthenticated || !uid) {
      Alert.alert(
        L3("سجّل الدخول", "Log in", "Log in"),
        L3(
          "سجّل الدخول أوّلًا لتشترك.",
          "Log eerst in om te abonneren.",
          "Please log in first to subscribe.",
        ),
      );
      return;
    }
    if (!infoComplete) {
      setMsg(
        L3(
          "أكمِل جميعَ الحقول أوّلًا.",
          "Vul eerst alle velden in.",
          "Please complete all fields first.",
        ),
      );
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      // Refetch first, but proceed regardless — see currentExtras.
      const ex = await currentExtras();
      const r = await subscriptionFetch("checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: uid,
          lang: language,
          tier: selectedTier,
          info: buildSubscriberInfo(fields, ex ?? {}),
        }),
      });
      const d = await r.json();
      if (d.url) Linking.openURL(d.url);
      // Same trap as the coupon path: a refused detail is not an inactive
      // payment system, and saying so sent the user to a coupon field that
      // was about to refuse them for the very same reason.
      // missing_info carries no message of its own, so without naming it here
      // a refused detail still reports the payment system as switched off.
      else
        setMsg(
          d.message ||
            (d.error === "missing_info"
              ? detailsRefusedMsg
              : L3(
                  "الدفعُ غير مفعّلٍ بعد. جرّب كوبونًا أو عُد لاحقًا.",
                  "Betalen is nog niet actief. Probeer een coupon of kom later terug.",
                  "Payment isn't active yet. Try a coupon or come back later.",
                )),
        );
    } catch {
      setMsg(L3("تعذّر الاتصال.", "Verbinding mislukt.", "Connection failed."));
    } finally {
      setBusy(false);
    }
  }

  async function redeem() {
    const code = coupon.trim();
    if (!code) return;
    if (!uid) {
      Alert.alert(
        L3("سجّل الدخول", "Log in", "Log in"),
        L3("سجّل الدخول أوّلًا.", "Log eerst in.", "Please log in first."),
      );
      return;
    }
    if (!infoComplete) {
      setMsg(
        L3(
          "أكمِل جميعَ الحقول أوّلًا.",
          "Vul eerst alle velden in.",
          "Please complete all fields first.",
        ),
      );
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      // Refetch first, but proceed regardless — see currentExtras.
      const ex = await currentExtras();
      const r = await subscriptionFetch("redeem-coupon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          userId: uid,
          info: buildSubscriberInfo(fields, ex ?? {}),
          lang: language,
          channel: couponPolicyChannel(),
        }),
      });
      const d = await r.json();
      if (d.ok) {
        setMsg(
          L3(
            "تمّ تفعيلُ اشتراكك ✓",
            "Uw abonnement is geactiveerd ✓",
            "Your subscription is active ✓",
          ),
        );
        setCoupon("");
        loadStatus();
        // Entitlement just changed: drop the shared cache so the premium screens
        // (Weekly, Treatments, Personal Advice) refetch and unlock on next
        // navigation instead of staying paywalled until a cold restart.
        invalidateSubscriptionCache();
      } else {
        const e = d.error;
        // "not_available": a sold coupon on the Play build. Deliberately says
        // nothing about where it can be used — naming the website would be
        // exactly the steering Play's payments policy forbids.
        setMsg(
          e === "not_available"
            ? L3(
                "لا يمكن تفعيل هذا الرمز هنا. تواصل مع الدعم.",
                "Deze code kan hier niet worden geactiveerd. Neem contact op met support.",
                "This code cannot be activated here. Please contact support.",
              )
            : e === "already_redeemed"
              ? L3(
                  "استُخدم هذا الكوبون من حسابك.",
                  "Deze coupon is al gebruikt op uw account.",
                  "This coupon was already used on your account.",
                )
              : e === "used_up"
                ? L3(
                    "استُنفد هذا الكوبون.",
                    "Deze coupon is opgebruikt.",
                    "This coupon is used up.",
                  )
                : e === "expired" || e === "inactive"
                  ? L3(
                      "هذا الكوبون غيرُ صالح.",
                      "Deze coupon is niet geldig.",
                      "This coupon is not valid.",
                    )
                  : // The server refused the DETAILS, not the code. Falling through to
                    // "invalid coupon" here is what hid a client/server contract drift
                    // for five days while no code was ever looked up. `message` is the
                    // server's own localized wording, which it sends for a refused name
                    // or marital status; missing_info carries none, so name the fix.
                    e === "missing_info" ||
                      e === "invalid_marital_status" ||
                      e === "invalid_name"
                    ? d.message || detailsRefusedMsg
                    : L3(
                        "كوبونٌ غيرُ صحيح.",
                        "Ongeldige coupon.",
                        "Invalid coupon.",
                      ),
        );
      }
    } catch {
      setMsg(L3("تعذّر الاتصال.", "Verbinding mislukt.", "Connection failed."));
    } finally {
      setBusy(false);
    }
  }

  const fmtDate = (d?: string) => {
    if (!d) return "";
    try {
      return new Date(d).toLocaleDateString(
        language === "ar" ? "ar" : language === "nl" ? "nl" : "en",
      );
    } catch {
      return "";
    }
  };
  const inputStyle = {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.foreground,
    textAlign: align as "right" | "left",
    borderWidth: 1,
    borderColor: colors.border,
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          paddingTop: insets.top + 8,
          paddingBottom: 12,
          paddingHorizontal: 16,
          backgroundColor: colors.surface,
          borderBottomWidth: 0.5,
          borderBottomColor: colors.border,
          flexDirection: isRTL ? "row-reverse" : "row",
          alignItems: "center",
          gap: 12,
        }}
      >
        <TouchableOpacity onPress={() => router.back()}>
          <MaterialIcons
            name={isRTL ? "arrow-forward" : "arrow-back"}
            size={24}
            color={colors.foreground}
          />
        </TouchableOpacity>
        <Text
          style={{
            fontSize: 18,
            fontWeight: "700",
            color: colors.foreground,
            flex: 1,
            textAlign: align,
          }}
        >
          {L3("الاشتراك السنويّ", "Jaarabonnement", "Annual subscription")}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
        ) : (
          <>
            {/* Status banner (msg 701): clearly show paid / not-paid */}
            {status?.subscribed ? (
              <View
                style={{
                  backgroundColor: colors.primary + "12",
                  borderColor: colors.primary,
                  borderWidth: 1.5,
                  borderRadius: 16,
                  padding: 18,
                  alignItems: "center",
                  marginBottom: 14,
                }}
              >
                <MaterialIcons
                  name="verified"
                  size={40}
                  color={colors.primary}
                />
                <Text
                  style={{
                    fontSize: 17,
                    fontWeight: "800",
                    color: colors.foreground,
                    marginTop: 8,
                    textAlign: "center",
                  }}
                >
                  {L3("أنت مشترك", "U bent geabonneerd", "You are subscribed")}
                </Text>
                {status.expiresAt && !isPerpetualExpiry(status.expiresAt) ? (
                  <Text
                    style={{
                      fontSize: 13,
                      color: colors.muted,
                      marginTop: 6,
                      textAlign: "center",
                    }}
                  >
                    {L3("ساري إلى", "Geldig tot", "Valid until")}{" "}
                    {fmtDate(status.expiresAt)}
                  </Text>
                ) : null}
                {status.expiresAt ? (
                  <Text
                    style={{
                      fontSize: 13,
                      color: colors.primary,
                      fontWeight: "800",
                      marginTop: 4,
                      textAlign: "center",
                    }}
                  >
                    {formatSubscriptionRemaining(status.expiresAt, language)}
                  </Text>
                ) : null}
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
                {DISTRIBUTION_CHANNEL === "github" ||
                Platform.OS !== "android" ? null : (
                  <TouchableOpacity
                    accessibilityRole="link"
                    onPress={() =>
                      Linking.openURL(
                        "https://play.google.com/store/account/subscriptions",
                      ).catch(() => {})
                    }
                    style={{
                      minHeight: 44,
                      justifyContent: "center",
                      alignItems: "center",
                      marginTop: 10,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        color: colors.primary,
                        fontWeight: "700",
                        textDecorationLine: "underline",
                        textAlign: "center",
                      }}
                    >
                      {L3(
                        "إدارة الاشتراك في Google Play",
                        "Abonnement beheren in Google Play",
                        "Manage subscription in Google Play",
                      )}
                    </Text>
                  </TouchableOpacity>
                )}
                {/* Same guidance on the App Store build, where the subscription
                    is managed in the system App Store account rather than Play.
                    The generic URL lists whatever the user actually holds, so it
                    is right for a coupon or legacy member too. */}
                {Platform.OS === "ios" ? (
                  <TouchableOpacity
                    accessibilityRole="link"
                    onPress={() =>
                      Linking.openURL(
                        "https://apps.apple.com/account/subscriptions",
                      ).catch(() => {})
                    }
                    style={{
                      minHeight: 44,
                      justifyContent: "center",
                      alignItems: "center",
                      marginTop: 10,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        color: colors.primary,
                        fontWeight: "700",
                        textDecorationLine: "underline",
                        textAlign: "center",
                      }}
                    >
                      {L3(
                        "إدارة الاشتراك في App Store",
                        "Abonnement beheren in de App Store",
                        "Manage subscription in the App Store",
                      )}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : (
              <View
                style={{
                  backgroundColor: "#FFF7E6",
                  borderColor: "#E9C46A",
                  borderWidth: 1.5,
                  borderRadius: 16,
                  padding: 16,
                  marginBottom: 14,
                }}
              >
                <View
                  style={{
                    flexDirection: isRTL ? "row-reverse" : "row",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <MaterialIcons
                    name="info-outline"
                    size={22}
                    color="#B8860B"
                  />
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "800",
                      color: "#7A5B00",
                      flex: 1,
                      textAlign: align,
                    }}
                  >
                    {L3(
                      "أنت غير مشترك",
                      "U bent niet geabonneerd",
                      "You are not subscribed",
                    )}
                  </Text>
                </View>
                <Text
                  style={{
                    fontSize: 13,
                    color: "#7A5B00",
                    marginTop: 6,
                    textAlign: align,
                    lineHeight: 20,
                  }}
                >
                  {L3(
                    "اشترك لدعم ربّانيّ والاستفادة الكاملة، أو فعّل كوبونًا.",
                    "Abonneer om Rabbaanie te steunen en volledig te profiteren, of activeer een coupon.",
                    "Subscribe to support Rabbaanie and get full access, or redeem a coupon.",
                  )}
                </Text>
              </View>
            )}

            {/* Tier explainer (msg 720): General (free) vs 3 paid tiers, with icons */}
            <View
              style={{
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 14,
                padding: 12,
                marginBottom: 10,
              }}
            >
              <View
                style={{
                  flexDirection: isRTL ? "row-reverse" : "row",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 6,
                }}
              >
                <MaterialIcons name="eco" size={20} color={colors.primary} />
                <Text
                  style={{
                    fontWeight: "800",
                    fontSize: 13,
                    color: colors.foreground,
                    flex: 1,
                    textAlign: align,
                  }}
                >
                  {L3("العامّ", "Algemeen", "General")}
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 11,
                  color: colors.muted,
                  marginBottom: 10,
                  textAlign: align,
                }}
              >
                {L3(
                  "مجّانيّ — بإدخال بياناتك",
                  "Gratis — met uw gegevens",
                  "Free — with your details",
                )}
              </Text>
              {GENERAL.map((s) => (
                <View
                  key={s.k}
                  style={{
                    flexDirection: isRTL ? "row-reverse" : "row",
                    alignItems: "center",
                    gap: 6,
                    marginBottom: 7,
                  }}
                >
                  <MaterialIcons
                    name={s.icon as any}
                    size={15}
                    color={colors.muted}
                  />
                  <Text
                    style={{
                      fontSize: 11.5,
                      color: colors.foreground,
                      flex: 1,
                      textAlign: align,
                    }}
                  >
                    {L3(s.ar, s.nl, s.en)}
                  </Text>
                </View>
              ))}
            </View>

            {/* Per-tier euro prices + selection are Stripe (github) only: on
                Play/Apple the store sets the price (per country, tax-inclusive)
                and sells one product, so hardcoded €25/30/40 would misstate it. */}
            {DISTRIBUTION_CHANNEL === "github" && (
            <View
              style={{
                flexDirection: isRTL ? "row-reverse" : "row",
                gap: 10,
                marginBottom: 10,
              }}
            >
              {TIERS.map((t) => (
                <TouchableOpacity
                  key={t.key}
                  onPress={() => setSelectedTier(t.key)}
                  style={{
                    flex: 1,
                    backgroundColor: colors.surface,
                    borderWidth: selectedTier === t.key ? 2 : 1,
                    borderColor:
                      selectedTier === t.key ? colors.primary : colors.border,
                    borderRadius: 14,
                    padding: 12,
                  }}
                >
                  <Text
                    style={{
                      fontWeight: "800",
                      fontSize: 13,
                      color: colors.foreground,
                      textAlign: align,
                      marginBottom: 4,
                    }}
                  >
                    {t.name}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: colors.primary,
                      fontWeight: "800",
                      marginBottom: 8,
                      textAlign: align,
                    }}
                  >
                    {t.price}{" "}
                    <Text
                      style={{
                        fontSize: 10,
                        color: colors.muted,
                        fontWeight: "600",
                      }}
                    >
                      {L3("/ سنة", "/ jaar", "/ year")}
                    </Text>
                  </Text>
                  <View
                    style={{
                      flexDirection: isRTL ? "row-reverse" : "row",
                      alignItems: "center",
                      gap: 4,
                      marginBottom: 4,
                    }}
                  >
                    <MaterialIcons
                      name="forum"
                      size={14}
                      color={colors.muted}
                    />
                    <Text
                      style={{
                        fontSize: 11,
                        color: colors.muted,
                        flex: 1,
                        textAlign: align,
                      }}
                    >
                      {t.advisor}
                    </Text>
                  </View>
                  <View
                    style={{
                      flexDirection: isRTL ? "row-reverse" : "row",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <MaterialIcons
                      name="lightbulb"
                      size={14}
                      color={colors.muted}
                    />
                    <Text
                      style={{
                        fontSize: 11,
                        color: colors.muted,
                        flex: 1,
                        textAlign: align,
                      }}
                    >
                      {t.tips}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
            )}

            <View
              style={{
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 14,
                padding: 12,
                marginBottom: 14,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  color: colors.muted,
                  marginBottom: 10,
                  fontWeight: "700",
                  textAlign: align,
                }}
              >
                {L3(
                  "كلُّ الباقات المدفوعة تشمل:",
                  "Alle betaalde plannen bevatten:",
                  "All paid plans include:",
                )}
              </Text>
              {SPECIAL.map((s) => (
                <View
                  key={s.k}
                  style={{
                    flexDirection: isRTL ? "row-reverse" : "row",
                    alignItems: "center",
                    gap: 6,
                    marginBottom: 7,
                  }}
                >
                  <MaterialIcons
                    name={s.icon as any}
                    size={15}
                    color={colors.primary}
                  />
                  <Text
                    style={{
                      fontSize: 11.5,
                      color: colors.foreground,
                      flex: 1,
                      textAlign: align,
                    }}
                  >
                    {L3(s.ar, s.nl, s.en)}
                  </Text>
                </View>
              ))}
            </View>

            {/* Subscriber info — always shown, editable, savable (msg 701) */}
            <View
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderWidth: 1,
                borderRadius: 16,
                padding: 16,
                marginBottom: 12,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "700",
                  color: colors.foreground,
                  marginBottom: 8,
                  textAlign: align,
                }}
              >
                {L3("معلوماتي", "Mijn gegevens", "My details")}
              </Text>
              <View
                style={{
                  flexDirection: isRTL ? "row-reverse" : "row",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <TextInput
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder={L3("الاسم", "Voornaam", "First name")}
                  placeholderTextColor={colors.muted}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <TextInput
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder={L3("اللقب", "Achternaam", "Last name")}
                  placeholderTextColor={colors.muted}
                  style={{ ...inputStyle, flex: 1 }}
                />
              </View>
              <View
                style={{
                  flexDirection: isRTL ? "row-reverse" : "row",
                  flexWrap: "wrap",
                  gap: 6,
                  marginBottom: 8,
                }}
              >
                {MARITAL_OPTIONS.map((m) => (
                  <TouchableOpacity
                    key={m.value}
                    onPress={() => setMaritalStatus(m.value)}
                    style={{
                      paddingVertical: 7,
                      paddingHorizontal: 12,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor:
                        maritalStatus === m.value
                          ? colors.primary
                          : colors.border,
                      backgroundColor:
                        maritalStatus === m.value
                          ? colors.primary
                          : colors.background,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "700",
                        color:
                          maritalStatus === m.value
                            ? "#fff"
                            : colors.foreground,
                      }}
                    >
                      {L3(m.ar, m.nl, m.en)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                value={streetHouseNumber}
                onChangeText={setStreetHouseNumber}
                placeholder={L3(
                  "الشارع ورقم البيت",
                  "Straat en huisnummer",
                  "Street and house number",
                )}
                placeholderTextColor={colors.muted}
                style={{ ...inputStyle, marginBottom: 8 }}
              />
              <View
                style={{
                  flexDirection: isRTL ? "row-reverse" : "row",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <TextInput
                  value={city}
                  onChangeText={setCity}
                  placeholder={L3("المدينة", "Plaats", "City")}
                  placeholderTextColor={colors.muted}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <TextInput
                  value={country}
                  onChangeText={setCountry}
                  placeholder={L3("البلد", "Land", "Country")}
                  placeholderTextColor={colors.muted}
                  style={{ ...inputStyle, flex: 1 }}
                />
              </View>
              <TextInput
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholder={L3("البريد الإلكترونيّ", "E-mail", "Email")}
                placeholderTextColor={colors.muted}
                style={{ ...inputStyle, marginBottom: 8 }}
              />
              <TextInput
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholder={L3("الهاتف", "Telefoon", "Phone")}
                placeholderTextColor={colors.muted}
                style={{ ...inputStyle, marginBottom: 10 }}
              />
              <TouchableOpacity
                onPress={saveInfo}
                disabled={busy}
                style={{
                  backgroundColor: colors.background,
                  borderWidth: 1.5,
                  borderColor: colors.primary,
                  borderRadius: 12,
                  paddingVertical: 12,
                  alignItems: "center",
                  opacity: busy ? 0.6 : 1,
                }}
              >
                <Text
                  style={{
                    color: colors.primary,
                    fontWeight: "800",
                    fontSize: 14,
                  }}
                >
                  {L3(
                    "حفظ معلوماتي",
                    "Mijn gegevens opslaan",
                    "Save my details",
                  )}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Between Save above and the coupon field below, the two things
                that report here. At the foot of the screen it sat ~110 lines of
                JSX past the Redeem button once the coupon moved up, so a refused
                code was reported off screen and Redeem read as dead — the defect
                fe9cf3a fixed for the purchase path, reintroduced on this one.
                Outside the !subscribed block on purpose: a successful redeem
                flips that flag, which would unmount the very message announcing
                it. */}
            {!!msg && (
              <Text
                style={{
                  fontSize: 13,
                  color: colors.primary,
                  marginTop: 14,
                  textAlign: "center",
                }}
              >
                {msg}
              </Text>
            )}

            {/* Subscribe + coupon — only when not subscribed */}
            {!status?.subscribed && (
              <>
                {/* Coupon moved above the subscribe button: a user on a
                    smaller/scrolled screen never reached it when it sat below the
                    button. The wording makes the choice explicit — coupon here,
                    or the normal purchase path in the card right below. */}
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "700",
                    color: colors.muted,
                    marginBottom: 6,
                    textAlign: align,
                  }}
                >
                  {L3(
                    "لديك كوبون؟ فعِّله هنا، أو اشترك بالطريقة المعتادة أدناه.",
                    "Heeft u een coupon? Activeer die hier, of abonneer hieronder op de gebruikelijke manier.",
                    "Have a coupon? Redeem it here, or subscribe below the normal way.",
                  )}
                </Text>
                <View
                  style={{
                    flexDirection: isRTL ? "row-reverse" : "row",
                    gap: 8,
                    marginBottom: 14,
                  }}
                >
                  <TextInput
                    value={coupon}
                    onChangeText={setCoupon}
                    autoCapitalize="characters"
                    placeholder={L3("رمز الكوبون", "Couponcode", "Coupon code")}
                    placeholderTextColor={colors.muted}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <TouchableOpacity
                    onPress={redeem}
                    disabled={busy || !coupon.trim()}
                    style={{
                      backgroundColor: colors.primary,
                      borderRadius: 12,
                      paddingHorizontal: 18,
                      alignItems: "center",
                      justifyContent: "center",
                      opacity: busy || !coupon.trim() ? 0.5 : 1,
                    }}
                  >
                    <Text style={{ color: "#fff", fontWeight: "700" }}>
                      {L3("تفعيل", "Activeren", "Redeem")}
                    </Text>
                  </TouchableOpacity>
                </View>
                <View
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    borderWidth: 1,
                    borderRadius: 16,
                    padding: 18,
                    marginBottom: 14,
                  }}
                >
                  {/* On Play, show Play's own price string rather than a
                      hardcoded €12: Play sets the price per country and folds
                      in local tax, so the hardcoded figure would be wrong for
                      most buyers and misstate the charge before they confirm. */}
                  {/* Same as the tier card above: iOS shows the App Store's own
                      price through the store arm now that StoreKit is armed. */}
                  {DISTRIBUTION_CHANNEL === "github" ? (
                    <Text
                      style={{
                        fontSize: 22,
                        fontWeight: "800",
                        color: colors.foreground,
                        textAlign: align,
                      }}
                    >
                      {TIERS.find((t) => t.key === selectedTier)?.price ??
                        "€25"}
                      <Text
                        style={{
                          fontSize: 14,
                          color: colors.muted,
                          fontWeight: "600",
                        }}
                      >
                        {" "}
                        / {L3("سنة", "jaar", "year")}
                      </Text>
                    </Text>
                  ) : (
                    <Text
                      style={{
                        fontSize: 22,
                        fontWeight: "800",
                        color: colors.foreground,
                        textAlign: align,
                      }}
                    >
                      {play.offer ? play.offer.displayPrice : "—"}
                      <Text
                        style={{
                          fontSize: 14,
                          color: colors.muted,
                          fontWeight: "600",
                        }}
                      >
                        {" "}
                        / {L3("سنة", "jaar", "year")}
                      </Text>
                    </Text>
                  )}
                  <Text
                    style={{
                      fontSize: 13,
                      color: colors.muted,
                      marginTop: 6,
                      textAlign: align,
                      lineHeight: 20,
                    }}
                  >
                    {L3(
                      "ادعم ربّانيّ باشتراكٍ سنويّ، بلا إعلانات، ولكلّ العائلة.",
                      "Steun Rabbaanie met een jaarabonnement, advertentievrij, voor het hele gezin.",
                      "Support Rabbaanie with an annual subscription, ad-free, for the whole family.",
                    )}
                  </Text>
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
                    <TouchableOpacity
                      onPress={subscribe}
                      disabled={busy}
                      style={{
                        backgroundColor: colors.primary,
                        borderRadius: 12,
                        paddingVertical: 14,
                        alignItems: "center",
                        marginTop: 14,
                        opacity: busy ? 0.6 : 1,
                      }}
                    >
                      {busy ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text
                          style={{
                            color: "#fff",
                            fontWeight: "800",
                            fontSize: 15,
                          }}
                        >
                          {L3("اشترك الآن", "Nu abonneren", "Subscribe now")}
                        </Text>
                      )}
                    </TouchableOpacity>
                  ) : (play.offer && status?.playAccountTag) ||
                    play.error === "verify_failed" ||
                    play.recoverable ? (
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
                      <TouchableOpacity
                        onPress={async () => {
                          setPurchaseRefusal("");
                          setMsg("");
                          if (
                            play.error !== "verify_failed" &&
                            !play.recoverable
                          ) {
                            if (!infoComplete) {
                              setPurchaseRefusal(
                                L3(
                                  "أكمِل جميعَ الحقول أوّلًا.",
                                  "Vul eerst alle velden in.",
                                  "Please complete all fields first.",
                                ),
                              );
                              return;
                            }
                            setBusy(true);
                            const saved = await persistInfo();
                            setBusy(false);
                            if (!saved.ok) {
                              setPurchaseRefusal(
                                saved.message ||
                                  L3(
                                    "تعذّر حفظ بياناتك، فلم يبدأ الشراء.",
                                    "Uw gegevens konden niet worden opgeslagen; de aankoop is niet gestart.",
                                    "Your details could not be saved, so the purchase was not started.",
                                  ),
                              );
                              return;
                            }
                          }
                          play.purchase();
                        }}
                        disabled={play.busy || busy}
                        style={{
                          backgroundColor: colors.primary,
                          borderRadius: 12,
                          paddingVertical: 14,
                          alignItems: "center",
                          marginTop: 14,
                          opacity: play.busy || busy ? 0.6 : 1,
                        }}
                      >
                        {play.busy || busy ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <Text
                            style={{
                              color: "#fff",
                              fontWeight: "800",
                              fontSize: 15,
                            }}
                          >
                            {L3("اشترك الآن", "Nu abonneren", "Subscribe now")}
                          </Text>
                        )}
                      </TouchableOpacity>
                      {/* Beside the button that produced it. Same red as the
                          post-purchase errors below, so a refusal before the
                          purchase starts and one after it look alike. */}
                      {!!purchaseRefusal && (
                        <Text
                          style={{
                            fontSize: 12.5,
                            color: "#B3261E",
                            marginTop: 10,
                            textAlign: align,
                            lineHeight: 19,
                          }}
                        >
                          {purchaseRefusal}
                        </Text>
                      )}
                      {/* Play requires the renewal terms to be visible before
                          purchase, and users must be told where to cancel. */}
                      <Text
                        style={{
                          fontSize: 11.5,
                          color: colors.muted,
                          marginTop: 10,
                          textAlign: align,
                          lineHeight: 18,
                        }}
                      >
                        {DISTRIBUTION_CHANNEL === "apple"
                          ? L3(
                              "يتجدّد الاشتراك سنويًّا تلقائيًّا حتّى تُلغيه من إعدادات اشتراكات App Store.",
                              "Het abonnement wordt jaarlijks automatisch verlengd totdat u het opzegt via de abonnementen-instellingen van de App Store.",
                              "The subscription renews annually until you cancel it in your App Store subscription settings.",
                            )
                          : L3(
                              "يتجدّد الاشتراك سنويًّا تلقائيًّا حتّى تُلغيه من إعدادات اشتراكات Google Play.",
                              "Het abonnement wordt jaarlijks automatisch verlengd totdat u het opzegt via de abonnementen-instellingen van Google Play.",
                              "The subscription renews annually until you cancel it in your Google Play subscription settings.",
                            )}
                      </Text>
                    </>
                  ) : (
                    /* Never a bare "loading…" that can hang forever: on iOS, on
                       web, and against a server that predates playAccountTag the
                       purchase path genuinely never becomes available, so the
                       message has to name the coupon fallback instead of leaving
                       the user staring at a spinner. */
                    <Text
                      style={{
                        fontSize: 13,
                        color: colors.muted,
                        marginTop: 14,
                        textAlign: align,
                        lineHeight: 20,
                      }}
                    >
                      {play.loading
                        ? L3(
                            "جارٍ تحميل خيارات الاشتراك…",
                            "Abonnementsopties laden…",
                            "Loading subscription options…",
                          )
                        : play.error === "unavailable"
                          ? /* "above", not "below": the coupon field moved to the
                             top of this screen. These two notices fire exactly
                             when Play billing is unavailable, so the code box
                             they point at is the only way in — sending the user
                             the wrong way here costs them the purchase. */
                            L3(
                              `تعذّر الاتصال بـ${storeName}. تحقّق من اتصالك ثمّ أعِد المحاولة. وإن كان لديك رمز، فعّله أعلاه.`,
                              `Kan geen verbinding maken met ${storeName}. Controleer uw verbinding en probeer het opnieuw. Heeft u een code? Activeer die hierboven.`,
                              `Could not reach ${storeName}. Check your connection and try again. If you have a code, redeem it above.`,
                            )
                          : L3(
                              "الاشتراك داخل التطبيق غير متاحٍ هنا حاليًّا. إن كان لديك رمز، فعّله أعلاه.",
                              "Abonneren in de app is hier momenteel niet beschikbaar. Heeft u een code? Activeer die hierboven.",
                              "In-app subscribing isn't available here right now. If you have a code, redeem it above.",
                            )}
                    </Text>
                  )}
                  {[
                    "verify_failed",
                    "purchase_failed",
                    "purchase_pending",
                    "purchase_foreign",
                    "verify_gone",
                  ].includes(play.error || "") ? (
                    /* purchase_pending is not a failure — a slow payment method
                       (cash at a store, some carrier billing) has been chosen and
                       Play will deliver the purchase once the money clears, so it
                       is shown in a neutral colour with different wording. */
                    <Text
                      style={{
                        fontSize: 12.5,
                        color: [
                          "purchase_pending",
                          "purchase_foreign",
                        ].includes(play.error || "")
                          ? colors.muted
                          : "#B3261E",
                        marginTop: 10,
                        textAlign: align,
                        lineHeight: 19,
                      }}
                    >
                      {play.error === "purchase_pending"
                        ? // "Automatically" was a promise the app cannot keep.
                          // purchaseUpdatedListener is registered inside
                          // usePlayBilling, which only this screen mounts, so a
                          // slow payment clearing while the user is anywhere else
                          // is neither verified nor acknowledged — and Google
                          // auto-refunds an unacknowledged purchase after three
                          // days. Reopening this screen does settle it (the
                          // connection-open flush is handled as a restore), so
                          // asking for that is both true and sufficient. Same
                          // wording as verify_failed directly below.
                          L3(
                            `دفعتك قيدُ المعالجة لدى ${storeName}. أعِد فتح هذه الصفحة بعد اكتمالها ليُفعَّل اشتراكك.`,
                            `Uw betaling wordt nog verwerkt door ${storeName}. Open deze pagina opnieuw zodra dat klaar is, dan wordt uw abonnement geactiveerd.`,
                            `Your payment is still being processed by ${storeName}. Reopen this page once it completes and your membership will be activated.`,
                          )
                        : play.error === "purchase_foreign"
                          ? L3(
                              `يوجد على هذا الجهاز اشتراكٌ اشتُري بحسابٍ آخر في ربّانيّ. سجّل الدخول بذلك الحساب، أو استخدم ${otherAccount} للشراء.`,
                              `Op dit apparaat staat een abonnement dat met een ander Rabbaanie-account is gekocht. Log in met dat account, of gebruik ${otherAccount} om te kopen.`,
                              `This device has a membership bought with a different Rabbaanie account. Sign in with that account, or use ${otherAccount} to purchase.`,
                            )
                          : play.error === "verify_gone"
                            ? L3(
                                `لم يعُد ${storeName} يُبلغ عن هذا الشراء. إن كنت قد دُفعت ولم يُفعَّل اشتراكك، فتواصل مع الدعم.`,
                                `${storeName} meldt deze aankoop niet meer. Als u heeft betaald en uw abonnement niet actief is, neem dan contact op met support.`,
                                `${storeName} no longer reports that purchase. If you were charged and your membership is not active, please contact support.`,
                              )
                            : play.error === "verify_failed"
                              ? L3(
                                  "تمّ الدفع، لكن تعذّر تأكيده الآن. لن تُخصم منك مرّةً أخرى — أعِد فتح هذه الصفحة بعد قليل.",
                                  "De betaling is gelukt, maar kon nu niet worden bevestigd. U wordt niet nogmaals belast — open deze pagina straks opnieuw.",
                                  "Payment went through but could not be confirmed yet. You will not be charged again — reopen this page shortly.",
                                )
                              : L3(
                                  "تعذّر إتمام عمليّة الشراء. حاول مرّةً أخرى.",
                                  "De aankoop kon niet worden voltooid. Probeer het opnieuw.",
                                  "The purchase could not be completed. Please try again.",
                                )}
                    </Text>
                  ) : null}
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
