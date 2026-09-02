import React, { useState, useEffect } from "react";
import {
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Platform,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { useI18n } from "@/lib/i18n";
import { useAppState } from "@/lib/app-context";
import { getFunctionRoleLabel } from "@/lib/specialist-roles";

const tx = (lang: string, nl: string, en: string, ar: string) =>
  lang === "ar" ? ar : lang === "en" ? en : nl;

export default function FindSpecialistScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const { language } = useI18n();
  const { state } = useAppState();
  const lang = language || "nl";
  const isRTL = lang === "ar";

  const city = state.locationSettings?.city || "";
  const country = state.locationSettings?.country || "";
  const lat = state.locationSettings?.latitude || 0;
  const lon = state.locationSettings?.longitude || 0;

  const findQuery = trpc.specialist.findNearest.useQuery(
    { lat, lon, city, country },
    { enabled: isAuthenticated && (lat !== 0 || city !== "") }
  );

  const browseQuery = trpc.specialist.browse.useQuery(undefined, {
    enabled: isAuthenticated && lat === 0 && city === "",
  });

  const specialists = findQuery.data?.specialists || browseQuery.data || [];
  const fallbackPhones = findQuery.data?.fallbackPhones || [];
  const matchType = findQuery.data?.matchType || "fallback";
  const isLoading = findQuery.isLoading || browseQuery.isLoading;

  const openChat = (specialistId: number, name: string, functionRoles?: string[]) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const rolesParam = functionRoles?.length ? `&roles=${encodeURIComponent(functionRoles.join(","))}` : "";
    router.push(`/specialist-chat?id=${specialistId}&name=${encodeURIComponent(name)}${rolesParam}`);
  };

  const callPhone = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <View style={[s.header, { borderBottomColor: colors.border, flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <MaterialIcons name={isRTL ? "chevron-right" : "chevron-left"} size={28} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.foreground, textAlign: isRTL ? "right" : "left" }]}>
          {tx(lang, "Persoon met kennis", "Person of knowledge", "أهل العلم")}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Intro */}
        <View style={[s.introCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <MaterialIcons name="menu-book" size={32} color="#2E7D32" />
          <Text style={[s.introText, { color: colors.foreground, textAlign: isRTL ? "right" : "left" }]}>
            {tx(lang,
              "Hier kun je contact opnemen met een persoon van kennis die jouw analyse en die van je kinderen kan inzien en je kan begeleiden.",
              "Here you can contact a person of knowledge who can view your analysis and your children's analysis and guide you.",
              "هنا يمكنك التواصل مع أهل العلم الذين يمكنهم الاطلاع على تحليلك وتحليل أطفالك وإرشادك."
            )}
          </Text>
        </View>

        {/* Location info */}
        {city ? (
          <View style={[s.locationBadge, { backgroundColor: "#E8F5E9", flexDirection: isRTL ? "row-reverse" : "row", alignSelf: isRTL ? "flex-end" : "flex-start" }]}>
            <MaterialIcons name="location-on" size={16} color="#2E7D32" />
            <Text style={{ color: "#2E7D32", fontSize: 13, fontWeight: "500" }}>
              {tx(lang, `Zoeken in: ${city}`, `Searching in: ${city}`, `البحث في: ${city}`)}
            </Text>
          </View>
        ) : null}

        {/* Loading */}
        {isLoading && (
          <View style={s.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[s.loadingText, { color: colors.muted }]}>
              {tx(lang, "Pedagogisch begeleider zoeken...", "Finding educational supervisor...", "جاري البحث عن مشرف تربوي...")}
            </Text>
          </View>
        )}

        {/* Match type indicator */}
        {!isLoading && specialists.length > 0 && (
          <View style={[s.matchBadge, { backgroundColor: matchType === "city" ? "#E8F5E9" : "#FFF3E0", flexDirection: isRTL ? "row-reverse" : "row", alignSelf: isRTL ? "flex-end" : "flex-start" }]}>
            <MaterialIcons
              name={matchType === "city" ? "location-city" : "near-me"}
              size={16}
              color={matchType === "city" ? "#2E7D32" : "#E65100"}
            />
            <Text style={{ color: matchType === "city" ? "#2E7D32" : "#E65100", fontSize: 12 }}>
              {matchType === "city"
                ? tx(lang, "Gevonden in jouw stad", "Found in your city", "تم العثور في مدينتك")
                : tx(lang, "Dichtstbijzijnde pedagogisch begeleider", "Nearest educational supervisor", "أقرب مشرف تربوي")}
            </Text>
          </View>
        )}

        {/* Specialist cards */}
        {!isLoading && specialists.map((spec: any, idx: number) => (
          <View key={spec.id || idx} style={[s.specialistCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[s.specialistHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <View style={s.avatar}>
                <MaterialIcons name="person" size={28} color="#fff" />
              </View>
              <View style={{ flex: 1, marginLeft: isRTL ? 0 : 12, marginRight: isRTL ? 12 : 0 }}>
                <Text style={[s.specialistName, { color: colors.foreground, textAlign: isRTL ? "right" : "left" }]}>
                  {spec.displayName || spec.user?.name || tx(lang, "Pedagogisch begeleider", "Educational Supervisor", "مشرف تربوي")}
                </Text>
                <View style={[s.locationRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                  <MaterialIcons name="location-on" size={14} color={colors.muted} />
                  <Text style={[s.locationText, { color: colors.muted }]}>
                    {[spec.city, spec.country].filter(Boolean).join(", ") || tx(lang, "Locatie onbekend", "Location unknown", "الموقع غير معروف")}
                  </Text>
                </View>
                {spec.distance !== undefined && (
                  <Text style={{ fontSize: 11, color: colors.muted }}>
                    {spec.distance < 1 ? "< 1 km" : `~${Math.round(spec.distance)} km`}
                  </Text>
                )}
              </View>
              {spec.verified && (
                <MaterialIcons name="verified" size={20} color="#2E7D32" />
              )}
            </View>

            {/* Function roles (father/mother/imam/doctor/etc.) */}
            {Array.isArray(spec.functionRoles) && spec.functionRoles.length > 0 && (
              <View style={[s.expertiseRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                {spec.functionRoles.map((role: string) => (
                  <View key={role} style={s.roleTag}>
                    <Text style={s.roleText}>{getFunctionRoleLabel(role, lang as "ar" | "en" | "nl")}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Expertise */}
            {spec.expertise && (
              <View style={[s.expertiseRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                {(typeof spec.expertise === "string" ? JSON.parse(spec.expertise) : spec.expertise)?.slice(0, 3).map((exp: string, i: number) => (
                  <View key={i} style={s.expertiseTag}>
                    <Text style={s.expertiseText}>{exp}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Bio */}
            {spec.bio && (
              <Text style={[s.bioText, { color: colors.muted, textAlign: isRTL ? "right" : "left" }]} numberOfLines={2}>
                {spec.bio}
              </Text>
            )}

            {/* Actions */}
            <View style={[s.actionRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <TouchableOpacity
                style={[s.chatBtn, { backgroundColor: "#2E7D32", flexDirection: isRTL ? "row-reverse" : "row" }]}
                onPress={() => openChat(spec.userId || spec.user?.id, spec.displayName || spec.user?.name || "Educational Supervisor", spec.functionRoles)}
              >
                <MaterialIcons name="chat" size={18} color="#fff" />
                <Text style={s.chatBtnText}>
                  {tx(lang, "Bericht", "Message", "رسالة")}
                </Text>
              </TouchableOpacity>

              {spec.phone && (
                <TouchableOpacity
                  style={[s.phoneBtn, { borderColor: "#2E7D32", flexDirection: isRTL ? "row-reverse" : "row" }]}
                  onPress={() => callPhone(spec.phone)}
                >
                  <MaterialIcons name="phone" size={18} color="#2E7D32" />
                  <Text style={[s.phoneBtnText, { color: "#2E7D32" }]}>
                    {tx(lang, "Bellen", "Call", "اتصال")}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))}

        {/* Fallback: No specialists found, show phone numbers */}
        {!isLoading && specialists.length === 0 && (
          <View style={[s.fallbackCard, { backgroundColor: "#FFF3E0", borderColor: "#FF980030" }]}>
            <MaterialIcons name="info-outline" size={24} color="#E65100" />
            <Text style={[s.fallbackTitle, { textAlign: isRTL ? "right" : "left" }]}>
              {tx(lang,
                "Geen pedagogisch begeleider beschikbaar in jouw regio",
                "No educational supervisor available in your region",
                "لا يوجد مشرف تربوي متاح في منطقتك"
              )}
            </Text>
            <Text style={[s.fallbackDesc, { textAlign: isRTL ? "right" : "left" }]}>
              {tx(lang,
                "Je kunt contact opnemen met een van de volgende personen van kennis:",
                "You can contact one of the following persons of knowledge:",
                "يمكنك التواصل مع أحد أهل العلم التاليين:"
              )}
            </Text>

            {fallbackPhones.length > 0 ? (
              fallbackPhones.map((fp: any, idx: number) => (
                <TouchableOpacity
                  key={idx}
                  style={[s.phoneCard, { flexDirection: isRTL ? "row-reverse" : "row" }]}
                  onPress={() => callPhone(fp.phone)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={s.phoneName}>{fp.name || "Educational Supervisor"}</Text>
                    <Text style={s.phoneLocation}>{[fp.city, fp.country].filter(Boolean).join(", ")}</Text>
                    <Text style={s.phoneNumber}>{fp.phone}</Text>
                  </View>
                  <MaterialIcons name="phone" size={24} color="#2E7D32" />
                </TouchableOpacity>
              ))
            ) : (
              <Text style={[s.noPhoneText, { textAlign: isRTL ? "right" : "left" }]}>
                {tx(lang,
                  "Er zijn momenteel geen pedagogisch begeleiders geregistreerd. Probeer het later opnieuw.",
                  "There are currently no educational supervisors registered. Please try again later.",
                  "لا يوجد مشرفون تربويّون مسجلون حالياً. يرجى المحاولة لاحقاً."
                )}
              </Text>
            )}
          </View>
        )}

        {/* Retry button */}
        {!isLoading && specialists.length === 0 && (
          <TouchableOpacity
            style={[s.retryBtn, { backgroundColor: colors.primary, flexDirection: isRTL ? "row-reverse" : "row" }]}
            onPress={() => { findQuery.refetch(); browseQuery.refetch(); }}
          >
            <MaterialIcons name="refresh" size={20} color="#fff" />
            <Text style={s.retryText}>
              {tx(lang, "Opnieuw zoeken", "Search again", "البحث مجدداً")}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const s = StyleSheet.create({
  header: { alignItems: "center", paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 0.5 },
  backBtn: { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "700" },
  introCard: { borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, alignItems: "center", gap: 10 },
  introText: { fontSize: 14, lineHeight: 22 },
  locationBadge: { alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginBottom: 12 },
  loadingContainer: { alignItems: "center", gap: 12, paddingVertical: 40 },
  loadingText: { fontSize: 14 },
  matchBadge: { alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginBottom: 12 },
  specialistCard: { borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1 },
  specialistHeader: { alignItems: "center", marginBottom: 10 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#2E7D32", justifyContent: "center", alignItems: "center" },
  specialistName: { fontSize: 16, fontWeight: "700" },
  locationRow: { alignItems: "center", gap: 4, marginTop: 2 },
  locationText: { fontSize: 12 },
  expertiseRow: { flexWrap: "wrap", gap: 6, marginBottom: 8 },
  expertiseTag: { backgroundColor: "#E8F5E9", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  expertiseText: { fontSize: 11, color: "#2E7D32", fontWeight: "500" },
  roleTag: { backgroundColor: "#E3F2FD", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  roleText: { fontSize: 11, color: "#1565C0", fontWeight: "500" },
  bioText: { fontSize: 13, lineHeight: 19, marginBottom: 12 },
  actionRow: { gap: 10, marginTop: 4 },
  chatBtn: { alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  chatBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  phoneBtn: { alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5 },
  phoneBtnText: { fontWeight: "600", fontSize: 14 },
  fallbackCard: { borderRadius: 16, padding: 16, borderWidth: 1, gap: 10, marginBottom: 16 },
  fallbackTitle: { fontSize: 16, fontWeight: "700", color: "#E65100" },
  fallbackDesc: { fontSize: 13, color: "#795548" },
  phoneCard: { alignItems: "center", backgroundColor: "#fff", borderRadius: 12, padding: 12, marginTop: 8 },
  phoneName: { fontSize: 15, fontWeight: "600", color: "#1a1a1a" },
  phoneLocation: { fontSize: 12, color: "#666", marginTop: 2 },
  phoneNumber: { fontSize: 14, color: "#2E7D32", fontWeight: "500", marginTop: 4 },
  noPhoneText: { fontSize: 13, color: "#795548", marginTop: 8 },
  retryBtn: { alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12, marginTop: 8 },
  retryText: { color: "#fff", fontWeight: "600", fontSize: 15 },
});
