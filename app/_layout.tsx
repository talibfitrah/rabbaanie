import "@/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, usePathname, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { Platform, BackHandler, View } from "react-native";
import "@/lib/_core/nativewind-pressable";
import { ThemeProvider } from "@/lib/theme-provider";
import * as SplashScreen from "expo-splash-screen";
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import type { EdgeInsets, Metrics, Rect } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";

import { trpc, createTRPCClient } from "@/lib/trpc";
import {
  initManusRuntime,
  subscribeSafeAreaInsets,
} from "@/lib/_core/manus-runtime";
import { AppProvider, useAppState } from "@/lib/app-context";
import { isProfileComplete } from "@/lib/store";
import { I18nProvider, useI18n } from "@/lib/i18n";
import { useUpdates } from "@/hooks/use-updates";
import { UpdateProgressOverlay } from "@/components/UpdateProgressOverlay";
import {
  setupNotificationChannels,
  scheduleAllNotifications,
  scheduleWeeklyReminder,
  recordAppOpened,
  scheduleInactivityReminder,
  getUnfinishedGoalCount,
  scheduleGoalsIncompleteReminder,
} from "@/lib/notifications";
import {
  scheduleIqamahSilence,
  handleIqamahSilenceAction,
} from "@/lib/iqamah-silence";
import { deleteLegacyNotificationChannels } from "@/lib/notification-channels";
import {
  setupDailyAdviceChannel,
  scheduleDailyAdviceNotification,
  showAdviceWidget,
} from "@/lib/daily-advice-notification";
import {
  setupSpouseAdviceChannel,
  scheduleSpouseAdviceNotification,
} from "@/lib/spouse-advice-notification";
import {
  setupWeeklyGoalsChannel,
  scheduleWeeklyGoalsNotification,
} from "@/lib/weekly-goals-notification";
import {
  setupIslamicRemindersChannel,
  scheduleIslamicReminders,
  checkNightAppOpen,
} from "@/lib/islamic-reminders";
import {
  setupImanChannel,
  scheduleImanNotifications,
} from "@/lib/iman-notifications";
import {
  PrayerPopupModal,
  usePopupNotifications,
  type PopupNotification,
} from "@/components/prayer-popup-modal";
import { refreshAllWidgets } from "@/widgets/widgetSync";

// Register Android widget task handler
if (Platform.OS === "android") {
  require("@/widgets/widgetTaskHandler");
}
import { loadUnifiedNotifPrefs, resolveShouldShowPopup } from "@/lib/notification-settings";
import { AuthProvider, useAuthContext } from "@/lib/auth-context";
import { PersistentTabBar } from "@/components/persistent-tab-bar";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { ErrorBoundary } from "@/components/error-boundary";
import { LoadingScreen } from "@/components/loading-screen";
import { AnimatedSplash } from "@/components/animated-splash";
import {
  restoreQueryCache,
  setupQueryPersistence,
} from "@/lib/query-persistence";
import notifee from "@notifee/react-native";
import {
  AgeGateProvider,
  canUseNotifications,
  getGateRedirect,
  readStoredAgeGateStatus,
  useAgeGate,
} from "@/lib/age-gate";
import { resolvePendingRedirect } from "@/lib/app-gate";
import * as NativeAuth from "@/lib/_core/auth";

async function hasStoredNotificationEligibility(): Promise<boolean> {
  try {
    const [ageStatus, sessionToken] = await Promise.all([
      readStoredAgeGateStatus(),
      NativeAuth.getSessionToken(),
    ]);
    return canUseNotifications(ageStatus, Boolean(sessionToken));
  } catch {
    return false;
  }
}

// Set notification handler for foreground notifications
Notifications.setNotificationHandler({
  handleNotification: async () => {
    const isEligible = await hasStoredNotificationEligibility();
    return {
      shouldShowAlert: isEligible,
      shouldPlaySound: isEligible,
      shouldSetBadge: false,
      shouldShowBanner: isEligible,
      shouldShowList: isEligible,
    };
  },
});

// Notifee background event handler (module scope, required by Notifee). Used
// for the full-screen prayer notifications; tapping/full-screen just opens the
// app, so nothing extra to do here — this registration silences the warning.
notifee.onBackgroundEvent(async () => {});

// Keep splash screen visible until auth is resolved
SplashScreen.preventAutoHideAsync().catch(() => {});

const DEFAULT_WEB_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_WEB_FRAME: Rect = { x: 0, y: 0, width: 0, height: 0 };

