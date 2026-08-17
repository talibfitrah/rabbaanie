package expo.modules.iqamahalarm

import android.app.AlarmManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.os.Build

/**
 * Runs with the app fully killed. This is the entire reason this module
 * exists: expo-notifications listeners (lib/iqamah-silence.ts
 * handleIqamahSilenceAction) only fire in the foreground or on a
 * notification tap, never with no JS running at all.
 *
 * android:exported="false" in the manifest — BOOT_COMPLETED is a protected
 * system broadcast the OS delivers to our own components regardless of
 * exported, and ACTION_SILENCE/ACTION_RESTORE are only ever sent as explicit
 * PendingIntents from within this app, never resolved by intent-filter
 * matching, so exported=false cannot block them either.
 */
class IqamahAlarmReceiver : BroadcastReceiver() {
  companion object {
    const val ACTION_SILENCE = "expo.modules.iqamahalarm.ACTION_SILENCE"
    const val ACTION_RESTORE = "expo.modules.iqamahalarm.ACTION_RESTORE"
    const val EXTRA_DURATION_MINUTES = "durationMinutes"

    // A single fixed slot: scheduling a new restore always replaces any
    // previous pending one (FLAG_UPDATE_CURRENT), so at most one restore is
    // ever armed. Silence alarms use 0..34 (7 days x 5 prayers, computed in
    // lib/iqamah-silence.ts) — 1000 is well clear of that range.
    private const val RESTORE_REQUEST_CODE = 1000

    // FLAG_IMMUTABLE has existed since API 23; this app's minSdkVersion is 24
    // (app.config.ts), so it is always available — no SDK_INT check needed.
    // Required unconditionally regardless: omitting both MUTABLE/IMMUTABLE
    // throws on API 31+, which this app's devices can be.
    fun pendingIntentFlags(): Int = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

    private fun hasDndAccess(context: Context): Boolean {
      val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      return nm.isNotificationPolicyAccessGranted
    }

    private fun scheduleRestore(context: Context, atMs: Long) {
      val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      val intent = Intent(context, IqamahAlarmReceiver::class.java).setAction(ACTION_RESTORE)
      val pi = PendingIntent.getBroadcast(context, RESTORE_REQUEST_CODE, intent, pendingIntentFlags())
      try {
        alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pi)
      } catch (e: SecurityException) {
        // Exact-alarm permission revoked between the silence firing and now.
        // IqamahAlarmStore still holds the mute record either way, so the
        // next boot (or a manual "restore sound" tap) still recovers it —
        // this can delay a restore, never lose it permanently.
      }
    }

    private fun silence(context: Context, durationMinutes: Int) {
      if (!hasDndAccess(context)) return
      val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      val restoreAtMs = System.currentTimeMillis() + durationMinutes * 60_000L
      // Capture BEFORE muting — otherwise we'd capture our own silence.
      IqamahAlarmStore.captureIfNeeded(
        context, audioManager.ringerMode, AudioManager.RINGER_MODE_SILENT, restoreAtMs,
      )
      audioManager.ringerMode = AudioManager.RINGER_MODE_SILENT
      scheduleRestore(context, restoreAtMs)
    }

    private fun restore(context: Context) {
      if (!hasDndAccess(context)) return
      // Read-and-clear; null means nothing was captured (already restored,
      // or silence never actually ran) — never force a mode in that case.
      val priorMode = IqamahAlarmStore.consumePriorMode(context) ?: return
      val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      audioManager.ringerMode = priorMode
    }

    /**
     * The "stuck silent forever" guard for the one case a persisted alarm
     * cannot self-heal: AlarmManager alarms do not survive reboot, so a
     * pending restore that hasn't fired yet is gone the moment the device
     * restarts. Restoring immediately — rather than re-arming a restore
     * alarm for later — trades a mute period that may end a few minutes
     * early for removing an entire class of "the re-armed alarm also failed"
     * failure modes. Erring toward audible-too-soon over silent-forever.
     */
    private fun restoreImmediatelyIfPending(context: Context) {
      if (!IqamahAlarmStore.hasPendingRestore(context)) return
      restore(context)
    }

    private fun rearmFutureSilenceAlarms(context: Context) {
      val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) return
      val now = System.currentTimeMillis()
      for ((requestCode, triggerAtMs, durationMinutes) in IqamahAlarmStore.loadSchedule(context)) {
        if (triggerAtMs <= now) continue
        val intent = Intent(context, IqamahAlarmReceiver::class.java)
          .setAction(ACTION_SILENCE)
          .putExtra(EXTRA_DURATION_MINUTES, durationMinutes)
        val pi = PendingIntent.getBroadcast(context, requestCode, intent, pendingIntentFlags())
        try {
          alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, pi)
        } catch (e: SecurityException) {
          // Skip this one; the rest of the loop still re-arms.
        }
      }
    }
  }

  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      ACTION_SILENCE -> silence(context, intent.getIntExtra(EXTRA_DURATION_MINUTES, 10))
      ACTION_RESTORE -> restore(context)
      Intent.ACTION_BOOT_COMPLETED -> {
        restoreImmediatelyIfPending(context)
        rearmFutureSilenceAlarms(context)
      }
    }
  }
}
