// روزنامة -- Islamic almanac/calendar. Gregorian-primary grid with Hijri
// annotation, day/week/month/year views, per-day فضائل/تحذيرات (islamic-calendar.ts)
// and user appointments (calendar-events.ts + event-reminders.ts). Visual
// language mirrors app/details/upcoming-days.tsx.
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, Platform, TextInput, Modal, Alert, KeyboardAvoidingView, Switch, Linking } from "react-native";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useI18n } from "@/lib/i18n";
import {
  PRAYER_LOCATION_KEY,
  PRAYER_METHOD_KEY,
  CALC_METHODS,
  calculatePrayerTimes,
  getCurrentMinutesInTimezone,
  getIslamicDate,
  formatHijriDate,
  getCityAR,
  type SavedPrayerLocation,
  type CalcMethod,
} from "@/lib/prayer-data";
import {
  detectPrayerConflict,
  loadPrayerConflictPrefs,
  savePrayerConflictPrefs,
  DEFAULT_PRAYER_CONFLICT_PREFS,
  type PrayerConflictPrefs,
} from "@/lib/prayer-conflict";
import { getDayOccasions, type Occasion } from "@/lib/islamic-calendar";
import { buildMonthGrid, weekDatesFor, monthsOfYear, addDays } from "@/lib/calendar-grid";
import { loadEvents, addEvent, updateEvent, removeEvent, eventsForDate, type CalendarEvent } from "@/lib/calendar-events";
import { rescheduleEventReminders } from "@/lib/event-reminders";
import { CALENDAR_SOUND_OPTIONS, type CalendarSound, loadCalendarSound, saveCalendarSound, ensureCalendarAlarmChannels, ensureExactAlarmAllowed, openAlarmPermission } from "@/lib/calendar-alarm";
import { LocationPickerModal } from "@/components/location-picker-modal";

// Same defensive require() as components/date-picker.tsx: the native module
// has no web implementation, so guard it there and fall back to text inputs.
let DateTimePicker: any = null;
let DateTimePickerAndroid: any = null;
if (Platform.OS !== "web") {
  try {
    const mod = require("@react-native-community/datetimepicker");
    DateTimePicker = mod.default;
    DateTimePickerAndroid = mod.DateTimePickerAndroid;
  } catch {
    // fall back to text-input entry below
  }
}

type Lang = "nl" | "en" | "ar";
type ViewMode = "day" | "week" | "month" | "year";

function tx(lang: Lang, nl: string, en: string, ar: string): string {
  return lang === "ar" ? ar : lang === "en" ? en : nl;
}

// Promise-wrapped two-button Alert so handleSave can await the user's choice
// (prayer-time conflict, 2929). Resolves true = confirm, false = cancel.
function confirmAsync(title: string, message: string, confirmText: string, cancelText: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelText, style: "cancel", onPress: () => resolve(false) },
        { text: confirmText, onPress: () => resolve(true) },
      ],
      { cancelable: false },
    );
  });
}

// Display value is pre-formatted by the caller via dig() so it honours the
// app-wide numeral-system setting (roznama routes every number through dig()).
function MinuteStepper({ display, onDec, onInc, isRTL }: { display: string; onDec: () => void; onInc: () => void; isRTL: boolean }) {
  return (
    <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 14 }}>
      <Pressable onPress={onDec} hitSlop={8} style={({ pressed }) => [{ width: 30, height: 30, borderRadius: 15, backgroundColor: "#1B433215", alignItems: "center", justifyContent: "center" }, pressed && { opacity: 0.6 }]}>
        <MaterialIcons name="remove" size={16} color="#1B4332" />
      </Pressable>
      <Text style={{ fontSize: 15, fontWeight: "700", color: "#1B4332", minWidth: 34, textAlign: "center" }}>{display}</Text>
      <Pressable onPress={onInc} hitSlop={8} style={({ pressed }) => [{ width: 30, height: 30, borderRadius: 15, backgroundColor: "#1B433215", alignItems: "center", justifyContent: "center" }, pressed && { opacity: 0.6 }]}>
        <MaterialIcons name="add" size={16} color="#1B4332" />
      </Pressable>
    </View>
  );
}

/** Local (not UTC) "YYYY-MM-DD" -- avoids the off-by-one toISOString() gives west of UTC. */
function dateToISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseISODate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const day = Number(m[3]);
  const date = new Date(y, mo - 1, day);
  // new Date(y, m, d) normalizes an out-of-range day/month instead of failing
  // (2026-02-31 -> Mar 3), so only a round-trip check catches it.
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === day ? date : null;
}

/** Days in a Gregorian month (month0 = 0-based). Used to clamp navigation
 * that would otherwise overflow into a shorter target month (e.g. Jan 31 -> Feb). */
export function daysInMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate();
}

/**
 * Civil "today", advanced by one day once real time has passed today's
 * Maghrib at the saved prayer location -- mirrors the rollover getIslamicDate()
 * (lib/prayer-data.ts) applies internally, so the grid's "today" cell and
 * default selected day agree with the home pill (which shows the Hijri date
 * rolled the same way). No location -> no rollover.
 */