export const unstable_settings = {
  anchor: "(tabs)",
};

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuthContext();
  const { status: ageStatus, loading: ageLoading } = useAgeGate();
  const { state: appState, loading: appLoading } = useAppState();
  const router = useRouter();
  const segments = useSegments();
  const pathname = usePathname();

  // Android back button: always go to previous page, not home
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const handler = BackHandler.addEventListener("hardwareBackPress", () => {
      // On home/root screen, let system handle (exit app)
      if (pathname === "/" || pathname === "/index") {
        return false;
      }
      // For tab screens (visible or hidden), navigate to home tab
      const tabRoutes = [
        "/fitrah",
        "/prayer-times",
        "/weekly",
        "/family",
        "/messages",
        "/dhikri",
        "/concepts",
        "/treatments",
        "/settings",
        "/mindsets",
        "/family-hub",
        "/mosques",
        "/personal-advice",
        "/notification-settings",
      ];
      if (tabRoutes.includes(pathname)) {
        router.navigate("/(tabs)" as any);
        return true;
      }
      // For all other screens (stack screens), go back to previous page
      if (router.canGoBack()) {
        router.back();
        return true;
      }
      return false;
    });
    return () => handler.remove();
  }, [pathname, router]);
  const [timedOut, setTimedOut] = useState(false);
  const [showAnimatedSplash, setShowAnimatedSplash] = useState(true);
  // Register push notifications when authenticated
  usePushNotifications(isAuthenticated && ageStatus === "adult");

  // Safety timeout: if auth loading takes more than 5 seconds, treat as unauthenticated
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => {
      console.warn("[AuthGate] Auth loading timed out after 5s");
      setTimedOut(true);
    }, 5000);
    return () => clearTimeout(timer);
  }, [loading]);

  const segment = segments[0] as string | undefined;

  // Computed during render (pure function) so gated children never mount for
  // even one frame when a redirect applies — e.g. a minor deep-linking past
  // the age gate.
  //
  // The age/auth gate runs first. Only once it is satisfied (no redirect) does
  // the mandatory-profile gate apply: signed-in users with an incomplete
  // profile are sent to onboarding (msg 476). Don't gate on the profile before
  // local state has hydrated — treat it as done so launch never flashes
  // onboarding for a complete user.
  const gateRedirect =
    ageLoading || (loading && !timedOut)
      ? null
      : getGateRedirect({
          status: ageStatus,
          isAuthenticated,
          segment,
        });

  const inSetup =
    segment === "onboarding" ||
    segment === "language-select" ||
    segment === "permissions-setup";
  const profileDone = appLoading
    ? true
    : isProfileComplete({ parentProfile: appState?.parentProfile, children: appState?.children });
  // permissionsSetupCompleted lives on AppState (lib/store.ts), not a
  // separate AsyncStorage key read once on AuthGate's mount — that was tried
  // first and needed a new special-cased re-read trigger for every path that
  // could invalidate it (logout, account switch, "reset all data"), missing
  // several. AppState already solves exactly this: useAppState() reflects
  // whatever persist()/resetState() last set, immediately, on every render,
  // for every one of those paths, since they already route through it for
  // parentProfile/onboardingCompleted. appLoading is treated as "done" the
  // same way profileDone above is, so this never flashes true before the
  // real per-account value has loaded.
  const permissionsSetupDone = appLoading ? true : Boolean(appState?.permissionsSetupCompleted);

  const pendingRedirect = resolvePendingRedirect({
    gateRedirect,
    ageLoading,
    loading,
    timedOut,
    ageStatus,
    isAuthenticated,
    profileDone,
    permissionsSetupDone,
    inSetup,
  });

  useEffect(() => {
    if (ageLoading || (loading && !timedOut)) return;
    console.log("[AuthGate] Check:", {
      ageStatus,
      isAuthenticated,
      loading,
      timedOut,
      segment,
      redirect: pendingRedirect,
    });
    if (pendingRedirect) router.replace(pendingRedirect as any);
  }, [
    ageStatus,
    ageLoading,
    isAuthenticated,
    loading,
    timedOut,
    segment,
    pendingRedirect,
    router,
  ]);

  if (ageLoading || (loading && !timedOut)) {
    // Show beautiful loading screen while auth is resolving
    SplashScreen.hideAsync().catch(() => {});
    if (showAnimatedSplash) {
      return <AnimatedSplash onFinish={() => setShowAnimatedSplash(false)} />;
    }
    return <LoadingScreen />;
  }
  // Hide splash screen once auth is resolved
  SplashScreen.hideAsync().catch(() => {});

  // Show animated splash on first load
  if (showAnimatedSplash) {
    return <AnimatedSplash onFinish={() => setShowAnimatedSplash(false)} />;
  }

  if (pendingRedirect) {
    return <LoadingScreen />;
  }

  return <View style={{ flex: 1 }}>{children}</View>;
}

