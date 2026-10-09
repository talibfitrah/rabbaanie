import { View } from "react-native";
import { Image } from "expo-image";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";

/**
 * Library book cover. Most books have no cover URL (only ~9 of 45 are in
 * cover_urls.json); an Image with an empty uri drew a bare grey box, so show a
 * book icon on a tinted background instead. The missing covers
 * themselves are a content task.
 */
export function BookCover({ uri, style }: { uri: string; style: any }) {
  const colors = useColors();
  if (uri) return <Image source={{ uri }} style={style} contentFit="cover" />;
  return (
    <View style={[style, { backgroundColor: colors.primary + "15", alignItems: "center", justifyContent: "center" }]}>
      <MaterialIcons name="menu-book" size={36} color={colors.primary} />
    </View>
  );
}
