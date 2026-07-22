import React from "react";
import { FlexWidget, TextWidget } from "react-native-android-widget";
import type { WidgetAppearanceSettings, WidgetContentSettings, HexColor } from "@/lib/widget-settings";

function withAlpha(color: HexColor, alpha: string): HexColor {
  return `${color}${alpha}` as HexColor;
}

const GOLD = "#C4A35A";

interface DhikrWidgetProps {
  dhikrText: string;
  source: string;
  reward?: string;
  tarbiyaTip?: string;
  contextLabel?: string;
  dhikrIndex?: number;
  dhikrTotal?: number;
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
}

function getFontSize(base: number, size: WidgetAppearanceSettings["fontSize"], fontScale?: number): number {
  let result = base;
  if (size === "large") result = base + 6;
  else if (size === "medium") result = base + 4;
  const scale = (fontScale || 100) / 100;
  return Math.round(result * scale);
}

export function buildDhikrWidgetTree(props: DhikrWidgetProps) {
  const { dhikrText, source, reward, tarbiyaTip, contextLabel, dhikrIndex, dhikrTotal, tipIndex, tipTotal, nextPrayerAr, nextPrayerTime, countdown, hijriDate, appearance, content, widgetWidth, widgetHeight } = props;
  const bg = appearance.backgroundColor;
  const fg = appearance.textColor;
  const radius = appearance.cornerStyle === "rounded" ? 16 : 4;
  const borderW = appearance.showBorder ? 2 : 0;
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
        {/* Left: Prayer info + context */}
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
            text={contextLabel || "أذكار 📿"}
            style={{ fontSize: getFontSize(13, appearance.fontSize, appearance.fontScale), color: GOLD, fontWeight: "bold" }}
          />
          {nextPrayerAr && nextPrayerTime ? (
            <FlexWidget style={{ flexDirection: "column", alignItems: "center", flexGap: 2 }}>
              <TextWidget text={nextPrayerAr} style={{ fontSize: getFontSize(11, appearance.fontSize, appearance.fontScale), color: GOLD, fontWeight: "bold" }} />
              <TextWidget text={nextPrayerTime} style={{ fontSize: getFontSize(12, appearance.fontSize, appearance.fontScale), color: GOLD }} />
            </FlexWidget>
          ) : null}
          <FlexWidget
            style={{ backgroundColor: withAlpha(fg, "12"), paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 }}
            clickAction="REFRESH_DHIKR"
          >
            <TextWidget text="↻" style={{ fontSize: 16, color: GOLD, fontWeight: "bold" }} />
          </FlexWidget>
        </FlexWidget>

        {/* Right: Dhikr text + source/reward */}
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
            text={dhikrText}
            style={{
              fontSize: getFontSize(15, appearance.fontSize, appearance.fontScale),
              color: fg,
              fontWeight: "bold",
              textAlign: "center",
            }}
          />
          {content.dhikrShowVirtue && reward ? (
            <TextWidget
              text={reward}
              style={{ fontSize: getFontSize(11, appearance.fontSize, appearance.fontScale), color: GOLD, textAlign: "center" }}
            />
          ) : !reward && tarbiyaTip ? (
            <TextWidget
              text={`✦ ${tarbiyaTip}`}
              style={{ fontSize: getFontSize(11, appearance.fontSize, appearance.fontScale), color: withAlpha(fg, "60"), textAlign: "center" }}
            />
          ) : null}
          {content.dhikrShowSource ? (
            <TextWidget
              text={`[${source}]`}
              style={{ fontSize: getFontSize(10, appearance.fontSize, appearance.fontScale), color: withAlpha(fg, "70"), textAlign: "center" }}
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
        alignItems: "center",
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
          <TextWidget text="" style={{ fontSize: 8 }} />
        )}
        {nextPrayerAr && nextPrayerTime ? (
          <FlexWidget style={{ flexDirection: "row", alignItems: "center", flexGap: 4 }}>
            <TextWidget
              text={nextPrayerTime}
              style={{ fontSize: getFontSize(13, appearance.fontSize, appearance.fontScale), color: GOLD, fontWeight: "bold" }}
            />
            <TextWidget
              text={countdown ? `${nextPrayerAr} (${countdown})` : nextPrayerAr}
              style={{ fontSize: getFontSize(13, appearance.fontSize, appearance.fontScale), color: GOLD, fontWeight: "bold" }}
            />
          </FlexWidget>
        ) : (
          <TextWidget text="" style={{ fontSize: 8 }} />
        )}
      </FlexWidget>

      {/* Context label */}
      <TextWidget
        text={contextLabel || "أذكار 📿"}
        style={{ fontSize: getFontSize(18, appearance.fontSize, appearance.fontScale), color: GOLD, fontWeight: "bold" }}
      />

      {/* Dhikr text - main content */}
      <FlexWidget
        style={{
          flex: 1,
          width: "match_parent",
          justifyContent: "center",
          alignItems: "center",
          paddingVertical: 6,
        }}
      >
        <TextWidget
          text={dhikrText}
          style={{
            fontSize: getFontSize(18, appearance.fontSize, appearance.fontScale),
            color: fg,
            fontWeight: "bold",
            textAlign: "center",
          }}
        />
      </FlexWidget>

      {/* Reward/Tip + Source */}
      <FlexWidget
        style={{ width: "match_parent", alignItems: "center", flexGap: 2, paddingTop: 2 }}
      >
        {content.dhikrShowVirtue && reward ? (
          <TextWidget
            text={reward}
            style={{ fontSize: getFontSize(13, appearance.fontSize, appearance.fontScale), color: GOLD, textAlign: "center" }}
          />
        ) : !reward && tarbiyaTip ? (
          <TextWidget
            text={`✦ ${tarbiyaTip}`}
            style={{ fontSize: getFontSize(13, appearance.fontSize, appearance.fontScale), color: withAlpha(fg, "60"), textAlign: "center" }}
          />
        ) : null}
        {content.dhikrShowSource ? (
          <TextWidget
            text={`[${source}]`}
            style={{ fontSize: getFontSize(16, appearance.fontSize, appearance.fontScale), color: withAlpha(fg, "70"), textAlign: "center" }}
          />
        ) : null}
      </FlexWidget>

      {/* Dhikr Navigation: ← ذكر X/Y → */}
      {/* Navigation row: dhikr + refresh + tip */}
      <FlexWidget
        style={{
          width: "match_parent",
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingTop: 6,
        }}
      >
        {/* Dhikr nav */}
        <FlexWidget style={{ flexDirection: "row", alignItems: "center", flexGap: 6 }}>
          <FlexWidget
            style={{ backgroundColor: withAlpha(fg, "12"), borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 }}
            clickAction="NEXT_DHIKR"
          >
            <TextWidget text="→" style={{ fontSize: getFontSize(16, appearance.fontSize, appearance.fontScale), color: fg }} />
          </FlexWidget>
          <TextWidget
            text={dhikrTotal ? `${(dhikrIndex ?? 0) + 1}/${dhikrTotal}` : "dhikr"}
            style={{ fontSize: getFontSize(13, appearance.fontSize, appearance.fontScale), color: withAlpha(fg, "60") }}
          />
          <FlexWidget
            style={{ backgroundColor: withAlpha(GOLD, "20"), borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 }}
            clickAction="PREV_DHIKR"
          >
            <TextWidget text="←" style={{ fontSize: getFontSize(16, appearance.fontSize, appearance.fontScale), color: GOLD }} />
          </FlexWidget>
        </FlexWidget>

        {/* Refresh */}
        <FlexWidget
          style={{ backgroundColor: withAlpha(fg, "10"), borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 }}
          clickAction="REFRESH_DHIKR"
        >
          <TextWidget text="↻" style={{ fontSize: getFontSize(18, appearance.fontSize, appearance.fontScale), color: fg }} />
        </FlexWidget>

        {/* Tip nav */}
        {tarbiyaTip ? (
          <FlexWidget style={{ flexDirection: "row", alignItems: "center", flexGap: 6 }}>
            <FlexWidget
              style={{ backgroundColor: withAlpha(fg, "10"), borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 }}
              clickAction="NEXT_TIP"
            >
              <TextWidget text="→" style={{ fontSize: getFontSize(16, appearance.fontSize, appearance.fontScale), color: withAlpha(fg, "70") }} />
            </FlexWidget>
            <TextWidget
              text={tipTotal ? `${(tipIndex ?? 0) + 1}/${tipTotal}` : "tip"}
              style={{ fontSize: getFontSize(13, appearance.fontSize, appearance.fontScale), color: withAlpha(fg, "50") }}
            />
            <FlexWidget
              style={{ backgroundColor: withAlpha(fg, "10"), borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 }}
              clickAction="PREV_TIP"
            >
              <TextWidget text="←" style={{ fontSize: getFontSize(16, appearance.fontSize, appearance.fontScale), color: withAlpha(fg, "70") }} />
            </FlexWidget>
          </FlexWidget>
        ) : null}
      </FlexWidget>
    </FlexWidget>
  );
}
