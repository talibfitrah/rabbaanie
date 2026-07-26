import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { trpc } from "@/lib/trpc";
import { handleIqamahSilenceAction } from "@/lib/iqamah-silence";
import { checkForUpdate } from "@/hooks/use-updates";
import { syncLanguageToServer } from "@/lib/language-sync";

// Configure notification handler for foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  if (!Device.isDevice) {
    console.log("[Push] Must use physical device for push notifications");
    return null;
  }

  // Set up Android channels
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("messages", {
      name: "Berichten",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#2E7D32",
      sound: "default",
    });
    await Notifications.setNotificationChannelAsync("content", {
      name: "Nieuwe Content",
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: "#1565C0",
      sound: "default",
    });
    await Notifications.setNotificationChannelAsync("shared", {
      name: "Gedeelde activiteiten",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 100, 200],
      lightColor: "#1B4332",
      sound: "default",
    });
  }

  // Check/request permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") {
    console.log("[Push] Permission not granted");
    return null;
  }

  // Get Expo push token
  try {
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
    if (!projectId) {
      console.log("[Push] No project ID found");
      return null;
    }
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    return tokenData.data;
  } catch (e) {
    console.warn("[Push] Error getting push token:", e);
    return null;
  }
}

/**
 * Hook that registers for push notifications and sends the token to the server.
 * Should be called once in the root layout after authentication.
 */
export function usePushNotifications(isAuthenticated: boolean) {
  const registerTokenMutation = trpc.specialist.registerPushToken.useMutation();
  const registered = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || registered.current) return;
    if (Platform.OS === "web") return;

    const register = async () => {
      const token = await registerForPushNotificationsAsync();
      if (token) {
        try {
          await registerTokenMutation.mutateAsync({ token });
          registered.current = true;
          // The user is authenticated here, so push the chosen app language to
          // the server (it may have been selected before login and never synced,
          // which is why server-sent notifications defaulted to Dutch).
          void syncLanguageToServer();
          console.log("[Push] Token registered:", token.substring(0, 20) + "...");
        } catch (e) {
          console.warn("[Push] Failed to register token with server:", e);
        }
      }
    };

    register();
  }, [isAuthenticated]);

  // Listen for received notifications (auto-handle iqamah silence/restore)
  useEffect(() => {
    if (Platform.OS === "web") return;

    const receivedSub = Notifications.addNotificationReceivedListener(async (notification) => {
      const data = notification.request.content.data;
      if (data?.type === "iqamah_silence" && data?.action === "silence") {
        await handleIqamahSilenceAction("silence");
      } else if (data?.type === "iqamah_restore" && data?.action === "restore") {
        await handleIqamahSilenceAction("restore");
      }
    });

    return () => receivedSub.remove();
  }, []);

  // Listen for notification responses (user taps notification)
  useEffect(() => {
    if (Platform.OS === "web") return;

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      const { router } = require("expo-router");

      // Handle iqamah silence/restore on tap
      if (data?.type === "iqamah_silence") {
        handleIqamahSilenceAction("silence");
        return;
      }
      if (data?.type === "iqamah_restore") {
        handleIqamahSilenceAction("restore");
        return;
      }

      if (data?.type === "app_update") {
        // New-version push: re-check our own manifest (which re-validates the
        // download URL) and show the standard "update available" dialog. The
        // push payload's version is never trusted to drive the download.
        checkForUpdate(false);
        return;
      }
      
      if (data?.type === "message" || data?.type === "coparent_message") {
        // Navigate to messages tab for all message types
        console.log("[Push] User tapped message notification from:", data.senderId);
        router.push("/(tabs)/messages");
      } else if (data?.type === "activity_update" || data?.type === "environment_update" || data?.type === "consultation_share") {
        // Navigate to network/messages tab for shared interaction notifications
        console.log("[Push] User tapped shared interaction notification:", data.type);
        router.push("/(tabs)/messages");
      } else if (data?.type === "new_content" && data?.contentId) {
        // Navigate to content detail screen
        router.push(`/content/detail/${data.contentId}`);
      } else if (data?.type === "advice") {
        // Navigate to personal advice
        router.push("/details/personal-advice");
      } else if (data?.type === "daily_tip") {
        // Navigate to daily tips
        router.push("/details/tips-today");
      } else if (data?.type === "weekly_goals_reminder" || data?.type === "goals_incomplete_3days") {
        // Navigate to weekly goals tab
        router.push("/(tabs)/weekly");
      } else if (data?.url) {
        // Generic URL-based navigation
        router.push(data.url as string);
      } else {
        // Default: go to home
        router.push("/(tabs)");
      }
    });

    return () => subscription.remove();
  }, []);
}
