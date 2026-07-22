/**
 * Transcription Table for Islamic/Arabic Terms
 * Based on the official Transcriptietabel provided by the user.
 * 
 * Key rules:
 * - ا (Alif) = aa (long a as in "baan")
 * - ث (Thaa) = th (as in "thanks")
 * - ج (DJiem) = dj (as in "djinn")
 * - ح (Haa) = h (as in "Hadj") - note: different from ه
 * - خ (KHaa) = kh (as in "KHaalid")
 * - ذ (Dhaal) = dh (as in "weather")
 * - ش (Shien) = sh (as in "shoarma")
 * - ص (Saad) = s (as in "Salaah")
 * - ض (Daad) = d (as in "al-Ard")
 * - ط (Taa) = t (as in "shaytaan")
 * - ظ (dhaad) = dh (as in "al-DHur")
 * - ع (3ayn) = 3 (throat sound as in "3alie")
 * - غ (Ghayn) = gh (as in "al-GHafoer")
 * - ق (Qaf) = q (as in "Qatar")
 * - ه (Haa) = h (as in "hand")
 * - ء (Hamza) = ' (glottal stop)
 * - Sheddah doubles the letter
 * 
 * Vowels:
 * - Fathah (short) = a, Fathah (long) = aa
 * - Kasrah (short) = i, Kasrah (long) = ie
 * - Dammah (short) = u, Dammah (long) = oe
 * 
 * Common terms with correct transcription:
 */

export const ISLAMIC_TERMS_TRANSCRIPTION: Record<string, { nl: string; en: string }> = {
  // Names of Allah
  "الله": { nl: "Allaah", en: "Allaah" },
  "الرحمن": { nl: "ar-Rahmaan", en: "ar-Rahmaan" },
  "الرحيم": { nl: "ar-Rahiem", en: "ar-Raheem" },
  "الغفور": { nl: "al-GHafoer", en: "al-Ghafoor" },
  "العليم": { nl: "al-3aliem", en: "al-3Aleem" },
  "السميع": { nl: "as-Samie3", en: "as-Samee3" },
  "البصير": { nl: "al-Basier", en: "al-Baseer" },
  "الحكيم": { nl: "al-Hakiem", en: "al-Hakeem" },
  "القدير": { nl: "al-Qadier", en: "al-Qadeer" },
  "الكريم": { nl: "al-Kariem", en: "al-Kareem" },
  
  // Prophets
  "محمد": { nl: "Muhammad", en: "Muhammad" },
  "إبراهيم": { nl: "Ibraahiem", en: "Ibraaheem" },
  "موسى": { nl: "Moesaa", en: "Moosaa" },
  "عيسى": { nl: "3Iesaa", en: "3Eesaa" },
  "نوح": { nl: "Noeh", en: "Nooh" },
  
  // Islamic concepts
  "القرآن": { nl: "al-Qur'aan", en: "al-Qur'aan" },
  "الحديث": { nl: "al-Hadieth", en: "al-Hadeeth" },
  "السنة": { nl: "as-Soennah", en: "as-Sunnah" },
  "الفطرة": { nl: "al-Fitrah", en: "al-Fitrah" },
  "التوحيد": { nl: "at-Tawhied", en: "at-Tawheed" },
  "الإيمان": { nl: "al-Iemaan", en: "al-Eemaan" },
  "الإسلام": { nl: "al-Islaam", en: "al-Islaam" },
  "الإحسان": { nl: "al-Ihsaan", en: "al-Ihsaan" },
  "التقوى": { nl: "at-Taqwaa", en: "at-Taqwaa" },
  "الصلاة": { nl: "as-Salaah", en: "as-Salaah" },
  "الزكاة": { nl: "az-Zakaah", en: "az-Zakaah" },
  "الصيام": { nl: "as-Siyaam", en: "as-Siyaam" },
  "الحج": { nl: "al-Hadj", en: "al-Hajj" },
  "الجنة": { nl: "al-Djannah", en: "al-Jannah" },
  "النار": { nl: "an-Naar", en: "an-Naar" },
  "الشيطان": { nl: "ash-Shaytaan", en: "ash-Shaytaan" },
  "الوضوء": { nl: "al-Wudoe'", en: "al-Wudoo'" },
  "الدعاء": { nl: "ad-Du3aa'", en: "ad-Du3aa'" },
  "الذكر": { nl: "adh-Dhikr", en: "adh-Dhikr" },
  "التوبة": { nl: "at-Tawbah", en: "at-Tawbah" },
  "الاستغفار": { nl: "al-Istighfaar", en: "al-Istighfaar" },
  "الخشوع": { nl: "al-KHushoe3", en: "al-Khushoo3" },
  "الإخلاص": { nl: "al-IKHlaas", en: "al-Ikhlaas" },
  "المراقبة": { nl: "al-Muraaqabah", en: "al-Muraaqabah" },
  "التربية": { nl: "at-Tarbiyah", en: "at-Tarbiyah" },
  "التزكية": { nl: "at-Tazkiyah", en: "at-Tazkiyah" },
  "التصفية": { nl: "at-Tasfiyah", en: "at-Tasfiyah" },
  "الفقه": { nl: "al-Fiqh", en: "al-Fiqh" },
  "العقيدة": { nl: "al-3Aqiedah", en: "al-3Aqeedah" },
  "الشرك": { nl: "ash-Shirk", en: "ash-Shirk" },
  "البدعة": { nl: "al-Bid3ah", en: "al-Bid3ah" },
  "الحلال": { nl: "al-Halaal", en: "al-Halaal" },
  "الحرام": { nl: "al-Haraam", en: "al-Haraam" },
  
  // Prayer-related
  "الفجر": { nl: "al-Fadjr", en: "al-Fajr" },
  "الظهر": { nl: "adh-DHuhr", en: "adh-Dhuhr" },
  "العصر": { nl: "al-3Asr", en: "al-3Asr" },
  "المغرب": { nl: "al-Maghrib", en: "al-Maghrib" },
  "العشاء": { nl: "al-3Ishaa'", en: "al-3Ishaa'" },
  "الأذان": { nl: "al-Adhaan", en: "al-Adhaan" },
  "الإقامة": { nl: "al-Iqaamah", en: "al-Iqaamah" },
  
  // Parenting/Education terms
  "الأدب": { nl: "al-Adab", en: "al-Adab" },
  "الحياء": { nl: "al-Hayaa'", en: "al-Hayaa'" },
  "الصبر": { nl: "as-Sabr", en: "as-Sabr" },
  "الشكر": { nl: "ash-Shukr", en: "ash-Shukr" },
  "التوكل": { nl: "at-Tawakkul", en: "at-Tawakkul" },
  "الرضا": { nl: "ar-Ridaa", en: "ar-Ridaa" },
  "البر": { nl: "al-Birr", en: "al-Birr" },
  "الصدق": { nl: "as-Sidq", en: "as-Sidq" },
  "الأمانة": { nl: "al-Amaanah", en: "al-Amaanah" },
  "العدل": { nl: "al-3Adl", en: "al-3Adl" },
};
