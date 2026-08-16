import { useState, useEffect } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { trpc } from "@/lib/trpc";
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
export function DailyDiagnosticCard({ lang, isRTL }: Props) {
  const utils = trpc.useUtils();
  const [started, setStarted] = useState(false);
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
          {tx(lang, "Uw dagelijkse zelfregistratie", "Your daily self check-in", "مراجعتك اليومية")}
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

  const { date, questions, answers } = data;

  if (answers) {
    return (
      <View style={[s.doneCard, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <MaterialIcons name="check-circle" size={16} color="#1B4332" />
        <Text style={[s.doneText, { textAlign: lang === "ar" ? "right" : "left" }]} numberOfLines={2}>
          {/* Deliberately distinct from index.tsx's own check-in completion text
              (also "تم إكمال المراجعة اليومية") — the two cards can be on screen
              back to back and must not look like a duplicated/glitched string. */}
          {tx(lang, "Extra dagregistratie voltooid", "Extra daily entry completed", "تمت إضافة بيانات اليوم")}
        </Text>
      </View>
    );
  }

  const allAnswered = questions.every((q) => !!selected[q.category]);

  return (
    <View style={s.section}>
      <Text style={[s.title, { textAlign: lang === "ar" ? "right" : "left" }]}>
        {tx(lang, "Hoe was uw dag vandaag?", "How was your day today?", "كيف كان يومك اليوم؟")}
      </Text>
      {questions.map((q) => (
        <View key={q.category} style={s.card}>
          <Text style={[s.question, { textAlign: lang === "ar" ? "right" : "left" }]}>{q.text}</Text>
          <View style={s.options}>
            {q.options.map((opt) => {
              const isSelected = selected[q.category]?.label === opt.label;
              return (
                <Pressable
                  key={opt.label}
                  onPress={() => setSelected((prev) => ({ ...prev, [q.category]: { label: opt.label, tone: opt.tone } }))}
                  style={({ pressed }) => [
                    s.option,
                    { flexDirection: isRTL ? "row-reverse" : "row" },
                    isSelected && s.optionSelected,
                    pressed && { opacity: 0.7 },
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
    </View>
  );
}

const s = StyleSheet.create({
  section: { marginHorizontal: 16, marginBottom: 16 },
  title: { fontSize: 14, fontWeight: "700", color: "#1B4332", marginBottom: 10 },
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
});
