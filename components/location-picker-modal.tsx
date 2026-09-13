// In-app location picker (Daa3iyah 2972): the appointment location was view-only
// (a button that opened Google Maps to LOOK). This lets the user actually PICK a
// spot — search or tap the map → reverse-geocoded address → fills the field.
// Uses a WebView + Leaflet + OpenStreetMap (tiles + Nominatim geocoding): no
// native maps module and no API key. A native WebView has no artifact-style CSP,
// so the CDN/tile/geocode requests below are allowed.
import { useMemo } from "react";
import { View, Text, Pressable, Modal, StyleSheet, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

export type PickedLocation = { address: string; lat: number; lng: number };

type Lang = "nl" | "en" | "ar";
function tx(lang: Lang, nl: string, en: string, ar: string): string {
  return lang === "ar" ? ar : lang === "en" ? en : nl;
}

// Default map center when the user has no saved prayer location: Makkah.
const DEFAULT_CENTER = { lat: 21.4225, lng: 39.8262 };

// Escape a value for safe embedding inside an inline <script>: neutralize a
// </script> breakout and the JS line separators. preset.address can be
// user-typed, so it must not be able to close the script tag.
function jsEmbed(v: unknown): string {
  return JSON.stringify(v)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function buildHtml(lang: Lang, center: { lat: number; lng: number }, preset: PickedLocation | null): string {
  const searchPlaceholder = tx(lang, "Zoek een plaats...", "Search a place...", "ابحث عن مكان...");
  const confirmLabel = tx(lang, "Deze locatie kiezen", "Choose this location", "اختيار هذا الموقع");
  const tapHint = tx(lang, "Tik op de kaart of zoek hierboven", "Tap the map or search above", "انقر على الخريطة أو ابحث أعلاه");
  const noResults = tx(lang, "Niets gevonden", "No results", "لا نتائج");
  const searchError = tx(lang, "Zoeken mislukt", "Search failed", "تعذّر البحث");
  const mapError = tx(lang, "Kaart niet beschikbaar (offline?)", "Map unavailable (offline?)", "الخريطة غير متاحة (بلا إنترنت؟)");
  const dir = lang === "ar" ? "rtl" : "ltr";
  // Embedded JS uses quotes + concatenation (no backticks) to stay inside this
  // template literal. Nominatim usage policy: low-volume personal use, 1 req/s.
  return `<!doctype html><html dir="${dir}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' https://unpkg.com; style-src 'unsafe-inline' https://unpkg.com; img-src https://unpkg.com https://a.tile.openstreetmap.org https://b.tile.openstreetmap.org https://c.tile.openstreetmap.org data:; connect-src https://nominatim.openstreetmap.org">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H" crossorigin="anonymous"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH" crossorigin="anonymous"></script>
<style>
  html,body{margin:0;padding:0;height:100%;font-family:system-ui,-apple-system,sans-serif}
  #map{position:absolute;top:52px;bottom:64px;left:0;right:0}
  #bar{position:absolute;top:0;left:0;right:0;height:52px;display:flex;gap:6px;padding:8px;box-sizing:border-box;background:#fff;border-bottom:1px solid #e5e7eb}
  #q{flex:1;border:1px solid #d1d5db;border-radius:8px;padding:8px;font-size:15px}
  #go{border:none;background:#1B4332;color:#fff;border-radius:8px;padding:0 14px;font-size:14px}
  #foot{position:absolute;bottom:0;left:0;right:0;min-height:64px;box-sizing:border-box;padding:8px 12px;background:#fff;border-top:1px solid #e5e7eb}
  #addr{font-size:13px;color:#374151;margin-bottom:6px;min-height:16px}
  #ok{width:100%;border:none;background:#1B4332;color:#fff;border-radius:10px;padding:12px;font-size:15px;font-weight:700;opacity:.5}
  #ok.on{opacity:1}
</style></head><body>
<div id="bar"><input id="q" placeholder="${searchPlaceholder}"/><button id="go">🔍</button></div>
<div id="map"></div>
<div id="foot"><div id="addr">${tapHint}</div><button id="ok">${confirmLabel}</button></div>
<script>
  // If Leaflet failed to load (CDN unreachable/offline), L.map() below throws —
  // surface a message instead of a silently-broken blank map.
  window.onerror = function(){ try{ document.getElementById('addr').textContent = ${jsEmbed(mapError)}; }catch(e){} return true; };
  var sel = null;
  var seq = 0; // guards against out-of-order geocode responses (rapid taps/search)
  var revTimer = null; // pending debounced reverse-geocode from a map tap
  var searching = false; // in-flight guard so repeated submits don't stack requests
  var marker = null;
  var map = L.map('map').setView([${Number(center.lat)}, ${Number(center.lng)}], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  function setMarker(lat, lng){
    if(marker){ marker.setLatLng([lat,lng]); } else { marker = L.marker([lat,lng]).addTo(map); }
  }
  function post(o){ if(window.ReactNativeWebView){ window.ReactNativeWebView.postMessage(JSON.stringify(o)); } }
  function reverse(lat, lng){
    var my = ++seq;
    document.getElementById('addr').textContent = '…';
    fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat='+lat+'&lon='+lng+'&accept-language=${lang}')
      .then(function(r){return r.json();})
      .then(function(d){
        if(my !== seq) return; // a newer tap/search superseded this response
        var name = (d && d.display_name) ? d.display_name : (lat.toFixed(5)+', '+lng.toFixed(5));
        sel = { lat: lat, lng: lng, address: name };
        document.getElementById('addr').textContent = name;
        document.getElementById('ok').className = 'on';
      })
      .catch(function(){
        if(my !== seq) return;
        sel = { lat: lat, lng: lng, address: lat.toFixed(5)+', '+lng.toFixed(5) };
        document.getElementById('addr').textContent = sel.address;
        document.getElementById('ok').className = 'on';
      });
  }
  map.on('click', function(e){
    var la = e.latlng.lat, lo = e.latlng.lng;
    setMarker(la, lo);
    sel = null; document.getElementById('ok').className = ''; // invalidate until this tap's reverse resolves — can't confirm a stale pick
    document.getElementById('addr').textContent = '…';
    if(revTimer) clearTimeout(revTimer);
    revTimer = setTimeout(function(){ reverse(la, lo); }, 350); // debounce rapid taps (OSM usage policy)
  });
  function search(){
    var q = document.getElementById('q').value.trim();
    if(!q || searching) return; // ignore a submit while one is already in flight (OSM usage policy)
    if(revTimer) clearTimeout(revTimer); // cancel a pending tap-reverse so it can't override this search
    var my = ++seq;
    searching = true;
    var guard = setTimeout(function(){ searching = false; }, 8000); // never lock out permanently if the fetch hangs
    fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=${lang}&q='+encodeURIComponent(q))
      .then(function(r){return r.json();})
      .then(function(a){
        clearTimeout(guard); searching = false;
        if(my !== seq) return; // superseded by a later tap/search
        if(a && a.length){
          var lat = parseFloat(a[0].lat), lng = parseFloat(a[0].lon);
          map.setView([lat,lng], 15); setMarker(lat,lng);
          sel = { lat: lat, lng: lng, address: a[0].display_name };
          document.getElementById('addr').textContent = a[0].display_name;
          document.getElementById('ok').className = 'on';
        } else {
          sel = null; document.getElementById('ok').className = ''; // no match — don't let a stale pick be confirmed
          if(marker){ map.removeLayer(marker); marker = null; } // drop the now-invalid pin
          document.getElementById('addr').textContent = ${jsEmbed(noResults)};
        }
      }).catch(function(){ clearTimeout(guard); searching = false; if(my === seq){ sel = null; document.getElementById('ok').className = ''; if(marker){ map.removeLayer(marker); marker = null; } document.getElementById('addr').textContent = ${jsEmbed(searchError)}; } });
  }
  document.getElementById('go').addEventListener('click', search);
  document.getElementById('q').addEventListener('keydown', function(e){ if(e.key==='Enter'){ e.preventDefault(); search(); } });
  document.getElementById('ok').addEventListener('click', function(){ if(sel){ post({ type:'pick', lat: sel.lat, lng: sel.lng, address: sel.address }); } });
  ${preset ? `setMarker(${Number(preset.lat)}, ${Number(preset.lng)}); sel = ${jsEmbed(preset)}; document.getElementById('addr').textContent = ${jsEmbed(preset.address)}; document.getElementById('ok').className = 'on';` : ""}
</script></body></html>`;
}

export function LocationPickerModal({
  visible,
  lang,
  isRTL,
  initialCenter,
  initialSelection,
  onPick,
  onClose,
}: {
  visible: boolean;
  lang: Lang;
  isRTL: boolean;
  initialCenter?: { lat: number; lng: number } | null;
  // When editing an event that already has a picked spot: pre-place the marker,
  // pre-select it, and center there. Distinct from initialCenter, which only
  // centers the map (prayer location) without a marker/selection.
  initialSelection?: PickedLocation | null;
  onPick: (r: PickedLocation) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const preset = initialSelection ?? null;
  const center = preset ?? initialCenter ?? DEFAULT_CENTER;
  // Rebuild the HTML only when the inputs that shape it change.
  const html = useMemo(
    () => buildHtml(lang, { lat: center.lat, lng: center.lng }, preset),
    [lang, center.lat, center.lng, preset?.lat, preset?.lng, preset?.address],
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} supportedOrientations={["portrait", "portrait-upside-down", "landscape"]}>
      {/* Inset for the status bar (top) and the system nav bar (bottom) so the
          WebView's own confirm button isn't hidden behind the nav bar. (2988) */}
      <View style={[st.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={[st.header, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <Text style={st.title}>{tx(lang, "Kies locatie", "Pick location", "تحديد الموقع")}</Text>
          <Pressable onPress={onClose} hitSlop={10}><MaterialIcons name="close" size={24} color="#1B4332" /></Pressable>
        </View>
        {visible ? (
          <WebView
            // Only our own injected page (baseUrl origin) ever loads as a
            // navigation — the HTML has no links, so no other origin is needed.
            originWhitelist={["https://www.openstreetmap.org"]}
            // Real secure origin (not the default null/about:blank): avoids the
            // RN-WebView gotcha where a null-origin document's fetch() to
            // Nominatim can be rejected. We only use absolute URLs, so baseUrl
            // affects the origin for security checks, not resource resolution.
            source={{ html, baseUrl: "https://www.openstreetmap.org/" }}
            // Identify the app to the OSM/Nominatim usage policy.
            userAgent="Rabbaanie/1 (Islamic family app; +https://rabbaanie.com)"
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState
            // Android needs mixed-content off but https everywhere here; keep defaults.
            onMessage={(e) => {
              try {
                const msg = JSON.parse(e.nativeEvent.data);
                if (msg && msg.type === "pick" && typeof msg.lat === "number" && typeof msg.lng === "number" && typeof msg.address === "string") {
                  onPick({ address: msg.address, lat: msg.lat, lng: msg.lng });
                }
              } catch {
                // ignore malformed messages
              }
            }}
            style={{ flex: 1 }}
          />
        ) : null}
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  header: { height: 52, alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: "#E8ECE9", paddingTop: Platform.OS === "ios" ? 8 : 0 },
  title: { fontSize: 17, fontWeight: "800", color: "#1B4332" },
});
