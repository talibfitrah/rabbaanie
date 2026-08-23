import { useState, useEffect } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { trpc } from "@/lib/trpc";
import { router } from "expo-router";
import { ReportAiContent } from "@/components/report-ai-content";
import type { DiagnosticTone } from "@/server/daily-diagnostic";

type Lang = "nl" | "en" | "ar";

function tx(lang: Lang, nl: string, en: string, ar: string): string {
  if (lang === "en") return en;
  if (lang === "ar") return ar;
  return nl;
}

interface Props {
  lang: Lang;
  isRTL: boolean;
  /** Today's home-tip text, shown as a reminder banner in the open state only. */
  reminder?: string;
}

/**
 * Turns a stored `answers` array back into the `{ [category]: {label, tone} }`
 * shape the option list's isSelected check reads — the pre-fill for
 * reopening an already-answered day to review it. Pulled out as a plain
 * function so it's assertable without a renderer (none is installed in this
 * project — see tests/daily-diagnostic-card.test.ts).
 */
export function buildReviewSelections(
  answers: { category: string; label: string; tone: DiagnosticTone }[] | null | undefined,
): Record<string, { label: string; tone: DiagnosticTone }> {
  if (!answers) return {};
  return Object.fromEntries(answers.map((a) => [a.category, { label: a.label, tone: a.tone }]));
}

/**
 * Once-a-day self check-in (prayer / psychological / physical / children).
 * Replaces guessed spouse advice: these answers — never the partner's raw
 * text, only a category+tone summary — are what the spouse-advice AI reads
 * about the OTHER person (see server/daily-diagnostic.ts).
 *
 * getToday can trigger a paid generation call the first time it's fetched
 * for the day, so it must never fire as a side effect of this card simply
 * being on screen (`never-spend-openrouter-credit`). It stays disabled until
 * the user explicitly taps to open today's check-in.
 */
