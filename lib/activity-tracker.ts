/**
 * Activity Tracker for Child Accounts
 * Tracks app usage, screen visits, and task completions
 * Stores locally and syncs to server periodically
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const ACTIVITY_KEY = "child_activity_log";
const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes
const SESSION_KEY = "child_session";

export interface ActivityEntry {
  type: "app_open" | "app_close" | "screen_visit" | "dhikr_complete" | "task_complete" | "quran_read" | "wird_complete" | "ai_question" | "chat_sent";
  screen?: string;
  details?: string;
  timestamp: string;
  duration_seconds?: number;
}

interface Session {
  startTime: string;
  childAccountId: number;
}

class ActivityTracker {
  private childAccountId: number | null = null;
  private sessionStart: Date | null = null;
  private currentScreen: string | null = null;
  private screenStartTime: Date | null = null;
  private syncTimer: ReturnType<typeof setInterval> | null = null;

  async init(childAccountId: number) {
    this.childAccountId = childAccountId;
    this.sessionStart = new Date();
    await this.logActivity({ type: "app_open", timestamp: new Date().toISOString() });
    
    // Save session
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify({
      startTime: this.sessionStart.toISOString(),
      childAccountId,
    }));

    // Start sync timer
    this.syncTimer = setInterval(() => this.syncToServer(), SYNC_INTERVAL);
  }

  async logActivity(entry: ActivityEntry) {
    try {
      const existing = await AsyncStorage.getItem(ACTIVITY_KEY);
      const logs: ActivityEntry[] = existing ? JSON.parse(existing) : [];
      logs.push(entry);
      // Keep max 500 entries locally
      if (logs.length > 500) logs.splice(0, logs.length - 500);
      await AsyncStorage.setItem(ACTIVITY_KEY, JSON.stringify(logs));
    } catch (e) {
      console.warn("ActivityTracker: Failed to log", e);
    }
  }

  async trackScreenVisit(screenName: string) {
    // Log duration of previous screen
    if (this.currentScreen && this.screenStartTime) {
      const duration = Math.round((Date.now() - this.screenStartTime.getTime()) / 1000);
      if (duration > 2) { // Only log if > 2 seconds
        await this.logActivity({
          type: "screen_visit",
          screen: this.currentScreen,
          duration_seconds: duration,
          timestamp: this.screenStartTime.toISOString(),
        });
      }
    }
    this.currentScreen = screenName;
    this.screenStartTime = new Date();
  }

  async trackDhikrComplete(dhikrName: string) {
    await this.logActivity({
      type: "dhikr_complete",
      details: dhikrName,
      timestamp: new Date().toISOString(),
    });
  }

  async trackTaskComplete(taskTitle: string) {
    await this.logActivity({
      type: "task_complete",
      details: taskTitle,
      timestamp: new Date().toISOString(),
    });
  }

  async trackWirdComplete(wirdType: string) {
    await this.logActivity({
      type: "wird_complete",
      details: wirdType,
      timestamp: new Date().toISOString(),
    });
  }

  async trackAIQuestion() {
    await this.logActivity({
      type: "ai_question",
      timestamp: new Date().toISOString(),
    });
  }

  async trackChatSent() {
    await this.logActivity({
      type: "chat_sent",
      timestamp: new Date().toISOString(),
    });
  }

  async endSession() {
    if (this.sessionStart) {
      const duration = Math.round((Date.now() - this.sessionStart.getTime()) / 1000);
      await this.logActivity({
        type: "app_close",
        duration_seconds: duration,
        timestamp: new Date().toISOString(),
      });
    }
    await this.syncToServer();
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.sessionStart = null;
    this.childAccountId = null;
  }

  async syncToServer() {
    if (!this.childAccountId) return;
    try {
      const existing = await AsyncStorage.getItem(ACTIVITY_KEY);
      if (!existing) return;
      const logs: ActivityEntry[] = JSON.parse(existing);
      if (logs.length === 0) return;

      // Calculate daily summary
      const today = new Date().toISOString().split("T")[0];
      const todayLogs = logs.filter(l => l.timestamp.startsWith(today));
      
      const totalAppTime = todayLogs
        .filter(l => l.type === "app_close" && l.duration_seconds)
        .reduce((sum, l) => sum + (l.duration_seconds || 0), 0);
      
      const dhikrCount = todayLogs.filter(l => l.type === "dhikr_complete").length;
      const tasksCompleted = todayLogs.filter(l => l.type === "task_complete").length;
      const aiQuestions = todayLogs.filter(l => l.type === "ai_question").length;
      const screenVisits = todayLogs.filter(l => l.type === "screen_visit");

      // Build summary for server
      const summary = {
        childAccountId: this.childAccountId,
        date: today,
        appUsageMinutes: Math.round(totalAppTime / 60),
        dhikrCompleted: dhikrCount,
        tasksCompleted,
        aiQuestionsAsked: aiQuestions,
        screensVisited: [...new Set(screenVisits.map(s => s.screen))],
        totalScreenTime: totalAppTime,
      };

      // Send to server (fire and forget)
      try {
        const response = await fetch("/api/trpc/childActivity.syncDailySummary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ json: summary }),
        });
        if (response.ok) {
          // Clear synced logs (keep only today's for ongoing tracking)
          const remaining = logs.filter(l => l.timestamp.startsWith(today));
          await AsyncStorage.setItem(ACTIVITY_KEY, JSON.stringify(remaining));
        }
      } catch {
        // Will retry next sync
      }
    } catch (e) {
      console.warn("ActivityTracker: Sync failed", e);
    }
  }

  getSessionDuration(): number {
    if (!this.sessionStart) return 0;
    return Math.round((Date.now() - this.sessionStart.getTime()) / 1000);
  }
}

export const activityTracker = new ActivityTracker();
