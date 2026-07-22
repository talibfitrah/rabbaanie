// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolWeight, SymbolViewProps } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type IconMapping = Record<SymbolViewProps["name"], ComponentProps<typeof MaterialIcons>["name"]>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  "house.fill": "home",
  "paperplane.fill": "send",
  "chevron.left.forwardslash.chevron.right": "code",
  "chevron.right": "chevron-right",
  "calendar": "date-range",
  "person.2.fill": "people",
  "heart.text.square.fill": "favorite",
  "gearshape.fill": "settings",
  "brain.head.profile": "psychology",
  "clock.fill": "access-time",
  "leaf.fill": "eco",
  "star.fill": "star",
  "book.fill": "menu-book",
  "mosque.fill": "mosque",
  "ellipsis.circle.fill": "more-horiz",
  "person.3.fill": "groups",
  "child.fill": "child-care",
  "lightbulb.fill": "lightbulb",
  "bubble.left.and.bubble.right.fill": "chat",
  "waveform.circle.fill": "record-voice-over",
  "envelope.fill": "mail",
  "person.badge.plus": "person-add",
  "chart.bar.fill": "bar-chart",
  "doc.text.fill": "description",
  "newspaper.fill": "article",
  "link": "link",
  "square.and.arrow.up": "share",
  "checkmark.circle.fill": "check-circle",
  "checkmark.circle": "radio-button-unchecked",
  "checkmark": "check",
  "xmark.circle.fill": "cancel",
  "bell.fill": "notifications",
  "pencil": "edit",
  "trash.fill": "delete",
  "plus.circle.fill": "add-circle",
  "arrow.right.circle.fill": "arrow-forward",
  "info.circle.fill": "info",
  "location.fill": "my-location",
  "map.fill": "map",
  "mappin.and.ellipse": "place",
  "arrow.triangle.turn.up.right.diamond.fill": "directions",
  "text.book.closed.fill": "auto-stories",
  "doc.text.magnifyingglass": "search",
  "magnifyingglass": "search",
  "hands.sparkles.fill": "menu-book",
  "photo.fill": "photo",
  "camera.fill": "camera-alt",
  "doc.fill": "insert-drive-file",
} as unknown as IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
