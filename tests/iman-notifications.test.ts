import { describe, it, expect } from "vitest";
import * as fs from "fs";

// ============ Test: Adhkar Data File ============
describe("Adhkar Data File", () => {
  const content = fs.readFileSync("lib/adhkar-data.ts", "utf-8");

  it("should export Dhikr interface with required fields", () => {
    expect(content).toContain("export interface Dhikr");
    expect(content).toContain("id: string");
    expect(content).toContain("text: string");
    expect(content).toContain("count: number");
    expect(content).toContain("ruling?:");
  });

  it("should export AdhkarCategory interface", () => {
    expect(content).toContain("export interface AdhkarCategory");
    expect(content).toContain("adhkar: Dhikr[]");
  });

  it("should export all required adhkar arrays", () => {
    expect(content).toContain("export const MORNING_ADHKAR");
    expect(content).toContain("export const EVENING_ADHKAR");
    expect(content).toContain("export const POST_PRAYER_ADHKAR");
    expect(content).toContain("export const SLEEP_ADHKAR");
    expect(content).toContain("export const WAKING_ADHKAR");
    expect(content).toContain("export const MURAQABA_ADHKAR");
    expect(content).toContain("export const IKHLAS_ADHKAR");
    expect(content).toContain("export const KHUSHOO_ADHKAR");
    expect(content).toContain("export const ISTIGHFAR_ADHKAR");
    expect(content).toContain("export const DUA_FOR_CHILDREN");
  });

  it("should export ADHKAR_CATEGORIES with all categories", () => {
    expect(content).toContain("export const ADHKAR_CATEGORIES");
    expect(content).toContain('id: "morning"');
    expect(content).toContain('id: "evening"');
    expect(content).toContain('id: "sleep"');
    expect(content).toContain('id: "waking"');
    expect(content).toContain('id: "muraqaba"');
    expect(content).toContain('id: "ikhlas"');
    expect(content).toContain('id: "khushoo"');
    expect(content).toContain('id: "dua-children"');
  });

  it("should export getNotificationForCategory function", () => {
    expect(content).toContain("export function getNotificationForCategory");
    expect(content).toContain("followUpEnabled");
    expect(content).toContain("deepLink");
  });
});

// ============ Test: Notification Settings Store ============
describe("Notification Settings Store", () => {
  const content = fs.readFileSync("lib/notification-settings.ts", "utf-8");

  it("should export UnifiedNotifPrefs type with iman and tarbiya sections", () => {
    expect(content).toContain("export interface UnifiedNotifPrefs");
    expect(content).toContain("iman:");
    expect(content).toContain("tarbiya:");
    expect(content).toContain("weekly:");
  });

  it("should export SyncSettings type", () => {
    expect(content).toContain("export interface SyncSettings");
    expect(content).toContain("syncFrequency");
    expect(content).toContain("syncChildren");
  });

  it("should have load/save functions for unified prefs", () => {
    expect(content).toContain("export async function loadUnifiedNotifPrefs");
    expect(content).toContain("export async function saveUnifiedNotifPrefs");
  });

  it("should have load/save functions for sync settings", () => {
    expect(content).toContain("export async function loadSyncSettings");
    expect(content).toContain("export async function saveSyncSettings");
  });

  it("should export default values", () => {
    expect(content).toContain("export const DEFAULT_UNIFIED_NOTIF_PREFS");
    expect(content).toContain("export const DEFAULT_SYNC_SETTINGS");
  });

  it("should include muraqaba settings", () => {
    expect(content).toContain("muraqabaEnabled");
    expect(content).toContain("muraqabaHour");
  });

  it("should include ikhlas and khushoo settings", () => {
    expect(content).toContain("ikhlasBeforePrayer");
    expect(content).toContain("khushooReminder");
    expect(content).toContain("ikhlasInWork");
  });

  it("should include tarbiya settings", () => {
    expect(content).toContain("duaForChildren");
    expect(content).toContain("dailyMomentEnabled");
    expect(content).toContain("spouseMoment");
    expect(content).toContain("dailyGoalAfterFajr");
  });

  it("should include weekly settings", () => {
    expect(content).toContain("hourOfAcceptanceFriday");
    expect(content).toContain("salatOnProphetFriday");
  });
});

