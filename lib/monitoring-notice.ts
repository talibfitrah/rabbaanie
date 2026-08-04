import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

/**
 * Persistent on-device notice shown to a CHILD whenever their app usage is
 * being collected and shared with their linked parent.
 *
 * This is not a nicety. Google Play's Stalkerware policy allows parental
 * monitoring only as a narrow exemption, and one of its conditions is literal:
 * "Apps must present users with a persistent notification at all times when the
 * app is running and a unique icon that clearly identifies the app."
 * (support.google.com/googleplay/android-developer/answer/9888380)
 *
 * Shipping PACKAGE_USAGE_STATS without this notice — and without the
 * isMonitoringTool flag in modules/usage-stats/.../AndroidManifest.xml — is what
 * gets an app classified as stalkerware rather than parental control.
 *
 * A foreground service is deliberately NOT used: usage is read on demand while
 * the child screen is open (see app/child-account/home.tsx), never in the
 * background, so an ongoing notification covers the whole window in which any
 * collection can happen.
 */

const CHANNEL_ID = "monitoring-status";

/** Stable id so the notice can be dismissed without tracking a handle. */
const NOTICE_ID = "monitoring-active";

type Lang = "nl" | "en" | "ar";

// Wording is aimed at the child being monitored, not the parent who enabled it:
// they are the person the policy requires to be informed.
const TEXT: Record<Lang, { title: string; body: string }> = {
  nl: {
    title: "Rabbaanie — je app-gebruik wordt gedeeld",
    body: "Je ouder kan zien welke apps je gebruikt en hoe lang.",
  },
  en: {
    title: "Rabbaanie — your app usage is being shared",
    body: "Your parent can see which apps you use and for how long.",
  },
  ar: {
    title: "ربّانيّ — تتم مشاركة استخدامك للتطبيقات",
    body: "يمكن لوالديك معرفة التطبيقات التي تستخدمها ومدة استخدامها.",
  },
};

/**
 * Show the ongoing notice. Safe to call repeatedly — the fixed identifier means
 * a repeat call replaces the existing notification instead of stacking.
 */
export async function showMonitoringNotice(language: string): Promise<boolean> {
  if (Platform.OS !== "android") return false;

  const lang: Lang = language === "ar" ? "ar" : language === "en" ? "en" : "nl";
  const text = TEXT[lang];

  try {
    const permissions = await Notifications.getPermissionsAsync();
    if (permissions.status !== "granted") {
      console.warn(
        "[Monitoring] Usage collection is disabled because notifications are not allowed.",
      );
      return false;
    }

    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Monitoring / Toezicht",
      // LOW keeps it silent and un-intrusive: this is a standing status
      // indicator, not an alert. It still shows in the shade, which is what the
      // policy requires.
      importance: Notifications.AndroidImportance.LOW,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      showBadge: false,
    });

    await Notifications.scheduleNotificationAsync({
      identifier: NOTICE_ID,
      content: {
        title: text.title,
        body: text.body,
        // sticky => Android "ongoing": the child cannot swipe it away while
        // monitoring is active, which is the point.
        sticky: true,
        autoDismiss: false,
        priority: Notifications.AndroidNotificationPriority.LOW,
      },
      // A channel-only trigger is immediate on Android and binds this notice
      // to the low-importance monitoring channel created above.
      trigger: { channelId: CHANNEL_ID },
    });
    return true;
  } catch (e) {
    // Fail closed: monitoring data must never be read or shared unless its
    // required persistent disclosure is visible on the monitored device.
    console.warn("[Monitoring] Could not show the monitoring notice:", e);
    return false;
  }
}

type NoticeGatedCollectionOptions = {
  language: string;
  collect: () => Promise<void>;
  isCancelled?: () => boolean;
  keepNoticeVisible?: boolean;
};

/**
 * Run sensitive collection only inside a successfully disclosed monitoring
 * window. Cancellation and collection failures remove the notice and fail
 * closed before any later work can continue.
 */
export async function runNoticeGatedCollection({
  language,
  collect,
  isCancelled = () => false,
  keepNoticeVisible = false,
}: NoticeGatedCollectionOptions): Promise<boolean> {
  const shown = await showMonitoringNotice(language);
  if (!shown) return false;
  if (isCancelled()) {
    await hideMonitoringNotice();
    return false;
  }

  let completed = false;
  try {
    await collect();
    completed = !isCancelled();
    return completed;
  } finally {
    if (!keepNoticeVisible || !completed) {
      await hideMonitoringNotice();
    }
  }
}

/** Remove the notice when monitoring is no longer active (logout, or navigating away). */
export async function hideMonitoringNotice(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.dismissNotificationAsync(NOTICE_ID);
    await Notifications.cancelScheduledNotificationAsync(NOTICE_ID);
  } catch {
    // Already gone is the desired end state, so nothing to do.
  }
}
