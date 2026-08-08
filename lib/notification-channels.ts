import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

/**
 * Android never changes an existing channel's importance — so to make
 * notifications pop up (heads-up) for users whose channels were created at a
 * lower importance by an older build, the channel IDs are bumped (…"_v2") to
 * force recreation at the new importance. These are the pre-v2 IDs to delete on
 * launch so users don't keep stale, silent duplicates in their settings.
 */
export const LEGACY_CHANNEL_IDS = [
  "prayer_times",
  "prayer_times_v2",
  "adhkaar_reminders",
  "weekly_reminders",
  "inactivity_reminder",
  "goals_incomplete",
  "iqamah_silence",
  "islamic_reminders",
  "iman_reminders",
  "weekly_goals",
  "spouse_advice",
  "daily_advice",
];

export async function deleteLegacyNotificationChannels(): Promise<void> {
  if (Platform.OS !== "android") return;
  for (const id of LEGACY_CHANNEL_IDS) {
    try {
      await Notifications.deleteNotificationChannelAsync(id);
    } catch {
      /* best-effort */
    }
  }
}
