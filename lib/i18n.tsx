import { createContext, useCallback, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { I18nManager, Platform } from "react-native";
import { syncLanguageToServer } from "@/lib/language-sync";

// ============ TRANSLATIONS ============

export type Language = "nl" | "en" | "ar";

const translations: Record<string, { nl: string; en: string; ar: string }> = {
  // General
  "app.name": { nl: "Opvoedadvies", en: "Parenting Advice", ar: "نصائح التربية" },
  "app.subtitle": { nl: "Islamitisch opvoedingsprogramma", en: "Islamic parenting program", ar: "برنامج تربوي إسلامي" },

  // Tabs
  "tab.home": { nl: "Home", en: "Home", ar: "الرئيسة" },
  "tab.weekly": { nl: "Weekprogramma", en: "Weekly", ar: "الأسبوعي" },
  "tab.family": { nl: "Gezin", en: "Family", ar: "العائلة" },
  "tab.treatments": { nl: "Behandelingen", en: "Treatments", ar: "العلاجات" },
  "tab.mindsets": { nl: "Mindsets", en: "Mindsets", ar: "المبادئ" },
  "tab.prayer": { nl: "Gebedstijden", en: "Prayer Times", ar: "الصلاة" },
  "tab.fitrah": { nl: "Fitrah", en: "Fitrah", ar: "الفطرة" },
  "tab.names": { nl: "Namen Allaah", en: "Names of Allaah", ar: "الأسماء" },
  "tab.settings": { nl: "Instellingen", en: "Settings", ar: "إعدادات" },
  "tab.concepts": { nl: "Qur'aan", en: "Qur'aan", ar: "القرآن" },
  "tab.quran": { nl: "Qur'aan", en: "Qur'aan", ar: "القرآن" },
  "tab.dhikri": { nl: "Mijn Dhikr", en: "My Dhikr", ar: "ذِكري" },
  "tab.network": { nl: "Netwerk", en: "Network", ar: "شبكتي" },

  // Prayer Times
  "prayer.title": { nl: "Gebedstijden", en: "Prayer Times", ar: "أوقات الصلاة" },
  "prayer.fajr": { nl: "Fajr", en: "Fajr", ar: "الفجر" },
  "prayer.sunrise": { nl: "Shurooq", en: "Sunrise", ar: "الشروق" },
  "prayer.dhuhr": { nl: "Dhuhr", en: "Dhuhr", ar: "الظهر" },
  "prayer.asr": { nl: "Asr", en: "Asr", ar: "العصر" },
  "prayer.maghrib": { nl: "Maghrib", en: "Maghrib", ar: "المغرب" },
  "prayer.isha": { nl: "Isha", en: "Isha", ar: "العشاء" },
  "prayer.next_in": { nl: "over", en: "in", ar: "بعد" },
  "prayer.no_location": { nl: "Stel uw locatie in bij Instellingen om gebedstijden te zien.", en: "Set your location in Settings to see prayer times.", ar: "قم بتعيين موقعك في الإعدادات لعرض أوقات الصلاة." },
  "prayer.go_settings": { nl: "Ga naar Instellingen", en: "Go to Settings", ar: "اذهب إلى الإعدادات" },
  "prayer.method": { nl: "Berekeningsmethode", en: "Calculation method", ar: "طريقة الحساب" },
  "prayer.change_method": { nl: "Wijzig methode", en: "Change method", ar: "تغيير الطريقة" },
  "prayer.change_location": { nl: "Wijzig", en: "Change", ar: "تغيير" },
  "prayer.morning_adhkaar": { nl: "Ochtend-adhkaar", en: "Morning adhkaar", ar: "أذكار الصباح" },
  "prayer.evening_adhkaar": { nl: "Avond-adhkaar", en: "Evening adhkaar", ar: "أذكار المساء" },
  "prayer.now": { nl: "NU", en: "NOW", ar: "الآن" },
  "prayer.cities_count": { nl: "steden", en: "cities", ar: "مدن" },
  "prayer.morning_adhkaar_time": { nl: "Ochtendgedenkingen", en: "Morning adhkaar time", ar: "وقت أذكار الصباح" },
  "prayer.evening_adhkaar_time": { nl: "Avondgedenkingen", en: "Evening adhkaar time", ar: "وقت أذكار المساء" },
  "prayer.half_night": { nl: "Helft van de nacht", en: "Middle of the night", ar: "نصف الليل" },
  "prayer.last_third_night": { nl: "Laatste derde van de nacht", en: "Last third of the night", ar: "الثلث الأخير من الليل" },
  "prayer.last_third_desc": { nl: "Allaah daalt neer \u2014 tijd voor du'aa", en: "Allaah descends \u2014 time for du'aa", ar: "ينزل ربنا \u2014 وقت الدعاء" },
  "prayer.from_fajr_to_sunrise": { nl: "Van Fajr tot Shurooq", en: "From Fajr to Sunrise", ar: "من الفجر إلى الشروق" },
  "prayer.from_asr_to_maghrib": { nl: "Van Asr tot Maghrib", en: "From Asr to Maghrib", ar: "من العصر إلى المغرب" },
  "prayer.between_maghrib_fajr": { nl: "Midden Maghrib-Fajr", en: "Midpoint Maghrib-Fajr", ar: "منتصف المغرب-الفجر" },
  "prayer.additional_times": { nl: "Aanvullende tijden", en: "Additional times", ar: "أوقات إضافية" },

  // Settings
  "settings.title": { nl: "Instellingen", en: "Settings", ar: "الإعدادات" },
  "settings.language": { nl: "Taal", en: "Language", ar: "اللغة" },
  "settings.language_nl": { nl: "Nederlands", en: "Dutch", ar: "الهولندية" },
  "settings.language_en": { nl: "Engels", en: "English", ar: "الإنجليزية" },
  "settings.language_ar": { nl: "Arabisch", en: "Arabic", ar: "العربية" },
  "settings.reminders": { nl: "Herinneringen", en: "Reminders", ar: "التذكيرات" },
  "settings.reminder_freq": { nl: "Herinneringsfrequentie", en: "Reminder frequency", ar: "تكرار التذكير" },
  "settings.daily": { nl: "Dagelijks", en: "Daily", ar: "يومياً" },
  "settings.weekly": { nl: "Wekelijks", en: "Weekly", ar: "أسبوعياً" },
  "settings.never": { nl: "Nooit", en: "Never", ar: "أبداً" },
  "settings.location": { nl: "Locatie", en: "Location", ar: "الموقع" },
  "settings.prayer_settings": { nl: "Gebedstijden-instellingen", en: "Prayer time settings", ar: "إعدادات أوقات الصلاة" },
  "settings.choose_country": { nl: "Kies uw land", en: "Choose your country", ar: "اختر بلدك" },
  "settings.choose_city": { nl: "Kies uw stad", en: "Choose your city", ar: "اختر مدينتك" },
  "settings.choose_method": { nl: "Berekeningsmethode", en: "Calculation method", ar: "طريقة الحساب" },
  "settings.choose_method_desc": { nl: "Kies de methode voor Fajr en Isha berekening", en: "Choose the method for Fajr and Isha calculation", ar: "اختر طريقة حساب الفجر والعشاء" },
  "settings.current_location": { nl: "Huidige locatie", en: "Current location", ar: "الموقع الحالي" },
  "settings.current_method": { nl: "Huidige methode", en: "Current method", ar: "الطريقة الحالية" },
  "settings.not_set": { nl: "Niet ingesteld", en: "Not set", ar: "غير محدد" },
  "settings.back": { nl: "\u2190 Terug", en: "\u2190 Back", ar: "رجوع \u2192" },
  "settings.back_countries": { nl: "\u2190 Terug naar landen", en: "\u2190 Back to countries", ar: "رجوع إلى البلدان \u2192" },
  "settings.active": { nl: "ACTIEF", en: "ACTIVE", ar: "نشط" },
  "settings.profile": { nl: "Uw profiel", en: "Your profile", ar: "ملفك الشخصي" },
  "settings.edit_profile": { nl: "Profiel bewerken", en: "Edit profile", ar: "تعديل الملف" },
  "settings.children": { nl: "Kinderen", en: "Children", ar: "الأطفال" },
  "settings.data": { nl: "Gegevens", en: "Data", ar: "البيانات" },
  "settings.clear_data": { nl: "Alle gegevens wissen", en: "Clear all data", ar: "مسح جميع البيانات" },
  "settings.clear_confirm": { nl: "Weet u het zeker? Dit kan niet ongedaan worden.", en: "Are you sure? This cannot be undone.", ar: "هل أنت متأكد؟ لا يمكن التراجع عن هذا." },
  "settings.cancel": { nl: "Annuleren", en: "Cancel", ar: "إلغاء" },
  "settings.delete": { nl: "Verwijderen", en: "Delete", ar: "حذف" },
  "settings.gps_enable": { nl: "GPS inschakelen", en: "Enable GPS", ar: "تفعيل GPS" },
  "settings.gps_disable": { nl: "GPS uitschakelen", en: "Disable GPS", ar: "تعطيل GPS" },
  "settings.gps_refresh": { nl: "Vernieuwen", en: "Refresh", ar: "تحديث" },
  "settings.manual_city": { nl: "Stad handmatig invoeren", en: "Enter city manually", ar: "إدخال المدينة يدوياً" },
  "settings.or": { nl: "of", en: "or", ar: "أو" },
  "settings.save": { nl: "Opslaan", en: "Save", ar: "حفظ" },
  "settings.gps_location": { nl: "Locatie (GPS)", en: "Location (GPS)", ar: "الموقع (GPS)" },
  "settings.gps_desc": { nl: "Optioneel — voor locatie-gebaseerde functies", en: "Optional — for location-based features", ar: "اختياري — للميزات المعتمدة على الموقع" },
  "settings.gps_enabled": { nl: "GPS is ingeschakeld", en: "GPS is enabled", ar: "GPS مفعّل" },
  "settings.gps_city": { nl: "Stad", en: "City", ar: "المدينة" },
  "settings.gps_coords": { nl: "Co\u00f6rdinaten", en: "Coordinates", ar: "الإحداثيات" },
  "settings.app_settings": { nl: "App-instellingen", en: "App settings", ar: "إعدادات التطبيق" },
  "settings.location_settings": { nl: "Locatie-instellingen", en: "Location settings", ar: "إعدادات الموقع" },
  "settings.gender": { nl: "Geslacht", en: "Gender", ar: "الجنس" },
  "settings.man": { nl: "Man", en: "Male", ar: "ذكر" },
  "settings.woman": { nl: "Vrouw", en: "Female", ar: "أنثى" },
  "settings.not_filled": { nl: "Niet ingevuld", en: "Not filled in", ar: "لم يُملأ" },
  "settings.num_children": { nl: "Aantal kinderen", en: "Number of children", ar: "عدد الأطفال" },
  "settings.last_update": { nl: "Laatste update", en: "Last update", ar: "آخر تحديث" },
  "settings.reminder_section": { nl: "Herinneringen", en: "Reminders", ar: "التذكيرات" },
  "settings.reminder_freq_label": { nl: "Frequentie", en: "Frequency", ar: "التكرار" },
  "settings.every_week": { nl: "Elke week", en: "Every week", ar: "كل أسبوع" },
  "settings.every_2_weeks": { nl: "Elke 2 weken", en: "Every 2 weeks", ar: "كل أسبوعين" },
  "settings.every_month": { nl: "Elke maand", en: "Every month", ar: "كل شهر" },

  // Onboarding
  "onboarding.welcome": { nl: "Welkom", en: "Welcome", ar: "مرحباً" },
  "onboarding.how_many_children": { nl: "Hoeveel kinderen heeft u?", en: "How many children do you have?", ar: "كم عدد أطفالك؟" },
  "onboarding.children_later": { nl: "U kunt de gegevens van uw kinderen later invullen.", en: "You can fill in your children's details later.", ar: "يمكنك ملء بيانات أطفالك لاحقاً." },
  "onboarding.num_children": { nl: "Aantal kinderen", en: "Number of children", ar: "عدد الأطفال" },
  "onboarding.next": { nl: "Volgende", en: "Next", ar: "التالي" },

  // Home screen
  "home.today": { nl: "Vandaag", en: "Today", ar: "اليوم" },
  "home.today_special": { nl: "Vandaag is bijzonder", en: "Today is special", ar: "اليوم مميز" },
  "home.why_special": { nl: "Waarom bijzonder", en: "Why special", ar: "لماذا مميز" },
  "home.evidence": { nl: "Bewijs", en: "Evidence", ar: "الدليل" },
  "home.preparation": { nl: "Voorbereiding", en: "Preparation", ar: "التحضير" },
  "home.fasting_haram": { nl: "Vasten haraam", en: "Fasting prohibited", ar: "الصيام حرام" },
  "home.fasting_sunnah": { nl: "Vasten soennah", en: "Fasting recommended", ar: "الصيام سنة" },
  "home.fasting_obligatory": { nl: "Vasten verplicht", en: "Fasting obligatory", ar: "الصيام واجب" },
  "home.upcoming": { nl: "Binnenkort", en: "Upcoming", ar: "قريباً" },
  "home.upcoming_days": { nl: "Komende 10 dagen", en: "Next 10 days", ar: "الأيام العشرة القادمة" },
  "home.in_days": { nl: "over", en: "in", ar: "بعد" },
  "home.days": { nl: "dagen", en: "days", ar: "أيام" },
  "home.day": { nl: "dag", en: "day", ar: "يوم" },
  "home.fitan_title": { nl: "Fitan-waarschuwing", en: "Fitan warning", ar: "تحذير من الفتن" },
  "home.fitan_subtitle": { nl: "Wees bewust van beproevingen", en: "Be aware of trials", ar: "كن حذراً من الفتن" },
  "home.daily_advice": { nl: "Dagelijks advies", en: "Daily advice", ar: "نصيحة يومية" },
  "home.no_special_today": { nl: "Geen bijzondere dag vandaag", en: "No special day today", ar: "لا يوجد يوم مميز اليوم" },
  "home.regular_day": { nl: "Maak gebruik van uw tijd met dhikr en goede daden", en: "Make use of your time with dhikr and good deeds", ar: "استغل وقتك بالذكر والأعمال الصالحة" },

  // Family screen
  "family.title": { nl: "Gezin", en: "Family", ar: "العائلة" },
  "family.today_parents": { nl: "Vandaag \u2014 voor ouders", en: "Today \u2014 for parents", ar: "اليوم \u2014 للوالدين" },
  "family.profile": { nl: "Profiel", en: "Profile", ar: "الملف الشخصي" },
  "family.children": { nl: "Kinderen", en: "Children", ar: "الأطفال" },
  "family.add_child": { nl: "Kind toevoegen", en: "Add child", ar: "إضافة طفل" },
  "family.no_children": { nl: "Geen kinderen toegevoegd", en: "No children added", ar: "لم تتم إضافة أطفال" },
  "family.fill_later": { nl: "Later invullen", en: "Fill in later", ar: "ملء لاحقاً" },
  "family.age": { nl: "jaar", en: "years", ar: "سنة" },
  "family.months": { nl: "maanden", en: "months", ar: "أشهر" },
  "family.phase": { nl: "Fase", en: "Phase", ar: "المرحلة" },
  "family.view_child": { nl: "Bekijk", en: "View", ar: "عرض" },

  // Weekly screen
  "weekly.title": { nl: "Wekelijkse adviezen", en: "Weekly advice", ar: "النصائح الأسبوعية" },
  "weekly.subtitle": { nl: "Per kind op basis van leeftijd en week", en: "Per child based on age and week", ar: "لكل طفل حسب العمر والأسبوع" },
  "weekly.fill_profile": { nl: "Vul eerst uw profiel in", en: "Fill in your profile first", ar: "املأ ملفك الشخصي أولاً" },
  "weekly.fill_profile_desc": { nl: "Voordat u wekelijkse adviezen kunt ontvangen, moeten wij uw gezinssituatie kennen.", en: "Before you can receive weekly advice, we need to know your family situation.", ar: "قبل أن تتمكن من تلقي النصائح الأسبوعية، نحتاج إلى معرفة وضعك العائلي." },
  "weekly.go_profile": { nl: "Profiel invullen", en: "Fill in profile", ar: "ملء الملف الشخصي" },
  "weekly.week_of": { nl: "Week", en: "Week", ar: "الأسبوع" },
  "weekly.of_52": { nl: "van 52", en: "of 52", ar: "من 52" },
  "weekly.view_plan": { nl: "Weekplan bekijken", en: "View week plan", ar: "عرض الخطة الأسبوعية" },
  "weekly.no_children": { nl: "Geen kinderen toegevoegd", en: "No children added", ar: "لم تتم إضافة أطفال" },
  "weekly.no_children_desc": { nl: "Voeg kinderen toe in het Gezin-tabblad", en: "Add children in the Family tab", ar: "أضف أطفالاً في تبويب العائلة" },

  // Treatments screen
  "treatments.title": { nl: "Behandelplannen", en: "Treatment plans", ar: "خطط العلاج" },
  "treatments.subtitle": { nl: "Specifieke behandeling per kind en issue", en: "Specific treatment per child and issue", ar: "علاج محدد لكل طفل ومشكلة" },
  "treatments.fill_profile": { nl: "Vul eerst uw profiel in", en: "Fill in your profile first", ar: "املأ ملفك الشخصي أولاً" },
  "treatments.fill_profile_desc": { nl: "Voordat u behandelplannen kunt ontvangen, moeten wij uw gezinssituatie kennen.", en: "Before you can receive treatment plans, we need to know your family situation.", ar: "قبل أن تتمكن من تلقي خطط العلاج، نحتاج إلى معرفة وضعك العائلي." },
  "treatments.go_profile": { nl: "Profiel invullen", en: "Fill in profile", ar: "ملء الملف الشخصي" },
  "treatments.report_issue": { nl: "+ Issue melden", en: "+ Report issue", ar: "+ الإبلاغ عن مشكلة" },
  "treatments.open": { nl: "Open", en: "Open", ar: "مفتوح" },
  "treatments.resolved": { nl: "Afgerond", en: "Resolved", ar: "تم الحل" },
  "treatments.plan": { nl: "Behandelplan", en: "Treatment plan", ar: "خطة العلاج" },
  "treatments.view_plan": { nl: "Volledig behandelplan bekijken", en: "View full treatment plan", ar: "عرض خطة العلاج الكاملة" },
  "treatments.resolved_section": { nl: "Afgeronde behandelingen", en: "Completed treatments", ar: "العلاجات المكتملة" },
  "treatments.no_children": { nl: "Geen kinderen toegevoegd", en: "No children added", ar: "لم تتم إضافة أطفال" },

  // Mindsets screen
  "mindsets.title": { nl: "Mindsets", en: "Mindsets", ar: "المبادئ التربوية" },
  "mindsets.subtitle": { nl: "Islamitische opvoedprincipes", en: "Islamic parenting principles", ar: "مبادئ التربية الإسلامية" },
  "mindsets.source": { nl: "Bron", en: "Source", ar: "المصدر" },
  "mindsets.based_on": { nl: "gebaseerd op Qur'aan en Sunnah", en: "based on Qur'aan and Sunnah", ar: "مبني على القرآن والسنة" },
  "mindsets.explanation": { nl: "UITLEG", en: "EXPLANATION", ar: "الشرح" },
  "mindsets.evidence": { nl: "BEWIJS", en: "EVIDENCE", ar: "الدليل" },
  "mindsets.application": { nl: "TOEPASSING", en: "APPLICATION", ar: "التطبيق" },

  // Date/Time header
  "date.sun": { nl: "Zo", en: "Sun", ar: "أحد" },
  "date.mon": { nl: "Ma", en: "Mon", ar: "إثن" },
  "date.tue": { nl: "Di", en: "Tue", ar: "ثلا" },
  "date.wed": { nl: "Wo", en: "Wed", ar: "أرب" },
  "date.thu": { nl: "Do", en: "Thu", ar: "خمي" },
  "date.fri": { nl: "Vr", en: "Fri", ar: "جمع" },
  "date.sat": { nl: "Za", en: "Sat", ar: "سبت" },
  "date.jan": { nl: "jan", en: "Jan", ar: "يناير" },
  "date.feb": { nl: "feb", en: "Feb", ar: "فبراير" },
  "date.mar": { nl: "mrt", en: "Mar", ar: "مارس" },
  "date.apr": { nl: "apr", en: "Apr", ar: "أبريل" },
  "date.may": { nl: "mei", en: "May", ar: "مايو" },
  "date.jun": { nl: "jun", en: "Jun", ar: "يونيو" },
  "date.jul": { nl: "jul", en: "Jul", ar: "يوليو" },
  "date.aug": { nl: "aug", en: "Aug", ar: "أغسطس" },
  "date.sep": { nl: "sep", en: "Sep", ar: "سبتمبر" },
  "date.oct": { nl: "okt", en: "Oct", ar: "أكتوبر" },
  "date.nov": { nl: "nov", en: "Nov", ar: "نوفمبر" },
  "date.dec": { nl: "dec", en: "Dec", ar: "ديسمبر" },

  // Islamic day names
  "day.jumuah": { nl: "Jumu'ah", en: "Jumu'ah (Friday)", ar: "الجمعة" },
  "day.monday_fasting": { nl: "Maandag \u2014 vasten", en: "Monday \u2014 fasting", ar: "الإثنين \u2014 صيام" },
  "day.thursday_fasting": { nl: "Donderdag \u2014 vasten", en: "Thursday \u2014 fasting", ar: "الخميس \u2014 صيام" },
  "day.white_day": { nl: "Witte dag", en: "White day", ar: "يوم أبيض" },
  "day.ashura": { nl: "'Aashoeraa", en: "'Ashura", ar: "عاشوراء" },
  "day.tasua": { nl: "Taasoe'aa", en: "Tasu'a", ar: "تاسوعاء" },
  "day.muharram": { nl: "Muharram", en: "Muharram", ar: "المحرم" },
  "day.shaban": { nl: "Sha'baan", en: "Sha'ban", ar: "شعبان" },
  "day.ramadan": { nl: "Ramadhaan", en: "Ramadan", ar: "رمضان" },
  "day.last_10_nights": { nl: "Laatste 10 nachten", en: "Last 10 nights", ar: "العشر الأواخر" },
  "day.6_shawwal": { nl: "6 dagen Shawwaal", en: "6 days of Shawwal", ar: "ست من شوال" },
  "day.eid_fitr": { nl: "'Ied al-Fitr", en: "Eid al-Fitr", ar: "عيد الفطر" },
  "day.first_10_dh": { nl: "Eerste 10 Dhul-Hijjah", en: "First 10 of Dhul-Hijjah", ar: "عشر ذي الحجة" },
  "day.arafah": { nl: "Dag van 'Arafah", en: "Day of 'Arafah", ar: "يوم عرفة" },
  "day.eid_adha": { nl: "'Ied al-Adhaa", en: "Eid al-Adha", ar: "عيد الأضحى" },
  "day.tashreeq": { nl: "Tashreeq dag", en: "Tashreeq day", ar: "يوم التشريق" },
  "day.rajab": { nl: "Rajab (heilige maand)", en: "Rajab (sacred month)", ar: "رجب (شهر حرام)" },
  "day.prep_eid_adha": { nl: "Voorbereiding 'Ied al-Adhaa", en: "Preparation for Eid al-Adha", ar: "التحضير لعيد الأضحى" },
  "day.sunnah_eid_adha": { nl: "Soennah van 'Ied al-Adhaa", en: "Sunnah of Eid al-Adha", ar: "سنن عيد الأضحى" },
  "day.sunnah_eid_fitr": { nl: "Soennah van 'Ied al-Fitr", en: "Sunnah of Eid al-Fitr", ar: "سنن عيد الفطر" },
  "day.prep_ramadan": { nl: "Voorbereiding Ramadhaan", en: "Preparation for Ramadan", ar: "التحضير لرمضان" },
  "day.overlap_fasting": { nl: "Samenloop vastendagen", en: "Overlapping fasting days", ar: "تداخل أيام الصيام" },

  // Rewards/reasons
  "reward.jumuah": { nl: "Uur van verhoring; licht tussen twee Jumu'ahs", en: "Hour of acceptance; light between two Fridays", ar: "ساعة إجابة؛ نور بين الجمعتين" },
  "reason.jumuah": { nl: "Beste dag waarop de zon opkomt \u2014 Aadam werd erin geschapen", en: "Best day on which the sun rises \u2014 Adam was created on it", ar: "خير يوم طلعت عليه الشمس \u2014 فيه خُلق آدم" },
  "reward.monday": { nl: "Daden worden voorgelegd terwijl u vast", en: "Deeds are presented while you fast", ar: "تُعرض الأعمال وأنت صائم" },
  "reason.monday": { nl: "Dag waarop de Profeet \uFE0E geboren werd en de openbaring begon", en: "Day the Prophet \uFE0E was born and revelation began", ar: "يوم وُلد فيه النبي ﷺ وبُعث فيه" },
  "reward.thursday": { nl: "Poorten van het Paradijs geopend; vergeving", en: "Gates of Paradise opened; forgiveness", ar: "تُفتح أبواب الجنة؛ مغفرة" },
  "reason.thursday": { nl: "Daden worden voorgelegd aan Allaah", en: "Deeds are presented to Allaah", ar: "تُعرض الأعمال على الله" },
  "reward.white_day": { nl: "3 dagen vasten = beloning van de hele maand", en: "3 days fasting = reward of the whole month", ar: "صيام 3 أيام = أجر الشهر كله" },
  "reason.white_day": { nl: "Nachten verlicht door de volle maan \u2014 soennah van de Profeet \uFE0E", en: "Nights illuminated by the full moon \u2014 sunnah of the Prophet \uFE0E", ar: "ليالٍ مضيئة بالبدر \u2014 سنة النبي ﷺ" },
  "reward.ashura": { nl: "Wist de zonden van het voorgaande jaar", en: "Erases sins of the previous year", ar: "يكفّر ذنوب السنة الماضية" },
  "reason.ashura": { nl: "Allaah redde Moesaa en zijn volk; Fir'awn werd verdronken", en: "Allaah saved Musa and his people; Pharaoh was drowned", ar: "نجّى الله موسى وقومه؛ وأغرق فرعون" },
  "reward.tasua": { nl: "Soennah om samen met 'Aashoeraa te vasten", en: "Sunnah to fast together with 'Ashura", ar: "سنة صيامه مع عاشوراء" },
  "reason.tasua": { nl: "Onderscheiding van de Joden \u2014 de Profeet \uFE0E wilde de 9e erbij vasten", en: "Distinction from the Jews \u2014 the Prophet \uFE0E wanted to fast the 9th too", ar: "مخالفة لليهود \u2014 أراد النبي ﷺ صيام التاسع" },
  "reward.muharram": { nl: "Beste vasten na Ramadhaan", en: "Best fasting after Ramadan", ar: "أفضل الصيام بعد رمضان" },
  "reason.muharram": { nl: "Heilige maand \u2014 'Shahru Allaah al-Muharram' (maand van Allaah)", en: "Sacred month \u2014 'Shahru Allaah al-Muharram' (month of Allaah)", ar: "شهر حرام \u2014 شهر الله المحرم" },
  "reward.shaban": { nl: "Daden worden opgeheven naar Allaah", en: "Deeds are raised to Allaah", ar: "تُرفع الأعمال إلى الله" },
  "reason.shaban": { nl: "Maand die mensen vergeten tussen Rajab en Ramadhaan", en: "Month people forget between Rajab and Ramadan", ar: "شهر يغفل عنه الناس بين رجب ورمضان" },
  "reward.ramadan": { nl: "Vergeving van alle voorgaande zonden", en: "Forgiveness of all previous sins", ar: "غفران جميع الذنوب السابقة" },
  "reason.ramadan": { nl: "Maand waarin de Qur'aan is neergezonden; poorten Paradijs open", en: "Month in which the Qur'aan was revealed; gates of Paradise open", ar: "شهر أُنزل فيه القرآن؛ تُفتح أبواب الجنة" },
  "reward.last_10": { nl: "Laylat al-Qadr = beter dan 1000 maanden", en: "Laylat al-Qadr = better than 1000 months", ar: "ليلة القدر خير من ألف شهر" },
  "reason.last_10": { nl: "De Profeet \uFE0E spande zich extra in en maakte zijn gezin wakker", en: "The Prophet \uFE0E exerted extra effort and woke his family", ar: "كان النبي ﷺ يجتهد ويوقظ أهله" },
  "reward.6_shawwal": { nl: "Ramadhaan + 6 = beloning van een heel jaar vasten", en: "Ramadan + 6 = reward of a full year of fasting", ar: "رمضان + 6 = أجر صيام سنة كاملة" },
  "reason.6_shawwal": { nl: "Elke goede daad x10: 30 dagen + 6 = 360 = heel jaar", en: "Every good deed x10: 30 days + 6 = 360 = full year", ar: "كل حسنة بعشر: 30 + 6 = 360 = سنة كاملة" },
  "reward.eid_fitr": { nl: "Feestdag \u2014 vreugde na een maand geduld", en: "Holiday \u2014 joy after a month of patience", ar: "عيد \u2014 فرحة بعد شهر من الصبر" },
  "reason.eid_fitr": { nl: "Allaah heeft de moslims twee feestdagen gegeven ter vervanging", en: "Allaah gave Muslims two holidays as replacement", ar: "أبدل الله المسلمين بعيدين" },
  "reward.first_10_dh": { nl: "Goede daden hierin zijn geliefder bij Allaah dan op enige andere dag", en: "Good deeds in these days are more beloved to Allaah than any other day", ar: "العمل الصالح فيها أحب إلى الله من أي يوم آخر" },
  "reason.first_10_dh": { nl: "Allaah zwoer erbij: \u00ABWal-Fajr, wa layaalin 'ashr\u00BB", en: "Allaah swore by them: \u00ABWal-Fajr, wa layaalin 'ashr\u00BB", ar: "أقسم الله بها: \u00ABوالفجر وليالٍ عشر\u00BB" },
  "reward.arafah": { nl: "Wist zonden van 2 jaar (vorig + komend)", en: "Erases sins of 2 years (previous + coming)", ar: "يكفّر ذنوب سنتين (الماضية والقادمة)" },
  "reason.arafah": { nl: "Dag van de meeste bevrijdingen uit het Vuur; Allaah maakt Zich trots", en: "Day of most liberations from the Fire; Allaah boasts", ar: "أكثر يوم يُعتق فيه من النار؛ يباهي الله بأهل عرفة" },
  "reward.eid_adha": { nl: "Grootste dag van het jaar \u2014 alle hoofdaanbiddingen samen", en: "Greatest day of the year \u2014 all main acts of worship combined", ar: "أعظم أيام السنة \u2014 تجتمع فيه أمهات العبادات" },
  "reason.eid_adha": { nl: "Salaah, offer, ramy, tawaaf \u2014 alles komt samen op deze dag", en: "Salah, sacrifice, ramy, tawaf \u2014 all come together on this day", ar: "الصلاة والنحر والرمي والطواف \u2014 كلها تجتمع في هذا اليوم" },
  "reward.tashreeq": { nl: "Dagen van eten, drinken en dhikr van Allaah \u2014 vasten is haraam", en: "Days of eating, drinking and dhikr of Allaah \u2014 fasting is forbidden", ar: "أيام أكل وشرب وذكر لله \u2014 الصيام فيها حرام" },
  "reason.tashreeq": { nl: "3 dagen feest na 'Ied al-Adhaa; takbier na elk gebed; eten en drinken", en: "3 days of celebration after Eid al-Adha; takbeer after each prayer; eating and drinking", ar: "3 أيام عيد بعد الأضحى؛ تكبير بعد كل صلاة؛ أكل وشرب" },
  "reward.rajab": { nl: "Zonden wegen zwaarder; goede daden wegen zwaarder", en: "Sins weigh heavier; good deeds weigh heavier", ar: "الذنوب أعظم؛ والحسنات أعظم" },
  "reason.rajab": { nl: "Een van de vier heilige maanden \u2014 onrecht erin is erger", en: "One of the four sacred months \u2014 injustice in it is worse", ar: "من الأشهر الحرم الأربعة \u2014 الظلم فيه أشد" },
  "reward.prep_eid_adha": { nl: "Wie wil offeren: knip geen nagels/haar vanaf 1 DH", en: "Who wants to sacrifice: don't cut nails/hair from 1 DH", ar: "من أراد أن يضحي: لا يأخذ من شعره وأظفاره من 1 ذي الحجة" },
  "reason.prep_eid_adha": { nl: "Soennah voor wie een offer wil brengen \u2014 tot het offer is verricht", en: "Sunnah for who wants to sacrifice \u2014 until the sacrifice is done", ar: "سنة لمن أراد أن يضحي \u2014 حتى يذبح أضحيته" },
  "reward.sunnah_eid_adha": { nl: "Elke druppel bloed van het offer = hasanah", en: "Every drop of blood from the sacrifice = hasanah", ar: "كل قطرة دم من الأضحية = حسنة" },
  "reason.sunnah_eid_adha": { nl: "Ghusl, mooiste kleding, takbier, 'Ied-gebed, offer na gebed, niet eten tot na offer", en: "Ghusl, best clothes, takbeer, Eid prayer, sacrifice after prayer, don't eat until after sacrifice", ar: "الغسل، أحسن الثياب، التكبير، صلاة العيد، الذبح بعد الصلاة، لا يأكل حتى يذبح" },
  "reward.sunnah_eid_fitr": { nl: "Vreugde voor de vastende; beloning is bij Allaah", en: "Joy for the fasting person; reward is with Allaah", ar: "فرحة للصائم؛ والأجر عند الله" },
  "reason.sunnah_eid_fitr": { nl: "Ghusl, mooiste kleding, eet dadels (oneven) voor het gebed, takbier op weg", en: "Ghusl, best clothes, eat dates (odd number) before prayer, takbeer on the way", ar: "الغسل، أحسن الثياب، أكل تمرات (وتراً) قبل الصلاة، التكبير في الطريق" },
  "reward.prep_ramadan": { nl: "Wie zich voorbereidt haalt meer uit Ramadhaan", en: "Who prepares gets more out of Ramadan", ar: "من استعد لرمضان حصّل أكثر" },
  "reason.prep_ramadan": { nl: "Maak een plan: Qur'aan-doelen, du'aa-lijst, sadaqah-plan", en: "Make a plan: Qur'aan goals, du'a list, sadaqah plan", ar: "ضع خطة: أهداف القرآن، قائمة الدعاء، خطة الصدقة" },
  "reward.overlap": { nl: "Neem de intentie (niyyah) van de beste beloning!", en: "Take the intention (niyyah) of the best reward!", ar: "انوِ نية أفضل الأجر!" },

  // Preparation texts
  "prep.eid_adha": { nl: "Koop offerdier; maak takbier; geen nagels/haar knippen", en: "Buy sacrifice animal; make takbeer; don't cut nails/hair", ar: "اشترِ الأضحية؛ كبّر؛ لا تقص أظفارك وشعرك" },
  "prep.sunnah_eid_adha": { nl: "Ghusl \u2192 mooiste kleding \u2192 takbier \u2192 'Ied-gebed \u2192 offer \u2192 eet van offer", en: "Ghusl \u2192 best clothes \u2192 takbeer \u2192 Eid prayer \u2192 sacrifice \u2192 eat from sacrifice", ar: "الغسل \u2192 أحسن الثياب \u2192 التكبير \u2192 صلاة العيد \u2192 الذبح \u2192 الأكل من الأضحية" },
  "prep.sunnah_eid_fitr": { nl: "Ghusl \u2192 dadels eten \u2192 takbier \u2192 'Ied-gebed \u2192 feliciteer moslims", en: "Ghusl \u2192 eat dates \u2192 takbeer \u2192 Eid prayer \u2192 congratulate Muslims", ar: "الغسل \u2192 أكل التمر \u2192 التكبير \u2192 صلاة العيد \u2192 التهنئة" },
  "prep.ramadan": { nl: "Qur'aan-schema; du'aa-lijst; sadaqah-plan; schulden aflossen", en: "Qur'aan schedule; du'a list; sadaqah plan; pay off debts", ar: "جدول القرآن؛ قائمة الدعاء؛ خطة الصدقة؛ سداد الديون" },

  // Fitan warnings
  "fitan.title": { nl: "Fitan-waarschuwing", en: "Fitan warning", ar: "تحذير من الفتن" },
  "fitan.choose_routes": { nl: "Kies uw routes en plekken bewust", en: "Choose your routes and places consciously", ar: "اختر طرقك وأماكنك بوعي" },
  "fitan.summer_warning": { nl: "Zomer: meer blootstelling aan fitan op straat en stranden", en: "Summer: more exposure to fitan on streets and beaches", ar: "الصيف: تعرض أكثر للفتن في الشوارع والشواطئ" },
  "fitan.social_media": { nl: "Social media: filter uw feed en beperk schermtijd", en: "Social media: filter your feed and limit screen time", ar: "وسائل التواصل: صفِّ محتواك وقلل وقت الشاشة" },
  "fitan.lower_gaze": { nl: "Sla uw blik neer en bescherm uw hart", en: "Lower your gaze and protect your heart", ar: "غض بصرك واحفظ قلبك" },

  // Settings - GPS
  "settings.gps_requesting": { nl: "Permissie aanvragen...", en: "Requesting permission...", ar: "طلب الإذن..." },
  "settings.gps_fetching": { nl: "Locatie ophalen...", en: "Fetching location...", ar: "جلب الموقع..." },
  "settings.gps_saving": { nl: "Opslaan...", en: "Saving...", ar: "حفظ..." },
  "settings.gps_refreshing": { nl: "Locatie vernieuwen...", en: "Refreshing location...", ar: "تحديث الموقع..." },
  "settings.gps_not_available": { nl: "Locatiemodule niet beschikbaar op dit platform. GPS werkt alleen in de native app (APK).", en: "Location module not available on this platform. GPS only works in the native app (APK).", ar: "وحدة الموقع غير متوفرة على هذه المنصة. GPS يعمل فقط في التطبيق الأصلي (APK)." },
  "settings.gps_services_disabled": { nl: "Locatieservices zijn uitgeschakeld. De instellingen worden geopend...", en: "Location services are disabled. Opening settings...", ar: "خدمات الموقع معطلة. جاري فتح الإعدادات..." },
  "settings.gps_permission_error": { nl: "Permissie-fout", en: "Permission error", ar: "خطأ في الإذن" },
  "settings.gps_permission_denied": { nl: "Locatietoegang geweigerd. De app-instellingen worden geopend zodat u locatie kunt inschakelen...", en: "Location access denied. Opening app settings so you can enable location...", ar: "تم رفض الوصول إلى الموقع. جاري فتح إعدادات التطبيق لتفعيل الموقع..." },
  "settings.gps_fetch_error": { nl: "Kon locatie niet ophalen. Probeer het buiten of met WiFi.", en: "Could not fetch location. Try outside or with WiFi.", ar: "تعذر جلب الموقع. جرب في الخارج أو مع WiFi." },
  "settings.gps_determining_city": { nl: "Stad bepalen...", en: "Determining city...", ar: "تحديد المدينة..." },
  "settings.gps_unexpected_error": { nl: "Onverwachte fout", en: "Unexpected error", ar: "خطأ غير متوقع" },
  "settings.gps_refresh_error": { nl: "Kon locatie niet vernieuwen", en: "Could not refresh location", ar: "تعذر تحديث الموقع" },
  "settings.gps_module_unavailable": { nl: "Locatiemodule niet beschikbaar.", en: "Location module not available.", ar: "وحدة الموقع غير متوفرة." },
  "settings.gps_unknown": { nl: "Onbekend", en: "Unknown", ar: "غير معروف" },
  "settings.gps_busy": { nl: "Bezig...", en: "Loading...", ar: "جاري التحميل..." },
  "settings.gps_desc_full": { nl: "Schakel GPS in om locatiegebonden adviezen te ontvangen: waarschuwingen tegen fitan in uw omgeving en goede plekken (moskee\u00ebn, lessen) in de buurt.", en: "Enable GPS to receive location-based advice: warnings about fitan in your area and good places (mosques, lessons) nearby.", ar: "فعّل GPS لتلقي نصائح مبنية على الموقع: تحذيرات من الفتن في محيطك وأماكن جيدة (مساجد، دروس) قريبة." },
  "settings.gps_is_enabled": { nl: "GPS is ingeschakeld", en: "GPS is enabled", ar: "GPS مفعّل" },
  "settings.gps_city_unknown": { nl: "Stad onbekend", en: "City unknown", ar: "مدينة غير معروفة" },
  "settings.gps_last_updated": { nl: "Laatst bijgewerkt", en: "Last updated", ar: "آخر تحديث" },
  "settings.gps_refresh_btn": { nl: "\uD83D\uDD04 Vernieuwen", en: "\uD83D\uDD04 Refresh", ar: "\uD83D\uDD04 تحديث" },
  "settings.gps_refreshing_btn": { nl: "Ophalen...", en: "Fetching...", ar: "جاري الجلب..." },
  "settings.gps_disable_btn": { nl: "\u274C Uitschakelen", en: "\u274C Disable", ar: "\u274C تعطيل" },
  "settings.gps_manual_change": { nl: "\u270F\uFE0F Stad handmatig wijzigen", en: "\u270F\uFE0F Change city manually", ar: "\u270F\uFE0F تغيير المدينة يدوياً" },
  "settings.gps_manual_enter": { nl: "\u270F\uFE0F Stad handmatig invoeren", en: "\u270F\uFE0F Enter city manually", ar: "\u270F\uFE0F إدخال المدينة يدوياً" },
  "settings.gps_placeholder": { nl: "Bijv. Amsterdam, Rotterdam, Utrecht...", en: "E.g. Amsterdam, Rotterdam, Utrecht...", ar: "مثال: الرباط، الدار البيضاء، فاس..." },
  "settings.location_settings_btn": { nl: "Locatie-instellingen", en: "Location settings", ar: "إعدادات الموقع" },
  "settings.alert_settings": { nl: "Instellingen", en: "Settings", ar: "الإعدادات" },
  "settings.alert_settings_msg": { nl: "Ga naar Instellingen > Apps > Expo Go > Machtigingen > Locatie en schakel deze in.", en: "Go to Settings > Apps > Expo Go > Permissions > Location and enable it.", ar: "اذهب إلى الإعدادات > التطبيقات > Expo Go > الأذونات > الموقع وفعّله." },
  "settings.alert_location": { nl: "Locatie", en: "Location", ar: "الموقع" },
  "settings.alert_location_msg": { nl: "Ga naar Instellingen > Locatie en schakel GPS in.", en: "Go to Settings > Location and enable GPS.", ar: "اذهب إلى الإعدادات > الموقع وفعّل GPS." },
  // Settings - Profile
  "settings.profile_title": { nl: "Uw profiel", en: "Your profile", ar: "ملفك الشخصي" },
  "settings.profile_gender": { nl: "Geslacht", en: "Gender", ar: "الجنس" },
  "settings.profile_status": { nl: "Status", en: "Status", ar: "الحالة" },
  "settings.profile_complete": { nl: "Volledig ingevuld", en: "Fully completed", ar: "مكتمل" },
  "settings.profile_incomplete": { nl: "Nog niet volledig", en: "Not yet complete", ar: "غير مكتمل بعد" },
  "settings.profile_last_updated": { nl: "Laatst bijgewerkt", en: "Last updated", ar: "آخر تحديث" },
  "settings.profile_not_filled": { nl: "Nog niet ingevuld", en: "Not yet filled in", ar: "لم يُملأ بعد" },
  "settings.profile_fill": { nl: "Profiel invullen", en: "Fill in profile", ar: "ملء الملف الشخصي" },
  // Settings - Reminders
  "settings.reminders_title": { nl: "Herinneringen", en: "Reminders", ar: "التذكيرات" },
  "settings.reminders_desc": { nl: "De app herinnert u eraan om uw gegevens bij te werken wanneer er veranderingen zijn in uw situatie. U kiest zelf hoe vaak.", en: "The app reminds you to update your data when there are changes in your situation. You choose how often.", ar: "يذكّرك التطبيق بتحديث بياناتك عند حدوث تغييرات في وضعك. أنت تختار التكرار." },
  "settings.reminders_toggle": { nl: "Herinneringen", en: "Reminders", ar: "التذكيرات" },
  "settings.reminders_how_often": { nl: "Hoe vaak wilt u herinnerd worden?", en: "How often would you like to be reminded?", ar: "كم مرة تريد أن يتم تذكيرك؟" },
  "settings.every_2_months": { nl: "Elke 2 maanden", en: "Every 2 months", ar: "كل شهرين" },
  "settings.every_quarter": { nl: "Elk kwartaal", en: "Every quarter", ar: "كل ربع سنة" },
  // Settings - Children
  "settings.children_title": { nl: "Kinderen", en: "Children", ar: "الأطفال" },
  "settings.gender_unknown": { nl: "Geslacht onbekend", en: "Gender unknown", ar: "الجنس غير معروف" },
  "settings.no_birthdate": { nl: "Geen geboortedatum", en: "No birth date", ar: "لا يوجد تاريخ ميلاد" },
  "settings.edit_btn": { nl: "Bewerken", en: "Edit", ar: "تعديل" },
  // Settings - About
  "settings.about_title": { nl: "Over deze app", en: "About this app", ar: "عن هذا التطبيق" },
  "settings.about_desc": { nl: "Opvoedadvies is een islamitisch opvoedingsprogramma gebaseerd op:", en: "Parenting Advice is an Islamic parenting program based on:", ar: "نصائح التربية هو برنامج تربوي إسلامي مبني على:" },
  // Settings - Reset
  "settings.reset_all": { nl: "Alle gegevens wissen", en: "Clear all data", ar: "مسح جميع البيانات" },
  "settings.city_not_found": { nl: "Stad niet herkend. Probeer een van de bekende steden.", en: "City not recognized. Try one of the known cities.", ar: "المدينة غير معروفة. جرب إحدى المدن المعروفة." },
  "settings.city_saved": { nl: "Stad opgeslagen", en: "City saved", ar: "تم حفظ المدينة" },

  // Notification settings
  "notif.title": { nl: "Gebedsmeldingen", en: "Prayer Notifications", ar: "إشعارات الصلاة" },
  "notif.desc": { nl: "Ontvang meldingen voor gebedstijden en adhkaar-herinneringen.", en: "Receive notifications for prayer times and adhkaar reminders.", ar: "تلقَّ إشعارات لأوقات الصلاة وتذكيرات الأذكار." },
  "notif.master_toggle": { nl: "Meldingen inschakelen", en: "Enable notifications", ar: "تفعيل الإشعارات" },
  "notif.prayers_section": { nl: "Gebeden", en: "Prayers", ar: "الصلوات" },
  "notif.adhkaar_section": { nl: "Adhkaar", en: "Adhkaar", ar: "الأذكار" },
  "notif.morning_adhkaar": { nl: "Ochtend-adhkaar (na Fajr)", en: "Morning adhkaar (after Fajr)", ar: "أذكار الصباح (بعد الفجر)" },
  "notif.evening_adhkaar": { nl: "Avond-adhkaar (bij Asr)", en: "Evening adhkaar (at Asr)", ar: "أذكار المساء (عند العصر)" },
  "notif.minutes_before": { nl: "Minuten vooraf", en: "Minutes before", ar: "دقائق قبل" },
  "notif.at_time": { nl: "Op tijd", en: "At time", ar: "في الوقت" },
  "notif.5_min": { nl: "5 min vooraf", en: "5 min before", ar: "5 دقائق قبل" },
  "notif.10_min": { nl: "10 min vooraf", en: "10 min before", ar: "10 دقائق قبل" },
  "notif.15_min": { nl: "15 min vooraf", en: "15 min before", ar: "15 دقيقة قبل" },
  "notif.permission_denied": { nl: "Meldingen zijn geblokkeerd. Schakel ze in via de systeeminstellingen.", en: "Notifications are blocked. Enable them in system settings.", ar: "الإشعارات محظورة. فعّلها من إعدادات النظام." },
  "notif.scheduled_count": { nl: "meldingen gepland", en: "notifications scheduled", ar: "إشعارات مجدولة" },
  "notif.no_location": { nl: "Stel eerst een locatie in bij Gebedstijden-instellingen hierboven.", en: "First set a location in Prayer time settings above.", ar: "قم أولاً بتعيين موقع في إعدادات أوقات الصلاة أعلاه." },

  // General UI
  "ui.loading": { nl: "Laden...", en: "Loading...", ar: "جاري التحميل..." },
  "ui.error": { nl: "Fout", en: "Error", ar: "خطأ" },
  "ui.success": { nl: "Gelukt", en: "Success", ar: "تم بنجاح" },
  "ui.min": { nl: "min", en: "min", ar: "د" },
  "ui.hours_short": { nl: "u", en: "h", ar: "س" },
  "ui.minutes_short": { nl: "m", en: "m", ar: "د" },
  "ui.no_special_today": { nl: "Geen bijzondere dag vandaag", en: "No special day today", ar: "لا يوجد يوم مميز اليوم" },
  "ui.regular_day_advice": { nl: "Maak gebruik van uw tijd met dhikr en goede daden", en: "Make use of your time with dhikr and good deeds", ar: "استغل وقتك بالذكر والأعمال الصالحة" },

  // Network
  "network.title": { nl: "Mijn Netwerk", en: "My Network", ar: "شبكتي" },
  "network.subtitle": { nl: "Beheer uw netwerk van ouders, leraren, kennisdragers en artsen", en: "Manage your network of parents, teachers, scholars and doctors", ar: "إدارة شبكتك من الآباء والمعلمين وأهل العلم والأطباء" },
  "network.parents": { nl: "Ouders", en: "Parents", ar: "الوالدان" },
  "network.teachers": { nl: "Leraren", en: "Teachers", ar: "المعلمون" },
  "network.scholars": { nl: "Kennisdragers", en: "Scholars", ar: "أهل العلم" },
  "network.doctors": { nl: "Artsen / Specialisten", en: "Doctors / Specialists", ar: "الأطباء / المتخصصون" },
  "network.add_person": { nl: "Persoon toevoegen", en: "Add person", ar: "إضافة شخص" },
  "network.no_persons": { nl: "Nog geen personen toegevoegd", en: "No persons added yet", ar: "لم تتم إضافة أشخاص بعد" },
  "network.name": { nl: "Naam", en: "Name", ar: "الاسم" },
  "network.specialization": { nl: "Specialisatie / Vak", en: "Specialization / Subject", ar: "التخصص / المادة" },
  "network.contact": { nl: "Contact (tel/email)", en: "Contact (phone/email)", ar: "التواصل (هاتف/بريد)" },
  "network.institution": { nl: "Instelling / School", en: "Institution / School", ar: "المؤسسة / المدرسة" },
  "network.notes": { nl: "Notities", en: "Notes", ar: "ملاحظات" },
  "network.save": { nl: "Opslaan", en: "Save", ar: "حفظ" },
  "network.delete": { nl: "Verwijderen", en: "Delete", ar: "حذف" },
  "network.my_id": { nl: "Mijn unieke code", en: "My unique code", ar: "رمزي المميز" },
  "network.child_id": { nl: "Unieke code kind", en: "Child's unique code", ar: "الرمز المميز للطفل" },
  "network.share_qr": { nl: "QR-code delen", en: "Share QR code", ar: "مشاركة رمز QR" },
  "network.scan_qr": { nl: "QR-code scannen", en: "Scan QR code", ar: "مسح رمز QR" },
  "network.link_partner": { nl: "Partner koppelen", en: "Link partner", ar: "ربط الشريك" },
  "network.id_format_info": { nl: "Uw unieke code is gebaseerd op volgnummer + geboortedatum", en: "Your unique code is based on sequence number + birth date", ar: "رمزك المميز مبني على الرقم التسلسلي + تاريخ الميلاد" },

  // Child Login
  "child_login.welcome": { nl: "Welkom", en: "Welcome", ar: "مرحباً بك" },
  "child_login.enter_id_or_qr": { nl: "Voer je ID in of scan de QR-code", en: "Enter your ID or scan the QR code", ar: "أدخل المعرّف الخاص بك أو امسح رمز QR" },
  "child_login.point_camera": { nl: "Richt de camera op de QR-code", en: "Point the camera at the QR code", ar: "وجّه الكاميرا نحو رمز QR" },
  "child_login.id_placeholder": { nl: "ID", en: "ID", ar: "المعرّف (ID)" },
  "child_login.login": { nl: "Inloggen", en: "Login", ar: "دخول" },
  "child_login.logging_in": { nl: "Bezig met inloggen...", en: "Logging in...", ar: "جاري الدخول..." },
  "child_login.or": { nl: "of", en: "or", ar: "أو" },
  "child_login.scan_qr": { nl: "QR-code scannen", en: "Scan QR code", ar: "مسح رمز QR" },
  "child_login.enter_manually": { nl: "ID handmatig invoeren", en: "Enter ID manually", ar: "إدخال المعرّف يدوياً" },
  "child_login.rescan": { nl: "Opnieuw scannen", en: "Rescan", ar: "إعادة المسح" },
  "child_login.back_to_parent": { nl: "Terug naar ouderaccount", en: "Back to parent account", ar: "العودة لحساب الوالدين" },
  "child_login.error": { nl: "Fout", en: "Error", ar: "خطأ" },
  "child_login.enter_id": { nl: "Voer je ID in", en: "Enter your ID", ar: "أدخل المعرّف الخاص بك" },
  "child_login.invalid_id": { nl: "ID is onjuist. Vraag het aan je ouder.", en: "ID is incorrect. Ask your parent.", ar: "المعرّف غير صحيح. تأكد من والدك/والدتك." },
  "child_login.connection_error": { nl: "Verbindingsfout", en: "Connection error", ar: "حدث خطأ في الاتصال" },
  "child_login.notice": { nl: "Let op", en: "Notice", ar: "تنبيه" },
  "child_login.camera_permission": { nl: "Camera-toestemming nodig voor QR-scan", en: "Camera permission needed for QR scan", ar: "نحتاج إذن الكاميرا لمسح رمز QR" },
  "child_login.parent_confirm_title": { nl: "Ouderbevestiging vereist", en: "Parent confirmation required", ar: "تأكيد الوالد مطلوب" },
  "child_login.parent_confirm_desc": { nl: "Laat je ouder de pincode hieronder invoeren om te bevestigen dat jij het bent", en: "Ask your parent to enter the PIN below to confirm it's you", ar: "اطلب من والدك إدخال الرقم السري أدناه للتأكد أنك أنت" },
  "child_login.pin_label": { nl: "Beveiligingscode", en: "Security code", ar: "رمز الأمان" },
  "child_login.pin_instruction": { nl: "Toon deze code aan je ouder", en: "Show this code to your parent", ar: "أرِ هذا الرمز لوالدك" },
  "child_login.enter_pin": { nl: "Voer de code in", en: "Enter the code", ar: "أدخل الرمز" },
  "child_login.confirm": { nl: "Bevestigen", en: "Confirm", ar: "تأكيد" },
  "child_login.wrong_pin": { nl: "Onjuiste code. Probeer opnieuw.", en: "Incorrect code. Try again.", ar: "الرمز خاطئ. حاول مرة أخرى." },
  "child_login.back": { nl: "Terug", en: "Back", ar: "رجوع" },

  // Child Home
  "child_home.greeting_morning": { nl: "Goedemorgen", en: "Good morning", ar: "صباح الخير" },
  "child_home.greeting_afternoon": { nl: "Goedemiddag", en: "Good afternoon", ar: "مساء الخير" },
  "child_home.greeting_evening": { nl: "Goedenavond", en: "Good evening", ar: "مساء النور" },
  "child_home.daily_wird": { nl: "Dagelijkse wird", en: "Daily wird", ar: "الورد اليومي" },
  "child_home.warnings": { nl: "Waarschuwingen", en: "Warnings", ar: "تحذيرات" },
  "child_home.salaf_story": { nl: "Verhaal van de Salaf", en: "Story of the Salaf", ar: "قصة من السلف" },
  "child_home.quick_actions": { nl: "Snelle acties", en: "Quick actions", ar: "إجراءات سريعة" },
  "child_home.challenges": { nl: "Uitdagingen", en: "Challenges", ar: "التحديات" },
  "child_home.achievements": { nl: "Prestaties", en: "Achievements", ar: "الإنجازات" },
  "child_home.advisor": { nl: "Adviseur", en: "Advisor", ar: "المستشار" },
  "child_home.app_guide": { nl: "App-gids", en: "App guide", ar: "دليل التطبيقات" },
  "child_home.emergency": { nl: "Noodgeval", en: "Emergency", ar: "طوارئ" },
  "child_home.emergency_title": { nl: "Ik ben blootgesteld aan een fitnah", en: "I was exposed to a fitnah", ar: "تعرضت لفتنة" },
  "child_home.emergency_sent": { nl: "Bericht verzonden naar je ouders", en: "Message sent to your parents", ar: "تم إرسال رسالة لوالديك" },
  "child_home.thanks_parents": { nl: "Bedankt ouders", en: "Thanks parents", ar: "شكراً لوالديّ" },
  "child_home.need_help": { nl: "Ik heb hulp nodig", en: "I need help", ar: "أحتاج مساعدة" },
  "child_home.logout": { nl: "Uitloggen", en: "Logout", ar: "خروج" },

  // Child Advisor
  "child_advisor.title": { nl: "Jouw adviseur", en: "Your advisor", ar: "مستشارك" },
  "child_advisor.placeholder": { nl: "Stel je vraag...", en: "Ask your question...", ar: "اسأل سؤالك..." },
  "child_advisor.send": { nl: "Verstuur", en: "Send", ar: "إرسال" },
  "child_advisor.back": { nl: "Terug", en: "Back", ar: "رجوع" },

  // Child Challenges
  "child_challenges.title": { nl: "Dagelijkse uitdagingen", en: "Daily challenges", ar: "التحديات اليومية" },
  "child_challenges.complete": { nl: "Voltooid!", en: "Complete!", ar: "مكتمل!" },
  "child_challenges.mark_done": { nl: "Markeer als voltooid", en: "Mark as done", ar: "تم الإنجاز" },
  "child_challenges.back": { nl: "Terug", en: "Back", ar: "رجوع" },

  // Child Achievements
  "child_achievements.title": { nl: "Mijn prestaties", en: "My achievements", ar: "إنجازاتي" },
  "child_achievements.empty": { nl: "Nog geen prestaties. Blijf doorgaan!", en: "No achievements yet. Keep going!", ar: "لا إنجازات بعد. واصل!" },
  "child_achievements.back": { nl: "Terug", en: "Back", ar: "رجوع" },

  // Child App Guide
  "child_appguide.title": { nl: "App-gids", en: "App Guide", ar: "دليل التطبيقات" },
  "child_appguide.halal": { nl: "Toegestaan", en: "Permissible", ar: "مباح" },
  "child_appguide.haram": { nl: "Verboden", en: "Forbidden", ar: "حرام" },
  "child_appguide.doubtful": { nl: "Twijfelachtig", en: "Doubtful", ar: "مشبوه" },
  "child_appguide.back": { nl: "Terug", en: "Back", ar: "رجوع" },

  // Parent Monitor
  "parent_monitor.title": { nl: "Volg", en: "Monitor", ar: "متابعة" },
  "parent_monitor.child_id": { nl: "Kind-ID voor inloggen", en: "Child ID for login", ar: "معرّف الابن لتسجيل الدخول" },
  "parent_monitor.show_qr": { nl: "Toon QR", en: "Show QR", ar: "عرض QR" },
  "parent_monitor.hide_qr": { nl: "Verberg QR", en: "Hide QR", ar: "إخفاء QR" },
  "parent_monitor.share": { nl: "Delen", en: "Share", ar: "مشاركة" },
  "parent_monitor.scan_hint": { nl: "Scan deze code vanuit de kind-app", en: "Scan this code from the child app", ar: "امسح هذا الرمز من تطبيق الابن" },
  "parent_monitor.challenges_done": { nl: "Uitdagingen voltooid", en: "Challenges done", ar: "تحدي مكتمل" },
  "parent_monitor.achievements": { nl: "Prestaties", en: "Achievements", ar: "إنجاز" },
  "parent_monitor.activities": { nl: "Activiteiten", en: "Activities", ar: "الأنشطة" },
  "parent_monitor.back": { nl: "Terug", en: "Back", ar: "رجوع" },
  "parent_monitor.loading": { nl: "Laden...", en: "Loading...", ar: "جاري التحميل..." },



  // Family Group
  "family_group.title": { nl: "Familiegroep", en: "Family group", ar: "مجموعة العائلة" },
  "family_group.reminders": { nl: "Herinneringen", en: "Reminders", ar: "التذكيرات" },
  "family_group.activities": { nl: "Activiteiten", en: "Activities", ar: "الأنشطة" },
  "family_group.add_reminder": { nl: "Herinnering toevoegen", en: "Add reminder", ar: "إضافة تذكير" },
  "family_group.suggest_activity": { nl: "Activiteit voorstellen", en: "Suggest activity", ar: "اقتراح نشاط" },
  "family_group.vote": { nl: "Stemmen", en: "Vote", ar: "تصويت" },
  "family_group.invite": { nl: "Uitnodigen met code", en: "Invite with code", ar: "دعوة بكود" },
  "family_group.back": { nl: "Terug", en: "Back", ar: "رجوع" },

  // Peer Groups
  "peer_groups.title": { nl: "Leeftijdsgenoten", en: "Peer groups", ar: "مجموعات الأقران" },
  "peer_groups.create": { nl: "Groep aanmaken", en: "Create group", ar: "إنشاء مجموعة" },
  "peer_groups.join": { nl: "Deelnemen", en: "Join", ar: "انضمام" },
  "peer_groups.parent_approval": { nl: "Oudergoedkeuring vereist", en: "Parent approval required", ar: "موافقة الوالدين مطلوبة" },
  "peer_groups.back": { nl: "Terug", en: "Back", ar: "رجوع" },

  // Monitor (parent-monitor screen)
  "monitor.title": { nl: "Volg", en: "Monitor", ar: "متابعة" },
  "monitor.child": { nl: "Kind", en: "Child", ar: "الابن" },
  "monitor.back": { nl: "Terug", en: "Back", ar: "رجوع" },
  "monitor.child_id": { nl: "Kind-ID voor inloggen", en: "Child ID for login", ar: "معرّف الابن لتسجيل الدخول" },
  "monitor.show_qr": { nl: "Toon QR", en: "Show QR", ar: "عرض QR" },
  "monitor.hide_qr": { nl: "Verberg QR", en: "Hide QR", ar: "إخفاء QR" },
  "monitor.share": { nl: "Delen", en: "Share", ar: "مشاركة" },
  "monitor.share_msg": { nl: "Je inlog-ID voor de app", en: "Your login ID for the app", ar: "معرّفك لتسجيل الدخول في التطبيق" },
  "monitor.scan_qr": { nl: "Scan deze code vanuit de kind-app", en: "Scan this code from the child app", ar: "امسح هذا الرمز من تطبيق الابن" },
  "monitor.challenges_done": { nl: "Uitdagingen voltooid", en: "Challenges done", ar: "تحدي مكتمل" },
  "monitor.achievements": { nl: "Prestaties", en: "Achievements", ar: "إنجاز" },
  "monitor.activities": { nl: "Activiteiten", en: "Activities", ar: "نشاط" },
  "monitor.activity_log": { nl: "Activiteitenlogboek", en: "Activity log", ar: "سجل النشاط" },
  "monitor.no_activity": { nl: "Nog geen activiteiten geregistreerd", en: "No activity recorded yet", ar: "لا يوجد نشاط مسجل بعد" },

  // Shared Updates (divorced parents)
  "shared_updates.title": { nl: "Updates van", en: "Updates for", ar: "تحديثات" },
  "shared_updates.child": { nl: "Kind", en: "Child", ar: "الابن" },
  "shared_updates.back": { nl: "Terug", en: "Back", ar: "رجوع" },
  "shared_updates.info": { nl: "Deze pagina is voor het delen van updates over uw kind met de andere ouder. Geen directe berichten — alleen updates over het kind.", en: "This page is for sharing updates about your child with the other parent. No direct messages — only child-related updates.", ar: "هذه الصفحة لمشاركة تحديثات عن ابنك/ابنتك مع الطرف الآخر. لا رسائل مباشرة - فقط تحديثات تخص الابن/البنت." },
  "shared_updates.add": { nl: "Update toevoegen", en: "Add update", ar: "إضافة تحديث" },
  "shared_updates.added": { nl: "Update succesvol toegevoegd", en: "Update added successfully", ar: "تم إضافة التحديث بنجاح" },
  "shared_updates.type": { nl: "Type update", en: "Update type", ar: "نوع التحديث" },
  "shared_updates.placeholder": { nl: "Schrijf de update hier...", en: "Write the update here...", ar: "اكتب التحديث هنا..." },
  "shared_updates.send": { nl: "Verstuur", en: "Send", ar: "إرسال" },
  "shared_updates.cancel": { nl: "Annuleren", en: "Cancel", ar: "إلغاء" },
  "shared_updates.write_content": { nl: "Schrijf de inhoud van de update", en: "Write the update content", ar: "اكتب محتوى التحديث" },
  "shared_updates.previous": { nl: "Eerdere updates", en: "Previous updates", ar: "التحديثات السابقة" },
  "shared_updates.empty": { nl: "Nog geen updates", en: "No updates yet", ar: "لا توجد تحديثات بعد" },
  "shared_updates.new": { nl: "Nieuw", en: "New", ar: "جديد" },

  // Peers (peer-groups screen)
  "peers.title": { nl: "Leeftijdsgenoten", en: "Peer groups", ar: "مجموعات الأقران" },
  "peers.back": { nl: "Terug", en: "Back", ar: "رجوع" },
  "peers.info": { nl: "Leeftijdsgenoten-groepen laten uw kinderen communiceren met leeftijdsgenoten in een veilige omgeving onder ouderlijk toezicht. Elk lidmaatschap vereist goedkeuring van de ouder.", en: "Peer groups allow your children to communicate with peers in a safe environment under parental supervision. Every membership requires parent approval.", ar: "مجموعات الأقران تتيح لأبنائك التواصل مع أقرانهم في بيئة آمنة تحت إشراف الوالدين. كل انضمام يحتاج موافقة ولي الأمر." },
  "peers.create_btn": { nl: "Nieuwe groep aanmaken", en: "Create new group", ar: "إنشاء مجموعة جديدة" },
  "peers.group_name": { nl: "Groepsnaam", en: "Group name", ar: "اسم المجموعة" },
  "peers.age_range": { nl: "Leeftijdsgroep", en: "Age range", ar: "الفئة العمرية" },
  "peers.gender": { nl: "Geslacht", en: "Gender", ar: "الجنس" },
  "peers.enter_name": { nl: "Voer een groepsnaam in", en: "Enter a group name", ar: "أدخل اسم المجموعة" },
  "peers.created": { nl: "Groep aangemaakt", en: "Group created", ar: "تم إنشاء المجموعة" },
  "peers.invite_code": { nl: "Uitnodigingscode", en: "Invite code", ar: "رمز الدعوة" },
  "peers.benefits": { nl: "Voordelen van leeftijdsgenoten-groepen", en: "Benefits of peer groups", ar: "فوائد مجموعات الأقران" },

  // Family Group screen
  "family.back": { nl: "Terug", en: "Back", ar: "رجوع" },
  "family.reminders": { nl: "Herinneringen", en: "Reminders", ar: "التذكيرات" },
  "family.activities": { nl: "Activiteiten", en: "Activities", ar: "الأنشطة" },
  "family.add_reminder": { nl: "Herinnering toevoegen", en: "Add reminder", ar: "إضافة تذكير" },
  "family.reminder_title": { nl: "Titel van herinnering", en: "Reminder title", ar: "عنوان التذكير" },
  "family.save_reminder": { nl: "Opslaan", en: "Save", ar: "حفظ" },
  "family.enter_title": { nl: "Voer een titel in", en: "Enter a title", ar: "أدخل العنوان" },
  "family.reminder_added": { nl: "Herinnering toegevoegd", en: "Reminder added", ar: "تم إضافة التذكير" },
  "family.no_reminders": { nl: "Nog geen herinneringen", en: "No reminders yet", ar: "لا تذكيرات بعد" },
  "family.propose_activity": { nl: "Activiteit voorstellen", en: "Propose activity", ar: "اقتراح نشاط" },
  "family.activity_title": { nl: "Titel van activiteit", en: "Activity title", ar: "عنوان النشاط" },
  "family.activity_desc": { nl: "Beschrijving (optioneel)", en: "Description (optional)", ar: "الوصف (اختياري)" },
  "family.activity_proposed": { nl: "Activiteit voorgesteld", en: "Activity proposed", ar: "تم اقتراح النشاط" },
  "family.no_activities": { nl: "Nog geen activiteiten", en: "No activities yet", ar: "لا أنشطة بعد" },
  "family.vote_yes": { nl: "Ja", en: "Yes", ar: "نعم" },
  "family.vote_no": { nl: "Nee", en: "No", ar: "لا" },

  // Neighborhood screen
  "neighborhood.info": { nl: "Maak verbinding met moslimgezinnen in uw buurt voor gezamenlijke activiteiten en wederzijdse steun.", en: "Connect with Muslim families in your neighborhood for joint activities and mutual support.", ar: "تواصل مع العائلات المسلمة في حيّك لأنشطة مشتركة ودعم متبادل." },
  "neighborhood.create_btn": { nl: "Buurtgroep aanmaken", en: "Create neighborhood group", ar: "إنشاء مجموعة حي" },
  "neighborhood.join_btn": { nl: "Deelnemen met code", en: "Join with code", ar: "انضمام بكود" },
  "neighborhood.group_name": { nl: "Groepsnaam", en: "Group name", ar: "اسم المجموعة" },
  "neighborhood.invite_code": { nl: "Uitnodigingscode", en: "Invite code", ar: "رمز الدعوة" },
  "neighborhood.enter_code": { nl: "Voer de code in", en: "Enter the code", ar: "أدخل الكود" },
  "neighborhood.created": { nl: "Groep aangemaakt", en: "Group created", ar: "تم إنشاء المجموعة" },
  "neighborhood.joined": { nl: "U bent lid geworden", en: "You have joined", ar: "تم الانضمام" },
  "neighborhood.enter_name": { nl: "Voer een groepsnaam in", en: "Enter a group name", ar: "أدخل اسم المجموعة" },

  // Auth - Login
  "auth.app_name": { nl: "Rabbaanie", en: "Rabbaanie", ar: "ربّاني" },
  "auth.subtitle": { nl: "Islamitisch opvoedingsprogramma", en: "Islamic parenting program", ar: "برنامج تربوي إسلامي" },
  "auth.email": { nl: "E-mailadres", en: "Email address", ar: "البريد الإلكتروني" },
  "auth.password": { nl: "Wachtwoord", en: "Password", ar: "كلمة المرور" },
  "auth.sign_in": { nl: "Inloggen", en: "Sign in", ar: "تسجيل الدخول" },
  "auth.sign_in_google": { nl: "Inloggen met Google", en: "Sign in with Google", ar: "تسجيل الدخول بـ Google" },
  "auth.or": { nl: "of", en: "or", ar: "أو" },
  "auth.no_account": { nl: "Nog geen account?", en: "Don't have an account?", ar: "ليس لديك حساب؟" },
  "auth.register": { nl: "Registreer", en: "Register", ar: "سجّل الآن" },
  "auth.show": { nl: "Toon", en: "Show", ar: "إظهار" },
  "auth.hide": { nl: "Verberg", en: "Hide", ar: "إخفاء" },
  "auth.error_empty": { nl: "Vul uw e-mailadres en wachtwoord in", en: "Please enter your email and password", ar: "أدخل بريدك الإلكتروني وكلمة المرور" },
  "auth.error_wrong": { nl: "Onjuist e-mailadres of wachtwoord", en: "Incorrect email or password", ar: "البريد الإلكتروني أو كلمة المرور غير صحيحة" },
  "auth.error_not_found": { nl: "Account niet gevonden. Maak eerst een account aan.", en: "Account not found. Please register first.", ar: "الحساب غير موجود. سجّل أولاً." },
  "auth.error_connection": { nl: "Verbindingsfout. Controleer uw internetverbinding.", en: "Connection error. Check your internet connection.", ar: "خطأ في الاتصال. تحقق من اتصالك بالإنترنت." },
  "auth.error_google": { nl: "Google-inloggen mislukt. Probeer het opnieuw.", en: "Google sign-in failed. Please try again.", ar: "فشل تسجيل الدخول بـ Google. حاول مرة أخرى." },

  // Auth - Register
  "auth.create_account": { nl: "Account aanmaken", en: "Create account", ar: "إنشاء حساب" },
  "auth.step": { nl: "Stap", en: "Step", ar: "خطوة" },
  "auth.step_basic": { nl: "Basisgegevens", en: "Basic info", ar: "البيانات الأساسية" },
  "auth.step_role": { nl: "Rol & Status", en: "Role & Status", ar: "الدور والحالة" },
  "auth.step_address": { nl: "Adres", en: "Address", ar: "العنوان" },
  "auth.full_name": { nl: "Volledige naam", en: "Full name", ar: "الاسم الكامل" },
  "auth.confirm_password": { nl: "Bevestig wachtwoord", en: "Confirm password", ar: "تأكيد كلمة المرور" },
  "auth.your_role": { nl: "Uw rol", en: "Your role", ar: "دورك" },
  "auth.father": { nl: "Vader", en: "Father", ar: "أب" },
  "auth.mother": { nl: "Moeder", en: "Mother", ar: "أم" },
  "auth.social_status": { nl: "Burgerlijke staat", en: "Social status", ar: "الحالة الاجتماعية" },
  "auth.married_m": { nl: "Getrouwd", en: "Married", ar: "متزوج" },
  "auth.divorced_m": { nl: "Gescheiden", en: "Divorced", ar: "مطلّق" },
  "auth.widowed_m": { nl: "Weduwnaar", en: "Widowed", ar: "أرمل" },
  "auth.single_m": { nl: "Ongehuwd", en: "Single (never married)", ar: "أعزب لم أتزوج من قبل" },
  "auth.married_f": { nl: "Getrouwd", en: "Married", ar: "متزوجة" },
  "auth.divorced_f": { nl: "Gescheiden", en: "Divorced", ar: "مطلّقة" },
  "auth.widowed_f": { nl: "Weduwe", en: "Widowed", ar: "أرملة" },
  "auth.single_f": { nl: "Ongehuwd", en: "Single (never married)", ar: "عزباء لم أتزوج من قبل" },
  "auth.address_details": { nl: "Adresgegevens", en: "Address details", ar: "بيانات العنوان" },
  "auth.address_optional": { nl: "(optioneel - u kunt dit later invullen)", en: "(optional - you can fill this in later)", ar: "(اختياري - يمكنك ملؤه لاحقاً)" },
  "auth.street_house": { nl: "Straat en huisnummer", en: "Street and house number", ar: "الشارع ورقم المنزل" },
  "auth.postal_city": { nl: "Postcode en plaats", en: "Postal code and city", ar: "الرمز البريدي والمدينة" },
  "auth.country": { nl: "Land", en: "Country", ar: "البلد" },
  "auth.next": { nl: "Volgende", en: "Next", ar: "التالي" },
  "auth.back": { nl: "Vorige", en: "Back", ar: "السابق" },
  "auth.register_btn": { nl: "Registreren", en: "Register", ar: "تسجيل" },
  "auth.has_account": { nl: "Al een account?", en: "Already have an account?", ar: "لديك حساب بالفعل؟" },
  "auth.error_name": { nl: "Vul uw naam in", en: "Please enter your name", ar: "أدخل اسمك" },
  "auth.error_email": { nl: "Vul uw e-mailadres in", en: "Please enter your email", ar: "أدخل بريدك الإلكتروني" },
  "auth.error_password_short": { nl: "Wachtwoord moet minimaal 6 tekens bevatten", en: "Password must be at least 6 characters", ar: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" },
  "auth.error_password_match": { nl: "Wachtwoorden komen niet overeen", en: "Passwords do not match", ar: "كلمتا المرور غير متطابقتين" },
  "auth.error_role": { nl: "Selecteer uw rol", en: "Please select your role", ar: "اختر دورك" },
  "auth.error_status": { nl: "Selecteer uw burgerlijke staat", en: "Please select your social status", ar: "اختر حالتك الاجتماعية" },
  "auth.error_exists": { nl: "Dit e-mailadres is al geregistreerd", en: "This email is already registered", ar: "هذا البريد الإلكتروني مسجّل بالفعل" },
};

export type TranslationKey = string;

// ============ CONTEXT ============

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  isRTL: boolean;
  languageSelected: boolean;
}

const I18nContext = createContext<I18nContextType | null>(null);

const LANGUAGE_STORAGE_KEY = "@app_language";
const LANGUAGE_SELECTED_KEY = "@app_language_selected";

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("ar");
  const [loaded, setLoaded] = useState(false);
  const [languageSelected, setLanguageSelected] = useState(false);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(LANGUAGE_STORAGE_KEY),
      AsyncStorage.getItem(LANGUAGE_SELECTED_KEY),
    ]).then(([val, selected]) => {
      let detectedLang: Language = "ar"; // default fallback
      if (val === "en" || val === "nl" || val === "ar") {
        detectedLang = val;
      } else {
        // Auto-detect from system locale
        try {
          const Localization = require("expo-localization");
          const locales = Localization.getLocales?.() || [];
          if (locales.length > 0) {
            const sysLang = locales[0].languageCode?.toLowerCase() || "";
            if (sysLang === "ar") detectedLang = "ar";
            else if (sysLang === "nl") detectedLang = "nl";
            else if (sysLang === "en") detectedLang = "en";
            else detectedLang = "en"; // fallback to English for other languages
          }
        } catch {
          // expo-localization not available, keep default
        }
      }
      setLanguageState(detectedLang);
      // Persist the effective language so notification scheduling (which reads
      // @app_language directly) matches the UI — including the system-detected
      // default when the user hasn't explicitly chosen one.
      if (val !== "en" && val !== "nl" && val !== "ar") {
        AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, detectedLang).catch(() => {});
      }
      // Apply RTL on app start
      const shouldBeRTL = detectedLang === "ar";
      if (I18nManager.isRTL !== shouldBeRTL) {
        I18nManager.forceRTL(shouldBeRTL);
        I18nManager.allowRTL(shouldBeRTL);
      }
      if (Platform.OS === "web" && typeof document !== "undefined") {
        document.documentElement.dir = shouldBeRTL ? "rtl" : "ltr";
      }
      setLanguageSelected(selected === "true");
      setLoaded(true);
    });
  }, []);

  const setLanguage = useCallback(async (lang: Language) => {
    setLanguageState(lang);
    setLanguageSelected(true);
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    await AsyncStorage.setItem(LANGUAGE_SELECTED_KEY, "true");
    // Set RTL for Arabic
    const shouldBeRTL = lang === "ar";
    if (I18nManager.isRTL !== shouldBeRTL) {
      I18nManager.forceRTL(shouldBeRTL);
      I18nManager.allowRTL(shouldBeRTL);
    }
    if (Platform.OS === "web" && typeof document !== "undefined") {
      document.documentElement.dir = shouldBeRTL ? "rtl" : "ltr";
    }
    // Refresh widgets immediately when language changes
    try {
      if (Platform.OS === "android") {
        const { refreshAllWidgets } = require("@/widgets/widgetSync");
        await refreshAllWidgets();
      }
    } catch {}
    // Sync to the server so server-sent notifications use the chosen language.
    void syncLanguageToServer(lang);
  }, []);

  const isRTL = language === "ar";

  const t = useCallback((key: string): string => {
    const entry = translations[key];
    if (!entry) return key;
    return entry[language] || entry.nl || key;
  }, [language]);

  if (!loaded) return null;

  return (
    <I18nContext.Provider value={{ language, setLanguage, t, isRTL, languageSelected }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
