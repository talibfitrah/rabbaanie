import React, { useState, useEffect, useCallback, useMemo } from "react";
import { withTimeout } from "@/lib/location-utils";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Platform,
  StyleSheet,
  RefreshControl,
  Dimensions,
  TextInput,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";
import * as Location from "expo-location";
import { MosqueMap } from "@/components/mosque-map";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useRouter } from "expo-router";
import { useI18n } from "@/lib/i18n";
import { COUNTRIES, getCityAR, getCountryAR } from "@/lib/prayer-data";
import { useAppState } from "@/lib/app-context";

// Build flat city list for autocomplete
interface CityOption {
  city: string;
  cityAr: string;
  country: string;
  countryAr: string;
}
const ALL_CITIES: CityOption[] = Object.entries(COUNTRIES).flatMap(([country, data]) =>
  data.cities.map((c) => ({
    city: c.name,
    cityAr: getCityAR(c.name),
    country,
    countryAr: getCountryAR(country),
  }))
);

type Lang = "nl" | "en" | "ar";
function tx(lang: Lang, nl: string, en: string, ar: string): string {
  if (lang === "en") return en;
  if (lang === "ar") return ar;
  return nl;
}

interface Mosque {
  name: string;
  name_ar: string;
  name_en: string;
  type: string;
  city: string;
  street: string;
  housenumber: string;
  postcode: string;
  country: string;
  country_iso: string;
  lat: number;
  lon: number;
  phone: string;
  website: string;
  opening_hours: string;
  distance_m: number;
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function openNavigation(lat: number, lon: number, name: string) {
  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=driving`;
  const googleMapsAppUrl = `google.navigation:q=${lat},${lon}`;

  if (Platform.OS === "android") {
    Linking.canOpenURL(googleMapsAppUrl)
      .then((supported) => {
        if (supported) Linking.openURL(googleMapsAppUrl);
        else Linking.openURL(googleMapsUrl);
      })
      .catch(() => Linking.openURL(googleMapsUrl));
  } else if (Platform.OS === "ios") {
    const iosGoogleMaps = `comgooglemaps://?daddr=${lat},${lon}&directionsmode=driving`;
    Linking.canOpenURL(iosGoogleMaps)
      .then((supported) => {
        if (supported) Linking.openURL(iosGoogleMaps);
        else Linking.openURL(googleMapsUrl);
      })
      .catch(() => Linking.openURL(googleMapsUrl));
  } else {
    Linking.openURL(googleMapsUrl);
  }
}

type ViewMode = "list" | "map";



