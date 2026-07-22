import AsyncStorage from "@react-native-async-storage/async-storage";

// ============ Types ============

export type WidgetThemeMode = "light" | "dark" | "system";
export type WidgetFontSize = "small" | "medium" | "large";
export type WidgetCornerStyle = "rounded" | "sharp";
export type DhikrInterval = "hourly" | "every_prayer" | "daily";
export type WidgetTapAction = "home" | "prayer" | "dhikr" | "goals" | "calendar";
export type UpdateInterval = 15 | 30 | 45 | 60 | 120;
export type DhikrContextMode = "auto" | "manual";
export type DhikrContext = "أذكار_الصباح" | "أذكار_المساء" | "أذكار_النوم" | "أذكار_بعد_الصلاة" | "أذكار_عامة";

/** Hex color type compatible with react-native-android-widget ColorProp */
export type HexColor = `#${string}`;

/** المظهر */
export interface WidgetAppearanceSettings {
  themeMode: WidgetThemeMode;
  backgroundColor: HexColor;
  textColor: HexColor;
  fontSize: WidgetFontSize;
  fontScale: number; // percentage scale 80-150 (default 100)
  cornerStyle: WidgetCornerStyle;
  showBorder: boolean;
  borderColor: HexColor;
  opacity: number; // 0.0 - 1.0
}

/** الأوقات */
export interface WidgetTimingSettings {
  updateInterval: UpdateInterval; // minutes
  updateOnAdhan: boolean;
  activeStartHour: number; // 0-23 (بداية العمل)
  activeEndHour: number; // 0-23 (نهاية العمل، 0 = بلا حد)
  dhikrChangeInterval: DhikrInterval;
}

/** المحتوى */
export interface WidgetContentSettings {
  // Prayer widget
  prayerShowAll: boolean;
  prayerShowCountdown: boolean;
  prayerShowSunrise: boolean;
  prayerShowIqamah: boolean;
  // Dhikr widget
  dhikrShowSource: boolean;
  dhikrShowVirtue: boolean;
  dhikrContextMode: DhikrContextMode; // auto = حسب الوقت, manual = سياق ثابت
  dhikrFixedContext: DhikrContext; // السياق الثابت عند الوضع اليدوي
  // Goal widget
  goalShowChildName: boolean;
  goalShowProgress: boolean;
  // Hijri widget
  hijriShowGregorian: boolean;
  hijriShowEvent: boolean;
  hijriShowDayName: boolean;
  // Combined widget sections
  combinedSections: string[]; // ["prayer", "dhikr", "goal", "hijri"]
}

/** الفاعلية */
export interface WidgetBehaviorSettings {
  tapAction: WidgetTapAction;
  instantUpdate: boolean; // تحديث فوري عند تغيير الإعدادات
  showPreview: boolean; // معاينة مباشرة
}

/** الإعدادات الكاملة */
export interface FullWidgetSettings {
  appearance: WidgetAppearanceSettings;
  timing: WidgetTimingSettings;
  content: WidgetContentSettings;
  behavior: WidgetBehaviorSettings;
}

// ============ Defaults ============

export const DEFAULT_APPEARANCE: WidgetAppearanceSettings = {
  themeMode: "light",
  backgroundColor: "#FFFFFF" as HexColor,
  textColor: "#1B4332" as HexColor,
  fontSize: "medium",
  fontScale: 100,
  cornerStyle: "rounded",
  showBorder: true,
  borderColor: "#E5E7EB" as HexColor,
  opacity: 1.0,
};

export const DEFAULT_TIMING: WidgetTimingSettings = {
  updateInterval: 30,
  updateOnAdhan: true,
  activeStartHour: 4, // الفجر
  activeEndHour: 0, // بلا حد (24 ساعة)
  dhikrChangeInterval: "every_prayer",
};

export const DEFAULT_CONTENT: WidgetContentSettings = {
  prayerShowAll: true,
  prayerShowCountdown: true,
  prayerShowSunrise: true,
  prayerShowIqamah: false,
  dhikrShowSource: true,
  dhikrShowVirtue: true,
  dhikrContextMode: "auto" as DhikrContextMode,
  dhikrFixedContext: "أذكار_الصباح" as DhikrContext,
  goalShowChildName: true,
  goalShowProgress: true,
  hijriShowGregorian: true,
  hijriShowEvent: true,
  hijriShowDayName: true,
  combinedSections: ["prayer", "dhikr", "goal", "hijri"],
};

export const DEFAULT_BEHAVIOR: WidgetBehaviorSettings = {
  tapAction: "home",
  instantUpdate: true,
  showPreview: true,
};

export const DEFAULT_WIDGET_SETTINGS: FullWidgetSettings = {
  appearance: DEFAULT_APPEARANCE,
  timing: DEFAULT_TIMING,
  content: DEFAULT_CONTENT,
  behavior: DEFAULT_BEHAVIOR,
};

// ============ Storage ============

const STORAGE_KEY = "@widget_settings_v2";

export async function loadWidgetSettings(): Promise<FullWidgetSettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_WIDGET_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      appearance: { ...DEFAULT_APPEARANCE, ...parsed.appearance },
      timing: { ...DEFAULT_TIMING, ...parsed.timing },
      content: { ...DEFAULT_CONTENT, ...parsed.content },
      behavior: { ...DEFAULT_BEHAVIOR, ...parsed.behavior },
    };
  } catch {
    return DEFAULT_WIDGET_SETTINGS;
  }
}

export async function saveWidgetSettings(settings: FullWidgetSettings): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

// ============ Color Presets ============

export const BACKGROUND_COLORS = [
  { label: "أبيض", value: "#FFFFFF" },
  { label: "كريمي", value: "#FFF8E7" },
  { label: "أخضر فاتح", value: "#E8F5E9" },
  { label: "أزرق فاتح", value: "#E3F2FD" },
  { label: "رمادي", value: "#F5F5F5" },
  { label: "أخضر داكن", value: "#1B4332" },
  { label: "كحلي", value: "#1A237E" },
  { label: "أسود", value: "#121212" },
];

export const TEXT_COLORS = [
  { label: "أخضر داكن", value: "#1B4332" },
  { label: "أسود", value: "#111111" },
  { label: "رمادي غامق", value: "#374151" },
  { label: "أبيض", value: "#FFFFFF" },
  { label: "ذهبي", value: "#C4A35A" },
  { label: "أزرق", value: "#1565C0" },
];

export const BORDER_COLORS = [
  { label: "رمادي فاتح", value: "#E5E7EB" },
  { label: "أخضر", value: "#1B4332" },
  { label: "ذهبي", value: "#C4A35A" },
  { label: "أزرق", value: "#1565C0" },
  { label: "شفاف", value: "#00000000" },
];
