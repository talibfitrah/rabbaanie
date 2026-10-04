import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Platform,
  Modal,
  Dimensions,
  PanResponder,
  Animated as RNAnimated,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useI18n } from "@/lib/i18n";
import { useColors } from "@/hooks/use-colors";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import WebView from "react-native-webview";
import * as FileSystem from "expo-file-system/legacy";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useIsFocused } from "@react-navigation/native";
import { ReportAiContent } from "@/components/report-ai-content";
import {
  getJuzForPage,
  getEighthOfJuzForPage,
  getRubMarksForPage,
  getSajdasForPage,
  getJuzStartPage,
  type SajdaVerse,
} from "@/lib/quran-page-index";
import { SURAH_LIST, type Surah } from "@/lib/surah-list";
import { TOTAL_PAGES, pageToIndex, indexToPage } from "@/lib/mushaf-paging";

import { authedFetch } from "@/lib/authed-fetch";
type Lang = "nl" | "en" | "ar";
const STORAGE_KEY = "quran_last_page";
const SETTINGS_KEY = "quran_mushaf_settings";
const FONT_CDN = "https://static.qurancdn.com/fonts/quran/hafs/v1/woff2";
const API_BASE = "https://api.quran.com/api/v4";
const JUZ_NUMBERS = Array.from({ length: 30 }, (_, i) => i + 1);
const PRELOAD_RADIUS = 2;   // pages each side of currentPage whose data we prefetch
const CACHE_KEEP_RADIUS = 6; // pageCache pruned beyond this many pages from currentPage
// A degraded (plain-text fallback) page is re-attempted at most once per this
// interval, so a sustained quran.com outage can't turn every swipe into a burst
// of doomed re-fetches; a transient failure still upgrades to QCF soon after.
const DEGRADED_RETRY_COOLDOWN_MS = 30000;

// Colour themes: replaces the old binary nightMode STATE. nightMode is now
// DERIVED from theme (see QuranScreen) so the ~50 existing
// `nightMode ? darkVariant : lightVariant` accent/border ternaries elsewhere
// in this file keep working unchanged — only bg/text come from the theme map.
type MushafTheme = "white" | "sepia" | "green" | "dark";
const MUSHAF_THEMES: Record<
  MushafTheme,
  { bg: string; text: string; dark: boolean; label: { nl: string; en: string; ar: string } }
> = {
  white: { bg: "#FFFFF5", text: "#1B1B1B", dark: false, label: { nl: "Wit", en: "White", ar: "أبيض" } },
  sepia: { bg: "#F5ECD8", text: "#3A2E1A", dark: false, label: { nl: "Sepia", en: "Sepia", ar: "بنّي فاتح" } },
  green: { bg: "#E8F5EC", text: "#14341F", dark: false, label: { nl: "Groen", en: "Green", ar: "أخضر" } },
  dark: { bg: "#1A1A2E", text: "#E8E8D0", dark: true, label: { nl: "Nacht", en: "Night", ar: "ليلي" } },
};

function tx(lang: Lang, nl: string, en: string, ar: string): string {
  if (lang === "en") return en;
  if (lang === "ar") return ar;
  return nl;
}

interface PageWord {
  code_v1: string;
  text_uthmani: string;
  line_number: number;
  char_type_name: string;
  verse_key: string;
}

interface PageAyah {
  number: number;
  numberInSurah: number;
  text: string;
  surahNumber: number;
  surahName: string;
}

function getSurahForPage(page: number): Surah {
  for (let i = SURAH_LIST.length - 1; i >= 0; i--) {
    if (SURAH_LIST[i].startPage <= page) return SURAH_LIST[i];
  }
  return SURAH_LIST[0];
}

