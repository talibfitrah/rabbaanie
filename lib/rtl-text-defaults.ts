import { Text, I18nManager } from "react-native";

/**
 * Daa3iyah's request: ALL Arabic text must be right-aligned (right-to-left) — it
 * was appearing on the left. Most Text components set no textAlign; force a
 * Text-wide default of textAlign "right" while the app is in RTL (Arabic) so every
 * paragraph starts at the right edge and reads right-to-left.
 *  - A component's own explicit textAlign (e.g. "center") still wins — this is only
 *    a default for text that specifies none.
 *  - writingDirection is left to the app's RTL mode; we only set alignment here to
 *    avoid reordering mixed Latin/number runs.
 * Kept in one module so it is trivial to tune or remove.
 */
if (I18nManager.isRTL) {
  const T = Text as unknown as { defaultProps?: { style?: unknown } };
  T.defaultProps = T.defaultProps || {};
  const existing = T.defaultProps.style;
  T.defaultProps.style = existing
    ? [existing, { textAlign: "right" as const }]
    : { textAlign: "right" as const };
}