// Mounts the silent launch check for APK updates (dialog on new release).
// The Settings screen mounts its own useUpdates instance for the manual check.
function UpdateCheck() {
  const { language } = useI18n();
  useUpdates(language, true);
  return null;
}

function NotificationLifecycle({
  initialize,
  dismissPopup,
}: {
  initialize: () => Promise<void>;
  dismissPopup: () => void;
}) {
  const { isAuthenticated, loading: authLoading } = useAuthContext();
  const { status: ageStatus, loading: ageLoading } = useAgeGate();

  useEffect(() => {
    if (Platform.OS === "web" || ageLoading || authLoading) return;

    let eligible = canUseNotifications(ageStatus, isAuthenticated);
    const clearNotifications = async () => {
      dismissPopup();
      await Promise.all([
        Notifications.cancelAllScheduledNotificationsAsync(),
        Notifications.dismissAllNotificationsAsync(),
      ]);
    };

    if (!eligible) {
      clearNotifications().catch((error) => {
        console.warn(
          "[Notifications] Could not clear ineligible notifications:",
          error,
        );
      });
      return;
    }

    initialize()
      .catch((error) => {
        console.warn(
          "[Notifications] Adult notification initialization failed:",
          error,
        );
      })
      .finally(() => {
        if (!eligible) clearNotifications().catch(() => {});
      });

    return () => {
      eligible = false;
    };
  }, [
    ageLoading,
    ageStatus,
    authLoading,
    dismissPopup,
    initialize,
    isAuthenticated,
  ]);

  return null;
}

