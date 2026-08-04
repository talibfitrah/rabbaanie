import { useState, useEffect, useRef, useCallback } from "react";
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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useI18n } from "@/lib/i18n";
import { useColors } from "@/hooks/use-colors";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import WebView from "react-native-webview";
import { getApiBaseUrl } from "@/constants/oauth";
import { ReportAiContent } from "@/components/report-ai-content";

type Lang = "nl" | "en" | "ar";
const TOTAL_PAGES = 604;
const STORAGE_KEY = "quran_last_page";
const FONT_CDN = "https://static.qurancdn.com/fonts/quran/hafs/v1/woff2";
const API_BASE = "https://api.quran.com/api/v4";

function tx(lang: Lang, nl: string, en: string, ar: string): string {
  if (lang === "en") return en;
  if (lang === "ar") return ar;
  return nl;
}

interface Surah {
  number: number;
  name: string;
  englishName: string;
  startPage: number;
  numberOfAyahs: number;
  revelationType: string;
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

// Surah list with start pages (Mushaf Madina)
const SURAH_LIST: Surah[] = [
  {
    number: 1,
    name: "الفاتحة",
    englishName: "Al-Faatiha",
    startPage: 1,
    numberOfAyahs: 7,
    revelationType: "Meccan",
  },
  {
    number: 2,
    name: "البقرة",
    englishName: "Al-Baqara",
    startPage: 2,
    numberOfAyahs: 286,
    revelationType: "Medinan",
  },
  {
    number: 3,
    name: "آل عمران",
    englishName: "Aal-i-Imraan",
    startPage: 50,
    numberOfAyahs: 200,
    revelationType: "Medinan",
  },
  {
    number: 4,
    name: "النساء",
    englishName: "An-Nisaa",
    startPage: 77,
    numberOfAyahs: 176,
    revelationType: "Medinan",
  },
  {
    number: 5,
    name: "المائدة",
    englishName: "Al-Maaida",
    startPage: 106,
    numberOfAyahs: 120,
    revelationType: "Medinan",
  },
  {
    number: 6,
    name: "الأنعام",
    englishName: "Al-An'aam",
    startPage: 128,
    numberOfAyahs: 165,
    revelationType: "Meccan",
  },
  {
    number: 7,
    name: "الأعراف",
    englishName: "Al-A'raaf",
    startPage: 151,
    numberOfAyahs: 206,
    revelationType: "Meccan",
  },
  {
    number: 8,
    name: "الأنفال",
    englishName: "Al-Anfaal",
    startPage: 177,
    numberOfAyahs: 75,
    revelationType: "Medinan",
  },
  {
    number: 9,
    name: "التوبة",
    englishName: "At-Tawba",
    startPage: 187,
    numberOfAyahs: 129,
    revelationType: "Medinan",
  },
  {
    number: 10,
    name: "يونس",
    englishName: "Yunus",
    startPage: 208,
    numberOfAyahs: 109,
    revelationType: "Meccan",
  },
  {
    number: 11,
    name: "هود",
    englishName: "Hud",
    startPage: 221,
    numberOfAyahs: 123,
    revelationType: "Meccan",
  },
  {
    number: 12,
    name: "يوسف",
    englishName: "Yusuf",
    startPage: 235,
    numberOfAyahs: 111,
    revelationType: "Meccan",
  },
  {
    number: 13,
    name: "الرعد",
    englishName: "Ar-Ra'd",
    startPage: 249,
    numberOfAyahs: 43,
    revelationType: "Medinan",
  },
  {
    number: 14,
    name: "إبراهيم",
    englishName: "Ibrahim",
    startPage: 255,
    numberOfAyahs: 52,
    revelationType: "Meccan",
  },
  {
    number: 15,
    name: "الحجر",
    englishName: "Al-Hijr",
    startPage: 262,
    numberOfAyahs: 99,
    revelationType: "Meccan",
  },
  {
    number: 16,
    name: "النحل",
    englishName: "An-Nahl",
    startPage: 267,
    numberOfAyahs: 128,
    revelationType: "Meccan",
  },
  {
    number: 17,
    name: "الإسراء",
    englishName: "Al-Israa",
    startPage: 282,
    numberOfAyahs: 111,
    revelationType: "Meccan",
  },
  {
    number: 18,
    name: "الكهف",
    englishName: "Al-Kahf",
    startPage: 293,
    numberOfAyahs: 110,
    revelationType: "Meccan",
  },
  {
    number: 19,
    name: "مريم",
    englishName: "Maryam",
    startPage: 305,
    numberOfAyahs: 98,
    revelationType: "Meccan",
  },
  {
    number: 20,
    name: "طه",
    englishName: "Taa-Haa",
    startPage: 312,
    numberOfAyahs: 135,
    revelationType: "Meccan",
  },
  {
    number: 21,
    name: "الأنبياء",
    englishName: "Al-Anbiyaa",
    startPage: 322,
    numberOfAyahs: 112,
    revelationType: "Meccan",
  },
  {
    number: 22,
    name: "الحج",
    englishName: "Al-Hajj",
    startPage: 332,
    numberOfAyahs: 78,
    revelationType: "Medinan",
  },
  {
    number: 23,
    name: "المؤمنون",
    englishName: "Al-Mu'minoon",
    startPage: 342,
    numberOfAyahs: 118,
    revelationType: "Meccan",
  },
  {
    number: 24,
    name: "النور",
    englishName: "An-Noor",
    startPage: 350,
    numberOfAyahs: 64,
    revelationType: "Medinan",
  },
  {
    number: 25,
    name: "الفرقان",
    englishName: "Al-Furqaan",
    startPage: 359,
    numberOfAyahs: 77,
    revelationType: "Meccan",
  },
  {
    number: 26,
    name: "الشعراء",
    englishName: "Ash-Shu'araa",
    startPage: 367,
    numberOfAyahs: 227,
    revelationType: "Meccan",
  },
  {
    number: 27,
    name: "النمل",
    englishName: "An-Naml",
    startPage: 377,
    numberOfAyahs: 93,
    revelationType: "Meccan",
  },
  {
    number: 28,
    name: "القصص",
    englishName: "Al-Qasas",
    startPage: 385,
    numberOfAyahs: 88,
    revelationType: "Meccan",
  },
  {
    number: 29,
    name: "العنكبوت",
    englishName: "Al-Ankaboot",
    startPage: 396,
    numberOfAyahs: 69,
    revelationType: "Meccan",
  },
  {
    number: 30,
    name: "الروم",
    englishName: "Ar-Room",
    startPage: 404,
    numberOfAyahs: 60,
    revelationType: "Meccan",
  },
  {
    number: 31,
    name: "لقمان",
    englishName: "Luqman",
    startPage: 411,
    numberOfAyahs: 34,
    revelationType: "Meccan",
  },
  {
    number: 32,
    name: "السجدة",
    englishName: "As-Sajda",
    startPage: 415,
    numberOfAyahs: 30,
    revelationType: "Meccan",
  },
  {
    number: 33,
    name: "الأحزاب",
    englishName: "Al-Ahzaab",
    startPage: 418,
    numberOfAyahs: 73,
    revelationType: "Medinan",
  },
  {
    number: 34,
    name: "سبأ",
    englishName: "Saba",
    startPage: 428,
    numberOfAyahs: 54,
    revelationType: "Meccan",
  },
  {
    number: 35,
    name: "فاطر",
    englishName: "Faatir",
    startPage: 434,
    numberOfAyahs: 45,
    revelationType: "Meccan",
  },
  {
    number: 36,
    name: "يس",
    englishName: "Yaseen",
    startPage: 440,
    numberOfAyahs: 83,
    revelationType: "Meccan",
  },
  {
    number: 37,
    name: "الصافات",
    englishName: "As-Saaffaat",
    startPage: 446,
    numberOfAyahs: 182,
    revelationType: "Meccan",
  },
  {
    number: 38,
    name: "ص",
    englishName: "Saad",
    startPage: 453,
    numberOfAyahs: 88,
    revelationType: "Meccan",
  },
  {
    number: 39,
    name: "الزمر",
    englishName: "Az-Zumar",
    startPage: 458,
    numberOfAyahs: 75,
    revelationType: "Meccan",
  },
  {
    number: 40,
    name: "غافر",
    englishName: "Ghaafir",
    startPage: 467,
    numberOfAyahs: 85,
    revelationType: "Meccan",
  },
  {
    number: 41,
    name: "فصلت",
    englishName: "Fussilat",
    startPage: 477,
    numberOfAyahs: 54,
    revelationType: "Meccan",
  },
  {
    number: 42,
    name: "الشورى",
    englishName: "Ash-Shooraa",
    startPage: 483,
    numberOfAyahs: 53,
    revelationType: "Meccan",
  },
  {
    number: 43,
    name: "الزخرف",
    englishName: "Az-Zukhruf",
    startPage: 489,
    numberOfAyahs: 89,
    revelationType: "Meccan",
  },
  {
    number: 44,
    name: "الدخان",
    englishName: "Ad-Dukhaan",
    startPage: 496,
    numberOfAyahs: 59,
    revelationType: "Meccan",
  },
  {
    number: 45,
    name: "الجاثية",
    englishName: "Al-Jaathiya",
    startPage: 499,
    numberOfAyahs: 37,
    revelationType: "Meccan",
  },
  {
    number: 46,
    name: "الأحقاف",
    englishName: "Al-Ahqaaf",
    startPage: 502,
    numberOfAyahs: 35,
    revelationType: "Meccan",
  },
  {
    number: 47,
    name: "محمد",
    englishName: "Muhammad",
    startPage: 507,
    numberOfAyahs: 38,
    revelationType: "Medinan",
  },
  {
    number: 48,
    name: "الفتح",
    englishName: "Al-Fath",
    startPage: 511,
    numberOfAyahs: 29,
    revelationType: "Medinan",
  },
  {
    number: 49,
    name: "الحجرات",
    englishName: "Al-Hujuraat",
    startPage: 515,
    numberOfAyahs: 18,
    revelationType: "Medinan",
  },
  {
    number: 50,
    name: "ق",
    englishName: "Qaaf",
    startPage: 518,
    numberOfAyahs: 45,
    revelationType: "Meccan",
  },
  {
    number: 51,
    name: "الذاريات",
    englishName: "Adh-Dhaariyat",
    startPage: 520,
    numberOfAyahs: 60,
    revelationType: "Meccan",
  },
  {
    number: 52,
    name: "الطور",
    englishName: "At-Toor",
    startPage: 523,
    numberOfAyahs: 49,
    revelationType: "Meccan",
  },
  {
    number: 53,
    name: "النجم",
    englishName: "An-Najm",
    startPage: 526,
    numberOfAyahs: 62,
    revelationType: "Meccan",
  },
  {
    number: 54,
    name: "القمر",
    englishName: "Al-Qamar",
    startPage: 528,
    numberOfAyahs: 55,
    revelationType: "Meccan",
  },
  {
    number: 55,
    name: "الرحمن",
    englishName: "Ar-Rahmaan",
    startPage: 531,
    numberOfAyahs: 78,
    revelationType: "Medinan",
  },
  {
    number: 56,
    name: "الواقعة",
    englishName: "Al-Waaqia",
    startPage: 534,
    numberOfAyahs: 96,
    revelationType: "Meccan",
  },
  {
    number: 57,
    name: "الحديد",
    englishName: "Al-Hadid",
    startPage: 537,
    numberOfAyahs: 29,
    revelationType: "Medinan",
  },
  {
    number: 58,
    name: "المجادلة",
    englishName: "Al-Mujaadila",
    startPage: 542,
    numberOfAyahs: 22,
    revelationType: "Medinan",
  },
  {
    number: 59,
    name: "الحشر",
    englishName: "Al-Hashr",
    startPage: 545,
    numberOfAyahs: 24,
    revelationType: "Medinan",
  },
  {
    number: 60,
    name: "الممتحنة",
    englishName: "Al-Mumtahana",
    startPage: 549,
    numberOfAyahs: 13,
    revelationType: "Medinan",
  },
  {
    number: 61,
    name: "الصف",
    englishName: "As-Saff",
    startPage: 551,
    numberOfAyahs: 14,
    revelationType: "Medinan",
  },
  {
    number: 62,
    name: "الجمعة",
    englishName: "Al-Jumu'a",
    startPage: 553,
    numberOfAyahs: 11,
    revelationType: "Medinan",
  },
  {
    number: 63,
    name: "المنافقون",
    englishName: "Al-Munaafiqoon",
    startPage: 554,
    numberOfAyahs: 11,
    revelationType: "Medinan",
  },
  {
    number: 64,
    name: "التغابن",
    englishName: "At-Taghaabun",
    startPage: 556,
    numberOfAyahs: 18,
    revelationType: "Medinan",
  },
  {
    number: 65,
    name: "الطلاق",
    englishName: "At-Talaaq",
    startPage: 558,
    numberOfAyahs: 12,
    revelationType: "Medinan",
  },
  {
    number: 66,
    name: "التحريم",
    englishName: "At-Tahrim",
    startPage: 560,
    numberOfAyahs: 12,
    revelationType: "Medinan",
  },
  {
    number: 67,
    name: "الملك",
    englishName: "Al-Mulk",
    startPage: 562,
    numberOfAyahs: 30,
    revelationType: "Meccan",
  },
  {
    number: 68,
    name: "القلم",
    englishName: "Al-Qalam",
    startPage: 564,
    numberOfAyahs: 52,
    revelationType: "Meccan",
  },
  {
    number: 69,
    name: "الحاقة",
    englishName: "Al-Haaqqa",
    startPage: 566,
    numberOfAyahs: 52,
    revelationType: "Meccan",
  },
  {
    number: 70,
    name: "المعارج",
    englishName: "Al-Ma'aarij",
    startPage: 568,
    numberOfAyahs: 44,
    revelationType: "Meccan",
  },
  {
    number: 71,
    name: "نوح",
    englishName: "Nooh",
    startPage: 570,
    numberOfAyahs: 28,
    revelationType: "Meccan",
  },
  {
    number: 72,
    name: "الجن",
    englishName: "Al-Jinn",
    startPage: 572,
    numberOfAyahs: 28,
    revelationType: "Meccan",
  },
  {
    number: 73,
    name: "المزمل",
    englishName: "Al-Muzzammil",
    startPage: 574,
    numberOfAyahs: 20,
    revelationType: "Meccan",
  },
  {
    number: 74,
    name: "المدثر",
    englishName: "Al-Muddaththir",
    startPage: 575,
    numberOfAyahs: 56,
    revelationType: "Meccan",
  },
  {
    number: 75,
    name: "القيامة",
    englishName: "Al-Qiyaama",
    startPage: 577,
    numberOfAyahs: 40,
    revelationType: "Meccan",
  },
  {
    number: 76,
    name: "الإنسان",
    englishName: "Al-Insaan",
    startPage: 578,
    numberOfAyahs: 31,
    revelationType: "Medinan",
  },
  {
    number: 77,
    name: "المرسلات",
    englishName: "Al-Mursalaat",
    startPage: 580,
    numberOfAyahs: 50,
    revelationType: "Meccan",
  },
  {
    number: 78,
    name: "النبأ",
    englishName: "An-Naba",
    startPage: 582,
    numberOfAyahs: 40,
    revelationType: "Meccan",
  },
  {
    number: 79,
    name: "النازعات",
    englishName: "An-Naazi'aat",
    startPage: 583,
    numberOfAyahs: 46,
    revelationType: "Meccan",
  },
  {
    number: 80,
    name: "عبس",
    englishName: "Abasa",
    startPage: 585,
    numberOfAyahs: 42,
    revelationType: "Meccan",
  },
  {
    number: 81,
    name: "التكوير",
    englishName: "At-Takwir",
    startPage: 586,
    numberOfAyahs: 29,
    revelationType: "Meccan",
  },
  {
    number: 82,
    name: "الانفطار",
    englishName: "Al-Infitaar",
    startPage: 587,
    numberOfAyahs: 19,
    revelationType: "Meccan",
  },
  {
    number: 83,
    name: "المطففين",
    englishName: "Al-Mutaffifin",
    startPage: 587,
    numberOfAyahs: 36,
    revelationType: "Meccan",
  },
  {
    number: 84,
    name: "الانشقاق",
    englishName: "Al-Inshiqaaq",
    startPage: 589,
    numberOfAyahs: 25,
    revelationType: "Meccan",
  },
  {
    number: 85,
    name: "البروج",
    englishName: "Al-Burooj",
    startPage: 590,
    numberOfAyahs: 22,
    revelationType: "Meccan",
  },
  {
    number: 86,
    name: "الطارق",
    englishName: "At-Taariq",
    startPage: 591,
    numberOfAyahs: 17,
    revelationType: "Meccan",
  },
  {
    number: 87,
    name: "الأعلى",
    englishName: "Al-A'laa",
    startPage: 591,
    numberOfAyahs: 19,
    revelationType: "Meccan",
  },
  {
    number: 88,
    name: "الغاشية",
    englishName: "Al-Ghaashiya",
    startPage: 592,
    numberOfAyahs: 26,
    revelationType: "Meccan",
  },
  {
    number: 89,
    name: "الفجر",
    englishName: "Al-Fajr",
    startPage: 593,
    numberOfAyahs: 30,
    revelationType: "Meccan",
  },
  {
    number: 90,
    name: "البلد",
    englishName: "Al-Balad",
    startPage: 594,
    numberOfAyahs: 20,
    revelationType: "Meccan",
  },
  {
    number: 91,
    name: "الشمس",
    englishName: "Ash-Shams",
    startPage: 595,
    numberOfAyahs: 15,
    revelationType: "Meccan",
  },
  {
    number: 92,
    name: "الليل",
    englishName: "Al-Lail",
    startPage: 595,
    numberOfAyahs: 21,
    revelationType: "Meccan",
  },
  {
    number: 93,
    name: "الضحى",
    englishName: "Ad-Dhuhaa",
    startPage: 596,
    numberOfAyahs: 11,
    revelationType: "Meccan",
  },
  {
    number: 94,
    name: "الشرح",
    englishName: "Ash-Sharh",
    startPage: 596,
    numberOfAyahs: 8,
    revelationType: "Meccan",
  },
  {
    number: 95,
    name: "التين",
    englishName: "At-Tin",
    startPage: 597,
    numberOfAyahs: 8,
    revelationType: "Meccan",
  },
  {
    number: 96,
    name: "العلق",
    englishName: "Al-Alaq",
    startPage: 597,
    numberOfAyahs: 19,
    revelationType: "Meccan",
  },
  {
    number: 97,
    name: "القدر",
    englishName: "Al-Qadr",
    startPage: 598,
    numberOfAyahs: 5,
    revelationType: "Meccan",
  },
  {
    number: 98,
    name: "البينة",
    englishName: "Al-Bayyina",
    startPage: 598,
    numberOfAyahs: 8,
    revelationType: "Medinan",
  },
  {
    number: 99,
    name: "الزلزلة",
    englishName: "Az-Zalzala",
    startPage: 599,
    numberOfAyahs: 8,
    revelationType: "Medinan",
  },
  {
    number: 100,
    name: "العاديات",
    englishName: "Al-Aadiyaat",
    startPage: 599,
    numberOfAyahs: 11,
    revelationType: "Meccan",
  },
  {
    number: 101,
    name: "القارعة",
    englishName: "Al-Qaari'a",
    startPage: 600,
    numberOfAyahs: 11,
    revelationType: "Meccan",
  },
  {
    number: 102,
    name: "التكاثر",
    englishName: "At-Takaathur",
    startPage: 600,
    numberOfAyahs: 8,
    revelationType: "Meccan",
  },
  {
    number: 103,
    name: "العصر",
    englishName: "Al-Asr",
    startPage: 601,
    numberOfAyahs: 3,
    revelationType: "Meccan",
  },
  {
    number: 104,
    name: "الهمزة",
    englishName: "Al-Humaza",
    startPage: 601,
    numberOfAyahs: 9,
    revelationType: "Meccan",
  },
  {
    number: 105,
    name: "الفيل",
    englishName: "Al-Fil",
    startPage: 601,
    numberOfAyahs: 5,
    revelationType: "Meccan",
  },
  {
    number: 106,
    name: "قريش",
    englishName: "Quraish",
    startPage: 602,
    numberOfAyahs: 4,
    revelationType: "Meccan",
  },
  {
    number: 107,
    name: "الماعون",
    englishName: "Al-Maa'oon",
    startPage: 602,
    numberOfAyahs: 7,
    revelationType: "Meccan",
  },
  {
    number: 108,
    name: "الكوثر",
    englishName: "Al-Kawthar",
    startPage: 602,
    numberOfAyahs: 3,
    revelationType: "Meccan",
  },
  {
    number: 109,
    name: "الكافرون",
    englishName: "Al-Kaafiroon",
    startPage: 603,
    numberOfAyahs: 6,
    revelationType: "Meccan",
  },
  {
    number: 110,
    name: "النصر",
    englishName: "An-Nasr",
    startPage: 603,
    numberOfAyahs: 3,
    revelationType: "Medinan",
  },
  {
    number: 111,
    name: "المسد",
    englishName: "Al-Masad",
    startPage: 603,
    numberOfAyahs: 5,
    revelationType: "Meccan",
  },
  {
    number: 112,
    name: "الإخلاص",
    englishName: "Al-Ikhlaas",
    startPage: 604,
    numberOfAyahs: 4,
    revelationType: "Meccan",
  },
  {
    number: 113,
    name: "الفلق",
    englishName: "Al-Falaq",
    startPage: 604,
    numberOfAyahs: 5,
    revelationType: "Meccan",
  },
  {
    number: 114,
    name: "الناس",
    englishName: "An-Naas",
    startPage: 604,
    numberOfAyahs: 6,
    revelationType: "Meccan",
  },
];

function getSurahForPage(page: number): Surah {
  for (let i = SURAH_LIST.length - 1; i >= 0; i--) {
    if (SURAH_LIST[i].startPage <= page) return SURAH_LIST[i];
  }
  return SURAH_LIST[0];
}

function getJuzForPage(page: number): number {
  return Math.min(30, Math.ceil(page / 20.13));
}

// Generate HTML for WebView rendering with quran.com CDN fonts
function generateMushafHTML(
  pageNum: number,
  words: PageWord[],
  nightMode: boolean,
  fontSize: number,
): string {
  const bgColor = nightMode ? "#1A1A2E" : "#FFFFF5";
  const textColor = nightMode ? "#E8E8D0" : "#1B1B1B";
  const borderColor = nightMode ? "#C4A35A" : "#1B4332";
  const fontUrl = `${FONT_CDN}/p${pageNum}.woff2`;

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
        const cls = w.char_type_name === "end" ? "end-marker" : "word";
        const vk = w.verse_key || "";
        return `<span class="${cls}" data-vk="${vk}">${w.code_v1}</span>`;
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
// Detect swipe
var startX = 0;
document.addEventListener('touchstart', function(e) { startX = e.touches[0].clientX; });
document.addEventListener('touchend', function(e) {
  var dx = e.changedTouches[0].clientX - startX;
  if (Math.abs(dx) > 60) {
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'swipe', direction: dx > 0 ? 'right' : 'left'}));
  }
});
</script>
</body>
</html>`;
}

export default function QuranScreen() {
  const { language } = useI18n();
  const lang = language as Lang;
  const insets = useSafeAreaInsets();
  const colors = useColors();

  // State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageWords, setPageWords] = useState<PageWord[]>([]);
  const [pageAyahs, setPageAyahs] = useState<PageAyah[]>([]);
  const [loading, setLoading] = useState(true);
  const [showIndex, setShowIndex] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showToolbar, setShowToolbar] = useState(true);
  const [fontSize, setFontSize] = useState(28);
  const [nightMode, setNightMode] = useState(false);

  // Long press modal state
  const [showScienceModal, setShowScienceModal] = useState(false);
  const [selectedAyah, setSelectedAyah] = useState<PageAyah | null>(null);
  const [scienceTab, setScienceTab] = useState<"tafsir" | "hidayat" | "surah">(
    "tafsir",
  );
  const [tafsirSource, setTafsirSource] = useState<"saadi" | "kathir">("saadi");
  const [scienceContent, setScienceContent] = useState("");
  const [scienceLoading, setScienceLoading] = useState(false);

  const webViewRef = useRef<any>(null);

  // Load saved page on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((val) => {
      if (val) {
        const p = parseInt(val, 10);
        if (p >= 1 && p <= TOTAL_PAGES) setCurrentPage(p);
      }
    });
  }, []);

  // Save current page
  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEY, String(currentPage));
  }, [currentPage]);

  // Fetch page data from quran.com API
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const fetchPage = async () => {
      try {
        const res = await fetch(
          `${API_BASE}/verses/by_page/${currentPage}?words=true&word_fields=code_v1,text_uthmani,line_number&per_page=50`,
        );
        const data = await res.json();
        if (cancelled) return;

        if (data.verses) {
          const words: PageWord[] = [];
          const ayahs: PageAyah[] = [];

          for (const v of data.verses) {
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

          setPageWords(words);
          setPageAyahs(ayahs);
        }
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          // Fallback to alquran.cloud API
          try {
            const res2 = await fetch(
              `https://api.alquran.cloud/v1/page/${currentPage}/quran-uthmani`,
            );
            const data2 = await res2.json();
            if (cancelled) return;
            if (data2.code === 200) {
              const ayahs: PageAyah[] = data2.data.ayahs.map((a: any) => ({
                number: a.number,
                numberInSurah: a.numberInSurah,
                text: a.text,
                surahNumber: a.surah.number,
                surahName: a.surah.name,
              }));
              setPageAyahs(ayahs);
              setPageWords([]); // No CDN font data available
            }
          } catch {
            // ignore
          }
          setLoading(false);
        }
      }
    };

    fetchPage();
    return () => {
      cancelled = true;
    };
  }, [currentPage]);

  // Handle WebView messages
  const handleWebViewMessage = (event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === "swipe") {
        if (msg.direction === "right") {
          setCurrentPage((p) => Math.min(TOTAL_PAGES, p + 1));
        } else {
          setCurrentPage((p) => Math.max(1, p - 1));
        }
      } else if (msg.type === "longpress" && msg.verseKey) {
        const parts = msg.verseKey.split(":");
        const surahNum = parseInt(parts[0]);
        const ayahNum = parseInt(parts[1]);
        const ayah = pageAyahs.find(
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
      const baseUrl = getApiBaseUrl();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout
      const res = await fetch(`${baseUrl}/api/quran/hidayat`, {
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
      const baseUrl = getApiBaseUrl();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);
      const res = await fetch(`${baseUrl}/api/quran/surah-info`, {
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
  const currentJuz = getJuzForPage(currentPage);
  const bgColor = nightMode ? "#1A1A2E" : "#FFFFF5";
  const textColor = nightMode ? "#E8E8D0" : "#1B1B1B";
  const headerBg = nightMode ? "#0F0F1F" : "#1B4332";

  // Render page content using WebView with CDN fonts
  const renderPageContent = () => {
    if (loading) {
      return (
        <View style={st.loadingContainer}>
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
      );
    }

    // If we have CDN font words, use WebView for high-quality rendering
    if (pageWords.length > 0) {
      const html = generateMushafHTML(
        currentPage,
        pageWords,
        nightMode,
        fontSize,
      );
      return (
        <WebView
          ref={webViewRef}
          source={{ html }}
          style={{ flex: 1, backgroundColor: bgColor, margin: 0, padding: 0 }}
          scrollEnabled={false}
          onMessage={handleWebViewMessage}
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

    // Fallback: render with text (when API fails)
    return (
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
          {pageAyahs.map((ayah) => (
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
    );
  };

  // Render index modal
  const renderIndex = () => (
    <Modal visible={showIndex} animationType="slide" transparent={false}>
      <View
        style={[
          st.modalContainer,
          { paddingTop: insets.top, backgroundColor: bgColor },
        ]}
      >
        <View style={[st.modalHeader, { backgroundColor: headerBg }]}>
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
        <FlatList
          data={SURAH_LIST}
          keyExtractor={(item) => String(item.number)}
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                setCurrentPage(item.startPage);
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
      </View>
    </Modal>
  );

  // Render settings modal
  const renderSettings = () => (
    <Modal visible={showSettings} animationType="slide" transparent>
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
          <View style={st.settingsRow}>
            <Text style={[st.settingsLabel, { color: textColor }]}>
              {tx(lang, "Lettergrootte", "Font Size", "حجم الخط")}
            </Text>
            <View style={st.fontSizeControls}>
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
          <View style={st.settingsRow}>
            <Text style={[st.settingsLabel, { color: textColor }]}>
              {tx(lang, "Nachtmodus", "Night Mode", "الوضع الليلي")}
            </Text>
            <Pressable
              onPress={() => setNightMode(!nightMode)}
              style={[st.toggleBtn, nightMode && st.toggleBtnActive]}
            >
              <Text style={[st.toggleBtnText, nightMode && { color: "#FFF" }]}>
                {nightMode
                  ? tx(lang, "Aan", "On", "مفعّل")
                  : tx(lang, "Uit", "Off", "معطّل")}
              </Text>
            </Pressable>
          </View>
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
    <Modal visible={showScienceModal} animationType="slide" transparent>
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
          <View style={st.toolbarRow}>
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
                {tx(lang, "Pagina", "Page", "صفحة")} {currentPage} /{" "}
                {TOTAL_PAGES} - {tx(lang, "Juz", "Juz", "جزء")} {currentJuz}
              </Text>
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

      {/* Page content */}
      <View style={{ flex: 1 }}>{renderPageContent()}</View>

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
    flexDirection: "row",
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

  // Mushaf text (fallback)
  mushafText: { textAlign: "justify", writingDirection: "rtl" },

  // Index modal
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  modalHeaderTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "700" },
  closeBtn: { padding: 4 },
  indexItem: {
    flexDirection: "row",
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  settingsLabel: { fontSize: 14, fontWeight: "600" },
  fontSizeControls: { flexDirection: "row", alignItems: "center" },
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
    flexDirection: "row",
    justifyContent: "center",
    borderBottomWidth: 1,
    paddingBottom: 0,
  },
  scienceTabItem: { paddingHorizontal: 18, paddingVertical: 10 },
  scienceTabItemActive: { borderBottomWidth: 2, borderBottomColor: "#1B4332" },
  scienceTabItemText: { fontSize: 14, fontWeight: "600" },
  scienceTabItemTextActive: { fontWeight: "800" },
  tafsirSourceRow: {
    flexDirection: "row",
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
    flexDirection: "row",
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
