import React from "react";
import { FlexWidget, TextWidget } from "react-native-android-widget";
import type { WidgetAppearanceSettings, WidgetContentSettings, HexColor } from "@/lib/widget-settings";

function withAlpha(color: HexColor, alpha: string): HexColor {
  return `${color}${alpha}` as HexColor;
}

const GOLD = "#C4A35A";

interface HijriWidgetProps {
  hijriDate: string;
  gregorianDate: string;
  dayName: string;
  event?: string;
  tarbiyaTip?: string;
  nextPrayerAr?: string;
  nextPrayerTime?: string;
  countdown?: string;
  appearance: WidgetAppearanceSettings;
  content: WidgetContentSettings;
  widgetWidth?: number;
  widgetHeight?: number;
  lang?: string;
}

/** Font size that scales with the widget's ACTUAL size (matches PrayerWidget). */
function getDynamicFontSize(
  base: number,
  sizeSetting: WidgetAppearanceSettings["fontSize"],
  widgetWidth?: number,
  widgetHeight?: number,
  fontScale?: number
): number {
  const refDimension = 200;
  const minDim = Math.min(widgetWidth || refDimension, widgetHeight || refDimension);
  const scaleFactor = Math.max(0.8, Math.min(2.0, minDim / refDimension));
  let sizeMultiplier = 1.0;
  if (sizeSetting === "medium") sizeMultiplier = 1.15;
  if (sizeSetting === "large") sizeMultiplier = 1.3;
  const percentageScale = (fontScale || 100) / 100;
  return Math.round(base * scaleFactor * sizeMultiplier * percentageScale);
}

