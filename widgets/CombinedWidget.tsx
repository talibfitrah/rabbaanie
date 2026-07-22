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

function getFontSize(base: number, size: WidgetAppearanceSettings["fontSize"], fontScale?: number): number {
  let result = base;
  if (size === "large") result = base + 6;
  else if (size === "medium") result = base + 4;
  // Apply fontScale percentage (default 100%)
  const scale = (fontScale || 100) / 100;
  return Math.round(result * scale);
}

export function buildCombinedWidgetTree(props: CombinedWidgetProps) {
  const { nextPrayerAr, nextPrayerTime, countdown, dhikrText, dhikrIndex, dhikrTotal, goalText, tipIndex, tipTotal, hijriDate, event, appearance, content, widgetWidth, widgetHeight } = props;
  const bg = appearance.backgroundColor;
  const fg = appearance.textColor;
  const radius = appearance.cornerStyle === "rounded" ? 16 : 4;
  const borderW = appearance.showBorder ? 1 : 0;
  const borderC = appearance.borderColor;
  const sections = content.combinedSections;

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
              style={{ fontSize: getFontSize(14, appearance.fontSize, appearance.fontScale), color: fg, fontWeight: "bold" }}
            />
            <TextWidget
              text={nextPrayerTime}
              style={{ fontSize: getFontSize(15, appearance.fontSize, appearance.fontScale), color: fg, fontWeight: "bold" }}
            />
            {content.prayerShowCountdown && countdown ? (
              <TextWidget
                text={countdown}
                style={{ fontSize: getFontSize(10, appearance.fontSize, appearance.fontScale), color: GOLD, fontWeight: "bold" }}
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
                style={{ fontSize: getFontSize(13, appearance.fontSize, appearance.fontScale), color: fg, textAlign: "center", fontWeight: "bold" }}
              />
            </FlexWidget>
          )}
          {sections.includes("goal") && (
            <TextWidget
              text={goalText}
              style={{ fontSize: getFontSize(12, appearance.fontSize, appearance.fontScale), color: withAlpha(fg, "CC"), textAlign: "center" }}
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
              style={{ fontSize: getFontSize(12, appearance.fontSize, appearance.fontScale), color: fg, fontWeight: "bold", textAlign: "center" }}
            />
          )}
          {content.hijriShowEvent && event ? (
            <TextWidget
              text={`✦ ${event}`}
              style={{ fontSize: getFontSize(10, appearance.fontSize, appearance.fontScale), color: GOLD, textAlign: "center" }}
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
              style={{ fontSize: getFontSize(13, appearance.fontSize, appearance.fontScale), color: GOLD, fontWeight: "bold" }}
            />
          ) : (
            <TextWidget text="" style={{ fontSize: 9 }} />
          )}
          <FlexWidget style={{ flexDirection: "row", alignItems: "center", flexGap: 6 }}>
            <TextWidget
              text={nextPrayerTime}
              style={{ fontSize: getFontSize(16, appearance.fontSize, appearance.fontScale), color: fg, fontWeight: "bold" }}
            />
            <TextWidget
              text={nextPrayerAr}
              style={{ fontSize: getFontSize(16, appearance.fontSize, appearance.fontScale), color: fg, fontWeight: "bold" }}
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
              style={{ fontSize: getFontSize(13, appearance.fontSize, appearance.fontScale), color: GOLD, fontWeight: "bold" }}
            />
          ) : null}
          <TextWidget
            text={hijriDate}
            style={{ fontSize: getFontSize(15, appearance.fontSize, appearance.fontScale), color: fg, fontWeight: "bold" }}
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
            style={{ fontSize: getFontSize(15, appearance.fontSize, appearance.fontScale), color: fg, textAlign: "center", fontWeight: "bold" }}
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
            style={{ fontSize: getFontSize(18, appearance.fontSize, appearance.fontScale), color: withAlpha(fg, "CC"), textAlign: "center" }}
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