export function computeEffectiveToday(now: Date, loc: SavedPrayerLocation | null, method: CalcMethod): Date {
  if (!loc) return now;
  const maghrib = calculatePrayerTimes(now, loc.lat, loc.lng, method, loc.tz).maghrib;
  const [mH, mM] = maghrib.split(":").map(Number);
  const curMin = getCurrentMinutesInTimezone(now, loc.tz);
  return curMin >= mH * 60 + mM ? addDays(now, 1) : now;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** An occasion is renderable only once its vetted text lands (see islamic-calendar.ts's NO-FABRICATION RULE). */
function isContentComplete(occ: Occasion): boolean {
  return occ.detail !== undefined || occ.proofs.length > 0;
}

function dayHasContent(date: Date): boolean {
  const occ = getDayOccasions(date);
  return occ.day.some(isContentComplete) || occ.month.some(isContentComplete);
}

const MONTH_NAMES: Record<Lang, string[]> = {
  nl: ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  ar: ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"],
};

const WEEKDAY_FULL_NAMES: Record<Lang, string[]> = {
  nl: ["Zondag", "Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  ar: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"],
};

// Monday-first, matching buildMonthGrid/weekDatesFor -- keys into the
// existing date.mon../date.sun i18n dictionary entries.
const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const PRAYER_LABELS: Record<"fajr" | "dhuhr" | "asr" | "maghrib" | "isha", Record<Lang, string>> = {
  fajr: { nl: "Fajr", en: "Fajr", ar: "الفجر" },
  dhuhr: { nl: "Dhuhr", en: "Dhuhr", ar: "الظهر" },
  asr: { nl: "Asr", en: "Asr", ar: "العصر" },
  maghrib: { nl: "Maghrib", en: "Maghrib", ar: "المغرب" },
  isha: { nl: "Isha", en: "Isha", ar: "العشاء" },
};

const REMINDER_OPTIONS: { value: number | null; label: Record<Lang, string> }[] = [
  { value: null, label: { nl: "Geen", en: "None", ar: "بدون" } },
  { value: 0, label: { nl: "Op tijd", en: "At time", ar: "في الوقت" } },
  { value: 5, label: { nl: "5 min", en: "5 min", ar: "٥ دقائق" } },
  { value: 15, label: { nl: "15 min", en: "15 min", ar: "١٥ دقيقة" } },
  { value: 30, label: { nl: "30 min", en: "30 min", ar: "٣٠ دقيقة" } },
  { value: 60, label: { nl: "60 min", en: "60 min", ar: "٦٠ دقيقة" } },
];
// Non-null preset values — derived once so the "is this a custom value" check
// stays in sync if a preset chip is added/removed (2963).
const PRESET_REMINDERS = REMINDER_OPTIONS.map((o) => o.value).filter((v): v is number => v !== null);

export default function RoznamaScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ date?: string; view?: string }>();
  const { language, isRTL, t, numeralSystem, dig } = useI18n();
  const lang = language as Lang;

  const hasDateParam = typeof params.date === "string" && parseISODate(params.date) !== null;
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const fromParam = typeof params.date === "string" ? parseISODate(params.date) : null;
    return fromParam ?? new Date();
  });
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const v = params.view;
    return v === "day" || v === "week" || v === "month" || v === "year" ? v : "month";
  });

  // ---- prayer location/method (mirrors app/(tabs)/prayer-times.tsx) ----
  const [savedLocation, setSavedLocation] = useState<SavedPrayerLocation | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<CalcMethod>(CALC_METHODS[0]);
  // Applies the effectiveToday correction (below) exactly once, the first
  // time location/method load resolves -- not on every refocus, or browsing
  // to another month/day and tabbing back would snap back to today.
  const appliedTodayRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      Promise.all([AsyncStorage.getItem(PRAYER_LOCATION_KEY), AsyncStorage.getItem(PRAYER_METHOD_KEY)]).then(([locVal, methodVal]) => {
        let loc: SavedPrayerLocation | null = null;
        if (locVal) {
          try {
            loc = JSON.parse(locVal);
            setSavedLocation(loc);
          } catch {}
        }
        let method: CalcMethod = CALC_METHODS[0];
        if (methodVal) {
          const found = CALC_METHODS.find((m) => m.id === methodVal);
          if (found) {
            method = found;
            setSelectedMethod(found);
          }
        }
        if (!appliedTodayRef.current) {
          appliedTodayRef.current = true;
          if (!hasDateParam) setSelectedDate(computeEffectiveToday(new Date(), loc, method));
        }
      });
    }, []),
  );

  // A later navigation to /roznama?date=X while this screen stays mounted
  // (e.g. a notification tap) doesn't re-run the useState initializer above.
  useEffect(() => {
    if (typeof params.date !== "string") return;
    const parsed = parseISODate(params.date);
    if (parsed) setSelectedDate(parsed);
  }, [params.date]);

  // Civil "today" per computeEffectiveToday -- stays in sync with the same
  // location/method loaded above, for "is this cell today" highlighting and
  // the Today button (goToday below), so both agree with the home pill.
  const effectiveToday = useMemo(
    () => computeEffectiveToday(new Date(), savedLocation, selectedMethod),
    [savedLocation, selectedMethod],
  );

  // ---- events ----
  const [allEvents, setAllEvents] = useState<CalendarEvent[]>([]);
  const [dayEvents, setDayEvents] = useState<CalendarEvent[]>([]);
  const selectedISO = dateToISO(selectedDate);

  useEffect(() => {
    // Create the full-screen alarm channels (per sound) up front so the first
    // appointment's alarm has its channel. Replaces the old expo
    // calendar_events_v1 channel, which the Android path no longer uses.
    ensureCalendarAlarmChannels().catch(() => {});
    loadEvents().then(setAllEvents);
  }, []);
  useEffect(() => {
    eventsForDate(selectedISO).then(setDayEvents);
  }, [selectedISO]);

  // Dot-marking for every grid (month/week/year) reads the FULL list rather
  // than eventsForMonth: month/week grids include padding cells from the
  // adjacent month, and eventsForMonth would silently miss an event on those.
  const eventDateSet = useMemo(() => new Set(allEvents.map((e) => e.dateISO)), [allEvents]);

  async function afterMutation(iso: string = selectedISO) {
    await Promise.all([loadEvents().then(setAllEvents), eventsForDate(iso).then(setDayEvents)]);
    await rescheduleEventReminders(lang);
  }

  // ---- navigation ----
  function goToday() {
    setSelectedDate(effectiveToday);
  }
  function shift(dir: 1 | -1) {
    setSelectedDate((d) => {
      if (viewMode === "day") return addDays(d, dir);
      if (viewMode === "week") return addDays(d, dir * 7);
      if (viewMode === "month") {
        const n = new Date(d);
        n.setMonth(n.getMonth() + dir, 1);
        return n;
      }
      // Year nav keeps the month+day (unlike month nav above, which always
      // lands on day 1) -- clamp so e.g. 29 Feb 2024 +1y doesn't overflow to
      // 1 Mar 2025.
      const targetYear = d.getFullYear() + dir;
      const clampedDay = Math.min(d.getDate(), daysInMonth(targetYear, d.getMonth()));
      const n = new Date(d);
      n.setFullYear(targetYear, d.getMonth(), clampedDay);
      return n;
    });
  }

  // ---- grids ----
  const monthGrid = useMemo(
    () => buildMonthGrid(selectedDate.getFullYear(), selectedDate.getMonth()),
    [selectedDate.getFullYear(), selectedDate.getMonth()],
  );
  const occasionDateSet = useMemo(() => {
    const set = new Set<string>();
    for (const week of monthGrid) for (const d of week) if (dayHasContent(d)) set.add(dateToISO(d));
    return set;
  }, [monthGrid]);

  const weekDates = useMemo(() => weekDatesFor(selectedDate), [selectedDate]);

  const yearMonths = useMemo(() => {
    return monthsOfYear(selectedDate.getFullYear()).map(({ year, month0 }) => {
      const grid = buildMonthGrid(year, month0);
      const occSet = new Set<string>();
      for (const week of grid) for (const d of week) if (d.getMonth() === month0 && dayHasContent(d)) occSet.add(dateToISO(d));
      return { year, month0, grid, occSet };
    });
  }, [selectedDate.getFullYear()]);

  // Gregorian range (now the SECONDARY label — 2963).
  const rangeLabelGreg = useMemo(() => {
    if (viewMode === "year") return dig(selectedDate.getFullYear());
    if (viewMode === "month") return `${MONTH_NAMES[lang][selectedDate.getMonth()]} ${dig(selectedDate.getFullYear())}`;
    if (viewMode === "week") {
      const start = weekDates[0];
      const end = weekDates[6];
      const sameYear = start.getFullYear() === end.getFullYear();
      const sameMonth = start.getMonth() === end.getMonth() && sameYear;
      const startLabel = sameMonth
        ? dig(start.getDate())
        : `${dig(start.getDate())} ${MONTH_NAMES[lang][start.getMonth()]}${sameYear ? "" : ` ${dig(start.getFullYear())}`}`;
      return `${startLabel} - ${dig(end.getDate())} ${MONTH_NAMES[lang][end.getMonth()]} ${dig(end.getFullYear())}`;
    }
    return `${dig(selectedDate.getDate())} ${MONTH_NAMES[lang][selectedDate.getMonth()]} ${dig(selectedDate.getFullYear())}`;
  }, [viewMode, selectedDate, weekDates, lang, numeralSystem]);

  // Hijri range — now the PRIMARY label (2963). A Gregorian month/year spans two
  // Hijri ones, so month/year use the Hijri date of the selected day (approx).
  const rangeLabelHijri = useMemo(() => {
    const suffix = lang === "ar" ? "هـ" : "AH";
    const h = getIslamicDate(selectedDate, null);
    const hName = (d: { monthName: string; monthNameAR: string }) => (lang === "ar" ? d.monthNameAR : d.monthName);
    if (viewMode === "year") return `${dig(h.year)} ${suffix}`;
    if (viewMode === "month") return `${hName(h)} ${dig(h.year)} ${suffix}`;
    if (viewMode === "week") {
      const hs = getIslamicDate(weekDates[0], null);
      const he = getIslamicDate(weekDates[6], null);
      const startLabel = hs.month === he.month && hs.year === he.year
        ? dig(hs.day)
        : `${dig(hs.day)} ${hName(hs)}${hs.year !== he.year ? ` ${dig(hs.year)}` : ""}`;
      return `${startLabel} - ${dig(he.day)} ${hName(he)} ${dig(he.year)} ${suffix}`;
    }
    return formatHijriDate(h, lang, numeralSystem);
  }, [viewMode, selectedDate, weekDates, lang, numeralSystem]);

  // ---- day detail data ----
  const prayerTimesForDay = useMemo(() => {
    if (!savedLocation) return null;
    return calculatePrayerTimes(selectedDate, savedLocation.lat, savedLocation.lng, selectedMethod, savedLocation.tz);
  }, [selectedDate, savedLocation, selectedMethod]);

  const hijriForDay = useMemo(() => getIslamicDate(selectedDate, null), [selectedDate]);

  const dayOcc = useMemo(() => getDayOccasions(selectedDate), [selectedDate]);
  const fadila = [
    ...dayOcc.day.filter((o) => o.kind === "fadila" && isContentComplete(o)),
    ...dayOcc.month.filter((o) => o.kind === "fadila" && isContentComplete(o)),
  ];
  const bidah = [
    ...dayOcc.day.filter((o) => o.kind === "bidah" && isContentComplete(o)),
    ...dayOcc.month.filter((o) => o.kind === "bidah" && isContentComplete(o)),
  ];

  // ---- add/edit appointment modal ----
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formDate, setFormDate] = useState<Date>(selectedDate);
  const [formTime, setFormTime] = useState<Date>(new Date());
  const [formNote, setFormNote] = useState("");
  const [formReminder, setFormReminder] = useState<number | null>(null);
  const [customReminder, setCustomReminder] = useState(false); // custom minutes-before (2963)
  const [formLocation, setFormLocation] = useState(""); // appointment place (2963)
  const [showLocationPicker, setShowLocationPicker] = useState(false); // map picker (2972)
  const [formLat, setFormLat] = useState<number | null>(null); // exact picked coords (2972)
  const [formLng, setFormLng] = useState<number | null>(null);
  // Revealed only when the user overrides a Jumu'ah-time block by travelling (2929).
  const [formTravelCity, setFormTravelCity] = useState("");
  const [showTravelCity, setShowTravelCity] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [reminderSound, setReminderSound] = useState<CalendarSound>("default");
  useEffect(() => {
    loadCalendarSound().then(setReminderSound);
  }, []);
  // Prayer-time awareness prefs (2929): warn on daily prayers, block Jumu'ah.
  const [conflictPrefs, setConflictPrefs] = useState<PrayerConflictPrefs>(DEFAULT_PRAYER_CONFLICT_PREFS);
  useEffect(() => {
    loadPrayerConflictPrefs().then(setConflictPrefs);
  }, []);
  const updateConflictPrefs = useCallback(async (patch: Partial<PrayerConflictPrefs>) => {
    // Keep the updater pure (StrictMode/concurrent can double-invoke it): compute
    // next from the render-time value, set it plainly, persist alongside.
    const next = { ...conflictPrefs, ...patch };
    setConflictPrefs(next);
    try { await savePrayerConflictPrefs(next); } catch {}
  }, [conflictPrefs]);
  async function selectReminderSound(s: CalendarSound) {
    setReminderSound(s);
    try {
      await saveCalendarSound(s);
      // Reschedule so pending alarms move to the newly chosen sound's channel
      // (an Android channel's sound is immutable — see lib/calendar-alarm.ts).
      await rescheduleEventReminders(lang);
    } catch {
      // A notifee channel/schedule failure here is non-fatal — the choice is
      // saved and applies on the next reschedule; don't leave an unhandled reject.
    }
  }

  function openAddModal() {
    setEditingId(null);
    setFormTitle("");
    setFormDate(selectedDate);
    setFormTime(new Date());
    setFormNote("");
    setFormReminder(null);
    setCustomReminder(false);
    setFormLocation("");
    setFormLat(null);
    setFormLng(null);
    setFormTravelCity("");
    setShowTravelCity(false);
    setShowDatePicker(false);
    setShowTimePicker(false);
    setSaving(false);
    setModalVisible(true);
  }
  function openEditModal(ev: CalendarEvent) {
    setEditingId(ev.id);
    setFormTitle(ev.title);
    setFormDate(parseISODate(ev.dateISO) ?? selectedDate);
    const time = new Date();
    time.setHours(ev.hour, ev.minute, 0, 0);
    setFormTime(time);
    setFormNote(ev.note ?? "");
    setFormReminder(ev.reminderMinutesBefore);
    setCustomReminder(ev.reminderIsCustom ?? (ev.reminderMinutesBefore != null && !PRESET_REMINDERS.includes(ev.reminderMinutesBefore)));
    setFormLocation(ev.location ?? "");
    setFormLat(ev.lat ?? null);
    setFormLng(ev.lng ?? null);
    setFormTravelCity(ev.travelCity ?? "");
    setShowTravelCity(!!ev.travelCity);
    setShowDatePicker(false);
    setShowTimePicker(false);
    setSaving(false);
    setModalVisible(true);
  }
  async function handleSave() {
    if (saving) return;
    // Empty title used to return silently, so the (never truly disabled) save
    // button did nothing with no feedback — read as "it won't save".
    if (!formTitle.trim()) {
      Alert.alert(
        tx(lang, "Titel vereist", "Title required", "العنوان مطلوب"),
        tx(lang, "Voer een titel in voor de afspraak.", "Enter a title for the appointment.", "أدخل عنوانًا للموعد."),
      );
      return;
    }
    // Prayer-time awareness (2929): warn when the appointment lands in a daily
    // prayer window, and BLOCK Friday Dhuhr (Jumu'ah) unless the user says they
    // will be in another city — then ask for that city. Native two-button Alert
    // only (RN-web can't resolve it reliably), so web saves without the check.
    if (savedLocation && Platform.OS !== "web") {
      const times = calculatePrayerTimes(formDate, savedLocation.lat, savedLocation.lng, selectedMethod, savedLocation.tz);
      const conflict = detectPrayerConflict(formDate, formTime.getHours(), formTime.getMinutes(), times, conflictPrefs);
      if (conflict.kind === "jumuah" && !formTravelCity.trim()) {
        const homeCity = lang === "ar" ? getCityAR(savedLocation.city) : savedLocation.city;
        const travelling = await confirmAsync(
          tx(lang, "Vrijdaggebed (Jumu'ah)", "Friday prayer (Jumu'ah)", "صلاة الجمعة"),
          tx(lang,
            `Dit valt in de tijd van het vrijdaggebed, verplicht voor wie in zijn stad (${homeCity}) woont.\n\n«Wanneer op vrijdag tot het gebed wordt opgeroepen, haast je dan naar het gedenken van Allaah en laat de handel» [al-Djumu'ah: 9].\n\nBen je in een andere stad?`,
            `This falls during the Friday prayer, obligatory for a resident of his city (${homeCity}).\n\n"When the call is made for prayer on Friday, hasten to the remembrance of Allaah and leave off trade" [al-Jumu'ah: 9].\n\nWill you be in another city?`,
            `هذا الموعد في وقت صلاة الجمعة، وهي واجبة على المقيم في مدينته (${homeCity}).\n\n﴿إِذَا نُودِيَ لِلصَّلَاةِ مِنْ يَوْمِ الْجُمُعَةِ فَاسْعَوْا إِلَىٰ ذِكْرِ اللَّهِ وَذَرُوا الْبَيْعَ﴾ [الجمعة: ٩].\n\nأستكون في مدينة أخرى؟`),
          tx(lang, "In een andere stad", "In another city", "نعم، في مدينة أخرى"),
          tx(lang, "In mijn stad", "In my city", "لا، في مدينتي"),
        );
        if (!travelling) return; // Jumu'ah is in the home city — block the booking.
        setShowTravelCity(true); // reveal the city field; the user fills it and saves again.
        return;
      }
      if (conflict.kind === "daily" && conflict.prayer) {
        const pn = tx(lang, PRAYER_LABELS[conflict.prayer].nl, PRAYER_LABELS[conflict.prayer].en, PRAYER_LABELS[conflict.prayer].ar);
        const proceed = await confirmAsync(
          tx(lang, "Gebedstijd", "Prayer time", "وقت صلاة"),
          tx(lang,
            `Deze afspraak valt in de tijd van het ${pn}-gebed.\n\n«Het gebed is de gelovigen voorgeschreven op vaste tijden» [an-Nisa': 103]. Wie dicht bij de moskee woont, bidt het in gemeenschap, behalve bij noodzaak.\n\nToch opslaan?`,
            `This appointment falls during ${pn} prayer time.\n\n"Prayer has been decreed upon the believers at fixed times" [an-Nisa': 103]. One living near the mosque prays it in congregation, except out of necessity.\n\nSave anyway?`,
            `هذا الموعد في وقت صلاة ${pn}.\n\n﴿إِنَّ الصَّلَاةَ كَانَتْ عَلَى الْمُؤْمِنِينَ كِتَابًا مَوْقُوتًا﴾ [النساء: ١٠٣]. ومن كان قريبًا من المسجد وجب عليه أداؤها جماعةً إلا لضرورة.\n\nأتحفظه مع ذلك؟`),
          tx(lang, "Toch opslaan", "Save anyway", "احفظ مع ذلك"),
          tx(lang, "Tijd wijzigen", "Change time", "تغيير الوقت"),
        );
        if (!proceed) return;
      }
    }
    setSaving(true);
    try {
      const savedDate = formDate;
      const data = {
        title: formTitle.trim(),
        dateISO: dateToISO(savedDate),
        hour: formTime.getHours(),
        minute: formTime.getMinutes(),
        note: formNote.trim() || undefined,
        reminderMinutesBefore: formReminder,
        reminderIsCustom: customReminder || undefined,
        location: formLocation.trim() || undefined,
        lat: formLat ?? undefined,
        lng: formLng ?? undefined,
        travelCity: formTravelCity.trim() || undefined,
      };
      if (editingId) await updateEvent(editingId, data);
      else await addEvent(data);
      // The appointment is now persisted. Everything below is UI refresh only:
      // its failure must NOT surface as "save failed" (that misled the user
      // into thinking nothing saved, and re-adding a duplicate). setSelectedDate
      // re-fires the day-load effect, so the list refreshes even if afterMutation
      // (reload + notification reschedule) rejects.
      setModalVisible(false);
      // Jump the calendar to the day the appointment lands on. Without this a
      // future-dated appointment saved fine but stayed invisible (the view was
      // still on today), which read as "it didn't save".
      setSelectedDate(savedDate);
      afterMutation(dateToISO(savedDate)).catch(() => {});
      // An alarm needs the exact-alarm ("Alarms & reminders") permission to ring
      // on time on Android 13/14. Prompt ONCE — a user who chose "Later" isn't
      // re-nagged on every save. Own try/catch: this is UI-only after an already
      // persisted appointment, so a storage error here must not trip the
      // "save failed" alert below.
      try {
        if (Platform.OS === "android" && formReminder != null && !(await ensureExactAlarmAllowed())) {
          const asked = await AsyncStorage.getItem("@calendar_alarm_perm_asked");
          if (!asked) {
            await AsyncStorage.setItem("@calendar_alarm_perm_asked", "1");
            Alert.alert(
              tx(lang, "Alarmtoestemming", "Alarm permission", "إذن المنبّه"),
              tx(lang,
                "Sta 'Wekkers en herinneringen' toe zodat de afspraakalarm op tijd afgaat.",
                "Allow 'Alarms & reminders' so the appointment alarm rings on time.",
                "اسمح بـ«المنبّهات والتذكيرات» ليعمل منبّه الموعد في وقته."),
              [
                { text: tx(lang, "Later", "Later", "لاحقًا"), style: "cancel" },
                { text: tx(lang, "Instellingen", "Settings", "الإعدادات"), onPress: () => { openAlarmPermission(); } },
              ],
            );
          }
        }
      } catch {}
    } catch (e) {
      // Diagnostic (2946): "Opslaan mislukt" only fires from addEvent/updateEvent
      // (AsyncStorage). The save logic is device-agnostic, so surface the actual
      // error to pinpoint a device/storage cause. Temporary — trim once diagnosed.
      const detail = String((e as any)?.message ?? e ?? "").slice(0, 300);
      Alert.alert(
        tx(lang, "Opslaan mislukt", "Save failed", "تعذّر الحفظ"),
        tx(lang, "Probeer het opnieuw.", "Please try again.", "يرجى المحاولة مرة أخرى.") + (detail ? `\n\n[${detail}]` : ""),
      );
    } finally {
      setSaving(false);
    }
  }
  async function handleDelete(id: string) {
    await removeEvent(id);
    setModalVisible(false);
    await afterMutation();
  }

  function pickDate() {
    if (Platform.OS === "android" && DateTimePickerAndroid) {
      DateTimePickerAndroid.open({
        value: formDate,
        mode: "date",
        onChange: (_e: any, d?: Date) => {
          if (d) setFormDate(d);
        },
      });
    } else {
      setShowDatePicker((v) => !v);
    }
  }
  function pickTime() {
    if (Platform.OS === "android" && DateTimePickerAndroid) {
      DateTimePickerAndroid.open({
        value: formTime,
        mode: "time",
        is24Hour: true,
        onChange: (_e: any, d?: Date) => {
          if (d) setFormTime(d);
        },
      });
    } else {
      setShowTimePicker((v) => !v);
    }
  }

  // ============ RENDER HELPERS ============

  function renderMonthView() {
    return (
      <View>
        <View style={[st.weekdayRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          {WEEKDAY_KEYS.map((k) => (
            <Text key={k} style={st.weekdayLabel}>
              {t(`date.${k}`)}
            </Text>
          ))}
        </View>
        {monthGrid.map((week, wi) => (
          <View key={wi} style={{ flexDirection: isRTL ? "row-reverse" : "row" }}>
            {week.map((cellDate, di) => {
              const inMonth = cellDate.getMonth() === selectedDate.getMonth();
              const iso = dateToISO(cellDate);
              const isToday = sameDay(cellDate, effectiveToday);
              const hijriDay = getIslamicDate(cellDate, null).day;
              return (
                <Pressable
                  key={di}
                  onPress={() => {
                    setSelectedDate(cellDate);
                    setViewMode("day");
                  }}
                  style={[st.gridCell, isToday && st.gridCellToday]}
                >
                  {/* Hijri primary (big), Gregorian secondary (small) — 2963 */}
                  <Text style={[st.gridCellPrimary, !inMonth && st.gridCellFaded, isToday && st.gridCellTodayText]}>
                    {dig(hijriDay)}
                  </Text>
                  <Text style={[st.gridCellSecondary, !inMonth && st.gridCellFaded]}>{dig(cellDate.getDate())}</Text>
                  <View style={[st.dotRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                    {occasionDateSet.has(iso) && <View style={[st.dot, st.dotGold]} />}
                    {eventDateSet.has(iso) && <View style={[st.dot, st.dotBlue]} />}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    );
  }

  function renderWeekView() {
    return (
      <View>
        <View style={[st.weekStripRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          {weekDates.map((d, i) => {
            const iso = dateToISO(d);
            const isToday = sameDay(d, effectiveToday);
            const isSelected = sameDay(d, selectedDate);
            return (
              <Pressable key={i} onPress={() => setSelectedDate(d)} style={[st.weekDayCell, isSelected && st.weekDayCellActive]}>
                <Text style={[st.weekDayLabel, isSelected && st.weekDayLabelActive]}>{t(`date.${WEEKDAY_KEYS[i]}`)}</Text>
                <Text style={[st.weekDayNumber, isSelected && st.weekDayLabelActive, isToday && !isSelected && { color: "#C4A35A" }]}>
                  {dig(d.getDate())}
                </Text>
                <View style={[st.dotRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                  {occasionDateSet.has(iso) && <View style={[st.dot, st.dotGold]} />}
                  {eventDateSet.has(iso) && <View style={[st.dot, st.dotBlue]} />}
                </View>
              </Pressable>
            );
          })}
        </View>
        {renderDayDetail()}
      </View>
    );
  }

  function renderOccasionCard(occ: Occasion) {
    const isBidah = occ.kind === "bidah";
    return (
      <View key={occ.id} style={[st.card, isBidah ? st.cardBidah : st.cardFadila]}>
        <View style={[st.occHeaderRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          {isBidah && <MaterialIcons name="warning" size={16} color="#B45309" />}
          <Text style={[st.cardTitle, isBidah && st.cardTitleBidah]}>{occ.title[lang]}</Text>
          {occ.fasting === "recommended" && (
            <View style={st.fastingBadge}>
              <Text style={st.fastingText}>{tx(lang, "Vasten", "Fasting", "صيام")}</Text>
            </View>
          )}
          {occ.fasting === "prohibited" && (
            <View style={[st.fastingBadge, st.fastingBadgeProhibited]}>
              <Text style={[st.fastingText, st.fastingTextProhibited]}>{tx(lang, "Niet vasten", "No fasting", "لا صيام")}</Text>
            </View>
          )}
        </View>
        {occ.detail && <Text style={st.cardDetail}>{occ.detail[lang]}</Text>}
        {occ.proofs.map((p, i) => (
          <Text key={i} style={st.cardEvidence}>
            {p.text[lang]}
          </Text>
        ))}
        {occ.preparation && (
          <View style={[st.cardExtra, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <MaterialIcons name="checklist" size={12} color="#6B7B72" />
            <Text style={st.cardExtraText}>{occ.preparation[lang]}</Text>
          </View>
        )}
        {occ.parentAction && (
          <View style={[st.cardExtra, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <MaterialIcons name="family-restroom" size={12} color="#6B7B72" />
            <Text style={st.cardExtraText}>{occ.parentAction[lang]}</Text>
          </View>
        )}
      </View>
    );
  }

  function renderDayDetail() {
    const weekdayName = WEEKDAY_FULL_NAMES[lang][selectedDate.getDay()];
    const gregorianLabel = `${dig(selectedDate.getDate())} ${MONTH_NAMES[lang][selectedDate.getMonth()]} ${dig(selectedDate.getFullYear())}`;

    return (
      <View>
        <View style={st.dayHeaderBox}>
          <Text style={st.dayHeaderWeekday}>{weekdayName}</Text>
          {/* Hijri primary (big), Gregorian secondary (small) — 2963 */}
          <Text style={st.dayHeaderPrimary}>{formatHijriDate(hijriForDay, lang, numeralSystem)}</Text>
          <Text style={st.dayHeaderSecondary}>{gregorianLabel}</Text>
        </View>

        <View style={st.card}>
          <Text style={st.cardTitle}>{tx(lang, "Gebedstijden", "Prayer times", "أوقات الصلاة")}</Text>
          {!savedLocation ? (
            <Text style={st.hintText}>
              {tx(
                lang,
                "Stel uw locatie in bij Instellingen om gebedstijden te zien.",
                "Set your location in Settings to see prayer times.",
                "قم بتعيين موقعك في الإعدادات لعرض أوقات الصلاة.",
              )}
            </Text>
          ) : prayerTimesForDay ? (
            <View style={[st.prayerRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              {(["fajr", "dhuhr", "asr", "maghrib", "isha"] as const).map((p) => (
                <View key={p} style={st.prayerItem}>
                  <Text style={st.prayerName}>{PRAYER_LABELS[p][lang]}</Text>
                  <Text style={st.prayerTime}>{dig(prayerTimesForDay[p])}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        {fadila.map((occ) => renderOccasionCard(occ))}
        {bidah.map((occ) => renderOccasionCard(occ))}
        {fadila.length === 0 && bidah.length === 0 && (
          <View style={st.card}>
            <Text style={st.cardTitle}>{t("home.no_special_today")}</Text>
            <Text style={st.hintText}>{t("home.regular_day")}</Text>
          </View>
        )}

        <View style={[st.sectionHeaderRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <Text style={st.sectionTitle}>{tx(lang, "Mijn afspraken", "My appointments", "مواعيدي")}</Text>
          <Pressable onPress={openAddModal} style={({ pressed }) => [st.addBtn, pressed && { opacity: 0.7 }]}>
            <MaterialIcons name="add" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
        {dayEvents.length === 0 ? (
          <Text style={st.hintText}>{tx(lang, "Geen afspraken op deze dag", "No appointments on this day", "لا توجد مواعيد في هذا اليوم")}</Text>
        ) : (
          dayEvents.map((ev) => (
            <View key={ev.id} style={[st.apptRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <Text style={st.apptTime}>
                {dig(String(ev.hour).padStart(2, "0"))}:{dig(String(ev.minute).padStart(2, "0"))}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={st.apptTitle}>{ev.title}</Text>
                {ev.note ? <Text style={st.apptNote}>{ev.note}</Text> : null}
                {ev.location ? (
                  <Pressable
                    onPress={() => Linking.openURL(
                      ev.lat != null && ev.lng != null
                        ? `https://www.google.com/maps/search/?api=1&query=${ev.lat},${ev.lng}` // exact picked pin
                        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ev.location!)}`
                    ).catch(() => {})}
                    style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 4, marginTop: 2 }}
                  >
                    <MaterialIcons name="place" size={13} color="#1B4332" />
                    <Text style={st.apptLocation}>{ev.location}</Text>
                  </Pressable>
                ) : null}
              </View>
              <Pressable onPress={() => openEditModal(ev)} style={({ pressed }) => [st.apptIconBtn, pressed && { opacity: 0.6 }]}>
                <MaterialIcons name="edit" size={18} color="#6B7B72" />
              </Pressable>
              <Pressable onPress={() => {
                if (Platform.OS === "web") { handleDelete(ev.id); return; }
                Alert.alert(
                  tx(lang, "Afspraak verwijderen?", "Delete appointment?", "حذف الموعد؟"),
                  ev.title,
                  [
                    { text: tx(lang, "Annuleren", "Cancel", "إلغاء"), style: "cancel" },
                    { text: tx(lang, "Verwijderen", "Delete", "حذف"), style: "destructive", onPress: () => handleDelete(ev.id) },
                  ],
                );
              }} style={({ pressed }) => [st.apptIconBtn, pressed && { opacity: 0.6 }]}>
                <MaterialIcons name="delete-outline" size={18} color="#C62828" />
              </Pressable>
            </View>
          ))
        )}
      </View>
    );
  }

  function renderYearView() {
    return (
      <View style={[st.yearGrid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        {yearMonths.map(({ year, month0, grid, occSet }) => (
          <Pressable
            key={month0}
            onPress={() => {
              setSelectedDate(new Date(year, month0, 1));
              setViewMode("month");
            }}
            style={({ pressed }) => [st.miniMonth, pressed && { opacity: 0.85 }]}
          >
            <Text style={st.miniMonthTitle}>{MONTH_NAMES[lang][month0]}</Text>
            {grid.map((week, wi) => (
              <View key={wi} style={{ flexDirection: isRTL ? "row-reverse" : "row" }}>
                {week.map((d, di) => {
                  const inMonth = d.getMonth() === month0;
                  const iso = dateToISO(d);
                  const isToday = inMonth && sameDay(d, effectiveToday);
                  return (
                    <View key={di} style={[st.miniCell, isToday && st.miniCellToday]}>
                      {inMonth && <Text style={st.miniCellText}>{dig(d.getDate())}</Text>}
                      {inMonth && (
                        <View style={[st.miniDotRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                          {occSet.has(iso) && <View style={[st.miniDot, st.dotGold]} />}
                          {eventDateSet.has(iso) && <View style={[st.miniDot, st.dotBlue]} />}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            ))}
          </Pressable>
        ))}
      </View>
    );
  }

  function renderModal() {
    return (
      <>
      <Modal
        // Hide the form while the map picker is up: only one RN Modal visible at
        // a time (iOS rejects presenting a second modal over a live one). Form
        // state is React state, so it survives the hide/show. (2972)
        visible={modalVisible && !showLocationPicker}
        transparent
        animationType="slide"
        supportedOrientations={["portrait", "portrait-upside-down", "landscape"]}
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={st.modalOverlay}>
          <View style={st.modalContent}>
            <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={[st.modalHeaderRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                <Text style={st.modalTitle}>
                  {editingId ? tx(lang, "Afspraak bewerken", "Edit appointment", "تعديل الموعد") : tx(lang, "Nieuwe afspraak", "New appointment", "موعد جديد")}
                </Text>
                <Pressable onPress={() => setModalVisible(false)}>
                  <MaterialIcons name="close" size={24} color="#6B7B72" />
                </Pressable>
              </View>

              <Text style={st.fieldLabel}>{tx(lang, "Titel", "Title", "العنوان")}</Text>
              <TextInput
                value={formTitle}
                onChangeText={setFormTitle}
                style={[st.textInput, { textAlign: isRTL ? "right" : "left" }]}
                placeholder={tx(lang, "Bijv. Tandarts", "E.g. Dentist", "مثال: طبيب الأسنان")}
                placeholderTextColor="#9CA3AF"
                maxLength={100}
              />

              {Platform.OS === "web" ? (
                <View style={[st.fieldRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.fieldLabel}>{tx(lang, "Datum", "Date", "التاريخ")}</Text>
                    <TextInput
                      value={dateToISO(formDate)}
                      onChangeText={(v) => {
                        const d = parseISODate(v);
                        if (d) setFormDate(d);
                      }}
                      style={st.textInput}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor="#9CA3AF"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.fieldLabel}>{tx(lang, "Tijd", "Time", "الوقت")}</Text>
                    <TextInput
                      value={`${String(formTime.getHours()).padStart(2, "0")}:${String(formTime.getMinutes()).padStart(2, "0")}`}
                      onChangeText={(v) => {
                        const m = /^(\d{1,2}):(\d{2})$/.exec(v);
                        if (!m) return;
                        const time = new Date(formTime);
                        time.setHours(Number(m[1]), Number(m[2]), 0, 0);
                        setFormTime(time);
                      }}
                      style={st.textInput}
                      placeholder="HH:MM"
                      placeholderTextColor="#9CA3AF"
                    />
                  </View>
                </View>
              ) : (
                <View style={[st.fieldRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.fieldLabel}>{tx(lang, "Datum", "Date", "التاريخ")}</Text>
                    <Pressable onPress={pickDate} style={st.pickerField}>
                      <Text style={st.pickerFieldText}>{dig(dateToISO(formDate))}</Text>
                    </Pressable>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.fieldLabel}>{tx(lang, "Tijd", "Time", "الوقت")}</Text>
                    <Pressable onPress={pickTime} style={st.pickerField}>
                      <Text style={st.pickerFieldText}>
                        {dig(String(formTime.getHours()).padStart(2, "0"))}:{dig(String(formTime.getMinutes()).padStart(2, "0"))}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              )}
              {showDatePicker && DateTimePicker && (
                <DateTimePicker
                  value={formDate}
                  mode="date"
                  display="spinner"
                  onChange={(_e: any, d?: Date) => {
                    if (d) setFormDate(d);
                  }}
                />
              )}
              {showTimePicker && DateTimePicker && (
                <DateTimePicker
                  value={formTime}
                  mode="time"
                  display="spinner"
                  is24Hour
                  onChange={(_e: any, d?: Date) => {
                    if (d) setFormTime(d);
                  }}
                />
              )}

              <Text style={st.fieldLabel}>{tx(lang, "Notitie (optioneel)", "Note (optional)", "ملاحظة (اختياري)")}</Text>
              <TextInput
                value={formNote}
                onChangeText={setFormNote}
                style={[st.textInput, { textAlign: isRTL ? "right" : "left" }]}
                placeholder={tx(lang, "Extra details...", "Extra details...", "تفاصيل إضافية...")}
                placeholderTextColor="#9CA3AF"
                multiline
                maxLength={500}
              />

              <Text style={st.fieldLabel}>{tx(lang, "Locatie (optioneel)", "Location (optional)", "الموقع (اختياري)")}</Text>
              <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 8 }}>
                <TextInput
                  value={formLocation}
                  onChangeText={(t) => { setFormLocation(t); setFormLat(null); setFormLng(null); }}
                  style={[st.textInput, { flex: 1, marginBottom: 0, textAlign: isRTL ? "right" : "left" }]}
                  placeholder={tx(lang, "Plaats of adres...", "Place or address...", "المكان أو العنوان...")}
                  placeholderTextColor="#9CA3AF"
                  maxLength={120}
                />
                <Pressable
                  onPress={() => {
                    // react-native-webview is a stub on web, so the map picker
                    // can't run there — fall back to opening maps (web users also
                    // have the manual text field above). (2972)
                    if (Platform.OS === "web") {
                      const q = formLocation.trim();
                      Linking.openURL(q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : "https://www.google.com/maps").catch(() => {});
                    } else {
                      setShowLocationPicker(true);
                    }
                  }}
                  style={({ pressed }) => [st.mapsBtn, { flexDirection: isRTL ? "row-reverse" : "row" }, pressed && { opacity: 0.7 }]}
                >
                  <MaterialIcons name="add-location-alt" size={18} color="#1B4332" />
                  <Text style={st.mapsBtnText}>{tx(lang, "Kies", "Pick", "تحديد")}</Text>
                </Pressable>
              </View>

              {showTravelCity && (
                <>
                  <Text style={st.fieldLabel}>{tx(lang, "Stad (je reist tijdens Jumu'ah)", "City (travelling during Jumu'ah)", "المدينة (مسافر وقت الجمعة)")}</Text>
                  <TextInput
                    value={formTravelCity}
                    onChangeText={setFormTravelCity}
                    style={[st.textInput, { textAlign: isRTL ? "right" : "left" }]}
                    placeholder={tx(lang, "Naam van de stad", "City name", "اسم المدينة")}
                    placeholderTextColor="#9CA3AF"
                    maxLength={80}
                    autoFocus
                  />
                </>
              )}

              <Text style={st.fieldLabel}>{tx(lang, "Herinnering", "Reminder", "التذكير")}</Text>
              <View style={[st.reminderRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                {REMINDER_OPTIONS.map((opt) => {
                  const active = !customReminder && formReminder === opt.value;
                  return (
                    <Pressable
                      key={String(opt.value)}
                      onPress={() => { setCustomReminder(false); setFormReminder(opt.value); }}
                      style={[st.reminderChip, active && st.reminderChipActive]}
                    >
                      <Text style={[st.reminderChipText, active && st.reminderChipTextActive]}>{opt.label[lang]}</Text>
                    </Pressable>
                  );
                })}
                {/* Custom minutes-before (2963) */}
                <Pressable
                  onPress={() => { setCustomReminder(true); setFormReminder((v) => (v == null || PRESET_REMINDERS.includes(v) ? 120 : v)); }}
                  style={[st.reminderChip, customReminder && st.reminderChipActive]}
                >
                  <Text style={[st.reminderChipText, customReminder && st.reminderChipTextActive]}>{tx(lang, "Aangepast", "Custom", "مخصّص")}</Text>
                </Pressable>
              </View>
              {customReminder && (
                <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "center", gap: 16, marginTop: 10 }}>
                  <Pressable onPress={() => setFormReminder((v) => Math.max(5, (v ?? 120) - 5))} hitSlop={8} style={({ pressed }) => [st.stepBtn, pressed && { opacity: 0.6 }]}>
                    <MaterialIcons name="remove" size={18} color="#1B4332" />
                  </Pressable>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: "#1B4332", minWidth: 120, textAlign: "center" }}>
                    {tx(lang, `${dig(formReminder ?? 120)} min ervoor`, `${dig(formReminder ?? 120)} min before`, `قبل بـ ${dig(formReminder ?? 120)} ${(formReminder ?? 120) <= 10 ? "دقائق" : "دقيقة"}`)}
                  </Text>
                  <Pressable onPress={() => setFormReminder((v) => Math.min(720, (v ?? 120) + 5))} hitSlop={8} style={({ pressed }) => [st.stepBtn, pressed && { opacity: 0.6 }]}>
                    <MaterialIcons name="add" size={18} color="#1B4332" />
                  </Pressable>
                </View>
              )}

            </ScrollView>
            {/* Pinned footer: the save/delete buttons stay visible in any
                condition (tall form, short screen, system nav bar) instead of
                scrolling off the bottom of the sheet. insets.bottom clears the
                Android gesture/nav bar. */}
            <View style={[st.modalFooter, { paddingBottom: insets.bottom + 16 }]}>
              <Pressable
                onPress={handleSave}
                disabled={!formTitle.trim() || saving}
                style={({ pressed }) => [st.saveBtn, (!formTitle.trim() || saving) && { opacity: 0.5 }, pressed && { opacity: 0.85 }]}
              >
                <Text style={st.saveBtnText}>{tx(lang, "Opslaan", "Save", "حفظ")}</Text>
              </Pressable>
              {editingId && (
                <Pressable onPress={() => {
                  if (Platform.OS === "web") { handleDelete(editingId!); return; }
                  Alert.alert(
                    tx(lang, "Afspraak verwijderen?", "Delete appointment?", "حذف الموعد؟"),
                    formTitle,
                    [
                      { text: tx(lang, "Annuleren", "Cancel", "إلغاء"), style: "cancel" },
                      { text: tx(lang, "Verwijderen", "Delete", "حذف"), style: "destructive", onPress: () => handleDelete(editingId!) },
                    ],
                  );
                }} style={({ pressed }) => [st.deleteBtn, pressed && { opacity: 0.85 }]}>
                  <Text style={st.deleteBtnText}>{tx(lang, "Verwijderen", "Delete", "حذف")}</Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>
      <LocationPickerModal
        visible={showLocationPicker}
        lang={lang}
        isRTL={isRTL}
        initialCenter={savedLocation ? { lat: savedLocation.lat, lng: savedLocation.lng } : null}
        initialSelection={formLat != null && formLng != null ? { lat: formLat, lng: formLng, address: formLocation } : null}
        onPick={(r) => { setFormLocation(r.address); setFormLat(r.lat); setFormLng(r.lng); setShowLocationPicker(false); }}
        onClose={() => setShowLocationPicker(false)}
      />
      </>
    );
  }

  const SEGMENTS: { mode: ViewMode; label: string }[] = [
    { mode: "day", label: tx(lang, "Dag", "Day", "يوم") },
    { mode: "week", label: tx(lang, "Week", "Week", "أسبوع") },
    { mode: "month", label: tx(lang, "Maand", "Month", "شهر") },
    { mode: "year", label: tx(lang, "Jaar", "Year", "سنة") },
  ];

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={[st.topBar, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [st.iconBtn, pressed && { opacity: 0.5 }]}>
          <MaterialIcons name={isRTL ? "chevron-right" : "chevron-left"} size={28} color="#1B4332" />
        </Pressable>
        <Text style={st.topTitle}>{tx(lang, "Kalender", "Calendar", "التقويم")}</Text>
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row" }}>
          <Pressable onPress={goToday} style={({ pressed }) => [st.iconBtn, pressed && { opacity: 0.5 }]}>
            <MaterialIcons name="today" size={22} color="#C4A35A" />
          </Pressable>
          <Pressable onPress={() => setSettingsVisible(true)} style={({ pressed }) => [st.iconBtn, pressed && { opacity: 0.5 }]}>
            <MaterialIcons name="settings" size={22} color="#6B7B72" />
          </Pressable>
        </View>
      </View>

      <View style={[st.segmentRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        {SEGMENTS.map(({ mode, label }) => (
          <Pressable key={mode} onPress={() => setViewMode(mode)} style={[st.segment, viewMode === mode && st.segmentActive]}>
            <Text style={[st.segmentText, viewMode === mode && st.segmentTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={[st.navRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <Pressable onPress={() => shift(-1)} style={({ pressed }) => [st.iconBtn, pressed && { opacity: 0.5 }]}>
          <MaterialIcons name={isRTL ? "chevron-right" : "chevron-left"} size={22} color="#1B4332" />
        </Pressable>
        <View style={{ alignItems: "center", flex: 1 }}>
          <Text style={st.navLabel}>{rangeLabelHijri}</Text>
          <Text style={st.navLabelGreg}>{rangeLabelGreg}</Text>
        </View>
        <Pressable onPress={() => shift(1)} style={({ pressed }) => [st.iconBtn, pressed && { opacity: 0.5 }]}>
          <MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={22} color="#1B4332" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40, paddingHorizontal: 16 }} showsVerticalScrollIndicator={false}>
        {viewMode === "month" && renderMonthView()}
        {viewMode === "week" && renderWeekView()}
        {viewMode === "day" && renderDayDetail()}
        {viewMode === "year" && renderYearView()}
      </ScrollView>

      {/* Roznama settings: appointment-alarm sound picker */}
      <Modal visible={settingsVisible} transparent animationType="slide" supportedOrientations={["portrait", "portrait-upside-down", "landscape"]} onRequestClose={() => setSettingsVisible(false)}>
        <View style={st.modalOverlay}>
          <View style={st.modalContent}>
            <View style={[st.modalHeaderRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <Text style={st.modalTitle}>{tx(lang, "Kalenderinstellingen", "Calendar settings", "إعدادات التقويم")}</Text>
              <Pressable onPress={() => setSettingsVisible(false)}>
                <MaterialIcons name="close" size={24} color="#6B7B72" />
              </Pressable>
            </View>
            <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false}>
            {Platform.OS === "android" ? (
              <>
                <Text style={st.fieldLabel}>{tx(lang, "Alarmgeluid afspraak", "Appointment alarm sound", "صوت منبّه الموعد")}</Text>
                <Text style={{ fontSize: 12, color: "#6B7B72", marginBottom: 10, textAlign: isRTL ? "right" : "left" }}>
                  {tx(lang,
                    "De herinnering verschijnt schermvullend en klinkt tot je hem sluit.",
                    "The reminder appears full-screen and rings until you dismiss it.",
                    "يظهر التنبيه بملء الشاشة ويرنّ حتى تُغلقه.")}
                </Text>
                {CALENDAR_SOUND_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.id}
                    onPress={() => selectReminderSound(opt.id)}
                    style={({ pressed }) => [{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", paddingVertical: 12 }, pressed && { opacity: 0.6 }]}
                  >
                    <MaterialIcons
                      name={reminderSound === opt.id ? "radio-button-checked" : "radio-button-unchecked"}
                      size={22}
                      color={reminderSound === opt.id ? "#1B4332" : "#9CA3AF"}
                    />
                    <Text style={{ fontSize: 15, color: "#1B4332", marginHorizontal: 10 }}>
                      {tx(lang, opt.nameNl, opt.nameEn, opt.nameAr)}
                    </Text>
                  </Pressable>
                ))}
              </>
            ) : (
              <Text style={{ fontSize: 13, color: "#6B7B72", textAlign: isRTL ? "right" : "left" }}>
                {tx(lang,
                  "Op iPhone klinkt de afspraakherinnering met de standaardtoon.",
                  "On iPhone the appointment reminder uses the default tone.",
                  "على الآيفون يُنبّهك الموعد بالنغمة الافتراضية.")}
              </Text>
            )}

            {/* Prayer-time awareness (2929) */}
            <View style={{ height: 1, backgroundColor: "#E5E7EB", marginVertical: 14 }} />
            <Text style={st.fieldLabel}>{tx(lang, "Gebedstijden", "Prayer times", "أوقات الصلاة")}</Text>
            <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 }}>
              <Text style={{ flex: 1, fontSize: 14, color: "#1B4332", textAlign: isRTL ? "right" : "left" }}>
                {tx(lang, "Waarschuwen bij gebedstijd", "Warn at prayer time", "التنبيه عند وقت الصلاة")}
              </Text>
              <Switch value={conflictPrefs.enabled} onValueChange={() => updateConflictPrefs({ enabled: !conflictPrefs.enabled })} />
            </View>
            {conflictPrefs.enabled && (
              <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4, paddingHorizontal: 6 }}>
                <Text style={{ fontSize: 13, color: "#6B7B72", textAlign: isRTL ? "right" : "left" }}>{tx(lang, "Gebedsvenster (min)", "Prayer window (min)", "نافذة الصلاة (دقائق)")}</Text>
                <MinuteStepper display={dig(conflictPrefs.dailyWindowMinutes)} isRTL={isRTL}
                  onDec={() => updateConflictPrefs({ dailyWindowMinutes: Math.max(5, conflictPrefs.dailyWindowMinutes - 5) })}
                  onInc={() => updateConflictPrefs({ dailyWindowMinutes: Math.min(60, conflictPrefs.dailyWindowMinutes + 5) })} />
              </View>
            )}
            <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 }}>
              <Text style={{ flex: 1, fontSize: 14, color: "#1B4332", textAlign: isRTL ? "right" : "left" }}>
                {tx(lang, "Afspraken blokkeren tijdens Jumu'ah", "Block appointments during Jumu'ah", "منع المواعيد وقت الجمعة")}
              </Text>
              <Switch value={conflictPrefs.blockJumuah} onValueChange={() => updateConflictPrefs({ blockJumuah: !conflictPrefs.blockJumuah })} />
            </View>
            {conflictPrefs.blockJumuah && (
              <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4, paddingHorizontal: 6 }}>
                <Text style={{ fontSize: 13, color: "#6B7B72", textAlign: isRTL ? "right" : "left" }}>{tx(lang, "Jumu'ah-venster (min)", "Jumu'ah window (min)", "نافذة الجمعة (دقائق)")}</Text>
                <MinuteStepper display={dig(conflictPrefs.jumuahWindowMinutes)} isRTL={isRTL}
                  onDec={() => updateConflictPrefs({ jumuahWindowMinutes: Math.max(30, conflictPrefs.jumuahWindowMinutes - 15) })}
                  onInc={() => updateConflictPrefs({ jumuahWindowMinutes: Math.min(180, conflictPrefs.jumuahWindowMinutes + 15) })} />
              </View>
            )}
            <View style={{ height: insets.bottom + 12 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {renderModal()}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  topBar: { alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  topTitle: { fontSize: 17, fontWeight: "700", color: "#C4A35A" },

  segmentRow: { backgroundColor: "#F0F7F2", borderRadius: 12, padding: 4, marginHorizontal: 16, marginTop: 10 },
  segment: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: "center" },
  segmentActive: { backgroundColor: "#1B4332" },
  segmentText: { fontSize: 13, fontWeight: "600", color: "#1B4332" },
  segmentTextActive: { color: "#FFFFFF" },

  navRow: { alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24, paddingVertical: 10 },
  navLabel: { fontSize: 15, fontWeight: "700", color: "#1B4332" },
  navLabelGreg: { fontSize: 11, fontWeight: "600", color: "#9CA3AF", marginTop: 1 },

  weekdayRow: { marginBottom: 4 },
  weekdayLabel: { width: `${100 / 7}%`, textAlign: "center", fontSize: 11, fontWeight: "700", color: "#6B7B72" },
  gridCell: { width: `${100 / 7}%`, aspectRatio: 0.85, alignItems: "center", justifyContent: "center", paddingVertical: 4 },
  gridCellToday: { backgroundColor: "#C4A35A20", borderRadius: 10 },
  gridCellPrimary: { fontSize: 15, fontWeight: "700", color: "#1F2937" },
  gridCellTodayText: { color: "#1B4332" },
  gridCellSecondary: { fontSize: 9, color: "#9CA3AF", marginTop: 1 },
  gridCellFaded: { opacity: 0.35 },
  dotRow: { gap: 3, marginTop: 3, height: 6 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  dotGold: { backgroundColor: "#C4A35A" },
  dotBlue: { backgroundColor: "#1565C0" },

  weekStripRow: { justifyContent: "space-between", marginBottom: 12 },
  weekDayCell: { alignItems: "center", paddingVertical: 10, borderRadius: 12, flex: 1, marginHorizontal: 2 },
  weekDayCellActive: { backgroundColor: "#1B4332" },
  weekDayLabel: { fontSize: 10, color: "#6B7B72", fontWeight: "600" },
  weekDayLabelActive: { color: "#FFFFFF" },
  weekDayNumber: { fontSize: 16, fontWeight: "700", color: "#1F2937", marginTop: 2 },

  dayHeaderBox: { alignItems: "center", paddingVertical: 16 },
  dayHeaderWeekday: { fontSize: 18, fontWeight: "800", color: "#1B4332" },
  dayHeaderPrimary: { fontSize: 19, fontWeight: "700", color: "#1B4332", marginTop: 3 },
  dayHeaderSecondary: { fontSize: 12, color: "#9CA3AF", marginTop: 2 },

  card: { backgroundColor: "#FFFDF8", borderRadius: 14, borderWidth: 1, borderColor: "#E8ECE9", padding: 14, marginBottom: 12 },
  cardFadila: { borderColor: "#C4A35A50" },
  cardBidah: { backgroundColor: "#FFF7ED", borderColor: "#FDE68A" },
  cardTitle: { fontSize: 14, fontWeight: "700", color: "#1B4332" },
  cardTitleBidah: { color: "#B45309" },
  cardDetail: { fontSize: 12, color: "#374151", lineHeight: 20, marginTop: 6 },
  cardEvidence: { fontSize: 10, color: "#9CA3AF", fontStyle: "italic", marginTop: 4 },
  cardExtra: { alignItems: "center", gap: 6, marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: "#F9FAFB" },
  cardExtraText: { flex: 1, fontSize: 11, color: "#6B7B72" },
  occHeaderRow: { alignItems: "center", gap: 8, flexWrap: "wrap" },
  hintText: { fontSize: 12, color: "#6B7B72", marginTop: 6, lineHeight: 18 },

  prayerRow: { justifyContent: "space-between", marginTop: 8 },
  prayerItem: { alignItems: "center" },
  prayerName: { fontSize: 11, color: "#6B7B72", fontWeight: "600" },
  prayerTime: { fontSize: 14, fontWeight: "700", color: "#1B4332", marginTop: 2, fontVariant: ["tabular-nums"] },

  fastingBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: "#E8F5E9" },
  fastingText: { fontSize: 9, fontWeight: "600", color: "#2E7D32" },
  fastingBadgeProhibited: { backgroundColor: "#FFEBEE" },
  fastingTextProhibited: { color: "#C62828" },

  sectionHeaderRow: { alignItems: "center", justifyContent: "space-between", marginTop: 8, marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: "#1B4332" },
  addBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#1B4332", alignItems: "center", justifyContent: "center" },
  apptRow: { alignItems: "center", gap: 10, backgroundColor: "#FFFDF8", borderRadius: 12, borderWidth: 1, borderColor: "#E8ECE9", padding: 12, marginBottom: 8 },
  apptTime: { fontSize: 13, fontWeight: "700", color: "#1B4332", fontVariant: ["tabular-nums"] },
  apptTitle: { fontSize: 13, fontWeight: "700", color: "#1F2937" },
  apptNote: { fontSize: 11, color: "#6B7B72", marginTop: 2 },
  apptLocation: { fontSize: 11, color: "#1B4332", fontWeight: "600", textDecorationLine: "underline" },
  apptIconBtn: { padding: 4 },

  yearGrid: { flexWrap: "wrap", justifyContent: "space-between" },
  miniMonth: { width: "48%", marginBottom: 16, backgroundColor: "#FFFDF8", borderRadius: 10, borderWidth: 1, borderColor: "#E8ECE9", padding: 8 },
  miniMonthTitle: { fontSize: 12, fontWeight: "700", color: "#1B4332", textAlign: "center", marginBottom: 4 },
  miniCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  miniCellToday: { backgroundColor: "#C4A35A30", borderRadius: 4 },
  miniCellText: { fontSize: 8, color: "#374151" },
  miniDotRow: { gap: 1, marginTop: 1, height: 3 },
  miniDot: { width: 3, height: 3, borderRadius: 1.5 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 20, maxHeight: "90%" },
  modalFooter: { paddingTop: 12, marginTop: 4, borderTopWidth: 1, borderTopColor: "#F0F0F0" },
  modalHeaderRow: { alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: "800", color: "#1B4332" },
  fieldLabel: { fontSize: 12, fontWeight: "700", color: "#6B7B72", marginBottom: 6, marginTop: 10 },
  textInput: { borderWidth: 1, borderColor: "#E8ECE9", borderRadius: 10, padding: 12, fontSize: 14, color: "#1F2937" },
  fieldRow: { gap: 12 },
  pickerField: { borderWidth: 1, borderColor: "#E8ECE9", borderRadius: 10, padding: 12, alignItems: "center" },
  pickerFieldText: { fontSize: 14, fontWeight: "600", color: "#1F2937" },
  reminderRow: { flexWrap: "wrap", gap: 8 },
  reminderChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: "#F3F4F6" },
  reminderChipActive: { backgroundColor: "#1B4332" },
  mapsBtn: { alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: "#1B433212", borderWidth: 1, borderColor: "#1B433230" },
  mapsBtnText: { fontSize: 13, fontWeight: "600", color: "#1B4332" },
  stepBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#1B433215", alignItems: "center", justifyContent: "center" },
  reminderChipText: { fontSize: 12, fontWeight: "600", color: "#374151" },
  reminderChipTextActive: { color: "#FFFFFF" },
  saveBtn: { backgroundColor: "#1B4332", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  saveBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  deleteBtn: { borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 10, borderWidth: 1, borderColor: "#C62828" },
  deleteBtnText: { color: "#C62828", fontSize: 14, fontWeight: "700" },
});
