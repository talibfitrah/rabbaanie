// Shared prayer data: cities database, calculation methods, and helpers

export interface CityData {
  name: string;
  lat: number;
  lng: number;
}

export interface CountryData {
  flag: string;
  tz: string;
  cities: CityData[];
}

export interface CalcMethod {
  id: string;
  name: string;
  nameAr: string;
  fajrAngle: number;
  ishaAngle: number;
  ishaMinutes?: number;
  asrFactor: number;
  region: string;
}

export interface SavedPrayerLocation {
  country: string;
  city: string;
  lat: number;
  lng: number;
  tz: string;
}

export const PRAYER_LOCATION_KEY = "@prayer_location";
export const PRAYER_METHOD_KEY = "@prayer_method";

// ============ CALCULATION METHODS ============

export const CALC_METHODS: CalcMethod[] = [
  { id: "uoif", name: "UOIF (France)", nameAr: "اتحاد المنظمات الإسلامية فرنسا", fajrAngle: 12, ishaAngle: 12, asrFactor: 1, region: "France, West Europe" },
  { id: "mwl", name: "Muslim World League", nameAr: "رابطة العالم الإسلامي", fajrAngle: 18, ishaAngle: 17, asrFactor: 1, region: "Europe, Far East, parts of US" },
  { id: "isna", name: "ISNA (North America)", nameAr: "الجمعية الإسلامية لأمريكا الشمالية", fajrAngle: 15, ishaAngle: 15, asrFactor: 1, region: "North America" },
  { id: "egypt", name: "Egyptian General Authority", nameAr: "الهيئة المصرية العامة للمساحة", fajrAngle: 19.5, ishaAngle: 17.5, asrFactor: 1, region: "Africa, Syria, Lebanon, Malaysia" },
  { id: "makkah", name: "Umm al-Qura (Makkah)", nameAr: "أم القرى", fajrAngle: 18.5, ishaAngle: 0, ishaMinutes: 90, asrFactor: 1, region: "Arabian Peninsula" },
  { id: "karachi", name: "University of Islamic Sciences, Karachi", nameAr: "جامعة العلوم الإسلامية كراتشي", fajrAngle: 18, ishaAngle: 18, asrFactor: 1, region: "Pakistan, Bangladesh, India, Afghanistan" },
  { id: "tehran", name: "Institute of Geophysics, Tehran", nameAr: "مؤسسة الجيوفيزياء طهران", fajrAngle: 17.7, ishaAngle: 14, asrFactor: 1, region: "Iran, Some Shia communities" },
  { id: "jafari", name: "Shia Ithna-Ashari (Jafari)", nameAr: "الشيعة الإثنا عشرية", fajrAngle: 16, ishaAngle: 14, asrFactor: 1, region: "Shia communities worldwide" },
  { id: "diyanet", name: "Diyanet (Turkey)", nameAr: "رئاسة الشؤون الدينية التركية", fajrAngle: 18, ishaAngle: 17, asrFactor: 1, region: "Turkey, Turkish communities" },
  { id: "morocco", name: "Ministry of Habous, Morocco", nameAr: "وزارة الأوقاف المغربية", fajrAngle: 19, ishaAngle: 17, asrFactor: 1, region: "Morocco" },
  { id: "algeria", name: "Ministry of Religious Affairs, Algeria", nameAr: "وزارة الشؤون الدينية الجزائرية", fajrAngle: 18, ishaAngle: 17, asrFactor: 1, region: "Algeria" },
  { id: "tunisia", name: "Ministry of Religious Affairs, Tunisia", nameAr: "وزارة الشؤون الدينية التونسية", fajrAngle: 18, ishaAngle: 18, asrFactor: 1, region: "Tunisia" },
  { id: "qatar", name: "Qatar Calendar House", nameAr: "دار التقويم القطري", fajrAngle: 18, ishaAngle: 0, ishaMinutes: 90, asrFactor: 1, region: "Qatar" },
  { id: "kuwait", name: "Ministry of Awqaf, Kuwait", nameAr: "وزارة الأوقاف الكويتية", fajrAngle: 18, ishaAngle: 17.5, asrFactor: 1, region: "Kuwait" },
  { id: "singapore", name: "MUIS (Singapore)", nameAr: "مجلس الشؤون الدينية سنغافورة", fajrAngle: 20, ishaAngle: 18, asrFactor: 1, region: "Singapore, Malaysia, Indonesia" },
  { id: "hanafi", name: "Hanafi Asr (with MWL)", nameAr: "العصر الحنفي (مع رابطة العالم)", fajrAngle: 18, ishaAngle: 17, asrFactor: 2, region: "Hanafi communities" },
];

