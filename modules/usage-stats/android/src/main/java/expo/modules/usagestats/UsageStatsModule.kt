package expo.modules.usagestats

import android.app.AppOpsManager
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Build
import android.os.Process
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.Calendar

class UsageStatsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("UsageStats")

    /**
     * Check if the app has PACKAGE_USAGE_STATS permission
     */
    Function("isPermissionGranted") {
      val context = appContext.reactContext ?: return@Function false
      val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
      val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        appOps.unsafeCheckOpNoThrow(
          AppOpsManager.OPSTR_GET_USAGE_STATS,
          Process.myUid(),
          context.packageName
        )
      } else {
        @Suppress("DEPRECATION")
        appOps.checkOpNoThrow(
          AppOpsManager.OPSTR_GET_USAGE_STATS,
          Process.myUid(),
          context.packageName
        )
      }
      mode == AppOpsManager.MODE_ALLOWED
    }

    /**
     * Open the system Usage Access settings screen
     */
    Function("openPermissionSettings") {
      val context = appContext.reactContext ?: return@Function false
      try {
        val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        true
      } catch (e: Exception) {
        false
      }
    }

    /**
     * Get app usage stats for a specific day
     * @param daysAgo - 0 for today, 1 for yesterday, etc.
     * @returns Array of objects with packageName, appName, usageSeconds, openCount, category
     */
    AsyncFunction("getDailyUsage") { daysAgo: Int ->
      val context = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, Any>>()
      
      val usageStatsManager = context.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
        ?: return@AsyncFunction emptyList<Map<String, Any>>()

      val calendar = Calendar.getInstance()
      calendar.add(Calendar.DAY_OF_YEAR, -daysAgo)
      calendar.set(Calendar.HOUR_OF_DAY, 0)
      calendar.set(Calendar.MINUTE, 0)
      calendar.set(Calendar.SECOND, 0)
      calendar.set(Calendar.MILLISECOND, 0)
      val startTime = calendar.timeInMillis

      calendar.set(Calendar.HOUR_OF_DAY, 23)
      calendar.set(Calendar.MINUTE, 59)
      calendar.set(Calendar.SECOND, 59)
      val endTime = calendar.timeInMillis

      val usageStatsList = usageStatsManager.queryUsageStats(
        UsageStatsManager.INTERVAL_DAILY,
        startTime,
        endTime
      )

      val pm = context.packageManager
      val results = mutableListOf<Map<String, Any>>()

      for (usageStats in usageStatsList) {
        val totalTime = usageStats.totalTimeInForeground
        if (totalTime < 60000) continue // Skip apps used less than 1 minute

        val packageName = usageStats.packageName
        val appName = try {
          val appInfo = pm.getApplicationInfo(packageName, 0)
          pm.getApplicationLabel(appInfo).toString()
        } catch (e: PackageManager.NameNotFoundException) {
          packageName
        }

        // Determine category
        val category = try {
          val appInfo = pm.getApplicationInfo(packageName, 0)
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            when (appInfo.category) {
              ApplicationInfo.CATEGORY_GAME -> "games"
              ApplicationInfo.CATEGORY_AUDIO, ApplicationInfo.CATEGORY_VIDEO -> "media"
              ApplicationInfo.CATEGORY_SOCIAL -> "social"
              ApplicationInfo.CATEGORY_NEWS -> "news"
              ApplicationInfo.CATEGORY_PRODUCTIVITY -> "productivity"
              else -> categorizeByPackageName(packageName)
            }
          } else {
            categorizeByPackageName(packageName)
          }
        } catch (e: Exception) {
          "other"
        }

        // Check if it's a system app
        val isSystemApp = try {
          val appInfo = pm.getApplicationInfo(packageName, 0)
          (appInfo.flags and ApplicationInfo.FLAG_SYSTEM) != 0
        } catch (e: Exception) {
          false
        }

        // Skip system apps (launcher, system UI, etc.)
        if (isSystemApp && !isRelevantSystemApp(packageName)) continue

        results.add(mapOf(
          "packageName" to packageName,
          "appName" to appName,
          "usageSeconds" to (totalTime / 1000),
          "openCount" to 0, // UsageStats doesn't directly provide open count in older APIs
          "category" to category,
          "isSystemApp" to isSystemApp
        ))
      }

      // Sort by usage time descending
      results.sortByDescending { it["usageSeconds"] as Long }
      results
    }

    /**
     * Get total screen time for a specific day (in seconds)
     */
    AsyncFunction("getTotalScreenTime") { daysAgo: Int ->
      val context = appContext.reactContext ?: return@AsyncFunction 0L
      
      val usageStatsManager = context.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
        ?: return@AsyncFunction 0L

      val calendar = Calendar.getInstance()
      calendar.add(Calendar.DAY_OF_YEAR, -daysAgo)
      calendar.set(Calendar.HOUR_OF_DAY, 0)
      calendar.set(Calendar.MINUTE, 0)
      calendar.set(Calendar.SECOND, 0)
      calendar.set(Calendar.MILLISECOND, 0)
      val startTime = calendar.timeInMillis

      calendar.set(Calendar.HOUR_OF_DAY, 23)
      calendar.set(Calendar.MINUTE, 59)
      calendar.set(Calendar.SECOND, 59)
      val endTime = calendar.timeInMillis

      val usageStatsList = usageStatsManager.queryUsageStats(
        UsageStatsManager.INTERVAL_DAILY,
        startTime,
        endTime
      )

      var totalMs = 0L
      for (stats in usageStatsList) {
        totalMs += stats.totalTimeInForeground
      }
      totalMs / 1000
    }
  }

  private fun categorizeByPackageName(packageName: String): String {
    return when {
      packageName.contains("youtube") || packageName.contains("tiktok") || 
      packageName.contains("netflix") || packageName.contains("video") -> "media"
      
      packageName.contains("instagram") || packageName.contains("facebook") || 
      packageName.contains("twitter") || packageName.contains("snapchat") || 
      packageName.contains("whatsapp") || packageName.contains("telegram") ||
      packageName.contains("discord") -> "social"
      
      packageName.contains("game") || packageName.contains("roblox") || 
      packageName.contains("minecraft") || packageName.contains("fortnite") ||
      packageName.contains("pubg") || packageName.contains("supercell") -> "games"
      
      packageName.contains("chrome") || packageName.contains("browser") || 
      packageName.contains("firefox") || packageName.contains("opera") -> "browser"
      
      packageName.contains("quran") || packageName.contains("prayer") || 
      packageName.contains("muslim") || packageName.contains("islamic") ||
      packageName.contains("adhkar") || packageName.contains("azkar") -> "islamic"
      
      packageName.contains("school") || packageName.contains("learn") || 
      packageName.contains("education") || packageName.contains("study") ||
      packageName.contains("duolingo") || packageName.contains("khan") -> "education"
      
      else -> "other"
    }
  }

  private fun isRelevantSystemApp(packageName: String): Boolean {
    // Some system apps are relevant to track (browser, camera, etc.)
    return packageName.contains("chrome") || 
           packageName.contains("browser") ||
           packageName.contains("camera") ||
           packageName.contains("gallery") ||
           packageName.contains("photos")
  }
}
