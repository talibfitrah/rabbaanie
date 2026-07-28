/**
 * Full-screen-intent prayer notifications via Notifee.
 *
 * Why: on Samsung/OEM devices the OS drops expo-notifications' scheduled
 * AlarmManager alarms once the app is asleep (battery exemption doesn't help).
 * A full-screen-intent notification is treated like an alarm clock — it is
 * privileged, fires in Doze, and shows in the CENTRE of the screen even over
 * the lock screen. This is exactly what Daa3iyah asked for (msg 439/445).
 *
 * Requires USE_FULL_SCREEN_INTENT (declared in app.config.ts) and the native
 * @notifee/react-native module (added via prebuild).
 */
import notifee, {
  AndroidImportance,
  AndroidVisibility,
  AndroidCategory,
  TriggerType,
  type TimestampTrigger,
} from "@notifee/react-native";

export const FULLSCREEN_CHANNEL = "prayer_fullscreen_v1";

/** Create the full-screen prayer channel (idempotent). HIGH importance + sound. */
export async function ensureFullScreenChannel(): Promise<void> {
  await notifee.createChannel({
    id: FULLSCREEN_CHANNEL,
    name: "تذكير الصلاة (ملء الشاشة)",
    importance: AndroidImportance.HIGH,
    sound: "default",
    vibration: true,
    visibility: AndroidVisibility.PUBLIC,
  });
}

/**
 * Build the full-screen notification payload for a prayer (or a test).
 * `category: ALARM` + `fullScreenAction` is what makes Android show it centre-
 * screen over the lock screen and fire it even in deep sleep.
 */
function fullScreenBody(title: string, body: string) {
  return {
    title,
    body,
    android: {
      channelId: FULLSCREEN_CHANNEL,
      importance: AndroidImportance.HIGH,
      category: AndroidCategory.ALARM,
      fullScreenAction: { id: "default" },
      pressAction: { id: "default" },
      autoCancel: true,
    },
  };
}

export type FSDiag = { alarmEnabled: boolean; notifeeShown: boolean; error?: string };

/**
 * Diagnostic + test: (1) verify the "Alarms & reminders" (exact-alarm) permission
 * — Notifee's alarmManager trigger needs it and Android 13/14 often leaves it
 * OFF, which makes the scheduled full-screen notification silently never fire;
 * if missing, open its settings screen. (2) Show an immediate Notifee
 * notification to prove Notifee can display at all. (3) Schedule the delayed
 * full-screen one so the user can lock the phone and see it centre-screen.
 * Any native error is returned (not thrown) so the UI can show it.
 */
export async function runFullScreenDiagnostic(seconds = 8): Promise<FSDiag> {
  try {
    await notifee.requestPermission();
    await ensureFullScreenChannel();
    const settings = await notifee.getNotificationSettings();
    // AndroidNotificationSetting.ENABLED === 1
    const alarmEnabled = (settings as any).android?.alarm === 1;
    if (!alarmEnabled) {
      await notifee.openAlarmPermissionSettings();
      return { alarmEnabled: false, notifeeShown: false };
    }
    await notifee.displayNotification(
      fullScreenBody("اختبار notifee الفوريّ", "إن رأيتَ هذا الإشعار فالنظام يعمل"),
    );
    const trigger: TimestampTrigger = {
      type: TriggerType.TIMESTAMP,
      timestamp: Date.now() + seconds * 1000,
      alarmManager: { allowWhileIdle: true },
    };
    await notifee.createTriggerNotification(
      fullScreenBody("حان وقتُ الصلاة", "اختبار إشعار ملء الشاشة — قُم إلى الصلاة"),
      trigger,
    );
    return { alarmEnabled: true, notifeeShown: true };
  } catch (e: any) {
    return { alarmEnabled: false, notifeeShown: false, error: String(e?.message || e) };
  }
}

/** Schedule one full-screen prayer notification at an exact timestamp (ms). */
export async function scheduleFullScreenPrayer(title: string, body: string, timestampMs: number): Promise<void> {
  await ensureFullScreenChannel();
  const trigger: TimestampTrigger = {
    type: TriggerType.TIMESTAMP,
    timestamp: timestampMs,
    alarmManager: { allowWhileIdle: true },
  };
  await notifee.createTriggerNotification(fullScreenBody(title, body), trigger);
}
