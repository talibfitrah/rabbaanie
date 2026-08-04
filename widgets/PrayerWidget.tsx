import React from "react";
import { FlexWidget, TextWidget } from "react-native-android-widget";
import type { WidgetAppearanceSettings, WidgetContentSettings } from "@/lib/widget-settings";
import type { HexColor } from "@/lib/widget-settings";

/** Create a hex color with alpha suffix */
function withAlpha(color: HexColor, alpha: string): HexColor {
  return `${color}${alpha}` as HexColor;
}

interface PrayerTime {
  name: string;
  nameAr: string;
  time: string;
  isNext: boolean;
}

interface PrayerWidgetProps {
  prayers: PrayerTime[];
  sunrise: string;
  nextPrayer: string;
  nextPrayerAr: string;
  nextPrayerTime: string;
  countdown: string;
  hijriDate: string;
  city: string;
  appearance: WidgetAppearanceSettings;
  content: WidgetContentSettings;
  widgetWidth?: number;
  widgetHeight?: number;
  lang?: string;
}

function getWidgetLabel(lang: string | undefined, nl: string, en: string, ar: string): string {
  if (lang === "nl") return nl;
  if (lang === "en") return en;
  return ar;
}

const GOLD = "#C4A35A";

/**
 * Dynamic font size based on widget dimensions.
 * Uses a scale factor derived from widget size, with the fontSize setting as a multiplier.
 * Additionally applies fontScale percentage (80-150) for fine-grained control.
 * Base reference: 200px (typical 2x2 widget smallest dimension).
 */
function getDynamicFontSize(
  base: number,
  sizeSetting: WidgetAppearanceSettings["fontSize"],
  widgetWidth?: number,
  widgetHeight?: number,
  fontScale?: number
): number {
  // Calculate scale factor from widget dimensions
  const refDimension = 200; // reference dimension for a 2x2 widget
  const minDim = Math.min(widgetWidth || refDimension, widgetHeight || refDimension);
  const scaleFactor = Math.max(0.85, Math.min(1.4, minDim / refDimension));

  // Apply size setting multiplier
  let sizeMultiplier = 1.0; // "medium" (the default) is neutral so text isn't inflated
  if (sizeSetting === "small") sizeMultiplier = 0.9;
  if (sizeSetting === "large") sizeMultiplier = 1.15;

  // Apply fontScale percentage (default 100%)
  const percentageScale = (fontScale || 100) / 100;

  return Math.round(base * scaleFactor * sizeMultiplier * percentageScale);
}

