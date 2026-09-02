import React from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/use-colors";
import { useAppState } from "@/lib/app-context";
import { calculateAgeInWeeks, isProfileComplete } from "@/lib/store";
import { DateTimeHeader } from "@/components/date-time-header";
import { useI18n } from "@/lib/i18n";
import { ReportAiContent } from "@/components/report-ai-content";
import { TreatmentPlanRenderer } from "@/components/treatment-plan-renderer";
import { cleanTreatmentText } from "@/lib/plan-text";
import { PremiumNotice, PremiumGate, usePremiumGate } from "@/components/premium-notice";

export default function TreatmentsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { state, loading } = useAppState();
  const { t, language, isRTL } = useI18n();
  // Hooks must run unconditionally: this sits above the early returns below so
  // the hook count stays constant when `loading`/onboarding flags flip.
  const { subscribed: _psub } = usePremiumGate();

  if (loading) {
    return (
      <View
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: colors.background }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!isProfileComplete({ parentProfile: state.parentProfile, children: state.children })) {
    setTimeout(() => router.replace("/onboarding"), 0);
    return (
      <View
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: colors.background }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!state.parentProfileCompleted) {
    return (
      <View
        className="flex-1 justify-center px-6"
        style={{ backgroundColor: colors.background, paddingTop: insets.top }}
      >
        <View
          className="rounded-2xl p-6"
          style={{
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.primary + "40",
          }}
        >
          <Text
            className="text-xl font-bold mb-3"
            style={{ color: colors.foreground }}
          >
            {t("treatments.fill_profile")}
          </Text>
          <Text
            className="text-sm leading-5 mb-6"
            style={{ color: colors.muted }}
          >
            {t("treatments.fill_profile_desc")}
          </Text>
          <Pressable
            onPress={() => router.push("/onboarding/parent-profile")}
            style={({ pressed }) => [
              {
                backgroundColor: colors.primary,
                borderRadius: 12,
                paddingVertical: 14,
                alignItems: "center" as const,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Text className="text-white text-base font-bold">
              {t("treatments.go_profile")}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const allIssues = state.issues || [];
  const openIssues = allIssues.filter((i) => !i.resolved);
  const resolvedIssues = allIssues.filter((i) => i.resolved);
  const dateLocale =
    language === "ar" ? "ar-SA" : language === "en" ? "en-GB" : "nl-NL";

  // Gate while loading too (see weekly.tsx): don't flash the full plan to a
  // non-subscriber during the status fetch. PremiumGate renders null while loading.
  if (!_psub) return <PremiumGate>{null as any}</PremiumGate>;

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top }}>
        <DateTimeHeader />
      </View>
      <PremiumNotice />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingTop: 16,
          paddingBottom: insets.bottom + 100,
          paddingHorizontal: 20,
        }}
      >
        {/* Header */}
        <View className="mb-6">
          <Text
            className="text-2xl font-bold"
            style={{ color: colors.foreground }}
          >
            {t("treatments.title")}
          </Text>
          <Text className="text-sm mt-1" style={{ color: colors.muted }}>
            {t("treatments.subtitle")}
          </Text>
        </View>

        {/* CMS Content Link */}
        <Pressable
          onPress={() => router.push("/content/treatments" as any)}
          style={({ pressed }) => [
            {
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.primary + "30",
              borderRadius: 12,
              padding: 14,
              marginBottom: 16,
              flexDirection: isRTL ? "row-reverse" : "row",
              alignItems: "center" as const,
              gap: 10,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <Text style={{ fontSize: 22 }}>{"\ud83d\udcdd"}</Text>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: colors.foreground,
                fontSize: 14,
                fontWeight: "600",
              }}
            >
              {language === "ar"
                ? "\u0645\u0642\u0627\u0644\u0627\u062a \u0648\u0646\u0635\u0627\u0626\u062d"
                : language === "en"
                  ? "Articles & Tips"
                  : "Artikelen & Tips"}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {language === "ar"
                ? "\u0627\u0637\u0644\u0639 \u0639\u0644\u0649 \u0627\u0644\u0645\u062d\u062a\u0648\u0649 \u0627\u0644\u0645\u062a\u0639\u0644\u0642 \u0628\u0627\u0644\u0639\u0644\u0627\u062c\u0627\u062a"
                : language === "en"
                  ? "View content related to treatments"
                  : "Bekijk content over behandelingen"}
            </Text>
          </View>
          <Text style={{ color: colors.primary, fontSize: 18 }}>
            {"\u203a"}
          </Text>
        </Pressable>

        {/* Per child treatment section */}
        {state.children.map((child) => {
          const childIssues = allIssues.filter((i) => i.childId === child.id);
          const childOpenIssues = childIssues.filter((i) => !i.resolved);
          const age = child.birthDate
            ? calculateAgeInWeeks(child.birthDate)
            : null;

          return (
            <View key={child.id} className="mb-6">
              <View className="flex-row items-center justify-between mb-3">
                <View className="flex-row items-center gap-2">
                  <Text
                    className="text-base font-bold"
                    style={{ color: colors.foreground }}
                  >
                    {(() => {
                      const n = child.name;
                      const m = n.match(/^(Kind|Child|طفل)\s*(\d+)$/i);
                      if (m) {
                        return language === "ar"
                          ? `طفل ${m[2]}`
                          : language === "en"
                            ? `Child ${m[2]}`
                            : `Kind ${m[2]}`;
                      }
                      return n;
                    })()}
                  </Text>
                  {age && (
                    <Text className="text-xs" style={{ color: colors.muted }}>
                      ({age.years} {t("family.age")})
                    </Text>
                  )}
                </View>
                <Pressable
                  onPress={() => router.push(`/child/${child.id}`)}
                  style={({ pressed }) => [
                    {
                      backgroundColor: colors.error + "15",
                      borderRadius: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <Text
                    className="text-xs font-medium"
                    style={{ color: colors.error }}
                  >
                    {t("treatments.report_issue")}
                  </Text>
                </Pressable>
              </View>

              {childOpenIssues.length === 0 && (
                <View
                  className="rounded-xl p-4"
                  style={{
                    backgroundColor: colors.success + "10",
                    borderWidth: 1,
                    borderColor: colors.success + "30",
                  }}
                >
                  <Text className="text-sm" style={{ color: colors.success }}>
                    {(() => {
                      const n = child.name;
                      const m = n.match(/^(Kind|Child|طفل)\s*(\d+)$/i);
                      const dn = m
                        ? language === "ar"
                          ? `طفل ${m[2]}`
                          : language === "en"
                            ? `Child ${m[2]}`
                            : `Kind ${m[2]}`
                        : n;
                      return language === "ar"
                        ? `لا توجد مشاكل مفتوحة لـ ${dn}`
                        : language === "en"
                          ? `No open issues for ${dn}`
                          : `Geen openstaande issues voor ${dn}`;
                    })()}
                  </Text>
                </View>
              )}

              {childOpenIssues.map((issue) => (
                <View
                  key={issue.id}
                  className="rounded-xl p-4 mb-3"
                  style={{
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <View className="flex-row items-center justify-between mb-2">
                    <View
                      className="rounded-full px-2 py-0.5"
                      style={{ backgroundColor: colors.error + "15" }}
                    >
                      <Text
                        className="text-xs font-medium"
                        style={{ color: colors.error }}
                      >
                        {t("treatments.open")}
                      </Text>
                    </View>
                    <Text className="text-xs" style={{ color: colors.muted }}>
                      {new Date(issue.createdAt).toLocaleDateString(dateLocale)}
                    </Text>
                  </View>

                  <Text
                    className="text-sm font-medium mb-2"
                    style={{ color: colors.foreground }}
                  >
                    {issue.description}
                  </Text>

                  {issue.treatmentPlan && (
                    <View
                      className="mt-2 rounded-lg p-3"
                      style={{ backgroundColor: colors.primary + "08" }}
                    >
                      <Text
                        className="text-xs font-bold mb-1"
                        style={{ color: colors.primary }}
                      >
                        {t("treatments.plan")}:
                      </Text>
                      <TreatmentPlanRenderer
                        planText={cleanTreatmentText(issue.treatmentPlan, language)}
                        issueId={issue.id}
                        colors={colors}
                      />
                      <ReportAiContent
                        content={issue.treatmentPlan}
                        surface="treatments-saved-plan"
                      />
                    </View>
                  )}

                  <Pressable
                    onPress={() => router.push(`/child/${child.id}`)}
                    style={({ pressed }) => [
                      {
                        backgroundColor: colors.primary,
                        borderRadius: 8,
                        paddingVertical: 10,
                        alignItems: "center",
                        marginTop: 12,
                        opacity: pressed ? 0.8 : 1,
                      },
                    ]}
                  >
                    <Text
                      className="text-xs font-bold"
                      style={{ color: "#fff" }}
                    >
                      {t("treatments.view_plan")}
                    </Text>
                  </Pressable>
                </View>
              ))}
            </View>
          );
        })}

        {/* Resolved issues section */}
        {resolvedIssues.length > 0 && (
          <View className="mt-4">
            <Text
              className="text-base font-bold mb-3"
              style={{ color: colors.muted }}
            >
              {t("treatments.resolved_section")} ({resolvedIssues.length})
            </Text>
            {resolvedIssues.map((issue) => {
              const child = state.children.find((c) => c.id === issue.childId);
              return (
                <View
                  key={issue.id}
                  className="rounded-xl p-4 mb-2"
                  style={{
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.success + "30",
                  }}
                >
                  <View className="flex-row items-center gap-2">
                    <View
                      className="rounded-full px-2 py-0.5"
                      style={{ backgroundColor: colors.success + "15" }}
                    >
                      <Text
                        className="text-xs font-medium"
                        style={{ color: colors.success }}
                      >
                        {t("treatments.resolved")}
                      </Text>
                    </View>
                    <Text className="text-xs" style={{ color: colors.muted }}>
                      {child?.name}
                    </Text>
                  </View>
                  <Text
                    className="text-xs mt-1"
                    style={{ color: colors.muted }}
                  >
                    {issue.description.length > 80
                      ? issue.description.substring(0, 80) + "..."
                      : issue.description}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {state.children.length === 0 && (
          <View className="items-center py-10">
            <Text className="text-base" style={{ color: colors.muted }}>
              {t("treatments.no_children")}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
