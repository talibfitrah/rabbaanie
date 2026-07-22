import React, { useState, useEffect } from "react";
import { View, Text } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { useAppState } from "@/lib/app-context";
import { useI18n } from "@/lib/i18n";
import { getCityAR, getCountryAR } from "@/lib/prayer-data";

// Hijri calendar conversion (approximate algorithm based on Kuwaiti algorithm)
function gregorianToHijri(gDate: Date): { year: number; month: number; day: number; monthName: string; monthNameAR: string } {
  const d = gDate.getDate();
  const m = gDate.getMonth() + 1;
  const y = gDate.getFullYear();

  const jd = Math.floor((1461 * (y + 4800 + Math.floor((m - 14) / 12))) / 4) +
    Math.floor((367 * (m - 2 - 12 * Math.floor((m - 14) / 12))) / 12) -
    Math.floor((3 * Math.floor((y + 4900 + Math.floor((m - 14) / 12)) / 100)) / 4) +
    d - 32075;

  // Correction: subtract 2 to align with Umm al-Qura / observed calendar
  const l = (jd - 2) - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  const lRem = l - 10631 * n + 354;
  const j = Math.floor((10985 - lRem) / 5316) * Math.floor((50 * lRem) / 17719) +
    Math.floor(lRem / 5670) * Math.floor((43 * lRem) / 15238);
  const lFinal = lRem - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
    Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
  const hMonth = Math.floor((24 * lFinal) / 709);
  const hDay = lFinal - Math.floor((709 * hMonth) / 24);
  const hYear = 30 * n + j - 30;

  const hijriMonthsEN = [
    "Muharram", "Safar", "Rabee' al-Awwal", "Rabee' ath-Thaani",
    "Jumaada al-Oola", "Jumaada ath-Thaaniya", "Rajab", "Sha'baan",
    "Ramadhaan", "Shawwaal", "Dhul-Qi'dah", "Dhul-Hijjah"
  ];
  const hijriMonthsAR = [
    "المحرّم", "صفر", "ربيع الأول", "ربيع الثاني",
    "جمادى الأولى", "جمادى الثانية", "رجب", "شعبان",
    "رمضان", "شوال", "ذو القعدة", "ذو الحجة"
  ];

  return {
    year: hYear,
    month: hMonth,
    day: hDay,
    monthName: hijriMonthsEN[(hMonth - 1) % 12] || "Muharram",
    monthNameAR: hijriMonthsAR[(hMonth - 1) % 12] || "المحرّم",
  };
}

export function DateTimeHeader() {
  const colors = useColors();
  const { state } = useAppState();
  const { language, t } = useI18n();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const daysAr = ["\u0627\u0644\u0623\u062d\u062f", "\u0627\u0644\u0625\u062b\u0646\u064a\u0646", "\u0627\u0644\u062b\u0644\u0627\u062b\u0627\u0621", "\u0627\u0644\u0623\u0631\u0628\u0639\u0627\u0621", "\u0627\u0644\u062e\u0645\u064a\u0633", "\u0627\u0644\u062c\u0645\u0639\u0629", "\u0627\u0644\u0633\u0628\u062a"];
  const daysEn = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const daysNl = ["Zondag", "Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag"];
  const monthsNl = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
  const monthsEn = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const monthsAr = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  const days = language === "ar" ? daysAr : language === "en" ? daysEn : daysNl;
  const months = language === "ar" ? monthsAr : language === "en" ? monthsEn : monthsNl;

  const hijri = gregorianToHijri(now);
  const hijriMonthDisplay = language === "ar" ? hijri.monthNameAR : hijri.monthName;
  const hijriStr = language === "ar"
    ? `${daysAr[now.getDay()]} ${hijri.day} ${hijri.monthNameAR} ${hijri.year} هـ`
    : `${hijri.day} ${hijri.monthName} ${hijri.year} H`;
  const gregStr = `${days[now.getDay()]} ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
  const locale = language === "ar" ? "ar-SA" : language === "en" ? "en-GB" : "nl-NL";
  const timeStr = now.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

  const cityName = state.locationSettings?.city || "";
  const countryName = state.locationSettings?.country || "";
  const displayCity = language === "ar" ? getCityAR(cityName) : cityName;
  const displayCountry = language === "ar" ? getCountryAR(countryName) : countryName;
  const locationStr = displayCity ? `\ud83d\udccd ${displayCity}${displayCountry ? `\u060c ${displayCountry}` : ""}` : "";

  return (
    <View style={{
      backgroundColor: colors.primary + "08",
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      paddingHorizontal: 16,
      paddingVertical: 8,
    }}>
      {/* Location row */}
      {locationStr ? (
        <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "600", marginBottom: 4, textAlign: language === "ar" ? "right" : "left" }}>
          {locationStr}
        </Text>
      ) : null}
      {/* Date/time row */}
      <View style={{ flexDirection: language === "ar" ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "center" }}>
        <View style={{ flex: 1, alignItems: language === "ar" ? "flex-end" : "flex-start" }}>
          <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "600", textAlign: language === "ar" ? "right" : "left" }}>
            {hijriStr}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 10, marginTop: 1, textAlign: language === "ar" ? "right" : "left" }}>
            {gregStr}
          </Text>
        </View>
        <Text style={{ color: colors.primary, fontSize: 16, fontWeight: "700" }}>
          {timeStr}
        </Text>
      </View>
    </View>
  );
}
