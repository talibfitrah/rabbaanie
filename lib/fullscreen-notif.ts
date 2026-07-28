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

/**
 * Fire a full-screen test after `seconds` so the user can lock the phone and
 * watch it appear over the lock screen. Uses an exact allow-while-idle alarm.
 */
export async function fireFullScreenTest(seconds = 8): Promise<void> {
  await notifee.requestPermission();
  await ensureFullScreenChannel();
  const trigger: TimestampTrigger = {
    type: TriggerType.TIMESTAMP,
    timestamp: Date.now() + seconds * 1000,
    alarmManager: { allowWhileIdle: true },
  };
  await notifee.createTriggerNotification(
    fullScreenBody("حان وقتُ الصلاة", "اختبار إشعار ملء الشاشة — قُم إلى الصلاة"),
    trigger,
  );
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