export default function MosquesScreen() {
  const colors = useColors();
  const router = useRouter();
  const { language } = useI18n();
  const lang = language as Lang;
  const isRTL = lang === "ar";
  const { state } = useAppState();
  // Use saved locationSettings as initial location if available
  const savedLat = state.locationSettings?.latitude;
  const savedLon = state.locationSettings?.longitude;
  const [location, setLocation] = useState<{ lat: number; lon: number } | null>(
    savedLat && savedLon ? { lat: savedLat, lon: savedLon } : null
  );
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [gpsLoading, setGpsLoading] = useState(false);
  const [radiusM, setRadiusM] = useState(5000); // default 5km
  const [citySearch, setCitySearch] = useState("");
  const [showCityInput, setShowCityInput] = useState(true);
  const [resultLimit, setResultLimit] = useState(40);

  const requestLocation = useCallback(async () => {
    try {
      setGpsLoading(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setPermissionDenied(true);
        setGpsLoading(false);
        // Fallback: try to use saved location from AsyncStorage
        try {
          const AsyncStorage = require("@react-native-async-storage/async-storage").default;
          const saved = await AsyncStorage.getItem("@prayer_location");
          if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.lat && parsed.lng) {
              setLocation({ lat: parsed.lat, lon: parsed.lng });
              setPermissionDenied(false);
            }
          }
        } catch {}
        return;
      }
      setPermissionDenied(false);
      
      // Strategy 1: Try getLastKnownPositionAsync (instant)
      let loc = await Location.getLastKnownPositionAsync({
        maxAge: 10 * 60 * 1000, // 10 minutes
        requiredAccuracy: 5000,
      });
      
      if (!loc) {
        // Strategy 2: getCurrentPositionAsync with timeout
        try {
          loc = await Promise.race([
            Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Low,
              mayShowUserSettingsDialog: true,
            }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("Timeout")), 15000)
            ),
          ]);
        } catch {
          // Strategy 3: Try lowest accuracy
          try {
            loc = await withTimeout(Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Lowest,
            }), 15000);
          } catch {
            // Strategy 4: Use saved prayer location as last resort
            try {
              const AsyncStorage = require("@react-native-async-storage/async-storage").default;
              const saved = await AsyncStorage.getItem("@prayer_location");
              if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.lat && parsed.lng) {
                  setLocation({ lat: parsed.lat, lon: parsed.lng });
                  return;
                }
              }
            } catch {}
          }
        }
      }
      
      if (loc) {
        setLocation({ lat: loc.coords.latitude, lon: loc.coords.longitude });
      }
    } catch (err) {
      console.warn("Location error:", err);
      // Final fallback: try saved location
      try {
        const AsyncStorage = require("@react-native-async-storage/async-storage").default;
        const saved = await AsyncStorage.getItem("@prayer_location");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.lat && parsed.lng) {
            setLocation({ lat: parsed.lat, lon: parsed.lng });
          }
        }
      } catch {}
    } finally {
      setGpsLoading(false);
    }
  }, []);

  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  const mosquesQuery = trpc.mosques.nearby.useQuery(
    { lat: location?.lat ?? 0, lon: location?.lon ?? 0, limit: resultLimit, radius_m: radiusM, city: citySearch.trim() || undefined },
    { enabled: !!location || !!citySearch.trim() }
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setCitySearch("");
    await requestLocation();
    await mosquesQuery.refetch();
    setRefreshing(false);
  }, [requestLocation, mosquesQuery]);

  // Sort by distance (nearest first) and filter by search query
  const filteredMosques = useMemo(() => {
    let list = [...(mosquesQuery.data || [])];
    // Sort by distance ascending (nearest first)
    list.sort((a, b) => (a.distance_m || 0) - (b.distance_m || 0));
    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((m) => {
        const name = (m.name || "").toLowerCase();
        const nameAr = (m.name_ar || "").toLowerCase();
        const nameEn = (m.name_en || "").toLowerCase();
        const city = (m.city || "").toLowerCase();
        return name.includes(q) || nameAr.includes(q) || nameEn.includes(q) || city.includes(q);
      });
    }
    return list;
  }, [mosquesQuery.data, searchQuery]);

  const renderMosque = ({ item, index }: { item: Mosque; index: number }) => {
    const displayName = item.name_ar || item.name || item.name_en || "Moskee";
    const address = [item.street, item.housenumber, item.city].filter(Boolean).join(" ");

    return (
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.cardHeader}>
          <View style={[styles.rankBadge, { backgroundColor: colors.primary + "15" }]}>
            <Text style={[styles.rankText, { color: colors.primary }]}>{index + 1}</Text>
          </View>
          <View style={styles.cardContent}>
            <Text style={[styles.mosqueName, { color: colors.foreground }]} numberOfLines={2}>
              {displayName}
            </Text>
            {address ? (
              <Text style={[styles.address, { color: colors.muted }]} numberOfLines={1}>
                {address}
              </Text>
            ) : null}
            {item.city || item.country ? (
              <Text style={[styles.cityCountry, { color: colors.muted }]}>
                {[item.city, item.country].filter(Boolean).join(", ")}
              </Text>
            ) : null}
          </View>
          <View style={styles.distanceContainer}>
            <IconSymbol name="mappin.and.ellipse" size={16} color={colors.primary} />
            <Text style={[styles.distance, { color: colors.primary }]}>
              {formatDistance(item.distance_m)}
            </Text>
          </View>
        </View>

        {/* Extra info row */}
        <View style={styles.infoRow}>
          {item.phone ? (
            <TouchableOpacity
              style={[styles.infoChip, { backgroundColor: colors.primary + "15" }]}
              onPress={() => Linking.openURL(`tel:${item.phone}`)}
            >
              <Text style={[styles.infoChipText, { color: colors.primary }]}>
                📞 {item.phone}
              </Text>
            </TouchableOpacity>
          ) : null}
          {item.opening_hours ? (
            <View style={[styles.infoChip, { backgroundColor: colors.surface }]}>
              <Text style={[styles.infoChipText, { color: colors.muted }]} numberOfLines={1}>
                🕐 {item.opening_hours}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Action buttons */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.navButton, { backgroundColor: colors.primary }]}
            onPress={() => openNavigation(item.lat, item.lon, displayName)}
          >
            <IconSymbol name="arrow.triangle.turn.up.right.diamond.fill" size={18} color="#fff" />
            <Text style={styles.navButtonText}>{tx(lang, "Route", "Directions", "اتجاهات")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.mapLinkButton, { borderColor: colors.primary }]}
            onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${item.lat},${item.lon}`)}
          >
            <IconSymbol name="map.fill" size={16} color={colors.primary} />
            <Text style={[styles.mapLinkText, { color: colors.primary }]}>{tx(lang, "Kaart", "Map", "خريطة")}</Text>
          </TouchableOpacity>
          {item.website ? (
            <TouchableOpacity
              style={[styles.webButton, { borderColor: colors.border }]}
              onPress={() => Linking.openURL(item.website.startsWith("http") ? item.website : `https://${item.website}`)}
            >
              <Text style={[styles.webButtonText, { color: colors.muted }]}>{tx(lang, "Website", "Website", "الموقع")}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  };

  const renderMapView = () => {
    if (!location && !citySearch.trim()) return null;
    const mosques = filteredMosques;
    const centerLat = location?.lat ?? 52.37;
    const centerLon = location?.lon ?? 4.89;

    // Calculate delta to fit all markers
    let latDelta = 0.05;
    let lonDelta = 0.05;
    if (mosques.length > 0) {
      const lats = mosques.map(m => m.lat);
      const lons = mosques.map(m => m.lon);
      const minLat = Math.min(...lats, centerLat);
      const maxLat = Math.max(...lats, centerLat);
      const minLon = Math.min(...lons, centerLon);
      const maxLon = Math.max(...lons, centerLon);
      latDelta = Math.max((maxLat - minLat) * 1.4, 0.01);
      lonDelta = Math.max((maxLon - minLon) * 1.4, 0.01);
    }

    return (
      <MosqueMap
        mosques={mosques}
        centerLat={centerLat}
        centerLon={centerLon}
        latDelta={latDelta}
        lonDelta={lonDelta}
        showsUserLocation={!!location}
        lang={lang}
        resultCount={mosques.length}
        colors={colors as any}
      />
    );
  };

  return (
    <ScreenContainer className="flex-1">
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.push("/(tabs)" as any)} style={styles.backButton}>
          <IconSymbol name="house.fill" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground, textAlign: isRTL ? "right" : "left" }]}>
          {tx(lang, "Moskeeën in de buurt", "Nearby Mosques", "المساجد القريبة")}
        </Text>
        <TouchableOpacity onPress={onRefresh} style={[styles.refreshButton, { opacity: gpsLoading ? 0.5 : 1 }]} disabled={gpsLoading}>
          {gpsLoading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <IconSymbol name="location.fill" size={22} color={colors.primary} />
          )}
        </TouchableOpacity>
      </View>

      {/* Search bar + GPS refresh */}
      {(location || showCityInput || citySearch.trim()) && (
        <View style={[styles.searchContainer, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <View style={[styles.searchInputWrapper, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <IconSymbol name="doc.text.magnifyingglass" size={18} color={colors.muted} />
            <TextInput
              style={[styles.searchInput, { color: colors.foreground, textAlign: isRTL ? "right" : "left" }]}
              placeholder={tx(lang, "Zoek moskee op naam...", "Search mosque by name...", "ابحث عن مسجد بالاسم...")}
              placeholderTextColor={colors.muted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery("")} style={{ padding: 4 }}>
                <Text style={{ color: colors.muted, fontSize: 16 }}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            onPress={onRefresh}
            disabled={gpsLoading}
            style={[styles.gpsRefreshButton, { backgroundColor: colors.primary + "15", opacity: gpsLoading ? 0.5 : 1 }]}
          >
            {gpsLoading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <IconSymbol name="location.fill" size={18} color={colors.primary} />
            )}
            <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "600" }}>
              {tx(lang, "Vernieuwen", "Refresh", "تحديث")}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Radius & City controls */}
      {(location || showCityInput || citySearch.trim()) && (
        <View style={{ backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
          {/* Radius slider */}
          <View style={{ marginBottom: 8 }}>
            <View style={{ flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "600" }}>
                {tx(lang, "Zoekradius", "Search radius", "نطاق البحث")}
              </Text>
              <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>
                {radiusM < 1000 ? `${radiusM} m` : `${(radiusM / 1000).toFixed(1)} km`}
              </Text>
            </View>
            {/* Simple radius buttons */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
              {[500, 1000, 2000, 5000, 10000, 20000, 50000].map((r) => (
                <TouchableOpacity
                  key={r}
                  onPress={() => { setRadiusM(r); mosquesQuery.refetch(); }}
                  style={{
                    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16,
                    backgroundColor: radiusM === r ? colors.primary : colors.background,
                    borderWidth: 1, borderColor: radiusM === r ? colors.primary : colors.border,
                  }}
                >
                  <Text style={{ color: radiusM === r ? "#fff" : colors.foreground, fontSize: 11, fontWeight: "600" }}>
                    {r < 1000 ? `${r}m` : `${r / 1000}km`}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* City search toggle + input */}
          <CityAutocomplete
            lang={lang}
            isRTL={isRTL}
            colors={colors}
            citySearch={citySearch}
            setCitySearch={setCitySearch}
            showCityInput={showCityInput}
            setShowCityInput={setShowCityInput}
            onCitySelected={() => mosquesQuery.refetch()}
          />

          {/* Result count info */}
          <View style={{ flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
            <Text style={{ color: colors.muted, fontSize: 10 }}>
              {tx(lang, `Max ${resultLimit} resultaten`, `Max ${resultLimit} results`, `حد أقصى ${resultLimit} نتيجة`)}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
              {[20, 40, 60, 100].map((n) => (
                <TouchableOpacity
                  key={n}
                  onPress={() => { setResultLimit(n); mosquesQuery.refetch(); }}
                  style={{
                    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
                    backgroundColor: resultLimit === n ? colors.primary : colors.background,
                    borderWidth: 1, borderColor: resultLimit === n ? colors.primary : colors.border,
                  }}
                >
                  <Text style={{ color: resultLimit === n ? "#fff" : colors.muted, fontSize: 10, fontWeight: "600" }}>{n}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      )}

      {/* View mode toggle */}
      {(location || citySearch.trim()) && mosquesQuery.data && mosquesQuery.data.length > 0 && (
        <View style={[styles.toggleContainer, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity
            style={[
              styles.toggleButton,
              viewMode === "list" && { backgroundColor: colors.primary },
            ]}
            onPress={() => setViewMode("list")}
          >
            <IconSymbol name="doc.text.fill" size={16} color={viewMode === "list" ? "#fff" : colors.muted} />
            <Text style={[styles.toggleText, { color: viewMode === "list" ? "#fff" : colors.muted }]}>
              {tx(lang, "Lijst", "List", "قائمة")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.toggleButton,
              viewMode === "map" && { backgroundColor: colors.primary },
            ]}
            onPress={() => setViewMode("map")}
          >
            <IconSymbol name="map.fill" size={16} color={viewMode === "map" ? "#fff" : colors.muted} />
            <Text style={[styles.toggleText, { color: viewMode === "map" ? "#fff" : colors.muted }]}>
              {tx(lang, "Kaart", "Map", "خريطة")}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Content */}
      {permissionDenied && !citySearch.trim() ? (
        <View style={styles.center}>
          <IconSymbol name="mappin.and.ellipse" size={48} color={colors.muted} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            {tx(lang, "Zoek op stad of geef locatietoegang", "Search by city or grant location access", "ابحث باسم المدينة أو امنح إذن الموقع")}
          </Text>
          <Text style={[styles.emptyText, { color: colors.muted }]}>
            {tx(lang, "Gebruik het zoekveld hierboven om moskeeën in een stad te vinden, of geef locatietoegang voor moskeeën in de buurt.", "Use the search field above to find mosques in a city, or grant location access for nearby mosques.", "استخدم حقل البحث أعلاه للعثور على مساجد في مدينة، أو امنح إذن الموقع للمساجد القريبة.")}
          </Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: colors.primary }]}
            onPress={requestLocation}
          >
            <Text style={styles.retryButtonText}>{tx(lang, "Locatie toestaan", "Allow location", "السماح بالموقع")}</Text>
          </TouchableOpacity>
        </View>
      ) : (!location && !citySearch.trim()) || mosquesQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.muted }]}>
            {tx(lang, "Locatie bepalen en moskeeën zoeken...", "Locating and searching for mosques...", "جاري تحديد الموقع والبحث عن المساجد...")}
          </Text>
        </View>
      ) : mosquesQuery.isError ? (
        <View style={styles.center}>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            {tx(lang, "Kan moskeeën niet laden", "Could not load mosques", "تعذر تحميل المساجد")}
          </Text>
          <Text style={[styles.emptyText, { color: colors.muted }]}>
            {tx(lang, "Controleer uw internetverbinding en probeer het opnieuw.", "Check your internet connection and try again.", "تحقق من اتصالك بالإنترنت وحاول مرة أخرى.")}
          </Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: colors.primary }]}
            onPress={() => mosquesQuery.refetch()}
          >
            <Text style={styles.retryButtonText}>{tx(lang, "Opnieuw proberen", "Retry", "إعادة المحاولة")}</Text>
          </TouchableOpacity>
        </View>
      ) : viewMode === "map" ? (
        renderMapView()
      ) : (
        <FlatList
          data={filteredMosques}
          keyExtractor={(item, i) => `${item.lat}-${item.lon}-${i}`}
          renderItem={renderMosque}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <Text style={[styles.resultCount, { color: colors.muted }]}>
                {filteredMosques.length} {tx(lang, "moskeeën gevonden", "mosques found", "مسجد تم العثور عليه")}
                {searchQuery.trim() ? ` (${tx(lang, "gefilterd", "filtered", "مفلتر")})` : ""}
              </Text>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                {searchQuery.trim()
                  ? tx(lang, "Geen resultaten voor deze zoekopdracht", "No results for this search", "لا توجد نتائج لهذا البحث")
                  : tx(lang, "Geen moskeeën gevonden", "No mosques found", "لم يتم العثور على مساجد")
                }
              </Text>
              <Text style={[styles.emptyText, { color: colors.muted }]}>
                {searchQuery.trim()
                  ? tx(lang, "Probeer een andere zoekterm.", "Try a different search term.", "جرب كلمة بحث أخرى.")
                  : tx(lang, "Er zijn geen moskeeën in de database in uw regio.", "No mosques in the database in your area.", "لا توجد مساجد في قاعدة البيانات في منطقتك.")
                }
              </Text>
            </View>
          }
        />
      )}
    </ScreenContainer>
  );
}

// CityAutocomplete component with suggestions dropdown
function CityAutocomplete({
  lang,
  isRTL,
  colors,
  citySearch,
  setCitySearch,
  showCityInput,
  setShowCityInput,
  onCitySelected,
}: {
  lang: Lang;
  isRTL: boolean;
  colors: any;
  citySearch: string;
  setCitySearch: (v: string) => void;
  showCityInput: boolean;
  setShowCityInput: (v: boolean) => void;
  onCitySelected: () => void;
}) {
  const [inputText, setInputText] = useState(citySearch);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const suggestions = useMemo(() => {
    if (!inputText.trim() || inputText.trim().length < 1) return [];
    const q = inputText.trim().toLowerCase();
    return ALL_CITIES.filter(
      (c) =>
        c.city.toLowerCase().includes(q) ||
        c.cityAr.includes(q) ||
        c.country.toLowerCase().includes(q) ||
        c.countryAr.includes(q)
    ).slice(0, 10);
  }, [inputText]);

  const handleSelect = (city: CityOption) => {
    setInputText(lang === "ar" ? city.cityAr : city.city);
    setCitySearch(city.city);
    setShowSuggestions(false);
    setTimeout(() => onCitySelected(), 100);
  };

  const handleClear = () => {
    setInputText("");
    setCitySearch("");
    setShowSuggestions(false);
    onCitySelected();
  };

  return (
    <View>
      <TouchableOpacity
        onPress={() => setShowCityInput(!showCityInput)}
        style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 6, marginBottom: showCityInput ? 6 : 0 }}
      >
        <IconSymbol name="doc.text.magnifyingglass" size={14} color={colors.primary} />
        <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "600" }}>
          {tx(lang, "Zoek op stad", "Search by city", "بحث باسم المدينة")}
        </Text>
      </TouchableOpacity>
      {showCityInput && (
        <View style={{ position: "relative", zIndex: 100 }}>
          <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 8, alignItems: "center" }}>
            <View style={[styles.searchInputWrapper, { backgroundColor: colors.background, borderColor: colors.border, flex: 1 }]}>
              <TextInput
                style={[styles.searchInput, { color: colors.foreground, textAlign: isRTL ? "right" : "left" }]}
                placeholder={tx(lang, "Voer stadsnaam in...", "Enter city name...", "أدخل اسم المدينة...")}
                placeholderTextColor={colors.muted}
                value={inputText}
                onChangeText={(text) => {
                  setInputText(text);
                  setShowSuggestions(text.trim().length >= 1);
                }}
                returnKeyType="search"
                onSubmitEditing={() => {
                  setCitySearch(inputText.trim());
                  setShowSuggestions(false);
                  onCitySelected();
                }}
                autoCapitalize="words"
                autoCorrect={false}
              />
              {inputText.length > 0 && (
                <TouchableOpacity onPress={handleClear} style={{ padding: 4 }}>
                  <Text style={{ color: colors.muted, fontSize: 16 }}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              onPress={() => {
                setCitySearch(inputText.trim());
                setShowSuggestions(false);
                onCitySelected();
              }}
              style={{ backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}
            >
              <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>
                {tx(lang, "Zoek", "Search", "بحث")}
              </Text>
            </TouchableOpacity>
          </View>
          {/* Suggestions dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <View style={{
              position: "absolute",
              top: 44,
              left: 0,
              right: 0,
              backgroundColor: colors.background,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.border,
              maxHeight: 220,
              zIndex: 200,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.15,
              shadowRadius: 6,
              elevation: 8,
            }}>
              <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                {suggestions.map((item, idx) => (
                  <TouchableOpacity
                    key={`${item.city}-${item.country}-${idx}`}
                    onPress={() => handleSelect(item)}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      borderBottomWidth: idx < suggestions.length - 1 ? 0.5 : 0,
                      borderBottomColor: colors.border,
                      flexDirection: isRTL ? "row-reverse" : "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 8 }}>
                      <Text style={{ fontSize: 16 }}>📍</Text>
                      <View>
                        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>
                          {lang === "ar" ? item.cityAr : item.city}
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.muted, textAlign: isRTL ? "right" : "left" }}>
                          {lang === "ar" ? item.countryAr : item.country}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  backButton: {
    padding: 4,
    marginRight: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
  },
  refreshButton: {
    padding: 4,
  },
  toggleContainer: {
    flexDirection: "row",
    padding: 8,
    gap: 8,
    borderBottomWidth: 0.5,
  },
  toggleButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: "600",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    marginTop: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
  },
  emptyText: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
    marginTop: 8,
  },
  retryButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  list: {
    padding: 16,
    paddingBottom: 100,
  },
  listHeader: {
    marginBottom: 12,
  },
  resultCount: {
    fontSize: 13,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  rankText: {
    fontSize: 14,
    fontWeight: "700",
  },
  cardContent: {
    flex: 1,
    marginRight: 8,
  },
  mosqueName: {
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 20,
  },
  address: {
    fontSize: 13,
    marginTop: 2,
    lineHeight: 18,
  },
  cityCountry: {
    fontSize: 12,
    marginTop: 1,
  },
  distanceContainer: {
    alignItems: "center",
    gap: 2,
  },
  distance: {
    fontSize: 13,
    fontWeight: "600",
  },
  infoRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  infoChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  infoChipText: {
    fontSize: 12,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  navButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
  },
  navButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 13,
  },
  mapLinkButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 20,
  },
  mapLinkText: {
    fontWeight: "600",
    fontSize: 13,
  },
  webButton: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 20,
  },
  webButtonText: {
    fontWeight: "600",
    fontSize: 13,
  },
  // Search styles
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 0.5,
  },
  searchInputWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  gpsRefreshButton: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 2,
  },
  // Map styles
  mapContainer: {
    flex: 1,
  },
  map: {
    width: SCREEN_WIDTH,
    flex: 1,
  },
});
