/**
 * Maps @notifee/react-native's AndroidNotificationSetting (the exact-alarm /
 * "Alarms & reminders" permission status) to this app's PermissionStatus.
 * Pulled out of app/permissions-setup.tsx into its own dependency-free file
 * so it's directly unit-testable without dragging in every React Native
 * import that screen has — getting ENABLED/DISABLED backwards here would
 * silently tell the user the opposite of the truth about whether hands-free
 * iqamah silence (modules/iqamah-alarm) can actually fire.
 *
 * Values match AndroidNotificationSetting: NOT_SUPPORTED = -1, DISABLED = 0,
 * ENABLED = 1.
 */
export function mapExactAlarmPermissionStatus(
  setting: number | undefined | null,
): "granted" | "denied" | "unavailable" {
  if (setting === 1) return "granted";
  if (setting === 0) return "denied";
  return "unavailable";
}
