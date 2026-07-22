import React from "react";
import { View, Text, FlatList, TouchableOpacity, Linking, StyleSheet } from "react-native";
import { IconSymbol } from "@/components/ui/icon-symbol";

interface Mosque {
  name: string;
  lat: number;
  lon: number;
  address?: string;
  distance_m: number;
}

interface MosqueMapProps {
  mosques: Mosque[];
  centerLat: number;
  centerLon: number;
  latDelta: number;
  lonDelta: number;
  showsUserLocation: boolean;
  lang: "nl" | "en" | "ar";
  resultCount: number;
  colors: { surface: string; foreground: string; border: string; primary: string; muted: string };
}

function tx(lang: "nl" | "en" | "ar", nl: string, en: string, ar: string): string {
  if (lang === "en") return en;
  if (lang === "ar") return ar;
  return nl;
}

function formatDist(d: number): string {
  return d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`;
}

export function MosqueMap({
  mosques,
  centerLat,
  centerLon,
  lang,
  resultCount,
  colors,
}: MosqueMapProps) {
  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={mosques}
        keyExtractor={(item, i) => `map-${item.lat}-${item.lon}-${i}`}
        contentContainerStyle={{ padding: 12 }}
        ListHeaderComponent={
          <TouchableOpacity
            style={[webStyles.openBtn, { backgroundColor: colors.primary }]}
            onPress={() => Linking.openURL(`https://www.google.com/maps/search/mosque/@${centerLat},${centerLon},13z`)}
          >
            <Text style={webStyles.openBtnText}>
              {tx(lang, "Open in Google Maps", "Open in Google Maps", "فتح في خرائط Google")}
            </Text>
          </TouchableOpacity>
        }
        renderItem={({ item: mosque }) => (
          <TouchableOpacity
            style={[webStyles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${mosque.lat},${mosque.lon}&travelmode=driving`)}
          >
            <View style={{ flexDirection: lang === "ar" ? "row-reverse" : "row", alignItems: "center", gap: 10 }}>
              <IconSymbol name="mappin.and.ellipse" size={20} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "600", color: colors.foreground, fontSize: 13, textAlign: lang === "ar" ? "right" : "left" }}>
                  {mosque.name}
                </Text>
                {mosque.address ? (
                  <Text style={{ color: colors.muted, fontSize: 11, textAlign: lang === "ar" ? "right" : "left" }}>
                    {mosque.address}
                  </Text>
                ) : null}
                <Text style={{ color: colors.primary, fontSize: 11, textAlign: lang === "ar" ? "right" : "left" }}>
                  {formatDist(mosque.distance_m)}
                </Text>
              </View>
              <IconSymbol name="chevron.right" size={16} color={colors.muted} />
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={{ alignItems: "center", paddingVertical: 40 }}>
            <Text style={{ color: colors.muted }}>
              {tx(lang, "Geen moskeeën gevonden", "No mosques found", "لم يتم العثور على مساجد")}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const webStyles = StyleSheet.create({
  openBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    alignSelf: "center",
    marginBottom: 12,
  },
  openBtnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 13,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
});
