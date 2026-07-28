/**
 * Weather for the user's prayer location via Open-Meteo (free, no API key),
 * with a religiously-framed reflection: weather forecasting is of the matters
 * whose certainty is with Allah alone (akin to al-ghayb), and authentic duas
 * established in the Sunnah for rain/wind/heat/cold/thunder.
 */

export interface WeatherNow {
  temp: number;
  code: number;
  todayMax: number;
  todayMin: number;
  daily: { date: string; max: number; min: number; code: number }[]; // past 7 + next 7
}

export async function fetchWeather(lat: number, lng: number): Promise<WeatherNow | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}`
      + `&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code`
      + `&past_days=7&forecast_days=7&timezone=auto`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const d: any = await r.json();
    const daily = (d.daily?.time || []).map((date: string, i: number) => ({
      date,
      max: Math.round(d.daily.temperature_2m_max[i]),
      min: Math.round(d.daily.temperature_2m_min[i]),
      code: d.daily.weather_code[i],
    }));
    const todayIdx = daily.findIndex((x: any) => x.date === (d.daily?.time || [])[7]); // past_days=7 → index 7 is today
    const today = daily[todayIdx >= 0 ? todayIdx : 7] || daily[0] || { max: 0, min: 0 };
    return {
      temp: Math.round(d.current?.temperature_2m ?? today.max),
      code: d.current?.weather_code ?? today.code ?? 0,
      todayMax: today.max,
      todayMin: today.min,
      daily,
    };
  } catch {
    return null;
  }
}

/** WMO weather code → trilingual label + icon. */
export function weatherLabel(code: number, lang: "ar" | "en" | "nl"): { label: string; icon: string } {
  const m: Record<string, { ar: string; en: string; nl: string; icon: string }> = {
    clear: { ar: "صحو", en: "Clear", nl: "Helder", icon: "wb-sunny" },
    cloud: { ar: "غائم", en: "Cloudy", nl: "Bewolkt", icon: "cloud" },
    fog: { ar: "ضباب", en: "Fog", nl: "Mist", icon: "cloud" },
    rain: { ar: "مطر", en: "Rain", nl: "Regen", icon: "grain" },
    snow: { ar: "ثلج", en: "Snow", nl: "Sneeuw", icon: "ac-unit" },
    storm: { ar: "عاصفة رعدية", en: "Thunderstorm", nl: "Onweer", icon: "flash-on" },
  };
  let k: keyof typeof m | string = "clear";
  if (code === 0) k = "clear";
  else if (code <= 3) k = "cloud";
  else if (code <= 48) k = "fog";
  else if (code <= 67 || (code >= 80 && code <= 82)) k = "rain";
  else if (code <= 77 || (code >= 85 && code <= 86)) k = "snow";
  else if (code >= 95) k = "storm";
  const e = m[k as string] || m.clear;
  return { label: e[lang], icon: e.icon };
}

export interface WeatherReflection { note: string; dua: string; source: string; }

/** Authentic Sunnah dua/reflection matched to the current weather. */
export function weatherReflection(code: number, temp: number, lang: "ar" | "en" | "nl"): WeatherReflection {
  const rain = (code >= 51 && code <= 67) || (code >= 80 && code <= 82);
  const snow = (code >= 71 && code <= 77) || code === 85 || code === 86;
  const storm = code >= 95;
  const hot = temp >= 33, cold = temp <= 3;
  if (storm) return {
    note: tx(lang, "Bij onweer: gedenk Allah.", "At thunder, remember Allah.", "عند الرعد اذكر الله."),
    dua: "سُبْحَانَ الَّذِي يُسَبِّحُ الرَّعْدُ بِحَمْدِهِ وَالْمَلَائِكَةُ مِنْ خِيفَتِهِ",
    source: "أثرٌ عن ابن الزبير رضي الله عنه",
  };
  if (rain) return {
    note: tx(lang, "Regen is een genade; vraag om baat.", "Rain is a mercy; ask for its good.", "المطر رحمة، فادعُ بخيره."),
    dua: "اللَّهُمَّ صَيِّبًا نَافِعًا",
    source: "رواه البخاري (١٠٣٢)",
  };
  if (snow || cold) return {
    note: tx(lang, "Bij kou: gedenk de Hiernamaals.", "In the cold, remember the Hereafter.", "في البرد تذكّر الآخرة."),
    dua: "أَشَدُّ مَا تَجِدُونَ مِنَ الْبَرْدِ مِنْ زَمْهَرِيرِهَا",
    source: "متفق عليه (من حديث اشتكاء النار)",
  };
  if (hot) return {
    note: tx(lang, "Bij hitte: gedenk het Vuur.", "In the heat, remember the Fire.", "في الحرّ تذكّر النار."),
    dua: "أَشَدُّ مَا تَجِدُونَ مِنَ الْحَرِّ مِنْ فَيْحِ جَهَنَّمَ",
    source: "متفق عليه",
  };
  return {
    note: tx(lang, "In de hemel zijn tekenen voor wie nadenkt.", "In the sky are signs for those who reflect.", "في السماء آياتٌ لمن تدبّر."),
    dua: "﴿إِنَّ فِي خَلْقِ السَّمَاوَاتِ وَالْأَرْضِ وَاخْتِلَافِ اللَّيْلِ وَالنَّهَارِ لَآيَاتٍ لِأُولِي الْأَلْبَابِ﴾",
    source: "سورة آل عمران: ١٩٠",
  };
}

/** The forecast is dhann (probable), not certain — certainty is with Allah. */
export function ghaybNote(lang: "ar" | "en" | "nl"): string {
  return tx(lang,
    "Weersverwachting is een inschatting; de zekere kennis is bij Allah alleen.",
    "The forecast is an estimate; certain knowledge is with Allah alone.",
    "التوقّع ظنٌّ لا يقين، وعلمُ الغيب لله وحده.");
}

function tx(lang: "ar" | "en" | "nl", nl: string, en: string, ar: string): string {
  return lang === "ar" ? ar : lang === "en" ? en : nl;
}