// ============ COUNTRIES DATABASE ============

export const COUNTRIES: Record<string, CountryData> = {
  "Nederland": {
    flag: "\u{1F1F3}\u{1F1F1}",
    tz: "Europe/Amsterdam",
    cities: [
      { name: "Amsterdam", lat: 52.3676, lng: 4.9041 },
      { name: "Rotterdam", lat: 51.9244, lng: 4.4777 },
      { name: "Den Haag", lat: 52.0705, lng: 4.3007 },
      { name: "Utrecht", lat: 52.0907, lng: 5.1214 },
      { name: "Eindhoven", lat: 51.4416, lng: 5.4697 },
      { name: "Tilburg", lat: 51.5555, lng: 5.0913 },
      { name: "Groningen", lat: 53.2194, lng: 6.5665 },
      { name: "Almere", lat: 52.3508, lng: 5.2647 },
      { name: "Breda", lat: 51.5719, lng: 4.7683 },
      { name: "Nijmegen", lat: 51.8126, lng: 5.8372 },
      { name: "Enschede", lat: 52.2215, lng: 6.8937 },
      { name: "Haarlem", lat: 52.3874, lng: 4.6462 },
      { name: "Arnhem", lat: 51.9851, lng: 5.8987 },
      { name: "Amersfoort", lat: 52.1561, lng: 5.3878 },
      { name: "Zaanstad", lat: 52.4559, lng: 4.8287 },
      { name: "Apeldoorn", lat: 52.2112, lng: 5.9699 },
      { name: "Leiden", lat: 52.1601, lng: 4.4970 },
      { name: "Dordrecht", lat: 51.8133, lng: 4.6901 },
      { name: "Zoetermeer", lat: 52.0575, lng: 4.4931 },
      { name: "Deventer", lat: 52.2554, lng: 6.1637 },
    ],
  },
  "België": {
    flag: "\u{1F1E7}\u{1F1EA}",
    tz: "Europe/Brussels",
    cities: [
      { name: "Brussel", lat: 50.8503, lng: 4.3517 },
      { name: "Antwerpen", lat: 51.2194, lng: 4.4025 },
      { name: "Gent", lat: 51.0543, lng: 3.7174 },
      { name: "Charleroi", lat: 50.4108, lng: 4.4446 },
      { name: "Luik", lat: 50.6292, lng: 5.5797 },
      { name: "Brugge", lat: 51.2093, lng: 3.2247 },
      { name: "Namen", lat: 50.4674, lng: 4.8720 },
      { name: "Leuven", lat: 50.8798, lng: 4.7005 },
      { name: "Mechelen", lat: 51.0259, lng: 4.4776 },
      { name: "Genk", lat: 50.9654, lng: 5.5003 },
    ],
  },
  "Frankrijk": {
    flag: "\u{1F1EB}\u{1F1F7}",
    tz: "Europe/Paris",
    cities: [
      { name: "Parijs", lat: 48.8566, lng: 2.3522 },
      { name: "Marseille", lat: 43.2965, lng: 5.3698 },
      { name: "Lyon", lat: 45.7640, lng: 4.8357 },
      { name: "Toulouse", lat: 43.6047, lng: 1.4442 },
      { name: "Nice", lat: 43.7102, lng: 7.2620 },
      { name: "Strasbourg", lat: 48.5734, lng: 7.7521 },
      { name: "Lille", lat: 50.6292, lng: 3.0573 },
      { name: "Bordeaux", lat: 44.8378, lng: -0.5792 },
      { name: "Nantes", lat: 47.2184, lng: -1.5536 },
      { name: "Rennes", lat: 48.1173, lng: -1.6778 },
    ],
  },
  "Duitsland": {
    flag: "\u{1F1E9}\u{1F1EA}",
    tz: "Europe/Berlin",
    cities: [
      { name: "Berlijn", lat: 52.5200, lng: 13.4050 },
      { name: "Hamburg", lat: 53.5511, lng: 9.9937 },
      { name: "München", lat: 48.1351, lng: 11.5820 },
      { name: "Keulen", lat: 50.9375, lng: 6.9603 },
      { name: "Frankfurt", lat: 50.1109, lng: 8.6821 },
      { name: "Stuttgart", lat: 48.7758, lng: 9.1829 },
      { name: "Düsseldorf", lat: 51.2277, lng: 6.7735 },
      { name: "Dortmund", lat: 51.5136, lng: 7.4653 },
      { name: "Essen", lat: 51.4556, lng: 7.0116 },
      { name: "Bremen", lat: 53.0793, lng: 8.8017 },
    ],
  },
  "Verenigd Koninkrijk": {
    flag: "\u{1F1EC}\u{1F1E7}",
    tz: "Europe/London",
    cities: [
      { name: "London", lat: 51.5074, lng: -0.1278 },
      { name: "Birmingham", lat: 52.4862, lng: -1.8904 },
      { name: "Manchester", lat: 53.4808, lng: -2.2426 },
      { name: "Leeds", lat: 53.8008, lng: -1.5491 },
      { name: "Bradford", lat: 53.7960, lng: -1.7594 },
      { name: "Leicester", lat: 52.6369, lng: -1.1398 },
      { name: "Glasgow", lat: 55.8642, lng: -4.2518 },
      { name: "Edinburgh", lat: 55.9533, lng: -3.1883 },
      { name: "Cardiff", lat: 51.4816, lng: -3.1791 },
      { name: "Sheffield", lat: 53.3811, lng: -1.4701 },
    ],
  },
  "Marokko": {
    flag: "\u{1F1F2}\u{1F1E6}",
    tz: "Africa/Casablanca",
    cities: [
      { name: "Casablanca", lat: 33.5731, lng: -7.5898 },
      { name: "Rabat", lat: 34.0209, lng: -6.8416 },
      { name: "Fes", lat: 34.0181, lng: -5.0078 },
      { name: "Marrakech", lat: 31.6295, lng: -7.9811 },
      { name: "Tanger", lat: 35.7595, lng: -5.8340 },
      { name: "Agadir", lat: 30.4278, lng: -9.5981 },
      { name: "Oujda", lat: 34.6867, lng: -1.9114 },
      { name: "Nador", lat: 35.1688, lng: -2.9330 },
      { name: "Tetouan", lat: 35.5889, lng: -5.3626 },
      { name: "Meknes", lat: 33.8935, lng: -5.5473 },
      { name: "Kenitra", lat: 34.2610, lng: -6.5802 },
      { name: "Salé", lat: 34.0531, lng: -6.7985 },
      { name: "Beni Mellal", lat: 32.3373, lng: -6.3498 },
      { name: "Khouribga", lat: 32.8811, lng: -6.9063 },
      { name: "El Jadida", lat: 33.2316, lng: -8.5007 },
      { name: "Safi", lat: 32.2994, lng: -9.2372 },
      { name: "Mohammedia", lat: 33.6861, lng: -7.3828 },
      { name: "Settat", lat: 33.0011, lng: -7.6166 },
      { name: "Berkane", lat: 34.9200, lng: -2.3200 },
      { name: "Taza", lat: 34.2100, lng: -4.0100 },
      { name: "Larache", lat: 35.1932, lng: -6.1561 },
      { name: "Khemisset", lat: 33.8242, lng: -6.0664 },
      { name: "Errachidia", lat: 31.9314, lng: -4.4288 },
      { name: "Guelmim", lat: 28.9833, lng: -10.0500 },
      { name: "Ksar el-Kebir", lat: 35.0000, lng: -5.9000 },
      { name: "Taourirt", lat: 34.4100, lng: -2.8900 },
      { name: "Ouarzazate", lat: 30.9200, lng: -6.9000 },
      { name: "Tiznit", lat: 29.6974, lng: -9.8022 },
      { name: "Taroudant", lat: 30.4700, lng: -8.8800 },
      { name: "Al Hoceima", lat: 35.2517, lng: -3.9372 },
    ],
  },
  "Turkije": {
    flag: "\u{1F1F9}\u{1F1F7}",
    tz: "Europe/Istanbul",
    cities: [
      { name: "Istanbul", lat: 41.0082, lng: 28.9784 },
      { name: "Ankara", lat: 39.9334, lng: 32.8597 },
      { name: "Izmir", lat: 38.4237, lng: 27.1428 },
      { name: "Bursa", lat: 40.1885, lng: 29.0610 },
      { name: "Antalya", lat: 36.8969, lng: 30.7133 },
      { name: "Konya", lat: 37.8746, lng: 32.4932 },
      { name: "Adana", lat: 37.0000, lng: 35.3213 },
      { name: "Gaziantep", lat: 37.0662, lng: 37.3833 },
      { name: "Diyarbakir", lat: 37.9144, lng: 40.2306 },
      { name: "Kayseri", lat: 38.7312, lng: 35.4787 },
    ],
  },
  "Saoedi-Arabië": {
    flag: "\u{1F1F8}\u{1F1E6}",
    tz: "Asia/Riyadh",
    cities: [
      { name: "Mekka", lat: 21.3891, lng: 39.8579 },
      { name: "Medina", lat: 24.5247, lng: 39.5692 },
      { name: "Riyadh", lat: 24.7136, lng: 46.6753 },
      { name: "Jeddah", lat: 21.4858, lng: 39.1925 },
      { name: "Dammam", lat: 26.4207, lng: 50.0888 },
      { name: "Taif", lat: 21.2703, lng: 40.4158 },
      { name: "Tabuk", lat: 28.3838, lng: 36.5550 },
      { name: "Abha", lat: 18.2164, lng: 42.5053 },
    ],
  },
  "Egypte": {
    flag: "\u{1F1EA}\u{1F1EC}",
    tz: "Africa/Cairo",
    cities: [
      { name: "Cairo", lat: 30.0444, lng: 31.2357 },
      { name: "Alexandrië", lat: 31.2001, lng: 29.9187 },
      { name: "Giza", lat: 30.0131, lng: 31.2089 },
      { name: "Luxor", lat: 25.6872, lng: 32.6396 },
      { name: "Aswan", lat: 24.0889, lng: 32.8998 },
      { name: "Mansoura", lat: 31.0409, lng: 31.3785 },
    ],
  },
  "Algerije": {
    flag: "\u{1F1E9}\u{1F1FF}",
    tz: "Africa/Algiers",
    cities: [
      { name: "Algiers", lat: 36.7538, lng: 3.0588 },
      { name: "Oran", lat: 35.6969, lng: -0.6331 },
      { name: "Constantine", lat: 36.3650, lng: 6.6147 },
      { name: "Annaba", lat: 36.9000, lng: 7.7667 },
      { name: "Blida", lat: 36.4700, lng: 2.8300 },
      { name: "Setif", lat: 36.1898, lng: 5.4108 },
    ],
  },
  "Tunesië": {
    flag: "\u{1F1F9}\u{1F1F3}",
    tz: "Africa/Tunis",
    cities: [
      { name: "Tunis", lat: 36.8065, lng: 10.1815 },
      { name: "Sfax", lat: 34.7406, lng: 10.7603 },
      { name: "Sousse", lat: 35.8256, lng: 10.6369 },
      { name: "Kairouan", lat: 35.6781, lng: 10.0963 },
      { name: "Bizerte", lat: 37.2746, lng: 9.8739 },
    ],
  },
  "Irak": {
    flag: "\u{1F1EE}\u{1F1F6}",
    tz: "Asia/Baghdad",
    cities: [
      { name: "Bagdad", lat: 33.3152, lng: 44.3661 },
      { name: "Basra", lat: 30.5085, lng: 47.7804 },
      { name: "Erbil", lat: 36.1901, lng: 44.0119 },
      { name: "Mosul", lat: 36.3566, lng: 43.1592 },
      { name: "Najaf", lat: 32.0000, lng: 44.3360 },
      { name: "Karbala", lat: 32.6160, lng: 44.0249 },
    ],
  },
  "Somalië": {
    flag: "\u{1F1F8}\u{1F1F4}",
    tz: "Africa/Mogadishu",
    cities: [
      { name: "Mogadishu", lat: 2.0469, lng: 45.3182 },
      { name: "Hargeisa", lat: 9.5600, lng: 44.0650 },
      { name: "Kismayo", lat: -0.3522, lng: 42.5428 },
      { name: "Berbera", lat: 10.4394, lng: 45.0368 },
    ],
  },
  "Indonesië": {
    flag: "\u{1F1EE}\u{1F1E9}",
    tz: "Asia/Jakarta",
    cities: [
      { name: "Jakarta", lat: -6.2088, lng: 106.8456 },
      { name: "Surabaya", lat: -7.2575, lng: 112.7521 },
      { name: "Bandung", lat: -6.9175, lng: 107.6191 },
      { name: "Medan", lat: 3.5952, lng: 98.6722 },
      { name: "Yogyakarta", lat: -7.7956, lng: 110.3695 },
      { name: "Makassar", lat: -5.1477, lng: 119.4327 },
    ],
  },
};