export function DailyDiagnosticCard({ lang, isRTL, reminder }: Props) {
  const utils = trpc.useUtils();
  const [started, setStarted] = useState(false);
  // Tapping the answered "done" card opens this back up to review the day's
  // answers — never a new fetch/generation (todayQuery stays driven by
  // `started`/its own cache; this flag only switches which JSX renders).
  const [reviewing, setReviewing] = useState(false);
  const todayQuery = trpc.dailyDiagnostic.getToday.useQuery({ lang }, { enabled: started });
  const submitMutation = trpc.dailyDiagnostic.submitAnswers.useMutation({
    onSuccess: () => utils.dailyDiagnostic.getToday.invalidate(),
    // A rejected submit (e.g. the card was showing a stale/unpersisted
    // fallback) leaves the card showing questions that can never be saved.
    // Refetch so the next tap works against whatever is actually current.
    onError: () => utils.dailyDiagnostic.getToday.invalidate(),
  });

  const [selected, setSelected] = useState<Record<string, { label: string; tone: DiagnosticTone }>>({});

  // Identity of the CONTENT, not the fetch — a background refetch (query
  // client default staleTime/refetchOnMount, or the onError invalidate
  // below) can return the exact same questions, and keying the reset on
  // dataUpdatedAt would then wipe answers the user was mid-way through
  // tapping for no reason. Only reset when the date or the actual option
  // labels change — e.g. an error-triggered refetch that lands a DIFFERENT
  // question set, or a plain UTC-midnight rollover while the screen is open.
  // The query cache outlives a day boundary — a card left mounted overnight,
  // or a cache restored on relaunch, still holds YESTERDAY's row. Everything
  // derived from it must be date-checked: a stale "completed" would hide
  // today's check-in permanently, and stale questions would be submitted
  // against today and rejected by submitAnswers' exact-option match. UTC to
  // match the server's day key (server/daily-diagnostic.ts).
  const todayKey = new Date().toISOString().slice(0, 10);
  const data = todayQuery.data?.date === todayKey ? todayQuery.data : undefined;

  const questionsSignature = data
    ? `${data.date}|${data.questions.map((q) => `${q.category}:${q.options.map((o) => o.label).join(",")}`).join("|")}`
    : "";
  useEffect(() => {
    setSelected({});
    // Same overnight-mount hazard the comment above already guards
    // `selected` against, one layer up: if the card was left open in review
    // mode (reviewing=true) and the day rolls over while still mounted, the
    // NEW day's fresh answers=null content lands here too. Nothing in this
    // effect resets `reviewing` on its own — a signature change is exactly
    // the marker that whatever was being reviewed no longer matches what's
    // on screen, so this is also the point that must clear it. Left unset,
    // reviewing would still read true once the user later submits THIS new
    // day's answers, skipping straight past the compact "done" card to the
    // locked review view for a submission that just happened.
    setReviewing(false);
  }, [questionsSignature]);

  // A disabled useQuery still hands back whatever the query cache already
  // holds, so an answered check-in keeps showing its completed state when the
  // user returns to the home screen instead of reverting to a teaser that
  // invites a check-in already done. This reads the cache only — it never
  // enables the fetch, so it cannot trigger a generation.
  const alreadyAnsweredToday = data?.answers != null;

  if (!started && !alreadyAnsweredToday) {
    return (
      <Pressable
        onPress={() => setStarted(true)}
        style={({ pressed }) => [s.teaserCard, { flexDirection: isRTL ? "row-reverse" : "row" }, pressed && { opacity: 0.85 }]}
      >
        <MaterialIcons name="edit-calendar" size={18} color="#1B4332" />
        <Text style={[s.teaserText, { textAlign: lang === "ar" ? "right" : "left" }]} numberOfLines={2}>
          {tx(lang, "Persoonlijke evaluatie", "Personal review", "المراجعة الشخصية")}
        </Text>
        <MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={20} color="#1B4332" />
      </Pressable>
    );
  }

  // `!data && isFetching` is the day-rollover case: the cache holds a stale
  // date so `data` is undefined, but isLoading is false because a cached
  // entry exists. Without it the card flashes its "failed, tap to retry"
  // state while today's fetch is still in flight.
  if (todayQuery.isLoading || (!data && todayQuery.isFetching)) {
    // The first fetch of the day can be a multi-second generation call, not
    // an instant cache read — a bare `return null` here made the card
    // silently vanish for that whole window with no feedback.
    return (
      <View style={[s.teaserCard, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <ActivityIndicator size="small" color="#1B4332" />
        <Text style={[s.teaserText, { textAlign: lang === "ar" ? "right" : "left" }]}>
          {tx(lang, "Bezig met laden...", "Loading...", "جارٍ التحميل...")}
        </Text>
      </View>
    );
  }

  if (todayQuery.isError) {
    // getToday never throws NOT_FOUND itself (it always returns a valid,
    // possibly-fallback response) — a NOT_FOUND here can only mean the
    // procedure itself isn't deployed on this server yet. Stay silent
    // instead of showing a "tap to retry" that can never succeed until the
    // server side ships (client and server for this feature deploy
    // together, but can land as separate steps).
    if ((todayQuery.error as any)?.data?.code === "NOT_FOUND") return null;
  }

  if (todayQuery.isError || !data) {
    return (
      <Pressable
        onPress={() => todayQuery.refetch()}
        style={({ pressed }) => [s.teaserCard, { flexDirection: isRTL ? "row-reverse" : "row" }, pressed && { opacity: 0.85 }]}
      >
        <MaterialIcons name="error-outline" size={18} color="#B91C1C" />
        <Text style={[s.teaserText, { textAlign: lang === "ar" ? "right" : "left" }]} numberOfLines={2}>
          {tx(lang, "Laden mislukt, tik om opnieuw te proberen", "Failed to load, tap to retry", "فشل التحميل، اضغط لإعادة المحاولة")}
        </Text>
      </Pressable>
    );
  }

  const { date, questions, answers, source } = data;

  if (answers && !reviewing) {
    return (
      <Pressable
        onPress={() => setReviewing(true)}
        style={({ pressed }) => [s.doneCard, { flexDirection: isRTL ? "row-reverse" : "row" }, pressed && { opacity: 0.85 }]}
      >
        <MaterialIcons name="check-circle" size={16} color="#1B4332" />
        <Text style={[s.doneText, { textAlign: lang === "ar" ? "right" : "left" }]} numberOfLines={2}>
          {tx(lang, "Persoonlijke evaluatie", "Personal review", "المراجعة الشخصية")}
        </Text>
        <MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={20} color="#1B4332" />
      </Pressable>
    );
  }

  // Reached two ways: filling in today's not-yet-answered check-in (answers
  // is null), or reviewing an already-answered one (answers is non-null and
  // reviewing is true — the only way past the early return above). Answers
  // are final once submitted (server/daily-diagnostic.ts submitAnswers
  // rejects any second submission for the same day, by design — the
  // spouse-advice signal may already have been read from it), so review mode
  // shows the prior selections locked rather than offering a submit that the
  // server would always reject.
  const reviewSelections = answers ? buildReviewSelections(answers) : null;
  const locked = !!reviewSelections;
  const activeSelections = locked ? reviewSelections! : selected;
  const allAnswered = questions.every((q) => !!activeSelections[q.category]);

  return (
    <View style={s.section}>
      {reminder ? (
        <Pressable
          onPress={() => router.push("/details/tips-today" as any)}
          style={({ pressed }) => [s.reminderBanner, { flexDirection: isRTL ? "row-reverse" : "row" }, pressed && { opacity: 0.85 }]}
        >
          <MaterialIcons name="lightbulb" size={16} color="#C4A35A" />
          <Text style={[s.reminderText, { textAlign: lang === "ar" ? "right" : "left" }]}>{reminder}</Text>
          <MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={18} color="#C4A35A" />
        </Pressable>
      ) : null}
      {locked ? (
        <Pressable
          onPress={() => setReviewing(false)}
          style={({ pressed }) => [s.reviewHeader, { flexDirection: isRTL ? "row-reverse" : "row" }, pressed && { opacity: 0.7 }]}
        >
          <MaterialIcons name={isRTL ? "chevron-right" : "chevron-left"} size={18} color="#1B4332" />
          <MaterialIcons name="check-circle" size={16} color="#1B4332" />
          <Text style={[s.title, { marginBottom: 0 }]}>
            {tx(lang, "Uw antwoorden van vandaag", "Your answers today", "إجاباتك اليوم")}
          </Text>
        </Pressable>
      ) : (
        <Text style={[s.title, { textAlign: lang === "ar" ? "right" : "left" }]}>
          {tx(lang, "Hoe was uw dag vandaag?", "How was your day today?", "كيف كان يومك اليوم؟")}
        </Text>
      )}
      {/* Said before answering, not only in a source comment. These answers
          cover prayer, psychological and physical state, and they feed the
          advice the OTHER spouse receives — a secondary use of sensitive data
          that Play's User Data policy expects to be disclosed in-app, at the
          point of collection. Wording matches what actually leaves: a coarse
          category+tone summary, never the typed text (see
          server/daily-diagnostic.ts summarizeSignals). */}
      {!locked && (
        <Text style={[s.notice, { textAlign: lang === "ar" ? "right" : "left" }]}>
          {tx(
            lang,
            "Uw antwoorden helpen het advies voor uw partner — alleen als samenvatting, nooit uw eigen tekst.",
            "Your answers help shape the advice your partner receives — as a summary only, never your own words.",
            "تساعد إجاباتك في تشكيل النصيحة التي يتلقاها شريكك — كملخّص فقط، دون نصّك الخاص.",
          )}
        </Text>
      )}
      {questions.map((q) => (
        <View key={q.category} style={s.card}>
          <Text style={[s.question, { textAlign: lang === "ar" ? "right" : "left" }]}>{q.text}</Text>
          <View style={s.options}>
            {q.options.map((opt) => {
              const isSelected = activeSelections[q.category]?.label === opt.label;
              return (
                <Pressable
                  key={opt.label}
                  disabled={locked}
                  onPress={locked ? undefined : () => setSelected((prev) => ({ ...prev, [q.category]: { label: opt.label, tone: opt.tone } }))}
                  style={({ pressed }) => [
                    s.option,
                    { flexDirection: isRTL ? "row-reverse" : "row" },
                    isSelected && s.optionSelected,
                    pressed && !locked && { opacity: 0.7 },
                  ]}
                >
                  <View style={[s.radio, isSelected && s.radioSelected]}>
                    {isSelected && <MaterialIcons name="check" size={12} color="#FFFFFF" />}
                  </View>
                  <Text style={[s.optionText, isSelected && s.optionTextSelected]}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
      {/* Required on AI output by Play's AI-Generated Content policy: an app
          that generates content with AI must offer in-app reporting without
          the user leaving the app. These questions and their option labels
          come from the model whenever source is "generated" — the static
          fallback set is ours, so it is not reported as AI output. This card
          sits on the home tab, which is the first screen a reviewer sees. */}
      {source === "generated" && (
        <ReportAiContent
          content={questions
            .map((q) => `${q.text}\n${q.options.map((o) => o.label).join(" / ")}`)
            .join("\n\n")}
          surface="daily-diagnostic"
        />
      )}
      {locked ? (
        <View style={[s.lockedNotice, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <MaterialIcons name="lock-outline" size={14} color="#52796F" />
          <Text style={[s.lockedNoticeText, { textAlign: lang === "ar" ? "right" : "left" }]}>
            {tx(
              lang,
              "Al beantwoord vandaag — kan niet meer worden gewijzigd.",
              "Already answered today — can no longer be changed.",
              "تمت الإجابة اليوم بالفعل — لا يمكن تغييرها بعد الآن.",
            )}
          </Text>
        </View>
      ) : (
        <>
          <Pressable
            disabled={!allAnswered || submitMutation.isPending}
            onPress={() =>
              submitMutation.mutate({
                date,
                answers: questions.map((q) => ({ category: q.category, ...selected[q.category]! })),
              })
            }
            style={({ pressed }) => [
              s.submitBtn,
              (!allAnswered || submitMutation.isPending) && s.submitBtnDisabled,
              pressed && allAnswered && { opacity: 0.8 },
            ]}
          >
            <MaterialIcons name="check-circle" size={18} color={allAnswered ? "#FFFFFF" : "#9CA3AF"} />
            <Text style={[s.submitText, !allAnswered && s.submitTextDisabled]}>{tx(lang, "Beantwoord", "Submit", "إرسال")}</Text>
          </Pressable>
          {submitMutation.isError && (
            <Text style={[s.errorText, { textAlign: lang === "ar" ? "right" : "left" }]}>
              {tx(lang, "Verzenden mislukt, probeer opnieuw", "Failed to send, please try again", "تعذّر الإرسال، حاول مرة أخرى")}
            </Text>
          )}
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  section: { marginHorizontal: 16, marginBottom: 16 },
  reminderBanner: { alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: "#FFFBF0", borderRadius: 10, borderWidth: 1, borderColor: "#C4A35A30", marginBottom: 10 },
  reminderText: { flex: 1, fontSize: 12, color: "#78350F", fontWeight: "600" },
  title: { fontSize: 14, fontWeight: "700", color: "#1B4332", marginBottom: 4 },
  notice: { fontSize: 11, lineHeight: 16, color: "#52796F", marginBottom: 10 },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#E8ECE9",
    padding: 14,
    marginBottom: 10,
  },
  question: { fontSize: 13, fontWeight: "700", color: "#1B4332", marginBottom: 10 },
  options: { gap: 0, borderRadius: 10, borderWidth: 1, borderColor: "#E8ECE9", overflow: "hidden" },
  option: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#E8ECE9",
    backgroundColor: "#FFFFFF",
  },
  optionSelected: { backgroundColor: "#E8F5E9" },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: "#CBD5E1", alignItems: "center", justifyContent: "center" },
  radioSelected: { backgroundColor: "#1B4332", borderColor: "#1B4332" },
  optionText: { fontSize: 14, fontWeight: "500", color: "#374151" },
  optionTextSelected: { fontWeight: "700", color: "#1B4332" },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#1B4332",
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 4,
  },
  submitBtnDisabled: { backgroundColor: "#E8ECE9" },
  submitText: { fontSize: 15, fontWeight: "700", color: "#FFFFFF" },
  submitTextDisabled: { color: "#9CA3AF" },
  errorText: { fontSize: 12, fontWeight: "600", color: "#B91C1C", marginTop: 8 },
  teaserCard: {
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#E8ECE9",
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  teaserText: { flex: 1, fontSize: 14, fontWeight: "700", color: "#1B4332" },
  doneCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#E8F5E9",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#1B433220",
    marginHorizontal: 16,
    marginBottom: 16,
  },
  doneText: { flex: 1, fontSize: 14, fontWeight: "600", color: "#1B4332" },
  reviewHeader: { alignItems: "center", gap: 8, marginBottom: 4 },
  lockedNotice: {
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F3F4F6",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  lockedNoticeText: { flex: 1, fontSize: 12, fontWeight: "600", color: "#52796F" },
});
