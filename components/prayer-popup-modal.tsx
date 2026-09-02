/**
 * Prayer Popup Modal
 * Large centered modal that shows when a notification fires while app is open.
 * Features:
 * - Shows notification title, body, and Islamic ruling (واجب/سنة مؤكدة/مستحب)
 * - "أفعل الآن إن شاء الله" button (green)
 * - "أعد تذكيري بعد 10 دقائق" button (gray)
 * - Follow-up system: after 15 minutes asks "هل فعلت؟"
 * - Cannot be disabled - always shows for important reminders
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, Modal, Pressable, ScrollView, StyleSheet, Platform, Alert } from "react-native";
import { router } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { RULING_COLORS, RULING_BG_COLORS, rulingLabel } from "@/lib/notification-settings";
import { trpc } from "@/lib/trpc";
import { isoToday, DEFAULT_SETTINGS, type CycleDay, type CycleSettings, type Flow } from "@/lib/haid";
import { syncHaidNotifications } from "@/lib/haid-notifications";
import { readStoredLanguage } from "@/lib/notifications";
import * as NativeAuth from "@/lib/_core/auth";
import { loadAppState } from "@/lib/store";
import type { Language } from "@/lib/i18n";

export interface PopupNotification {
  id: string;
  title: string;
  body: string;
  ruling: "واجب" | "سنة مؤكدة" | "مستحب";
  icon?: string;
  deepLink?: string;
  followUpEnabled?: boolean;
}

interface PrayerPopupModalProps {
  visible: boolean;
  notification: PopupNotification | null;
  onDismiss: () => void;
  onDoNow: (notification: PopupNotification) => void;
  onRemindLater: (notification: PopupNotification) => void;
  isFollowUp?: boolean;
}

export function PrayerPopupModal({
  visible,
  notification,
  onDismiss,
  onDoNow,
  onRemindLater,
  isFollowUp = false,
}: PrayerPopupModalProps) {
  // Rules of Hooks: notification alternates null/non-null across renders
  // (usePopupNotifications shows/dismisses in place), so every hook this
  // component uses must run before the early return below, not after it.
  //
  // This modal is rendered in app/_layout.tsx as a sibling AFTER
  // AppProvider/AuthProvider close ("renders above everything", so popups
  // still work pre-auth/pre-onboarding) — useAppState()/useAuth() are not
  // reachable here and would throw. Read gender the same storage-direct way
  // app/_layout.tsx's own notification listeners already read the user
  // (NativeAuth.getUserInfo()), re-checked each time the popup opens. The
  // language is read the same way, for the same reason (useI18n would throw).
  const [isWoman, setIsWoman] = useState(false);
  const [language, setLanguage] = useState<Language | null>(null);
  useEffect(() => {
    let cancelled = false;
    readStoredLanguage().then((lang) => {
      if (!cancelled) setLanguage(lang);
    }).catch(() => {});
    // C15: reset synchronously, before the async read starts — otherwise a
    // just-switched-to man briefly (or, if the read then fails, forever)
    // sees the previous woman account's "أنا حائض" button while this
    // account's own read is still in flight.
    setIsWoman(false);
    (async () => {
      const u = await NativeAuth.getUserInfo();
      if (!u?.id) return;
      const appState = await loadAppState(u.id);
      if (!cancelled) setIsWoman(appState.parentProfile?.gender === "vrouw");
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const utils = trpc.useUtils();
  // Her tracker-enabled state — the server rejects a cycle write outright
  // (PRECONDITION_FAILED) when she hasn't enabled it, so handleHaid below
  // checks this first instead of silently no-op'ing on a rejected write.
  const mine = trpc.cycle.getMine.useQuery(undefined, { enabled: isWoman });
  const markHaid = trpc.cycle.upsertDay.useMutation({
    onSuccess: async () => {
      utils.cycle.getMine.invalidate();
      // C7: writing the day (or invalidating the cache) alone never touches
      // prayer alarms already scheduled with the OS — only the next
      // scheduleAllNotifications call reads the excused flag. C8: an
      // ifAbsent no-op ({written:false} — today's row already existed) must
      // never be read as "she is excused" either. Fetch the authoritative
      // rows and run the SAME sync app/haid.tsx's own screen uses: it
      // derives the flag from the real classified days (never from the
      // write attempt) and actually cancels/reschedules the OS
      // notifications to match — regardless of whether this call wrote
      // anything or was a no-op.
      const u = await NativeAuth.getUserInfo();
      if (!u?.id) return;
      const fresh = await utils.cycle.getMine.fetch().catch(() => null);
      if (!fresh?.enabled) return;
      const days: CycleDay[] = fresh.days.map((d) => ({ date: d.date, flow: d.flow as Flow, color: d.color as CycleDay["color"], ghusl: d.ghusl }));
      const settings: CycleSettings = { ...DEFAULT_SETTINGS, ...(fresh.settings ?? {}), enabled: true };
      const language = await readStoredLanguage();
      await syncHaidNotifications({ userId: u.id, days, settings, language }).catch(() => {});
    },
    // On failure nothing above runs (no flag write, no reschedule); tell her
    // so a swallowed network/precondition error isn't mistaken for success.
    onError: () => { Alert.alert("تعذّر الحفظ", "لم يُحفَظ، حاولي مرة أخرى."); },
  });

  if (!notification) return null;

  const rulingColor = RULING_COLORS[notification.ruling] || "#059669";
  const rulingBgColor = RULING_BG_COLORS[notification.ruling] || "#ECFDF5";

  const handleDoNow = () => {
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    onDoNow(notification);
  };

  const handleRemindLater = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onRemindLater(notification);
  };

  const handleHaid = () => {
    if (mine.data?.enabled === true) {
      markHaid.mutate({ date: isoToday(), flow: "blood", ifAbsent: true });
    } else {
      // Not enabled (or not yet known — fails safe toward not writing): the
      // server rejects the write outright, so attempting it here would
      // silently do nothing. Send her to enable it first — the consent
      // notice + «تفعيل» button live on that screen.
      router.push("/haid");
    }
    // onDoNow, not onDismiss: this component holds no follow-up-timer ref of
    // its own (it lives in usePopupNotifications, app/_layout.tsx's caller),
    // and onDoNow is already wired to that hook's handleDoNow, which clears
    // any pending follow-up before dismissing — onDismiss alone would not.
    onDoNow(notification);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDismiss}
      supportedOrientations={["portrait", "portrait-upside-down", "landscape"]}
    >
      {/* ScrollView, not View: the modal's content is a fixed ~396dp stack and
          the app is no longer portrait-locked, so in phone landscape the
          overlay offers only ~312-364dp. Centred in a plain View the overflow
          is symmetric and clipChildren cuts BOTH action buttons off-screen,
          leaving an undismissable reminder with no reachable control. flexGrow
          keeps it centred whenever it does fit. */}
      <ScrollView style={st.overlayScroll} contentContainerStyle={st.overlay}>
        <View style={st.modalContainer}>
          {/* Icon */}
          <View style={[st.iconCircle, { backgroundColor: rulingBgColor }]}>
            <MaterialIcons
              name={(notification.icon as any) || "notifications-active"}
              size={36}
              color={rulingColor}
            />
          </View>

          {/* Ruling Badge */}
          <View style={[st.rulingBadge, { backgroundColor: rulingBgColor }]}>
            <Text style={[st.rulingText, { color: rulingColor }]}>
              {language ? rulingLabel(notification.ruling, language) : ""}
            </Text>
          </View>

          {/* Title */}
          <Text style={st.title}>{notification.title}</Text>

          {/* Body */}
          <Text style={st.body}>{notification.body}</Text>

          {/* Follow-up question */}
          {isFollowUp && (
            <View style={st.followUpBanner}>
              <MaterialIcons name="help-outline" size={18} color="#92400E" />
              <Text style={st.followUpText}>هل فعلت ذلك؟</Text>
            </View>
          )}

          {/* Buttons */}
          <View style={st.buttonContainer}>
            {isFollowUp ? (
              <>
                <Pressable
                  onPress={handleDoNow}
                  style={({ pressed }) => [st.primaryButton, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
                >
                  <MaterialIcons name="check-circle" size={20} color="#FFFFFF" />
                  <Text style={st.primaryButtonText}>نعم، الحمد لله</Text>
                </Pressable>
                <Pressable
                  onPress={handleRemindLater}
                  style={({ pressed }) => [st.secondaryButton, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
                >
                  <MaterialIcons name="refresh" size={18} color="#4B5563" />
                  <Text style={st.secondaryButtonText}>ذكرني مرة أخرى</Text>
                </Pressable>
                {isWoman && (
                  <Pressable
                    onPress={handleHaid}
                    style={({ pressed }) => [st.secondaryButton, pressed && { opacity: 0.85 }]}
                  >
                    <MaterialIcons name="favorite-border" size={18} color="#4B5563" />
                    <Text style={st.secondaryButtonText}>أنا حائض</Text>
                  </Pressable>
                )}
              </>
            ) : (
              <>
                <Pressable
                  onPress={handleDoNow}
                  style={({ pressed }) => [st.primaryButton, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
                >
                  <MaterialIcons name="check" size={20} color="#FFFFFF" />
                  <Text style={st.primaryButtonText}>أفعل الآن إن شاء الله</Text>
                </Pressable>
                <Pressable
                  onPress={handleRemindLater}
                  style={({ pressed }) => [st.secondaryButton, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
                >
                  <MaterialIcons name="access-time" size={18} color="#4B5563" />
                  <Text style={st.secondaryButtonText}>أعد تذكيري بعد 10 دقائق</Text>
                </Pressable>
                {isWoman && (
                  <Pressable
                    onPress={handleHaid}
                    style={({ pressed }) => [st.secondaryButton, pressed && { opacity: 0.85 }]}
                  >
                    <MaterialIcons name="favorite-border" size={18} color="#4B5563" />
                    <Text style={st.secondaryButtonText}>أنا حائض</Text>
                  </Pressable>
                )}
              </>
            )}
          </View>
        </View>
      </ScrollView>
    </Modal>
  );
}

// ============ POPUP NOTIFICATION MANAGER ============

interface QueuedNotification {
  notification: PopupNotification;
  isFollowUp: boolean;
  scheduledAt: number;
}

/**
 * Hook to manage popup notification queue and follow-up system
 */
export function usePopupNotifications() {
  const [currentNotification, setCurrentNotification] = useState<PopupNotification | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isFollowUp, setIsFollowUp] = useState(false);
  const queueRef = useRef<QueuedNotification[]>([]);
  const followUpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotification = useCallback((notification: PopupNotification, followUp = false) => {
    if (isVisible) {
      // Queue the notification
      queueRef.current.push({ notification, isFollowUp: followUp, scheduledAt: Date.now() });
      return;
    }
    setCurrentNotification(notification);
    setIsFollowUp(followUp);
    setIsVisible(true);
  }, [isVisible]);

  const dismissCurrent = useCallback(() => {
    setIsVisible(false);
    setCurrentNotification(null);
    setIsFollowUp(false);

    // Show next in queue after a short delay
    setTimeout(() => {
      if (queueRef.current.length > 0) {
        const next = queueRef.current.shift()!;
        showNotification(next.notification, next.isFollowUp);
      }
    }, 500);
  }, [showNotification]);

  const handleDoNow = useCallback((notification: PopupNotification) => {
    // Clear any pending follow-up for this notification
    if (followUpTimerRef.current) {
      clearTimeout(followUpTimerRef.current);
      followUpTimerRef.current = null;
    }
    dismissCurrent();
  }, [dismissCurrent]);

  const handleRemindLater = useCallback((notification: PopupNotification) => {
    dismissCurrent();

    // Schedule follow-up after 15 minutes (or 10 minutes for "remind later")
    if (notification.followUpEnabled !== false) {
      const delay = isFollowUp ? 15 * 60 * 1000 : 10 * 60 * 1000; // 15 min for follow-up, 10 min for remind later
      followUpTimerRef.current = setTimeout(() => {
        showNotification(notification, true);
      }, delay);
    }
  }, [dismissCurrent, isFollowUp, showNotification]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (followUpTimerRef.current) {
        clearTimeout(followUpTimerRef.current);
      }
    };
  }, []);

  return {
    isVisible,
    currentNotification,
    isFollowUp,
    showNotification,
    handleDoNow,
    handleRemindLater,
    dismissCurrent,
  };
}

// ============ STYLES ============

const st = StyleSheet.create({
  overlayScroll: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  overlay: {
    // flexGrow, not flex: on a contentContainerStyle `flex: 1` would pin the
    // content to the viewport height and defeat scrolling entirely.
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContainer: {
    // The overlay's content container has padding 24, so "100%" here IS the
    // screen width - 48.
    // Same result as the Math.min it replaces, but resolved at layout time
    // instead of once at import: the app is no longer portrait-locked, and a
    // width captured before a rotation overflows the window after it.
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 28,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  rulingBadge: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 12,
    marginBottom: 16,
  },
  rulingText: {
    fontSize: 13,
    fontWeight: "700",
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1B4332",
    textAlign: "center",
    marginBottom: 12,
    writingDirection: "rtl",
  },
  body: {
    fontSize: 15,
    color: "#374151",
    textAlign: "center",
    lineHeight: 26,
    marginBottom: 20,
    writingDirection: "rtl",
  },
  followUpBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFFBEB",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 16,
  },
  followUpText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#92400E",
    writingDirection: "rtl",
  },
  buttonContainer: {
    width: "100%",
    gap: 10,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#1B4332",
    paddingVertical: 14,
    borderRadius: 14,
    width: "100%",
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
    writingDirection: "rtl",
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#F3F4F6",
    paddingVertical: 12,
    borderRadius: 14,
    width: "100%",
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4B5563",
    writingDirection: "rtl",
  },
});
