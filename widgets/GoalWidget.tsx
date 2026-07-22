import React from "react";
import { FlexWidget, TextWidget } from "react-native-android-widget";
import type { WidgetAppearanceSettings, WidgetContentSettings, HexColor } from "@/lib/widget-settings";

function withAlpha(color: HexColor, alpha: string): HexColor {
  return `${color}${alpha}` as HexColor;
}

const GOLD = "#C4A35A";

interface GoalWidgetProps {
  goalText: string;
  childName?: string;
  category: string;
  dayName: string;
  progressText?: string;
  tarbiyaTip?: string;
  tipIndex?: number;
  tipTotal?: number;
  nextPrayerAr?: string;
  nextPrayerTime?: string;
  countdown?: string;
  hijriDate?: string;
  appearance: WidgetAppearanceSettings;
  content: WidgetContentSettings;
  widgetWidth?: number;
  widgetHeight?: number;
  lang?: string;
}

function getFontSize(base: number, size: WidgetAppearanceSettings["fontSize"], fontScale?: number): number {
  let result = base;
  if (size === "large") result = base + 6;
  else if (size === "medium") result = base + 4;
  const scale = (fontScale || 100) / 100;
  return Math.round(result * scale);
}

export function buildGoalWidgetTree(props: GoalWidgetProps) {
  const { goalText, childName, category, dayName, progressText, tarbiyaTip, tipIndex, tipTotal, nextPrayerAr, nextPrayerTime, countdown, hijriDate, appearance, content, widgetWidth, widgetHeight, lang } = props;
  const goalLabel = lang === "nl" ? "Doel van de dag" : lang === "en" ? "Today's goal" : "هدف اليوم";
  const goalLabelLong = lang === "nl" ? "Opvoedingsdoel van de dag" : lang === "en" ? "Today's parenting goal" : "هدف اليوم التربوي";
  const bg = appearance.backgroundColor;
  const fg = appearance.textColor;
  const radius = appearance.cornerStyle === "rounded" ? 16 : 4;
  const borderW = appearance.showBorder ? 1 : 0;
  const borderC = appearance.borderColor;

  // Determine orientation: horizontal if width > height
  const isHorizontal = (widgetWidth && widgetHeight) ? widgetWidth > widgetHeight * 1.3 : false;

  if (isHorizontal) {
    // === HORIZONTAL LAYOUT ===
    return (
      <FlexWidget
        style={{
          width: "match_parent",
          height: "match_parent",
          backgroundColor: bg,
          padding: 10,
          flexDirection: "row",
          alignItems: "center",
          borderRadius: radius,
          borderWidth: borderW,
          borderColor: borderC,
          flexGap: 12,
        }}
        clickAction="OPEN_APP"
      >
        {/* Left: Category + Prayer + Progress */}
        <FlexWidget
          style={{
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 8,
            flexGap: 4,
            borderRightWidth: 1,
            borderRightColor: withAlpha(fg, "15"),
            paddingRight: 12,
          }}
        >
          <TextWidget
            text={goalLabel}
            style={{ fontSize: getFontSize(12, appearance.fontSize, appearance.fontScale), color: GOLD, fontWeight: "bold" }}
          />
          <TextWidget
            text={category}
            style={{ fontSize: getFontSize(10, appearance.fontSize, appearance.fontScale), color: withAlpha(fg, "70") }}
          />
          {content.goalShowProgress && progressText ? (
            <FlexWidget style={{ backgroundColor: withAlpha(GOLD, "15"), paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
              <TextWidget text={progressText} style={{ fontSize: getFontSize(10, appearance.fontSize, appearance.fontScale), color: GOLD, fontWeight: "bold" }} />
            </FlexWidget>
          ) : null}
          {nextPrayerAr && nextPrayerTime ? (
            <FlexWidget style={{ flexDirection: "column", alignItems: "center", flexGap: 1 }}>
              <TextWidget text={nextPrayerAr} style={{ fontSize: getFontSize(10, appearance.fontSize, appearance.fontScale), color: GOLD }} />
              <TextWidget text={nextPrayerTime} style={{ fontSize: getFontSize(11, appearance.fontSize, appearance.fontScale), color: GOLD, fontWeight: "bold" }} />
            </FlexWidget>
          ) : null}
          <FlexWidget
            style={{ backgroundColor: withAlpha(fg, "12"), paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 }}
            clickAction="REFRESH_WIDGET"
          >
            <TextWidget text="↻" style={{ fontSize: 16, color: GOLD, fontWeight: "bold" }} />
          </FlexWidget>
        </FlexWidget>

        {/* Right: Goal text + child name + tip */}
        <FlexWidget
          style={{
            flex: 1,
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            flexGap: 4,
          }}
        >
          <TextWidget
            text={goalText}
            style={{
              fontSize: getFontSize(14, appearance.fontSize, appearance.fontScale),
              color: fg,
              fontWeight: "bold",
              textAlign: "center",
            }}
          />
          {content.goalShowChildName && childName ? (
            <TextWidget text={childName} style={{ fontSize: getFontSize(11, appearance.fontSize, appearance.fontScale), color: withAlpha(fg, "70") }} />
          ) : null}
          {tarbiyaTip ? (
            <TextWidget
              text={`✦ ${tarbiyaTip}`}
              style={{ fontSize: getFontSize(10, appearance.fontSize, appearance.fontScale), color: withAlpha(fg, "60"), textAlign: "center" }}
            />
          ) : null}
        </FlexWidget>
      </FlexWidget>
    );
  }

  // === VERTICAL LAYOUT (default) ===
  return (
    <FlexWidget
      style={{
        width: "match_parent",
        height: "match_parent",
        backgroundColor: bg,
        padding: 12,
        flexDirection: "column",
        justifyContent: "space-between",
        borderRadius: radius,
        borderWidth: borderW,
        borderColor: borderC,
      }}
      clickAction="OPEN_APP"
    >
      {/* Top: Hijri date + Next prayer */}
      <FlexWidget
        style={{
          width: "match_parent",
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingBottom: 4,
          borderBottomWidth: 1,
          borderBottomColor: withAlpha(fg, "15"),
        }}
      >
        {hijriDate ? (
          <TextWidget
            text={hijriDate}
            style={{ fontSize: getFontSize(16, appearance.fontSize, appearance.fontScale), color: withAlpha(fg, "70") }}
          />
        ) : (
          <TextWidget text={dayName} style={{ fontSize: getFontSize(16, appearance.fontSize, appearance.fontScale), color: withAlpha(fg, "70") }} />
        )}
        {nextPrayerAr && nextPrayerTime ? (
          <FlexWidget style={{ flexDirection: "row", alignItems: "center", flexGap: 4 }}>
            <TextWidget
              text={nextPrayerTime}
              style={{ fontSize: getFontSize(13, appearance.fontSize, appearance.fontScale), color: GOLD, fontWeight: "bold" }}
            />
            <TextWidget
              text={nextPrayerAr}
              style={{ fontSize: getFontSize(13, appearance.fontSize, appearance.fontScale), color: GOLD, fontWeight: "bold" }}
            />
          </FlexWidget>
        ) : (
          <TextWidget text="" style={{ fontSize: 8 }} />
        )}
      </FlexWidget>

      {/* Header */}
      <FlexWidget
        style={{ width: "match_parent", flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 4 }}
      >
        <TextWidget
          text={category}
          style={{ fontSize: getFontSize(13, appearance.fontSize, appearance.fontScale), color: withAlpha(fg, "80") }}
        />
        <TextWidget
          text={goalLabelLong}
          style={{ fontSize: getFontSize(18, appearance.fontSize, appearance.fontScale), color: GOLD, fontWeight: "bold" }}
        />
      </FlexWidget>

      {/* Goal text - main content */}
      <FlexWidget
        style={{ flex: 1, width: "match_parent", justifyContent: "center", alignItems: "center", paddingVertical: 6 }}
      >
        <TextWidget
          text={goalText}
          style={{
            fontSize: getFontSize(13, appearance.fontSize, appearance.fontScale),
            color: fg,
            fontWeight: "bold",
            textAlign: "center",
          }}
        />
      </FlexWidget>

      {/* Progress + Child name row */}
      <FlexWidget
        style={{ width: "match_parent", flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 2 }}
      >
        {content.goalShowProgress && progressText ? (
          <FlexWidget
            style={{ backgroundColor: withAlpha(GOLD, "15"), paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}
          >
            <TextWidget
              text={progressText}
              style={{ fontSize: getFontSize(16, appearance.fontSize, appearance.fontScale), color: GOLD, fontWeight: "bold" }}
            />
          </FlexWidget>
        ) : (
          <TextWidget text="" style={{ fontSize: 8 }} />
        )}
        {content.goalShowChildName && childName ? (
          <TextWidget
            text={childName}
            style={{ fontSize: getFontSize(13, appearance.fontSize, appearance.fontScale), color: withAlpha(fg, "70") }}
          />
        ) : (
          <TextWidget text="" style={{ fontSize: 8 }} />
        )}
      </FlexWidget>

      {/* Tarbiya tip - fills empty space */}
      {tarbiyaTip ? (
        <FlexWidget
          style={{
            width: "match_parent",
            backgroundColor: withAlpha(fg, "05"),
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 8,
            alignItems: "center",
          }}
        >
          <TextWidget
            text={`✦ ${tarbiyaTip}`}
            style={{ fontSize: getFontSize(16, appearance.fontSize, appearance.fontScale), color: withAlpha(fg, "70"), textAlign: "center" }}
          />
        </FlexWidget>
      ) : null}

      {/* Countdown */}
      {countdown ? (
        <TextWidget
          text={countdown}
          style={{ fontSize: getFontSize(16, appearance.fontSize, appearance.fontScale), color: GOLD, textAlign: "center" }}
        />
      ) : null}

      {/* Tip Navigation: ← نصيحة X/Y → */}
      <FlexWidget
        style={{
          width: "match_parent",
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingTop: 6,
          borderTopWidth: 1,
          borderTopColor: withAlpha(fg, "15"),
        }}
      >
        <FlexWidget style={{ flexDirection: "row", alignItems: "center", flexGap: 6 }}>
          <FlexWidget
            style={{ backgroundColor: withAlpha(fg, "12"), borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 }}
            clickAction="NEXT_TIP"
          >
            <TextWidget text="→" style={{ fontSize: getFontSize(16, appearance.fontSize, appearance.fontScale), color: fg }} />
          </FlexWidget>
          <TextWidget
            text={tipTotal ? `${(tipIndex ?? 0) + 1}/${tipTotal}` : "tip"}
            style={{ fontSize: getFontSize(13, appearance.fontSize, appearance.fontScale), color: withAlpha(fg, "60") }}
          />
          <FlexWidget
            style={{ backgroundColor: withAlpha(GOLD, "20"), borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 }}
            clickAction="PREV_TIP"
          >
            <TextWidget text="←" style={{ fontSize: getFontSize(16, appearance.fontSize, appearance.fontScale), color: GOLD }} />
          </FlexWidget>
        </FlexWidget>

        <FlexWidget
          style={{ backgroundColor: withAlpha(fg, "10"), borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 }}
          clickAction="REFRESH_WIDGET"
        >
          <TextWidget text="↻" style={{ fontSize: getFontSize(18, appearance.fontSize, appearance.fontScale), color: fg }} />
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  );
}
