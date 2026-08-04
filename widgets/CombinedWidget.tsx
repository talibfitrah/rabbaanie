import React from "react";
import { FlexWidget, TextWidget } from "react-native-android-widget";
import type { WidgetAppearanceSettings, WidgetContentSettings, HexColor } from "@/lib/widget-settings";

function withAlpha(color: HexColor, alpha: string): HexColor {
  return `${color}${alpha}` as HexColor;
}

const GOLD = "#C4A35A";

interface CombinedWidgetProps {
  nextPrayerAr: string;
  nextPrayerTime: string;
  countdown: string;
  dhikrText: string;
  dhikrIndex?: number;
  dhikrTotal?: number;
  goalText: string;
  tipIndex?: number;
  tipTotal?: number;
  hijriDate: string;
  event?: string;
  appearance: WidgetAppearanceSettings;
  content: WidgetContentSettings;
  widgetWidth?: number;
  widgetHeight?: number;
}

/**
 * Font size that scales with the widget's ACTUAL size, so enlarging the widget
 * enlarges the text (this is what PrayerWidget already does). Base reference is
 * a 200px 2x2 widget; the fontSize setting and fontScale% are extra multipliers.
 */
function getDynamicFontSize(
  base: number,
  sizeSetting: WidgetAppearanceSettings["fontSize"],
  widgetWidth?: number,
  widgetHeight?: number,
  fontScale?: number
): number {
  const refDimension = 200;
  const minDim = Math.min(widgetWidth || refDimension, widgetHeight || refDimension);
  const scaleFactor = Math.max(0.85, Math.min(1.4, minDim / refDimension));
  let sizeMultiplier = 1.0; // "medium" (the default) is neutral so text isn't inflated
  if (sizeSetting === "small") sizeMultiplier = 0.9;
  if (sizeSetting === "large") sizeMultiplier = 1.15;
  const percentageScale = (fontScale || 100) / 100;
  return Math.round(base * scaleFactor * sizeMultiplier * percentageScale);
}

