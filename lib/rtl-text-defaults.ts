import { Text, I18nManager } from "react-native";

/**
 * Daa3iyah's request: ALL Arabic body text should be justified so each line fills
 * flush from the right edge to the left edge (like printed books/mushaf), instead
 * of right-aligned with a ragged left edge.
 *
 * Most Text components set no textAlign, so in RTL mode React Native defaults them
 * to "right". Rather than touch hundreds of call sites, set a Text-wide default of
 * textAlign "justify" while the app is in RTL (Arabic). Notes:
 *  - Single-line text is visually unaffected by justify (only multi-line paragraphs
 *    spread), so buttons/labels/titles look the same.
 *  - A component's own explicit textAlign (e.g. "center") still wins — this is only
 *    a default for text that specifies none.
 * Kept in one module so it is trivial to tune or remove.
 */
if (I18nManager.isRTL) {
  const T = Text as unknown as { defaultProps?: { style?: unknown } };
  T.defaultProps = T.defaultProps || {};
  const existing = T.defaultProps.style;
  T.defaultProps.style = existing
    ? [existing, { textAlign: "justify" as const }]
    : { textAlign: "justify" as const };
}