export const COUNTRY_NAMES = Object.keys(COUNTRIES);

// ============ ARABIC TRANSLATIONS ============

export const COUNTRY_NAMES_AR: Record<string, string> = {
  "Nederland": "هولندا",
  "Belgi\u00eb": "بلجيكا",
  "Frankrijk": "فرنسا",
  "Duitsland": "ألمانيا",
  "Verenigd Koninkrijk": "المملكة المتحدة",
  "Marokko": "المغرب",
  "Turkije": "تركيا",
  "Saoedi-Arabi\u00eb": "المملكة العربية السعودية",
  "Egypte": "مصر",
  "Algerije": "الجزائر",
  "Tunesi\u00eb": "تونس",
  "Irak": "العراق",
  "Somali\u00eb": "الصومال",
  "Indonesi\u00eb": "إندونيسيا",
};

export const CITY_NAMES_AR: Record<string, string> = {
  // Nederland
  "Amsterdam": "أمستردام",
  "Rotterdam": "روتردام",
  "Den Haag": "لاهاي",
  "Utrecht": "أوتريخت",
  "Eindhoven": "آيندهوفن",
  "Tilburg": "تيلبورخ",
  "Groningen": "خرونينخن",
  "Almere": "ألميره",
  "Breda": "بريدا",
  "Nijmegen": "نيميخن",
  "Enschede": "إنسخخيده",
  "Haarlem": "هارلم",
  "Arnhem": "أرنهم",
  "Amersfoort": "أميرسفورت",
  "Zaanstad": "زانستاد",
  "Apeldoorn": "أبلدورن",
  "Leiden": "ليدن",
  "Dordrecht": "دوردريخت",
  "Zoetermeer": "زوترمير",
  "Deventer": "ديفنتر",
  // Belgi\u00eb
  "Brussel": "بروكسل",
  "Antwerpen": "أنتويرب",
  "Gent": "غنت",
  "Charleroi": "شارلروا",
  "Luik": "لييج",
  "Brugge": "بروج",
  "Namen": "نامور",
  "Leuven": "لوفان",
  "Mechelen": "ميخلن",
  "Genk": "خنك",
  // Frankrijk
  "Parijs": "باريس",
  "Marseille": "مارسيليا",
  "Lyon": "ليون",
  "Toulouse": "تولوز",
  "Nice": "نيس",
  "Strasbourg": "ستراسبورغ",
  "Lille": "ليل",
  "Bordeaux": "بوردو",
  "Nantes": "نانت",
  "Rennes": "رين",
  // Duitsland
  "Berlijn": "برلين",
  "Hamburg": "هامبورغ",
  "M\u00fcnchen": "ميونخ",
  "Keulen": "كولونيا",
  "Frankfurt": "فرانكفورت",
  "Stuttgart": "شتوتغارت",
  "D\u00fcsseldorf": "دوسلدورف",
  "Dortmund": "دورتموند",
  "Essen": "إيسن",
  "Bremen": "بريمن",
  // Verenigd Koninkrijk
  "London": "لندن",
  "Birmingham": "برمنغهام",
  "Manchester": "مانشستر",
  "Leeds": "ليدز",
  "Bradford": "برادفورد",
  "Leicester": "ليستر",
  "Glasgow": "غلاسكو",
  "Edinburgh": "إدنبرة",
  "Cardiff": "كارديف",
  "Sheffield": "شيفيلد",
  // Marokko
  "Casablanca": "الدار البيضاء",
  "Rabat": "الرباط",
  "Fes": "فاس",
  "Marrakech": "مراكش",
  "Tanger": "طنجة",
  "Agadir": "أكادير",
  "Oujda": "وجدة",
  "Nador": "الناظور",
  "Tetouan": "تطوان",
  "Meknes": "مكناس",
  "Kenitra": "القنيطرة",
  "Sal\u00e9": "سلا",
  "Beni Mellal": "بني ملال",
  "Khouribga": "خريبكة",
  "El Jadida": "الجديدة",
  "Safi": "آسفي",
  "Mohammedia": "المحمدية",
  "Settat": "سطات",
  "Berkane": "بركان",
  "Taza": "تازة",
  "Larache": "العرائش",
  "Khemisset": "الخميسات",
  "Errachidia": "الراشيدية",
  "Guelmim": "كلميم",
  "Ksar el-Kebir": "القصر الكبير",
  "Taourirt": "تاوريرت",
  "Ouarzazate": "ورزازات",
  "Tiznit": "تزنيت",
  "Taroudant": "تارودانت",
  "Al Hoceima": "الحسيمة",
  // Turkije
  "Istanbul": "إسطنبول",
  "Ankara": "أنقرة",
  "Izmir": "إزمير",
  "Bursa": "بورصة",
  "Antalya": "أنطاليا",
  "Konya": "قونية",
  "Adana": "أضنة",
  "Gaziantep": "غازي عنتاب",
  "Diyarbakir": "ديار بكر",
  "Kayseri": "قيصرية",
  // Saoedi-Arabi\u00eb
  "Mekka": "مكة المكرمة",
  "Medina": "المدينة المنورة",
  "Riyadh": "الرياض",
  "Jeddah": "جدة",
  "Dammam": "الدمام",
  "Taif": "الطائف",
  "Tabuk": "تبوك",
  "Abha": "أبها",
  // Egypte
  "Cairo": "القاهرة",
  "Alexandri\u00eb": "الإسكندرية",
  "Giza": "الجيزة",
  "Luxor": "الأقصر",
  "Aswan": "أسوان",
  "Mansoura": "المنصورة",
  // Algerije
  "Algiers": "الجزائر العاصمة",
  "Oran": "وهران",
  "Constantine": "قسنطينة",
  "Annaba": "عنابة",
  "Blida": "البليدة",
  "Setif": "سطيف",
  // Tunesi\u00eb
  "Tunis": "تونس العاصمة",
  "Sfax": "صفاقس",
  "Sousse": "سوسة",
  "Kairouan": "القيروان",
  "Bizerte": "بنزرت",
  // Irak
  "Bagdad": "بغداد",
  "Basra": "البصرة",
  "Erbil": "أربيل",
  "Mosul": "الموصل",
  "Najaf": "النجف",
  "Karbala": "كربلاء",
  // Somali\u00eb
  "Mogadishu": "مقديشو",
  "Hargeisa": "هرجيسا",
  "Kismayo": "كسمايو",
  "Berbera": "بربرة",
  // Indonesi\u00eb
  "Jakarta": "جاكرتا",
  "Surabaya": "سورابايا",
  "Bandung": "باندونغ",
  "Medan": "ميدان",
  "Yogyakarta": "يوغياكرتا",
  "Makassar": "ماكاسار",
};

