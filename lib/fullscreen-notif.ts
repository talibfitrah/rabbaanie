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
import * as IntentLauncher from "expo-intent-launcher";
import * as Application from "expo-application";

const PKG = Application.applicationId || "com.app.opvoedadvies.apk";

/** Open the "Full-screen notifications" special permission (Android 14+). Without
 *  it a full-screen intent is demoted to a top heads-up banner instead of a
 *  centre-screen popup. Falls back to the app notification settings on older OS. */
export async function openFullScreenPermission(): Promise<void> {
  try {
    await IntentLauncher.startActivityAsync("android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT", { data: "package:" + PKG });
  } catch {
    try {
      await IntentLauncher.startActivityAsync("android.settings.APP_NOTIFICATION_SETTINGS", { extra: { "android.provider.extra.APP_PACKAGE": PKG } });
    } catch { /* ignore */ }
  }
}

/** Open the "Alarms & reminders" (exact alarm) permission — needed for the
 *  scheduled trigger to fire at all on Android 12+. */
export async function openAlarmPermission(): Promise<void> {
  try {
    await notifee.openAlarmPermissionSettings();
  } catch {
    try {
      await IntentLauncher.startActivityAsync("android.settings.REQUEST_SCHEDULE_EXACT_ALARM", { data: "package:" + PKG });
    } catch { /* ignore */ }
  }
}

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

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
  ]);
}

/**
 * Full diagnostic dump: runs every Notifee step independently (each timeout-
 * guarded so one hang can't blank the report) and returns a short multi-line
 * status the UI shows in an Alert for the user to screenshot. This gives exact
 * ground truth for an on-device problem we can't reproduce here:
 *   perm  = notification permission (1=granted)
 *   alarm = exact-alarm ("Alarms & reminders") setting (1=on, 0=off, -1=n/a)
 *   chan/disp/trig = channel create / immediate display / 8s trigger schedule
 * After reporting, it opens the alarm-settings screen when exact-alarm is off.
 */
export async function fullScreenDiagReport(seconds = 8): Promise<string> {
  const L: string[] = [];
  let alarm: any = null;
  try { const p: any = await withTimeout(notifee.requestPermission(), 5000); L.push(`perm=${p?.authorizationStatus}`); } catch (e: any) { L.push(`perm ERR:${e?.message || e}`); }
  try { const s: any = await withTimeout(notifee.getNotificationSettings(), 5000); alarm = s?.android?.alarm; L.push(`alarm=${alarm}`); } catch (e: any) { L.push(`settings ERR:${e?.message || e}`); }
  try { await withTimeout(ensureFullScreenChannel(), 5000); L.push("chan=ok"); } catch (e: any) { L.push(`chan ERR:${e?.message || e}`); }
  try { await withTimeout(notifee.displayNotification(fullScreenBody("اختبار فوريّ", "إن ظهر هذا فالنظام يعمل")), 5000); L.push("disp=ok"); } catch (e: any) { L.push(`disp ERR:${e?.message || e}`); }
  try {
    const trigger: TimestampTrigger = { type: TriggerType.TIMESTAMP, timestamp: Date.now() + seconds * 1000, alarmManager: { allowWhileIdle: true } };
    await withTimeout(notifee.createTriggerNotification(fullScreenBody("حان وقتُ الصلاة", "اختبار ملء الشاشة"), trigger), 5000);
    L.push("trig=ok");
  } catch (e: any) { L.push(`trig ERR:${e?.message || e}`); }
  return L.join("\n");
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