export default function RootLayout() {
  const initialInsets = initialWindowMetrics?.insets ?? DEFAULT_WEB_INSETS;
  const initialFrame = initialWindowMetrics?.frame ?? DEFAULT_WEB_FRAME;

  const [insets, setInsets] = useState<EdgeInsets>(initialInsets);
  const [frame, setFrame] = useState<Rect>(initialFrame);

  // Popup notification system
  const popupHook = usePopupNotifications();

  // Listen for received notifications and show popup if displayMode requires it
  useEffect(() => {
    if (Platform.OS === "web") return;

    const subscription = Notifications.addNotificationReceivedListener(
      async (event) => {
        if (!(await hasStoredNotificationEligibility())) return;
        const data = event.request.content.data as any;
        if (!data) return;

        // Trigger widget refresh on prayer/adhan notifications
        const type = data.type || "";
        if (type.includes("prayer") || type.includes("adhan")) {
          try {
            const {
              refreshWidgetsOnAdhan,
            } = require("@/lib/widget-background-task");
            refreshWidgetsOnAdhan();
          } catch {}
        }

        // Check if this notification should show as popup
        const prefs = await loadUnifiedNotifPrefs();
        const shouldPopup = resolveShouldShowPopup(data, prefs.displayModes);

        if (shouldPopup) {
          const popupNotif: PopupNotification = {
            id: event.request.identifier,
            title: event.request.content.title || "",
            body: event.request.content.body || "",
            ruling: data.ruling || "مستحب",
            icon: data.icon,
            deepLink: data.url,
            followUpEnabled: true,
          };
          popupHook.showNotification(popupNotif);
        }
      },
    );

    return () => subscription.remove();
  }, [popupHook.showNotification]);

  // Listen for notification responses (user tapped on notification) - show popup when app opens
  useEffect(() => {
    if (Platform.OS === "web") return;

    const responseSubscription =
      Notifications.addNotificationResponseReceivedListener(
        async (response) => {
          if (!(await hasStoredNotificationEligibility())) return;
          const data = response.notification.request.content.data as any;
          if (!data) return;

          // Always show popup when user taps a notification
          const popupNotif: PopupNotification = {
            id: response.notification.request.identifier,
            title: response.notification.request.content.title || "",
            body: response.notification.request.content.body || "",
            ruling: data.ruling || "مستحب",
            icon: data.icon,
            deepLink: data.url,
            followUpEnabled: true,
          };
          // Small delay to ensure app is fully loaded before showing popup
          setTimeout(() => {
            hasStoredNotificationEligibility()
              .then((eligible) => {
                if (eligible) popupHook.showNotification(popupNotif);
              })
              .catch(() => {});
          }, 800);
        },
      );

    return () => responseSubscription.remove();
  }, [popupHook.showNotification]);

  // Check for missed notifications on app launch and show them as popups
  useEffect(() => {
    if (Platform.OS === "web") return;

    async function showMissedNotifications() {
      try {
        if (!(await hasStoredNotificationEligibility())) {
          await Notifications.dismissAllNotificationsAsync();
          return;
        }
        const prefs = await loadUnifiedNotifPrefs();
        // Get all delivered (but not yet dismissed) notifications
        const delivered = await Notifications.getPresentedNotificationsAsync();
        if (delivered.length === 0) return;

        for (const notif of delivered) {
          const data = notif.request.content.data as any;
          if (!data) continue;

          const shouldPopup = resolveShouldShowPopup(data, prefs.displayModes);

          if (shouldPopup) {
            const popupNotif: PopupNotification = {
              id: notif.request.identifier,
              title: notif.request.content.title || "",
              body: notif.request.content.body || "",
              ruling: data.ruling || "مستحب",
              icon: data.icon,
              deepLink: data.url,
              followUpEnabled: true,
            };
            popupHook.showNotification(popupNotif);
          }
        }

        // Dismiss all presented notifications after showing popups
        await Notifications.dismissAllNotificationsAsync();
      } catch (err) {
        console.warn("[Popup] Error showing missed notifications:", err);
      }
    }

    // Delay to ensure app is fully loaded
    const timer = setTimeout(showMissedNotifications, 1500);
    return () => clearTimeout(timer);
  }, [popupHook.showNotification]);

  // Initialize Manus runtime for cookie injection from parent container
  useEffect(() => {
    initManusRuntime();
  }, []);

  // Called only by NotificationLifecycle after both the adult gate and auth pass.
  const initNotifications = useCallback(async () => {
    if (Platform.OS === "web") return;
    try {
      // Never show a permission prompt before the adult gate and sign-in.
      // The authenticated push/onboarding flows request permission in context.
      const permission = await Notifications.getPermissionsAsync();
      if (permission.status !== "granted") {
        console.log(
          "[Notifications] Permission not granted yet, skipping launch scheduling",
        );
        return;
      }

      // Get user language from AsyncStorage
      const AsyncStorage = (
        await import("@react-native-async-storage/async-storage")
      ).default;
      const langRaw = await AsyncStorage.getItem("@app_language");
      const lang =
        langRaw === "ar" || langRaw === "en" || langRaw === "nl"
          ? langRaw
          : "nl";

      // Remove stale low-importance channels from older builds so the ones
      // recreated below take effect at their new heads-up importance.
      await deleteLegacyNotificationChannels();
      // Setup all notification channels
      await setupNotificationChannels();
      await setupDailyAdviceChannel();
      await setupSpouseAdviceChannel();
      await setupWeeklyGoalsChannel();
      await setupIslamicRemindersChannel();

      // Reschedule notifications on app launch (refreshes for next 7 days)
      await scheduleAllNotifications(lang);
      // NOTE: the battery-optimization exemption is intentionally NOT auto-fired
      // on launch. It dumped the user into a system settings screen 3.5s into
      // first launch (mid-onboarding) with no explanation, and the Play build
      // strips REQUEST_IGNORE_BATTERY_OPTIMIZATIONS anyway. It stays reachable,
      // user-initiated, from the permissions and settings screens.
      // Schedule weekly goals reminder
      await scheduleWeeklyGoalsNotification(lang);
      // Schedule weekly goal reminder with unfinished count
      const unfinished = await getUnfinishedGoalCount();
      await scheduleWeeklyReminder(lang, unfinished);
      // Schedule daily advice notification
      await scheduleDailyAdviceNotification(lang);
      // Schedule daily spouse advice notification
      await scheduleSpouseAdviceNotification(lang);
      // Show advice widget if enabled
      await showAdviceWidget(lang);
      // Record app opened and schedule inactivity reminder
      await recordAppOpened();
      await scheduleInactivityReminder(lang);
      // Schedule 3-day incomplete goals reminder
      await scheduleGoalsIncompleteReminder(lang);
      // Schedule Islamic reminders (istighfar, adhkar, qiyam)
      await scheduleIslamicReminders(lang);
      // Schedule iman/tarbiya reminders (muraqaba, ikhlas, khushoo, dua)
      await setupImanChannel();
      await scheduleImanNotifications(lang);
      // Schedule iqamah auto-silence
      await scheduleIqamahSilence(lang);
      // === Pre-populate widget cache from stored data ===
      const locRaw = await AsyncStorage.getItem("@prayer_location");
      if (locRaw) {
        try {
          const loc = JSON.parse(locRaw);
          const methodRaw = await AsyncStorage.getItem("@prayer_method");
          const { calculatePrayerTimes, getIslamicDate } =
            await import("@/lib/prayer-data");
          const { CALC_METHODS } = await import("@/lib/prayer-data");
          const method =
            CALC_METHODS.find((m: any) => m.id === methodRaw) ||
            CALC_METHODS[0];
          const now = new Date();
          const times = calculatePrayerTimes(
            now,
            loc.lat,
            loc.lng,
            method,
            loc.tz,
          );
          if (times) {
            const { cachePrayerTimesForWidget, cacheHijriForWidget } =
              await import("@/widgets/widgetSync");
            await cachePrayerTimesForWidget({
              fajr: times.fajr,
              sunrise: times.sunrise,
              dhuhr: times.dhuhr,
              asr: times.asr,
              maghrib: times.maghrib,
              isha: times.isha,
            });
            const hijri = getIslamicDate(now, times.maghrib, loc.tz);
            await cacheHijriForWidget(
              `${hijri.day} ${hijri.monthName} ${hijri.year}`,
            );
          }
        } catch (e) {
          console.warn("Widget cache init error:", e);
        }
      }
      // Cache today's goal from weekly goals
      const goalsRaw = await AsyncStorage.getItem("@weekly_goals_cache");
      if (goalsRaw) {
        try {
          const goals = JSON.parse(goalsRaw);
          if (goals.length > 0) {
            const dayIdx = new Date().getDay();
            const goal = goals[dayIdx % goals.length];
            const { cacheGoalForWidget } = await import("@/widgets/widgetSync");
            await cacheGoalForWidget(
              goal.title || goal.explanation,
              undefined,
              "\u062A\u0631\u0628\u064A\u0629",
            );
          }
        } catch (e) {
          console.warn("Widget goal cache error:", e);
        }
      }
      // Refresh all home screen widgets with latest data
      await refreshAllWidgets();

      // Register background task for periodic widget updates
      const { registerWidgetBackgroundTask, getWidgetBackgroundStatus } =
        await import("@/lib/widget-background-task");
      const bgStatus = await getWidgetBackgroundStatus();
      await registerWidgetBackgroundTask(bgStatus.intervalMinutes);
    } catch (err) {
      console.warn("Notification init error:", err);
    }
  }, []);

  const handleSafeAreaUpdate = useCallback((metrics: Metrics) => {
    setInsets(metrics.insets);
    setFrame(metrics.frame);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const unsubscribe = subscribeSafeAreaInsets(handleSafeAreaUpdate);
    return () => unsubscribe();
  }, [handleSafeAreaUpdate]);

  // Create clients once and reuse them
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
            staleTime: 5 * 60 * 1000, // 5 minutes - data stays fresh
            gcTime: 24 * 60 * 60 * 1000, // 24 hours - keep in cache
            networkMode: "offlineFirst", // Use cache first, then fetch
          },
        },
      }),
  );

  // Restore persisted query cache on app start and setup auto-save
  useEffect(() => {
    restoreQueryCache(queryClient).catch(() => {});
    const cleanup = setupQueryPersistence(queryClient);
    return cleanup;
  }, [queryClient]);
  const [trpcClient] = useState(() => createTRPCClient());

  // Ensure minimum 8px padding for top and bottom on mobile
  const providerInitialMetrics = useMemo(() => {
    const metrics = initialWindowMetrics ?? {
      insets: initialInsets,
      frame: initialFrame,
    };
    return {
      ...metrics,
      insets: {
        ...metrics.insets,
        top: Math.max(metrics.insets.top, 16),
        bottom: Math.max(metrics.insets.bottom, 12),
      },
    };
  }, [initialInsets, initialFrame]);

  const content = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <I18nProvider>
            <UpdateCheck />
            <UpdateProgressOverlay />
            <AgeGateProvider>
              <AppProvider>
                <AuthProvider>
                  <NotificationLifecycle
                    initialize={initNotifications}
                    dismissPopup={popupHook.dismissCurrent}
                  />
                  <AuthGate>
                    <View style={{ flex: 1 }}>
                    <Stack
                      screenOptions={{
                        headerShown: false,
                        gestureEnabled: true,
                        gestureDirection: "horizontal",
                        animation: "slide_from_right",
                      }}
                    >
                      <Stack.Screen name="(tabs)" />
                      <Stack.Screen name="onboarding" />
                      <Stack.Screen
                        name="language-select"
                        options={{ gestureEnabled: false }}
                      />
                      <Stack.Screen
                        name="child"
                        options={{
                          headerShown: false,
                          animation: "slide_from_right",
                        }}
                      />
                      <Stack.Screen
                        name="child-account"
                        options={{ headerShown: false }}
                      />
                      <Stack.Screen
                        name="weather"
                        options={{ animation: "slide_from_right" }}
                      />
                      <Stack.Screen
                        name="sunnah"
                        options={{ animation: "slide_from_right" }}
                      />
                      <Stack.Screen
                        name="age-check"
                        options={{ gestureEnabled: false }}
                      />
                      <Stack.Screen
                        name="login"
                        options={{ gestureEnabled: false }}
                      />
                      <Stack.Screen
                        name="forgot-password"
                        options={{
                          gestureEnabled: true,
                          animation: "slide_from_bottom",
                        }}
                      />
                      <Stack.Screen
                        name="permissions-setup"
                        options={{ gestureEnabled: false }}
                      />
                      <Stack.Screen
                        name="oauth/callback"
                        options={{ gestureEnabled: false }}
                      />
                      <Stack.Screen
                        name="details"
                        options={{
                          presentation: "modal",
                          animation: "slide_from_bottom",
                        }}
                      />
                      <Stack.Screen
                        name="ai-chat"
                        options={{
                          presentation: "modal",
                          animation: "slide_from_bottom",
                        }}
                      />
                      <Stack.Screen
                        name="chat-notes"
                        options={{
                          presentation: "modal",
                          animation: "slide_from_bottom",
                        }}
                      />
                      <Stack.Screen name="network" />
                      <Stack.Screen name="find-specialist" />
                      <Stack.Screen name="id-management" />
                      <Stack.Screen name="qr-scanner" />
                      <Stack.Screen name="specialist-chat" />
                      <Stack.Screen name="specialist" />
                      <Stack.Screen name="newsletter" />
                      <Stack.Screen name="content" />
                      <Stack.Screen name="admin" />
                      <Stack.Screen name="library" />
                      <Stack.Screen name="community" />
                      <Stack.Screen
                        name="child-profile"
                        options={{
                          headerShown: false,
                          animation: "slide_from_right",
                        }}
                      />
                      <Stack.Screen name="spouse-profile" />
                      <Stack.Screen name="emotion-path" />
                      <Stack.Screen name="qibla" />
                      <Stack.Screen name="qiyam" />
                      <Stack.Screen
                        name="add-child"
                        options={{
                          headerShown: false,
                          animation: "slide_from_right",
                        }}
                      />
                    </Stack>
                    </View>
                    <PersistentTabBar />
                  </AuthGate>
                </AuthProvider>
              </AppProvider>
            </AgeGateProvider>
          </I18nProvider>
          <StatusBar style="auto" />
          {/* Popup notification modal - renders above everything */}
          <PrayerPopupModal
            visible={popupHook.isVisible}
            notification={popupHook.currentNotification}
            onDismiss={popupHook.dismissCurrent}
            onDoNow={popupHook.handleDoNow}
            onRemindLater={popupHook.handleRemindLater}
            isFollowUp={popupHook.isFollowUp}
          />
        </QueryClientProvider>
      </trpc.Provider>
    </GestureHandlerRootView>
  );

  const shouldOverrideSafeArea = Platform.OS === "web";

  if (shouldOverrideSafeArea) {
    return (
      <ErrorBoundary>
        <ThemeProvider>
          <SafeAreaProvider initialMetrics={providerInitialMetrics}>
            <SafeAreaFrameContext.Provider value={frame}>
              <SafeAreaInsetsContext.Provider value={insets}>
                {content}
              </SafeAreaInsetsContext.Provider>
            </SafeAreaFrameContext.Provider>
          </SafeAreaProvider>
        </ThemeProvider>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <SafeAreaProvider initialMetrics={providerInitialMetrics}>
          {content}
        </SafeAreaProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