// Generate HTML for WebView rendering with quran.com CDN fonts
function generateMushafHTML(
  pageNum: number,
  words: PageWord[],
  nightMode: boolean,
  fontSize: number,
  bgColor: string,
  textColor: string,
  sajdas: SajdaVerse[] = [],
  fontDataUri?: string,
): string {
  const borderColor = nightMode ? "#C4A35A" : "#1B4332";
  // Cached base64 font (see loadMushafPage/getCachedFontUri below) wins once a
  // page has been opened before; first-ever view falls back to the CDN exactly
  // as before.
  const fontUrl = fontDataUri || `${FONT_CDN}/p${pageNum}.woff2`;

  // The QCF line fills the full page width — there is no room beside the text
  // for an inline ۞ (a gutter shrinks the line and clips it; zero-width marks
  // still visually overlap the neighbouring glyph). An exact in-page ۞ at the
  // rub' position (like the Madinah print) would need image-based pages; the
  // font-based approximation here shows juz/hizb/sajda in the transient
  // page-turn badge instead (see sectionLabelForPage + the badge JSX in
  // QuranScreen) — rubMarks isn't used for in-page placement any more. The
  // sajda overline below is still per-word (text-decoration adds no width, so
  // it's safe in the text run).
  const sajdaVerseKeys = new Set(sajdas.map((s) => s.verseKey));

  // Group words by line
  const lines: { [key: number]: PageWord[] } = {};
  for (const w of words) {
    const ln = w.line_number;
    if (!lines[ln]) lines[ln] = [];
    lines[ln].push(w);
  }

  const sortedLines = Object.keys(lines)
    .map(Number)
    .sort((a, b) => a - b);
  const minLine = sortedLines.length > 0 ? sortedLines[0] : 1;

  // Detect if this page starts a new surah (missing lines 1 or 1-2)
  // Find the FIRST surah that starts on this page (for the page header)
  const surahsOnPage = SURAH_LIST.filter((s) => s.startPage === pageNum);
  const surahOnPage = surahsOnPage.length > 0 ? surahsOnPage[0] : null;
  const hasBismillah =
    surahOnPage && surahOnPage.number !== 1 && surahOnPage.number !== 9;
  const hasSurahHeader = surahOnPage && surahOnPage.number !== 1;

  // Build line HTML - include header lines for surah starts
  let linesHTML = "";

  // Add surah header line if this is a surah start page
  if (hasSurahHeader && minLine > 1) {
    // Line 1: Surah name header (decorative)
    linesHTML += `<div class="line surah-header">سورة ${surahOnPage!.name}</div>\n`;
    // Line 2: Bismillah (except for At-Tawba)
    if (hasBismillah && minLine > 2) {
      linesHTML += `<div class="line bismillah">بِسْمِ اللَّهِ الرَّحْمَـٰنِ الرَّحِيمِ</div>\n`;
    } else if (minLine > 2) {
      linesHTML += `<div class="line"></div>\n`;
    }
  }

  // Detect mid-page surah boundaries (gaps in line numbers indicate surah separators)
  let prevLine = sortedLines.length > 0 ? sortedLines[0] - 1 : 0;
  for (const ln of sortedLines) {
    // If there's a gap of 2+ lines, it's a surah separator (header + bismillah)
    if (ln - prevLine >= 3 && prevLine > 0) {
      // Find which surah starts here by checking the verse_key of words on this line
      const firstWord = lines[ln][0];
      const surahNum = firstWord?.verse_key
        ? parseInt(firstWord.verse_key.split(":")[0])
        : 0;
      const surah = SURAH_LIST.find((s) => s.number === surahNum);
      if (surah && surah.number !== 9) {
        linesHTML += `<div class="line surah-header">سورة ${surah.name}</div>\n`;
        linesHTML += `<div class="line bismillah">بِسْمِ اللَّهِ الرَّحْمَـٰنِ الرَّحِيمِ</div>\n`;
      } else if (surah && surah.number === 9) {
        linesHTML += `<div class="line surah-header">سورة ${surah.name}</div>\n`;
      }
    } else if (ln - prevLine === 2 && prevLine > 0) {
      // Single gap line - could be just spacing, add empty line
      linesHTML += `<div class="line"></div>\n`;
    }
    prevLine = ln;

    const lineWords = lines[ln];
    const wordsHTML = lineWords
      .map((w) => {
        const vk = w.verse_key || "";
        const cls = [w.char_type_name === "end" ? "end-marker" : "word"];
        // Whole-verse overline, not just a trigger word: quran.com's per-page
        // word data has no trigger-word index for sajdat at-tilawah, only the
        // verse it falls in. text-decoration adds no width, so this is safe
        // inside the full-width nowrap line (unlike a glyph span — see above).
        if (sajdaVerseKeys.has(vk)) cls.push("sajda-line");
        return `<span class="${cls.join(" ")}" data-vk="${vk}">${w.code_v1}</span>`;
      })
      .join("");
    linesHTML += `<div class="line">${wordsHTML}</div>\n`;
  }

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<style>
@font-face {
  font-family: 'QCF_P${pageNum}';
  src: url('${fontUrl}') format('woff2');
  font-display: swap;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body {
  width: 100%; height: 100%;
  background: ${bgColor};
  overflow: hidden;
  -webkit-user-select: none;
  user-select: none;
  /* Let a horizontal drag pass through to the native page swipe (FlatList's
     paging scroll view); only claim vertical panning here. */
  touch-action: pan-y;
}
.page-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100vh;
  padding: 2px;
}
.page-frame {
  border: 2px solid ${borderColor};
  border-radius: 6px;
  padding: 8px 4px;
  width: 100%;
  height: calc(100vh - 24px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  overflow: hidden;
}
.page-number {
  font-family: sans-serif;
  font-size: 12px;
  color: ${nightMode ? "#888" : "#999"};
  text-align: center;
  margin-top: 4px;
}
.line {
  font-family: 'QCF_P${pageNum}', serif;
  font-size: ${fontSize}px;
  line-height: 1.6;
  color: ${textColor};
  text-align: center;
  direction: rtl;
  width: 100%;
  white-space: nowrap;
  letter-spacing: 0;
  word-spacing: -2px;
  flex-shrink: 1;
}
.surah-header {
  font-family: 'Amiri', 'Traditional Arabic', serif;
  font-size: ${Math.round(fontSize * 0.7)}px;
  color: ${nightMode ? "#C4A35A" : "#1B4332"};
  background: ${nightMode ? "#2A2A4A" : "#E8F5EC"};
  border-radius: 8px;
  padding: 4px 16px;
  margin: 2px auto;
  width: auto;
  display: inline-block;
  font-weight: bold;
}
.bismillah {
  font-family: 'Amiri', 'Traditional Arabic', serif;
  font-size: ${Math.round(fontSize * 0.65)}px;
  color: ${nightMode ? "#E8E8D0" : "#2D6A4F"};
  letter-spacing: 1px;
  word-spacing: 4px;
}
.word {
  cursor: pointer;
}
.word:active {
  color: ${nightMode ? "#C4A35A" : "#2D6A4F"};
}
.end-marker {
  color: ${nightMode ? "#C4A35A" : "#2D6A4F"};
}
.sajda-line {
  text-decoration: overline;
  text-decoration-color: ${borderColor};
  text-decoration-thickness: 1.5px;
  text-underline-offset: 2px;
}
.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: ${textColor};
  font-size: 16px;
  font-family: sans-serif;
}
</style>
</head>
<body>
<div class="page-container">
  <div class="page-frame" id="page-frame">
    ${words.length > 0 ? linesHTML : '<div class="loading">جاري التحميل...</div>'}
  </div>
  <div class="page-number">${pageNum}</div>
</div>
<script>
document.addEventListener('click', function(e) {
  var el = e.target;
  if (el.classList.contains('word') || el.classList.contains('end-marker')) {
    var vk = el.getAttribute('data-vk');
    if (vk) {
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'tap', verseKey: vk}));
    }
  }
});
var longPressTimer = null;
document.addEventListener('touchstart', function(e) {
  var el = e.target;
  if (el.classList.contains('word') || el.classList.contains('end-marker')) {
    var vk = el.getAttribute('data-vk');
    longPressTimer = setTimeout(function() {
      if (vk) {
        window.ReactNativeWebView.postMessage(JSON.stringify({type:'longpress', verseKey: vk}));
      }
    }, 600);
  }
});
document.addEventListener('touchend', function() {
  if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
});
document.addEventListener('touchmove', function() {
  if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
});
// The FlatList page swipe owns the gesture now, so a swipe delivers touchcancel
// (not touchend/touchmove) to this WebView — without clearing the timer here
// too, the 600ms long-press still fires mid-swipe and opens the tafsir modal.
document.addEventListener('touchcancel', function() {
  if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
});
document.addEventListener('pointercancel', function() {
  if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
});
</script>
</body>
</html>`;
}

// Renders one window slot's WebView. generateMushafHTML rebuilds a full HTML
// string (incl. the page's base64 font) for the handful of pages FlatList
// keeps mounted — expensive enough that doing it on every QuranScreen render
// (e.g. a toolbar toggle) regenerates them all for nothing. useMemo needs a
// real component (a plain function called in a .map() can't use hooks), keyed
// on exactly what generateMushafHTML's output depends on — a toolbar/settings
// re-render with the same page/bundle/nightMode/fontSize/bgColor/textColor
// reuses the cached html untouched.
function MushafPageView({
  page,
  bundle,
  nightMode,
  fontSize,
  bgColor,
  textColor,
  onMessage,
}: {
  page: number;
  bundle: { words: PageWord[]; ayahs: PageAyah[]; fontUri?: string };
  nightMode: boolean;
  fontSize: number;
  bgColor: string;
  textColor: string;
  onMessage: (e: any) => void;
}) {
  const html = useMemo(
    () =>
      generateMushafHTML(
        page,
        bundle.words,
        nightMode,
        fontSize,
        bgColor,
        textColor,
        getSajdasForPage(page),
        bundle.fontUri,
      ),
    [page, bundle, nightMode, fontSize, bgColor, textColor],
  );
  // Memoized separately from html so the source object's IDENTITY is stable
  // across re-renders that don't change html (e.g. a transient-badge setState
  // during a swipe). WebView re-navigates whenever source is a NEW object —
  // even with byte-identical html — so passing a freshly-built { html }
  // object inline on every render would reload the page mid-swipe.
  const source = useMemo(() => ({ html }), [html]);
  return (
    <WebView
      source={source}
      style={{ flex: 1, backgroundColor: bgColor, margin: 0, padding: 0 }}
      scrollEnabled={false}
      onMessage={onMessage}
      javaScriptEnabled={true}
      originWhitelist={["*"]}
      allowsInlineMediaPlayback={true}
      mixedContentMode="always"
      scalesPageToFit={true}
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
    />
  );
}

// ---- Per-page data + font caching ----------------------------------------
// expo-file-system/legacy, matching this repo's existing usage (hooks/use-updates.ts).
const PAGE_CACHE_DIR = `${FileSystem.cacheDirectory ?? ""}quran-pages/`;
const FONT_CACHE_DIR = `${FileSystem.cacheDirectory ?? ""}quran-fonts/`;

async function ensureDirExists(dir: string) {
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  } catch {
    // best-effort — a failed mkdir just means the next write also fails and
    // falls back to network-only behavior
  }
}

function parseByPageVerses(verses: any[]): { words: PageWord[]; ayahs: PageAyah[] } {
  const words: PageWord[] = [];
  const ayahs: PageAyah[] = [];
  for (const v of verses) {
    const parts = v.verse_key.split(":");
    const surahNum = parseInt(parts[0]);
    const ayahNum = parseInt(parts[1]);
    const surah = SURAH_LIST.find((s) => s.number === surahNum);

    ayahs.push({
      number: v.id || 0,
      numberInSurah: ayahNum,
      text:
        v.text_uthmani ||
        v.words?.map((w: any) => w.text_uthmani || "").join(" ") ||
        "",
      surahNumber: surahNum,
      surahName: surah?.name || "",
    });

    for (const w of v.words || []) {
      words.push({
        code_v1: w.code_v1 || "",
        text_uthmani: w.text_uthmani || "",
        line_number: w.line_number || 0,
        char_type_name: w.char_type_name || "word",
        verse_key: v.verse_key,
      });
    }
  }
  return { words, ayahs };
}

// fetch + parse JSON under ONE abort timeout so a stalled connection rejects
// instead of hanging forever. Crucially the timer also covers res.json(): RN's
// Android client has no read timeout, so a stall AFTER the headers arrive (during
// the body read) would hang just as badly — and a hung page load sits on the
// spinner permanently (it never reaches failedPages and the in-flight guard
// blocks a re-fetch). Aborting the controller rejects the in-progress body read
// too; the caller's catch turns any reject/abort into the normal fallback path.
async function fetchJsonWithTimeout(url: string, ms = 15000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Cache-or-fetch one page's word/ayah data. Same quran.com shape + the same
 * alquran.cloud fallback as before Phase 1 — only the on-device cache check
 * (read-through) and cache write (fire-and-forget, non-blocking) are new. */
async function loadPageWordsAndAyahs(
  page: number,
): Promise<{ words: PageWord[]; ayahs: PageAyah[] }> {
  const cachePath = FileSystem.cacheDirectory ? `${PAGE_CACHE_DIR}p${page}.json` : null;
  if (cachePath) {
    try {
      const info = await FileSystem.getInfoAsync(cachePath);
      if (info.exists) {
        const text = await FileSystem.readAsStringAsync(cachePath);
        // ponytail: KNOWN LIMITATION (deferred) — if the text cached but the font
        // didn't (background download failed, or the OS evicted the font), this
        // page renders QCF via the CDN font: correct online (the common case),
        // but PUA boxes offline. A render-time plain-text fallback (detect the
        // QCF @font-face failing in the WebView and swap to text_uthmani) is the
        // proper fix, as is image-based pages — both are a reviewed follow-up,
        // not a blind patch (an earlier "always downgrade to plain text" tried
        // here instead degraded the common online case to plain text). Offline
        // viewing of a specifically-font-missing page is rare and won't bite a
        // normal (online) session.
        return parseByPageVerses(JSON.parse(text));
      }
    } catch {
      // corrupt/unreadable cache entry — fall through to network
    }
  }
  try {
    const data = await fetchJsonWithTimeout(
      `${API_BASE}/verses/by_page/${page}?words=true&word_fields=code_v1,text_uthmani,line_number&per_page=50`,
    );
    // length > 0, not just truthy: an empty `verses: []` would otherwise be
    // written to disk and then read back forever as an empty (failed) page, which
    // no retry could escape — it would keep reading the poisoned cache file.
    if (Array.isArray(data.verses) && data.verses.length > 0) {
      if (cachePath) {
        ensureDirExists(PAGE_CACHE_DIR)
          .then(() => FileSystem.writeAsStringAsync(cachePath, JSON.stringify(data.verses)))
          .catch(() => {});
      }
      return parseByPageVerses(data.verses);
    }
  } catch {
    // fall through to the alquran.cloud fallback below
  }
  try {
    const data2 = await fetchJsonWithTimeout(`https://api.alquran.cloud/v1/page/${page}/quran-uthmani`);
    if (data2.code === 200) {
      const ayahs: PageAyah[] = data2.data.ayahs.map((a: any) => ({
        number: a.number,
        numberInSurah: a.numberInSurah,
        text: a.text,
        surahNumber: a.surah.number,
        surahName: a.surah.name,
      }));
      return { words: [], ayahs };
    }
  } catch {
    // ignore — caller gets the empty-page fallback below
  }
  return { words: [], ayahs: [] };
}

/** Read-only cache check — never downloads. Keeps a currently-mounted page's
 * HTML from changing out from under the reader (which would reload/flash the
 * WebView); a cold miss is warmed in the background for the NEXT visit via
 * warmFontCache instead. */
