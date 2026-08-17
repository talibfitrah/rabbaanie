package expo.modules.iqamahalarm

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Single owner of (a) the "prior ringer mode + when to restore" record and
 * (b) the persisted upcoming-silence-alarm schedule.
 *
 * Plain SharedPreferences, not AsyncStorage: IqamahAlarmReceiver runs with no
 * JS/React Native bridge available (that is the entire point of this
 * module), so AsyncStorage's own storage is unreachable from it. This is the
 * one store both the JS-callable IqamahAlarmModule functions and the
 * receiver read and write, so the two entry points can never disagree about
 * whether a mute is already captured.
 */
object IqamahAlarmStore {
  private const val PREFS_NAME = "iqamah_alarm_store"
  private const val KEY_PRIOR_MODE = "prior_ringer_mode"
  private const val KEY_RESTORE_AT = "restore_at_ms"
  private const val KEY_SCHEDULE = "silence_schedule"

  private fun prefs(context: Context) =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  /**
   * Persist the prior ringer mode + its restore deadline, but only if
   * nothing is already captured and the current mode isn't already
   * "silent" — mirrors the capture guard this replaces on the JS side:
   * never overwrite a real prior mode with our own silence.
   */
  fun captureIfNeeded(context: Context, currentMode: Int, silentMode: Int, restoreAtMs: Long) {
    val p = prefs(context)
    if (p.contains(KEY_PRIOR_MODE)) return
    if (currentMode == silentMode) return
    p.edit()
      .putInt(KEY_PRIOR_MODE, currentMode)
      .putLong(KEY_RESTORE_AT, restoreAtMs)
      .apply()
  }

  /**
   * Read-and-clear. Returns null when nothing was captured — callers must
   * never force a ringer mode in that case (that would raise a phone the
   * user had deliberately left on vibrate/silent, or fire twice for one
   * mute period).
   */
  fun consumePriorMode(context: Context): Int? {
    val p = prefs(context)
    if (!p.contains(KEY_PRIOR_MODE)) return null
    val mode = p.getInt(KEY_PRIOR_MODE, -1)
    p.edit().remove(KEY_PRIOR_MODE).remove(KEY_RESTORE_AT).apply()
    return mode
  }

  /** Non-consuming peek, used only to decide whether a reboot needs to restore. */
  fun hasPendingRestore(context: Context): Boolean = prefs(context).contains(KEY_PRIOR_MODE)

  /** Persisted so BOOT_COMPLETED can re-arm future alarms with no JS running. */
  fun saveSchedule(context: Context, entries: List<Triple<Int, Long, Int>>) {
    val arr = JSONArray()
    for ((requestCode, triggerAtMs, durationMinutes) in entries) {
      val o = JSONObject()
      o.put("requestCode", requestCode)
      o.put("triggerAtMs", triggerAtMs)
      o.put("durationMinutes", durationMinutes)
      arr.put(o)
    }
    prefs(context).edit().putString(KEY_SCHEDULE, arr.toString()).apply()
  }

  fun loadSchedule(context: Context): List<Triple<Int, Long, Int>> {
    val raw = prefs(context).getString(KEY_SCHEDULE, null) ?: return emptyList()
    return try {
      val arr = JSONArray(raw)
      (0 until arr.length()).map { i ->
        val o = arr.getJSONObject(i)
        Triple(o.getInt("requestCode"), o.getLong("triggerAtMs"), o.getInt("durationMinutes"))
      }
    } catch (e: Exception) {
      emptyList()
    }
  }
}
