// Widget names - must match app.config.ts plugin config
export const PRAYER_WIDGET_NAME = "PrayerWidget";
export const DHIKR_WIDGET_NAME = "DhikrWidget";
export const GOAL_WIDGET_NAME = "GoalWidget";
export const HIJRI_WIDGET_NAME = "HijriWidget";
export const COMBINED_WIDGET_NAME = "CombinedWidget";

// Widget settings keys
export const WIDGET_SETTINGS_KEY = "@widget_settings";

export interface WidgetSettings {
  prayerWidget: {
    showAllPrayers: boolean; // true = all prayers + sunrise, false = next prayer only
    showCountdown: boolean;
  };
  dhikrWidget: {
    enabled: boolean;
    changeInterval: "hourly" | "every_prayer" | "daily";
  };
  goalWidget: {
    enabled: boolean;
    showChildName: boolean;
  };
  hijriWidget: {
    enabled: boolean;
    showEvent: boolean;
    showGregorianBelow: boolean;
  };
  combinedWidget: {
    sections: ("prayer" | "dhikr" | "goal" | "hijri")[];
  };
}

export const DEFAULT_WIDGET_SETTINGS: WidgetSettings = {
  prayerWidget: {
    showAllPrayers: true,
    showCountdown: true,
  },
  dhikrWidget: {
    enabled: true,
    changeInterval: "every_prayer",
  },
  goalWidget: {
    enabled: true,
    showChildName: true,
  },
  hijriWidget: {
    enabled: true,
    showEvent: true,
    showGregorianBelow: true,
  },
  combinedWidget: {
    sections: ["prayer", "dhikr", "goal", "hijri"],
  },
};