export function buildCombinedWidgetTree(props: CombinedWidgetProps) {
  const { nextPrayerAr, nextPrayerTime, countdown, dhikrText, dhikrIndex, dhikrTotal, goalText, tipIndex, tipTotal, hijriDate, event, appearance, content, widgetWidth, widgetHeight } = props;
  const bg = appearance.backgroundColor;
  const fg = appearance.textColor;
  const radius = appearance.cornerStyle === "rounded" ? 16 : 4;
  const borderW = appearance.showBorder ? 1 : 0;
  const borderC = appearance.borderColor;
  const sections = content.combinedSections;
  // Font scales with the widget's actual dimensions (bigger widget → bigger text).
  const fs = (base: number) => getDynamicFontSize(base, appearance.fontSize, widgetWidth, widgetHeight, appearance.fontScale);

  const isHorizontal = (widgetWidth && widgetHeight) ? widgetWidth > widgetHeight * 1.3 : false;

  if (isHorizontal) {
    // === HORIZONTAL LAYOUT: sections side by side ===
    return (
      <FlexWidget
        style={{
          width: "match_parent",
          height: "match_parent",
          backgroundColor: bg,
          padding: 10,
          flexDirection: "row",
          borderRadius: radius,
          borderWidth: borderW,
          borderColor: borderC,
          flexGap: 8,
        }}
      >
        {/* Prayer section - left */}
        {sections.includes("prayer") && (
          <FlexWidget
            style={{
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: withAlpha(fg, "08"),
              padding: 8,
              borderRadius: 10,
              flexGap: 3,
            }}
          >
            <TextWidget
              text={nextPrayerAr}
              style={{ fontSize: fs(14), color: fg, fontWeight: "bold" }}
            />
            <TextWidget
              text={nextPrayerTime}
              style={{ fontSize: fs(15), color: fg, fontWeight: "bold" }}
            />
            {content.prayerShowCountdown && countdown ? (
              <TextWidget
                text={countdown}
                style={{ fontSize: fs(10), color: GOLD, fontWeight: "bold" }}
              />
            ) : null}
          </FlexWidget>
        )}

        {/* Center: Dhikr + Goal */}
        <FlexWidget
          style={{
            flex: 1,
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            flexGap: 6,
          }}
        >
          {sections.includes("dhikr") && (
            <FlexWidget
              style={{
                width: "match_parent",
                backgroundColor: withAlpha(fg, "06"),
                padding: 6,
                borderRadius: 8,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <TextWidget
                text={dhikrText}
                style={{ fontSize: fs(13), color: fg, textAlign: "center", fontWeight: "bold" }}
              />
            </FlexWidget>
          )}
          {sections.includes("goal") && (
            <TextWidget
              text={goalText}
              style={{ fontSize: fs(12), color: withAlpha(fg, "CC"), textAlign: "center" }}
            />
          )}
        </FlexWidget>

        {/* Right: Hijri + event + refresh */}
        <FlexWidget
          style={{
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            flexGap: 4,
            paddingHorizontal: 6,
            borderLeftWidth: 1,
            borderLeftColor: withAlpha(fg, "10"),
            paddingLeft: 8,
          }}
        >
          {sections.includes("hijri") && (
            <TextWidget
              text={hijriDate}
              style={{ fontSize: fs(12), color: fg, fontWeight: "bold", textAlign: "center" }}
            />
          )}
          {content.hijriShowEvent && event ? (
            <TextWidget
              text={`✦ ${event}`}
              style={{ fontSize: fs(10), color: GOLD, textAlign: "center" }}
            />
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
        padding: 10,
        flexDirection: "column",
        borderRadius: radius,
        borderWidth: borderW,
        borderColor: borderC,
        flexGap: 5,
      }}
    >
      {/* Prayer section */}
      {sections.includes("prayer") && (
        <FlexWidget
          style={{
            width: "match_parent",
            backgroundColor: withAlpha(fg, "12"),
            padding: 10,
            borderRadius: 10,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
          clickAction="OPEN_APP"
        >
          {content.prayerShowCountdown && countdown ? (
            <TextWidget
              text={countdown}
              style={{ fontSize: fs(13), color: GOLD, fontWeight: "bold" }}
            />
          ) : (
            <TextWidget text="" style={{ fontSize: 9 }} />
          )}
          <FlexWidget style={{ flexDirection: "row", alignItems: "center", flexGap: 6 }}>
            <TextWidget
              text={nextPrayerTime}
              style={{ fontSize: fs(16), color: fg, fontWeight: "bold" }}
            />
            <TextWidget
              text={nextPrayerAr}
              style={{ fontSize: fs(16), color: fg, fontWeight: "bold" }}
            />
          </FlexWidget>
        </FlexWidget>
      )}

      {/* Hijri section */}
      {sections.includes("hijri") && (
        <FlexWidget
          style={{
            width: "match_parent",
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            flexGap: 6,
          }}
        >
          {content.hijriShowEvent && event ? (
            <TextWidget
              text={`✦ ${event}`}
              style={{ fontSize: fs(13), color: GOLD, fontWeight: "bold" }}
            />
          ) : null}
          <TextWidget
            text={hijriDate}
            style={{ fontSize: fs(15), color: fg, fontWeight: "bold" }}
          />
        </FlexWidget>
      )}

      {/* Dhikr section */}
      {sections.includes("dhikr") && (
        <FlexWidget
          style={{
            width: "match_parent",
            backgroundColor: withAlpha(fg, "06"),
            padding: 8,
            borderRadius: 8,
            alignItems: "center",
            flex: 1,
            justifyContent: "center",
          }}
          clickAction="OPEN_APP"
        >
          <TextWidget
            text={dhikrText}
            maxLines={10}
            style={{ fontSize: fs(15), color: fg, textAlign: "center", fontWeight: "bold", adjustsFontSizeToFit: true }}
          />
        </FlexWidget>
      )}

      {/* Goal section */}
      {sections.includes("goal") && (
        <FlexWidget
          style={{
            width: "match_parent",
            borderTopWidth: 1,
            borderTopColor: borderC || "#E5E7EB",
            paddingTop: 5,
            alignItems: "center",
          }}
        >
          <TextWidget
            text={goalText}
            maxLines={4}
            style={{ fontSize: fs(18), color: withAlpha(fg, "CC"), textAlign: "center", adjustsFontSizeToFit: true }}
          />
        </FlexWidget>
      )}

      {/* Bottom: Dhikr nav + Tip nav (independent) */}
      <FlexWidget
        style={{
          width: "match_parent",
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingTop: 6,
          borderTopWidth: 1,
          borderTopColor: withAlpha(fg, "10"),
        }}
      >
        {/* Dhikr navigation */}
        <FlexWidget style={{ flexDirection: "row", alignItems: "center", flexGap: 6 }}>
          <FlexWidget
            style={{ backgroundColor: withAlpha(fg, "12"), borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 }}
            clickAction="NEXT_DHIKR"
          >
            <TextWidget text="→" style={{ fontSize: 16, color: fg }} />
          </FlexWidget>
          <TextWidget
            text={dhikrTotal ? `${(dhikrIndex ?? 0) + 1}/${dhikrTotal}` : "dhikr"}
            style={{ fontSize: 13, color: withAlpha(fg, "60") }}
          />
          <FlexWidget
            style={{ backgroundColor: withAlpha(GOLD, "18"), borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 }}
            clickAction="PREV_DHIKR"
          >
            <TextWidget text="←" style={{ fontSize: 16, color: GOLD }} />
          </FlexWidget>
        </FlexWidget>

        {/* Refresh button */}
        <FlexWidget
          style={{ backgroundColor: withAlpha(fg, "10"), borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 }}
          clickAction="REFRESH_WIDGET"
        >
          <TextWidget text="↻" style={{ fontSize: 18, color: fg }} />
        </FlexWidget>

        {/* Tip navigation */}
        <FlexWidget style={{ flexDirection: "row", alignItems: "center", flexGap: 6 }}>
          <FlexWidget
            style={{ backgroundColor: withAlpha(fg, "10"), borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 }}
            clickAction="NEXT_TIP"
          >
            <TextWidget text="→" style={{ fontSize: 16, color: withAlpha(fg, "70") }} />
          </FlexWidget>
          <TextWidget
            text={tipTotal ? `${(tipIndex ?? 0) + 1}/${tipTotal}` : "tip"}
            style={{ fontSize: 13, color: withAlpha(fg, "50") }}
          />
          <FlexWidget
            style={{ backgroundColor: withAlpha(fg, "10"), borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 }}
            clickAction="PREV_TIP"
          >
            <TextWidget text="←" style={{ fontSize: 16, color: withAlpha(fg, "70") }} />
          </FlexWidget>
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  );
}
