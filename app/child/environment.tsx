import React, { useState, useRef, useCallback } from "react";
import { View, Text, Pressable, ScrollView, Alert, LayoutChangeEvent } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/use-colors";
import { useAppState } from "@/lib/app-context";
import { ChildEnvironment } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { FormField, TextField, SelectField, HybridField, HonestyBanner, ValidationBanner, HasanaatProgressBar } from "@/components/form-field";

type Lang = "nl" | "en" | "ar";

function tx(lang: Lang, nl: string, en: string, ar: string): string {
  return lang === "ar" ? ar : lang === "en" ? en : nl;
}

interface QuestionDef {
  key: string;
  label: string;
  type: "select" | "text" | "hybrid";
  section: string;
  options?: { value: string; label: string }[];
  hint?: string;
  conditional?: (formData: Record<string, string>) => boolean;
}

function getEnvQuestions(lang: Lang): QuestionDef[] {
  const hint = tx(lang, "Kies een optie of beschrijf zelf", "Choose an option or describe yourself", "اختر خيارًا أو صف بكلماتك");
  return [
  // === ONDERWIJS ===
  { key: "education", label: tx(lang, "Wat voor onderwijs volgt dit kind?", "What type of education does this child follow?", "ما نوع التعليم الذي يتلقاه هذا الطفل؟"), type: "select", section: tx(lang, "Onderwijs", "Education", "التعليم"), options: [
    { value: "regulier", label: tx(lang, "Regulier onderwijs", "Regular education", "تعليم نظامي") },
    { value: "thuisonderwijs", label: tx(lang, "Thuisonderwijs", "Homeschooling", "تعليم منزلي") },
    { value: "islamitisch", label: tx(lang, "Islamitisch onderwijs", "Islamic education", "تعليم إسلامي") },
    { value: "speciaal", label: tx(lang, "Speciaal onderwijs", "Special education", "تعليم خاص") },
    { value: "anders", label: tx(lang, "Anders", "Other", "أخرى") },
  ] },
  { key: "educationDetails", label: tx(lang, "Beschrijf de onderwijssituatie nader", "Describe the educational situation further", "صف الوضع التعليمي بالتفصيل"), type: "hybrid", section: tx(lang, "Onderwijs", "Education", "التعليم"), conditional: (f) => f.education !== "thuisonderwijs", options: [
    { value: "goed_niveau", label: tx(lang, "Goed niveau, geen problemen", "Good level, no problems", "مستوى جيد، بدون مشاكل") },
    { value: "moeite_sommige_vakken", label: tx(lang, "Moeite met sommige vakken", "Difficulty with some subjects", "صعوبة في بعض المواد") },
    { value: "gedragsproblemen_school", label: tx(lang, "Gedragsproblemen op school", "Behavioral problems at school", "مشاكل سلوكية في المدرسة") },
    { value: "sociaal_moeilijk", label: tx(lang, "Sociaal moeilijk op school", "Socially difficult at school", "صعوبة في التواصل الاجتماعي بالمدرسة") },
    { value: "uitstekend", label: tx(lang, "Uitstekend / boven niveau", "Excellent / above level", "ممتاز / فوق المستوى") },
  ], hint },

  // === SOCIALE ANALYSE ===
  { key: "familyLife", label: tx(lang, "Beschrijf het gezinsleven (wie woont er thuis?)", "Describe family life (who lives at home?)", "صف الحياة الأسرية (مَن يسكن في البيت؟)"), type: "hybrid", section: tx(lang, "Sociale analyse", "Social analysis", "التحليل الاجتماعي"), options: [
    { value: "beide_ouders", label: tx(lang, "Woont bij beide ouders", "Lives with both parents", "يعيش مع كلا الوالدين") },
    { value: "alleen_moeder", label: tx(lang, "Alleen bij moeder", "Only with mother", "مع الأم فقط") },
    { value: "alleen_vader", label: tx(lang, "Alleen bij vader", "Only with father", "مع الأب فقط") },
    { value: "wisselend", label: tx(lang, "Wisselend (co-ouderschap)", "Alternating (co-parenting)", "بالتناوب (حضانة مشتركة بين الوالدين)") },
    { value: "uitgebreid_gezin", label: tx(lang, "Uitgebreid gezin (opa/oma erbij)", "Extended family (grandparents)", "عائلة ممتدة (مع الأجداد)") },
  ], hint },
  { key: "relationWithFather", label: tx(lang, "Hoe is de band met vader?", "How is the bond with father?", "كيف هي العلاقة مع الأب؟"), type: "hybrid", section: tx(lang, "Sociale analyse", "Social analysis", "التحليل الاجتماعي"), options: [
    { value: "warm_hecht", label: tx(lang, "Warm en hecht", "Warm and close", "دافئة وقريبة") },
    { value: "goed_afstandelijk", label: tx(lang, "Goed maar wat afstandelijk", "Good but somewhat distant", "جيدة لكن بعيدة نوعًا ما") },
    { value: "wisselend", label: tx(lang, "Wisselend", "Varying", "متغيرة") },
    { value: "gespannen", label: tx(lang, "Gespannen", "Tense", "متوترة") },
    { value: "afwezig", label: tx(lang, "Vader is afwezig", "Father is absent", "الأب غائب") },
  ], hint },
  { key: "relationWithMother", label: tx(lang, "Hoe is de band met moeder?", "How is the bond with mother?", "كيف هي العلاقة مع الأم؟"), type: "hybrid", section: tx(lang, "Sociale analyse", "Social analysis", "التحليل الاجتماعي"), options: [
    { value: "warm_hecht", label: tx(lang, "Warm en hecht", "Warm and close", "دافئة وقريبة") },
    { value: "goed_afstandelijk", label: tx(lang, "Goed maar wat afstandelijk", "Good but somewhat distant", "جيدة لكن بعيدة نوعًا ما") },
    { value: "wisselend", label: tx(lang, "Wisselend", "Varying", "متغيرة") },
    { value: "gespannen", label: tx(lang, "Gespannen", "Tense", "متوترة") },
    { value: "afwezig", label: tx(lang, "Moeder is afwezig", "Mother is absent", "الأم غائبة") },
  ], hint },
  { key: "relationWithSiblings", label: tx(lang, "Hoe is de band met broers/zussen?", "How is the bond with siblings?", "كيف هي العلاقة مع الإخوة/الأخوات؟"), type: "hybrid", section: tx(lang, "Sociale analyse", "Social analysis", "التحليل الاجتماعي"), options: [
    { value: "goed_speelt_samen", label: tx(lang, "Goed, speelt samen", "Good, plays together", "جيدة، يلعبون معًا") },
    { value: "wisselend_ruzie", label: tx(lang, "Wisselend, soms ruzie", "Varying, sometimes fights", "متغيرة، أحيانًا شجار") },
    { value: "veel_ruzie", label: tx(lang, "Veel ruzie", "Many fights", "شجار كثير") },
    { value: "geen_broers_zussen", label: tx(lang, "Geen broers/zussen", "No siblings", "لا إخوة/أخوات") },
    { value: "beschermend", label: tx(lang, "Beschermend naar jongeren", "Protective towards younger ones", "يحمي الأصغر منهم") },
  ], hint },
  { key: "friends", label: tx(lang, "Beschrijf de vrienden en hun invloed", "Describe friends and their influence", "صف أصدقاءه وتأثيرهم عليه"), type: "hybrid", section: tx(lang, "Sociale analyse", "Social analysis", "التحليل الاجتماعي"), options: [
    { value: "goede_moslim_vrienden", label: tx(lang, "Goede moslimvrienden", "Good Muslim friends", "أصدقاء مسلمون صالحون") },
    { value: "gemengd", label: tx(lang, "Gemengd (moslim en niet-moslim)", "Mixed (Muslim and non-Muslim)", "مختلط (مسلمون وغير مسلمين)") },
    { value: "weinig_vrienden", label: tx(lang, "Weinig vrienden", "Few friends", "أصدقاء قليلون") },
    { value: "slechte_invloed", label: tx(lang, "Slechte invloed", "Bad influence", "تأثير سيء") },
    { value: "geen_vrienden", label: tx(lang, "Geen vrienden", "No friends", "لا أصدقاء") },
  ], hint },
  { key: "neighborhood", label: tx(lang, "Beschrijf de wijk/buurt", "Describe the neighborhood", "صف الحي الذي تسكنون فيه"), type: "hybrid", section: tx(lang, "Sociale analyse", "Social analysis", "التحليل الاجتماعي"), options: [
    { value: "rustig_veilig", label: tx(lang, "Rustig en veilig", "Quiet and safe", "هادئ وآمن") },
    { value: "druk_maar_ok", label: tx(lang, "Druk maar oké", "Busy but okay", "مزدحم لكن مقبول") },
    { value: "negatieve_invloeden", label: tx(lang, "Negatieve invloeden", "Negative influences", "تأثيرات سلبية") },
    { value: "weinig_moslims", label: tx(lang, "Weinig moslims in de buurt", "Few Muslims in the area", "قليل من المسلمين في المنطقة") },
    { value: "veel_moslims", label: tx(lang, "Veel moslims in de buurt", "Many Muslims in the area", "كثير من المسلمين في المنطقة") },
  ], hint },

  // === BAND MET ALLAAH ===
  { key: "bondWithAllaah", label: tx(lang, "Hoe is de band van dit kind met Allaah?", "How is this child's bond with Allaah?", "كيف علاقة هذا الطفل بالله عز وجل؟"), type: "hybrid", section: tx(lang, "Band met Allaah", "Bond with Allaah", "العلاقة مع الله"), options: [
    { value: "sterk_bewust", label: tx(lang, "Sterk bewust van Allaah", "Strongly aware of Allaah", "وعي قوي بالله") },
    { value: "bij_gebed", label: tx(lang, "Vooral bij het gebed", "Mainly during prayer", "خاصة أثناء الصلاة") },
    { value: "beginnend", label: tx(lang, "Beginnend (leert nog)", "Beginning (still learning)", "في بداية التعلّم") },
    { value: "weinig_bewust", label: tx(lang, "Weinig bewust", "Little awareness", "وعي قليل") },
    { value: "te_jong", label: tx(lang, "Te jong om te beoordelen", "Too young to assess", "صغير على التقييم") },
  ], hint },
  { key: "prayerStatus", label: tx(lang, "Hoe is het gebed van dit kind?", "How is this child's prayer?", "كيف هي صلاة هذا الطفل؟"), type: "hybrid", section: tx(lang, "Band met Allaah", "Bond with Allaah", "العلاقة مع الله"), options: [
    { value: "bidt_5_zelfstandig", label: tx(lang, "Bidt 5x zelfstandig", "Prays 5x independently", "يصلي الخمس مستقلًّا") },
    { value: "bidt_mee_ouders", label: tx(lang, "Bidt mee met ouders", "Prays along with parents", "يصلي مع الوالدين") },
    { value: "soms_bidden", label: tx(lang, "Bidt soms", "Prays sometimes", "يصلي أحيانًا") },
    { value: "weigert", label: tx(lang, "Weigert te bidden", "Refuses to pray", "يرفض الصلاة") },
    { value: "te_jong", label: tx(lang, "Te jong (onder 7)", "Too young (under 7)", "صغير جدًا (أقل من 7)") },
  ], hint },
  { key: "quranConnection", label: tx(lang, "Hoe is de band met de Quraan?", "How is the bond with the Quran?", "كيف هي العلاقة مع القرآن؟"), type: "hybrid", section: tx(lang, "Band met Allaah", "Bond with Allaah", "العلاقة مع الله"), options: [
    { value: "leest_dagelijks", label: tx(lang, "Leest dagelijks", "Reads daily", "يقرأ يوميًا") },
    { value: "leert_memoriseren", label: tx(lang, "Leert en memoriseert", "Learns and memorizes", "يتعلم ويحفظ") },
    { value: "alleen_les", label: tx(lang, "Alleen tijdens les", "Only during lessons", "فقط أثناء الدروس") },
    { value: "weinig_contact", label: tx(lang, "Weinig contact met Quraan", "Little contact with Quraan", "علاقة ضعيفة بالقرآن") },
    { value: "te_jong", label: tx(lang, "Te jong / kan nog niet lezen", "Too young / can't read yet", "صغير / لم يتعلم القراءة بعد") },
  ], hint },
  { key: "islamicEducation", label: tx(lang, "Welke islamitische scholing volgt dit kind?", "What Islamic education does this child follow?", "ما التعليم الإسلامي الذي يتلقاه هذا الطفل؟"), type: "hybrid", section: tx(lang, "Band met Allaah", "Bond with Allaah", "العلاقة مع الله"), options: [
    { value: "moskee_regelmatig", label: tx(lang, "Moskee-les regelmatig", "Mosque lessons regularly", "دروس المسجد بانتظام") },
    { value: "thuisles_ouders", label: tx(lang, "Thuisles door ouders", "Home lessons by parents", "دروس منزلية من الوالدين") },
    { value: "online_les", label: tx(lang, "Online les", "Online lessons", "دروس عبر الإنترنت") },
    { value: "geen", label: tx(lang, "Geen islamitische scholing", "No Islamic education", "لا تعليم إسلامي") },
    { value: "combinatie", label: tx(lang, "Combinatie", "Combination", "مزيج") },
  ], hint },

  // === PERSOONLIJKHEIDSANALYSE ===
  { key: "goodThinking", label: tx(lang, "Goede denkwijze: hoe denkt het kind positief?", "Good thinking: how does the child think positively?", "التفكير الإيجابي: ما الجوانب الجيدة في تفكير الطفل؟"), type: "hybrid", section: tx(lang, "Persoonlijkheidsanalyse", "Personality analysis", "تحليل الشخصية"), options: [
    { value: "nieuwsgierig", label: tx(lang, "Nieuwsgierig en leergierig", "Curious and eager to learn", "فضولي ومتشوق للتعلم") },
    { value: "creatief", label: tx(lang, "Creatief denker", "Creative thinker", "مفكر مبدع") },
    { value: "logisch", label: tx(lang, "Logisch en analytisch", "Logical and analytical", "منطقي وتحليلي") },
    { value: "empathisch", label: tx(lang, "Denkt aan anderen", "Thinks of others", "يفكر في الآخرين") },
    { value: "oplossingsgericht", label: tx(lang, "Oplossingsgericht", "Solution-oriented", "موجه نحو الحلول") },
  ], hint },
  { key: "badThinking", label: tx(lang, "Minder goede denkwijze: hoe denkt het kind negatief?", "Less good thinking: how does the child think negatively?", "التفكير السلبي: ما الجوانب السلبية في تفكير الطفل؟"), type: "hybrid", section: tx(lang, "Persoonlijkheidsanalyse", "Personality analysis", "تحليل الشخصية"), options: [
    { value: "negatief_zelfbeeld", label: tx(lang, "Negatief zelfbeeld", "Negative self-image", "صورة ذاتية سلبية") },
    { value: "vergelijkt", label: tx(lang, "Vergelijkt zich met anderen", "Compares with others", "يقارن نفسه بالآخرين") },
    { value: "koppig", label: tx(lang, "Koppig / eigen gelijk", "Stubborn / always right", "عنيد / يصر على رأيه") },
    { value: "angstig", label: tx(lang, "Angstig denken", "Anxious thinking", "تفكير قلق") },
    { value: "onverschillig", label: tx(lang, "Onverschillig", "Indifferent", "لا مبالي") },
  ], hint },
  { key: "goodFeeling", label: tx(lang, "Goede voelwijze: hoe voelt het kind positief?", "Good feeling: how does the child feel positively?", "المشاعر الإيجابية: ما المشاعر الجيدة عند الطفل؟"), type: "hybrid", section: tx(lang, "Persoonlijkheidsanalyse", "Personality analysis", "تحليل الشخصية"), options: [
    { value: "empathisch", label: tx(lang, "Empathisch / voelt mee", "Empathic / feels for others", "متعاطف / يشعر بالآخرين") },
    { value: "blij", label: tx(lang, "Vrolijk en tevreden", "Cheerful and content", "مرح وراضٍ") },
    { value: "dankbaar", label: tx(lang, "Dankbaar", "Grateful", "شاكر") },
    { value: "liefdevol", label: tx(lang, "Liefdevol", "Loving", "محب") },
    { value: "stabiel", label: tx(lang, "Emotioneel stabiel", "Emotionally stable", "مستقر عاطفيًا") },
  ], hint },
  { key: "badFeeling", label: tx(lang, "Minder goede voelwijze: hoe voelt het kind negatief?", "Less good feeling: how does the child feel negatively?", "المشاعر السلبية: ما المشاعر السيئة عند الطفل؟"), type: "hybrid", section: tx(lang, "Persoonlijkheidsanalyse", "Personality analysis", "تحليل الشخصية"), options: [
    { value: "snel_boos", label: tx(lang, "Snel boos", "Quick to anger", "سريع الغضب") },
    { value: "angstig", label: tx(lang, "Angstig / onzeker", "Anxious / insecure", "قلق / غير واثق") },
    { value: "jaloers", label: tx(lang, "Jaloers", "Jealous", "غيور") },
    { value: "verdrietig", label: tx(lang, "Vaak verdrietig", "Often sad", "حزين كثيرًا") },
    { value: "overweldigd", label: tx(lang, "Snel overweldigd", "Easily overwhelmed", "سريع الإرهاق") },
  ], hint },
  { key: "goodSpeaking", label: tx(lang, "Goede spreekwijze: hoe spreekt het kind positief?", "Good speaking: how does the child speak positively?", "الكلام الإيجابي: ما الجوانب الجيدة في كلام الطفل؟"), type: "hybrid", section: tx(lang, "Persoonlijkheidsanalyse", "Personality analysis", "تحليل الشخصية"), options: [
    { value: "beleefd", label: tx(lang, "Beleefd en respectvol", "Polite and respectful", "مؤدب ومحترم") },
    { value: "eerlijk", label: tx(lang, "Eerlijk / zegt de waarheid", "Honest / tells the truth", "صادق / يقول الحقيقة") },
    { value: "bedankt", label: tx(lang, "Bedankt en waardeert", "Thanks and appreciates", "يشكر ويقدر") },
    { value: "rustig", label: tx(lang, "Rustig en duidelijk", "Calm and clear", "هادئ وواضح") },
    { value: "dhikr", label: tx(lang, "Zegt bismillaah / adhkaar", "Says bismillaah / adhkaar", "يقول بسم الله / الأذكار") },
  ], hint },
  { key: "badSpeaking", label: tx(lang, "Minder goede spreekwijze: hoe spreekt het kind negatief?", "Less good speaking: how does the child speak negatively?", "الكلام السلبي: ما الجوانب السيئة في كلام الطفل؟"), type: "hybrid", section: tx(lang, "Persoonlijkheidsanalyse", "Personality analysis", "تحليل الشخصية"), options: [
    { value: "schreeuwt", label: tx(lang, "Schreeuwt", "Shouts", "يصرخ") },
    { value: "liegt", label: tx(lang, "Liegt soms", "Lies sometimes", "يكذب أحيانًا") },
    { value: "brutaal", label: tx(lang, "Brutaal / onbeleefd", "Rude / impolite", "وقح / غير مؤدب") },
    { value: "klaagt", label: tx(lang, "Klaagt veel", "Complains a lot", "يشتكي كثيرًا") },
    { value: "scheldwoorden", label: tx(lang, "Gebruikt scheldwoorden", "Uses swear words", "يستخدم ألفاظًا بذيئة") },
  ], hint },
  { key: "goodDoing", label: tx(lang, "Goede werkwijze: wat doet het kind goed?", "Good behavior: what does the child do well?", "السلوك الإيجابي: ما الأفعال الجيدة عند الطفل؟"), type: "hybrid", section: tx(lang, "Persoonlijkheidsanalyse", "Personality analysis", "تحليل الشخصية"), options: [
    { value: "helpt_huis", label: tx(lang, "Helpt in huis", "Helps at home", "يساعد في المنزل") },
    { value: "bidt_mee", label: tx(lang, "Bidt mee", "Prays along", "يصلي مع العائلة") },
    { value: "deelt", label: tx(lang, "Deelt met anderen", "Shares with others", "يشارك مع الآخرين") },
    { value: "zelfstandig", label: tx(lang, "Zelfstandig", "Independent", "مستقل") },
    { value: "gehoorzaam", label: tx(lang, "Gehoorzaam", "Obedient", "مطيع") },
  ], hint },
  { key: "badDoing", label: tx(lang, "Minder goede werkwijze: wat doet het kind verkeerd?", "Less good behavior: what does the child do wrong?", "السلوك السلبي: ما الأفعال السيئة عند الطفل؟"), type: "hybrid", section: tx(lang, "Persoonlijkheidsanalyse", "Personality analysis", "تحليل الشخصية"), options: [
    { value: "slaat", label: tx(lang, "Slaat / fysiek agressief", "Hits / physically aggressive", "يضرب / عدواني جسديًا") },
    { value: "weigert", label: tx(lang, "Weigert taken", "Refuses tasks", "يرفض المهام") },
    { value: "liegt_doet", label: tx(lang, "Doet stiekem dingen", "Does things secretly", "يفعل أشياء خفيةً") },
    { value: "lui", label: tx(lang, "Lui / geen initiatief", "Lazy / no initiative", "كسول / لا يبادر") },
    { value: "ongehoorzaam", label: tx(lang, "Ongehoorzaam", "Disobedient", "غير مطيع") },
  ], hint },

  // === GEZONDHEID ===
  { key: "physicalHealth", label: tx(lang, "Hoe is de lichamelijke gezondheid?", "How is the physical health?", "كيف هي الصحة الجسدية؟"), type: "hybrid", section: tx(lang, "Gezondheid", "Health", "الصحة"), options: [
    { value: "goed", label: tx(lang, "Goed, geen klachten", "Good, no complaints", "جيدة، بدون شكاوى") },
    { value: "lichte_klachten", label: tx(lang, "Lichte klachten", "Minor complaints", "شكاوى بسيطة") },
    { value: "chronisch", label: tx(lang, "Chronische aandoening", "Chronic condition", "حالة مزمنة") },
    { value: "overgewicht", label: tx(lang, "Overgewicht", "Overweight", "زيادة في الوزن") },
    { value: "ondergewicht", label: tx(lang, "Ondergewicht", "Underweight", "نقص في الوزن") },
  ], hint },
  { key: "mentalHealth", label: tx(lang, "Hoe is de mentale gezondheid?", "How is the mental health?", "كيف هي الصحة النفسية؟"), type: "hybrid", section: tx(lang, "Gezondheid", "Health", "الصحة"), options: [
    { value: "goed_stabiel", label: tx(lang, "Goed en stabiel", "Good and stable", "جيدة ومستقرة") },
    { value: "soms_onrustig", label: tx(lang, "Soms onrustig / prikkelbaar", "Sometimes restless / irritable", "أحيانًا قلق / سريع الانفعال") },
    { value: "angstig", label: tx(lang, "Angstig / veel zorgen", "Anxious / many worries", "قلق / كثير الهموم") },
    { value: "adhd_kenmerken", label: tx(lang, "ADHD-kenmerken", "ADHD characteristics", "سمات ADHD (فرط الحركة وتشتت الانتباه)") },
    { value: "diagnose", label: tx(lang, "Heeft een diagnose", "Has a diagnosis", "لديه تشخيص") },
  ], hint },
  { key: "sleepQuality", label: tx(lang, "Hoe is de slaap?", "How is the sleep?", "كيف هو النوم؟"), type: "hybrid", section: tx(lang, "Gezondheid", "Health", "الصحة"), options: [
    { value: "goed_vast_ritme", label: tx(lang, "Goed, vast ritme", "Good, fixed rhythm", "جيد، إيقاع ثابت") },
    { value: "wisselend", label: tx(lang, "Wisselend", "Varying", "متغير") },
    { value: "moeilijk_inslapen", label: tx(lang, "Moeilijk inslapen", "Difficulty falling asleep", "صعوبة في النوم") },
    { value: "te_laat_naar_bed", label: tx(lang, "Te laat naar bed", "Goes to bed too late", "ينام متأخرًا") },
    { value: "nachtmerries", label: tx(lang, "Nachtmerries / onrustig", "Nightmares / restless", "كوابيس / نوم مضطرب") },
  ], hint },

  // === MEDIA & STRUCTUUR ===
  { key: "mediaUse", label: tx(lang, "Hoe is het mediagebruik (TV, YouTube, games)?", "How is media use (TV, YouTube, games)?", "كيف هو استخدام الوسائط (تلفزيون، يوتيوب، ألعاب)؟"), type: "hybrid", section: tx(lang, "Media & Structuur", "Media & Structure", "الوسائط والتنظيم"), options: [
    { value: "beperkt_gecontroleerd", label: tx(lang, "Beperkt en gecontroleerd", "Limited and controlled", "محدود ومراقب") },
    { value: "matig_1_2_uur", label: tx(lang, "Matig (1-2 uur/dag)", "Moderate (1-2 hrs/day)", "معتدل (1-2 ساعة/يوم)") },
    { value: "veel_3_plus", label: tx(lang, "Veel (3+ uur/dag)", "A lot (3+ hrs/day)", "كثير (3+ ساعات/يوم)") },
    { value: "ongecontroleerd", label: tx(lang, "Ongecontroleerd", "Uncontrolled", "غير مراقب") },
    { value: "geen", label: tx(lang, "Geen schermtijd", "No screen time", "لا وقت شاشة") },
  ], hint },
  { key: "socialMedia", label: tx(lang, "Gebruikt dit kind sociale media?", "Does this child use social media?", "هل يستخدم هذا الطفل وسائل التواصل الاجتماعي؟"), type: "hybrid", section: tx(lang, "Media & Structuur", "Media & Structure", "الوسائط والتنظيم"), options: [
    { value: "nee_te_jong", label: tx(lang, "Nee, te jong", "No, too young", "لا، صغير جدًا") },
    { value: "nee_niet_toegestaan", label: tx(lang, "Nee, niet toegestaan", "No, not allowed", "لا، غير مسموح") },
    { value: "ja_beperkt", label: tx(lang, "Ja, beperkt en gecontroleerd", "Yes, limited and controlled", "نعم، محدود ومراقب") },
    { value: "ja_veel", label: tx(lang, "Ja, veel", "Yes, a lot", "نعم، كثيرًا") },
    { value: "ja_ongecontroleerd", label: tx(lang, "Ja, ongecontroleerd", "Yes, uncontrolled", "نعم، بدون رقابة") },
  ], hint },
  { key: "dailyStructure", label: tx(lang, "Hoe is de dagstructuur?", "How is the daily structure?", "كيف هو التنظيم اليومي؟"), type: "hybrid", section: tx(lang, "Media & Structuur", "Media & Structure", "الوسائط والتنظيم"), options: [
    { value: "vast_ritme", label: tx(lang, "Vast ritme met vaste tijden", "Fixed rhythm with set times", "إيقاع ثابت بأوقات محددة") },
    { value: "redelijk", label: tx(lang, "Redelijk gestructureerd", "Fairly structured", "منظم نسبيًا") },
    { value: "wisselend", label: tx(lang, "Wisselend per dag", "Varying per day", "متغير حسب اليوم") },
    { value: "chaotisch", label: tx(lang, "Chaotisch / geen structuur", "Chaotic / no structure", "فوضوي / بلا نظام") },
    { value: "te_druk", label: tx(lang, "Te druk gepland", "Too busy/scheduled", "جدوله مزدحم جدًا") },
  ], hint },

  // === INTERESSES & GEWOONTES ===
  { key: "affinities", label: tx(lang, "Waar voelt het kind zich toe aangetrokken?", "What is the child attracted to?", "ما الذي يميل إليه هذا الطفل؟"), type: "hybrid", section: tx(lang, "Interesses & Gewoontes", "Interests & Habits", "الاهتمامات والعادات"), options: [
    { value: "sport", label: tx(lang, "Sport", "Sports", "الرياضة") },
    { value: "techniek", label: tx(lang, "Techniek / computers", "Technology / computers", "التكنولوجيا / الحاسوب") },
    { value: "creatief", label: tx(lang, "Creatief (tekenen, knutselen)", "Creative (drawing, crafts)", "إبداعي (رسم، أشغال يدوية)") },
    { value: "natuur_dieren", label: tx(lang, "Natuur / dieren", "Nature / animals", "الطبيعة / الحيوانات") },
    { value: "lezen_verhalen", label: tx(lang, "Lezen / verhalen", "Reading / stories", "القراءة / القصص") },
  ], hint },
  { key: "hobbies", label: tx(lang, "Wat zijn de hobby's?", "What are the hobbies?", "ما هي الهوايات؟"), type: "hybrid", section: tx(lang, "Interesses & Gewoontes", "Interests & Habits", "الاهتمامات والعادات"), options: [
    { value: "voetbal", label: tx(lang, "Voetbal", "Football", "كرة القدم") },
    { value: "lezen", label: tx(lang, "Lezen", "Reading", "القراءة") },
    { value: "gamen", label: tx(lang, "Gamen", "Gaming", "الألعاب الإلكترونية") },
    { value: "tekenen", label: tx(lang, "Tekenen", "Drawing", "الرسم") },
    { value: "quran", label: tx(lang, "Quraan leren", "Learning Quraan", "تعلم القرآن") },
  ], hint },
  { key: "goodHabits", label: tx(lang, "Goede gewoontes", "Good habits", "العادات الجيدة"), type: "hybrid", section: tx(lang, "Interesses & Gewoontes", "Interests & Habits", "الاهتمامات والعادات"), options: [
    { value: "bidt_mee", label: tx(lang, "Bidt mee", "Prays along", "يصلي مع العائلة") },
    { value: "leest_quran", label: tx(lang, "Leest Quraan", "Reads Quraan", "يقرأ القرآن") },
    { value: "helpt_huis", label: tx(lang, "Helpt in huis", "Helps at home", "يساعد في المنزل") },
    { value: "op_tijd_slapen", label: tx(lang, "Op tijd naar bed", "Goes to bed on time", "ينام في الوقت المحدد") },
    { value: "beleefd", label: tx(lang, "Beleefd tegen ouderen", "Polite to elders", "مؤدب مع الكبار") },
  ], hint },
  { key: "badHabits", label: tx(lang, "Slechte gewoontes", "Bad habits", "العادات السيئة"), type: "hybrid", section: tx(lang, "Interesses & Gewoontes", "Interests & Habits", "الاهتمامات والعادات"), options: [
    { value: "nagelbijten", label: tx(lang, "Nagelbijten", "Nail biting", "قضم الأظافر") },
    { value: "te_lang_scherm", label: tx(lang, "Te lang op scherm", "Too long on screen", "وقت طويل على الشاشة") },
    { value: "niet_luisteren", label: tx(lang, "Niet luisteren bij eerste keer", "Doesn't listen the first time", "لا يستمع من أول مرة") },
    { value: "liegen", label: tx(lang, "Liegen", "Lying", "الكذب") },
    { value: "te_laat_slapen", label: tx(lang, "Te laat naar bed", "Goes to bed too late", "ينام متأخرًا") },
  ], hint },
];
}