async function getCachedFontUri(page: number): Promise<string | undefined> {
  if (!FileSystem.cacheDirectory) return undefined;
  try {
    const path = `${FONT_CACHE_DIR}p${page}.woff2`;
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return undefined;
    const base64 = await FileSystem.readAsStringAsync(path, { encoding: "base64" });
    return `data:font/woff2;base64,${base64}`;
  } catch {
    return undefined;
  }
}

/** Fire-and-forget: download this page's QCF font to disk for next time.
 * Never touches React state, so it cannot reload a page the user is reading.
 * ATOMIC + VALIDATED: downloads to a unique temp file and only moves it into
 * place on a clean 200 whose first bytes are the woff2 magic ("wOF2"). This
 * guards against BOTH a truncated download AND a wrong 200 — e.g. a captive
 * portal / Wi-Fi login page served as HTML, which would otherwise be cached as
 * p{page}.woff2 and, since getCachedFontUri only checks existence, make the QCF
 * @font-face silently fail and render the Qur'an as tofu/garbled boxes forever. */
function warmFontCache(page: number) {
  if (!FileSystem.cacheDirectory) return;
  const path = `${FONT_CACHE_DIR}p${page}.woff2`;
  const tmp = `${path}.${Math.random().toString(36).slice(2)}.tmp`;
  ensureDirExists(FONT_CACHE_DIR)
    .then(() => FileSystem.getInfoAsync(path))
    .then(async (info) => {
      if (info.exists) return;
      const res = await FileSystem.downloadAsync(`${FONT_CDN}/p${page}.woff2`, tmp);
      // woff2 magic number is "wOF2" (0x774F4632); its base64 is "d09GMg...".
      let isWoff2 = false;
      if (res.status === 200) {
        try {
          const head = await FileSystem.readAsStringAsync(tmp, {
            encoding: "base64",
            position: 0,
            length: 4,
          });
          isWoff2 = head.startsWith("d09GMg");
        } catch {
          isWoff2 = false;
        }
      }
      if (isWoff2) await FileSystem.moveAsync({ from: tmp, to: path });
      else await FileSystem.deleteAsync(tmp, { idempotent: true });
    })
    .catch(() => {
      FileSystem.deleteAsync(tmp, { idempotent: true }).catch(() => {});
    });
}

/** Single entry point the component calls per window page: cached data if
 * present, else network (+ store); cached font if present, else the plain CDN
 * URL for this view while a copy downloads in the background for next time. */
async function loadMushafPage(
  page: number,
): Promise<{ words: PageWord[]; ayahs: PageAyah[]; fontUri?: string }> {
  const [{ words, ayahs }, fontUri] = await Promise.all([
    loadPageWordsAndAyahs(page),
    getCachedFontUri(page),
  ]);
  if (!fontUri) warmFontCache(page);
  return { words, ayahs, fontUri };
}