/** Get Arabic display name for a country, falling back to original */
export function getCountryAR(name: string): string {
  return COUNTRY_NAMES_AR[name] || name;
}

/** Get Arabic display name for a city, falling back to original */
export function getCityAR(name: string): string {
  return CITY_NAMES_AR[name] || name;
}

// ============ CALCULATION HELPERS ============

function toRad(deg: number): number { return deg * Math.PI / 180; }
function toDeg(rad: number): number { return rad * 180 / Math.PI; }

// Hardcoded base UTC offsets for supported timezones
// DST is approximated: Europe (last Sun Mar -> last Sun Oct), Morocco (varies)
const TZ_BASE_OFFSETS: Record<string, number> = {
  "Europe/Amsterdam": 1,
  "Europe/Brussels": 1,
  "Europe/Paris": 1,
  "Europe/Berlin": 1,
  "Europe/London": 0,
  "Europe/Istanbul": 3,
  "Africa/Casablanca": 1,
  "Africa/Cairo": 2,
  "Africa/Algiers": 1,
  "Africa/Tunis": 1,
  "Africa/Mogadishu": 3,
  "Asia/Riyadh": 3,
  "Asia/Baghdad": 3,
  "Asia/Jakarta": 7,
};

// Check if date is in European DST (last Sunday of March to last Sunday of October)
function isEuropeanDST(date: Date): boolean {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed
  if (month < 2 || month > 9) return false; // Jan, Feb, Nov, Dec = no DST
  if (month > 2 && month < 9) return true; // Apr-Sep = DST
  // March: DST starts last Sunday
  if (month === 2) {
    const lastDay = new Date(year, 3, 0).getDate();
    const lastSunday = lastDay - new Date(year, 2, lastDay).getDay();
    return date.getDate() >= lastSunday;
  }
  // October: DST ends last Sunday
  const lastDay = new Date(year, 10, 0).getDate();
  const lastSunday = lastDay - new Date(year, 9, lastDay).getDay();
  return date.getDate() < lastSunday;
}

