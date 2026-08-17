package expo.modules.iqamahalarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

// 7 days x 5 prayers — matches the requestCode formula in
// lib/iqamah-silence.ts (dayOffset * 5 + prayerIndex). Fixed and cancelled
// in full on every call so a shrunk schedule (fewer days, a disabled prayer)
// can't leave a stale alarm armed under an unused request code.
private const val SILENCE_REQUEST_CODE_COUNT = 35

class IqamahAlarmEntryRecord : Record {
  @Field val requestCode: Int = 0
  @Field val triggerAtMs: Long = 0L
  @Field val durationMinutes: Int = 0
}

class IqamahAlarmModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("IqamahAlarm")

    /**
     * Cancels every previously-armed silence alarm in the fixed request-code
     * range, persists the new schedule (so BOOT_COMPLETED can re-arm it
     * later with no JS running), then arms each future entry. An empty list
     * clears everything — the caller's way of disabling the feature, no
     * separate cancel function needed.
     */
    AsyncFunction("scheduleSilenceAlarms") { entries: List<IqamahAlarmEntryRecord> ->
      val context = appContext.reactContext ?: return@AsyncFunction 0
      val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      val flags = IqamahAlarmReceiver.pendingIntentFlags()

      for (requestCode in 0 until SILENCE_REQUEST_CODE_COUNT) {
        val cancelIntent = Intent(context, IqamahAlarmReceiver::class.java)
          .setAction(IqamahAlarmReceiver.ACTION_SILENCE)
        val pi = PendingIntent.getBroadcast(context, requestCode, cancelIntent, flags)
        alarmManager.cancel(pi)
      }

      val parsed = entries.map { Triple(it.requestCode, it.triggerAtMs, it.durationMinutes) }
      IqamahAlarmStore.saveSchedule(context, parsed)

      val canScheduleExact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarmManager.canScheduleExactAlarms()
      var scheduledCount = 0
      if (canScheduleExact) {
        val now = System.currentTimeMillis()
        for ((requestCode, triggerAtMs, durationMinutes) in parsed) {
          if (triggerAtMs <= now) continue
          val intent = Intent(context, IqamahAlarmReceiver::class.java)
            .setAction(IqamahAlarmReceiver.ACTION_SILENCE)
            .putExtra(IqamahAlarmReceiver.EXTRA_DURATION_MINUTES, durationMinutes)
          val pi = PendingIntent.getBroadcast(context, requestCode, intent, flags)
          try {
            alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, pi)
            scheduledCount++
          } catch (ex: SecurityException) {
            // Permission race (revoked between the JS-side check and this
            // call) — skip this entry, the rest of the batch still schedules.
          }
        }
      }
      scheduledCount
    }

    /**
     * Mirrors IqamahAlarmReceiver's own capture-on-fire, exposed so the
     * JS-driven (foreground/notification-tap) silence path writes the exact
     * same record the receiver reads on the killed-app path — one state
     * owner, two entry points, see IqamahAlarmStore.
     */
    AsyncFunction("captureRingerModeIfNeeded") { durationMinutes: Int ->
      val context = appContext.reactContext ?: return@AsyncFunction Unit
      val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      val restoreAtMs = System.currentTimeMillis() + durationMinutes * 60_000L
      IqamahAlarmStore.captureIfNeeded(context, audioManager.ringerMode, AudioManager.RINGER_MODE_SILENT, restoreAtMs)
    }

    /** Read-and-clear. Returns null when nothing was captured. */
    AsyncFunction("consumePriorRingerMode") {
      val context = appContext.reactContext ?: return@AsyncFunction null
      IqamahAlarmStore.consumePriorMode(context)
    }
  }
}