export default function QuranScreen() {
  const { language, isRTL, dig } = useI18n();
  const lang = language as Lang;
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { width: screenW } = useWindowDimensions();
  // The list's OWN measured width (FlatList onLayout below) drives page geometry,
  // not the window width — the two can differ (Android landscape edge-to-edge
  // under the nav bar), which would drift pagingEnabled's snap out of step with
  // getItemLayout and pick the wrong page. Seeded with screenW so the first paint
  // and initial scroll have a sane width before onLayout measures; onLayout
  // corrects it and re-fires on rotation (which drives the re-scroll effect).
  const [listWidth, setListWidth] = useState(screenW);

  // State
  const [currentPage, setCurrentPage] = useState(1);
  // Per-page word/ayah/font data, keyed by page number — populated lazily as
  // the reader nears each page (see the prefetch effect). Replaces the old single
  // pageWords/pageAyahs/loading state, which only ever held the current page.
  const [pageCache, setPageCache] = useState<
    Record<number, { words: PageWord[]; ayahs: PageAyah[]; fontUri?: string }>
  >({});
  // Pages where both the QCF and alquran.cloud fallback failed (offline,
  // etc.) — never cached (see the load effect below), so renderPageSlot shows
  // a retry button for these instead of an endless spinner.
  const [failedPages, setFailedPages] = useState<Set<number>>(new Set());
  // Pages with a loadPage() call currently in flight — guards a second tap
  // (or the preload effect re-firing for the same page) from stacking another
  // request, and swaps the retry button for a spinner while it's pending.
  const [retryingPages, setRetryingPages] = useState<Set<number>>(new Set());
  // Transient section badge (option ب): the page whose juz/hizb/sajda to show
  // while swiping between pages; null = hidden. Driven by the FlatList onScroll,
  // faded out after the page settles.
  const [transientPage, setTransientPage] = useState<number | null>(null);
  const transientOpacity = useRef(new RNAnimated.Value(0)).current;
  const transientHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Only a real finger-swipe shows the badge (not a programmatic juz-jump /
  // restore / rotation scroll, which fire onScroll but not onScrollBeginDrag).
  const userDraggingRef = useRef(false);
  const transientShownForRef = useRef<number | null>(null); // last page set → avoid per-frame setState
  const lastOffsetXRef = useRef(0); // latest FlatList scroll offset, read by the drag-end/momentum-end settle
  const endDragTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); // onScrollEndDrag fallback for a no-momentum release; cancelled by onMomentumScrollBegin if momentum does follow
  // Safety net: on Android a tap that stops a fling (tap-to-stop) can emit NEITHER
  // onScrollEndDrag NOR onMomentumScrollEnd, leaving userDraggingRef stuck true
  // (badge never fades, currentPage never commits, auto-turn stalls). Armed on
  // drag start, cleared by settlePaging; if nothing settles within the timeout it
  // force-settles from the last known offset.
  const settleWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flatListRef = useRef<FlatList<number>>(null);
  // Pages whose load is in flight — a SYNCHRONOUS in-flight guard. (retryingPages
  // state can't guard control flow: React only runs a state updater eagerly when
  // the fiber has no pending lanes, so a loop calling loadPage 5x would fetch only
  // the first and leave the rest stuck.) retryingPages mirrors this for the spinner.
  const inFlightRef = useRef<Set<number>>(new Set());
  // Last load-attempt time per page (ms), so the degraded re-attempt can back off
  // (see the nav effect) instead of re-fetching every swipe during an outage.
  const lastAttemptRef = useRef<Map<number, number>>(new Map());
  // Latest currentPage, for the rotation re-scroll effect to read without
  // re-subscribing (depending on currentPage there would re-scroll every swipe).
  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;
  // RTL_PAGING is a module constant, so empty deps are fine here.
  const PAGES = useMemo(() => Array.from({ length: TOTAL_PAGES }, (_, i) => indexToPage(i)), []);
  const [showIndex, setShowIndex] = useState(false);
  const [indexTab, setIndexTab] = useState<"surah" | "juz">("surah");
  const [showSettings, setShowSettings] = useState(false);
  const [showToolbar, setShowToolbar] = useState(true);
  const [fontSize, setFontSize] = useState(28);
  const [theme, setTheme] = useState<MushafTheme>("white");
  // Derived, not state — keeps all existing `nightMode ? ... : ...` reads below working.
  const nightMode = MUSHAF_THEMES[theme].dark;
  const [keepAwake, setKeepAwake] = useState(false);
  const [autoTurn, setAutoTurn] = useState(false);
  const [autoTurnSec, setAutoTurnSec] = useState(30);

  // Long press modal state
  const [showScienceModal, setShowScienceModal] = useState(false);
  const [selectedAyah, setSelectedAyah] = useState<PageAyah | null>(null);
  const [scienceTab, setScienceTab] = useState<"tafsir" | "hidayat" | "surah">(
    "tafsir",
  );
  const [tafsirSource, setTafsirSource] = useState<"saadi" | "kathir">("saadi");
  const [scienceContent, setScienceContent] = useState("");
  const [scienceLoading, setScienceLoading] = useState(false);

  // Every PROGRAMMATIC page move (index/juz tap, or the AsyncStorage restore
  // below) goes through here: it sets currentPage and scrolls the FlatList to
  // match. getItemLayout (below) makes scrollToIndex safe for any index, so no
  // onScrollToIndexFailed handling is needed.
  const jumpToPage = useCallback((page: number) => {
    const clamped = Math.min(TOTAL_PAGES, Math.max(1, page));
    setCurrentPage(clamped);
    flatListRef.current?.scrollToIndex({ index: pageToIndex(clamped), animated: false });
  }, []);

  // True once the mount-restore below has resolved (found a saved page or
  // not) — "save current page" must not run before this, or its initial
  // setItem("1") (currentPage's default) can race ahead of the restore's own
  // getItem and the reader always reopens at page 1 instead of where they
  // left off.
  const restoredRef = useRef(false);

  // Load saved page on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((val) => {
        if (val) {
          const p = parseInt(val, 10);
          if (p >= 1 && p <= TOTAL_PAGES) jumpToPage(p);
        }
      })
      .catch(() => {}) // swallow a rejected read (no unhandled rejection)
      // .finally so a REJECTED read still lifts the gate — otherwise the save
      // effect would return early for the rest of the session and never persist
      // the reading position. The race protection only needs the flag set once
      // the restore attempt has settled, either way.
      .finally(() => {
        restoredRef.current = true;
      });
  }, [jumpToPage]);

  // Save current page
  useEffect(() => {
    if (!restoredRef.current) return;
    AsyncStorage.setItem(STORAGE_KEY, String(currentPage)).catch(() => {}); // ignore storage failure
  }, [currentPage]);

  // `concepts` is a Tabs.Screen — it blurs (not unmounts) when the user switches
  // tabs, so keep-awake and auto-turn must be gated on FOCUS, not just the setting,
  // or they'd keep running app-wide / advancing pages off-screen.
  const isFocused = useIsFocused();

  // Keep the screen from sleeping while reading: when the keep-awake setting is on,
  // OR auto-turn is on (hands-free reading is pointless if the screen sleeps) — but
  // only while the mushaf is focused. Deactivates on blur/unmount.
  useEffect(() => {
    if ((keepAwake || autoTurn) && isFocused) {
      activateKeepAwakeAsync("mushaf").catch(() => {});
    } else {
      deactivateKeepAwake("mushaf").catch(() => {});
    }
    return () => {
      deactivateKeepAwake("mushaf").catch(() => {});
    };
  }, [keepAwake, autoTurn, isFocused]);

  // Auto page-turn: advances one page every autoTurnSec seconds via the same
  // programmatic jump the surah/juz index uses. Only while the mushaf is FOCUSED
  // (never advance pages on another tab). `currentPage` is in the deps so the
  // countdown RESTARTS on every page change — a manual swipe pushes the next
  // auto-advance a full interval away. A tick is skipped (not cancelled) while the
  // user is mid-drag or a modal is open, so it never fights a gesture or flips
  // pages behind a sheet. jumpToPage clamps, so it stops at the last page.
  useEffect(() => {
    if (!autoTurn || !isFocused) return;
    const id = setInterval(() => {
      // Skip a tick (don't stop) while the reader is interacting or a modal is open.
      if (userDraggingRef.current || showSettings || showIndex || showScienceModal) return;
      // Reached the end: STOP auto-turn (so keep-awake is released too, not left on).
      if (currentPageRef.current >= TOTAL_PAGES) {
        setAutoTurn(false);
        return;
      }
      jumpToPage(currentPageRef.current + 1);
    }, autoTurnSec * 1000);
    return () => clearInterval(id);
  }, [autoTurn, isFocused, autoTurnSec, currentPage, jumpToPage, showSettings, showIndex, showScienceModal]);

  // Settings persistence: same restoredRef-gated load/save shape as the page
  // position above, so the initial save effect doesn't clobber a not-yet-loaded
  // saved setting.
  const settingsLoadedRef = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(SETTINGS_KEY)
      .then((val) => {
        if (!val) return;
        try {
          const saved = JSON.parse(val);
          if (saved.theme in MUSHAF_THEMES) setTheme(saved.theme);
          if (typeof saved.fontSize === "number") setFontSize(saved.fontSize);
          if (typeof saved.keepAwake === "boolean") setKeepAwake(saved.keepAwake);
          // autoTurn (the ON state) is intentionally NOT persisted: silently
          // resuming hands-free paging on a later visit would drift the saved
          // bookmark forward with no visible cue. Only the interval is remembered.
          if (typeof saved.autoTurnSec === "number") setAutoTurnSec(saved.autoTurnSec);
        } catch {
          // corrupt settings blob — ignore, defaults stand
        }
      })
      .catch(() => {}) // swallow a rejected read (no unhandled rejection)
      .finally(() => {
        settingsLoadedRef.current = true;
      });
  }, []);

  useEffect(() => {
    if (!settingsLoadedRef.current) return;
    AsyncStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ theme, fontSize, keepAwake, autoTurnSec }),
    ).catch(() => {}); // storage full/quota — ignore (no unhandled rejection)
  }, [theme, fontSize, keepAwake, autoTurnSec]);

  // Load one page (cache-or-network). In-flight de-dupe uses inFlightRef — a
  // synchronous guard, because a state updater's side effect can't drive control
  // flow (React runs it eagerly only when the fiber has no pending lanes, so the
  // preload loop would fetch only its first page). retryingPages is updated purely
  // to drive the slot spinner. A load with content is cached and clears
  // failedPages; a total failure (both empty) goes to failedPages so the preload
  // effect leaves it alone — only the retry button (or navigating back) re-attempts
  // it. A plain-text fallback (words:[], ayahs filled — quran.com was down) is
  // cached so the page renders, but it does NOT overwrite an existing QCF entry,
  // and a later QCF load DOES overwrite it: the nav effect re-attempts such
  // degraded pages so a transient failure upgrades to the real mushaf layout.
  // Written even if the component moved on, so a completed fetch is never wasted.
  const loadPage = useCallback((p: number) => {
    if (inFlightRef.current.has(p)) return; // already in flight
    inFlightRef.current.add(p);
    lastAttemptRef.current.set(p, Date.now());
    setRetryingPages((prev) => (prev.has(p) ? prev : new Set(prev).add(p)));
    loadMushafPage(p).then((bundle) => {
      inFlightRef.current.delete(p);
      setRetryingPages((prev) => {
        if (!prev.has(p)) return prev;
        const next = new Set(prev); next.delete(p); return next;
      });
      if (bundle.words.length > 0 || bundle.ayahs.length > 0) {
        // Keep an existing QCF entry; overwrite an absent or degraded (words:[])
        // one — so a QCF re-fetch upgrades a cached plain-text fallback.
        setPageCache((prev) =>
          prev[p] && prev[p].words.length > 0 ? prev : { ...prev, [p]: bundle },
        );
        setFailedPages((prev) => {
          if (!prev.has(p)) return prev;
          const next = new Set(prev); next.delete(p); return next;
        });
      } else {
        setFailedPages((prev) => (prev.has(p) ? prev : new Set(prev).add(p)));
      }
    });
  }, []);

  // On navigation, give in-range pages that aren't fully loaded one more chance
  // (the connection may have returned): clear failures so the preload effect
  // reloads them, and re-attempt degraded pages (a cached plain-text fallback,
  // words:[]) so they upgrade to the QCF mushaf layout. Tied to the discrete
  // currentPage change, not to a load result, so it can't loop: a re-fail goes
  // back to failedPages and a still-degraded result stays cached (rendering),
  // and neither re-triggers this effect. Degraded re-attempts are rate-limited
  // (DEGRADED_RETRY_COOLDOWN_MS) so a sustained quran.com outage doesn't make
  // every swipe fire a burst of doomed re-fetches.
  useEffect(() => {
    setFailedPages((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Set(prev);
      for (let p = currentPage - PRELOAD_RADIUS; p <= currentPage + PRELOAD_RADIUS; p++) {
        if (next.delete(p)) changed = true;
      }
      return changed ? next : prev;
    });
    const now = Date.now();
    for (let p = currentPage - PRELOAD_RADIUS; p <= currentPage + PRELOAD_RADIUS; p++) {
      if (p < 1 || p > TOTAL_PAGES) continue;
      const cached = pageCache[p];
      const lastTry = lastAttemptRef.current.get(p) ?? 0;
      if (cached && cached.words.length === 0 && now - lastTry > DEGRADED_RETRY_COOLDOWN_MS) {
        loadPage(p); // degraded → try to upgrade to QCF (rate-limited)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  // Prefetch the current page + neighbours. Skips pages already cached, failed,
  // or in flight (inFlightRef — synchronous) — a failed page is NOT auto-retried
  // here (that was the endless-refetch loop); the effect above clears failures on
  // navigation and the retry button clears one on tap. Re-runs as loads resolve
  // (pageCache/failedPages change), but every path hits a skip → no loop.
  useEffect(() => {
    for (let p = currentPage - PRELOAD_RADIUS; p <= currentPage + PRELOAD_RADIUS; p++) {
      if (p < 1 || p > TOTAL_PAGES) continue;
      if (pageCache[p] || failedPages.has(p) || inFlightRef.current.has(p)) continue;
      loadPage(p);
    }
  }, [currentPage, pageCache, failedPages, loadPage]);

  useEffect(() => {
    setPageCache((prev) => {
      let changed = false;
      const next: typeof prev = {};
      for (const key in prev) {
        const p = Number(key);
        if (Math.abs(p - currentPage) <= CACHE_KEEP_RADIUS) next[p] = prev[p];
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [currentPage]);

  // Keep the right page under the viewport when the list's width changes
  // (rotation): getItemLayout/onMomentumScrollEnd use listWidth, but the scroll
  // offset doesn't move on its own, so without this a rotation lands on a
  // different page. Keyed on listWidth (set by onLayout after the re-measure) and
  // reads currentPage via a ref so it fires ONLY on width change — a currentPage
  // dep would re-scroll on every page turn and fight the native swipe.
  useEffect(() => {
    flatListRef.current?.scrollToIndex({
      index: pageToIndex(currentPageRef.current),
      animated: false,
    });
  }, [listWidth]);

  // Clear the transient-badge fade timer and the drag-end settle fallback on
  // unmount (no setState after unmount).
  useEffect(() => () => {
    if (transientHideTimer.current) clearTimeout(transientHideTimer.current);
    if (endDragTimerRef.current) clearTimeout(endDragTimerRef.current);
    if (settleWatchdogRef.current) clearTimeout(settleWatchdogRef.current);
  }, []);

  // Handle WebView messages. Page-turning is no longer detected here — the
  // FlatList strip owns the swipe gesture now — so each slot just
  // reports taps/longpresses against its OWN ayahs list.
  const handleWebViewMessage = (event: any, ayahs: PageAyah[]) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === "longpress" && msg.verseKey) {
        const parts = msg.verseKey.split(":");
        const surahNum = parseInt(parts[0]);
        const ayahNum = parseInt(parts[1]);
        const ayah = ayahs.find(
          (a) => a.surahNumber === surahNum && a.numberInSurah === ayahNum,
        );
        if (ayah) {
          handleAyahLongPress(ayah);
        }
      } else if (msg.type === "tap") {
        setShowToolbar(!showToolbar);
      }
    } catch {}
  };

  // Long press on ayah
  const handleAyahLongPress = (ayah: PageAyah) => {
    setSelectedAyah(ayah);
    setScienceTab("tafsir");
    setScienceContent("");
    setShowScienceModal(true);
    fetchTafsir(ayah, "saadi");
  };

  // Fetch tafsir
  const fetchTafsir = async (ayah: PageAyah, source: "saadi" | "kathir") => {
    setScienceLoading(true);
    setScienceContent("");
    setTafsirSource(source);
    setScienceTab("tafsir");
    try {
      const tafsirId = source === "saadi" ? 91 : 14;
      const verseKey = `${ayah.surahNumber}:${ayah.numberInSurah}`;
      const res = await fetch(
        `https://api.quran.com/api/v4/tafsirs/${tafsirId}/by_ayah/${verseKey}`,
      );
      const data = await res.json();
      let text = data?.tafsir?.text || "";
      text = text
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/g, " ")
        .trim();
      setScienceContent(
        text ||
          tx(
            lang,
            "Geen tafsir beschikbaar",
            "No tafsir available",
            "لا يوجد تفسير متاح",
          ),
      );
    } catch {
      setScienceContent(
        tx(lang, "Fout bij laden", "Error loading", "خطأ في التحميل"),
      );
    } finally {
      setScienceLoading(false);
    }
  };

  // Fetch hidayat via server LLM with timeout
  const fetchHidayat = async (ayah: PageAyah) => {
    setScienceLoading(true);
    setScienceContent("");
    setScienceTab("hidayat");
    try {
      const verseKey = `${ayah.surahNumber}:${ayah.numberInSurah}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout
      const res = await authedFetch(`/api/quran/hidayat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verseKey, text: ayah.text, language: lang }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = await res.json();
      setScienceContent(
        data?.hidayat ||
          tx(
            lang,
            "Geen hidaayaat beschikbaar",
            "No guidance available",
            "لا توجد هدايات متاحة",
          ),
      );
    } catch (err: any) {
      if (err?.name === "AbortError") {
        setScienceContent(
          tx(
            lang,
            "Timeout - probeer opnieuw",
            "Timeout - try again",
            "انتهت المهلة - حاول مرة أخرى",
          ),
        );
      } else {
        setScienceContent(
          tx(lang, "Fout bij laden", "Error loading", "خطأ في التحميل"),
        );
      }
    } finally {
      setScienceLoading(false);
    }
  };

  // Fetch surah info
  const fetchSurahInfo = async (surahNum: number) => {
    setScienceLoading(true);
    setScienceContent("");
    setScienceTab("surah");
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);
      const res = await authedFetch(`/api/quran/surah-info`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ surahNumber: surahNum, language: lang }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = await res.json();
      setScienceContent(
        data?.info ||
          tx(
            lang,
            "Geen informatie beschikbaar",
            "No info available",
            "لا توجد معلومات متاحة",
          ),
      );
    } catch (err: any) {
      if (err?.name === "AbortError") {
        setScienceContent(
          tx(
            lang,
            "Timeout - probeer opnieuw",
            "Timeout - try again",
            "انتهت المهلة - حاول مرة أخرى",
          ),
        );
      } else {
        setScienceContent(
          tx(lang, "Fout bij laden", "Error loading", "خطأ في التحميل"),
        );
      }
    } finally {
      setScienceLoading(false);
    }
  };

  const currentSurah = getSurahForPage(currentPage);
  // Shared by onScrollEndDrag's no-momentum fallback and onMomentumScrollEnd:
  // resolves the page the list settled on and fades the transient badge out.
  // The `finished` guard matters — a new swipe starting during the fade calls
  // transientOpacity.setValue(1), which cancels this .timing() and fires the
  // callback with finished:false; without the guard that would hide the badge
  // the new swipe just re-showed.
  const settlePaging = (offsetX: number) => {
    userDraggingRef.current = false;
    if (settleWatchdogRef.current) {
      clearTimeout(settleWatchdogRef.current);
      settleWatchdogRef.current = null;
    }
    const page = indexToPage(Math.round(offsetX / listWidth));
    if (page >= 1 && page <= TOTAL_PAGES) {
      if (page !== currentPage) setCurrentPage(page);
      // Authoritative correction: make the badge show the actually-settled page
      // before it fades (onScroll's last sample can be a hair off at rest). Only
      // when the badge is currently showing (a user swipe just happened).
      if (transientShownForRef.current !== null && transientShownForRef.current !== page) {
        transientShownForRef.current = page;
        setTransientPage(page);
      }
    }
    if (transientHideTimer.current) clearTimeout(transientHideTimer.current);
    transientHideTimer.current = setTimeout(() => {
      RNAnimated.timing(transientOpacity, { toValue: 0, duration: 400, useNativeDriver: false })
        .start(({ finished }) => {
          if (!finished) return;
          setTransientPage(null);
          transientShownForRef.current = null;
        });
    }, 500);
  };

  // Section markers (juz · eighth, hizb/rub', sajda) are NOT pinned at the top
  // (Daa3iyah's call): they surface in a transient badge DURING the page-turn —
  // see the FlatList onScroll + the transient badge overlay below. This helper
  // computes the label for whichever page is most in view during the swipe.
  const sectionLabelForPage = (page: number) => {
    const rubMarks = getRubMarksForPage(page);
    const rub = rubMarks[0]; // ≤1 rub' starts per page (RUB_STARTS has no dup pages)
    // If a rub' begins on this page, juz+eighth come from it (so they agree with
    // the ۞ label and the juz index's jump target); otherwise the top-of-page
    // values. The page's first verse may still be the previous juz (Madinah
    // top-of-page), but the boundary starting here is the significant event.
    const juz = rub ? rub.juz : getJuzForPage(page);
    const eighth = rub ? rub.eighthOfJuz : getEighthOfJuzForPage(page);
    const sajda = getSajdasForPage(page).length > 0;
    let rubLabel: string | null = null;
    if (rub) {
      const n = dig(rub.hizb);
      // Every 4th rub' is a HIZB start; (rub-1)%4 → 0 start/1 quarter/2 half/3 three-quarters.
      switch ((rub.rub - 1) % 4) {
        case 0: rubLabel = tx(lang, `Hizb ${n}`, `Hizb ${n}`, `الحزب ${n}`); break;
        case 1: rubLabel = tx(lang, `Kwart hizb ${n}`, `Quarter of Hizb ${n}`, `ربع الحزب ${n}`); break;
        case 2: rubLabel = tx(lang, `Helft hizb ${n}`, `Half of Hizb ${n}`, `نصف الحزب ${n}`); break;
        default: rubLabel = tx(lang, `Driekwart hizb ${n}`, `Three-quarters of Hizb ${n}`, `ثلاثة أرباع الحزب ${n}`); break;
      }
    }
    return { juz, eighth, rubLabel, sajda };
  };
  const bgColor = MUSHAF_THEMES[theme].bg;
  const textColor = MUSHAF_THEMES[theme].text;
  const headerBg = nightMode ? "#0F0F1F" : "#1B4332";

  // Render ONE list item: a page not yet loaded shows a loading spinner, a page
  // that truly failed shows a retry button, a loaded page with CDN words renders
  // the QCF mushaf via WebView (juz/hizb/sajda markers now appear in the
  // transient page-turn badge, not the header, not in-page), and a loaded page
  // with no word data falls back to plain text. Every branch
  // returns a single plain View sized to the list's measured width (width:
  // listWidth, height: '100%') — FlatList's horizontal pagingEnabled snapping
  // requires each item to measure exactly the list's own width.
  const renderPageSlot = (page: number) => {
    const bundle = pageCache[page];

    if (!bundle) {
      if (failedPages.has(page)) {
        return (
          <View style={{ width: listWidth, height: "100%" }}>
            <View style={[st.loadingContainer, { backgroundColor: bgColor }]}>
              <Text style={{ color: textColor, fontSize: 14, textAlign: "center" }}>
                {tx(lang, "Laden mislukt", "Failed to load", "تعذر تحميل الصفحة")}
              </Text>
              {retryingPages.has(page) ? (
                <ActivityIndicator
                  style={{ marginTop: 12 }}
                  color={nightMode ? "#C4A35A" : "#1B4332"}
                />
              ) : (
                <Pressable
                  onPress={() => loadPage(page)}
                  style={({ pressed }) => [
                    { marginTop: 12, backgroundColor: headerBg, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "600" }}>
                    {tx(lang, "Opnieuw proberen", "Retry", "إعادة المحاولة")}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        );
      }
      return (
        <View style={{ width: listWidth, height: "100%" }}>
          <View style={[st.loadingContainer, { backgroundColor: bgColor }]}>
            <ActivityIndicator
              size="large"
              color={nightMode ? "#C4A35A" : "#1B4332"}
            />
            <Text style={{ color: textColor, marginTop: 12, fontSize: 14 }}>
              {tx(
                lang,
                "Pagina laden...",
                "Loading page...",
                "جاري تحميل الصفحة...",
              )}
            </Text>
          </View>
        </View>
      );
    }

    // If we have CDN font words, use WebView for high-quality rendering
    if (bundle.words.length > 0) {
      return (
        <View style={{ width: listWidth, height: "100%" }}>
          <MushafPageView
            page={page}
            bundle={bundle}
            nightMode={nightMode}
            fontSize={fontSize}
            bgColor={bgColor}
            textColor={textColor}
            onMessage={(e) => handleWebViewMessage(e, bundle.ayahs)}
          />
        </View>
      );
    }

    // Fallback: render with text (when API fails)
    return (
      <View style={{ width: listWidth, height: "100%" }}>
        <ScrollView
          style={{ flex: 1, backgroundColor: bgColor }}
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingVertical: 16,
            paddingBottom: insets.bottom + 20,
          }}
        >
          <View
            style={[
              st.pageFrame,
              { borderColor: nightMode ? "#C4A35A30" : "#D4AF3720" },
            ]}
          >
            {bundle.ayahs.map((ayah) => (
              <Pressable
                key={ayah.number}
                onLongPress={() => handleAyahLongPress(ayah)}
              >
                <Text
                  style={[
                    st.mushafText,
                    { color: textColor, fontSize, lineHeight: fontSize * 2.2 },
                  ]}
                >
                  {ayah.text} {"\u06DD"}
                  {String(ayah.numberInSurah)}{" "}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>
    );
  };

  // Render index modal
  const renderIndex = () => (
    <Modal visible={showIndex} animationType="slide" transparent={false}
      supportedOrientations={["portrait", "portrait-upside-down", "landscape"]}>
      <View
        style={[
          st.modalContainer,
          { paddingTop: insets.top, backgroundColor: bgColor },
        ]}
      >
        <View style={[st.modalHeader, { backgroundColor: headerBg, flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <Text style={st.modalHeaderTitle}>
            {tx(lang, "Inhoudsopgave", "Index", "فهرس السور")}
          </Text>
          <Pressable
            onPress={() => setShowIndex(false)}
            style={({ pressed }) => [st.closeBtn, pressed && { opacity: 0.6 }]}
          >
            <MaterialIcons name="close" size={24} color="#FFFFFF" />
          </Pressable>
        </View>
        <View
          style={[
            st.scienceTabsRow,
            { flexDirection: isRTL ? "row-reverse" : "row" },
            { borderBottomColor: nightMode ? "#333" : "#E8EDE9" },
          ]}
        >
          {(["surah", "juz"] as const).map((tab) => (
            <Pressable
              key={tab}
              onPress={() => setIndexTab(tab)}
              style={[st.scienceTabItem, indexTab === tab && st.scienceTabItemActive]}
            >
              <Text
                style={[
                  st.scienceTabItemText,
                  indexTab === tab && st.scienceTabItemTextActive,
                  {
                    color: indexTab === tab ? "#1B4332" : nightMode ? "#888" : "#6B7B72",
                  },
                ]}
              >
                {tab === "surah"
                  ? tx(lang, "Soera's", "Surahs", "السور")
                  : tx(lang, "Juz'", "Juz", "الأجزاء")}
              </Text>
            </Pressable>
          ))}
        </View>
        {indexTab === "surah" ? (
        <FlatList
          data={SURAH_LIST}
          keyExtractor={(item) => String(item.number)}
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                jumpToPage(item.startPage);
                setShowIndex(false);
              }}
              onLongPress={() => {
                setSelectedAyah({
                  number: 0,
                  numberInSurah: 1,
                  text: "",
                  surahNumber: item.number,
                  surahName: item.name,
                });
                setShowScienceModal(true);
                fetchSurahInfo(item.number);
              }}
              style={({ pressed }) => [
                st.indexItem,
                { flexDirection: isRTL ? "row-reverse" : "row" },
                pressed && {
                  backgroundColor: nightMode ? "#2A2A4A" : "#F0F7F4",
                },
              ]}
            >
              <View
                style={[
                  st.indexNumber,
                  { backgroundColor: nightMode ? "#2A2A4A" : "#E8F5EC" },
                ]}
              >
                <Text
                  style={[
                    st.indexNumberText,
                    { color: nightMode ? "#C4A35A" : "#1B4332" },
                  ]}
                >
                  {item.number}
                </Text>
              </View>
              <View style={{ flex: 1, marginHorizontal: 12 }}>
                <Text style={[st.indexName, { color: textColor }]}>
                  {item.name}
                </Text>
                <Text
                  style={[
                    st.indexNameEn,
                    { color: nightMode ? "#888" : "#6B7B72" },
                  ]}
                >
                  {item.englishName}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text
                  style={[
                    st.indexPage,
                    { color: nightMode ? "#888" : "#6B7B72" },
                  ]}
                >
                  {tx(lang, "p.", "p.", "ص.")} {item.startPage}
                </Text>
                <Text
                  style={[
                    st.indexMeta,
                    { color: nightMode ? "#666" : "#9BA6A0" },
                  ]}
                >
                  {item.revelationType === "Meccan"
                    ? tx(lang, "Mekk.", "Mec.", "مكية")
                    : tx(lang, "Med.", "Med.", "مدنية")}
                  {" \u2022 "}
                  {item.numberOfAyahs} {tx(lang, "v.", "v.", "آ.")}
                </Text>
              </View>
            </Pressable>
          )}
        />
        ) : (
          <FlatList
            data={JUZ_NUMBERS}
            keyExtractor={(item) => String(item)}
            contentContainerStyle={{ paddingBottom: 40 }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  jumpToPage(getJuzStartPage(item));
                  setShowIndex(false);
                }}
                style={({ pressed }) => [
                  st.indexItem,
                  { flexDirection: isRTL ? "row-reverse" : "row" },
                  pressed && {
                    backgroundColor: nightMode ? "#2A2A4A" : "#F0F7F4",
                  },
                ]}
              >
                <View
                  style={[
                    st.indexNumber,
                    { backgroundColor: nightMode ? "#2A2A4A" : "#E8F5EC" },
                  ]}
                >
                  <Text
                    style={[
                      st.indexNumberText,
                      { color: nightMode ? "#C4A35A" : "#1B4332" },
                    ]}
                  >
                    {dig(item)}
                  </Text>
                </View>
                <View style={{ flex: 1, marginHorizontal: 12 }}>
                  <Text style={[st.indexName, { color: textColor }]}>
                    {tx(lang, "Juz", "Juz", "الجزء")} {dig(item)}
                  </Text>
                </View>
                <Text
                  style={[
                    st.indexPage,
                    { color: nightMode ? "#888" : "#6B7B72" },
                  ]}
                >
                  {tx(lang, "p.", "p.", "ص.")} {dig(getJuzStartPage(item))}
                </Text>
              </Pressable>
            )}
          />
        )}
      </View>
    </Modal>
  );

  // Render settings modal
  const renderSettings = () => (
    <Modal visible={showSettings} animationType="slide" transparent
      supportedOrientations={["portrait", "portrait-upside-down", "landscape"]}>
      <View style={st.settingsOverlay}>
        <View
          style={[
            st.settingsBox,
            { backgroundColor: nightMode ? "#1A1A2E" : "#FFFFFF" },
          ]}
        >
          <Text style={[st.settingsTitle, { color: textColor }]}>
            {tx(lang, "Instellingen", "Settings", "الإعدادات")}
          </Text>
          <View style={[st.settingsRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <Text style={[st.settingsLabel, { color: textColor }]}>
              {tx(lang, "Lettergrootte", "Font Size", "حجم الخط")}
            </Text>
            <View style={[st.fontSizeControls, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <Pressable
                onPress={() => setFontSize(Math.max(18, fontSize - 2))}
                style={st.fontBtn}
              >
                <Text style={st.fontBtnText}>-</Text>
              </Pressable>
              <Text style={[st.fontSizeValue, { color: textColor }]}>
                {fontSize}
              </Text>
              <Pressable
                onPress={() => setFontSize(Math.min(42, fontSize + 2))}
                style={st.fontBtn}
              >
                <Text style={st.fontBtnText}>+</Text>
              </Pressable>
            </View>
          </View>
          {/* Theme: label on its own line, then the buttons wrap full-width below
              (4 buttons + the label won't fit on one row in the settings box). */}
          <View style={st.themeSection}>
            <Text style={[st.settingsLabel, { color: textColor, marginBottom: 8, textAlign: isRTL ? "right" : "left" }]}>
              {tx(lang, "Thema", "Theme", "نمط الألوان")}
            </Text>
            <View style={[st.themeRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              {(Object.keys(MUSHAF_THEMES) as MushafTheme[]).map((key) => (
                <Pressable
                  key={key}
                  onPress={() => setTheme(key)}
                  style={[st.toggleBtn, theme === key && st.toggleBtnActive]}
                >
                  <Text style={[st.toggleBtnText, theme === key && { color: "#FFF" }]}>
                    {tx(lang, MUSHAF_THEMES[key].label.nl, MUSHAF_THEMES[key].label.en, MUSHAF_THEMES[key].label.ar)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={[st.settingsRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <Text style={[st.settingsLabel, { color: textColor }]}>
              {tx(lang, "Scherm aan houden", "Keep screen on", "منع إطفاء الشاشة")}
            </Text>
            <Pressable
              onPress={() => setKeepAwake(!keepAwake)}
              style={[st.toggleBtn, keepAwake && st.toggleBtnActive]}
            >
              <Text style={[st.toggleBtnText, keepAwake && { color: "#FFF" }]}>
                {keepAwake
                  ? tx(lang, "Aan", "On", "مفعّل")
                  : tx(lang, "Uit", "Off", "معطّل")}
              </Text>
            </Pressable>
          </View>
          <View style={[st.settingsRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <Text style={[st.settingsLabel, { color: textColor }]}>
              {tx(lang, "Automatisch doorbladeren", "Auto page-turn", "تصفُّح تلقائي")}
            </Text>
            <Pressable
              onPress={() => setAutoTurn(!autoTurn)}
              style={[st.toggleBtn, autoTurn && st.toggleBtnActive]}
            >
              <Text style={[st.toggleBtnText, autoTurn && { color: "#FFF" }]}>
                {autoTurn
                  ? tx(lang, "Aan", "On", "مفعّل")
                  : tx(lang, "Uit", "Off", "معطّل")}
              </Text>
            </Pressable>
          </View>
          {autoTurn && (
            <View style={[st.settingsRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <Text style={[st.settingsLabel, { color: textColor }]}>
                {tx(lang, "Seconden per pagina", "Seconds per page", "ثوانٍ لكل صفحة")}
              </Text>
              <View style={[st.fontSizeControls, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                <Pressable
                  onPress={() => setAutoTurnSec(Math.max(10, autoTurnSec - 10))}
                  style={st.fontBtn}
                >
                  <Text style={st.fontBtnText}>-</Text>
                </Pressable>
                <Text style={[st.fontSizeValue, { color: textColor }]}>
                  {dig(autoTurnSec)}
                </Text>
                <Pressable
                  onPress={() => setAutoTurnSec(Math.min(120, autoTurnSec + 10))}
                  style={st.fontBtn}
                >
                  <Text style={st.fontBtnText}>+</Text>
                </Pressable>
              </View>
            </View>
          )}
          <Pressable
            onPress={() => setShowSettings(false)}
            style={st.settingsCloseBtn}
          >
            <Text style={st.settingsCloseBtnText}>
              {tx(lang, "Sluiten", "Close", "إغلاق")}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );

  // Render science modal (bottom sheet style like reference image)
  const renderScienceModal = () => (
    <Modal visible={showScienceModal} animationType="slide" transparent
      supportedOrientations={["portrait", "portrait-upside-down", "landscape"]}>
      <View style={st.scienceOverlay}>
        {/* Tap outside to close */}
        <Pressable
          style={{ flex: 1 }}
          onPress={() => setShowScienceModal(false)}
        />
        <View
          style={[
            st.scienceBox,
            { backgroundColor: nightMode ? "#1A1A2E" : "#FAFDF7" },
          ]}
        >
          {/* Drag handle */}
          <View style={st.scienceDragHandle}>
            <View
              style={[
                st.scienceDragBar,
                { backgroundColor: nightMode ? "#555" : "#CCC" },
              ]}
            />
          </View>

          {/* Tabs row: علوم السورة → تفسير → هدايات */}
          <View
            style={[
              st.scienceTabsRow,
              { flexDirection: isRTL ? "row-reverse" : "row" },
              { borderBottomColor: nightMode ? "#333" : "#E8EDE9" },
            ]}
          >
            {(["surah", "tafsir", "hidayat"] as const).map((tab) => (
              <Pressable
                key={tab}
                onPress={() => {
                  if (tab === "tafsir" && selectedAyah)
                    fetchTafsir(selectedAyah, tafsirSource);
                  else if (tab === "hidayat" && selectedAyah)
                    fetchHidayat(selectedAyah);
                  else if (tab === "surah" && selectedAyah)
                    fetchSurahInfo(selectedAyah.surahNumber);
                }}
                style={[
                  st.scienceTabItem,
                  scienceTab === tab && st.scienceTabItemActive,
                ]}
              >
                <Text
                  style={[
                    st.scienceTabItemText,
                    scienceTab === tab && st.scienceTabItemTextActive,
                    {
                      color:
                        scienceTab === tab
                          ? "#1B4332"
                          : nightMode
                            ? "#888"
                            : "#6B7B72",
                    },
                  ]}
                >
                  {tab === "surah"
                    ? tx(lang, "Soera-info", "Surah Info", "علوم السورة")
                    : tab === "tafsir"
                      ? tx(lang, "Tafsir", "Tafsir", "تفسير")
                      : tx(lang, "Hidaayaat", "Guidance", "هدايات")}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Tafsir source selector */}
          {scienceTab === "tafsir" && (
            <View
              style={[
                st.tafsirSourceRow,
                { flexDirection: isRTL ? "row-reverse" : "row" },
                { borderBottomColor: nightMode ? "#333" : "#E8EDE9" },
              ]}
            >
              {(["saadi", "kathir"] as const).map((src) => (
                <Pressable
                  key={src}
                  onPress={() => selectedAyah && fetchTafsir(selectedAyah, src)}
                  style={[
                    st.tafsirSrcBtn,
                    tafsirSource === src && { backgroundColor: "#1B4332" },
                  ]}
                >
                  <Text
                    style={[
                      st.tafsirSrcText,
                      tafsirSource === src && { color: "#FFF" },
                    ]}
                  >
                    {src === "saadi"
                      ? tx(lang, "As-Sa'di", "As-Sa'di", "السعدي")
                      : tx(lang, "Ibn Kathir", "Ibn Kathir", "ابن كثير")}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* Content with ayah reference inside scroll */}
          <ScrollView
            style={st.scienceContent}
            contentContainerStyle={{ paddingBottom: 30 }}
          >
            {/* Ayah reference inside scrollable area */}
            {selectedAyah && scienceTab !== "surah" && (
              <View
                style={[
                  st.ayahRefBox,
                  {
                    backgroundColor: nightMode ? "#252540" : "#F0F7F2",
                    borderColor: nightMode ? "#3A3A5A" : "#D4E8D9",
                  },
                ]}
              >
                <Text
                  style={[
                    st.ayahRefText,
                    { color: nightMode ? "#C4A35A" : "#1B4332" },
                  ]}
                >
                  ❖{" "}
                  {selectedAyah.text ||
                    `${selectedAyah.surahName} : ${selectedAyah.numberInSurah}`}{" "}
                  ❖
                </Text>
              </View>
            )}
            {scienceLoading ? (
              <View style={{ alignItems: "center", paddingTop: 40 }}>
                <ActivityIndicator
                  size="large"
                  color={nightMode ? "#C4A35A" : "#1B4332"}
                />
                <Text
                  style={{
                    color: nightMode ? "#888" : "#6B7B72",
                    marginTop: 12,
                    fontSize: 13,
                  }}
                >
                  {tx(lang, "Laden...", "Loading...", "جاري التحميل...")}
                </Text>
              </View>
            ) : (
              <>
                <Text
                  style={[
                    st.scienceText,
                    {
                      color: textColor,
                      textAlign: lang === "ar" ? "right" : "left",
                      writingDirection: lang === "ar" ? "rtl" : "ltr",
                    },
                  ]}
                >
                  {scienceContent
                    .replace(/[★◆❖✦✧⭐\*]{1,}/g, "")
                    .replace(/^\s*[\-•]\s*/gm, "")}
                </Text>
                {scienceContent && scienceTab !== "tafsir" && (
                  <ReportAiContent
                    content={scienceContent}
                    surface={`quran-${scienceTab}`}
                    color={textColor}
                  />
                )}
              </>
            )}
          </ScrollView>

          {/* Bottom close button */}
          <View
            style={[
              st.scienceBottomBar,
              { flexDirection: isRTL ? "row-reverse" : "row" },
              { borderTopColor: nightMode ? "#333" : "#E8EDE9" },
            ]}
          >
            <Pressable
              onPress={() => setShowScienceModal(false)}
              style={({ pressed }) => [
                st.scienceCloseBtn,
                pressed && { opacity: 0.7 },
              ]}
            >
              <MaterialIcons name="close" size={20} color="#666" />
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );

  return (
    <View
      style={[
        st.container,
        { backgroundColor: bgColor, paddingTop: insets.top },
      ]}
    >
      {/* Top toolbar */}
      {showToolbar && (
        <View style={[st.toolbar, { backgroundColor: headerBg }]}>
          <View style={[st.toolbarRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <Pressable
              onPress={() => setShowIndex(true)}
              style={({ pressed }) => [
                st.toolbarBtn,
                pressed && { opacity: 0.7 },
              ]}
            >
              <MaterialIcons name="list" size={20} color="#FFFFFF" />
              <Text style={st.toolbarBtnText}>
                {tx(lang, "Index", "Index", "فهرس")}
              </Text>
            </Pressable>
            <View style={st.pageInfo}>
              <Text style={st.pageInfoSurah}>{currentSurah.name}</Text>
              <Text style={st.pageInfoPage}>
                {tx(lang, "Pagina", "Page", "صفحة")} {dig(currentPage)} /{" "}
                {dig(TOTAL_PAGES)}
              </Text>
              {/* Juz/hizb/sajda are NOT shown here (Daa3iyah's call) — they appear
                  in the transient badge during the page-turn (see transientPage). */}
            </View>
            <Pressable
              onPress={() => setShowSettings(true)}
              style={({ pressed }) => [
                st.toolbarBtn,
                pressed && { opacity: 0.7 },
              ]}
            >
              <MaterialIcons name="settings" size={20} color="#FFFFFF" />
              <Text style={st.toolbarBtnText}>
                {tx(lang, "Inst.", "Set.", "ضبط")}
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Page content — virtualized RTL page strip. FlatList windows the 604 pages
          natively (only nearby items mounted), so no manual window/remount. RTL via
          reversed data (RTL_PAGING), no transform → the Qur'an is never mirrored. */}
      <FlatList
        ref={flatListRef}
        data={PAGES}
        keyExtractor={(p) => String(p)}
        renderItem={({ item }) => renderPageSlot(item)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          if (w > 0 && w !== listWidth) setListWidth(w);
        }}
        getItemLayout={(_, index) => ({ length: listWidth, offset: listWidth * index, index })}
        initialScrollIndex={pageToIndex(currentPage)}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        windowSize={5}
        removeClippedSubviews={false}
        scrollEventThrottle={16}
        onScrollBeginDrag={() => {
          userDraggingRef.current = true;
          // Cancel a pending/running fade-out so a swipe during the fade doesn't
          // fight setValue(1) below (clearing the timer alone won't stop an
          // already-started Animated.timing).
          if (transientHideTimer.current) {
            clearTimeout(transientHideTimer.current);
            transientHideTimer.current = null;
          }
          if (endDragTimerRef.current) {
            clearTimeout(endDragTimerRef.current);
            endDragTimerRef.current = null;
          }
          // Tap-to-stop safety net: armed here and RE-ARMED on every onScroll sample
          // (see onScroll), so it fires only ~1.5s after scrolling actually STOPS.
          // That covers a gesture that never emits end-drag/momentum-end (tap-to-stop,
          // cancelled touch) without firing during an active drag. settlePaging clears it.
          if (settleWatchdogRef.current) clearTimeout(settleWatchdogRef.current);
          settleWatchdogRef.current = setTimeout(
            () => settlePaging(lastOffsetXRef.current),
            1500,
          );
          // stopAnimation freezes opacity wherever the fade had reached; reset the
          // shown-page ref so the next onScroll always re-runs setValue(1) and the
          // badge returns to full opacity (even if it re-shows the same page).
          transientOpacity.stopAnimation();
          transientShownForRef.current = null;
        }}
        onScroll={(e) => {
          // Option ب: while the user swipes, show the section badge for the page
          // being swiped TOWARD (the incoming page), not the one being left. Pick
          // by drag direction from the settled index — ceil when moving to a higher
          // index, floor when lower — so it shows the destination from the start
          // (Math.round would show the outgoing page until the midpoint). Guarded to
          // real drags + to page CHANGES only (ref, not state) so it's not a
          // per-frame setState.
          lastOffsetXRef.current = e.nativeEvent.contentOffset.x;
          if (!userDraggingRef.current || listWidth <= 0) return;
          // Push the tap-to-stop watchdog forward while scrolling is live; it fires
          // ~1.5s after the last sample, i.e. only once scrolling has actually stopped.
          if (settleWatchdogRef.current) clearTimeout(settleWatchdogRef.current);
          settleWatchdogRef.current = setTimeout(
            () => settlePaging(lastOffsetXRef.current),
            1500,
          );
          const exact = lastOffsetXRef.current / listWidth;
          // At rest the ratio isn't exactly integer (Android dp/float rounding), so
          // snap to the nearest index when we're within ~1% of it — otherwise ceil/
          // floor could pick the neighbour page. Mid-drag (clearly between pages),
          // pick by direction so the badge shows the page being swiped TOWARD.
          const nearest = Math.round(exact);
          const settledIdx = pageToIndex(currentPage);
          let idx: number;
          if (Math.abs(exact - nearest) < 0.01) {
            // Near a page boundary. If it's the page we STARTED on, don't flash the
            // outgoing page — wait until the drag moves toward another page. If it's
            // a different page (settled/overshot onto it), show that one.
            if (nearest === settledIdx) return;
            idx = nearest;
          } else {
            idx = exact > settledIdx ? Math.ceil(exact) : Math.floor(exact);
          }
          const page = indexToPage(idx);
          if (page < 1 || page > TOTAL_PAGES) return;
          if (transientShownForRef.current !== page) {
            transientShownForRef.current = page;
            setTransientPage(page);
            transientOpacity.setValue(1);
          }
        }}
        onScrollEndDrag={(e) => {
          // Fallback for a no-momentum release (iOS). If momentum follows,
          // onMomentumScrollBegin cancels this before it fires.
          lastOffsetXRef.current = e.nativeEvent.contentOffset.x;
          if (endDragTimerRef.current) clearTimeout(endDragTimerRef.current);
          endDragTimerRef.current = setTimeout(() => settlePaging(lastOffsetXRef.current), 140);
          // (The tap-to-stop watchdog is armed on begin-drag + re-armed on each
          // onScroll, so it already covers the post-release momentum/tap-to-stop case.)
        }}
        onMomentumScrollBegin={() => {
          if (endDragTimerRef.current) { clearTimeout(endDragTimerRef.current); endDragTimerRef.current = null; }
        }}
        onMomentumScrollEnd={(e) => {
          if (endDragTimerRef.current) { clearTimeout(endDragTimerRef.current); endDragTimerRef.current = null; }
          settlePaging(e.nativeEvent.contentOffset.x);
        }}
      />

      {/* Transient section badge (option ب): juz/hizb/sajda of the page sliding
          in, shown between the pages during a swipe, then faded out. pointerEvents
          none so it never blocks the swipe. */}
      {transientPage !== null &&
        (() => {
          const s = sectionLabelForPage(transientPage);
          return (
            <View pointerEvents="none" style={st.transientBadgeWrap}>
              <RNAnimated.View
                style={[
                  st.transientBadge,
                  {
                    opacity: transientOpacity,
                    backgroundColor: nightMode ? "rgba(15,15,31,0.95)" : "rgba(27,67,50,0.95)",
                  },
                ]}
              >
                {/* ۞ marks a rub' al-hizb boundary specifically (printed-mushaf
                    convention) — only when a rub' starts on this page. */}
                {s.rubLabel && <Text style={st.transientBadgeGlyph}>۞</Text>}
                <Text style={st.transientBadgeMain}>
                  {tx(lang, "Juz", "Juz", "الجزء")} {dig(s.juz)}
                </Text>
                {s.rubLabel && (
                  <Text style={st.transientBadgeSub}>{s.rubLabel}</Text>
                )}
                <Text style={st.transientBadgeSub}>
                  {tx(lang, "Achtste", "Eighth", "الثُّمن")} {dig(s.eighth)}/{dig(8)}
                </Text>
                {s.sajda && (
                  <Text style={st.transientBadgeSub}>
                    {"۩ "}
                    {tx(lang, "Sajda", "Sajda", "سجدة")}
                  </Text>
                )}
              </RNAnimated.View>
            </View>
          );
        })()}

      {/* Modals */}
      {renderIndex()}
      {renderSettings()}
      {renderScienceModal()}
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 300,
  },

  // Page frame (fallback)
  pageFrame: { borderWidth: 1.5, borderRadius: 4, padding: 8, minHeight: 500 },

  // Toolbar
  toolbar: { paddingHorizontal: 12, paddingVertical: 8 },
  toolbarRow: {
    alignItems: "center",
    justifyContent: "space-between",
  },
  toolbarBtn: { alignItems: "center", paddingHorizontal: 8 },
  toolbarBtnText: {
    color: "#FFFFFF",
    fontSize: 9,
    marginTop: 2,
    fontWeight: "600",
  },
  pageInfo: { alignItems: "center" },
  pageInfoSurah: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  pageInfoPage: { color: "#C4E0D4", fontSize: 10, marginTop: 2 },
  transientBadgeWrap: { position: "absolute", top: "20%", left: 0, right: 0, alignItems: "center" },
  transientBadge: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#C4A35A",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  transientBadgeGlyph: { color: "#E8C877", fontSize: 30, marginBottom: 2 },
  transientBadgeMain: { color: "#FFFFFF", fontSize: 18, fontWeight: "700", textAlign: "center" },
  transientBadgeSub: { color: "#E8D9A8", fontSize: 13, marginTop: 3, textAlign: "center" },

  // Mushaf text (fallback)
  mushafText: { textAlign: "justify", writingDirection: "rtl" },

  // Index modal
  modalContainer: { flex: 1 },
  modalHeader: {
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  modalHeaderTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "700" },
  closeBtn: { padding: 4 },
  indexItem: {
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: "#E2E8E5",
  },
  indexNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  indexNumberText: { fontSize: 12, fontWeight: "700" },
  indexName: { fontSize: 17, fontWeight: "700" },
  indexNameEn: { fontSize: 11, marginTop: 2 },
  indexPage: { fontSize: 11, fontWeight: "600" },
  indexMeta: { fontSize: 9, marginTop: 2 },

  // Settings modal
  settingsOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  settingsBox: { width: "85%", borderRadius: 16, padding: 20 },
  settingsTitle: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 20,
  },
  settingsRow: {
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  settingsLabel: { fontSize: 14, fontWeight: "600" },
  fontSizeControls: { alignItems: "center" },
  fontBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#E8F5EC",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 8,
  },
  fontBtnText: { fontSize: 18, fontWeight: "700", color: "#1B4332" },
  fontSizeValue: {
    fontSize: 16,
    fontWeight: "700",
    minWidth: 30,
    textAlign: "center",
  },
  themeSection: { width: "100%", marginVertical: 8 },
  themeRow: { alignItems: "center", flexWrap: "wrap", gap: 6 },
  toggleBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: "#F5F7F6",
    borderWidth: 1,
    borderColor: "#E2E8E5",
  },
  toggleBtnActive: { backgroundColor: "#1B4332", borderColor: "#1B4332" },
  toggleBtnText: { fontSize: 12, fontWeight: "700", color: "#1B4332" },
  settingsCloseBtn: {
    marginTop: 16,
    alignSelf: "center",
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#1B4332",
  },
  settingsCloseBtnText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },

  // Science modal (bottom sheet)
  scienceOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  scienceBox: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "80%",
    minHeight: "50%",
  },
  scienceDragHandle: { alignItems: "center", paddingVertical: 10 },
  scienceDragBar: { width: 40, height: 4, borderRadius: 2 },
  scienceTabsRow: {
    justifyContent: "center",
    borderBottomWidth: 1,
    paddingBottom: 0,
  },
  scienceTabItem: { paddingHorizontal: 18, paddingVertical: 10 },
  scienceTabItemActive: { borderBottomWidth: 2, borderBottomColor: "#1B4332" },
  scienceTabItemText: { fontSize: 14, fontWeight: "600" },
  scienceTabItemTextActive: { fontWeight: "800" },
  tafsirSourceRow: {
    justifyContent: "center",
    paddingVertical: 8,
    gap: 10,
    borderBottomWidth: 0.5,
  },
  tafsirSrcBtn: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: "#F0F5F1",
  },
  tafsirSrcText: { fontSize: 12, fontWeight: "600", color: "#1B4332" },
  ayahRefBox: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
  },
  ayahRefText: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 28,
  },
  scienceContent: { paddingHorizontal: 16, paddingTop: 12, flex: 1 },
  scienceText: { fontSize: 16, lineHeight: 28 },
  scienceBottomBar: {
    justifyContent: "center",
    paddingVertical: 10,
    borderTopWidth: 0.5,
  },
  scienceCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F0F0F0",
    alignItems: "center",
    justifyContent: "center",
  },
});