export default function EnvironmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { state, updateEnvironment, updateChild } = useAppState();
  const { language } = useI18n();
  const lang: Lang = language as Lang;
  const ENV_QUESTIONS = getEnvQuestions(lang);
  const scrollRef = useRef<ScrollView>(null);
  const fieldPositions = useRef<Record<string, number>>({});

  const existingEnv = state.environments.find((e) => e.childId === id);
  const child = state.children.find((c) => c.id === id);

  const [formData, setFormData] = useState<Record<string, string>>(() => {
    if (existingEnv) {
      return { ...existingEnv } as unknown as Record<string, string>;
    }
    const initial: Record<string, string> = {};
    ENV_QUESTIONS.forEach((q) => { initial[q.key] = ""; });
    return initial;
  });

  const [errors, setErrors] = useState<Set<string>>(new Set());
  const [showValidation, setShowValidation] = useState(false);

  const validateForm = useCallback((): string[] => {
    const unanswered: string[] = [];
    for (const q of ENV_QUESTIONS) {
      // Skip questions hidden by conditional (Fix #8)
      if (q.conditional && !q.conditional(formData)) continue;
      if (!formData[q.key] || formData[q.key].trim() === "") {
        unanswered.push(q.key);
      }
    }
    return unanswered;
  }, [formData]);

  const scrollToFirstError = (firstErrorKey: string) => {
    const yPos = fieldPositions.current[firstErrorKey];
    if (yPos !== undefined && scrollRef.current) {
      scrollRef.current.scrollTo({ y: Math.max(0, yPos - 100), animated: true });
    } else {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  };

  const handleSubmit = async () => {
    const unanswered = validateForm();
    if (unanswered.length > 0) {
      setErrors(new Set(unanswered));
      setShowValidation(true);
      scrollToFirstError(unanswered[0]);
      return;
    }

    const envData: ChildEnvironment = {
      childId: id!,
      education: formData.education,
      educationDetails: formData.educationDetails,
      familyLife: formData.familyLife,
      neighborhood: formData.neighborhood,
      friends: formData.friends,
      islamicEducation: formData.islamicEducation,
      mediaUse: formData.mediaUse,
      socialMedia: formData.socialMedia,
      dailyStructure: formData.dailyStructure,
      goodThinking: formData.goodThinking,
      goodFeeling: formData.goodFeeling,
      goodSpeaking: formData.goodSpeaking,
      goodDoing: formData.goodDoing,
      badThinking: formData.badThinking,
      badFeeling: formData.badFeeling,
      badSpeaking: formData.badSpeaking,
      badDoing: formData.badDoing,
      affinities: formData.affinities,
      hobbies: formData.hobbies,
      goodHabits: formData.goodHabits,
      badHabits: formData.badHabits,
      relationWithFather: formData.relationWithFather,
      relationWithMother: formData.relationWithMother,
      relationWithSiblings: formData.relationWithSiblings,
      bondWithAllaah: formData.bondWithAllaah,
      prayerStatus: formData.prayerStatus,
      quranConnection: formData.quranConnection,
      physicalHealth: formData.physicalHealth,
      mentalHealth: formData.mentalHealth,
      sleepQuality: formData.sleepQuality,
      completed: true,
    };

    await updateEnvironment(envData);
    await updateChild(id!, { profileCompleted: true, laterInvullen: false });
    Alert.alert(
      tx(lang, "Opgeslagen", "Saved", "تم الحفظ"),
      tx(lang, "De omgevingsanalyse is opgeslagen.", "The environment analysis has been saved.", "تم حفظ تحليل بيئة الطفل بنجاح."),
      [{ text: tx(lang, "OK", "OK", "حسنًا"), onPress: () => router.back() }]
    );
  };

  const handleLaterInvullen = async () => {
    const envData: ChildEnvironment = {
      childId: id!,
      education: formData.education || "",
      educationDetails: formData.educationDetails || "",
      familyLife: formData.familyLife || "",
      neighborhood: formData.neighborhood || "",
      friends: formData.friends || "",
      islamicEducation: formData.islamicEducation || "",
      mediaUse: formData.mediaUse || "",
      socialMedia: formData.socialMedia || "",
      dailyStructure: formData.dailyStructure || "",
      goodThinking: formData.goodThinking || "",
      goodFeeling: formData.goodFeeling || "",
      goodSpeaking: formData.goodSpeaking || "",
      goodDoing: formData.goodDoing || "",
      badThinking: formData.badThinking || "",
      badFeeling: formData.badFeeling || "",
      badSpeaking: formData.badSpeaking || "",
      badDoing: formData.badDoing || "",
      affinities: formData.affinities || "",
      hobbies: formData.hobbies || "",
      goodHabits: formData.goodHabits || "",
      badHabits: formData.badHabits || "",
      relationWithFather: formData.relationWithFather || "",
      relationWithMother: formData.relationWithMother || "",
      relationWithSiblings: formData.relationWithSiblings || "",
      bondWithAllaah: formData.bondWithAllaah || "",
      prayerStatus: formData.prayerStatus || "",
      quranConnection: formData.quranConnection || "",
      physicalHealth: formData.physicalHealth || "",
      mentalHealth: formData.mentalHealth || "",
      sleepQuality: formData.sleepQuality || "",
      completed: false,
    };
    await updateEnvironment(envData);
    await updateChild(id!, { laterInvullen: true });
    router.back();
  };

  const handleGoToFirstError = () => {
    const unanswered = validateForm();
    if (unanswered.length > 0) {
      scrollToFirstError(unanswered[0]);
    }
  };

  const handleFieldLayout = (key: string, event: LayoutChangeEvent) => {
    fieldPositions.current[key] = event.nativeEvent.layout.y;
  };

  const updateField = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (errors.has(key)) {
      const newErrors = new Set(errors);
      newErrors.delete(key);
      setErrors(newErrors);
      if (newErrors.size === 0) {
        setShowValidation(false);
      }
    }
  };

  // Group by section
  const sections = [...new Set(ENV_QUESTIONS.map((q) => q.section))];

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      {showValidation && (
        <View style={{ paddingTop: insets.top }}>
          <ValidationBanner unansweredCount={errors.size} onGoToFirst={handleGoToFirstError} />
        </View>
      )}
      {/* Sticky progress bar at top */}
      {!showValidation && (
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 8, backgroundColor: colors.background, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
          <HasanaatProgressBar
            answeredCount={ENV_QUESTIONS.filter((q) => (!q.conditional || q.conditional(formData)) && formData[q.key] && formData[q.key].trim() !== "").length}
            totalCount={ENV_QUESTIONS.filter((q) => !q.conditional || q.conditional(formData)).length}
          />
        </View>
      )}
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerStyle={{
          paddingTop: 16,
          paddingBottom: insets.bottom + 60,
          paddingHorizontal: 20,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Back button */}
        <Pressable onPress={() => router.back()} className="mb-4">
          <Text className="text-base" style={{ color: colors.primary }}>{tx(lang, "← Terug", "← Back", "← رجوع")}</Text>
        </Pressable>

        <Text className="text-2xl font-bold mb-2" style={{ color: colors.foreground }}>
          {tx(lang, `Omgevingsanalyse — ${child?.name || "Kind"}`, `Environment analysis — ${child?.name || "Child"}`, `تحليل البيئة — ${child?.name || "طفل"}`)}
        </Text>

        {/* Honesty banner */}
        <HonestyBanner />

        <Text className="text-sm mb-6" style={{ color: colors.muted }}>
          {tx(lang, "Per vraag kunt u kiezen: meerkeuze of open antwoord. Alle vragen zijn verplicht.", "For each question you can choose: multiple choice or open answer. All questions are required.", "لكل سؤال يمكنك: اختيار من الخيارات أو كتابة إجابة مفتوحة. جميع الأسئلة إلزامية.")}
        </Text>

        {sections.map((sectionName) => {
          const sectionQuestions = ENV_QUESTIONS.filter((q) => q.section === sectionName && (!q.conditional || q.conditional(formData)));
          if (sectionQuestions.length === 0) return null;
          return (
            <View key={sectionName} className="mb-4">
              <View className="mb-2 pb-1 border-b" style={{ borderColor: colors.border }}>
                <Text className="text-base font-bold" style={{ color: colors.primary }}>
                  {sectionName}
                </Text>
              </View>
              {sectionQuestions.map((q) => {
                const hasError = errors.has(q.key);
                return (
                  <View key={q.key} onLayout={(e) => handleFieldLayout(q.key, e)}>
                    {q.type === "select" && q.options ? (
                      <FormField label={q.label} error={hasError} id={q.key}>
                        <SelectField
                          value={formData[q.key]}
                          options={q.options}
                          onSelect={(val) => updateField(q.key, val)}
                          error={hasError}
                        />
                      </FormField>
                    ) : q.type === "hybrid" && q.options ? (
                      <FormField label={q.label} error={hasError} id={q.key}>
                        {q.hint && (
                          <Text className="text-xs mb-2 italic" style={{ color: colors.muted }}>
                            {q.hint}
                          </Text>
                        )}
                        <HybridField
                          value={formData[q.key]}
                          options={q.options}
                          onSelect={(val) => updateField(q.key, val)}
                          onChangeText={(text) => updateField(q.key, text)}
                          placeholder={tx(lang, "Typ hier uw eigen antwoord...", "Type your own answer here...", "اكتب إجابتك الخاصة هنا...")}
                          error={hasError}
                        />
                      </FormField>
                    ) : (
                      <FormField label={q.label} error={hasError} id={q.key}>
                        {q.hint && (
                          <Text className="text-xs mb-2 italic" style={{ color: colors.muted }}>
                            {q.hint}
                          </Text>
                        )}
                        <TextField
                          value={formData[q.key]}
                          onChangeText={(text) => updateField(q.key, text)}
                          placeholder={tx(lang, "Beschrijf hier in detail...", "Describe here in detail...", "صف هنا بالتفصيل...")}
                          multiline
                          error={hasError}
                        />
                      </FormField>
                    )}
                  </View>
                );
              })}
            </View>
          );
        })}

        <Pressable
          onPress={handleSubmit}
          className="rounded-xl py-4 items-center mt-6"
          style={{ backgroundColor: colors.primary }}
        >
          <Text className="text-white text-lg font-bold">{tx(lang, "Opslaan", "Save", "حفظ")}</Text>
        </Pressable>

        <Pressable
          onPress={handleLaterInvullen}
          className="rounded-xl py-4 items-center mt-3 border"
          style={{ borderColor: colors.border }}
        >
          <Text className="text-base font-medium" style={{ color: colors.muted }}>
            {tx(lang, "Later invullen", "Fill in later", "إكمال لاحقًا")}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