// ============ Test: Iman Notifications Service ============
describe("Iman Notifications Service", () => {
  const content = fs.readFileSync("lib/iman-notifications.ts", "utf-8");

  it("should export scheduleImanNotifications function", () => {
    // Not "export async function": the export is now the thin queued wrapper
    // (see lib/notification-queue.ts), which returns enqueue(...) directly and
    // so is not itself async. The export NAME is the invariant here.
    expect(content).toContain("export function scheduleImanNotifications");
  });

  it("should schedule muraqaba notifications", () => {
    expect(content).toContain("muraqaba");
    expect(content).toContain("المراقبة");
  });

  it("should schedule ikhlas notifications", () => {
    expect(content).toContain("ikhlas");
    expect(content).toContain("الإخلاص");
  });

  it("should schedule khushoo notifications", () => {
    expect(content).toContain("khushoo");
    expect(content).toContain("الخشوع");
  });

  it("should schedule tarbiya notifications", () => {
    expect(content).toContain("duaForChildren");
    expect(content).toContain("الدعاء لأولادك");
  });

  it("should schedule weekly Friday notifications", () => {
    expect(content).toContain("hourOfAcceptanceFriday");
    expect(content).toContain("salatOnProphetFriday");
  });

  it("should use loadUnifiedNotifPrefs", () => {
    expect(content).toContain("loadUnifiedNotifPrefs");
  });
});

// ============ Test: Prayer Popup Modal ============
describe("Prayer Popup Modal", () => {
  const content = fs.readFileSync("components/prayer-popup-modal.tsx", "utf-8");

  it("should export PrayerPopupModal component", () => {
    expect(content).toContain("export function PrayerPopupModal");
  });

  it("should have follow-up system", () => {
    expect(content).toContain("followUp");
  });

  it("should show ruling importance", () => {
    expect(content).toContain("ruling");
    expect(content).toContain("واجب");
    expect(content).toContain("سنة مؤكدة");
    expect(content).toContain("مستحب");
  });

  it("should have deep link to adhkar page", () => {
    expect(content).toContain("deepLink");
  });
});

// ============ Test: Adhkar Page ============
describe("Adhkar Page", () => {
  const content = fs.readFileSync("app/details/adhkar.tsx", "utf-8");

  it("should import from adhkar-data.ts", () => {
    expect(content).toContain("@/lib/adhkar-data");
  });

  it("should use ADHKAR_CATEGORIES for category tabs", () => {
    expect(content).toContain("ADHKAR_CATEGORIES");
    expect(content).toContain("selectedCategoryId");
  });

  it("should use FlatList for performance", () => {
    expect(content).toContain("FlatList");
  });

  it("should show ruling badge", () => {
    expect(content).toContain("rulingBadge");
    expect(content).toContain("item.ruling");
  });

  it("should show source when available", () => {
    expect(content).toContain("item.source");
  });

  it("should show completion message", () => {
    expect(content).toContain("أحسنت! أتممت جميع الأذكار");
  });

  it("should support post-prayer type", () => {
    expect(content).toContain("isPostPrayer");
    expect(content).toContain("POST_PRAYER_ADHKAR");
  });
});

// ============ Test: Settings - Unified Notification Settings Button ============
describe("Settings - Unified Notification Settings", () => {
  const content = fs.readFileSync("app/(tabs)/settings.tsx", "utf-8");

  it("should have a button to navigate to notification-settings", () => {
    expect(content).toContain("/notification-settings");
  });

  it("should show unified notification settings label", () => {
    expect(content).toContain("جميع الإشعارات والتذكيرات");
  });
});