export function getTimezoneOffsetHours(timezone: string, date: Date): number {
  // First try the reliable toLocaleString method
  try {
    const utcStr = date.toLocaleString("en-US", { timeZone: "UTC" });
    const tzStr = date.toLocaleString("en-US", { timeZone: timezone });
    const utcDate = new Date(utcStr);
    const tzDate = new Date(tzStr);
    const diff = (tzDate.getTime() - utcDate.getTime()) / (1000 * 60 * 60);
    // Validate: if result is NaN or unreasonable, fall through to hardcoded
    if (!isNaN(diff) && diff >= -12 && diff <= 14) return diff;
  } catch (_) {
    // toLocaleString with timeZone not supported (Hermes)
  }

  // Fallback: use hardcoded offsets + DST approximation
  const baseOffset = TZ_BASE_OFFSETS[timezone];
  if (baseOffset === undefined) {
    // Unknown timezone, try to extract from device
    return -(date.getTimezoneOffset() / 60);
  }

  // Apply DST for European timezones (not for Africa/Asia which mostly don't observe DST)
  const europeanTZs = ["Europe/Amsterdam", "Europe/Brussels", "Europe/Paris", "Europe/Berlin", "Europe/London"];
  if (europeanTZs.includes(timezone) && isEuropeanDST(date)) {
    return baseOffset + 1;
  }

  // Morocco: DST during Ramadan is suspended, otherwise +1 in summer
  // Simplified: Morocco uses UTC+1 year-round since 2018 (no more DST changes)
  // Africa/Casablanca is UTC+1 permanently
  return baseOffset;
}