export function buildHijriWidgetTree(props: HijriWidgetProps) {
  const { hijriDate, gregorianDate, dayName, event, tarbiyaTip, nextPrayerAr, nextPrayerTime, countdown, appearance, content, widgetWidth, widgetHeight, lang } = props;
  const fs = (base: number) => getDynamicFontSize(base, appearance.fontSize, widgetWidth, widgetHeight, appearance.fontScale);
  const refreshLabel = lang === "nl" ? "Vernieuwen" : lang === "en" ? "Refresh" : "تحديث";
  const bg = appearance.backgroundColor;
  const fg = appearance.textColor;
  const radius = appearance.cornerStyle === "rounded" ? 16 : 4;
  const borderW = appearance.showBorder ? 1 : 0;
  const borderC = appearance.borderColor;

  const isHorizontal = (widgetWidth && widgetHeight) ? widgetWidth > widgetHeight * 1.3 : false;
  const fillerText = event || tarbiyaTip;

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
          justifyContent: "space-between",
          borderRadius: radius,
          borderWidth: borderW,
          borderColor: borderC,
          flexGap: 12,
        }}
        clickAction="OPEN_APP"
      >
        {/* Left: Day name + Hijri date */}
        <FlexWidget
          style={{
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            flexGap: 4,
            paddingHorizontal: 8,
          }}
        >
          <TextWidget
            text={dayName}
            style={{ fontSize: fs(14), color: withAlpha(fg, "80"), fontWeight: "bold" }}
          />
          <TextWidget
            text={hijriDate || "--"}
            style={{ fontSize: fs(16), color: fg, fontWeight: "bold", textAlign: "center" }}
          />
          {content.hijriShowGregorian ? (
            <TextWidget
              text={gregorianDate}
              style={{ fontSize: fs(11), color: withAlpha(fg, "60") }}
            />
          ) : null}
        </FlexWidget>

        {/* Center: Event/Tip */}
        {fillerText ? (
          <FlexWidget
            style={{
              flex: 1,
              backgroundColor: withAlpha(GOLD, "15"),
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 8,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <TextWidget
              text={`✦ ${fillerText}`}
              style={{ fontSize: fs(12), color: GOLD, fontWeight: "bold", textAlign: "center" }}
            />
          </FlexWidget>
        ) : (
          <FlexWidget style={{ flex: 1 }}>
            <TextWidget text="" style={{ fontSize: 8 }} />
          </FlexWidget>
        )}

        {/* Right: Prayer info + refresh */}
        <FlexWidget
          style={{
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            flexGap: 4,
            paddingHorizontal: 8,
            borderLeftWidth: 1,
            borderLeftColor: withAlpha(fg, "15"),
            paddingLeft: 12,
          }}
        >
          {nextPrayerAr && nextPrayerTime ? (
            <FlexWidget style={{ flexDirection: "column", alignItems: "center", flexGap: 2 }}>
              <TextWidget text={nextPrayerAr} style={{ fontSize: fs(12), color: GOLD, fontWeight: "bold" }} />
              <TextWidget text={nextPrayerTime} style={{ fontSize: fs(13), color: GOLD }} />
              {countdown ? (
                <TextWidget text={countdown} style={{ fontSize: fs(10), color: withAlpha(fg, "60") }} />
              ) : null}
            </FlexWidget>
          ) : null}
          <FlexWidget
            style={{ backgroundColor: withAlpha(fg, "12"), paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 }}
            clickAction="REFRESH_WIDGET"
          >
            <TextWidget text="↻" style={{ fontSize: 10, color: GOLD, fontWeight: "bold" }} />
          </FlexWidget>
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
        padding: 14,
        flexDirection: "column",
        justifyContent: "space-between",
        alignItems: "center",
        borderRadius: radius,
        borderWidth: borderW,
        borderColor: borderC,
      }}
      clickAction="OPEN_APP"
    >
      {/* Next prayer info at top */}
      {nextPrayerAr && nextPrayerTime ? (
        <FlexWidget
          style={{
            width: "match_parent",
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            flexGap: 8,
            paddingBottom: 6,
            borderBottomWidth: 1,
            borderBottomColor: withAlpha(fg, "15"),
          }}
        >
          {countdown ? (
            <TextWidget
              text={countdown}
              style={{ fontSize: fs(16), color: withAlpha(fg, "70") }}
            />
          ) : null}
          <TextWidget
            text={`${nextPrayerAr} ${nextPrayerTime}`}
            style={{ fontSize: fs(18), color: GOLD, fontWeight: "bold" }}
          />
        </FlexWidget>
      ) : null}

      {/* Day name */}
      <TextWidget
        text={dayName}
        style={{ fontSize: fs(16), color: withAlpha(fg, "80"), fontWeight: "bold" }}
      />

      {/* Hijri date - main content */}
      <TextWidget
        text={hijriDate || "--"}
        style={{
          fontSize: fs(16),
          color: fg,
          fontWeight: "bold",
          textAlign: "center",
        }}
      />

      {/* Gregorian date below */}
      {content.hijriShowGregorian ? (
        <TextWidget
          text={gregorianDate}
          style={{ fontSize: fs(18), color: withAlpha(fg, "70"), textAlign: "center" }}
        />
      ) : null}

      {/* Islamic event or tarbiya tip to fill space */}
      {fillerText ? (
        <FlexWidget
          style={{
            backgroundColor: withAlpha(GOLD, "15"),
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 8,
          }}
        >
          <TextWidget
            text={`✦ ${fillerText}`}
            style={{ fontSize: fs(13), color: GOLD, fontWeight: "bold", textAlign: "center" }}
          />
        </FlexWidget>
      ) : null}

      {/* Bottom: Navigation arrows + Refresh */}
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
        <FlexWidget
          style={{ backgroundColor: withAlpha(fg, "10"), borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}
          clickAction="REFRESH_WIDGET"
        >
          <TextWidget text="→" style={{ fontSize: fs(16), color: fg }} />
        </FlexWidget>

        <FlexWidget
          style={{ backgroundColor: withAlpha(fg, "08"), borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3, flexDirection: "row", alignItems: "center", flexGap: 4 }}
          clickAction="REFRESH_WIDGET"
        >
          <TextWidget text="↻" style={{ fontSize: fs(15), color: GOLD, fontWeight: "bold" }} />
          <TextWidget text={refreshLabel} style={{ fontSize: fs(16), color: withAlpha(fg, "70") }} />
        </FlexWidget>

        <FlexWidget
          style={{ backgroundColor: withAlpha(GOLD, "20"), borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}
          clickAction="REFRESH_WIDGET"
        >
          <TextWidget text="←" style={{ fontSize: fs(16), color: GOLD }} />
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  );
}