// ============ Test: Notification Settings Page ============
describe("Notification Settings Page", () => {
  const content = fs.readFileSync("app/(tabs)/notification-settings.tsx", "utf-8");

  it("should import loadUnifiedNotifPrefs and saveUnifiedNotifPrefs", () => {
    expect(content).toContain("loadUnifiedNotifPrefs");
    expect(content).toContain("saveUnifiedNotifPrefs");
  });

  it("should import scheduleImanNotifications", () => {
    expect(content).toContain("scheduleImanNotifications");
  });

  it("should have display mode options (normal, popup, both, off)", () => {
    expect(content).toContain('"normal"');
    expect(content).toContain('"popup"');
    expect(content).toContain('"both"');
    expect(content).toContain('"off"');
  });

  it("should have prayer category", () => {
    expect(content).toContain("إشعارات الصلاة");
  });

  it("should have iman category", () => {
    expect(content).toContain("إيمانية");
  });

  it("should have tarbiya category", () => {
    expect(content).toContain("تربوية");
  });

  it("should have adhkar category", () => {
    expect(content).toContain("الأذكار");
  });

  it("should have display mode options", () => {
    expect(content).toContain("طريقة عرض الإشعارات");
  });
});

// ============ Test: Sync Settings in Network ============
describe("Sync Settings in Network", () => {
  const content = fs.readFileSync("app/network.tsx", "utf-8");

  it("should import sync settings", () => {
    expect(content).toContain("loadSyncSettings");
    expect(content).toContain("saveSyncSettings");
    expect(content).toContain("SyncSettings");
  });

  it("should have sync frequency options", () => {
    expect(content).toContain("15min");
    expect(content).toContain("30min");
    expect(content).toContain("1hr");
    expect(content).toContain("manual");
  });

  it("should have data scope toggles", () => {
    expect(content).toContain("syncChildren");
    expect(content).toContain("syncIssues");
    expect(content).toContain("syncActionPlans");
    expect(content).toContain("syncEnvironments");
    expect(content).toContain("syncWeeklyProgress");
  });
});

// ============ Test: LLM Prompts - Praise Rules ============
describe("LLM Prompts - Islamic Praise Methodology", () => {
  it("should have praise rules in AI chat (Dutch)", () => {
    const content = fs.readFileSync("server/ai-chat.ts", "utf-8");
    expect(content).toContain("Prijs het kind NOOIT rechtstreeks");
    expect(content).toContain("Schrijf alle goede daden toe aan Allaah");
    expect(content).toContain("tawfieq");
  });

  it("should have praise rules in AI chat (Arabic)", () => {
    const content = fs.readFileSync("server/ai-chat.ts", "utf-8");
    expect(content).toContain("لا تمدح الطفل مباشرة أبدًا");
    expect(content).toContain("انسب كل خير إلى الله");
    expect(content).toContain("توفيق الله");
  });

  it("should have praise rules in AI chat (English)", () => {
    const content = fs.readFileSync("server/ai-chat.ts", "utf-8");
    expect(content).toContain("NEVER praise the child directly");
    expect(content).toContain("Attribute all good deeds to Allaah");
    expect(content).toContain("tawfeeq");
  });

  it("should have praise rules in advice.ts (Arabic)", () => {
    const content = fs.readFileSync("server/advice.ts", "utf-8");
    expect(content).toContain("لا تمدح الطفل مباشرة");
    expect(content).toContain("شجّع الفعل لا الشخص");
  });

  it("should have praise rules in advice.ts (English)", () => {
    const content = fs.readFileSync("server/advice.ts", "utf-8");
    expect(content).toContain("NEVER praise the child directly");
    expect(content).toContain("Encourage the ACTION, not the child");
  });

  it("should have praise rules in advice.ts (Dutch)", () => {
    const content = fs.readFileSync("server/advice.ts", "utf-8");
    expect(content).toContain("Prijs het kind NOOIT rechtstreeks");
    expect(content).toContain("Moedig de DAAD aan");
  });
});