export interface PrayerTimesResult {
  fajr: string;
  sunrise: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
}

function formatTime(hours: number): string {
  const h = Math.floor(hours) % 24;
  const m = Math.round((hours - Math.floor(hours)) * 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

export function calculatePrayerTimes(date: Date, lat: number, lng: number, method: CalcMethod, timezone: string): PrayerTimesResult {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  // Julian date
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  const jd = day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;

  const d = jd - 2451545.0;
  const gRaw = 357.529 + 0.98560028 * d;
  const g = ((gRaw % 360) + 360) % 360;
  const qRaw = 280.459 + 0.98564736 * d;
  const q = ((qRaw % 360) + 360) % 360;
  const L = q + 1.915 * Math.sin(toRad(g)) + 0.020 * Math.sin(toRad(2 * g));
  const e = 23.439 - 0.00000036 * d;
  const decl = toDeg(Math.asin(Math.sin(toRad(e)) * Math.sin(toRad(L))));
  const RA = toDeg(Math.atan2(Math.cos(toRad(e)) * Math.sin(toRad(L)), Math.cos(toRad(L)))) / 15;
  let EqT = q / 15 - RA;
  // Normalize EqT to ±12 hours range
  while (EqT > 12) EqT -= 24;
  while (EqT < -12) EqT += 24;

  const tzOffset = getTimezoneOffsetHours(timezone, date);
  const dhuhrTime = 12 + tzOffset - lng / 15 - EqT;

  // Sun angle helper
  function sunAngleTime(angle: number, beforeDhuhr: boolean): number {
    const cosHA = (Math.sin(toRad(-angle)) - Math.sin(toRad(lat)) * Math.sin(toRad(decl))) /
      (Math.cos(toRad(lat)) * Math.cos(toRad(decl)));
    if (cosHA > 1 || cosHA < -1) return beforeDhuhr ? dhuhrTime - 1 : dhuhrTime + 1;
    const HA = toDeg(Math.acos(cosHA)) / 15;
    return beforeDhuhr ? dhuhrTime - HA : dhuhrTime + HA;
  }

  const sunrise = sunAngleTime(0.833, true);
  const fajr = sunAngleTime(method.fajrAngle, true);
  const maghrib = sunAngleTime(0.833, false);
  let isha: number;
  if (method.ishaMinutes) {
    isha = maghrib + method.ishaMinutes / 60;
  } else {
    isha = sunAngleTime(method.ishaAngle, false);
  }

  // Asr: asrAngle is the sun's ALTITUDE, sunAngleTime expects angle below horizon
  const tanAsr = Math.tan(toRad(Math.abs(lat - decl)));
  const asrAngle = toDeg(Math.atan(1 / (method.asrFactor + tanAsr)));
  const asr = sunAngleTime(-asrAngle, false);

  return {
    fajr: formatTime(fajr),
    sunrise: formatTime(sunrise),
    dhuhr: formatTime(dhuhrTime),
    asr: formatTime(asr),
    maghrib: formatTime(maghrib),
    isha: formatTime(isha),
  };
}

export function getCurrentMinutesInTimezone(now: Date, timezone: string): number {
  // Try the standard Intl approach first
  try {
    const tzStr = now.toLocaleString("en-US", { timeZone: timezone, hour12: false, hour: "2-digit", minute: "2-digit" });
    const parts = tzStr.split(":").map(Number);
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return parts[0] * 60 + parts[1];
    }
  } catch (_) {}

  // Fallback: calculate from UTC + offset
  const offset = getTimezoneOffsetHours(timezone, now);
  const utcHours = now.getUTCHours();
  const utcMinutes = now.getUTCMinutes();
  let totalMinutes = (utcHours + offset) * 60 + utcMinutes;
  // Normalize to 0-1439 range
  totalMinutes = ((totalMinutes % 1440) + 1440) % 1440;
  return totalMinutes;
}

export function getNextPrayer(times: PrayerTimesResult, now: Date, timezone: string): string | null {
  const curMin = getCurrentMinutesInTimezone(now, timezone);
  const prayers = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"] as const;
  for (const p of prayers) {
    const [h, m] = times[p].split(":").map(Number);
    if (h * 60 + m > curMin) return p;
  }
  return "fajr"; // After isha, next is fajr
}

// Hijri date calculation
export function getIslamicDate(now: Date, maghribTime: string | null, timezone?: string): { day: number; month: number; monthName: string; monthNameAR: string; year: number } {
  const HIJRI_MONTHS = [
    "Muharram", "Safar", "Rabi' al-Awwal", "Rabi' al-Thani",
    "Jumada al-Ula", "Jumada al-Thani", "Rajab", "Sha'ban",
    "Ramadan", "Shawwal", "Dhul-Qi'dah", "Dhul-Hijjah"
  ];
  const HIJRI_MONTHS_AR = [
    "المحرّم", "صفر", "ربيع الأول", "ربيع الثاني",
    "جمادى الأولى", "جمادى الثانية", "رجب", "شعبان",
    "رمضان", "شوال", "ذو القعدة", "ذو الحجة"
  ];

  // Check if past Maghrib (Islamic day starts at Maghrib)
  let addDay = false;
  if (maghribTime && timezone) {
    const curMin = getCurrentMinutesInTimezone(now, timezone);
    const [mH, mM] = maghribTime.split(":").map(Number);
    if (curMin >= mH * 60 + mM) addDay = true;
  }

  const dateToConvert = new Date(now);
  if (addDay) dateToConvert.setDate(dateToConvert.getDate() + 1);

  const gYear = dateToConvert.getFullYear();
  const gMonth = dateToConvert.getMonth() + 1;
  const gDay = dateToConvert.getDate();

  const jd = Math.floor((1461 * (gYear + 4800 + Math.floor((gMonth - 14) / 12))) / 4) +
    Math.floor((367 * (gMonth - 2 - 12 * Math.floor((gMonth - 14) / 12))) / 12) -
    Math.floor((3 * Math.floor((gYear + 4900 + Math.floor((gMonth - 14) / 12)) / 100)) / 4) + gDay - 32075;

  const l = (jd - 2) - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  const lRem = l - 10631 * n + 354;
  const j = Math.floor((10985 - lRem) / 5316) * Math.floor((50 * lRem) / 17719) + Math.floor(lRem / 5670) * Math.floor((43 * lRem) / 15238);
  const lFinal = lRem - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) - Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
  const hMonth = Math.floor((24 * lFinal) / 709);
  const hDay = lFinal - Math.floor((709 * hMonth) / 24);
  const hYear = 30 * n + j - 30;

  return { day: hDay, month: hMonth, monthName: HIJRI_MONTHS[hMonth - 1] || "", monthNameAR: HIJRI_MONTHS_AR[hMonth - 1] || "", year: hYear };
}
