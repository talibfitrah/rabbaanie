import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, ScrollView, Pressable, Platform, Alert } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import * as Haptics from "expo-haptics";
import {
  loadNotificationPrefs,
  saveNotificationPrefs,
  scheduleAllNotifications,
  requestNotificationPermissions,
  getScheduledCount,
  sendTestNotification,
  isPrayerLocationSet,
  loadWeeklyReminderPrefs,
  saveWeeklyReminderPrefs,
  scheduleWeeklyReminder,
  type NotificationPrefs,
  type WeeklyReminderPrefs,
  DEFAULT_NOTIFICATION_PREFS,
  DEFAULT_WEEKLY_REMINDER_PREFS,
  ADHAN_SOUND_OPTIONS,
  NATURE_SOUND_OPTIONS,
  type AdhanSoundOption,
  type NatureSoundOption,
  MIN_MINUTES_BEFORE,
  MAX_MINUTES_BEFORE,
} from "@/lib/notifications";
import {
  loadIqamahSilencePrefs,
  saveIqamahSilencePrefs,
  scheduleIqamahSilence,
  restorePhoneSound,
  type IqamahSilencePrefs,
  DEFAULT_IQAMAH_SILENCE_PREFS,
} from "@/lib/iqamah-silence";
import {
  loadIslamicRemindersPrefs,
  saveIslamicRemindersPrefs,
  scheduleIslamicReminders,
  type IslamicRemindersPrefs,
  DEFAULT_ISLAMIC_REMINDERS_PREFS,
} from "@/lib/islamic-reminders";
import {
  loadUnifiedNotifPrefs,
  saveUnifiedNotifPrefs,
  type UnifiedNotifPrefs,
  type NotifDisplayMode,
  DEFAULT_UNIFIED_NOTIF_PREFS,
} from "@/lib/notification-settings";
import { scheduleImanNotifications } from "@/lib/iman-notifications";

const DISPLAY_MODE_OPTIONS: { value: NotifDisplayMode; labelAr: string; labelEn: string; labelNl: string; icon: string }[] = [
  { value: "normal", labelAr: "عادي (أعلى الشاشة)", labelEn: "Normal (top banner)", labelNl: "Normaal (bovenaan)", icon: "notifications" },
  { value: "popup", labelAr: "منبثق (وسط الشاشة)", labelEn: "Popup (center)", labelNl: "Pop-up (midden)", icon: "open-in-new" },
  { value: "both", labelAr: "كلاهما", labelEn: "Both", labelNl: "Beide", icon: "layers" },
  { value: "off", labelAr: "إيقاف", labelEn: "Off", labelNl: "Uit", icon: "notifications-off" },
];

function SectionCollapsible({ title, icon, iconColor, children, colors, isRTL, defaultOpen = false }: {
  title: string; icon: string; iconColor?: string; children: React.ReactNode; colors: any; isRTL: boolean; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={{ borderRadius: 16, marginBottom: 12, borderWidth: 1, backgroundColor: colors.surface, borderColor: colors.border, overflow: "hidden" }}>
      <Pressable
        onPress={() => setOpen(!open)}
        style={({ pressed }) => [{
          flexDirection: isRTL ? "row-reverse" : "row",
          alignItems: "center",
          justifyContent: "space-between",
          padding: 14,
          opacity: pressed ? 0.8 : 1,
        }]}
      >
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 10 }}>
          <MaterialIcons name={icon as any} size={20} color={iconColor || colors.primary} />
          <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>{title}</Text>
        </View>
        <MaterialIcons name={open ? "keyboard-arrow-up" : "keyboard-arrow-down"} size={24} color={colors.muted} />
      </Pressable>
      {open && <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>{children}</View>}
    </View>
  );
}

function ToggleRow({ label, enabled, onToggle, colors, isRTL, icon, iconColor, locked }: {
  label: string; enabled: boolean; onToggle: () => void; colors: any; isRTL: boolean; icon?: string; iconColor?: string; locked?: boolean;
}) {
  return (
    <Pressable
      onPress={locked ? undefined : onToggle}
      style={({ pressed }) => [{
        flexDirection: isRTL ? "row-reverse" : "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 10,
        marginBottom: 6,
        backgroundColor: enabled ? colors.primary + "08" : "transparent",
        opacity: pressed && !locked ? 0.8 : 1,
      }]}
    >
      <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 8 }}>
        {icon && <MaterialIcons name={icon as any} size={18} color={iconColor || (enabled ? colors.primary : colors.muted)} />}
        <Text style={{ fontSize: 14, color: colors.foreground }}>{label}</Text>
      </View>
      {locked ? (
        // Mandatory (e.g. the 5 daily prayers) — shown always-on and locked.
        <MaterialIcons name="lock" size={18} color={colors.muted} />
      ) : (
        <View style={{
          width: 44, height: 26, borderRadius: 13,
          backgroundColor: enabled ? colors.primary : colors.muted + "40",
          justifyContent: "center", paddingHorizontal: 2,
        }}>
          <View style={{
            width: 22, height: 22, borderRadius: 11, backgroundColor: "#fff",
            alignSelf: enabled ? "flex-end" : "flex-start",
          }} />
        </View>
      )}
    </Pressable>
  );
}

