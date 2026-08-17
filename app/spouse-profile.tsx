import { useState, useEffect } from "react";
import { Text, View, ScrollView, Pressable, ActivityIndicator, StyleSheet, Alert } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { useRouter, useLocalSearchParams } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { trpc } from "@/lib/trpc";
import { translateProfileValue } from "@/lib/profile-labels";
import { isFullPartnerProfile } from "@/lib/partner-types";
import type { PartnerListEntry } from "@/lib/partner-types";

function tx(lang: string, nl: string, en: string, ar: string) {
  return lang === "ar" ? ar : lang === "nl" ? nl : en;
}

// Only these profileFields keys are collected via the onboarding form's fixed
// select/multiselect options (app/onboarding/parent-profile.tsx: prayer,
// fajr, hijab = "select", knowledgeSource = "multiselect", familyScience =
// "select" -- all covered by PROFILE_VALUE_LABELS in lib/profile-labels.ts).
// Every other profileFields key is either a "hybrid" field (onboarding lets
// the user pick a preset OR type their own answer, e.g.
// partnerRelationQuality) or free text, so running its value through the
// enum lookup can mangle the user's own words -- e.g. translateProfileValue
// splits on commas for multiselect keys, which would silently swap a
// free-text answer's own commas for the viewer's locale separator, and a
// one-word answer that happens to match an unrelated enum key (like
// "boeken") would get relabeled instead of shown as typed.
const ENUM_PROFILE_FIELDS = new Set([
  "prayer", "fajr", "hijab", "knowledgeSource", "familyScience",
]);

