import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
} from "react-native";
import { DatePicker } from "@/components/date-picker";
import { TreatmentPlanRenderer } from "@/components/treatment-plan-renderer";
import { cachePlanProgress, withPlanStore } from "@/lib/plan-progress";
import {
  ArchivableIssue,
  consultationArchiveKey,
  consultationMessages,
  consultationTitle,
  findArchivedRow,
} from "@/lib/consultation-archive";
import { ReportAiContent } from "@/components/report-ai-content";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/use-colors";
import { useAppState } from "@/lib/app-context";
import { useI18n } from "@/lib/i18n";
import {
  calculateAgeInWeeks,
  getYearKey,
  getWeekInYear,
  Issue,
} from "@/lib/store";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/use-auth";

type Lang = "nl" | "en" | "ar";

function tx(lang: Lang, nl: string, en: string, ar: string): string {
  return lang === "ar" ? ar : lang === "en" ? en : nl;
}

export default function ChildDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t, language } = useI18n();
  const { state, addIssue, updateChild, removeIssue, updateIssue } =
    useAppState();
  const lang: Lang = language as Lang;
  const isRTL = lang === "ar";

  const child = state.children.find((c) => c.id === id);
  const env = state.environments.find((e) => e.childId === id);
  const issues = state.issues.filter((i) => i.childId === id);

  /**
   * Issues the running diagnosis is archiving itself. Saving the issue re-runs
   * the backfill below before the diagnosis has archived it, and at that moment
   * the consultation is in neither the server's list nor storage — so without
   * this claim both paths would archive it and the parent would see it twice.
   */
  const liveArchiving = useRef<Set<string>>(new Set());

  /**
   * Records one consultation in the advisor archive. Only an issue that actually
   * produced a plan is archived, so a failed request never inflates the owner's
   * consultation count. Re-diagnosing the same issue updates its entry rather
   * than appending a second one.
   */
  const archiveConsultation = async (issue: ArchivableIssue) => {
    if (!issue.treatmentPlan || !child) return;
    const key = consultationArchiveKey(issue.id);
    const knownDbId = await AsyncStorage.getItem(key);
    const res = await authedFetch(`/api/trpc/aiChat.saveConversationToDb`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        json: {
          dbId: knownDbId ? Number(knownDbId) : undefined,
          deviceId: await getDeviceId(),
          consultationType: "child",
          childId: child.id,
          // ai-chat.tsx filters the per-child archive on this name.
          childName: child.name,
          language,
          title: consultationTitle(issue.description),
          messages: consultationMessages(issue),
        },
      }),
    });
    const savedDbId = (await res.json())?.result?.data?.json?.dbId;
    if (savedDbId && !knownDbId) {
      await AsyncStorage.setItem(key, String(savedDbId));
    }
  };

  /**
   * Consultations held before v1.4.88 were never recorded — the advisor stored
   * the plan as a local issue and stopped there, so this child's archive looked
   * empty however many times the parent had consulted. The issue still holds the
   * problem, the questions and the plan, which is the whole consultation, so
   * they are archived retroactively. Each issue is marked once, so this settles
   * after a single pass and costs nothing on later opens.
   */
  useEffect(() => {
    if (!child) return;
    let cancelled = false;
    (async () => {
      // The partner's own consultations sync into this child's issues. They
      // belong to the partner's archive and their device, not to this one.
      const pending = issues.filter(
        (i) => i.treatmentPlan && !i.syncedFromPartner,
      );
      if (pending.length === 0) return;
      // Once every consultation has been archived this screen costs nothing to
      // open, so work out what is actually missing before asking the server.
      const missing = [];
      for (const issue of pending) {
        if (!(await AsyncStorage.getItem(consultationArchiveKey(issue.id)))) {
          missing.push(issue);
        }
      }
      if (missing.length === 0 || cancelled) return;
      // What this device has already archived. Without this a consultation whose
      // dbId was lost to a dropped response would be archived again on every
      // open, and the parent would find the same consultation several times over.
      let archived: {
        dbId: number;
        title: string;
        childName: string;
        messageCount: number;
      }[];
      try {
        const deviceId = await getDeviceId();
        const res = await authedFetch(
          `/api/trpc/aiChat.listConversationsFromDb?input=${encodeURIComponent(
            JSON.stringify({ json: { deviceId } }),
          )}`,
        );
        const rows = (await res.json())?.result?.data?.json;
        // The list only exists to match back a consultation whose dbId was lost
        // to a dropped response. Returning outright when it could not be read
        // meant one transient 500 archived nothing at all and said nothing, so
        // proceed with an empty list instead.
        //
        // A signed-out device really can fail here, but only against the server
        // that is actually deployed: rabbaanie-api declares
        // listConversationsFromDb as a protectedProcedure, while server/ in this
        // repo still has it as publicProcedure. Reading only the repo says an
        // expired session cannot fail this call; reading production says it can.
        // The app talks to production, so it can.
        //
        // It is still not the reason Daa3iyah's archive is empty. He has no
        // consultations on the server at all — the six that were there belong to
        // another family — so nothing was hidden, it was never written.
        //
        // Cost of proceeding: if a previous POST stored a row but its response
        // was lost, no archive key was written, and a later failed list makes
        // findArchivedRow miss and post it a second time. A duplicate row in
        // that narrow case beats the pass dying whole.
        archived = res.ok && Array.isArray(rows) ? rows : [];
      } catch {
        archived = [];
      }
      for (const issue of missing) {
        if (cancelled) return;
        if (liveArchiving.current.has(issue.id)) continue;
        const key = consultationArchiveKey(issue.id);
        // Re-read: a live diagnosis may have archived this issue and released its
        // claim since the list above was taken.
        if (await AsyncStorage.getItem(key)) continue;
        // Claim before the next await, so a second run of this effect cannot pass
        // the same checks and archive this issue alongside us.
        liveArchiving.current.add(issue.id);
        try {
          const existing = findArchivedRow(
            archived,
            child.name,
            consultationTitle(issue.description),
            consultationMessages(issue).length,
          );
          if (existing !== null) {
            await AsyncStorage.setItem(key, String(existing));
            // One row belongs to one consultation. Leaving it in the list would
            // let a second issue with the same opening line claim it too, and the
            // next re-diagnosis would overwrite the first one's transcript.
            archived = archived.filter((row) => row.dbId !== existing);
            continue;
          }
          await archiveConsultation(issue);
        } catch {
          // Offline or server down: leave it unmarked and retry on next open.
        } finally {
          liveArchiving.current.delete(issue.id);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [child?.id, issues.length]);

  const [showIssueForm, setShowIssueForm] = useState(false);
  const [issueText, setIssueText] = useState("");
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [treatmentPlan, setTreatmentPlan] = useState<string | null>(null);
  const [advisorStep, setAdvisorStep] = useState<
    "describe" | "questions" | "result"
  >("describe");
  const [advisorQuestions, setAdvisorQuestions] = useState<string[]>([]);
  const [advisorAnswers, setAdvisorAnswers] = useState<string[]>([]);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [loadingNextQuestion, setLoadingNextQuestion] = useState(false);
  const [rootCauseFound, setRootCauseFound] = useState(false);
  const [rootCauseMessage, setRootCauseMessage] = useState<string | null>(null);
  const [checkingRootCause, setCheckingRootCause] = useState(false);
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null);
  const [reopenIssueId, setReopenIssueId] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState(
    !child?.profileCompleted || child?.laterInvullen || !child?.birthDate
      ? true
      : false,
  );
  const [editName, setEditName] = useState(child?.name || "");
  const [editBirthDate, setEditBirthDate] = useState(child?.birthDate || "");
  const [editGender, setEditGender] = useState(child?.gender || "");
  const { isAuthenticated } = useAuth();
  const notifyPartnerMutation =
    trpc.profile.notifyTreatmentPlanUpdate.useMutation();

  if (!child) {
    return (
      <View
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: colors.background }}
      >
        <Text style={{ color: colors.muted }}>
          {tx(
            lang,
            "Kind niet gevonden",
            "Child not found",
            "لم يتم العثور على الطفل",
          )}
        </Text>
      </View>
    );
  }

  // Translate default child names to current language
  const displayName = (() => {
    const match = child.name.match(/^(Kind|Child|\u0637\u0641\u0644)\s*(\d+)$/);
    if (match) {
      const num = match[2];
      return tx(
        lang,
        `Kind ${num}`,
        `Child ${num}`,
        `\u0637\u0641\u0644 ${num}`,
      );
    }
    return child.name;
  })();

  const age = child.birthDate ? calculateAgeInWeeks(child.birthDate) : null;
  const yearKey = age ? getYearKey(age.years) : null;
  const weekInYear = age ? getWeekInYear(age.totalWeeks, age.years) : null;

  // Step 1: Generate analytical questions based on the issue description
  const MAX_QUESTIONS = 10; // Maximum diagnostic questions before forcing plan generation

  const handleGenerateQuestions = async () => {
    if (!issueText.trim()) {
      Alert.alert(
        tx(lang, "Fout", "Error", "خطأ"),
        tx(
          lang,
          "Beschrijf het probleem voordat u het indient.",
          "Describe the problem before submitting.",
          "يرجى وصف المشكلة قبل الإرسال.",
        ),
      );
      return;
    }
    setGeneratingPlan(true);
    try {
      const response = await authedFetch(`/api/advice/treatment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          childName: child.name,
          childAge: age
            ? tx(
                lang,
                `${age.years} jaar en ${age.months} maanden`,
                `${age.years} years and ${age.months} months`,
                `${age.years} سنة و${age.months} أشهر`,
              )
            : tx(lang, "onbekend", "unknown", "غير معروف"),
          childGender:
            child.gender || tx(lang, "onbekend", "unknown", "غير معروف"),
          yearKey: yearKey || tx(lang, "onbekend", "unknown", "غير معروف"),
          weekInYear: weekInYear || 0,
          issue: issueText,
          language,
          environment: env || null,
          parentProfile: state.parentProfile,
          mode: "questions",
        }),
      });
      const result = await response.json();
      if (result.questions && result.questions.length > 0) {
        // Normalize: single question from server (consultant-style)
        const normalizedQuestions = result.questions
          .map((q: any) => {
            if (typeof q === "string") return q;
            if (typeof q === "object" && q !== null) {
              return (
                q.question ||
                q.text ||
                q.vraag ||
                q.content ||
                Object.values(q)[0] ||
                ""
              );
            }
            return String(q);
          })
          .filter((q: string) => q.length > 5);
        if (normalizedQuestions.length > 0) {
          setAdvisorQuestions([normalizedQuestions[0]]); // Only first question
          setAdvisorAnswers([""]);
          setAdvisorStep("questions");
        } else {
          handleSubmitWithAnswers([]);
        }
      } else {
        handleSubmitWithAnswers([]);
      }
    } catch (error) {
      Alert.alert(
        tx(lang, "Fout", "Error", "خطأ"),
        tx(
          lang,
          "Er is een fout opgetreden.",
          "An error occurred.",
          "حدث خطأ. يُرجى المحاولة مرة أخرى.",
        ),
      );
    } finally {
      setGeneratingPlan(false);
    }
  };

  // Step 2: Submit answers and get the full treatment plan
  const handleSubmitWithAnswers = async (answers: string[]) => {
    setGeneratingPlan(true);
    let claimedIssueId: string | null = null;
    try {
      const response = await authedFetch(`/api/advice/treatment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          childName: child.name,
          childAge: age
            ? tx(
                lang,
                `${age.years} jaar en ${age.months} maanden`,
                `${age.years} years and ${age.months} months`,
                `${age.years} سنة و${age.months} أشهر`,
              )
            : tx(lang, "onbekend", "unknown", "غير معروف"),
          childGender:
            child.gender || tx(lang, "onbekend", "unknown", "غير معروف"),
          yearKey: yearKey || tx(lang, "onbekend", "unknown", "غير معروف"),
          weekInYear: weekInYear || 0,
          issue: issueText,
          language,
          environment: env || null,
          parentProfile: state.parentProfile,
          mode: "plan",
          analyticalQA: advisorQuestions.map((q, i) => ({
            question: q,
            answer: answers[i] || "",
          })),
        }),
      });
      const result = await response.json();
      setTreatmentPlan(result.plan);
      setAdvisorStep("result");

      const qaHistory = advisorQuestions.map((q, i) => ({
        question: q,
        answer: answers[i] || "",
      }));
      const isUpdate = !!reopenIssueId;
      let consultationIssueId: string;
      if (reopenIssueId) {
        // Update existing issue with new diagnosis
        consultationIssueId = reopenIssueId;
        claimedIssueId = consultationIssueId;
        liveArchiving.current.add(consultationIssueId);
        await updateIssue(reopenIssueId, {
          treatmentPlan: result.plan,
          analyticalQA: qaHistory,
          updatedAt: new Date().toISOString(),
        });
        setReopenIssueId(null);
      } else {
        const newIssue: Issue = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          childId: child.id,
          description: issueText,
          treatmentPlan: result.plan,
          createdAt: new Date().toISOString(),
          resolved: false,
          analyticalQA: qaHistory,
        };
        consultationIssueId = newIssue.id;
        claimedIssueId = consultationIssueId;
        liveArchiving.current.add(consultationIssueId);
        await addIssue(newIssue);
      }

      // Record the consultation itself, so it appears in the advisor archive
      // (المحادثات السابقة — both the full list and when filtered to this child)
      // and is counted in the owner report. Without this the plan existed only as
      // a local issue. The plan itself keeps rendering on this page through the
      // issue cards; this is about the archive, not a second copy on screen.
      try {
        await archiveConsultation({
          id: consultationIssueId,
          description: issueText,
          treatmentPlan: result.plan,
          analyticalQA: qaHistory,
        });
      } catch (archiveErr) {
        console.error("Error archiving consultation:", archiveErr);
      } finally {
        liveArchiving.current.delete(consultationIssueId);
      }

      // Notify partner about treatment plan creation/update
      if (isAuthenticated && child.name && child.birthDate) {
        notifyPartnerMutation.mutate({
          childName: child.name,
          childBirthDate: child.birthDate,
          issueTitle: issueText.substring(0, 80),
          isUpdate,
        });
      }
    } catch (error) {
      Alert.alert(
        tx(lang, "Fout", "Error", "خطأ"),
        tx(
          lang,
          "Er is een fout opgetreden bij het genereren van het behandelplan. Probeer het opnieuw.",
          "An error occurred while generating the treatment plan. Please try again.",
          "حدث خطأ أثناء إعداد خطة العلاج. يُرجى المحاولة مرة أخرى.",
        ),
      );
    } finally {
      setGeneratingPlan(false);
      // If saving the issue threw, its claim was never released, and the backfill
      // would keep skipping that consultation for as long as this screen is open.
      // Only this diagnosis's own claim — the backfill holds its own.
      if (claimedIssueId) liveArchiving.current.delete(claimedIssueId);
    }
  };

  const resetAdvisor = () => {
    setShowIssueForm(false);
    setIssueText("");
    setAdvisorStep("describe");
    setAdvisorQuestions([]);
    setAdvisorAnswers([]);
    setCurrentQuestionIdx(0);
    setTreatmentPlan(null);
    setRootCauseFound(false);
    setRootCauseMessage(null);
    setCheckingRootCause(false);
    setReopenIssueId(null);
  };

  // Reopen an existing issue for re-diagnosis
  const handleReopenIssue = (issue: Issue) => {
    setReopenIssueId(issue.id);
    setIssueText(issue.description);
    setShowIssueForm(true);
    setAdvisorStep("describe");
    setAdvisorQuestions([]);
    setAdvisorAnswers([]);
    setCurrentQuestionIdx(0);
    setTreatmentPlan(null);
    setRootCauseFound(false);
    setRootCauseMessage(null);
    setCheckingRootCause(false);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      <ScrollView
        className="flex-1"
        style={{ backgroundColor: colors.background }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 40,
          paddingHorizontal: 20,
        }}
      >
        {/* Back button */}
        <Pressable onPress={() => router.back()} className="mb-4">
          <Text className="text-base" style={{ color: colors.primary }}>
            {tx(lang, "\u2190 Terug", "\u2190 Back", "\u2190 رجوع")}
          </Text>
        </Pressable>

        {/* Child header */}
        <View className="mb-6">
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Text
              className="text-2xl font-bold"
              style={{ color: colors.foreground, flex: 1 }}
            >
              {displayName}
            </Text>
            <Pressable
              onPress={() => setEditingProfile(!editingProfile)}
              style={({ pressed }) => [
                {
                  opacity: pressed ? 0.7 : 1,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 8,
                  backgroundColor: editingProfile
                    ? colors.error + "15"
                    : colors.primary + "15",
                },
              ]}
            >
              <Text
                style={{
                  color: editingProfile ? colors.error : colors.primary,
                  fontSize: 13,
                  fontWeight: "600",
                }}
              >
                {editingProfile
                  ? tx(lang, "Annuleer", "Cancel", "إلغاء")
                  : tx(lang, "Bewerk profiel", "Edit profile", "تعديل الملف")}
              </Text>
            </Pressable>
          </View>
          {/* ═══════ READ-ONLY PROFILE SUMMARY ═══════ */}
          {!editingProfile && child.profileCompleted && (
            <View
              style={{
                marginTop: 12,
                backgroundColor: colors.surface,
                borderRadius: 12,
                padding: 16,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              {/* Name */}
              <View
                style={{
                  flexDirection: isRTL ? "row-reverse" : "row",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 10,
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: colors.primary + "15",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ fontSize: 16 }}>
                    {child.gender === "jongen"
                      ? "👦"
                      : child.gender === "meisje"
                        ? "👧"
                        : "👶"}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "700",
                      color: colors.foreground,
                      textAlign: isRTL ? "right" : "left",
                    }}
                  >
                    {displayName}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: colors.muted,
                      marginTop: 2,
                      textAlign: isRTL ? "right" : "left",
                    }}
                  >
                    {child.gender === "jongen"
                      ? tx(lang, "Jongen", "Boy", "ذكر")
                      : child.gender === "meisje"
                        ? tx(lang, "Meisje", "Girl", "أنثى")
                        : tx(lang, "Onbekend", "Unknown", "غير محدد")}
                  </Text>
                </View>
              </View>
              {/* Birth date */}
              {child.birthDate && (
                <View
                  style={{
                    flexDirection: isRTL ? "row-reverse" : "row",
                    justifyContent: "space-between",
                    paddingVertical: 6,
                    borderTopWidth: 1,
                    borderTopColor: colors.border,
                  }}
                >
                  <Text style={{ color: colors.muted, fontSize: 12 }}>
                    {tx(
                      lang,
                      "Geboortedatum",
                      "Date of birth",
                      "تاريخ الميلاد",
                    )}
                  </Text>
                  <Text
                    style={{
                      color: colors.foreground,
                      fontSize: 12,
                      fontWeight: "600",
                    }}
                  >
                    {child.birthDate}
                  </Text>
                </View>
              )}
              {/* Age */}
              {age && (
                <View
                  style={{
                    flexDirection: isRTL ? "row-reverse" : "row",
                    justifyContent: "space-between",
                    paddingVertical: 6,
                    borderTopWidth: 1,
                    borderTopColor: colors.border,
                  }}
                >
                  <Text style={{ color: colors.muted, fontSize: 12 }}>
                    {tx(lang, "Leeftijd", "Age", "العمر")}
                  </Text>
                  <Text
                    style={{
                      color: colors.foreground,
                      fontSize: 12,
                      fontWeight: "600",
                    }}
                  >
                    {tx(
                      lang,
                      `${age.years} jaar, ${age.months} maanden`,
                      `${age.years} years, ${age.months} months`,
                      `${age.years} سنة، ${age.months} أشهر`,
                    )}
                  </Text>
                </View>
              )}
              {/* Week info */}
              {yearKey && weekInYear && (
                <View
                  style={{
                    flexDirection: isRTL ? "row-reverse" : "row",
                    justifyContent: "space-between",
                    paddingVertical: 6,
                    borderTopWidth: 1,
                    borderTopColor: colors.border,
                  }}
                >
                  <Text style={{ color: colors.muted, fontSize: 12 }}>
                    {tx(lang, "Weekplan", "Week plan", "الخطة الأسبوعية")}
                  </Text>
                  <Text
                    style={{
                      color: colors.foreground,
                      fontSize: 12,
                      fontWeight: "600",
                    }}
                  >
                    {tx(
                      lang,
                      `${yearKey} — Week ${weekInYear}`,
                      `${yearKey ? yearKey.replace("Jaar", "Year") : ""} — Week ${weekInYear}`,
                      `${yearKey ? yearKey.replace("Jaar ", "") : ""} — الأسبوع ${weekInYear}`,
                    )}
                  </Text>
                </View>
              )}
              {/* Public ID */}
              {(child as any).publicId && (
                <View
                  style={{
                    flexDirection: isRTL ? "row-reverse" : "row",
                    justifyContent: "space-between",
                    paddingVertical: 6,
                    borderTopWidth: 1,
                    borderTopColor: colors.border,
                  }}
                >
                  <Text style={{ color: colors.muted, fontSize: 12 }}>
                    {tx(lang, "ID", "ID", "الهوية")}
                  </Text>
                  <Text
                    style={{
                      color: colors.primary,
                      fontSize: 12,
                      fontWeight: "700",
                      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                    }}
                  >
                    {(child as any).publicId}
                  </Text>
                </View>
              )}
            </View>
          )}
          {/* Simple info when profile not completed */}
          {!editingProfile && !child.profileCompleted && (
            <View style={{ marginTop: 6 }}>
              {(child as any).publicId && (
                <View
                  style={{
                    flexDirection: isRTL ? "row-reverse" : "row",
                    alignItems: "center",
                    gap: 6,
                    marginTop: 6,
                    backgroundColor: colors.primary + "08",
                    borderRadius: 6,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    alignSelf: isRTL ? "flex-end" : "flex-start",
                  }}
                >
                  <Text style={{ color: colors.muted, fontSize: 10 }}>
                    {tx(lang, "ID:", "ID:", "الهوية:")}
                  </Text>
                  <Text
                    style={{
                      color: colors.primary,
                      fontSize: 12,
                      fontWeight: "700",
                      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                    }}
                  >
                    {(child as any).publicId}
                  </Text>
                </View>
              )}
              {age && (
                <Text
                  className="text-base mt-1"
                  style={{ color: colors.muted }}
                >
                  {tx(
                    lang,
                    `${age.years} jaar, ${age.months} maanden \u2014 Week ${weekInYear} van ${yearKey}`,
                    `${age.years} years, ${age.months} months \u2014 Week ${weekInYear} of ${yearKey}`,
                    `${age.years} سنة، ${age.months} أشهر \u2014 الأسبوع ${weekInYear} من ${yearKey}`,
                  )}
                </Text>
              )}
            </View>
          )}
          {/* Editable profile form */}
          {editingProfile && (
            <View
              style={{
                marginTop: 12,
                backgroundColor: colors.surface,
                borderRadius: 12,
                padding: 16,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              {/* Name field */}
              <Text
                style={{
                  color: colors.muted,
                  fontSize: 12,
                  marginBottom: 4,
                  fontWeight: "600",
                }}
              >
                {tx(lang, "Naam", "Name", "الاسم")}
              </Text>
              <TextInput
                value={editName}
                onChangeText={setEditName}
                placeholder={tx(
                  lang,
                  "Naam van het kind",
                  "Child's name",
                  "اسم الطفل",
                )}
                placeholderTextColor={colors.muted}
                style={{
                  backgroundColor: colors.background,
                  borderRadius: 8,
                  padding: 12,
                  fontSize: 15,
                  color: colors.foreground,
                  borderWidth: 1,
                  borderColor: colors.border,
                  marginBottom: 14,
                  textAlign: lang === "ar" ? "right" : "left",
                }}
              />
              {/* Birth date field - Date Picker */}
              <DatePicker
                value={editBirthDate}
                onChange={setEditBirthDate}
                label={tx(
                  lang,
                  "Geboortedatum",
                  "Date of birth",
                  "تاريخ الميلاد",
                )}
                placeholder={tx(
                  lang,
                  "Kies een datum",
                  "Choose a date",
                  "اختر تاريخًا",
                )}
                isRTL={lang === "ar"}
                maxDate={new Date()}
                minDate={new Date(2000, 0, 1)}
              />
              {/* Gender selection */}
              <Text
                style={{
                  color: colors.muted,
                  fontSize: 12,
                  marginBottom: 6,
                  fontWeight: "600",
                }}
              >
                {tx(lang, "Geslacht", "Gender", "الجنس")}
              </Text>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
                <Pressable
                  onPress={() => setEditGender("jongen")}
                  style={({ pressed }) => [
                    {
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: 8,
                      alignItems: "center",
                      borderWidth: 2,
                      borderColor:
                        editGender === "jongen"
                          ? colors.primary
                          : colors.border,
                      backgroundColor:
                        editGender === "jongen"
                          ? colors.primary + "15"
                          : colors.background,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color:
                        editGender === "jongen"
                          ? colors.primary
                          : colors.foreground,
                      fontWeight: "600",
                    }}
                  >
                    {tx(lang, "Jongen", "Boy", "ذكر")}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setEditGender("meisje")}
                  style={({ pressed }) => [
                    {
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: 8,
                      alignItems: "center",
                      borderWidth: 2,
                      borderColor:
                        editGender === "meisje"
                          ? colors.primary
                          : colors.border,
                      backgroundColor:
                        editGender === "meisje"
                          ? colors.primary + "15"
                          : colors.background,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color:
                        editGender === "meisje"
                          ? colors.primary
                          : colors.foreground,
                      fontWeight: "600",
                    }}
                  >
                    {tx(lang, "Meisje", "Girl", "أنثى")}
                  </Text>
                </Pressable>
              </View>
              {/* Save button */}
              <Pressable
                onPress={async () => {
                  if (!child) return;
                  const newName = editName.trim() || child.name;
                  const newBirthDate = editBirthDate || child.birthDate;
                  // Generate deterministic ID from name + birthdate for parent-child linking
                  const newId = `${newName.toLowerCase().replace(/\s+/g, "_")}_${(newBirthDate || "unknown").replace(/-/g, "")}`;
                  await updateChild(child.id, {
                    id: newId,
                    name: newName,
                    birthDate: newBirthDate,
                    gender: editGender as any,
                    profileCompleted: true,
                    laterInvullen: false,
                    parentId:
                      child.parentId ||
                      state.parentProfile?.firstName ||
                      "parent",
                  });
                  setEditingProfile(false);
                  // If ID changed, navigate to the new ID to prevent "not found" error
                  if (newId !== child.id) {
                    router.replace(`/child/${newId}` as any);
                  }
                }}
                style={({ pressed }) => [
                  {
                    backgroundColor: colors.primary,
                    borderRadius: 10,
                    paddingVertical: 12,
                    alignItems: "center",
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text
                  style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}
                >
                  {tx(lang, "Opslaan", "Save", "حفظ")}
                </Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Week plan card */}
        <View
          className="rounded-2xl p-5 mb-4"
          style={{
            backgroundColor: colors.primary + "10",
            borderWidth: 1,
            borderColor: colors.primary + "30",
          }}
        >
          <Text
            className="text-lg font-bold mb-3"
            style={{ color: colors.primary }}
          >
            {tx(
              lang,
              `Weekplan \u2014 ${yearKey || "Leeftijd onbekend"}`,
              `Week plan \u2014 ${yearKey || "Age unknown"}`,
              `الخطة الأسبوعية \u2014 ${yearKey || "العمر غير معروف"}`,
            )}
          </Text>
          <Text
            className="text-sm leading-5 mb-2"
            style={{ color: colors.foreground }}
          >
            {tx(
              lang,
              "Het weekplan voor uw kind wordt gegenereerd op basis van de leeftijd en het opvoedingsprogramma. Elke week bevat doelen in drie fasen:",
              "The week plan for your child is generated based on age and the parenting program. Each week contains goals in three phases:",
              "يُعَدّ البرنامج الأسبوعي لطفلك بناءً على عمره والمنهج التربوي. كل أسبوع يتضمن أهدافًا في ثلاث مراحل:",
            )}
          </Text>
          <View className="ml-2">
            <Text className="text-sm mb-1" style={{ color: colors.foreground }}>
              {"\u2022"}{" "}
              <Text className="font-bold">
                {tx(lang, "Tasfiyah", "Tasfiyah", "التصفية")}
              </Text>{" "}
              ({tx(lang, "verstand vormen", "forming the mind", "تصفية العقل")})
              — 4 {tx(lang, "doelen", "goals", "أهداف")}
            </Text>
            <Text className="text-sm mb-1" style={{ color: colors.foreground }}>
              {"\u2022"}{" "}
              <Text className="font-bold">
                {tx(lang, "Tazkiyah", "Tazkiyah", "التزكية")}
              </Text>{" "}
              ({tx(lang, "hart vormen", "forming the heart", "تزكية القلب")}) —
              5 {tx(lang, "doelen", "goals", "أهداف")}
            </Text>
            <Text className="text-sm mb-1" style={{ color: colors.foreground }}>
              {"\u2022"}{" "}
              <Text className="font-bold">
                {tx(lang, "Tarbiyah", "Tarbiyah", "التربية")}
              </Text>{" "}
              ({tx(lang, "gedrag vormen", "forming behavior", "تربية السلوك")})
              — 6 {tx(lang, "doelen", "goals", "أهداف")}
            </Text>
          </View>

          <Pressable
            onPress={() => router.push(`/child/weekplan?id=${child.id}`)}
            className="rounded-xl py-3 items-center mt-4"
            style={{ backgroundColor: colors.primary }}
          >
            <Text className="text-white font-bold">
              {tx(
                lang,
                "Bekijk volledig weekplan",
                "View full week plan",
                "عرض الخطة الأسبوعية الكاملة",
              )}
            </Text>
          </Pressable>
        </View>

        {/* Environment status - always visible */}
        {env?.completed ? (
          <View
            style={{
              flexDirection: isRTL ? "row-reverse" : "row",
              gap: 10,
              marginBottom: 16,
            }}
          >
            {/* View environment button */}
            <Pressable
              onPress={() => router.push(`/child-profile/${child.id}` as any)}
              style={({ pressed }) => [
                {
                  flex: 1,
                  backgroundColor: colors.success + "10",
                  borderColor: colors.success,
                  borderWidth: 1,
                  borderRadius: 16,
                  padding: 16,
                  alignItems: "center",
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text
                style={{
                  color: colors.success,
                  fontSize: 14,
                  fontWeight: "700",
                }}
              >
                {tx(
                  lang,
                  "Omgeving bekijken",
                  "View environment",
                  "عرض البيئة",
                )}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>
                {tx(
                  lang,
                  "Bekijk de analyse",
                  "View analysis",
                  "اطلع على التحليل",
                )}
              </Text>
            </Pressable>
            {/* Edit environment button */}
            <Pressable
              onPress={() => router.push(`/child/environment?id=${child.id}`)}
              style={({ pressed }) => [
                {
                  flex: 1,
                  backgroundColor: colors.primary + "10",
                  borderColor: colors.primary,
                  borderWidth: 1,
                  borderRadius: 16,
                  padding: 16,
                  alignItems: "center",
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text
                style={{
                  color: colors.primary,
                  fontSize: 14,
                  fontWeight: "700",
                }}
              >
                {tx(
                  lang,
                  "Omgeving bewerken",
                  "Edit environment",
                  "تعديل البيئة",
                )}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>
                {tx(
                  lang,
                  "Werk de analyse bij",
                  "Update analysis",
                  "حدّث التحليل",
                )}
              </Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={() => router.push(`/child/environment?id=${child.id}`)}
            className="rounded-2xl p-5 mb-4 border"
            style={{
              backgroundColor: colors.warning + "10",
              borderColor: colors.warning,
            }}
          >
            <Text
              className="text-base font-bold mb-1"
              style={{ color: colors.warning }}
            >
              {tx(
                lang,
                "Omgevingsanalyse invullen",
                "Fill in environment analysis",
                "إكمال تحليل بيئة الطفل",
              )}
            </Text>
            <Text className="text-sm" style={{ color: colors.foreground }}>
              {tx(
                lang,
                "Vul de omgevingsanalyse in voor specifiekere adviezen",
                "Fill in the environment analysis for more specific advice",
                "أكمل تحليل بيئة الطفل للحصول على نصائح أكثر دقة",
              )}
            </Text>
          </Pressable>
        )}

        {/* Share child data */}
        <Pressable
          onPress={() => router.push(`/child/share?childId=${child.id}`)}
          className="rounded-2xl p-5 mb-4 border"
          style={{
            backgroundColor: colors.primary + "08",
            borderColor: colors.primary + "30",
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          }}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: colors.primary + "15",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 18 }}>📤</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text
              className="text-base font-bold"
              style={{ color: colors.primary }}
            >
              {tx(lang, "Gegevens delen", "Share data", "مشاركة البيانات")}
            </Text>
            <Text className="text-xs" style={{ color: colors.muted }}>
              {tx(
                lang,
                "Deel kindgegevens met leraar, arts of specialist",
                "Share child data with teacher, doctor or specialist",
                "شارك بيانات الطفل مع المعلم أو الطبيب أو المختص",
              )}
            </Text>
          </View>
        </Pressable>

        {/* Advisor Plans for this child */}
        <AdvisorPlansForChild
          childId={child.id}
          childName={displayName}
          lang={lang}
          colors={colors}
        />

        {/* PDF Export & Chat Notes */}
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
          <Pressable
            onPress={async () => {
              const { generateChildDossier, shareChildDossier } =
                await import("@/lib/pdf-export");
              const dossier = generateChildDossier({
                child: {
                  name: child.name,
                  birthDate: child.birthDate,
                  gender: child.gender,
                  publicId: (child as any).publicId,
                },
                environment: env || undefined,
                issues: issues.map((i: any) => ({
                  description: i.description || i.text,
                  treatmentPlan: i.treatmentPlan,
                  createdAt: i.createdAt,
                })),
                language: lang,
              });
              await shareChildDossier(dossier, child.name, lang);
            }}
            style={({ pressed }) => [
              {
                flex: 1,
                backgroundColor: "#E8F5E9",
                borderRadius: 12,
                paddingVertical: 14,
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "center",
                gap: 8,
                borderWidth: 1,
                borderColor: "#4CAF5030",
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Text style={{ fontSize: 16 }}>📄</Text>
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#2E7D32" }}>
              {tx(lang, "Exporteer dossier", "Export dossier", "تصدير الملف")}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/chat-notes" as any)}
            style={({ pressed }) => [
              {
                flex: 1,
                backgroundColor: "#E3F2FD",
                borderRadius: 12,
                paddingVertical: 14,
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "center",
                gap: 8,
                borderWidth: 1,
                borderColor: "#1976D230",
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Text style={{ fontSize: 16 }}>📝</Text>
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#1565C0" }}>
              {tx(lang, "Notities", "Notes", "ملاحظات")}
            </Text>
          </Pressable>
        </View>

        {/* Issue section */}
        <View className="mb-4">
          <View
            style={{
              flexDirection: isRTL ? "row-reverse" : "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <Text
              className="text-lg font-bold"
              style={{
                color: colors.foreground,
                textAlign: isRTL ? "right" : "left",
              }}
            >
              {tx(
                lang,
                "Issues & Behandelplannen",
                "Issues & Treatment Plans",
                "المشكلات وخطط العلاج",
              )}
            </Text>
            {issues.length > 0 && (
              <Pressable
                onPress={async () => {
                  try {
                    const { printToFileAsync } = await import("expo-print");
                    const { isAvailableAsync, shareAsync } =
                      await import("expo-sharing");
                    const childName = child?.name || "";
                    const dateStr = new Date().toLocaleDateString(
                      lang === "ar"
                        ? "ar-SA"
                        : lang === "en"
                          ? "en-US"
                          : "nl-NL",
                    );
                    const issuesHtml = issues
                      .map(
                        (issue, idx) => `
                    <div class="issue-block">
                      <h3>${tx(lang, "Issue", "Issue", "المشكلة")} ${idx + 1}</h3>
                      <p class="date">${new Date(issue.createdAt).toLocaleDateString(lang === "ar" ? "ar-SA" : lang === "en" ? "en-US" : "nl-NL")}${issue.syncedFromPartner ? " (" + tx(lang, "van partner", "from partner", "من الشريك") + ")" : ""}</p>
                      <div class="section">
                        <h4>${tx(lang, "Beschrijving", "Description", "الوصف")}</h4>
                        <p>${(issue.description || "").replace(/\n/g, "<br>")}</p>
                      </div>
                      ${
                        issue.treatmentPlan
                          ? `
                        <div class="section plan">
                          <h4>${tx(lang, "Behandelplan", "Treatment Plan", "خطة العلاج")}</h4>
                          <p>${issue.treatmentPlan.replace(/\n/g, "<br>")}</p>
                        </div>
                      `
                          : `<p class="no-plan">${tx(lang, "Geen behandelplan beschikbaar", "No treatment plan available", "لا توجد خطة علاج بعد")}</p>`
                      }
                    </div>
                  `,
                      )
                      .join("");
                    const html = `
                    <html dir="${isRTL ? "rtl" : "ltr"}">
                    <head><meta charset="utf-8"><style>
                      body { font-family: Arial, sans-serif; padding: 28px; font-size: 13px; line-height: 1.8; direction: ${isRTL ? "rtl" : "ltr"}; color: #333; }
                      h1 { color: #1B4332; font-size: 22px; border-bottom: 3px solid #1B4332; padding-bottom: 10px; margin-bottom: 6px; }
                      .subtitle { color: #666; font-size: 12px; margin-bottom: 24px; }
                      .summary { background: #E8F5E9; padding: 14px 18px; border-radius: 10px; margin-bottom: 24px; }
                      .summary strong { color: #1B4332; }
                      .issue-block { margin-bottom: 28px; page-break-inside: avoid; }
                      .issue-block h3 { color: #1B4332; font-size: 16px; margin-bottom: 4px; border-bottom: 1px solid #ddd; padding-bottom: 6px; }
                      .issue-block .date { color: #888; font-size: 11px; margin-bottom: 10px; }
                      .section { margin: 10px 0; padding: 12px 16px; background: #f8f9fa; border-radius: 8px; border-${isRTL ? "right" : "left"}: 4px solid #1B4332; }
                      .section.plan { border-${isRTL ? "right" : "left"}-color: #2E7D32; background: #F1F8E9; }
                      .section h4 { color: #2E7D32; font-size: 13px; margin: 0 0 6px 0; }
                      .section p { margin: 0; }
                      .no-plan { color: #999; font-style: italic; font-size: 12px; }
                      .footer { margin-top: 36px; padding-top: 14px; border-top: 2px solid #ddd; color: #888; font-size: 11px; text-align: center; }
                    </style></head>
                    <body>
                      <h1>${tx(lang, "Volledig Dossier: Issues & Behandelplannen", "Complete Dossier: Issues & Treatment Plans", "الملف الشامل: المشكلات وخطط العلاج")}</h1>
                      <p class="subtitle">${tx(lang, "Kind", "Child", "الطفل")}: <strong>${childName}</strong> | ${tx(lang, "Datum export", "Export date", "تاريخ التصدير")}: ${dateStr}</p>
                      <div class="summary">
                        <strong>${issues.length}</strong> ${tx(lang, "issues geregistreerd", "issues recorded", "مشكلة مسجلة")} |
                        <strong>${issues.filter((i) => i.treatmentPlan).length}</strong> ${tx(lang, "met behandelplan", "with treatment plan", "لها خطة علاج")}
                      </div>
                      ${issuesHtml}
                      <div class="footer">${tx(lang, "Gegenereerd door Rabbaanie App", "Generated by Rabbaanie App", "تم إنشاؤه بواسطة تطبيق ربّانيّ")} - ${dateStr}</div>
                    </body></html>
                  `;
                    const { uri } = await printToFileAsync({
                      html,
                      base64: false,
                    });
                    if (await isAvailableAsync()) {
                      await shareAsync(uri, {
                        mimeType: "application/pdf",
                        dialogTitle: tx(
                          lang,
                          "Volledig dossier PDF",
                          "Complete dossier PDF",
                          "تصدير الملف الشامل PDF",
                        ),
                      });
                    } else {
                      Alert.alert("PDF", uri);
                    }
                  } catch (e: any) {
                    Alert.alert(
                      tx(lang, "Fout", "Error", "خطأ"),
                      e?.message || "PDF export failed",
                    );
                  }
                }}
                style={({ pressed }) => [
                  {
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    backgroundColor: "#E8F5E9",
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: "#4CAF5030",
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Text style={{ fontSize: 14 }}>📃</Text>
                <Text
                  style={{ fontSize: 12, fontWeight: "700", color: "#2E7D32" }}
                >
                  {tx(lang, "Alles exporteren", "Export all", "تصدير الكل")}
                </Text>
              </Pressable>
            )}
          </View>

          {!showIssueForm ? (
            <Pressable
              onPress={() => {
                setShowIssueForm(true);
                setAdvisorStep("describe");
              }}
              className="rounded-xl py-3 items-center border"
              style={{
                borderColor: colors.error,
                backgroundColor: colors.error + "10",
              }}
            >
              <Text className="font-bold" style={{ color: colors.error }}>
                {tx(
                  lang,
                  "+ Nieuw issue melden",
                  "+ Report new issue",
                  "+ اطرح مشكلة جديدة",
                )}
              </Text>
            </Pressable>
          ) : (
            <View
              className="rounded-2xl p-4 border"
              style={{
                borderColor: colors.border,
                backgroundColor: colors.surface,
              }}
            >
              {/* Step 1: Describe the problem */}
              {advisorStep === "describe" && (
                <>
                  {/* Show previous QA history when reopening */}
                  {reopenIssueId &&
                    (() => {
                      const existingIssue = issues.find(
                        (i) => i.id === reopenIssueId,
                      );
                      if (
                        existingIssue?.analyticalQA &&
                        existingIssue.analyticalQA.length > 0
                      ) {
                        return (
                          <View
                            style={{
                              marginBottom: 16,
                              padding: 12,
                              borderRadius: 10,
                              backgroundColor: colors.primary + "08",
                              borderWidth: 1,
                              borderColor: colors.primary + "30",
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 14,
                                fontWeight: "700",
                                color: colors.primary,
                                marginBottom: 8,
                                textAlign: isRTL ? "right" : "left",
                              }}
                            >
                              {tx(
                                lang,
                                "Vorige diagnose",
                                "Previous diagnosis",
                                "التشخيص السابق",
                              )}
                            </Text>
                            {existingIssue.analyticalQA.map((qa, idx) => (
                              <View
                                key={idx}
                                style={{
                                  marginBottom: 8,
                                  paddingBottom: 8,
                                  borderBottomWidth:
                                    idx <
                                    (existingIssue.analyticalQA?.length || 0) -
                                      1
                                      ? 1
                                      : 0,
                                  borderBottomColor: colors.border,
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 12,
                                    fontWeight: "600",
                                    color: colors.foreground,
                                    textAlign: isRTL ? "right" : "left",
                                    writingDirection: isRTL ? "rtl" : "ltr",
                                  }}
                                >
                                  {tx(lang, "V", "Q", "س")} {idx + 1}:{" "}
                                  {qa.question}
                                </Text>
                                <Text
                                  style={{
                                    fontSize: 12,
                                    color: colors.muted,
                                    marginTop: 2,
                                    textAlign: isRTL ? "right" : "left",
                                    writingDirection: isRTL ? "rtl" : "ltr",
                                  }}
                                >
                                  {tx(lang, "A", "A", "ج")}: {qa.answer}
                                </Text>
                              </View>
                            ))}
                            <Text
                              style={{
                                fontSize: 11,
                                color: colors.warning,
                                marginTop: 4,
                                textAlign: isRTL ? "right" : "left",
                              }}
                            >
                              {tx(
                                lang,
                                "U kunt het probleem bijwerken of direct doorgaan met nieuwe vragen.",
                                "You can update the description or proceed directly with new questions.",
                                "يمكنك تحديث الوصف أو المتابعة مباشرة بأسئلة جديدة.",
                              )}
                            </Text>
                          </View>
                        );
                      }
                      return null;
                    })()}

                  <Text
                    className="text-base font-bold mb-2"
                    style={{
                      color: colors.foreground,
                      textAlign: isRTL ? "right" : "left",
                    }}
                  >
                    {reopenIssueId
                      ? tx(
                          lang,
                          "Beschrijf de verandering",
                          "Describe the change",
                          "صف التغيير الذي حدث",
                        )
                      : tx(
                          lang,
                          "Beschrijf het probleem",
                          "Describe the problem",
                          "صف المشكلة بالتفصيل",
                        )}
                  </Text>
                  <Text
                    className="text-sm mb-3"
                    style={{
                      color: colors.muted,
                      textAlign: isRTL ? "right" : "left",
                    }}
                  >
                    {tx(
                      lang,
                      "Vertel kort het verhaal: wat is er aan de hand met uw kind? Wees specifiek.",
                      "Briefly tell the story: what is going on with your child? Be specific.",
                      "اروِ ما يحدث مع طفلك باختصار ووضوح.",
                    )}
                  </Text>
                  <TextInput
                    value={issueText}
                    onChangeText={setIssueText}
                    placeholder={tx(
                      lang,
                      "Beschrijf het probleem hier...",
                      "Describe the problem here...",
                      "اكتب وصفًا للمشكلة هنا...",
                    )}
                    placeholderTextColor={colors.muted}
                    multiline
                    numberOfLines={6}
                    className="rounded-lg px-4 py-3 text-base min-h-[120px] mb-4"
                    style={{
                      backgroundColor: colors.background,
                      color: colors.foreground,
                      borderWidth: 1,
                      borderColor: colors.border,
                      textAlignVertical: "top",
                      textAlign: isRTL ? "right" : "left",
                      writingDirection: isRTL ? "rtl" : "ltr",
                    }}
                  />
                  <View className="flex-row gap-3">
                    <Pressable
                      onPress={resetAdvisor}
                      className="flex-1 rounded-xl py-3 items-center border"
                      style={{ borderColor: colors.border }}
                    >
                      <Text style={{ color: colors.muted }}>
                        {tx(lang, "Annuleren", "Cancel", "إلغاء")}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={handleGenerateQuestions}
                      disabled={generatingPlan}
                      className="flex-1 rounded-xl py-3 items-center"
                      style={{
                        backgroundColor: generatingPlan
                          ? colors.muted
                          : colors.primary,
                      }}
                    >
                      {generatingPlan ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <Text className="text-white font-bold">
                          {tx(lang, "Volgende", "Next", "التالي")}
                        </Text>
                      )}
                    </Pressable>
                  </View>
                </>
              )}

              {/* Step 2: Analytical questions */}
              {advisorStep === "questions" && (
                <>
                  {/* Progress indicator - shows question number and max */}
                  <View
                    style={{
                      flexDirection: isRTL ? "row-reverse" : "row",
                      alignItems: "center",
                      marginBottom: 12,
                      gap: 8,
                    }}
                  >
                    <Text style={{ fontSize: 12, color: colors.muted }}>
                      {tx(
                        lang,
                        `Vraag ${currentQuestionIdx + 1} (max ${MAX_QUESTIONS})`,
                        `Question ${currentQuestionIdx + 1} (max ${MAX_QUESTIONS})`,
                        `السؤال ${currentQuestionIdx + 1} (الحد الأقصى ${MAX_QUESTIONS})`,
                      )}
                    </Text>
                    <View
                      style={{
                        flex: 1,
                        height: 4,
                        borderRadius: 2,
                        backgroundColor: colors.border,
                      }}
                    >
                      <View
                        style={{
                          height: 4,
                          borderRadius: 2,
                          backgroundColor: colors.primary,
                          width: `${((currentQuestionIdx + 1) / MAX_QUESTIONS) * 100}%`,
                        }}
                      />
                    </View>
                  </View>

                  {/* Current question */}
                  <View style={{ marginBottom: 8 }}>
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: "700",
                        color: colors.foreground,
                        marginBottom: 10,
                        textAlign: isRTL ? "right" : "left",
                        writingDirection: isRTL ? "rtl" : "ltr",
                        lineHeight: 24,
                      }}
                    >
                      {advisorQuestions[currentQuestionIdx]}
                    </Text>
                    <ReportAiContent
                      content={advisorQuestions[currentQuestionIdx] || ""}
                      surface="child-treatment-question"
                    />
                    <TextInput
                      value={advisorAnswers[currentQuestionIdx]}
                      onChangeText={(text) => {
                        const newAnswers = [...advisorAnswers];
                        newAnswers[currentQuestionIdx] = text;
                        setAdvisorAnswers(newAnswers);
                      }}
                      placeholder={tx(
                        lang,
                        "Uw antwoord...",
                        "Your answer...",
                        "إجابتك...",
                      )}
                      placeholderTextColor={colors.muted}
                      multiline
                      numberOfLines={3}
                      returnKeyType="done"
                      blurOnSubmit={true}
                      onSubmitEditing={() => Keyboard.dismiss()}
                      style={{
                        backgroundColor: colors.background,
                        color: colors.foreground,
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderRadius: 10,
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                        fontSize: 14,
                        minHeight: 80,
                        maxHeight: 120,
                        textAlignVertical: "top",
                        textAlign: isRTL ? "right" : "left",
                        writingDirection: isRTL ? "rtl" : "ltr",
                      }}
                    />
                  </View>

                  {/* Navigation buttons */}
                  <View
                    className="flex-row gap-3"
                    style={{ paddingTop: 8, paddingBottom: 8 }}
                  >
                    <Pressable
                      onPress={() => {
                        Keyboard.dismiss();
                        if (currentQuestionIdx > 0)
                          setCurrentQuestionIdx(currentQuestionIdx - 1);
                        else {
                          setAdvisorStep("describe");
                          setCurrentQuestionIdx(0);
                        }
                      }}
                      className="flex-1 rounded-xl py-3 items-center border"
                      style={{ borderColor: colors.border }}
                    >
                      <Text style={{ color: colors.muted }}>
                        {tx(lang, "Terug", "Back", "رجوع")}
                      </Text>
                    </Pressable>
                    {rootCauseFound ? (
                      <Pressable
                        onPress={() => handleSubmitWithAnswers(advisorAnswers)}
                        disabled={generatingPlan}
                        className="flex-1 rounded-xl py-3 items-center"
                        style={{
                          backgroundColor: generatingPlan
                            ? colors.muted
                            : colors.primary,
                        }}
                      >
                        {generatingPlan ? (
                          <ActivityIndicator color="#FFFFFF" size="small" />
                        ) : (
                          <Text className="text-white font-bold">
                            {tx(
                              lang,
                              "Behandelplan",
                              "Treatment plan",
                              "إعداد خطة العلاج",
                            )}
                          </Text>
                        )}
                      </Pressable>
                    ) : (
                      <Pressable
                        onPress={async () => {
                          Keyboard.dismiss();
                          const currentAnswer =
                            advisorAnswers[currentQuestionIdx];
                          if (!currentAnswer || currentAnswer.trim().length < 3)
                            return;
                          setCheckingRootCause(true);
                          try {
                            // Check if root cause has been identified
                            const checkResponse = await authedFetch(`/api/advice/treatment`,
                              {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  childName: child.name,
                                  childAge: age
                                    ? tx(
                                        lang,
                                        `${age.years} jaar en ${age.months} maanden`,
                                        `${age.years} years and ${age.months} months`,
                                        `${age.years} سنة و${age.months} أشهر`,
                                      )
                                    : tx(
                                        lang,
                                        "onbekend",
                                        "unknown",
                                        "غير معروف",
                                      ),
                                  childGender:
                                    child.gender ||
                                    tx(
                                      lang,
                                      "onbekend",
                                      "unknown",
                                      "غير معروف",
                                    ),
                                  yearKey:
                                    yearKey ||
                                    tx(
                                      lang,
                                      "onbekend",
                                      "unknown",
                                      "غير معروف",
                                    ),
                                  weekInYear: weekInYear || 0,
                                  issue: issueText,
                                  language,
                                  environment: env || null,
                                  parentProfile: state.parentProfile,
                                  mode: "check_root_cause",
                                  currentQuestions: advisorQuestions,
                                  currentAnswers: advisorAnswers,
                                }),
                              },
                            );
                            const checkResult = await checkResponse.json();
                            if (
                              checkResult.rootCauseFound ||
                              advisorQuestions.length >= MAX_QUESTIONS
                            ) {
                              // Root cause found OR max questions reached
                              setRootCauseFound(true);
                              setRootCauseMessage(
                                checkResult.rootCause ||
                                  (advisorQuestions.length >= MAX_QUESTIONS
                                    ? tx(
                                        lang,
                                        "Maximum vragen bereikt",
                                        "Maximum questions reached",
                                        "تم الوصول للحد الأقصى من الأسئلة",
                                      )
                                    : null),
                              );
                            } else {
                              // Add next question dynamically (consultant-style)
                              let nextQ = checkResult.nextQuestion;
                              if (nextQ && typeof nextQ === "object")
                                nextQ =
                                  (nextQ as any).question ||
                                  (nextQ as any).text ||
                                  Object.values(nextQ)[0] ||
                                  null;
                              if (nextQ) nextQ = String(nextQ);
                              if (nextQ && nextQ.length > 5) {
                                setAdvisorQuestions([
                                  ...advisorQuestions,
                                  nextQ,
                                ]);
                                setAdvisorAnswers([...advisorAnswers, ""]);
                                setCurrentQuestionIdx(currentQuestionIdx + 1);
                              } else {
                                // Fallback: if no nextQuestion, allow plan generation
                                setRootCauseFound(true);
                              }
                            }
                          } catch {
                            setRootCauseFound(true);
                          }
                          setCheckingRootCause(false);
                        }}
                        disabled={
                          checkingRootCause ||
                          !advisorAnswers[currentQuestionIdx]?.trim()
                        }
                        className="flex-1 rounded-xl py-3 items-center"
                        style={{
                          backgroundColor: checkingRootCause
                            ? colors.muted
                            : colors.primary,
                        }}
                      >
                        {checkingRootCause ? (
                          <ActivityIndicator color="#FFFFFF" size="small" />
                        ) : (
                          <Text className="text-white font-bold">
                            {tx(lang, "Volgende", "Next", "التالي")}
                          </Text>
                        )}
                      </Pressable>
                    )}
                  </View>
                  {rootCauseFound && rootCauseMessage && (
                    <View
                      style={{
                        backgroundColor: colors.success + "15",
                        borderRadius: 10,
                        padding: 12,
                        marginTop: 12,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "700",
                          color: colors.success,
                          textAlign: isRTL ? "right" : "left",
                          writingDirection: isRTL ? "rtl" : "ltr",
                          marginBottom: 4,
                        }}
                      >
                        {tx(
                          lang,
                          "Grondoorzaak ge\u00EFdentificeerd:",
                          "Root cause identified:",
                          "تم تحديد جذر المشكلة:",
                        )}
                      </Text>
                      <Text
                        style={{
                          fontSize: 13,
                          color: colors.foreground,
                          textAlign: isRTL ? "right" : "left",
                          writingDirection: isRTL ? "rtl" : "ltr",
                          lineHeight: 20,
                        }}
                      >
                        {rootCauseMessage}
                      </Text>
                      <ReportAiContent
                        content={rootCauseMessage}
                        surface="child-treatment-root-cause"
                      />
                    </View>
                  )}
                </>
              )}

              {/* Step 3: Treatment plan result */}
              {advisorStep === "result" && treatmentPlan && (
                <>
                  <Text
                    className="text-base font-bold mb-3"
                    style={{
                      color: colors.success,
                      textAlign: isRTL ? "right" : "left",
                    }}
                  >
                    {tx(
                      lang,
                      "Behandelplan gegenereerd",
                      "Treatment plan generated",
                      "تم إعداد خطة العلاج",
                    )}
                  </Text>
                  <View
                    style={{
                      backgroundColor: colors.success + "08",
                      borderRadius: 12,
                      padding: 14,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        lineHeight: 24,
                        color: colors.foreground,
                        textAlign: isRTL ? "right" : "left",
                        writingDirection: isRTL ? "rtl" : "ltr",
                      }}
                    >
                      {treatmentPlan}
                    </Text>
                    <ReportAiContent
                      content={treatmentPlan}
                      surface="child-treatment-plan"
                    />
                  </View>
                  <Pressable
                    onPress={resetAdvisor}
                    className="rounded-xl py-3 items-center mt-4"
                    style={{ backgroundColor: colors.primary }}
                  >
                    <Text className="text-white font-bold">
                      {tx(lang, "Sluiten", "Close", "إغلاق")}
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
          )}
        </View>

        {/* Partner synced issues - distinct section */}
        {issues.filter((i) => i.syncedFromPartner).length > 0 && (
          <View className="mt-2 mb-4">
            <Text
              className="text-base font-bold mb-3"
              style={{ color: "#AD1457", textAlign: isRTL ? "right" : "left" }}
            >
              {tx(
                lang,
                "Issues van partner",
                "Partner's Issues",
                "مشكلات الشريك",
              )}
            </Text>
            {issues
              .filter((i) => i.syncedFromPartner)
              .map((issue) => (
                <StructuredIssueCard
                  key={issue.id + "-partner"}
                  issue={issue}
                  expanded={expandedIssueId === issue.id}
                  onToggle={() =>
                    setExpandedIssueId(
                      expandedIssueId === issue.id ? null : issue.id,
                    )
                  }
                  lang={lang}
                  isRTL={isRTL}
                  colors={colors}
                  isFather={false}
                  onDelete={() => {}}
                  childGender={child?.gender}
                />
              ))}
          </View>
        )}

        {/* Previous issues - expandable with structured treatment plan */}
        {issues.filter((i) => !i.syncedFromPartner).length > 0 && (
          <View className="mt-2 mb-4">
            <Text
              className="text-base font-bold mb-3"
              style={{
                color: colors.foreground,
                textAlign: isRTL ? "right" : "left",
              }}
            >
              {tx(lang, "Mijn issues", "My Issues", "مشكلاتي")}
            </Text>
            {issues
              .filter((i) => !i.syncedFromPartner)
              .map((issue) => (
                <StructuredIssueCard
                  key={issue.id}
                  issue={issue}
                  expanded={expandedIssueId === issue.id}
                  onToggle={() =>
                    setExpandedIssueId(
                      expandedIssueId === issue.id ? null : issue.id,
                    )
                  }
                  lang={lang}
                  isRTL={isRTL}
                  colors={colors}
                  isFather={state.parentProfile.gender === "man"}
                  childGender={child?.gender}
                  onReopen={() => handleReopenIssue(issue)}
                  onDelete={() => {
                    Alert.alert(
                      tx(lang, "Verwijderen", "Delete", "حذف"),
                      tx(
                        lang,
                        "Weet u zeker dat u dit issue wilt verwijderen?",
                        "Are you sure you want to delete this issue?",
                        "هل أنت متأكد من حذف هذه المشكلة؟",
                      ),
                      [
                        {
                          text: tx(lang, "Annuleren", "Cancel", "إلغاء"),
                          style: "cancel",
                        },
                        {
                          text: tx(lang, "Verwijderen", "Delete", "حذف"),
                          style: "destructive",
                          onPress: () => removeIssue(issue.id),
                        },
                      ],
                    );
                  }}
                />
              ))}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
// ============ Advisor Plans Component ============

import AsyncStorage from "@react-native-async-storage/async-storage";

import { authedFetch } from "@/lib/authed-fetch";
import { getDeviceId } from "@/lib/device-id";
function AdvisorPlansForChild({
  childId,
  childName,
  lang,
  colors,
}: {
  childId: string;
  childName: string;
  lang: Lang;
  colors: any;
}) {
  const [plans, setPlans] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    loadPlans();
  }, [childId]);

  const loadPlans = async () => {
    try {
      // Load from child-specific storage
      const childPlansRaw = await AsyncStorage.getItem(
        `@child_plans_${childId}`,
      );
      if (childPlansRaw) {
        setPlans(JSON.parse(childPlansRaw));
        return;
      }
      // Fallback: filter from global plans
      const globalRaw = await AsyncStorage.getItem("@advisor_action_plans");
      if (globalRaw) {
        const all = JSON.parse(globalRaw);
        const filtered = all.filter((p: any) => p.childId === childId);
        setPlans(filtered);
      }
    } catch {}
  };

  const removePlan = async (planId: string) => {
    Alert.alert(
      tx(lang, "Plan verwijderen?", "Delete plan?", "حذف الخطة؟"),
      tx(
        lang,
        "Weet je zeker dat je dit adviesplan wilt verwijderen?",
        "Are you sure you want to delete this plan?",
        "هل أنت متأكد من حذف هذه الخطة؟",
      ),
      [
        { text: tx(lang, "Annuleren", "Cancel", "إلغاء"), style: "cancel" },
        {
          text: tx(lang, "Verwijderen", "Delete", "حذف"),
          style: "destructive",
          onPress: async () => {
            try {
              // Remove from child-specific storage
              const childPlansRaw = await AsyncStorage.getItem(
                `@child_plans_${childId}`,
              );
              if (childPlansRaw) {
                const filtered = JSON.parse(childPlansRaw).filter(
                  (p: any) => p.id !== planId,
                );
                await AsyncStorage.setItem(
                  `@child_plans_${childId}`,
                  JSON.stringify(filtered),
                );
              }
              // Also remove from global storage. Through the same queue
              // cachePlanProgress uses: an un-queued delete beside a progress
              // report loses the delete and the plan comes back.
              await withPlanStore(async () => {
              const globalRaw = await AsyncStorage.getItem(
                "@advisor_action_plans",
              );
              if (globalRaw) {
                const filtered = JSON.parse(globalRaw).filter(
                  (p: any) => p.id !== planId,
                );
                await AsyncStorage.setItem(
                  "@advisor_action_plans",
                  JSON.stringify(filtered),
                );
              }
              });
              // Update local state
              setPlans((prev) => prev.filter((p) => p.id !== planId));
            } catch (e) {
              console.error("Error removing plan:", e);
            }
          },
        },
      ],
    );
  };

  if (plans.length === 0) return null;

  return (
    <View style={{ marginBottom: 16 }}>
      <Text
        style={{
          fontSize: 16,
          fontWeight: "700",
          color: colors.foreground,
          marginBottom: 10,
        }}
      >
        {tx(lang, "Adviesplannen", "Advisor Plans", "خطط المستشار")}
      </Text>
      {plans.map((plan) => (
        <View
          key={plan.id}
          style={{
            backgroundColor: colors.primary + "08",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.primary + "25",
            marginBottom: 8,
            overflow: "hidden",
          }}
        >
          <Pressable
            onPress={() => setExpanded(expanded === plan.id ? null : plan.id)}
            style={({ pressed }) => [
              {
                padding: 14,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: colors.primary,
                }}
              >
                {new Date(plan.savedAt).toLocaleDateString(
                  lang === "ar" ? "ar-SA" : lang === "en" ? "en-US" : "nl-NL",
                )}
              </Text>
              <Text
                style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}
                numberOfLines={1}
              >
                {plan.phases?.[0]?.steps?.[0]?.text ||
                  plan.content?.substring(0, 60) ||
                  "..."}
              </Text>
            </View>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <Pressable
                onPress={() => removePlan(plan.id)}
                style={({ pressed }) => [
                  { opacity: pressed ? 0.5 : 1, padding: 4 },
                ]}
              >
                <Text style={{ fontSize: 18 }}>🗑️</Text>
              </Pressable>
              <Text style={{ color: colors.primary, fontSize: 16 }}>
                {expanded === plan.id ? "▲" : "▼"}
              </Text>
            </View>
          </Pressable>
          {/* Render the plan text the advisor actually wrote, not the flattened
              step list. plan.phases is a lossy derivative kept for the weekly
              reminder; rendering it here dropped every "علاج في …" heading into
              the tail of the bullet above it and lost the parent/child split. */}
          {expanded === plan.id && (
            <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
              <TreatmentPlanRenderer
                planText={cleanTreatmentText(plan.content || "", lang)}
                issueId={plan.id}
                colors={colors}
                onProgressChange={(done: number, total: number) => {
                  // Same cache الأسبوعي writes. Without this a parent who works
                  // from this screen leaves the weekly card and the daily
                  // reminder reading a count that never moves.
                  cachePlanProgress(plan.id, done, total).catch(() => {});
                }}
              />
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

// ============ Structured Issue Card Component ============

/**
 * Clean treatment plan text: replace Latin transliterations with Arabic
 */
import { cleanTreatmentText } from "@/lib/plan-text";

type TreatmentGroup = {
  groupTitle: string; // "أهداف الوالد/الوالدين" or "أهداف الولد/البنت"
  sections: { title: string; content: string; goals: string[] }[];
};

/**
 * Parses a treatment plan text into two structured groups:
 * 1. Parent group (تأصيل → تصفية → تزكية → تربية → جدول)
 * 2. Child group (تمهيد → تصفية → تزكية → تربية → جدول)
 */
function parseTreatmentPlan(
  text: string,
  childGender?: string,
  lang?: string,
): TreatmentGroup[] {
  if (!text) return [];

  const cleaned = cleanTreatmentText(text, lang);
  const lines = cleaned.split("\n");

  // Parse into raw sections first
  const rawSections: { title: string; content: string; goals: string[] }[] = [];
  let currentSection: {
    title: string;
    content: string;
    goals: string[];
  } | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Detect section headers
    const headerMatch =
      trimmed.match(/^(?:#{1,4}\s*)?(?:\*\*)?([\d]+[\.)\.]\s*.+?)(?:\*\*)?$/) ||
      trimmed.match(/^#{1,4}\s+(.+)$/) ||
      trimmed.match(/^\*\*(.+?)\*\*$/);

    if (headerMatch || trimmed === "---") {
      if (trimmed === "---") {
        if (
          currentSection &&
          (currentSection.content || currentSection.goals.length)
        )
          rawSections.push(currentSection);
        currentSection = { title: "", content: "", goals: [] };
      } else if (headerMatch) {
        if (
          currentSection &&
          (currentSection.content || currentSection.goals.length)
        )
          rawSections.push(currentSection);
        currentSection = {
          title: headerMatch[1]
            .replace(/\*\*/g, "")
            .replace(/^[\d]+[\.)\.]\s*/, "")
            .trim(),
          content: "",
          goals: [],
        };
      }
    } else if (currentSection) {
      const goalMatch = trimmed.match(
        /^(?:[-•*]\s*(?:\[[ x]\]\s*)?|✓\s*|✗\s*|\d+\.\s)(.+)$/,
      );
      if (goalMatch && trimmed.length > 5 && trimmed.length < 250) {
        currentSection.goals.push(trimmed);
      } else {
        currentSection.content +=
          (currentSection.content ? "\n" : "") + trimmed;
      }
    } else {
      if (trimmed) {
        currentSection = { title: "", content: trimmed, goals: [] };
      }
    }
  }
  if (currentSection && (currentSection.content || currentSection.goals.length))
    rawSections.push(currentSection);

  // If parsing produced nothing useful, split by double newlines
  if (rawSections.length <= 1 && cleaned.length > 300) {
    const paragraphs = cleaned.split(/\n\n+/);
    if (paragraphs.length > 2) {
      for (const p of paragraphs) {
        const pLines = p.trim().split("\n");
        const firstLine = pLines[0]
          .replace(/^[#*\-\d.]+\s*/, "")
          .replace(/\*\*/g, "")
          .trim();
        const rest = pLines.slice(1).join("\n").trim();
        const goals = pLines
          .filter((l) => l.trim().match(/^[-•*\d][\.\s]/))
          .map((l) => l.trim());
        rawSections.push({
          title: firstLine.length < 100 ? firstLine : "",
          content:
            goals.length > 0
              ? pLines
                  .filter((l) => !l.trim().match(/^[-•*\d][\.\s]/))
                  .join("\n")
                  .trim()
              : rest || firstLine,
          goals,
        });
      }
    }
  }

  // Now classify sections into parent vs child groups
  const parentKeywords = [
    "الوالد",
    "الوالدين",
    "الأب",
    "الأم",
    "الوالد تغيير",
    "يجب على الوالد",
    "مبادئ للوالد",
    "الصلة بالله",
    "العلاقة بالشريك",
  ];
  const childKeywords = [
    "الطفل",
    "الولد",
    "البنت",
    "عقل الطفل",
    "قلب الطفل",
    "سلوك الطفل",
    "التصفية لـ",
    "التزكية لـ",
    "التربية لـ",
  ];
  const structureKeywords = ["التشخيص", "التحليل", "العقيدة", "الأساس"];
  const timelineKeywords = ["الجدول", "جدول زمني", "التقييم", "الأسبوع"];

  const parentSections: { title: string; content: string; goals: string[] }[] =
    [];
  const childSections: { title: string; content: string; goals: string[] }[] =
    [];
  const generalSections: { title: string; content: string; goals: string[] }[] =
    [];

  for (const section of rawSections) {
    const fullText = (section.title + " " + section.content).toLowerCase();
    const isParent = parentKeywords.some((k) => fullText.includes(k));
    const isChild = childKeywords.some((k) => fullText.includes(k));
    const isGeneral = structureKeywords.some((k) => fullText.includes(k));
    const isTimeline = timelineKeywords.some((k) => fullText.includes(k));

    if (isParent && !isChild) {
      parentSections.push(section);
    } else if (isChild && !isParent) {
      childSections.push(section);
    } else if (isTimeline) {
      // Timeline goes to both or general
      generalSections.push(section);
    } else if (isGeneral) {
      parentSections.push(section);
    } else {
      // Default: put in parent group
      parentSections.push(section);
    }
  }

  const childLabel = childGender === "meisje" ? "البنت" : "الولد";

  const groups: TreatmentGroup[] = [];

  if (parentSections.length > 0 || generalSections.length > 0) {
    groups.push({
      groupTitle: "أهداف الوالد / الوالدين",
      sections: [...parentSections, ...generalSections],
    });
  }

  if (childSections.length > 0) {
    groups.push({
      groupTitle: `أهداف ${childLabel}`,
      sections: childSections,
    });
  }

  // If no separation was possible, put everything under one group
  if (groups.length === 0 && rawSections.length > 0) {
    groups.push({
      groupTitle: "خطة العلاج",
      sections: rawSections,
    });
  }

  return groups;
}

function StructuredIssueCard({
  issue,
  expanded,
  onToggle,
  lang,
  isRTL,
  colors,
  isFather,
  onDelete,
  onReopen,
  childGender,
}: {
  issue: Issue;
  expanded: boolean;
  onToggle: () => void;
  lang: Lang;
  isRTL: boolean;
  colors: any;
  isFather: boolean;
  onDelete: () => void;
  onReopen?: () => void;
  childGender?: string;
}) {
  // TreatmentPlanRenderer handles all internal state (checkboxes, progress)

  return (
    <View
      style={{
        borderRadius: 12,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: expanded ? colors.primary + "40" : colors.border,
        backgroundColor: expanded ? colors.primary + "05" : colors.surface,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [{ padding: 14, opacity: pressed ? 0.8 : 1 }]}
      >
        <View
          style={{
            flexDirection: isRTL ? "row-reverse" : "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 14,
                fontWeight: "700",
                color: colors.foreground,
                textAlign: isRTL ? "right" : "left",
                writingDirection: isRTL ? "rtl" : "ltr",
              }}
            >
              {tx(lang, "Oplossing: ", "Solution: ", "حل مشكلة ")}
              {issue.description}
            </Text>
            <Text
              style={{
                fontSize: 11,
                color: colors.muted,
                marginTop: 4,
                textAlign: isRTL ? "right" : "left",
              }}
            >
              {new Date(issue.createdAt).toLocaleDateString(
                lang === "ar" ? "ar-SA" : lang === "en" ? "en-US" : "nl-NL",
              )}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {isFather && (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation?.();
                  onDelete();
                }}
                style={({ pressed }) => [
                  { padding: 6, opacity: pressed ? 0.5 : 1 },
                ]}
              >
                <Text style={{ fontSize: 16, color: colors.error }}>🗑️</Text>
              </Pressable>
            )}
            <Text style={{ color: colors.primary, fontSize: 16 }}>
              {expanded ? "▲" : "▼"}
            </Text>
          </View>
        </View>
      </Pressable>

      {/* Expanded content - using TreatmentPlanRenderer */}
      {expanded && issue.treatmentPlan && (
        <View
          style={{
            paddingHorizontal: 14,
            paddingBottom: 14,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          <TreatmentPlanRenderer
            planText={cleanTreatmentText(issue.treatmentPlan, lang)}
            issueId={issue.id}
            colors={colors}
          />
          <ReportAiContent
            content={issue.treatmentPlan}
            surface="child-saved-treatment-plan"
          />
          {/* Reopen diagnosis button */}
          {onReopen && (
            <Pressable
              onPress={onReopen}
              style={({ pressed }) => [
                {
                  marginTop: 12,
                  paddingVertical: 10,
                  paddingHorizontal: 16,
                  borderRadius: 8,
                  backgroundColor: colors.warning + "20",
                  borderWidth: 1,
                  borderColor: colors.warning,
                  alignItems: "center",
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text
                style={{
                  color: colors.warning,
                  fontWeight: "600",
                  fontSize: 13,
                  textAlign: "center",
                }}
              >
                {tx(
                  lang,
                  "Diagnose heropenen (situatie gewijzigd)",
                  "Reopen diagnosis (situation changed)",
                  "إعادة التشخيص (تغيّرت الحالة)",
                )}
              </Text>
              {issue.updatedAt && (
                <Text
                  style={{ color: colors.muted, fontSize: 10, marginTop: 4 }}
                >
                  {tx(
                    lang,
                    "Laatst bijgewerkt: ",
                    "Last updated: ",
                    "آخر تحديث: ",
                  )}
                  {new Date(issue.updatedAt).toLocaleDateString(
                    lang === "ar" ? "ar-SA" : lang === "en" ? "en-US" : "nl-NL",
                  )}
                </Text>
              )}
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}