export default function NotificationSettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t, language, isRTL } = useI18n();
  const isEn = language === "en";

  // Prayer notification state
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);
  const [notifScheduledCount, setNotifScheduledCount] = useState(0);
  const [notifPermissionDenied, setNotifPermissionDenied] = useState(false);
  const [locationSet, setLocationSet] = useState(true);
  // Iqamah silence state
  const [iqamahPrefs, setIqamahPrefs] = useState<IqamahSilencePrefs>(DEFAULT_IQAMAH_SILENCE_PREFS);
  // Islamic reminders state
  const [islamicPrefs, setIslamicPrefs] = useState<IslamicRemindersPrefs>(DEFAULT_ISLAMIC_REMINDERS_PREFS);
  // Weekly reminder state
  const [weeklyPrefs, setWeeklyPrefs] = useState<WeeklyReminderPrefs>(DEFAULT_WEEKLY_REMINDER_PREFS);
  // Display mode state
  const [displayPrefs, setDisplayPrefs] = useState<UnifiedNotifPrefs>(DEFAULT_UNIFIED_NOTIF_PREFS);
  // Sound state
  const [playingSound, setPlayingSound] = useState<string | null>(null);
  const audioRef = useRef<any>(null);

  // Load all prefs on mount
  useEffect(() => {
    loadNotificationPrefs().then(setNotifPrefs);
    loadIqamahSilencePrefs().then(setIqamahPrefs);
    loadIslamicRemindersPrefs().then(setIslamicPrefs);
    loadWeeklyReminderPrefs().then(setWeeklyPrefs);
    loadUnifiedNotifPrefs().then(setDisplayPrefs);
    if (Platform.OS !== "web") {
      getScheduledCount().then(setNotifScheduledCount);
      isPrayerLocationSet().then(setLocationSet);
    }
  }, []);

  // Reschedule notifications helper
  const rescheduleNotifications = useCallback(async (newPrefs: NotificationPrefs) => {
    setNotifPrefs(newPrefs);
    await saveNotificationPrefs(newPrefs);
    if (Platform.OS !== "web" && newPrefs.enabled) {
      const count = await scheduleAllNotifications(language);
      setNotifScheduledCount(count);
    } else if (!newPrefs.enabled) {
      const Notifications = require("expo-notifications");
      await Notifications.cancelAllScheduledNotificationsAsync();
      setNotifScheduledCount(0);
    }
  }, [language]);

  // Notifications (prayer reminders especially) are always on and cannot be
  // switched off — this row only re-checks / requests OS permission.
  const handleMasterToggle = useCallback(async () => {
    if (Platform.OS !== "web") {
      const granted = await requestNotificationPermissions();
      setNotifPermissionDenied(!granted);
      if (granted) await rescheduleNotifications({ ...notifPrefs });
    }
  }, [notifPrefs, rescheduleNotifications]);

  // Fire an immediate test notification so the user can verify pop-up + sound now
  const handleTestNotification = useCallback(async () => {
    if (Platform.OS === "web") return;
    const granted = await requestNotificationPermissions();
    if (!granted) { setNotifPermissionDenied(true); return; }
    await sendTestNotification(language as "nl" | "en" | "ar", notifPrefs.adhanSound);
    getScheduledCount().then(setNotifScheduledCount);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [language, notifPrefs]);

  // Fire a full-screen (alarm-style) test — survives Samsung sleep and shows
  // centre-screen even over the lock screen (Notifee full-screen intent).
  const handleFullScreenTest = useCallback(async () => {
    if (Platform.OS !== "android") return;
    const { fullScreenDiagReport, openFullScreenPermission } = await import("@/lib/fullscreen-notif");
    const report = await fullScreenDiagReport(8);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      getLabel("لإظهار الإشعار في وسط الشاشة", "Show centre-screen", "Centraal tonen"),
      getLabel(
        "الإشعار يظهر في الأعلى ✅، ويعمل الآن كالمنبّه بلا حاجةٍ لإذن المنبّهات. ولإظهاره في وسط الشاشة فوق القفل، فعّل «إشعارات ملء الشاشة» ثمّ اقفل الهاتف وأعد الاختبار:",
        "It shows at the top ✅ and now works like an alarm (no Alarms permission needed). To show it centre-screen over the lock, enable 'Full-screen notifications', then lock and test again:",
        "Bovenaan ✅ (werkt nu als alarm). Voor centraal: schakel 'Volledig scherm' in, vergrendel en test opnieuw:",
      ) + "\n\n" + report,
      [
        { text: getLabel("إذن ملء الشاشة", "Full-screen", "Volledig"), onPress: () => { void openFullScreenPermission(); } },
        { text: getLabel("إغلاق", "Close", "Sluiten"), style: "cancel" },
      ],
    );
  }, []);

  // Manually un-silence the phone (in case an iqamah silence didn't auto-restore)
  const handleRestoreSound = useCallback(async () => {
    const ok = await restorePhoneSound();
    Alert.alert(
      getLabel("صوت الهاتف", "Phone sound", "Telefoongeluid"),
      ok
        ? getLabel("تمت استعادة صوت الهاتف.", "Phone sound restored.", "Telefoongeluid hersteld.")
        : getLabel("تعذّر — امنح إذن «عدم الإزعاج» ثم أعد المحاولة.", "Couldn't restore — grant Do Not Disturb access, then try again.", "Kon niet herstellen — geef 'Niet storen'-toegang.")
    );
  }, [language]);

  // Prayer toggle
  const handlePrayerToggle = useCallback(async (prayer: keyof NotificationPrefs["prayers"]) => {
    await rescheduleNotifications({
      ...notifPrefs,
      prayers: { ...notifPrefs.prayers, [prayer]: !notifPrefs.prayers[prayer] },
    });
  }, [notifPrefs, rescheduleNotifications]);

  // Adhkaar toggle
  const handleAdhkaarToggle = useCallback(async (type: "morning" | "evening") => {
    await rescheduleNotifications({
      ...notifPrefs,
      adhkaar: { ...notifPrefs.adhkaar, [type]: !notifPrefs.adhkaar[type] },
    });
  }, [notifPrefs, rescheduleNotifications]);

  // Minutes before
  const handleMinutesBefore = useCallback(async (minutes: number) => {
    await rescheduleNotifications({ ...notifPrefs, minutesBefore: minutes });
  }, [notifPrefs, rescheduleNotifications]);

  // Adhan sound
  const handleAdhanSoundChange = useCallback(async (sound: AdhanSoundOption) => {
    await rescheduleNotifications({ ...notifPrefs, adhanSound: sound });
  }, [notifPrefs, rescheduleNotifications]);

  // Nature sound
  const handleNatureSoundChange = useCallback(async (sound: NatureSoundOption) => {
    await rescheduleNotifications({ ...notifPrefs, natureSound: sound });
  }, [notifPrefs, rescheduleNotifications]);

  // Play preview sound
  const playPreviewSound = useCallback(async (soundId: string) => {
    try {
      if (audioRef.current) {
        try { await audioRef.current.stopAsync(); await audioRef.current.unloadAsync(); } catch {}
        audioRef.current = null;
      }
      if (playingSound === soundId) { setPlayingSound(null); return; }
      setPlayingSound(soundId);
      const soundMap: Record<string, any> = {
        "takbeer_1": require("@/assets/sounds/adhan_takbeer_1.mp3"),
        "takbeer_2": require("@/assets/sounds/adhan_takbeer_2.mp3"),
        "takbeer_3": require("@/assets/sounds/adhan_takbeer_3.mp3"),
        "water_stream": require("@/assets/sounds/water_stream.mp3"),
        "birds_chirp": require("@/assets/sounds/birds_chirp.mp3"),
        "wind_gentle": require("@/assets/sounds/wind_gentle.mp3"),
        "rain_soft": require("@/assets/sounds/rain_soft.mp3"),
      };
      const source = soundMap[soundId];
      if (!source) { setPlayingSound(null); return; }
      if (Platform.OS === "web") { setTimeout(() => setPlayingSound(null), 3000); return; }
      const { Audio } = require("expo-av");
      // Route preview through the loudspeaker at media volume even if the phone
      // is on silent — without this expo-av can play through the earpiece
      // (inaudible) or not at all on Android.
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
          staysActiveInBackground: false,
        });
      } catch {}
      const { sound } = await Audio.Sound.createAsync(source, { shouldPlay: true, volume: 1.0 });
      audioRef.current = sound;
      sound.setOnPlaybackStatusUpdate((status: any) => {
        if (status.didJustFinish) {
          sound.stopAsync().then(() => sound.unloadAsync()).catch(() => {});
          audioRef.current = null;
          setPlayingSound(null);
        }
      });
      // Safety net only (not a preview length cap) — stops a stuck/corrupt
      // clip that never fires didJustFinish. Comfortably longer than any
      // bundled preview so it never cuts a real playback short.
      setTimeout(async () => {
        try {
          if (audioRef.current === sound) {
            await sound.stopAsync(); await sound.unloadAsync();
            audioRef.current = null; setPlayingSound(null);
          }
        } catch {}
      }, 60000);
    } catch { setPlayingSound(null); }
  }, [playingSound]);

  // Iqamah toggle
  const handleIqamahToggle = useCallback(async () => {
    const newPrefs = { ...iqamahPrefs, enabled: !iqamahPrefs.enabled };
    setIqamahPrefs(newPrefs);
    await saveIqamahSilencePrefs(newPrefs);
    if (newPrefs.enabled && Platform.OS !== "web") {
      const granted = await requestNotificationPermissions();
      if (!granted) { setNotifPermissionDenied(true); return; }
    }
    await scheduleIqamahSilence(language as "nl" | "en" | "ar");
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [iqamahPrefs, language]);

  // Iqamah prayer toggle
  const handleIqamahPrayerToggle = useCallback(async (prayer: keyof IqamahSilencePrefs["prayers"]) => {
    const newPrefs = { ...iqamahPrefs, prayers: { ...iqamahPrefs.prayers, [prayer]: !iqamahPrefs.prayers[prayer] } };
    setIqamahPrefs(newPrefs);
    await saveIqamahSilencePrefs(newPrefs);
    await scheduleIqamahSilence(language as "nl" | "en" | "ar");
  }, [iqamahPrefs, language]);

  // Iqamah timing change
  const handleIqamahTimingChange = useCallback(async (field: "minutesAfterAdhan" | "silenceDurationMinutes", delta: number) => {
    const current = iqamahPrefs[field];
    // minutesAfterAdhan may be 0 → silence right at adhan (prayer) time; the
    // silence duration must stay at least 1 minute.
    const min = field === "minutesAfterAdhan" ? 0 : 1;
    const newVal = Math.max(min, Math.min(60, current + delta));
    const newPrefs = { ...iqamahPrefs, [field]: newVal };
    setIqamahPrefs(newPrefs);
    await saveIqamahSilencePrefs(newPrefs);
    await scheduleIqamahSilence(language as "nl" | "en" | "ar");
  }, [iqamahPrefs, language]);

  // Islamic reminders toggles
  const handleIslamicToggle = useCallback(async (key: "istighfar" | "morningAdhkar" | "eveningAdhkar" | "qiyamAlLayl") => {
    const newPrefs = { ...islamicPrefs, [key]: { ...islamicPrefs[key], enabled: !islamicPrefs[key].enabled } };
    setIslamicPrefs(newPrefs);
    await saveIslamicRemindersPrefs(newPrefs);
    await scheduleIslamicReminders(language as "nl" | "en" | "ar");
  }, [islamicPrefs, language]);

  // Weekly reminder toggle
  const handleWeeklyToggle = useCallback(async () => {
    const newPrefs = { ...weeklyPrefs, enabled: !weeklyPrefs.enabled };
    setWeeklyPrefs(newPrefs);
    await saveWeeklyReminderPrefs(newPrefs);
    if (Platform.OS !== "web" && newPrefs.enabled) {
      const granted = await requestNotificationPermissions();
      if (!granted) { setNotifPermissionDenied(true); return; }
      const { getUnfinishedGoalCount } = await import("@/lib/notifications");
      const unfinished = await getUnfinishedGoalCount();
      await scheduleWeeklyReminder(language as "nl" | "en" | "ar", unfinished);
    }
  }, [weeklyPrefs, language]);

  // Display mode update
  const updateDisplayMode = useCallback(async (category: string, mode: NotifDisplayMode) => {
    const updated = { ...displayPrefs, displayModes: { ...displayPrefs.displayModes, [category]: mode } };
    setDisplayPrefs(updated);
    await saveUnifiedNotifPrefs(updated);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [displayPrefs]);

  const getLabel = (ar: string, en: string, nl: string) => language === "ar" ? ar : isEn ? en : nl;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{
        paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16,
        backgroundColor: colors.surface, borderBottomWidth: 0.5, borderBottomColor: colors.border,
        flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12,
      }}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, padding: 4 }]}>
          <MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={24} color={colors.foreground} />
        </Pressable>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, flex: 1, textAlign: isRTL ? "right" : "left" }}>
          {getLabel("إعدادات الإشعارات", "Notification Settings", "Notificatie-instellingen")}
        </Text>
        {notifScheduledCount > 0 && (
          <Text style={{ fontSize: 11, color: colors.muted }}>
            {notifScheduledCount} {getLabel("مجدولة", "scheduled", "gepland")}
          </Text>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 80 }}>
        {/* Permission denied warning */}
        {notifPermissionDenied && (
          <View style={{ backgroundColor: colors.error + "15", borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: colors.error + "30" }}>
            <Text style={{ color: colors.error, fontSize: 12, lineHeight: 18 }}>
              {t("notif.permission_denied")}
            </Text>
          </View>
        )}

        {/* Master Toggle */}
        <Pressable
          onPress={handleMasterToggle}
          style={({ pressed }) => [{
            flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between",
            backgroundColor: notifPrefs.enabled ? colors.primary + "15" : colors.surface,
            borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1.5,
            borderColor: notifPrefs.enabled ? colors.primary + "40" : colors.border, opacity: pressed ? 0.8 : 1,
          }]}
        >
          <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12 }}>
            <MaterialIcons name="notifications-active" size={24} color={notifPrefs.enabled ? colors.primary : colors.muted} />
            <View>
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>
                {t("notif.master_toggle")}
              </Text>
              <Text style={{ fontSize: 12, color: colors.muted, textAlign: isRTL ? "right" : "left", marginTop: 2 }}>
                {t("notif.desc")}
              </Text>
            </View>
          </View>
          {/* Mandatory (prayer reminders are always on): show a lock, not a
              switch. Tapping still re-checks OS permission, but the master flag
              is force-enabled on every load, so a toggle here would be a lie. */}
          <MaterialIcons name="lock" size={20} color={colors.muted} />
        </Pressable>

        {/* Test & diagnostics — verify pop-up + sound right now, without waiting for a prayer */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 4, textAlign: isRTL ? "right" : "left" }}>
            {getLabel("اختبار الإشعارات", "Test notifications", "Meldingen testen")}
          </Text>
          <Text style={{ fontSize: 12, color: locationSet ? colors.muted : colors.error, marginBottom: 10, textAlign: isRTL ? "right" : "left", lineHeight: 18 }}>
            {locationSet
              ? getLabel(`عدد الإشعارات المجدولة: ${notifScheduledCount}`, `Scheduled notifications: ${notifScheduledCount}`, `Geplande meldingen: ${notifScheduledCount}`)
              : getLabel("موقعك غير محفوظ، فلا تُحسب أوقات الصلاة ولا تصل إشعاراتها. حدّد موقعك من صفحة أوقات الصلاة.", "No location saved, so prayer times aren't computed and their notifications won't arrive. Set your location on the Prayer Times page.", "Geen locatie opgeslagen; gebedstijden en hun meldingen ontbreken.")}
          </Text>
          <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 10 }}>
            <Pressable onPress={handleTestNotification} style={({ pressed }) => [{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12, opacity: pressed ? 0.85 : 1 }]}>
              <MaterialIcons name="notifications-active" size={18} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>{getLabel("إشعار تجريبي", "Test", "Test")}</Text>
            </Pressable>
            {Platform.OS === "android" && (
              <Pressable onPress={handleRestoreSound} style={({ pressed }) => [{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.background, borderWidth: 1.5, borderColor: colors.primary + "50", borderRadius: 12, paddingVertical: 12, opacity: pressed ? 0.85 : 1 }]}>
                <MaterialIcons name="volume-up" size={18} color={colors.primary} />
                <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 13 }}>{getLabel("استعادة الصوت", "Restore sound", "Geluid herstellen")}</Text>
              </Pressable>
            )}
          </View>
          {Platform.OS === "android" && (
            <Pressable onPress={handleFullScreenTest} style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#1B4332", borderRadius: 12, paddingVertical: 12, marginTop: 10, opacity: pressed ? 0.85 : 1 }]}>
              <MaterialIcons name="fullscreen" size={18} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>{getLabel("اختبار إشعار ملء الشاشة", "Full-screen test", "Volledig-scherm test")}</Text>
            </Pressable>
          )}
        </View>

        {/* === SECTION 1: Prayer Notifications === */}
        <SectionCollapsible title={getLabel("إشعارات الصلاة", "Prayer Notifications", "Gebedsnotificaties")} icon="mosque" iconColor="#059669" colors={colors} isRTL={isRTL} defaultOpen={true}>
          {/* Per-prayer toggles */}
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 8, textAlign: isRTL ? "right" : "left" }}>
            {t("notif.prayers_section")}
          </Text>
          {(["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"] as const).map((prayer) => (
            <ToggleRow
              key={prayer}
              label={t(`prayer.${prayer}`)}
              enabled={notifPrefs.prayers[prayer]}
              onToggle={() => handlePrayerToggle(prayer)}
              colors={colors}
              isRTL={isRTL}
              locked={prayer !== "sunrise"}
            />
          ))}

          {/* Minutes before */}
          <View style={{ marginTop: 12, marginBottom: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 8, textAlign: isRTL ? "right" : "left" }}>
              {t("notif.minutes_before")}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16 }}>
              <Pressable onPress={() => { if (notifPrefs.minutesBefore > MIN_MINUTES_BEFORE) handleMinutesBefore(notifPrefs.minutesBefore - 1); }}
                style={({ pressed }) => [{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary + "15", alignItems: "center", justifyContent: "center", opacity: pressed ? 0.6 : 1 }]}>
                <MaterialIcons name="remove" size={20} color={colors.primary} />
              </Pressable>
              <View style={{ backgroundColor: colors.background, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8, minWidth: 60, alignItems: "center", borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}>{notifPrefs.minutesBefore}</Text>
                <Text style={{ fontSize: 10, color: colors.muted }}>{getLabel("دقيقة", "min", "min")}</Text>
              </View>
              <Pressable onPress={() => { if (notifPrefs.minutesBefore < MAX_MINUTES_BEFORE) handleMinutesBefore(notifPrefs.minutesBefore + 1); }}
                style={({ pressed }) => [{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary + "15", alignItems: "center", justifyContent: "center", opacity: pressed ? 0.6 : 1 }]}>
                <MaterialIcons name="add" size={20} color={colors.primary} />
              </Pressable>
            </View>
          </View>

          {/* Adhkaar toggles */}
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginTop: 12, marginBottom: 8, textAlign: isRTL ? "right" : "left" }}>
            {t("notif.adhkaar_section")}
          </Text>
          <ToggleRow label={t("notif.morning_adhkaar")} enabled={notifPrefs.adhkaar.morning} onToggle={() => handleAdhkaarToggle("morning")} colors={colors} isRTL={isRTL} icon="wb-sunny" iconColor="#F59E0B" />
          <ToggleRow label={t("notif.evening_adhkaar")} enabled={notifPrefs.adhkaar.evening} onToggle={() => handleAdhkaarToggle("evening")} colors={colors} isRTL={isRTL} icon="nightlight-round" iconColor="#6366F1" />
        </SectionCollapsible>

        {/* === SECTION 2: Sounds === */}
        <SectionCollapsible title={getLabel("الأصوات", "Sounds", "Geluiden")} icon="volume-up" colors={colors} isRTL={isRTL}>
          {/* Adhan Sound */}
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 8, textAlign: isRTL ? "right" : "left" }}>
            {getLabel("صوت الأذان", "Adhan Sound", "Adhan geluid")}
          </Text>
          {ADHAN_SOUND_OPTIONS.map((opt) => (
            <Pressable
              key={opt.id}
              onPress={() => handleAdhanSoundChange(opt.id)}
              style={({ pressed }) => [{
                flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between",
                paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, marginBottom: 6,
                backgroundColor: (notifPrefs.adhanSound || "takbeer_1") === opt.id ? colors.primary + "12" : "transparent",
                borderWidth: 1, borderColor: (notifPrefs.adhanSound || "takbeer_1") === opt.id ? colors.primary + "40" : "transparent",
                opacity: pressed ? 0.8 : 1,
              }]}
            >
              <Text style={{ fontSize: 14, color: (notifPrefs.adhanSound || "takbeer_1") === opt.id ? colors.primary : colors.foreground, fontWeight: (notifPrefs.adhanSound || "takbeer_1") === opt.id ? "bold" : "normal" }}>
                {opt[language === "ar" ? "nameAr" : isEn ? "nameEn" : "nameNl"]}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                {(notifPrefs.adhanSound || "takbeer_1") === opt.id && <MaterialIcons name="check-circle" size={18} color={colors.primary} />}
                <Pressable onPress={() => playPreviewSound(opt.id)} style={({ pressed }) => [{ width: 32, height: 32, borderRadius: 16, backgroundColor: playingSound === opt.id ? colors.primary : colors.border + "50", alignItems: "center", justifyContent: "center", opacity: pressed ? 0.7 : 1 }]}>
                  <MaterialIcons name={playingSound === opt.id ? "stop" : "play-arrow"} size={18} color={playingSound === opt.id ? "#fff" : colors.foreground} />
                </Pressable>
              </View>
            </Pressable>
          ))}

          {/* Nature Sound */}
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginTop: 14, marginBottom: 8, textAlign: isRTL ? "right" : "left" }}>
            {getLabel("صوت التنبيهات الأخرى", "Other Notifications Sound", "Overige meldingen geluid")}
          </Text>
          {NATURE_SOUND_OPTIONS.map((opt) => (
            <Pressable
              key={opt.id}
              onPress={() => handleNatureSoundChange(opt.id)}
              style={({ pressed }) => [{
                flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between",
                paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, marginBottom: 6,
                backgroundColor: (notifPrefs.natureSound || "water_stream") === opt.id ? "#0891B2" + "12" : "transparent",
                borderWidth: 1, borderColor: (notifPrefs.natureSound || "water_stream") === opt.id ? "#0891B2" + "40" : "transparent",
                opacity: pressed ? 0.8 : 1,
              }]}
            >
              <Text style={{ fontSize: 14, color: (notifPrefs.natureSound || "water_stream") === opt.id ? "#0891B2" : colors.foreground, fontWeight: (notifPrefs.natureSound || "water_stream") === opt.id ? "bold" : "normal" }}>
                {opt[language === "ar" ? "nameAr" : isEn ? "nameEn" : "nameNl"]}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                {(notifPrefs.natureSound || "water_stream") === opt.id && <MaterialIcons name="check-circle" size={18} color="#0891B2" />}
                <Pressable onPress={() => playPreviewSound(opt.id)} style={({ pressed }) => [{ width: 32, height: 32, borderRadius: 16, backgroundColor: playingSound === opt.id ? "#0891B2" : colors.border + "50", alignItems: "center", justifyContent: "center", opacity: pressed ? 0.7 : 1 }]}>
                  <MaterialIcons name={playingSound === opt.id ? "stop" : "play-arrow"} size={18} color={playingSound === opt.id ? "#fff" : colors.foreground} />
                </Pressable>
              </View>
            </Pressable>
          ))}
        </SectionCollapsible>

        {/* === SECTION 3: Iqamah Auto-Silence === */}
        <SectionCollapsible title={getLabel("إسكات الإقامة", "Iqamah Auto-Silence", "Iqamah Auto-Stilte")} icon="volume-off" iconColor="#7C3AED" colors={colors} isRTL={isRTL}>
          <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 10, lineHeight: 18, textAlign: isRTL ? "right" : "left" }}>
            {getLabel(
              "يُسكت الهاتف تلقائياً عند وقت الإقامة (بعد الأذان بدقائق محددة) ثم يُعيد الصوت بعد انتهاء المدة.",
              "Automatically silences your phone at Iqamah time and restores it after the set duration.",
              "Zet je telefoon automatisch op stil bij Iqamah-tijd en herstelt het geluid na de ingestelde duur."
            )}
          </Text>
          {Platform.OS === "ios" && (
            <View style={{ backgroundColor: colors.warning + "15", borderRadius: 8, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: colors.warning + "30" }}>
              <Text style={{ color: colors.warning, fontSize: 11, lineHeight: 16 }}>
                {getLabel("على iOS سيُرسل إشعار تذكيري بدلاً من الإسكات التلقائي (قيود Apple)", "On iOS, a reminder is sent instead of auto-silence (Apple restriction)", "Op iOS wordt een herinnering gestuurd in plaats van automatisch dempen (Apple-beperking)")}
              </Text>
            </View>
          )}
          <ToggleRow label={getLabel("تفعيل إسكات الإقامة", "Enable Iqamah Silence", "Iqamah-stilte inschakelen")} enabled={iqamahPrefs.enabled} onToggle={handleIqamahToggle} colors={colors} isRTL={isRTL} icon="volume-off" />

          {iqamahPrefs.enabled && (
            <>
              {/* Minutes after adhan */}
              <View style={{ marginTop: 10, marginBottom: 8 }}>
                <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 6, textAlign: isRTL ? "right" : "left" }}>
                  {getLabel("بدء الإسكات بعد الأذان بـ (دقائق)", "Start silence after Adhan (minutes)", "Start stilte na Adhan (minuten)")}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 }}>
                  <Pressable onPress={() => handleIqamahTimingChange("minutesAfterAdhan", -1)} style={({ pressed }) => [{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary + "15", alignItems: "center", justifyContent: "center", opacity: pressed ? 0.6 : 1 }]}>
                    <MaterialIcons name="remove" size={18} color={colors.primary} />
                  </Pressable>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, minWidth: 40, textAlign: "center" }}>{iqamahPrefs.minutesAfterAdhan}</Text>
                  <Pressable onPress={() => handleIqamahTimingChange("minutesAfterAdhan", 1)} style={({ pressed }) => [{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary + "15", alignItems: "center", justifyContent: "center", opacity: pressed ? 0.6 : 1 }]}>
                    <MaterialIcons name="add" size={18} color={colors.primary} />
                  </Pressable>
                </View>
              </View>
              {/* Duration */}
              <View style={{ marginBottom: 8 }}>
                <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 6, textAlign: isRTL ? "right" : "left" }}>
                  {getLabel("مدة الإسكات (دقائق)", "Silence duration (minutes)", "Duur stilte (minuten)")}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 }}>
                  <Pressable onPress={() => handleIqamahTimingChange("silenceDurationMinutes", -1)} style={({ pressed }) => [{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary + "15", alignItems: "center", justifyContent: "center", opacity: pressed ? 0.6 : 1 }]}>
                    <MaterialIcons name="remove" size={18} color={colors.primary} />
                  </Pressable>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, minWidth: 40, textAlign: "center" }}>{iqamahPrefs.silenceDurationMinutes}</Text>
                  <Pressable onPress={() => handleIqamahTimingChange("silenceDurationMinutes", 1)} style={({ pressed }) => [{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary + "15", alignItems: "center", justifyContent: "center", opacity: pressed ? 0.6 : 1 }]}>
                    <MaterialIcons name="add" size={18} color={colors.primary} />
                  </Pressable>
                </View>
              </View>
              {/* Per-prayer iqamah toggles */}
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 8, marginBottom: 6, textAlign: isRTL ? "right" : "left" }}>
                {getLabel("الصلوات المشمولة", "Included prayers", "Inbegrepen gebeden")}
              </Text>
              {(["fajr", "dhuhr", "asr", "maghrib", "isha"] as const).map((p) => (
                <ToggleRow key={p} label={t(`prayer.${p}`)} enabled={iqamahPrefs.prayers[p]} onToggle={() => handleIqamahPrayerToggle(p)} colors={colors} isRTL={isRTL} />
              ))}
            </>
          )}
        </SectionCollapsible>

        {/* === SECTION 4: Islamic Reminders === */}
        <SectionCollapsible title={getLabel("التذكيرات الإسلامية", "Islamic Reminders", "Islamitische Herinneringen")} icon="notifications-active" iconColor="#C4A35A" colors={colors} isRTL={isRTL}>
          <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 10, lineHeight: 18, textAlign: isRTL ? "right" : "left" }}>
            {getLabel(
              "تذكيرات يومية بالاستغفار وأذكار الصباح والمساء وقيام الليل. تُحسب الأوقات تلقائياً من أوقات الصلاة.",
              "Daily reminders for Istighfaar, morning/evening adhkaar, and Qiyaam al-Layl.",
              "Dagelijkse herinneringen voor Istighfaar, ochtend/avond-adhkaar en Qiyaam al-Layl."
            )}
          </Text>
          <ToggleRow label={getLabel("الاستغفار", "Istighfaar", "Istighfaar")} enabled={islamicPrefs.istighfar.enabled} onToggle={() => handleIslamicToggle("istighfar")} colors={colors} isRTL={isRTL} icon="menu-book" iconColor="#C4A35A" />
          <ToggleRow label={getLabel("أذكار الصباح", "Morning Adhkaar", "Ochtend-adhkaar")} enabled={islamicPrefs.morningAdhkar.enabled} onToggle={() => handleIslamicToggle("morningAdhkar")} colors={colors} isRTL={isRTL} icon="wb-sunny" iconColor="#F59E0B" />
          <ToggleRow label={getLabel("أذكار المساء", "Evening Adhkaar", "Avond-adhkaar")} enabled={islamicPrefs.eveningAdhkar.enabled} onToggle={() => handleIslamicToggle("eveningAdhkar")} colors={colors} isRTL={isRTL} icon="nightlight-round" iconColor="#6366F1" />
          <ToggleRow label={getLabel("قيام الليل", "Qiyaam al-Layl", "Qiyaam al-Layl")} enabled={islamicPrefs.qiyamAlLayl.enabled} onToggle={() => handleIslamicToggle("qiyamAlLayl")} colors={colors} isRTL={isRTL} icon="dark-mode" iconColor="#1E3A5F" />
        </SectionCollapsible>

        {/* === SECTION 5: Weekly Reminder === */}
        <SectionCollapsible title={getLabel("التذكير الأسبوعي", "Weekly Reminder", "Wekelijkse Herinnering")} icon="event" iconColor="#2563EB" colors={colors} isRTL={isRTL}>
          <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 10, lineHeight: 18, textAlign: isRTL ? "right" : "left" }}>
            {getLabel(
              "تذكير أسبوعي بمراجعة الأهداف التربوية والتقدم المحرز.",
              "Weekly reminder to review parenting goals and progress.",
              "Wekelijkse herinnering om opvoedingsdoelen en voortgang te bekijken."
            )}
          </Text>
          <ToggleRow label={getLabel("تفعيل التذكير الأسبوعي", "Enable Weekly Reminder", "Wekelijkse herinnering inschakelen")} enabled={weeklyPrefs.enabled} onToggle={handleWeeklyToggle} colors={colors} isRTL={isRTL} icon="event" iconColor="#2563EB" />
        </SectionCollapsible>

        {/* === SECTION 6: Display Modes === */}
        <SectionCollapsible title={getLabel("طريقة عرض الإشعارات", "Notification Display Mode", "Weergavemodus notificaties")} icon="layers" iconColor="#8B5CF6" colors={colors} isRTL={isRTL}>
          <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 12, lineHeight: 18, textAlign: isRTL ? "right" : "left" }}>
            {getLabel(
              "لكل نوع إشعار يمكنك اختيار طريقة العرض:\n• عادي: يظهر في أعلى الشاشة\n• منبثق: يظهر في وسط الشاشة\n• كلاهما: يظهر بالطريقتين\n• إيقاف: لا يظهر",
              "For each type you can choose:\n• Normal: top banner\n• Popup: center popup\n• Both: both ways\n• Off: disabled",
              "Per type kunt u kiezen:\n• Normaal: bovenaan\n• Pop-up: midden\n• Beide: beide\n• Uit: uitgeschakeld"
            )}
          </Text>
          {(["prayer", "adhkar", "iman", "tarbiya", "iqamah", "weekly"] as const).map((cat) => {
            const titles: Record<string, { ar: string; en: string; nl: string }> = {
              prayer: { ar: "الصلاة", en: "Prayer", nl: "Gebed" },
              adhkar: { ar: "الأذكار", en: "Adhkar", nl: "Adhkar" },
              iman: { ar: "إيمانية", en: "Faith", nl: "Geloof" },
              tarbiya: { ar: "تربوية", en: "Parenting", nl: "Opvoeding" },
              iqamah: { ar: "إسكات", en: "Silence", nl: "Stilte" },
              weekly: { ar: "أسبوعية", en: "Weekly", nl: "Wekelijks" },
            };
            const currentMode = (displayPrefs.displayModes as any)?.[cat] || "normal";
            return (
              <View key={cat} style={{ marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, marginBottom: 6, textAlign: isRTL ? "right" : "left" }}>
                  {titles[cat][language === "ar" ? "ar" : isEn ? "en" : "nl"]}
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {DISPLAY_MODE_OPTIONS.map((opt) => (
                    <Pressable
                      key={opt.value}
                      onPress={() => updateDisplayMode(cat, opt.value)}
                      style={({ pressed }) => [{
                        flexDirection: "row", alignItems: "center", gap: 4,
                        paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8,
                        backgroundColor: currentMode === opt.value ? "#8B5CF6" + "15" : colors.background,
                        borderWidth: 1, borderColor: currentMode === opt.value ? "#8B5CF6" : colors.border,
                        opacity: pressed ? 0.7 : 1,
                      }]}
                    >
                      <MaterialIcons name={opt.icon as any} size={14} color={currentMode === opt.value ? "#8B5CF6" : colors.muted} />
                      <Text style={{ fontSize: 11, color: currentMode === opt.value ? "#8B5CF6" : colors.foreground, fontWeight: currentMode === opt.value ? "600" : "400" }}>
                        {getLabel(opt.labelAr, opt.labelEn, opt.labelNl)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            );
          })}
        </SectionCollapsible>
      </ScrollView>
    </View>
  );
}