export function buildPrayerWidgetTree(props: PrayerWidgetProps) {
  const { prayers, sunrise, nextPrayerAr, nextPrayerTime, countdown, hijriDate, city, appearance, content, widgetWidth, widgetHeight, lang } = props;
  const nextPrayerLabel = getWidgetLabel(lang, "Volgende gebed", "Next prayer", "الصلاة القادمة");
  const sunriseLabel = getWidgetLabel(lang, "Shuroeq", "Sunrise", "الشروق");
  const refreshLabel = getWidgetLabel(lang, "Vernieuwen", "Refresh", "تحديث");
  const bg = appearance.backgroundColor;
  const fg = appearance.textColor;
  const radius = appearance.cornerStyle === "rounded" ? 16 : 4;
  const borderW = appearance.showBorder ? 1 : 0;
  const borderC = appearance.borderColor;

  // Helper: dynamic font size using widget dimensions + fontScale percentage
  const fs = (base: number) => getDynamicFontSize(base, appearance.fontSize, widgetWidth, widgetHeight, appearance.fontScale);

  // Dynamic padding based on widget size
  const minDim = Math.min(widgetWidth || 200, widgetHeight || 200);
  const dynamicPadding = Math.max(6, Math.round(minDim * 0.04));

  // Determine orientation: horizontal if width > height
  const isHorizontal = (widgetWidth && widgetHeight) ? widgetWidth > widgetHeight * 1.3 : false;

  if (!content.prayerShowAll) {
    // Small widget: next prayer only
    return (
      <FlexWidget
        style={{
          width: "match_parent",
          height: "match_parent",
          backgroundColor: bg,
          padding: dynamicPadding,
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          borderRadius: radius,
          borderWidth: borderW,
          borderColor: borderC,
          flexGap: 4,
        }}
      >
        {/* Top: Refresh button */}
        <FlexWidget
          style={{
            backgroundColor: withAlpha(fg, "12"),
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: 8,
          }}
          clickAction="REFRESH_WIDGET"
        >
          <TextWidget
            text="↻"
            style={{ fontSize: fs(11), color: GOLD, fontWeight: "bold" }}
          />
        </FlexWidget>
        <TextWidget
          text={nextPrayerLabel}
          style={{ fontSize: fs(12), color: GOLD, fontWeight: "bold" }}
        />
        <TextWidget
          text={nextPrayerAr}
          style={{ fontSize: fs(18), color: fg, fontWeight: "bold" }}
        />
        <TextWidget
          text={nextPrayerTime}
          style={{ fontSize: fs(16), color: fg }}
        />
        {content.prayerShowCountdown && countdown ? (
          <TextWidget
            text={countdown}
            style={{ fontSize: fs(12), color: GOLD }}
          />
        ) : null}
        {/* Bottom: Navigation arrows */}
        <FlexWidget
          style={{
            width: "match_parent",
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            paddingTop: 4,
            flexGap: 12,
          }}
        >
          <FlexWidget
            style={{ backgroundColor: withAlpha(fg, "08"), borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}
            clickAction="TOGGLE_PRAYER_VIEW"
          >
            <TextWidget text="→" style={{ fontSize: fs(13), color: GOLD, fontWeight: "bold" }} />
          </FlexWidget>
          <FlexWidget
            style={{ backgroundColor: withAlpha(fg, "08"), borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}
            clickAction="TOGGLE_PRAYER_VIEW"
          >
            <TextWidget text="←" style={{ fontSize: fs(13), color: GOLD, fontWeight: "bold" }} />
          </FlexWidget>
        </FlexWidget>
      </FlexWidget>
    );
  }

  // === HORIZONTAL LAYOUT: all prayers in a row ===
  if (isHorizontal) {
    return (
      <FlexWidget
        style={{
          width: "match_parent",
          height: "match_parent",
          backgroundColor: bg,
          padding: dynamicPadding,
          flexDirection: "column",
          borderRadius: radius,
          borderWidth: borderW,
          borderColor: borderC,
          flexGap: 4,
        }}
      >
        {/* Top row: hijri + next prayer + city + refresh */}
        <FlexWidget
          style={{
            width: "match_parent",
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingBottom: 4,
            borderBottomWidth: 1,
            borderBottomColor: borderC || "#E5E7EB",
          }}
        >
          <FlexWidget
            style={{ backgroundColor: withAlpha(fg, "12"), paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, flexDirection: "row", alignItems: "center", flexGap: 3 }}
            clickAction="REFRESH_WIDGET"
          >
            <TextWidget text="↻" style={{ fontSize: fs(10), color: GOLD, fontWeight: "bold" }} />
          </FlexWidget>
          <TextWidget
            text={city}
            style={{ fontSize: fs(10), color: withAlpha(fg, "70") }}
          />
          <TextWidget
            text={hijriDate}
            style={{ fontSize: fs(11), color: fg, fontWeight: "bold" }}
          />
          {content.prayerShowCountdown && countdown ? (
            <FlexWidget style={{ flexDirection: "row", alignItems: "center", flexGap: 4 }}>
              <TextWidget text={countdown} style={{ fontSize: fs(10), color: GOLD, fontWeight: "bold" }} />
              <TextWidget text={`${nextPrayerAr}`} style={{ fontSize: fs(11), color: GOLD, fontWeight: "bold" }} />
            </FlexWidget>
          ) : (
            <TextWidget text={`${nextPrayerAr} ${nextPrayerTime}`} style={{ fontSize: fs(11), color: GOLD, fontWeight: "bold" }} />
          )}
        </FlexWidget>

        {/* All prayers in a horizontal row */}
        <FlexWidget
          style={{
            width: "match_parent",
            flex: 1,
            flexDirection: "row",
            justifyContent: "space-evenly",
            alignItems: "center",
          }}
        >
          {prayers.flatMap((prayer, i) => [
            <FlexWidget
              key={`prayer-h-${i}`}
              style={{
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: prayer.isNext ? withAlpha(fg, "10") : ("#00000000" as HexColor),
                borderRadius: 8,
                paddingHorizontal: 8,
                paddingVertical: 4,
                flexGap: 2,
              }}
            >
              <TextWidget
                text={prayer.nameAr}
                style={{
                  fontSize: fs(12),
                  color: prayer.isNext ? fg : withAlpha(fg, "CC"),
                  fontWeight: prayer.isNext ? "bold" : "normal",
                }}
              />
              <TextWidget
                text={prayer.time}
                style={{
                  fontSize: fs(13),
                  color: prayer.isNext ? fg : withAlpha(fg, "CC"),
                  fontWeight: prayer.isNext ? "bold" : "normal",
                }}
              />
            </FlexWidget>,
            ...(i === 0 && content.prayerShowSunrise ? [
              <FlexWidget
                key="sunrise-h"
                style={{
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  paddingHorizontal: 6,
                  paddingVertical: 4,
                  flexGap: 2,
                }}
              >
                <TextWidget text={sunriseLabel} style={{ fontSize: fs(11), color: GOLD }} />
                <TextWidget text={sunrise} style={{ fontSize: fs(12), color: GOLD }} />
              </FlexWidget>
            ] : []),
          ])}
        </FlexWidget>

        {/* Bottom: Navigation arrows + Refresh */}
        <FlexWidget
          style={{
            width: "match_parent",
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            paddingTop: 2,
            flexGap: 12,
          }}
        >
          <FlexWidget
            style={{ backgroundColor: withAlpha(fg, "08"), borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}
            clickAction="TOGGLE_PRAYER_VIEW"
          >
            <TextWidget text="→" style={{ fontSize: fs(12), color: GOLD, fontWeight: "bold" }} />
          </FlexWidget>
          <FlexWidget
            style={{ backgroundColor: withAlpha(fg, "08"), borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}
            clickAction="TOGGLE_PRAYER_VIEW"
          >
            <TextWidget text="←" style={{ fontSize: fs(12), color: GOLD, fontWeight: "bold" }} />
          </FlexWidget>
        </FlexWidget>
      </FlexWidget>
    );
  }

  // === VERTICAL LAYOUT (default): prayers listed vertically ===
  // Header is now VERTICAL (stacked) - each info on its own line, centered
  // Space is distributed evenly between header, prayer list, and bottom nav
  return (
    <FlexWidget
      style={{
        width: "match_parent",
        height: "match_parent",
        backgroundColor: bg,
        padding: dynamicPadding,
        flexDirection: "column",
        justifyContent: "space-between",
        borderRadius: radius,
        borderWidth: borderW,
        borderColor: borderC,
      }}
    >
      {/* Header: VERTICAL layout - each item on its own line, centered */}
      <FlexWidget
        style={{
          width: "match_parent",
          flexDirection: "column",
          alignItems: "center",
          paddingBottom: 4,
          borderBottomWidth: 1,
          borderBottomColor: borderC || "#E5E7EB",
          flexGap: 1,
        }}
      >
        {/* Line 1: Hijri date */}
        <TextWidget
          text={hijriDate}
          style={{ fontSize: fs(11), color: fg, fontWeight: "bold" }}
        />
        {/* Line 2: City */}
        <TextWidget
          text={city}
          style={{ fontSize: fs(10), color: withAlpha(fg, "70") }}
        />
        {/* Line 3: Next prayer name + time */}
        <TextWidget
          text={`${nextPrayerLabel}: ${nextPrayerAr} ${nextPrayerTime}`}
          style={{ fontSize: fs(12), color: GOLD, fontWeight: "bold" }}
        />
        {/* Line 4: Countdown (if enabled) */}
        {content.prayerShowCountdown && countdown ? (
          <TextWidget
            text={countdown}
            style={{ fontSize: fs(11), color: GOLD }}
          />
        ) : null}
      </FlexWidget>

      {/* Prayer times list - takes remaining space with flex:1 */}
      <FlexWidget
        style={{
          width: "match_parent",
          flex: 1,
          flexDirection: "column",
          justifyContent: "space-evenly",
          paddingVertical: 2,
        }}
      >
        {prayers.flatMap((prayer, i) => [
          <FlexWidget
            key={`prayer-${i}`}
            style={{
              width: "match_parent",
              flex: 1,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingVertical: 3,
              paddingHorizontal: 6,
              backgroundColor: prayer.isNext ? withAlpha(fg, "10") : ("#00000000" as HexColor),
              borderRadius: 6,
            }}
          >
            <TextWidget
              text={prayer.time}
              maxLines={1}
              style={{
                fontSize: fs(17),
                color: prayer.isNext ? fg : withAlpha(fg, "CC"),
                fontWeight: prayer.isNext ? "bold" : "normal",
                adjustsFontSizeToFit: true,
              }}
            />
            <TextWidget
              text={prayer.nameAr}
              maxLines={1}
              style={{
                fontSize: fs(17),
                color: prayer.isNext ? fg : withAlpha(fg, "CC"),
                fontWeight: prayer.isNext ? "bold" : "normal",
                adjustsFontSizeToFit: true,
              }}
            />
          </FlexWidget>,
          ...(i === 0 && content.prayerShowSunrise ? [
            <FlexWidget
              key="sunrise-v"
              style={{
                width: "match_parent",
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                paddingVertical: 2,
                paddingHorizontal: 6,
              }}
            >
              <TextWidget
                text={sunrise}
                style={{ fontSize: fs(12), color: GOLD }}
              />
              <TextWidget
                text={sunriseLabel}
                style={{ fontSize: fs(12), color: GOLD }}
              />
            </FlexWidget>
          ] : []),
        ])}
      </FlexWidget>

      {/* Bottom: Navigation arrows + Refresh button */}
      <FlexWidget
        style={{
          width: "match_parent",
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingTop: 4,
          borderTopWidth: 1,
          borderTopColor: borderC || "#E5E7EB",
        }}
      >
        {/* Right arrow (→) - toggle prayer view */}
        <FlexWidget
          style={{ backgroundColor: withAlpha(fg, "08"), borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}
          clickAction="TOGGLE_PRAYER_VIEW"
        >
          <TextWidget text="→" style={{ fontSize: fs(12), color: GOLD, fontWeight: "bold" }} />
        </FlexWidget>

        {/* Refresh button */}
        <FlexWidget
          style={{ backgroundColor: withAlpha(fg, "08"), borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3, flexDirection: "row", alignItems: "center", flexGap: 3 }}
          clickAction="REFRESH_WIDGET"
        >
          <TextWidget text="↻" style={{ fontSize: fs(11), color: GOLD, fontWeight: "bold" }} />
          <TextWidget text={refreshLabel} style={{ fontSize: fs(10), color: withAlpha(fg, "70") }} />
        </FlexWidget>

        {/* Left arrow (←) - toggle prayer view */}
        <FlexWidget
          style={{ backgroundColor: withAlpha(fg, "08"), borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}
          clickAction="TOGGLE_PRAYER_VIEW"
        >
          <TextWidget text="←" style={{ fontSize: fs(12), color: GOLD, fontWeight: "bold" }} />
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  );
}
