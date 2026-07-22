import React from "react";
import { View, Text, Linking, Platform, TouchableOpacity, ScrollView } from "react-native";

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
  colors: { surface: string; foreground: string; border: string; primary: string };
}

function tx(lang: "nl" | "en" | "ar", nl: string, en: string, ar: string): string {
  if (lang === "en") return en;
  if (lang === "ar") return ar;
  return nl;
}

function formatDist(d: number): string {
  return d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`;
}

export function MosqueMap({ mosques, lang, resultCount, colors }: MosqueMapProps) {
  return (
    <ScrollView style={{ flex: 1, padding: 12 }}>
      {/* Header with count */}
      <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 10, marginBottom: 10, borderWidth: 0.5, borderColor: colors.border, alignItems: "center" }}>
        <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "600" }}>
          📍 {resultCount} {tx(lang, "moskeeën gevonden", "mosques found", "مسجد تم العثور عليه")}
        </Text>
        <Text style={{ color: colors.primary, fontSize: 11, marginTop: 2 }}>
          {tx(lang, "Tik om te navigeren via Google Maps", "Tap to navigate via Google Maps", "اضغط للانتقال عبر خرائط جوجل")}
        </Text>
      </View>

      {/* Mosque list with navigation */}
      {mosques.map((mosque, idx) => (
        <TouchableOpacity
          key={`${mosque.lat}-${mosque.lon}-${idx}`}
          onPress={() => {
            const url = Platform.select({
              ios: `maps://app?daddr=${mosque.lat},${mosque.lon}`,
              default: `https://www.google.com/maps/dir/?api=1&destination=${mosque.lat},${mosque.lon}&travelmode=driving`,
            });
            if (url) Linking.openURL(url);
          }}
          activeOpacity={0.7}
          style={{
            backgroundColor: colors.surface,
            borderRadius: 10,
            padding: 12,
            marginBottom: 8,
            borderWidth: 0.5,
            borderColor: colors.border,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={{ fontWeight: "700", fontSize: 14, color: colors.foreground }}>{mosque.name}</Text>
            {mosque.address ? <Text style={{ fontSize: 11, color: "#777", marginTop: 2 }} numberOfLines={1}>{mosque.address}</Text> : null}
          </View>
          <View style={{ alignItems: "flex-end", minWidth: 60 }}>
            <Text style={{ fontSize: 12, color: colors.primary, fontWeight: "700" }}>{formatDist(mosque.distance_m)}</Text>
            <Text style={{ fontSize: 10, color: colors.primary, marginTop: 2 }}>
              {tx(lang, "Navigeer →", "Navigate →", "← انتقل")}
            </Text>
          </View>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}
