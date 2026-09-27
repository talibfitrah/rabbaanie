import { useEffect, useMemo } from "react";
import { View, Text, Pressable, ActivityIndicator, Alert } from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { useAppState } from "@/lib/app-context";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import { addDays, diffDays, classify, predict, cyclePhases, cycleCountdowns, openBleedRun, isoToday, DEFAULT_SETTINGS, type CycleDay, type CycleSettings, type CyclePhaseKey, type Flow } from "@/lib/haid";
import { haidText, phaseColors } from "@/lib/haid-text";

type Lang = "nl" | "en" | "ar";
const tx = (l: Lang, nl: string, en: string, ar: string) => (l === "ar" ? ar : l === "en" ? en : nl);

/**
 * HER OWN family-tab entry (Daa3iyah 3093). Same card shell/copy as before
 * when tracking isn't enabled yet; once enabled it becomes a live glance —
 * status, cycle-day, nearest countdown, a compact phase bar, and a single
 * inline action — so she doesn't have to open /haid just to check. Tapping
 * the card always goes to /haid for the full overview + medical info +
 * per-date editing. Does not touch the husband's wife-cycle-status card.
 */
export function HaidFamilyCard() {
  const router = useRouter();
  const colors = useColors();
  const { language, isRTL, dig } = useI18n();
  const lang = language as Lang;
  const T = haidText(lang);
  const { state } = useAppState();
  const { user, isAuthenticated } = useAuth();
  const isWoman = state.parentProfile.gender === "vrouw";
  const q = trpc.cycle.getMine.useQuery(undefined, { enabled: isAuthenticated && isWoman });
  const utils = trpc.useUtils();
  const upsertDay = trpc.cycle.upsertDay.useMutation({
    onSuccess: () => utils.cycle.getMine.invalidate(),
    onError: (e: { message: string }) => Alert.alert(tx(lang, "Er ging iets mis", "Something went wrong", "حدث خطأ ما"), e.message),
  });
  const today = isoToday();
  // Map q.data → engine types ONCE; shared by the view memo and the notify effect.
  const cycleData = useMemo(() => {
    if (!q.data?.enabled) return null;
    const days: CycleDay[] = q.data.days.map((d) => ({ date: d.date, flow: d.flow as Flow, color: d.color as CycleDay["color"], ghusl: d.ghusl }));
    const settings: CycleSettings = { ...DEFAULT_SETTINGS, ...(q.data.settings ?? {}), enabled: true };
    return { days, settings };
  }, [q.data]);

  const view = useMemo(() => {
    if (!q.data) return null;
    if (!cycleData) return { enabled: false as const };
    const { days, settings } = cycleData;
    const todayCls = classify(days, settings, addDays(today, -60), today, today).slice(-1)[0];
    const p = predict(days, settings, today);
    const ph = cyclePhases(days, settings, today);
    const hasLogToday = days.some((d) => d.date === today);
    const openRun = openBleedRun(days, settings, today);
    // Same shared helper as /haid: nextHaidDays (negative = late), fertileDays (null
    // while late or un-personalized). ph is null while pregnant/in nifas → both null.
    const { nextHaidDays, fertileDays } = cycleCountdowns(ph, p, today);
    const countdownText =
      nextHaidDays != null && (fertileDays == null || nextHaidDays <= fertileDays) ? T.overview.nextHaid(nextHaidDays) :
      fertileDays != null ? T.overview.fertileIn(fertileDays) : null;
    return {
      enabled: true as const,
      status: todayCls.status,
      cycleDay: ph && ph.personalized ? ph.cycleDay : null,
      phase: ph,
      countdownText,
      // Exactly the /haid screen's rule: confirm only when the last blood is within
      // 2 days (logging today stays contiguous — no split, no backfill). showStart
      // (new period) only when NO run is open — a tap otherwise splits it — and only
      // in a real cycle (ph != null, so not pregnant/nifas).
      showConfirm: openRun != null && diffDays(openRun.lastBlood, today) <= 2,
      showStart: openRun == null && ph != null && !hasLogToday,
    };
  }, [q.data, cycleData, today, lang]);

  // Logging from this card must resync prayer alarms + haid notifications, the
  // same as /haid and the diagnostic card — otherwise alarms stay wrong until she
  // opens /haid. Runs on every q.data change, including after a log invalidates.
  // haid-notifications is imported dynamically so its expo-notifications chain
  // stays out of family.tsx's static graph (which a source test imports).
  useEffect(() => {
    if (!cycleData || !user?.id) return;
    const uid = user.id;
    import("@/lib/haid-notifications").then((m) => m.syncHaidNotifications({ userId: uid, days: cycleData.days, settings: cycleData.settings, language: lang })).catch(() => {});
  }, [cycleData, user?.id, lang]);

  if (!isAuthenticated || !isWoman) return null;

  const logToday = (flow: Flow) => { if (!upsertDay.isPending) upsertDay.mutate({ date: today, flow, color: null, ghusl: false }); };
  // Starting a period flips today to haid and pauses the prayer alarms, so this
  // one — unlike the "still bleeding? yes/stopped" prompt, which is already a
  // two-way choice — asks first, on a card that is itself a tap-to-open target.
  const startBleeding = () => {
    if (upsertDay.isPending) return;
    Alert.alert(
      tx(lang, "Bloeding registreren?", "Log bleeding?", "تسجيل نزول الدم؟"),
      tx(lang, "Vandaag als eerste dag van de menstruatie registreren? U bent dan vrijgesteld van het gebed.", "Log today as the first day of menstruation? You will then be excused from prayer.", "تسجيلُ اليوم أوّلَ أيّام الحيض؟ تُصبِحين حينئذٍ معفاةً من الصلاة."),
      [{ text: tx(lang, "Annuleren", "Cancel", "إلغاء") }, { text: tx(lang, "Ja", "Yes", "نعم"), onPress: () => logToday("blood") }],
    );
  };

  const cardStyle = { flexDirection: (isRTL ? "row-reverse" : "row") as "row" | "row-reverse", alignItems: "center" as const, gap: 10, backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border };
  const align = { textAlign: isRTL ? ("right" as const) : ("left" as const) };

  // Loading, not-yet-enabled, or a fetch error: the exact existing "set up" card
  // (never auto-enables — that still requires her consent, per the `consent` string on /haid).
  if (q.isLoading || !view || !view.enabled) {
    return (
      <Pressable onPress={() => router.push("/haid" as any)} style={({ pressed }) => [cardStyle, pressed && { opacity: 0.85 }]}>
        <MaterialIcons name="favorite-border" size={22} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={[{ fontSize: 14, fontWeight: "700", color: colors.foreground }, align]}>{tx(lang, "Menstruatie en reinheid", "Menses and purity", "متابعة الحيض والطهر")}</Text>
          {q.isLoading ? (
            <ActivityIndicator size="small" color={colors.muted} style={{ marginTop: 4, alignSelf: isRTL ? "flex-end" : "flex-start" }} />
          ) : (
            <Text style={[{ fontSize: 12, color: colors.muted, marginTop: 2 }, align]}>
              {tx(lang, "Privé — alleen u en uw echtgenoot", "Private — only you and your husband", "خاص — لكِ ولزوجكِ فقط")}
            </Text>
          )}
        </View>
        <MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={20} color={colors.muted} />
      </Pressable>
    );
  }

  const PHASE_COLOR = phaseColors(colors);

  return (
    <Pressable onPress={() => router.push("/haid" as any)} style={({ pressed }) => [cardStyle, { flexDirection: "column" as const, alignItems: "stretch" as const }, pressed && { opacity: 0.9 }]}>
      <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 10 }}>
        <MaterialIcons name="favorite-border" size={22} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={[{ fontSize: 14, fontWeight: "700", color: colors.foreground }, align]}>
            {T.status[view.status]}{view.cycleDay != null ? ` · ${dig(T.overview.cycleDay(view.cycleDay))}` : ""}
          </Text>
          {view.countdownText && <Text style={[{ fontSize: 12, color: colors.muted, marginTop: 2 }, align]}>{dig(view.countdownText)}</Text>}
        </View>
        <MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={20} color={colors.muted} />
      </View>

      {view.phase && (
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", height: 8, borderRadius: 4, overflow: "hidden", marginTop: 10 }}>
          {view.phase.phases.map((ph) => <View key={ph.key} style={{ flex: ph.days, backgroundColor: PHASE_COLOR[ph.key] }} />)}
        </View>
      )}

      {view.showConfirm ? (
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 8, marginTop: 10 }}>
          <Text style={[{ flex: 1, fontSize: 12, color: colors.muted }, align]}>{T.log.stillBleeding}</Text>
          <Pressable onPress={() => logToday("blood")} style={{ backgroundColor: colors.error, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, opacity: upsertDay.isPending ? 0.6 : 1 }}>
            <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 11 }}>{T.log.yesStill}</Text>
          </Pressable>
          <Pressable onPress={() => logToday("dry")} style={{ borderWidth: 1, borderColor: colors.border, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, opacity: upsertDay.isPending ? 0.6 : 1 }}>
            <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 11 }}>{T.log.stopped}</Text>
          </Pressable>
        </View>
      ) : view.showStart ? (
        <Pressable onPress={startBleeding} style={{ marginTop: 10, backgroundColor: colors.error, paddingVertical: 8, borderRadius: 8, alignItems: "center", opacity: upsertDay.isPending ? 0.6 : 1 }}>
          <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 12 }}>{T.log.startedToday}</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}