export default function SpouseProfileScreen() {
  const colors = useColors();
  const { language: lang, isRTL } = useI18n();
  const router = useRouter();
  const params = useLocalSearchParams<{ partnerId?: string }>();
  const paramPartnerId = params.partnerId ? Number(params.partnerId) : null;

  const listPartnersQuery = trpc.links.listPartners.useQuery(undefined, {
    refetchOnMount: "always",
    staleTime: 0,
  });
  const partners: PartnerListEntry[] = listPartnersQuery.data ?? [];
  const hasMultiplePartners = partners.length > 1;
  const [manualPartnerId, setManualPartnerId] = useState<number | null>(null);
  // Priority: an explicit tap on this screen's own selector, then whichever
  // partner the caller navigated in with, then the first confirmed partner.
  // Stays null (today's "let the server pick" default) until the partner
  // list actually has more than one entry to choose between — so a
  // single-partner user's query is byte-for-byte what it was before this
  // change.
  const selectedPartnerId: number | null = hasMultiplePartners
    ? manualPartnerId != null && partners.some((p) => p.id === manualPartnerId)
      ? manualPartnerId
      : paramPartnerId != null && partners.some((p) => p.id === paramPartnerId)
        ? paramPartnerId
        : partners[0].id
    : null;

  // grant/revoke now REQUIRE an explicit partner when there is more than one
  // (server throws BAD_REQUEST rather than silently picking the first — a
  // write that hands out access must never guess). Undefined for a
  // single-partner user, which the server treats exactly as before.
  const partnerArg =
    selectedPartnerId != null ? { partnerId: selectedPartnerId } : undefined;
  // The banners below render off partnerProfileQuery, which can resolve before
  // listPartners (or be served from the persisted cache while listPartners is
  // still in flight). In that window selectedPartnerId is still null, so a
  // husband with several wives would send no partnerId and the server — which
  // refuses to guess on a write that hands out access — answers BAD_REQUEST
  // "Multiple partners found". Disable the controls until the partner list has
  // actually landed; a single-partner user is unaffected either way.
  const partnerChoiceReady = listPartnersQuery.isSuccess;

  const partnerProfileQuery = trpc.links.getPartnerProfile.useQuery(
    selectedPartnerId != null ? { partnerId: selectedPartnerId } : undefined,
    {
      refetchOnMount: "always",
      staleTime: 0,
    },
  );
  const requestAccessMutation = trpc.links.requestPartnerProfileAccess.useMutation({
    onSuccess: () => partnerProfileQuery.refetch(),
    onError: (err: any) => {
      Alert.alert(
        tx(lang, "Mislukt", "Failed", "فشلت العملية"),
        err?.message ||
          tx(
            lang,
            "Kon het verzoek niet worden verstuurd.",
            "Could not send the request.",
            "تعذّر إرسال الطلب.",
          ),
      );
    },
  });
  const setGenderMutation = trpc.links.setMyGender.useMutation({
    onSuccess: () => partnerProfileQuery.refetch(),
  });
  const grantAccessMutation = trpc.links.grantPartnerProfileAccess.useMutation({
    onSuccess: () => partnerProfileQuery.refetch(),
    onError: (err: any) => {
      Alert.alert(
        tx(lang, "Mislukt", "Failed", "فشلت العملية"),
        err?.message ||
          tx(
            lang,
            "Kon de toegang niet worden verleend.",
            "Could not grant access.",
            "تعذّر منح الإذن.",
          ),
      );
    },
  });
  // Also used for "decline" — revoking a request that was never granted is a no-op
  // on the grant itself and simply clears the pending request.
  const revokeAccessMutation = trpc.links.revokePartnerProfileAccess.useMutation({
    onSuccess: () => partnerProfileQuery.refetch(),
    onError: (err: any) => {
      Alert.alert(
        tx(lang, "Mislukt", "Failed", "فشلت العملية"),
        err?.message ||
          tx(
            lang,
            "Kon deze actie niet worden voltooid.",
            "Could not complete this action.",
            "تعذّر إتمام هذا الإجراء.",
          ),
      );
    },
  });
  // Ends one specific partnership (owner's ruling: a man may have multiple
  // wives, so separation must target a partnershipId, not "the" partner).
  const dissolvePartnerMutation = trpc.links.dissolvePartner.useMutation({
    onSuccess: () => {
      listPartnersQuery.refetch();
      router.back();
    },
    onError: (err: any) => {
      Alert.alert(
        tx(lang, "Mislukt", "Failed", "فشلت العملية"),
        err?.message ||
          tx(
            lang,
            "Kon de verbintenis niet verbreken.",
            "Could not end the partnership.",
            "تعذّر إنهاء هذه الشراكة.",
          ),
      );
    },
  });

  const data = partnerProfileQuery.data;
  // Narrowed once here so every full-only-field read below goes through a
  // properly typed value instead of the raw union (see isFullPartnerProfile
  // above). `data` itself stays the full union for fields present on both
  // branches (name/gender/access/...).
  const full = isFullPartnerProfile(data) ? data : null;
  const pp = full?.parentProfile;
  const partnerName = data?.name || tx(lang, "Partner", "Partner", "الشريك/ة");
  const partnerIsMale = data?.gender === "man";
  // needsGender/needsMyGender/needsPartnerGender are restricted-only fields
  // (absent from the full branch's type entirely), so they need their own
  // narrowing before they're readable at all.
  const restrictedData = data?.access === "restricted" ? data : undefined;
  // Precise booleans from the server distinguish whose gender is missing.
  // Defensive fallback (server hasn't shipped these fields yet): treat it
  // as "my gender is missing", matching today's needsGender behavior.
  const needsMyGender = restrictedData?.needsMyGender ?? !!restrictedData?.needsGender;
  const needsPartnerGender = restrictedData?.needsPartnerGender ?? false;

  // The partnership backing whichever profile is currently on screen —
  // matched by user id (not selectedPartnerId) so this also resolves for
  // the single-partner case, where selectedPartnerId stays null and the
  // server picks the partner on its own.
  // partnershipId 0 means the shared-children fallback surfaced this co-parent
  // without any partnerships row existing (it deliberately writes nothing —
  // see getPartnersOfUser). There is nothing to dissolve, and dissolvePartner
  // would match no row and throw FORBIDDEN, so the destructive control must not
  // be offered at all: an alarming "cannot be easily undone" dialog followed by
  // a failure alert, every time. Fails closed the same way canRequest already
  // does for this case.
  const currentPartnership = partners.find(
    (p) => p.id === data?.id && p.partnershipId > 0,
  );

  function confirmDissolvePartnership() {
    if (!currentPartnership) return;
    const name = data?.name || partnerName;
    Alert.alert(
      tx(lang, "Verbintenis verbreken?", "End partnership?", "هل تريد إنهاء هذه الشراكة؟"),
      tx(
        lang,
        `Dit beëindigt de verbintenis met ${name}. Deze persoon verliest toegang tot uw profiel en dit kan niet eenvoudig ongedaan worden gemaakt.`,
        `This ends the partnership with ${name}. They will lose access to your profile, and this cannot be easily undone.`,
        `سينهي هذا الشراكة مع ${name}. سيفقد هذا الشخص إمكانية الاطلاع على ملفك، ولا يمكن التراجع عن ذلك بسهولة.`,
      ),
      [
        { text: tx(lang, "Annuleren", "Cancel", "إلغاء"), style: "cancel" },
        {
          text: tx(lang, "Verbreken", "End it", "إنهاء"),
          style: "destructive",
          onPress: () =>
            dissolvePartnerMutation.mutate({ partnershipId: currentPartnership.partnershipId }),
        },
      ],
    );
  }

  // Chip row for switching which spouse this screen shows. Renders nothing
  // for the overwhelmingly common single-partner case — the screen must
  // look exactly as it does today when there's no one to choose between.
  function renderPartnerSelector() {
    if (!hasMultiplePartners) return null;
    return (
      <View
        style={{
          paddingHorizontal: 16,
          marginBottom: 12,
          flexDirection: isRTL ? "row-reverse" : "row",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        {partners.map((p) => {
          const isSelected = p.id === selectedPartnerId;
          const label =
            p.name ||
            (p.gender === "man"
              ? tx(lang, "Man", "Husband", "الزوج")
              : p.gender === "vrouw"
                ? tx(lang, "Vrouw", "Wife", "الزوجة")
                : tx(lang, "Partner", "Partner", "الشريك/ة"));
          return (
            <Pressable
              key={p.partnershipId}
              onPress={() => setManualPartnerId(p.id)}
              style={({ pressed }) => [
                {
                  backgroundColor: isSelected ? colors.primary : colors.primary + "12",
                  borderRadius: 20,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <Text
                style={{
                  color: isSelected ? "#fff" : colors.primary,
                  fontSize: 12,
                  fontWeight: "600",
                }}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  // Destructive "end this partnership" action. Renders nothing until
  // listPartners has resolved the current partner's partnershipId — so it
  // silently stays absent (today's behaviour: no such control exists yet)
  // rather than rendering a button it can't actually wire up.
  function renderDissolveAction() {
    if (!currentPartnership) return null;
    return (
      <Pressable
        onPress={confirmDissolvePartnership}
        disabled={dissolvePartnerMutation.isPending}
        style={({ pressed }) => [
          {
            marginHorizontal: 16,
            marginTop: 8,
            marginBottom: 24,
            alignItems: "center",
            paddingVertical: 10,
            opacity: pressed || dissolvePartnerMutation.isPending ? 0.6 : 1,
          },
        ]}
      >
        <Text style={{ color: colors.error, fontSize: 12, fontWeight: "600" }}>
          {dissolvePartnerMutation.isPending
            ? tx(lang, "Bezig...", "Working...", "جارٍ التنفيذ...")
            : tx(
                lang,
                "Verbintenis met deze partner verbreken",
                "End partnership with this spouse",
                "إنهاء الشراكة مع هذا الشريك/ة",
              )}
        </Text>
      </Pressable>
    );
  }

  const translateValue = (v: any, key: string) => {
    if (!v) return "-";
    const s = String(v);
    if (!ENUM_PROFILE_FIELDS.has(key)) return s;
    if (s === "ja" || s === "yes") return tx(lang, "Ja", "Yes", "نعم");
    if (s === "nee" || s === "no") return tx(lang, "Nee", "No", "لا");
    return translateProfileValue(s, lang);
  };

  // A partner requesting to view YOUR profile is independent of your own access
  // to theirs — it must stay reachable whether your own view of their profile is
  // restricted, missing entirely, or fully loaded, not only in the last case.
  const incomingRequestBanner = data?.incomingRequestPending ? (
    <View style={{ marginHorizontal: 16, marginBottom: 16, backgroundColor: "#FFFBEB", borderRadius: 14, padding: 16, borderWidth: 1, borderColor: "#FCD34D" }}>
      <Text style={{ fontSize: 13, fontWeight: "700", color: "#92400E", textAlign: isRTL ? "right" : "left" }}>
        {tx(
          lang,
          `${partnerName} vraagt toestemming om uw profiel te bekijken.`,
          `${partnerName} is asking permission to view your profile.`,
          `تطلب ${partnerName} إذنك للاطلاع على ملفك الشخصي.`,
        )}
      </Text>
      <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 10, marginTop: 12 }}>
        <Pressable
          onPress={() => grantAccessMutation.mutate(partnerArg)}
          disabled={!partnerChoiceReady || grantAccessMutation.isPending || revokeAccessMutation.isPending}
          style={({ pressed }) => [{ backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 16, opacity: pressed || grantAccessMutation.isPending ? 0.7 : 1 }]}
        >
          <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>
            {tx(lang, "Toestaan", "Allow", "السماح")}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => revokeAccessMutation.mutate(partnerArg)}
          disabled={!partnerChoiceReady || grantAccessMutation.isPending || revokeAccessMutation.isPending}
          style={({ pressed }) => [{ backgroundColor: "#F3F4F6", borderRadius: 10, paddingVertical: 8, paddingHorizontal: 16, opacity: pressed || revokeAccessMutation.isPending ? 0.7 : 1 }]}
        >
          <Text style={{ color: "#374151", fontWeight: "600", fontSize: 13 }}>
            {tx(lang, "Weigeren", "Decline", "رفض")}
          </Text>
        </Pressable>
      </View>
    </View>
  ) : null;

  // Hoisted above the early returns for the same reason incomingRequestBanner
  // is: this is the ONLY revoke affordance in the app. Left inline in the full
  // branch, a husband whose wife never filled her parentProfile fell into the
  // "no profile found" return, and a husband whose own view is restricted fell
  // into that return — both with no way to withdraw an access he had granted,
  // even though the server ships grantedToPartner in those payloads too.
  const grantedRevokeBanner =
    data?.grantedToPartner && !data?.incomingRequestPending ? (
      <View style={{ marginHorizontal: 16, marginBottom: 16, backgroundColor: "#F0FDF4", borderRadius: 14, padding: 16, borderWidth: 1, borderColor: "#86EFAC", flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <Text style={{ fontSize: 12, color: "#166534", flex: 1, textAlign: isRTL ? "right" : "left" }}>
          {tx(
            lang,
            `${partnerName} heeft toegang tot uw profiel.`,
            `${partnerName} has access to your profile.`,
            `لدى ${partnerName} إذن للاطلاع على ملفك الشخصي.`,
          )}
        </Text>
        <Pressable
          onPress={() => revokeAccessMutation.mutate(partnerArg)}
          disabled={!partnerChoiceReady || revokeAccessMutation.isPending}
          style={({ pressed }) => [{ backgroundColor: "#fff", borderRadius: 10, paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: "#166534", opacity: pressed || revokeAccessMutation.isPending ? 0.7 : 1 }]}
        >
          <Text style={{ color: "#166534", fontWeight: "600", fontSize: 12 }}>
            {tx(lang, "Intrekken", "Revoke", "سحب")}
          </Text>
        </Pressable>
      </View>
    ) : null;

  if (partnerProfileQuery.isLoading) {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]} className="p-4">
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  if (data?.access === "restricted") {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]} className="p-4">
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", paddingVertical: 12 }}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, padding: 8 }]}>
            <MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={24} color={colors.foreground} />
          </Pressable>
        </View>
        {renderPartnerSelector()}
        {incomingRequestBanner}
        {grantedRevokeBanner}
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 20 }}>
          <MaterialIcons name="lock-outline" size={48} color={colors.muted} />
          <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, textAlign: "center", marginTop: 12 }}>
            {data.name || partnerName}
          </Text>

          {needsMyGender || needsPartnerGender ? (
            <>
              {needsMyGender && (
                <>
                  <Text style={{ fontSize: 13, color: colors.muted, textAlign: "center", marginTop: 8 }}>
                    {tx(lang, "Stel eerst uw geslacht in om dit profiel te kunnen bekijken.", "Set your gender first to view this profile.", "حدّد جنسك أولاً لعرض هذا الملف.")}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
                    <Pressable
                      onPress={() => setGenderMutation.mutate({ gender: "man" })}
                      disabled={setGenderMutation.isPending}
                      style={({ pressed }) => [{ backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20, opacity: pressed || setGenderMutation.isPending ? 0.7 : 1 }]}
                    >
                      <Text style={{ color: "#fff", fontWeight: "600" }}>{tx(lang, "Man", "Man", "رجل")}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setGenderMutation.mutate({ gender: "vrouw" })}
                      disabled={setGenderMutation.isPending}
                      style={({ pressed }) => [{ backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20, opacity: pressed || setGenderMutation.isPending ? 0.7 : 1 }]}
                    >
                      <Text style={{ color: "#fff", fontWeight: "600" }}>{tx(lang, "Vrouw", "Woman", "امرأة")}</Text>
                    </Pressable>
                  </View>
                </>
              )}
              {needsPartnerGender && (
                <Text style={{ fontSize: 13, color: colors.muted, textAlign: "center", marginTop: needsMyGender ? 16 : 8 }}>
                  {tx(
                    lang,
                    "Uw partner moet eerst het geslacht instellen in de eigen app voordat dit profiel getoond kan worden.",
                    "Your partner needs to set their gender in their own app before this profile can be shown.",
                    "يجب أن يحدّد شريكك جنسه في تطبيقه الخاص أولاً حتى يمكن عرض هذا الملف.",
                  )}
                </Text>
              )}
            </>
          ) : data.requestPending ? (
            <Text style={{ fontSize: 13, color: colors.muted, textAlign: "center", marginTop: 8 }}>
              {tx(lang, "Verzoek verstuurd. U ziet dit profiel zodra uw man het toestaat.", "Request sent. You'll see this profile once your husband allows it.", "تم إرسال الطلب. سترين هذا الملف بمجرد موافقة زوجك.")}
            </Text>
          ) : data.canRequest ? (
            <>
              <Text style={{ fontSize: 13, color: colors.muted, textAlign: "center", marginTop: 8 }}>
                {tx(lang, "Vraag toestemming aan uw man om zijn profiel te bekijken.", "Ask your husband for permission to view his profile.", "اطلبي إذن زوجك للاطلاع على ملفه.")}
              </Text>
              <Pressable
                onPress={() => requestAccessMutation.mutate()}
                disabled={requestAccessMutation.isPending}
                style={({ pressed }) => [{ marginTop: 20, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 24, opacity: pressed || requestAccessMutation.isPending ? 0.7 : 1 }]}
              >
                <Text style={{ color: "#fff", fontWeight: "600" }}>
                  {tx(lang, "Toestemming vragen", "Request permission", "طلب الإذن")}
                </Text>
              </Pressable>
            </>
          ) : (
            <Text style={{ fontSize: 13, color: colors.muted, textAlign: "center", marginTop: 8 }}>
              {tx(lang, "Dit profiel is niet beschikbaar.", "This profile is not available.", "هذا الملف غير متاح.")}
            </Text>
          )}
        </View>
        {renderDissolveAction()}
      </ScreenContainer>
    );
  }

  if (!partnerProfileQuery.data || !pp) {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]} className="p-4">
        {renderPartnerSelector()}
        {incomingRequestBanner}
        {grantedRevokeBanner}
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 20 }}>
          <MaterialIcons name="person-off" size={48} color={colors.muted} />
          <Text style={{ fontSize: 16, color: colors.muted, textAlign: "center", marginTop: 12 }}>
            {/* Partner's gender is genuinely unknown here -- no partner profile
                loaded to read it from -- so this stays neutral rather than
                assuming a wife, matching the "الشريك/ة" convention already used
                for partnerName's own fallback above. */}
            {tx(lang, "Geen partnerprofiel gevonden", "No partner profile found", "لم يتم العثور على ملف الشريك/ة")}
          </Text>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [{ marginTop: 20, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 24, opacity: pressed ? 0.8 : 1 }]}
          >
            <Text style={{ color: "#fff", fontWeight: "600" }}>{tx(lang, "Terug", "Back", "رجوع")}</Text>
          </Pressable>
        </View>
        {renderDissolveAction()}
      </ScreenContainer>
    );
  }

  // Build profile fields
  const profileFields = [
    { key: "prayer", label: tx(lang, "Gebed", "Prayer", "الصلاة"), icon: "access-time" },
    { key: "fajr", label: tx(lang, "Fajr gebed", "Fajr prayer", "صلاة الفجر"), icon: "wb-twilight" },
    { key: "hijab", label: tx(lang, "Hijaab", "Hijab", "الحجاب"), icon: "checkroom" },
    { key: "knowledgeSource", label: tx(lang, "Bron van kennis", "Source of knowledge", "مصدر المعرفة"), icon: "menu-book" },
    { key: "familyScience", label: tx(lang, "Gezinskunde", "Family science", "علم الأسرة"), icon: "family-restroom" },
    { key: "quranReading", label: tx(lang, "Qur'aan lezen", "Qur'aan reading", "قراءة القرآن"), icon: "auto-stories" },
    { key: "adhkar", label: tx(lang, "Adhkaar", "Adhkaar", "الأذكار"), icon: "favorite" },
    { key: "educationLevel", label: tx(lang, "Opleidingsniveau", "Education level", "المستوى التعليمي"), icon: "school" },
    { key: "workStatus", label: tx(lang, "Werkstatus", "Work status", "حالة العمل"), icon: "work" },
    { key: "healthStatus", label: tx(lang, "Gezondheid", "Health", "الصحة"), icon: "health-and-safety" },
    { key: "stressLevel", label: tx(lang, "Stressniveau", "Stress level", "مستوى التوتر"), icon: "psychology" },
    { key: "partnerRelationQuality", label: tx(lang, "Relatie kwaliteit", "Relationship quality", "جودة العلاقة"), icon: "favorite-border" },
    { key: "parentingStyle", label: tx(lang, "Opvoedstijl", "Parenting style", "أسلوب التربية"), icon: "child-care" },
    { key: "mainConcern", label: tx(lang, "Belangrijkste zorg", "Main concern", "أهم المخاوف"), icon: "warning" },
    { key: "goals", label: tx(lang, "Doelen", "Goals", "الأهداف"), icon: "flag" },
  ];

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Header */}
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 }}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, padding: 8 }]}
          >
            <MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={24} color={colors.foreground} />
          </Pressable>
          <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground }}>
            {tx(lang, `Profiel van ${partnerName}`, `${partnerName}'s profile`, `ملف ${partnerName}`)}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        {renderPartnerSelector()}

        {/* Incoming request: partner is asking to view this user's profile */}
        {incomingRequestBanner}
        {grantedRevokeBanner}

        {/* Partner name card */}
        <View style={{ marginHorizontal: 16, marginBottom: 16, backgroundColor: "#FFF0F5", borderRadius: 14, padding: 16, alignItems: "center", borderWidth: 1, borderColor: "#F9A8D4" }}>
          <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: "#F9A8D4", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
            <MaterialIcons name="person" size={32} color="#9D174D" />
          </View>
          <Text style={{ fontSize: 18, fontWeight: "700", color: "#9D174D" }}>{partnerName}</Text>
          <Text style={{ fontSize: 12, color: "#BE185D", marginTop: 4 }}>
            {partnerIsMale
              ? tx(lang, "Ingevuld door hem", "Filled by him", "ملأه هو")
              : tx(lang, "Ingevuld door haar", "Filled by her", "ملأته هي")}
          </Text>
        </View>

        {/* Profile fields */}
        <View style={{ marginHorizontal: 16, gap: 8 }}>
          {profileFields.map(({ key, label, icon }) => {
            const value = (pp as any)?.[key];
            if (!value) return null;
            return (
              <View key={key} style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                padding: 12,
                borderWidth: 1,
                borderColor: colors.border,
                flexDirection: isRTL ? "row-reverse" : "row",
                alignItems: "center",
                gap: 10,
              }}>
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary + "15", alignItems: "center", justifyContent: "center" }}>
                  <MaterialIcons name={icon as any} size={16} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, color: colors.muted, textAlign: isRTL ? "right" : "left" }}>{label}</Text>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, textAlign: isRTL ? "right" : "left", marginTop: 2 }}>
                    {translateValue(value, key)}
                  </Text>
                </View>
              </View>
            );
          })}

          {/* If no fields filled */}
          {profileFields.every(({ key }) => !(pp as any)?.[key]) && (
            <View style={{ alignItems: "center", paddingVertical: 30 }}>
              <MaterialIcons name="edit-note" size={40} color={colors.muted} />
              <Text style={{ fontSize: 13, color: colors.muted, textAlign: "center", marginTop: 8 }}>
                {partnerIsMale
                  ? tx(lang, "Uw partner heeft zijn profiel nog niet ingevuld", "Your partner hasn't filled his profile yet", "زوجك لم يملأ ملفه بعد")
                  : tx(lang, "Uw partner heeft haar profiel nog niet ingevuld", "Your partner hasn't filled her profile yet", "زوجتك لم تملأ ملفها بعد")}
              </Text>
            </View>
          )}
        </View>

        {/* Partner's children */}
        {full?.children && full.children.length > 0 && (
          <View style={{ marginHorizontal: 16, marginTop: 20 }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 8, textAlign: isRTL ? "right" : "left" }}>
              {partnerIsMale
                ? tx(lang, "Kinderen (volgens hem)", "Children (according to him)", "الأطفال (حسب ملفه)")
                : tx(lang, "Kinderen (volgens haar)", "Children (according to her)", "الأطفال (حسب ملفها)")}
            </Text>
            {full.children.map((child: any, idx: number) => (
              <View key={child.id || idx} style={{
                backgroundColor: colors.surface,
                borderRadius: 10,
                padding: 10,
                marginBottom: 6,
                borderWidth: 1,
                borderColor: colors.border,
                flexDirection: isRTL ? "row-reverse" : "row",
                alignItems: "center",
                gap: 8,
              }}>
                <MaterialIcons name="child-care" size={18} color={colors.primary} />
                <Text style={{ fontSize: 12, color: colors.foreground, fontWeight: "600" }}>{child.name}</Text>
                {child.birthDate && (
                  <Text style={{ fontSize: 10, color: colors.muted }}>({child.birthDate})</Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Partner's issues */}
        {full?.issues && full.issues.length > 0 && (
          <View style={{ marginHorizontal: 16, marginTop: 20 }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 8, textAlign: isRTL ? "right" : "left" }}>
              {partnerIsMale
                ? tx(lang, "Problemen (volgens hem)", "Issues (according to him)", "المشاكل (حسب ملفه)")
                : tx(lang, "Problemen (volgens haar)", "Issues (according to her)", "المشاكل (حسب ملفها)")}
            </Text>
            {full.issues.map((issue: any, idx: number) => (
              <View key={issue.id || idx} style={{
                backgroundColor: "#FEF2F2",
                borderRadius: 10,
                padding: 10,
                marginBottom: 6,
                borderWidth: 1,
                borderColor: "#FECACA",
              }}>
                <Text style={{ fontSize: 12, color: "#991B1B", fontWeight: "600", textAlign: isRTL ? "right" : "left" }}>
                  {issue.description || issue.title || `${tx(lang, "Probleem", "Issue", "مشكلة")} ${idx + 1}`}
                </Text>
                {issue.childName && (
                  <Text style={{ fontSize: 10, color: "#B91C1C", marginTop: 2, textAlign: isRTL ? "right" : "left" }}>
                    {tx(lang, "Kind:", "Child:", "الطفل:")} {issue.childName}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}

        {renderDissolveAction()}
      </ScrollView>
    </ScreenContainer>
  );
}
