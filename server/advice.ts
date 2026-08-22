import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "./_core/trpc";
import * as db from "./db";
import { invokeLLM } from "./_core/llm";
import { summarizeSignals, buildPartnerSignalContext, buildPartnerAnswersContext, getOwnCheckinContext } from "./daily-diagnostic";
import { NAME_FIDELITY_RULE } from "./name-fidelity";
import { SOURCE_GROUNDING_RULE } from "./source-grounding";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __adviceFilename = fileURLToPath(import.meta.url);
const __adviceDir = path.dirname(__adviceFilename);

function resolveDataPath(filename: string): string {
  // Try server/data first (large server-only files moved here)
  const serverDataPath = path.resolve(__adviceDir, "data", filename);
  if (fs.existsSync(serverDataPath)) return serverDataPath;
  // Try relative to this file (production bundle)
  const relPath = path.resolve(__adviceDir, "../assets/data", filename);
  if (fs.existsSync(relPath)) return relPath;
  // Fallback: server/data from cwd
  const cwdServerData = path.resolve(process.cwd(), "server/data", filename);
  if (fs.existsSync(cwdServerData)) return cwdServerData;
  // Fallback to process.cwd() assets/data (works in dev)
  return path.resolve(process.cwd(), "assets/data", filename);
}

/**
 * Post-processing: sanitize Arabic text to remove Dutch transliterations.
 * This catches cases where the LLM still writes Dutch words in Arabic letters.
 */
function sanitizeArabicText(text: string): string {
  if (!text) return text;
  
  // Common Dutch words that get transliterated into Arabic letters
  const dutchToArabic: [RegExp, string][] = [
    // Adjectives / descriptions
    [/\bبلي\b/g, "مبتهج"],
    [/\bبلاي\b/g, "مبتهج"],
    [/\bإيرلك\b/g, "صادق"],
    [/\bإيرليك\b/g, "صادق"],
    [/\bسوسيال\b/g, "اجتماعي"],
    [/\bسوشيال\b/g, "اجتماعي"],
    [/\bجيهورزام\b/g, "مطيع"],
    [/\bغيهورزام\b/g, "مطيع"],
    [/\bليرخيريخ\b/g, "محب للتعلم"],
    [/\bليرجيريج\b/g, "محب للتعلم"],
    [/\bليرجيريخ\b/g, "محب للتعلم"],
    [/\bأكتيف\b/g, "نشيط"],
    [/\bأغريسيف\b/g, "عدواني"],
    [/\bأغرسيف\b/g, "عدواني"],
    [/\bدروكت\b/g, "مشغول"],
    [/\bدروك\b/g, "مشغول"],
    [/\bروستيخ\b/g, "هادئ"],
    [/\bروستيج\b/g, "هادئ"],
    [/\bستيرك\b/g, "قوي"],
    [/\bزفاك\b/g, "ضعيف"],
    [/\bسليم\b/g, "ذكي"],  // slim = clever in Dutch
    [/\bدوم\b/g, "غبي"],
    [/\bلوي\b/g, "كسول"],
    [/\bفلايتيخ\b/g, "مجتهد"],
    [/\bفلايتيج\b/g, "مجتهد"],
    [/\bبانغ\b/g, "خائف"],
    [/\bبوس\b/g, "غاضب"],
    [/\bفيردريتيخ\b/g, "حزين"],
    [/\bفيردريتيج\b/g, "حزين"],
    [/\bجالورس\b/g, "غيور"],
    [/\bيالورس\b/g, "غيور"],
    // Nouns / concepts
    [/\bسخول\b/g, "المدرسة"],
    [/\bسكول\b/g, "المدرسة"],
    [/\bيوف\b/g, "المعلم"],
    [/\bليركراخت\b/g, "المعلم"],
    [/\bفريندن\b/g, "الأصدقاء"],
    [/\bفريندين\b/g, "الأصدقاء"],
    [/\bهويسفيرك\b/g, "الواجب المنزلي"],
    [/\bسبيلن\b/g, "اللعب"],
    [/\bسبيلين\b/g, "اللعب"],
    [/\bليغو\b/g, "الليجو"],
    [/\bفوتبال\b/g, "كرة القدم"],
    [/\bكومبيوتر\b/g, "الحاسوب"],
    [/\bتيليفيزي\b/g, "التلفاز"],
    [/\bتلفيزي\b/g, "التلفاز"],
    [/\bآيباد\b/g, "الجهاز اللوحي"],
    [/\bتيليفون\b/g, "الهاتف"],
    [/\bموبيل\b/g, "الهاتف"],
    // Verbs / actions
    [/\bسلان\b/g, "الضرب"],
    [/\bسلاان\b/g, "الضرب"],
    [/\bشيلدن\b/g, "الشتم"],
    [/\bبيستن\b/g, "التنمر"],
    [/\bبستن\b/g, "التنمر"],
    [/\bليخن\b/g, "الكذب"],
    [/\bليجن\b/g, "الكذب"],
    [/\bستيلن\b/g, "السرقة"],
    [/\bهويلن\b/g, "البكاء"],
    [/\bشريوفن\b/g, "الصراخ"],
    // Family
    [/\bمودر\b/g, "الأم"],
    [/\bفادر\b/g, "الأب"],
    [/\bبرور\b/g, "الأخ"],
    [/\bزوس\b/g, "الأخت"],
    [/\bأوما\b/g, "الجدة"],
    [/\bأوبا\b/g, "الجد"],
  ];

  // === Prohibited Western psychology / philosophy / New Age / Western parenting terms ===
  // Replace with proper Islamic alternatives from Quran, Sunnah and understanding of Salaf
  const prohibitedTerms: [RegExp, string][] = [
    // --- علم النفس الغربي (فرويد، يونغ، ماسلو، روجرز) ---
    [/الأنا العليا/g, "النفس اللوامة"],
    [/الأنا الأعلى/g, "النفس اللوامة"],
    [/\bالهو\b/g, "النفس الأمارة بالسوء"],
    [/العقدة النفسية/g, "الابتلاء"],
    [/العقد النفسية/g, "الابتلاءات"],
    [/عقدة أوديب/g, ""],
    [/عقدة النقص/g, "ضعف الثقة بنعم الله"],
    [/عقدة الذنب/g, "الندم على المعصية"],
    [/الكبت النفسي/g, "الصبر"],
    [/\bالكبت\b/g, "الصبر"],
    [/الإسقاط النفسي/g, "سوء الظن بالآخرين"],
    [/هرم ماسلو/g, "حاجات الإنسان الفطرية"],
    [/تقدير الذات/g, "الثقة بالله ثم بالنفس"],
    [/احترام الذات/g, "الكرامة وعزة المؤمن"],
    [/صورة الذات/g, "معرفة النفس"],
    [/تحقيق الذات/g, "تحقيق العبودية لله"],
    [/الحاجة للانتماء/g, "الأخوة الإسلامية وصلة الرحم"],
    [/التعلق المرضي/g, "ضعف التوكل على الله"],
    [/أنماط التعلق/g, "أنماط العلاقة بين الوالد والطفل"],
    [/التعلق الآمن/g, "الأمان في كنف الوالدين"],
    [/التعلق القلق/g, "القلق من فقدان الوالدين"],
    [/الطفل الداخلي/g, ""],
    [/الصدمة النفسية/g, "الابتلاء"],
    [/الصدمات النفسية/g, "الابتلاءات"],
    [/اضطراب ما بعد الصدمة/g, "أثر المصيبة"],
    [/النرجسية/g, "الكبر والعُجب"],
    [/الشخصية النرجسية/g, "المتكبر المعجب بنفسه"],
    [/الشخصية السيكوباتية/g, "فاسد القلب منعدم الرحمة"],
    [/السيكوباتي/g, "فاسد القلب"],
    [/التنمر/g, "الظلم والإيذاء"],
    [/الذكاء العاطفي/g, "الحلم وحسن الخلق"],
    [/الذكاء الاجتماعي/g, "حسن المعاشرة والأدب"],
    [/الذكاء المتعدد/g, "تنوع المواهب والملكات"],
    [/المرونة النفسية/g, "الصبر والرضا بالقدر"],
    [/التفكير الإيجابي/g, "حسن الظن بالله والتفاؤل"],
    [/التفكير السلبي/g, "سوء الظن بالله والتشاؤم"],
    [/منطقة الراحة/g, "الركون والدعة"],
    [/التحفيز الذاتي/g, "الهمة العالية والمجاهدة"],
    [/الاحتراق النفسي/g, "الإرهاق والحاجة للراحة"],
    [/الاحتراق الوظيفي/g, "الإرهاق والحاجة للراحة"],
    [/الحدود النفسية/g, "حقوق النفس في الإسلام"],
    [/الحدود الشخصية/g, "حقوق النفس في الإسلام"],
    [/العلاج السلوكي المعرفي/g, "تصحيح التفكير والسلوك"],
    [/العلاج المعرفي/g, "تصحيح التفكير"],
    [/التعزيز الإيجابي/g, "الثواب والتشجيع"],
    [/التعزيز السلبي/g, "العقاب والزجر"],
    [/الإشراط الكلاسيكي/g, "التعويد والتدريب"],
    [/الإشراط الإجرائي/g, "التعويد والتدريب"],
    [/\bالإشراط\b/g, "التعويد"],
    [/اللعب العلاجي/g, "اللعب التربوي"],
    [/التنفيس الانفعالي/g, "إخراج الغضب بالمباح"],
    [/التفريغ العاطفي/g, "البكاء والشكوى لله"],
    [/قبول الذات غير المشروط/g, "الرضا بقدر الله مع السعي للتحسن"],
    [/التقبل غير المشروط/g, "الرحمة مع التقويم"],
    [/عدم إصدار الأحكام/g, "العدل وعدم الظلم"],
    [/المساحة الآمنة/g, "الأمان والطمأنينة في البيت"],
    [/التمكين النفسي/g, "التربية على المسؤولية"],
    [/\bالتمكين\b/g, "التربية على المسؤولية"],
    [/الاستقلالية المطلقة/g, "تحمل المسؤولية تحت إشراف الوالدين"],
    [/إدارة الغضب/g, "كظم الغيظ والحلم"],
    [/إدارة المشاعر/g, "ضبط النفس والصبر"],
    [/إدارة الانفعالات/g, "ضبط النفس والصبر"],
    [/الوسواس القهري/g, "الوسوسة وكيد الشيطان"],
    [/القلق المرضي/g, "الخوف وضعف التوكل"],
    [/اضطراب القلق/g, "الخوف وضعف التوكل"],
    [/الاكتئاب/g, "الحزن وضيق الصدر"],
    [/فرط الحركة/g, "كثرة الحركة والنشاط الزائد"],
    [/اضطراب فرط النشاط/g, "كثرة الحركة"],
    [/الفوبيا/g, "الخوف الشديد"],
    [/الهستيريا/g, "الانفعال الشديد"],
    [/البارانويا/g, "سوء الظن"],
    [/الشخصية الحدية/g, "تقلب المزاج وضعف ضبط النفس"],
    [/ثنائي القطب/g, "تقلب الحال"],
    [/اضطراب ثنائي/g, "تقلب الحال"],
    [/المريض النفسي/g, "المبتلى"],
    [/العلاج النفسي/g, "الإرشاد والتوجيه"],
    [/المعالج النفسي/g, "المرشد والموجه"],
    [/جلسة علاجية/g, "جلسة إرشادية"],
    [/جلسات علاجية/g, "جلسات إرشادية"],
    [/التشخيص النفسي/g, "وصف الحالة"],
    [/أساليب التعلم/g, "طرق التعليم"],
    [/التعلم النشط/g, "التعليم بالممارسة"],
    [/التفكير النقدي/g, "التمييز بين الحق والباطل"],
    [/التفكير الإبداعي/g, "حسن التدبير والفطنة"],
    [/الثقة بالنفس/g, "الثقة بالله ثم بالنفس"],
    [/صورة الجسد/g, "الرضا بخلق الله"],
    [/الكمالية/g, "الغلو والتشدد على النفس"],
    [/التسويف/g, "التكاسل وضعف الهمة"],
    [/الإدمان النفسي/g, "ضعف الإرادة"],
    [/التبعية العاطفية/g, "التعلق بغير الله"],
    // --- الفلسفة الوجودية والعدمية ---
    [/معنى الحياة الفلسفي/g, "الغاية من الخلق: عبادة الله"],
    [/العبثية/g, ""],
    [/الحرية المطلقة/g, "العبودية لله"],
    [/المسؤولية الوجودية/g, "المسؤولية أمام الله"],
    [/القلق الوجودي/g, "ضعف اليقين بالله"],
    [/أزمة المعنى/g, "ضعف الإيمان بالقدر"],
    [/الفراغ الوجودي/g, "الغفلة والبعد عن الله"],
    [/الأصالة الوجودية/g, "الصدق والإخلاص"],
    // --- التربية الغربية الحديثة ---
    [/التربية الإيجابية/g, "التربية بالحب والحزم"],
    [/التربية اللطيفة/g, "الرفق في التربية مع الحزم"],
    [/العقاب ممنوع/g, "العقاب مشروع كملاذ أخير"],
    [/لا تقل لا للطفل/g, "التوجيه بالأمر والنهي"],
    [/مشاعر الطفل أولاً/g, "حقوق الله أولاً ثم مشاعر الطفل"],
    [/الطفل صديقك/g, "الطفل أمانة والوالد قائد"],
    [/المساواة بين الوالد والطفل/g, "التراتبية والبر والطاعة"],
    [/حق الطفل في الخصوصية المطلقة/g, "الرقابة التربوية واجبة"],
    [/حرية الطفل الدينية/g, "تربية الطفل على الإسلام واجبة"],
    [/حرية التعبير المطلقة/g, "الأدب في الكلام وحفظ اللسان"],
    [/التربية الجنسية/g, "التربية على الحياء والعفة"],
    [/الهوية الجندرية/g, "الفطرة: ذكر وأنثى"],
    [/التنوع والشمول/g, "الأخوة الإسلامية"],
    // --- العصر الجديد (New Age) ---
    [/قانون الجذب/g, "الدعاء والأخذ بالأسباب"],
    [/الطاقة الكونية/g, "قدرة الله"],
    [/الطاقة الإيجابية/g, "التوكل على الله"],
    [/الطاقة السلبية/g, "الوسوسة"],
    [/التردد[ات]* الكوني/g, "قدر الله"],
    [/الذبذبات/g, ""],
    [/التجلي/g, "الدعاء والتوكل"],
    [/التأكيدات الإيجابية/g, "الذكر والدعاء"],
    [/الامتنان الكوني/g, "الشكر لله والحمد"],
    [/التصور الإبداعي/g, "التخطيط والدعاء"],
    [/الشفاء الذاتي/g, "الرقية والدعاء والتداوي"],
    [/التأمل التجاوزي/g, "التفكر والتدبر"],
    [/\bالتأمل\b/g, "التفكر والتدبر"],
    [/الكارما/g, "الجزاء من جنس العمل"],
    [/اليوغا/g, "الرياضة والتمارين"],
    [/الشاكرا/g, ""],
    [/الشاكرات/g, ""],
    [/الأبراج/g, ""],
    [/التنجيم/g, ""],
    [/قراءة الكف/g, ""],
    [/قراءة الفنجان/g, ""],
    [/الحجر الكريم للعلاج/g, ""],
    [/العلاج بالأحجار/g, ""],
    [/العلاج بالطاقة/g, "التداوي المشروع"],
    [/الريكي/g, ""],
  ];

  let result = text;
  for (const [pattern, replacement] of dutchToArabic) {
    result = result.replace(pattern, replacement);
  }

  // Apply prohibited terms replacement
  for (const [pattern, replacement] of prohibitedTerms) {
    result = result.replace(pattern, replacement);
  }

  // Clean up double spaces and empty parentheses left by removals
  result = result.replace(/\(\s*\)/g, "").replace(/  +/g, " ").replace(/\n\n\n+/g, "\n\n");

  // Also clean Latin transliterations of Islamic terms
  result = result
    .replace(/\bAllaah\b/gi, "الله")
    .replace(/\bAllah\b/gi, "الله")
    .replace(/\bMaashaa'llaah\b/gi, "ما شاء الله")
    .replace(/\bMasha'?Allah\b/gi, "ما شاء الله")
    .replace(/\bBismillaah\b/gi, "بسم الله")
    .replace(/\bBismillah\b/gi, "بسم الله")
    .replace(/\bSubhaanAllaah\b/gi, "سبحان الله")
    .replace(/\bSubhanAllah\b/gi, "سبحان الله")
    .replace(/\bIn shaa' Allaah\b/gi, "إن شاء الله")
    .replace(/\bInsha'?Allah\b/gi, "إن شاء الله")
    .replace(/\bAstaghfirullaah\b/gi, "أستغفر الله")
    .replace(/\bAstaghfirullah\b/gi, "أستغفر الله")
    .replace(/3Abd-ur-Ra'oof/gi, "عبد الرؤوف")
    .replace(/3Abduraheem/gi, "عبد الرحيم")
    .replace(/3Abdullaah/gi, "عبد الله")
    .replace(/3Abd/g, "عبد")
    .replace(/\*\*/g, "");

  return result;
}

/**
 * Post-processing: ensure correct transcription of Islamic/Arabic terms in Dutch and English output.
 * Based on the official Transcriptietabel.
 * Key rules:
 * - ع = 3 (e.g., 3abd, 3ilm)
 * - Allaah (double a), not Allah
 * - oe for dammah (Dutch), oo for dammah (English)
 * - ie for kasrah (Dutch), ee for kasrah (English)
 */
function correctTranscription(text: string, lang: "nl" | "en"): string {
  if (!text) return text;
  let result = text;

  // Fix common incorrect transcriptions
  const corrections: [RegExp, string, string][] = [
    // Allah must always be Allaah
    [/\bAllah\b/g, "Allaah", "Allaah"],
    // Common phrases
    [/\bMasha'?Allah\b/gi, "Maashaa'llaah", "Maashaa'llaah"],
    [/\bMashallah\b/gi, "Maashaa'llaah", "Maashaa'llaah"],
    [/\bInsha'?Allah\b/gi, "In shaa' Allaah", "In shaa' Allaah"],
    [/\bInshallah\b/gi, "In shaa' Allaah", "In shaa' Allaah"],
    [/\bSubhanAllah\b/gi, "SubhaanAllaah", "SubhaanAllaah"],
    [/\bBismillah\b/gi, "Bismillaah", "Bismillaah"],
    [/\bAstaghfirullah\b/gi, "Astaghfirullaah", "Astaghfirullaah"],
    [/\bJazakAllah\b/gi, "DjazaakAllaahu khayran", "JazaakAllaahu khayran"],
    [/\bBarakAllah\b/gi, "BaarakAllaah", "BaarakAllaah"],
    // Aqeedah terms
    [/\baqeedah\b/gi, "3aqiedah", "3aqeedah"],
    [/\baqidah\b/gi, "3aqiedah", "3aqeedah"],
    [/\bibaadah\b/gi, "3ibaadah", "3ibaadah"],
    [/\bibadah\b/gi, "3ibaadah", "3ibaadah"],
    // Tarbiyah terms
    [/\btarbiyah\b/gi, "tarbiyah", "tarbiyah"],
    [/\btazkiyah\b/gi, "tazkiyah", "tazkiyah"],
    [/\btasfiyah\b/gi, "tasfiyah", "tasfiyah"],
    // Salah
    [/\bsalah\b/gi, "salaah", "salaah"],
    [/\bsalat\b/gi, "salaah", "salaah"],
    // Quran/Sunnah
    [/\bQuran\b/g, "Qur'aan", "Qur'aan"],
    [/\bKoran\b/g, "Qur'aan", "Qur'aan"],
    [/\bSunnah\b/g, "Soennah", "Sunnah"],
    [/\bSoenna\b/g, "Soennah", "Sunnah"],
    // Hadith
    [/\bhadith\b/gi, "hadieth", "hadeeth"],
    [/\bhadieth\b/gi, "hadieth", "hadeeth"],
    // Fitrah
    [/\bfitrah\b/gi, "fitrah", "fitrah"],
    [/\bfitra\b/gi, "fitrah", "fitrah"],
    // Tawheed
    [/\btawheed\b/gi, "tawhied", "tawheed"],
    [/\btawhid\b/gi, "tawhied", "tawheed"],
    // Eemaan
    [/\biman\b/gi, "iemaan", "eemaan"],
    [/\bimaan\b/gi, "iemaan", "eemaan"],
    // Taqwa
    [/\btaqwa\b/gi, "taqwaa", "taqwaa"],
    // Dhikr
    [/\bdhikr\b/gi, "dhikr", "dhikr"],
    [/\bzikr\b/gi, "dhikr", "dhikr"],
    // Du'aa
    [/\bdua\b/gi, "du3aa'", "du3aa'"],
    [/\bdu'a\b/gi, "du3aa'", "du3aa'"],
    // Jannah/Jahannam
    [/\bjannah\b/gi, "djannah", "jannah"],
    [/\bjahannam\b/gi, "djahannam", "jahannam"],
    // Shaytan
    [/\bshaitan\b/gi, "shaytaan", "shaytaan"],
    [/\bshaytan\b/gi, "shaytaan", "shaytaan"],
    // Wudu
    [/\bwudu\b/gi, "wudoe'", "wudoo'"],
    [/\bwudhu\b/gi, "wudoe'", "wudoo'"],
    // Sabr
    [/\bsabr\b/gi, "sabr", "sabr"],
    // Shukr
    [/\bshukr\b/gi, "shukr", "shukr"],
    // Tawakkul
    [/\btawakkul\b/gi, "tawakkul", "tawakkul"],
    // Khushoo
    [/\bkhushu\b/gi, "khushoe3", "khushoo3"],
    [/\bkhushoo\b/gi, "khushoe3", "khushoo3"],
    // Ikhlaas
    [/\bikhlas\b/gi, "ikhlaas", "ikhlaas"],
    // Tawbah
    [/\btawbah\b/gi, "tawbah", "tawbah"],
    [/\btaubah\b/gi, "tawbah", "tawbah"],
  ];

  for (const [pattern, nlReplacement, enReplacement] of corrections) {
    result = result.replace(pattern, lang === "nl" ? nlReplacement : enReplacement);
  }

  return result;
}

/**
 * Defensive strip of markdown emphasis markers (**bold**, __underline__) from
 * LLM output before it reaches the client, which renders plain text. The
 * prompts also instruct the model not to use these, but that's probabilistic
 * — this is the guarantee for already-cached or non-compliant output. Only
 * removes paired markers; a lone/unpaired * or _ is left untouched.
 */
export function stripMarkdownEmphasis(text: string): string {
  if (!text) return text;
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1");
}

// Load knowledge base once and cache
let cachedKB: any = null;
function getKnowledgeBase() {
  if (!cachedKB) {
    try {
      const kbPath = resolveDataPath("knowledge_base.json");
      cachedKB = JSON.parse(fs.readFileSync(kbPath, "utf-8"));
    } catch (error) {
      console.error("Failed to load knowledge base:", error);
      cachedKB = {};
    }
  }
  return cachedKB;
}

// Load Mawsouah (الموسوعة الميسرة في تربية) knowledge base
let cachedMawsouah: any = null;
function getMawsouahKnowledge() {
  if (!cachedMawsouah) {
    try {
      const mPath = resolveDataPath("mawsouah_knowledge.json");
      cachedMawsouah = JSON.parse(fs.readFileSync(mPath, "utf-8"));
    } catch (error) {
      console.error("Failed to load mawsouah knowledge:", error);
      cachedMawsouah = { mindsets: [], fitrah_properties: [], education_methods: [], common_problems: [] };
    }
  }
  return cachedMawsouah;
}

// Build mawsouah context for prompts
function getMawsouahContext(focus: "general" | "treatment" | "weekplan", lang: string = "nl"): string {
  const maw = getMawsouahKnowledge();
  const isEn = lang === "en";
  const isAr = lang === "ar";
  let context = "\n=== الموسوعة الميسرة في تربية الأولاد (" + (isAr ? "موسوعة التربية" : isEn ? "PARENTING ENCYCLOPEDIA" : "OPVOEDINGSENCYCLOPEDIE") + ") ===\n";
  
  // Always include mindsets
  context += isAr ? "\n--- مبادئ المربّي ---\n" : isEn ? "\n--- MINDSETS FOR THE EDUCATOR ---\n" : "\n--- MINDSETS VOOR DE OPVOEDER ---\n";
  for (const m of maw.mindsets || []) {
    const title = isAr ? (m.titleAR || m.title) : isEn ? (m.titleEN || m.titleNL) : m.titleNL;
    const principle = isAr ? (m.principleAR || m.principle) : isEn ? (m.principleEN || m.principle) : m.principle;
    const application = isAr ? (m.applicationAR || m.application) : isEn ? (m.applicationEN || m.application) : m.application;
    context += `• ${title} (${m.title}): ${principle}\n  ${isAr ? "الدليل" : isEn ? "Evidence" : "Bewijs"}: ${m.evidence}\n  ${isAr ? "التطبيق" : isEn ? "Application" : "Toepassing"}: ${application}\n`;
  }
  
  // Always include fitrah properties
  context += isAr ? "\n--- خصائص الفطرة (فطرية في كل طفل) ---\n" : isEn ? "\n--- FITRAH PROPERTIES (innate in every child) ---\n" : "\n--- FITRAH-EIGENSCHAPPEN (aangeboren bij elk kind) ---\n";
  for (const f of maw.fitrah_properties || []) {
    const title = isAr ? (f.titleAR || f.title) : isEn ? (f.titleEN || f.titleNL) : f.titleNL;
    const desc = isAr ? (f.descriptionAR || f.description) : isEn ? (f.descriptionEN || f.description) : f.description;
    const nurture = isAr ? (f.howToNurtureAR || f.howToNurture) : isEn ? (f.howToNurtureEN || f.howToNurture) : f.howToNurture;
    const deviation = isAr ? (f.signsOfDeviationAR || f.signsOfDeviation) : isEn ? (f.signsOfDeviationEN || f.signsOfDeviation) : f.signsOfDeviation;
    context += `• ${title} (${f.title}): ${desc}\n  ${isAr ? "الدليل" : isEn ? "Evidence" : "Bewijs"}: ${f.evidence}\n  ${isAr ? "التوجيه" : isEn ? "Nurture" : "Sturen"}: ${nurture}\n  ${isAr ? "علامات الانحراف" : isEn ? "Deviation" : "Afwijking"}: ${deviation}\n`;
  }
  
  // Include education methods for treatment and weekplan
  if (focus === "treatment" || focus === "weekplan") {
    context += isAr ? "\n--- 18 وسيلة تربوية ---\n" : isEn ? "\n--- 18 PARENTING METHODS (وسائل تربوية) ---\n" : "\n--- 18 OPVOEDINGSMETHODEN (وسائل تربوية) ---\n";
    for (const m of maw.education_methods || []) {
      const title = isAr ? (m.titleAR || m.title) : isEn ? (m.titleEN || m.titleNL) : m.titleNL;
      const brief = isAr ? (m.briefAR || m.brief) : isEn ? (m.briefEN || m.brief) : m.brief;
      context += `• ${title} (${m.title}): ${brief}\n`;
    }
  }
  
  // Include common problems for treatment
  if (focus === "treatment") {
    context += isAr ? "\n--- المشكلات الشائعة والمنهج الإسلامي ---\n" : isEn ? "\n--- COMMON PROBLEMS AND ISLAMIC APPROACH ---\n" : "\n--- VEELVOORKOMENDE PROBLEMEN EN ISLAMITISCHE AANPAK ---\n";
    for (const p of maw.common_problems || []) {
      const title = isAr ? (p.titleAR || p.title) : isEn ? (p.titleEN || p.titleNL) : p.titleNL;
      const brief = isAr ? (p.briefAR || p.brief) : isEn ? (p.briefEN || p.brief) : p.brief;
      context += `• ${title} (${p.title}): ${brief}\n`;
    }
  }
  
  return context;
}

// Load Hijri calendar data once and cache
let cachedHijriCalendar: any = null;
function getHijriCalendar() {
  if (!cachedHijriCalendar) {
    try {
      const calPath = resolveDataPath("hijri_calendar.json");
      cachedHijriCalendar = JSON.parse(fs.readFileSync(calPath, "utf-8"));
    } catch (error) {
      console.error("Failed to load Hijri calendar:", error);
      cachedHijriCalendar = { sections: [], months: {} };
    }
  }
  return cachedHijriCalendar;
}

// Build Hijri calendar context based on current month and day
function getHijriCalendarContext(hijriMonth: number, hijriDay: number, dayOfWeek: number, lang: string = "nl"): string {
  const cal = getHijriCalendar();
  const isEn = lang === "en";
  const isAr = lang === "ar";
  let context = "\n=== تقويم العام الهجري (" + (isAr ? "مصدر التقويم الهجري" : isEn ? "HIJRI CALENDAR SOURCE" : "HIJRI KALENDER BRON") + ") ===\n";
  
  const isFastingProhibited = 
    (hijriMonth === 10 && hijriDay === 1) ||
    (hijriMonth === 12 && hijriDay === 10) ||
    (hijriMonth === 12 && hijriDay >= 11 && hijriDay <= 13);
  
  if (isFastingProhibited) {
    context += isAr
      ? "\n⚠️ اليوم الصيام محرّم (حرام). لا تعطِ نصيحة بالصيام اليوم.\n"
      : isEn
      ? "\n⚠️ TODAY FASTING IS PROHIBITED (حرام). Do NOT give fasting advice today.\n"
      : "\n⚠️ VANDAAG IS VASTEN VERBODEN (حرام). Geef GEEN vasten-advies vandaag.\n";
    if (hijriMonth === 10 && hijriDay === 1) context += isAr
      ? "اليوم عيد الفطر — يوم فرح وأكل وشرب.\n"
      : isEn
      ? "Today is 'Eid al-Fitr — celebration day, eating and drinking.\n"
      : "Vandaag is 'Ied al-Fitr — feestdag, eten en drinken.\n";
    if (hijriMonth === 12 && hijriDay === 10) context += isAr
      ? "اليوم عيد الأضحى (يوم النحر) — أعظم أيام السنة، ذبح وأكل وشرب. الدليل: «إنّ أعظم الأيام عند الله يوم النحر» — أبو داود.\n"
      : isEn
      ? "Today is 'Eid al-Adha (يوم النحر) — greatest day of the year, sacrifice, eating and drinking. Evidence: «Inna a'dhama al-ayyaami 'inda Allaah yawm an-nahr» — Abu Dawud.\n"
      : "Vandaag is 'Ied al-Adhaa (يوم النحر) — grootste dag van het jaar, offer, eten en drinken. Bewijs: «Inna a'dhama al-ayyaami 'inda Allaah yawm an-nahr» — Abu Daawoed.\n";
  }
  if (hijriMonth === 12 && hijriDay >= 11 && hijriDay <= 13) {
    context += isAr
      ? `\nاليوم يوم تشريق ${hijriDay - 10} من 3 (${hijriDay} ذو الحجة) — «أيام أكل وشرب وذكر لله» (مسلم). الصيام حرام. كُل واشرب وكبّر بعد كل صلاة.\n`
      : isEn
      ? `\nToday is Tashreeq day ${hijriDay - 10} of 3 (${hijriDay} DH) — «أيام أكل وشرب وذكر لله» (Muslim). Fasting is HARAM. Eat, drink and make takbeer after every prayer.\n`
      : `\nVandaag is Tashreeq dag ${hijriDay - 10} van 3 (${hijriDay} DH) — «أيام أكل وشرب وذكر لله» (Muslim). Vasten is HARAAM. Eet, drink en maak takbier na elk gebed.\n`;
  }
  
  // 1. Recurring weekly/monthly virtues
  const recurringSection = cal.sections?.find((s: any) => s.title?.includes("المتكرِّرة") || s.title?.includes("الأسبوع"));
  if (recurringSection) {
    if (dayOfWeek === 5) {
      const jumuah = recurringSection.subsections?.find((sub: any) => sub.title?.includes("الجُمعة") || sub.title?.includes("الجمعة"));
      if (jumuah) {
        context += isAr
          ? `\n--- يوم الجمعة (اليوم جمعة) ---\n`
          : isEn
          ? `\n--- يوم الجمعة (Today is Jumu'ah) ---\n`
          : `\n--- يوم الجمعة (Vandaag is Jumu'ah) ---\n`;
        context += (jumuah.content || []).slice(0, 8).join("\n") + "\n";
      }
    }
    if ((dayOfWeek === 1 || dayOfWeek === 4) && !isFastingProhibited) {
      const monThu = recurringSection.subsections?.find((sub: any) => sub.title?.includes("الاثنين") || sub.title?.includes("الخميس"));
      if (monThu) {
        const dayName = isAr ? (dayOfWeek === 1 ? 'الاثنين' : 'الخميس') : isEn ? (dayOfWeek === 1 ? 'Monday' : 'Thursday') : (dayOfWeek === 1 ? 'maandag' : 'donderdag');
        context += `\n--- يوما الاثنين والخميس (${isAr ? 'اليوم' : isEn ? 'Today is' : 'Vandaag is'} ${dayName}) ---\n`;
        context += (monThu.content || []).slice(0, 5).join("\n") + "\n";
      }
    }
    if ((hijriDay === 13 || hijriDay === 14 || hijriDay === 15) && !isFastingProhibited) {
      const whiteDays = recurringSection.subsections?.find((sub: any) => sub.title?.includes("البِيض") || sub.title?.includes("ثلاثة أيّام"));
      if (whiteDays) {
        context += isAr
          ? `\n--- الأيام البيض (اليوم ${hijriDay}) ---\n`
          : isEn
          ? `\n--- الأيام البيض (White day ${hijriDay}) ---\n`
          : `\n--- الأيام البيض (Witte dag ${hijriDay}) ---\n`;
        context += (whiteDays.content || []).slice(0, 5).join("\n") + "\n";
      }
    }
  }
  
  // 2. Month-specific content
  const monthData = cal.months?.[String(hijriMonth)];
  if (monthData) {
    context += isAr
      ? `\n--- ${monthData.title} (الشهر الحالي) ---\n`
      : isEn
      ? `\n--- ${monthData.title} (Current month) ---\n`
      : `\n--- ${monthData.title} (Huidige maand) ---\n`;
    context += (monthData.content || []).slice(0, 10).join("\n") + "\n";
    if (monthData.sub_items) {
      for (const subItem of monthData.sub_items) {
        context += `\n  • ${subItem.title}:\n`;
        context += (subItem.content || []).slice(0, 5).join("\n") + "\n";
      }
    }
  }
  
  // 3. Sacred months warning (1, 7, 11, 12)
  if ([1, 7, 11, 12].includes(hijriMonth)) {
    const sacredSection = cal.sections?.find((s: any) => s.title?.includes("الحُرُم") || s.title?.includes("الأشهر الحرم"));
    if (sacredSection) {
      context += isAr
        ? `\n--- الأشهر الحرم (شهر حرام) ---\n`
        : isEn
        ? `\n--- الأشهر الحرم (Sacred month) ---\n`
        : `\n--- الأشهر الحرم (Heilige maand) ---\n`;
      context += (sacredSection.subsections?.[0]?.content || []).slice(0, 5).join("\n") + "\n";
    }
  }
  
  // 4. Warnings about innovated celebrations
  const bidahSection = cal.sections?.find((s: any) => s.title?.includes("الباطل") || s.title?.includes("البِدعة"));
  if (bidahSection) {
    context += isAr
      ? `\n--- تحذير من البدع ---\n`
      : isEn
      ? `\n--- تحذير من البدع (Warning against innovations) ---\n`
      : `\n--- تحذير من البدع (Waarschuwing tegen innovaties) ---\n`;
    const principles = bidahSection.subsections?.find((sub: any) => sub.title?.includes("ضوابط") || sub.title?.includes("الأصول"));
    if (principles) {
      context += (principles.content || []).slice(0, 3).join("\n") + "\n";
    }
  }
  
  return context;
}

// Extract relevant gezinskunde 2025 content based on topic keywords
function getGezinskunde2025Context(keywords: string[], lang: string = "nl"): string {
  const kb = getKnowledgeBase();
  const sections = kb.gezinskunde_2025 || [];
  const isAr = lang === "ar";
  const isEn = lang === "en";
  let context = isAr
    ? "\n=== علم الأسرة الإسلامي (المصدر الأساسي - فبراير 2022 - يونيو 2025) ===\n"
    : isEn
    ? "\n=== ISLAMIC FAMILY SCIENCE (PRIMARY SOURCE - Feb 2022 - June 2025) ===\n"
    : "\n=== ISLAMITISCHE GEZINSKUNDE (PRIMAIRE BRON - feb 2022 - juni 2025) ===\n";
  
  const keyTopics = [
    "10 stappen van opvoeding", "11 stappen",
    "Stap 1", "Stap 2", "Stap 3", "Stap 4", "Stap 5", "Stap 6", "Stap 7", "Stap 8",
    "Tasfiya", "Tazkia", "Tarbiya",
    "تصفية", "تزكية", "تربية",
    "pilaar", "handvat",
    "De 10e stap",
    "voorbereiding in het opvoeden",
    "mindset", "Mindset",
    "band", "communicatie", "leiderschap",
    "فطرة", "إيمان", "تعظيم", "أسماء الله", "منزلة"
  ];
  
  const allKeywords = [...keyTopics, ...keywords];
  let matchedSections: any[] = [];
  
  for (const section of sections) {
    const heading = (section.heading || "").toLowerCase();
    const contentPreview = (section.content || []).slice(0, 5).join(" ").toLowerCase();
    
    for (const kw of allKeywords) {
      if (heading.includes(kw.toLowerCase()) || contentPreview.includes(kw.toLowerCase())) {
        matchedSections.push(section);
        break;
      }
    }
  }
  
  matchedSections = matchedSections.slice(0, 40);
  
  for (const section of matchedSections) {
    context += `\n--- ${section.heading} ---\n`;
    context += (section.content || []).slice(0, 20).join("\n") + "\n";
  }

  // Add instruction for Arabic output to translate Dutch concepts
  if (isAr) {
    context += "\n[ملاحظة: المحتوى أعلاه مكتوب بالهولندية مع مصطلحات عربية إسلامية. عند الإجابة بالعربية، استخدم المفاهيم الإسلامية الأصلية مباشرة وترجم الشروحات الهولندية إلى العربية الفصحى.]\n";  
  }
  
  return context;
}

// Load year-specific opvoedingsdoelen
function loadYearContext(yearKey: string, lang: string = "nl"): string {
  const kb = getKnowledgeBase();
  const isAr = lang === "ar";
  const isEn = lang === "en";
  let context = "";

  if (kb.jaren && kb.jaren[yearKey]) {
    const yearData = kb.jaren[yearKey];
    const yearLabel = isAr ? (yearData.yearKeyAR || yearKey) : yearKey;
    context += isAr
      ? `\n=== أهداف التربية - ${yearLabel} ===\n`
      : isEn
      ? `\n=== PARENTING GOALS ${yearKey} ===\n`
      : `\n=== OPVOEDINGSDOELEN ${yearKey} ===\n`;
    for (const section of yearData.sections || []) {
      const sectionTitle = isAr ? (section.titleAR || section.title) : section.title;
      context += `\n--- ${sectionTitle} ---\n`;
      context += section.content.slice(0, 30).join("\n") + "\n";
    }
  }

  return context;
}

// Load tadhiem methods based on age group
function loadTadhiemContext(ageYears: number, lang: string = "nl"): string {
  const kb = getKnowledgeBase();
  const isAr = lang === "ar";
  const isEn = lang === "en";
  let context = "";

  if (kb.turuq_tadhiem) {
    context += isAr
      ? "\n=== الطرق العملية التربوية الربانية لغرس تعظيم الله (حسب الفئة العمرية) ===\n"
      : isEn
      ? "\n=== PRACTICAL METHODS FOR INSTILLING GLORIFICATION OF ALLAH (BY AGE GROUP) ===\n"
      : "\n=== الطرق العملية التربوية الربانية لغرس تعظيم الله (METHODEN TA'DHIEM PER LEEFTIJD) ===\n";
    
    let ageGroup = "";
    if (ageYears <= 2) ageGroup = "0-2";
    else if (ageYears <= 4) ageGroup = "2-4";
    else if (ageYears <= 6) ageGroup = "4-6";
    else if (ageYears <= 9) ageGroup = "7-9";
    else if (ageYears <= 12) ageGroup = "10-12";
    else if (ageYears <= 15) ageGroup = "13-15";
    else ageGroup = "16-18";
    
    for (const section of kb.turuq_tadhiem) {
      const heading = section.heading || "";
      if (heading.includes(ageGroup) || heading.includes("عام") || heading.includes("مقدمة")) {
        context += `\n--- ${heading} ---\n`;
        context += (section.content || []).slice(0, 15).join("\n") + "\n";
      }
    }
  }

  return context;
}

// Load correction/treatment methods
function loadCorrectionContext(lang: string = "nl"): string {
  const kb = getKnowledgeBase();
  const isAr = lang === "ar";
  const isEn = lang === "en";
  let context = "";

  if (kb.turuq_tashih) {
    context += isAr
      ? "\n=== الطرق الربانية العملية لتصحيح الأخطاء بالخطوات الخمس ===\n"
      : isEn
      ? "\n=== PRACTICAL DIVINE METHODS FOR CORRECTING MISTAKES IN 5 STEPS ===\n"
      : "\n=== الطرق الربانية العملية لتصحيح الأخطاء بالخطوات الخمس (VIJF STAPPEN FOUTCORRECTIE) ===\n";
    for (const section of kb.turuq_tashih) {
      context += `\n--- ${section.heading} ---\n`;
      context += (section.content || []).slice(0, 12).join("\n") + "\n";
    }
  }

  return context;
}

// Load book sources context for AI prompts
function loadBookSourcesContext(lang: string = "nl"): string {
  const kb = getKnowledgeBase();
  const isAr = lang === "ar";
  const isEn = lang === "en";
  let context = "";

  if (kb.books_sources && Array.isArray(kb.books_sources)) {
    context += isAr
      ? "\n=== الكتب المصدرية المعتمدة في التطبيق ===\n"
      : isEn
      ? "\n=== APPROVED SOURCE BOOKS IN THE APPLICATION ===\n"
      : "\n=== GOEDGEKEURDE BRONBOEKEN IN DE APPLICATIE ===\n";
    for (const book of kb.books_sources) {
      const title = isAr ? book.title_ar : isEn ? book.title_en : book.title_nl;
      context += `\n- ${title}: ${book.description}\n`;
      if (book.topics) {
        context += `  ${isAr ? "المواضيع" : isEn ? "Topics" : "Onderwerpen"}: ${book.topics.join(", ")}\n`;
      }
    }
  }

  return context;
}

// Build comprehensive knowledge context for weekly plan
function buildWeekPlanContext(yearKey: string, ageYears: number, lang: string = "nl"): string {
  let context = "";
  context += getGezinskunde2025Context([
    "opvoeding", "kind", "fitrah", "iemaan", "band", "communicatie",
    "gewoonte", "karakter", "leiderschap", "structuur"
  ], lang);
  context += loadYearContext(yearKey, lang);
  context += loadTadhiemContext(ageYears, lang);
  context += loadBookSourcesContext(lang);
  return context.substring(0, 45000);
}

// Build comprehensive treatment context
function buildTreatmentContext(yearKey: string, ageYears: number, issue: string, lang: string = "nl"): string {
  let context = "";
  const issueKeywords = issue.toLowerCase().split(/\s+/).filter(w => w.length > 3).slice(0, 10);
  context += getGezinskunde2025Context([
    ...issueKeywords,
    "correctie", "fout", "behandel", "oplossing", "probleem",
    "tasfiya", "tazkia", "tarbiya", "stap", "mindset"
  ], lang);
  context += loadCorrectionContext(lang);
  context += loadTadhiemContext(ageYears, lang);
  context += loadYearContext(yearKey, lang);
  context += loadBookSourcesContext(lang);
  return context.substring(0, 50000);
}

// Build FULL parent profile info string for hybrid advice
function buildFullParentInfo(pp: any, lang: string = "nl"): string {
  const isEn = lang === "en";
  const isAr = lang === "ar";
  const u = isAr ? "غير معروف" : isEn ? "unknown" : "onbekend";
  const l = (ar: string, en: string, nl: string) => isAr ? ar : isEn ? en : nl;
  return `
=== ${l("الملف الكامل للوالد (التحليل الهجين)", "FULL PARENT PROFILE (HYBRID ANALYSIS)", "VOLLEDIG OUDERPROFIEL (HYBRIDE ANALYSE)")} ===

${l("البيانات الأساسية", "BASIC INFO", "BASISGEGEVENS")}:
- ${l("الجنس", "Gender", "Geslacht")}: ${pp.gender || u}
- ${l("الحالة الاجتماعية", "Marital status", "Burgerlijke staat")}: ${pp.maritalStatus || u}

${l("الصلة بالله - الصلاة", "BOND WITH ALLAAH - PRAYER", "BAND MET ALLAAH - GEBED")}:
- ${l("الصلوات الخمس", "Five daily prayers", "Vijf dagelijkse gebeden")}: ${pp.prayer || u}
- ${l("صلاة الفجر في وقتها", "Salaat al-Fajr on time", "Salaat al-Fajr op tijd")}: ${pp.fajr || u}
- ${l("الخشوع في الصلاة", "Prayer experience (khushoo)", "Beleving van het gebed")}: ${pp.prayerKhushoo || u}

${l("الحجاب", "HIJAB", "HIJAAB")}:
- ${l("حجابها", "Own hijab", "Eigen hijaab")}: ${pp.hijab || u}
- ${l("حجاب الشريكة", "Partner's hijab", "Hijaab partner")}: ${pp.hijabPartner || u}

${l("طلب العلم", "KNOWLEDGE ACQUISITION", "KENNISVERGARING")}:
- ${l("المصادر", "Sources", "Bronnen")}: ${Array.isArray(pp.knowledgeSource) ? pp.knowledgeSource.join(", ") : u}
- ${l("العلم الواجب", "Obligatory knowledge studied", "Verplichte kennis gestudeerd")}: ${pp.obligatoryKnowledge || u}
- ${l("تفاصيل العلم الواجب", "Details obligatory knowledge", "Details verplichte kennis")}: ${pp.obligatoryKnowledgeDetails || u}
- ${l("العلم عند العلماء", "Knowledge with scholars", "Kennis bij geleerden")}: ${pp.knowledgeWithScholars || u}
- ${l("وسائل/قنوات العلم", "Media/channels for knowledge", "Media/kanalen voor kennis")}: ${pp.knowledgeMedia || u}

${l("علم الأسرة", "FAMILY SCIENCE", "GEZINSKUNDE")}:
- ${l("دراسة علم الأسرة", "Family science studied", "Gezinskunde gestudeerd")}: ${pp.familyScience || u}
- ${l("أين", "Where", "Waar")}: ${pp.familyScienceWhere || u}
- ${l("المدة", "How long", "Hoe lang")}: ${pp.familyScienceDuration || u}

${l("طبيب نفسي/مؤسسات", "PSYCHOLOGIST/INSTITUTIONS", "PSYCHOLOOG/INSTANTIES")}:
- ${l("علاج الوالد", "Parent treated", "Ouder zelf behandeld")}: ${pp.psychologist || u} — ${pp.psychologistDetails || ""}
- ${l("علاج الأطفال", "Children treated", "Kinderen behandeld")}: ${pp.psychologistChildren || u} — ${pp.psychologistChildrenDetails || ""}

${l("تعليم الأطفال", "CHILDREN'S EDUCATION", "ONDERWIJS KINDEREN")}:
- ${l("نوع المدرسة", "School type", "Schooltype")}: ${pp.schoolType || u} — ${pp.schoolTypeDetails || ""}
- ${l("التواصل مع المعلمين", "Contact with teachers", "Contact met leraren")}: ${pp.teacherContact || u} — ${pp.teacherContactDetails || ""}

${l("دنكويزة الوالد (وقائع)", "PARENT'S THINKING (facts)", "DENKWIJZE OUDER (feiten)")}:
- ${l("عن الصلة بالله", "About bond with Allaah", "Over band met Allaah")}: ${pp.thinkingAboutAllaah || pp.thinkingAboutAllah || u}
- ${l("عن الصلة بالشريك", "About bond with partner", "Over band met partner")}: ${pp.thinkingAboutPartner || u}
- ${l("عن الصلة بالأولاد", "About bond with children", "Over band met kinderen")}: ${pp.thinkingAboutChildren || u}
- ${l("عن التربية", "About parenting", "Over opvoeding")}: ${pp.thinkingAboutParenting || u}
- ${l("مبادئ التربية", "Parenting mindsets", "Mindsets over opvoeding")}: ${pp.thinkingMindsets || u}

${l("شعور الوالد (وقائع)", "PARENT'S FEELING (facts)", "VOELWIJZE OUDER (feiten)")}:
- ${l("عند ذكر الله", "When remembering Allaah", "Bij gedenken Allaah")}: ${pp.feelingAboutAllaah || pp.feelingAboutAllah || u}
- ${l("مع الشريك", "With partner", "Bij partner")}: ${pp.feelingAboutPartner || u}
- ${l("مع الأولاد", "With children", "Bij kinderen")}: ${pp.feelingAboutChildren || u}
- ${l("عند التربية", "When parenting", "Bij opvoeden")}: ${pp.feelingAboutParenting || u}
- ${l("عند التحديات", "With challenges", "Bij uitdagingen")}: ${pp.feelingChallenges || u}

${l("كلام الوالد (وقائع)", "PARENT'S SPEAKING (facts)", "SPREEKWIJZE OUDER (feiten)")}:
- ${l("إلى الله (دعاء/ذكر)", "To Allaah (du'aa/dhikr)", "Tot Allaah (du'aa/dhikr)")}: ${pp.speakingToAllaah || pp.speakingToAllah || u}
- ${l("مع الشريك", "With partner", "Met partner")}: ${pp.speakingToPartner || u}
- ${l("مع الأولاد", "With children", "Met kinderen")}: ${pp.speakingToChildren || u}
- ${l("عند الغضب", "When angry", "Wanneer boos")}: ${pp.speakingWhenAngry || u}
- ${l("عند التصحيح", "When correcting", "Wanneer corrigerend")}: ${pp.speakingWhenCorrecting || u}

${l("سلوك الوالد (وقائع)", "PARENT'S DOING (facts)", "WERKWIJZE/DOEWIJZE OUDER (feiten)")}:
- ${l("العبادات اليومية", "Daily ibadaat", "Dagelijkse ibadaat")}: ${pp.doingIbadah || u}
- ${l("مع الشريك", "With partner", "Met partner")}: ${pp.doingWithPartner || u}
- ${l("مع الأولاد", "With children", "Met kinderen")}: ${pp.doingWithChildren || u}
- ${l("عند مشكلة تربوية", "When parenting problem", "Bij opvoedprobleem")}: ${pp.doingWhenProblem || u}
- ${l("الروتين اليومي", "Daily routine", "Dagelijkse routine")}: ${pp.doingDailyRoutine || u}

${l("ميول وصفات الوالد", "PARENT'S AFFINITIES & QUALITIES", "AFFINITEITEN & EIGENSCHAPPEN OUDER")}:
- ${l("المواهب", "Talents", "Talenten")}: ${pp.parentAffinities || u}
- ${l("الهوايات", "Hobbies", "Hobby's")}: ${pp.parentHobbies || u}
- ${l("نقاط القوة في التربية", "Parenting strengths", "Sterke punten opvoeding")}: ${pp.parentStrengths || u}
- ${l("نقاط الضعف في التربية", "Parenting weaknesses", "Zwakke punten opvoeding")}: ${pp.parentWeaknesses || u}

${l("العلاقة بالشريك", "BOND WITH PARTNER", "BAND MET PARTNER")}:
- ${l("جودة العلاقة", "Quality of bond", "Kwaliteit band")}: ${pp.partnerRelationQuality || u}
- ${l("الاتفاق على التربية", "Agreement on parenting", "Eens over opvoeding")}: ${pp.partnerParentingAgreement || u}
- ${l("التواصل حول الأولاد", "Communication about children", "Communicatie over kinderen")}: ${pp.partnerCommunication || u}`;
}

// Build full environment info
function buildFullEnvironmentInfo(env: any, lang: string = "nl"): string {
  const isEn = lang === "en";
  const isAr = lang === "ar";
  const u = isAr ? "غير معروف" : isEn ? "unknown" : "onbekend";
  const l = (ar: string, en: string, nl: string) => isAr ? ar : isEn ? en : nl;
  if (!env) return l("\nتحليل البيئة: لم يُملأ بعد.\n", "\nENVIRONMENT ANALYSIS: Not yet filled in.\n", "\nOMGEVINGSANALYSE: Nog niet ingevuld.\n");
  
  return `
=== ${l("تحليل بيئة الطفل الكامل", "FULL CHILD ENVIRONMENT ANALYSIS", "VOLLEDIGE OMGEVINGSANALYSE KIND")} ===

${l("التعليم", "EDUCATION", "ONDERWIJS")}:
- ${l("النوع", "Type", "Type")}: ${env.education || u}
- ${l("التفاصيل", "Details", "Details")}: ${env.educationDetails || u}

${l("الأسرة", "FAMILY", "GEZIN")}:
- ${l("الحياة الأسرية", "Family life", "Gezinsleven")}: ${env.familyLife || u}

${l("البيئة", "ENVIRONMENT", "OMGEVING")}:
- ${l("الحي/المنطقة", "Neighborhood", "Wijk/buurt")}: ${env.neighborhood || u}
- ${l("الأصدقاء", "Friends", "Vrienden")}: ${env.friends || u}

${l("التربية الإسلامية", "ISLAMIC EDUCATION", "ISLAMITISCHE VORMING")}:
- ${l("التعليم الإسلامي", "Islamic schooling", "Islamitische scholing")}: ${env.islamicEducation || u}

${l("الإعلام", "MEDIA", "MEDIA")}:
- ${l("استخدام الإعلام", "Media use", "Mediagebruik")}: ${env.mediaUse || u}
- ${l("وسائل التواصل", "Social media", "Sociale media")}: ${env.socialMedia || u}

${l("الهيكلة", "STRUCTURE", "STRUCTUUR")}:
- ${l("الهيكلة اليومية", "Daily structure", "Dagstructuur")}: ${env.dailyStructure || u}

${l("الصفات الجيدة (وقائع)", "GOOD QUALITIES (facts)", "GOEDE EIGENSCHAPPEN (feiten)")}:
- ${l("التفكير", "Thinking", "Denkwijze")}: ${env.goodThinking || u}
- ${l("الشعور", "Feeling", "Voelwijze")}: ${env.goodFeeling || u}
- ${l("الكلام", "Speaking", "Spreekwijze")}: ${env.goodSpeaking || u}
- ${l("السلوك", "Doing", "Doewijze")}: ${env.goodDoing || u}

${l("الصفات الأقل جودة (وقائع)", "LESS GOOD QUALITIES (facts)", "MINDER GOEDE EIGENSCHAPPEN (feiten)")}:
- ${l("التفكير", "Thinking", "Denkwijze")}: ${env.badThinking || u}
- ${l("الشعور", "Feeling", "Voelwijze")}: ${env.badFeeling || u}
- ${l("الكلام", "Speaking", "Spreekwijze")}: ${env.badSpeaking || u}
- ${l("السلوك", "Doing", "Doewijze")}: ${env.badDoing || u}

${l("الاهتمامات", "INTERESTS", "INTERESSES")}:
- ${l("الميول", "Affinities", "Affiniteiten")}: ${env.affinities || u}
- ${l("الهوايات", "Hobbies", "Hobby's")}: ${env.hobbies || u}

${l("العادات", "HABITS", "GEWOONTES")}:
- ${l("العادات الجيدة", "Good habits", "Goede gewoontes")}: ${env.goodHabits || u}
- ${l("العادات السيئة", "Bad habits", "Slechte gewoontes")}: ${env.badHabits || u}`;
}

// Flexible parent profile schema that accepts both old and new format
const parentProfileSchema = z.record(z.string(), z.any());

const environmentSchema = z.object({
  childId: z.string(),
  education: z.string().optional(),
  educationDetails: z.string().optional(),
  familyLife: z.string().optional(),
  neighborhood: z.string().optional(),
  friends: z.string().optional(),
  islamicEducation: z.string().optional(),
  mediaUse: z.string().optional(),
  socialMedia: z.string().optional(),
  dailyStructure: z.string().optional(),
  goodThinking: z.string().optional(),
  goodFeeling: z.string().optional(),
  goodSpeaking: z.string().optional(),
  goodDoing: z.string().optional(),
  badThinking: z.string().optional(),
  badFeeling: z.string().optional(),
  badSpeaking: z.string().optional(),
  badDoing: z.string().optional(),
  affinities: z.string().optional(),
  hobbies: z.string().optional(),
  goodHabits: z.string().optional(),
  badHabits: z.string().optional(),
  completed: z.boolean().optional(),
}).nullable();

export const adviceRouter = router({
  getGeneralAdvice: publicProcedure
    .input(z.object({
      parentProfile: parentProfileSchema,
      childrenCount: z.number(),
      childrenAges: z.array(z.string()),
      season: z.string(),
      location: z.string(),
      gpsEnabled: z.boolean().optional(),
      language: z.string().optional(),
      islamicContext: z.string().optional(),
      hijriMonth: z.number().optional(),
      hijriDay: z.number().optional(),
      dayOfWeek: z.number().optional(),
      dailyCheckin: z.object({
        date: z.string(),
        prayer: z.string(),
        mood: z.string(),
        openAnswer: z.string().optional(),
        timestamp: z.string(),
      }).nullable().optional(),
      recentCheckins: z.array(z.object({
        date: z.string(),
        prayer: z.string(),
        mood: z.string(),
        openAnswer: z.string().optional(),
        timestamp: z.string(),
      })).optional(),
      childrenEnvironments: z.array(z.object({
        childName: z.string(),
        childAge: z.string().optional(),
        environment: environmentSchema,
      })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const kb = getKnowledgeBase();
      const lang = input.language || "nl";
      const gezinskundeContext = getGezinskunde2025Context(["algemeen", "advies", "gezin", "dagelijks", "fitnah", "bescherming", "omgeving"], lang);
      
      // Build Hijri calendar context if month/day provided
      const hijriCalendarContext = (input.hijriMonth && input.hijriDay !== undefined && input.dayOfWeek !== undefined)
        ? getHijriCalendarContext(input.hijriMonth, input.hijriDay, input.dayOfWeek, lang)
        : "";
      const parentInfo = buildFullParentInfo(input.parentProfile, lang);

      // Build daily check-in context for LLM
      let checkinContext = "";
      if (input.dailyCheckin) {
        const prayerLabels: Record<string, string> = {
          alle_5_op_tijd: lang === "ar" ? "الخمس في وقتها" : lang === "en" ? "All 5 on time" : "Alle 5 op tijd",
          sommige_gemist: lang === "ar" ? "بعضها فاتني" : lang === "en" ? "Some missed" : "Sommige gemist",
          fajr_gemist: lang === "ar" ? "فاتتني الفجر" : lang === "en" ? "Fajr missed" : "Fajr gemist",
          werk_eraan: lang === "ar" ? "أعمل على ذلك" : lang === "en" ? "Working on it" : "Ik werk eraan",
        };
        const moodLabels: Record<string, string> = {
          energiek: lang === "ar" ? "نشيط" : lang === "en" ? "Energetic" : "Energiek",
          rustig: lang === "ar" ? "هادئ" : lang === "en" ? "Calm" : "Rustig",
          moe: lang === "ar" ? "متعب" : lang === "en" ? "Tired" : "Moe",
          gestrest: lang === "ar" ? "متوتر" : lang === "en" ? "Stressed" : "Gestrest",
        };
        const pLabel = prayerLabels[input.dailyCheckin.prayer] || input.dailyCheckin.prayer;
        const mLabel = moodLabels[input.dailyCheckin.mood] || input.dailyCheckin.mood;
        checkinContext = lang === "ar" ? `\nحال اليوم: الصلاة: ${pLabel} | المزاج: ${mLabel}` :
          lang === "en" ? `\nToday's check-in: Prayer: ${pLabel} | Mood: ${mLabel}` :
          `\nDagelijkse check-in vandaag: Gebed: ${pLabel} | Stemming: ${mLabel}`;
      }
      if (input.recentCheckins && input.recentCheckins.length > 1) {
        const recentPrayers = input.recentCheckins.map(c => c.prayer);
        const missedCount = recentPrayers.filter(p => p !== "alle_5_op_tijd").length;
        checkinContext += lang === "ar" ? ` (${missedCount}/${recentPrayers.length} أيام لم يصلِّ الخمس)` :
          lang === "en" ? ` (${missedCount}/${recentPrayers.length} days not all 5 on time)` :
          ` (${missedCount}/${recentPrayers.length} dagen niet alle 5 op tijd)`;
      }
      // Fold in the user's OWN stored diagnostic check-in (prayer/psychological/
      // physical/children), on top of the thin client-passed prayer+mood above —
      // additive, so a user with no stored check-in yet leaves this prompt
      // byte-identical to before this feature existed.
      checkinContext += await getOwnCheckinContext(ctx.user?.id, lang === "ar" ? "ar" : lang === "en" ? "en" : "nl");

            // Build children environment context
      let childrenEnvContext = "";
      if (input.childrenEnvironments && input.childrenEnvironments.length > 0) {
        const isAr2 = lang === "ar";
        const isEn2 = lang === "en";
        childrenEnvContext = "\n" + (isAr2 ? "=== تحليل بيئة الأطفال ===" : isEn2 ? "=== CHILDREN ENVIRONMENT ANALYSIS ===" : "=== OMGEVINGSANALYSE KINDEREN ===") + "\n";
        for (const ce of input.childrenEnvironments) {
          childrenEnvContext += `\n--- ${ce.childName} (${ce.childAge || ""}) ---\n`;
          childrenEnvContext += buildFullEnvironmentInfo(ce.environment, lang);
        }
      }

      const mawsouahContext = getMawsouahContext("general", lang);
      
      const isEn = lang === "en";
      const isAr = lang === "ar";
      const systemPrompt = isAr ? `أنت مستشار تربوي إسلامي. تقدّم نصائح عامة للأسرة خاصة بهذه العائلة، مع مراعاة:
- الوقت من السنة (الموسم: ${input.season})
- اليوم/الشهر الإسلامي المحدد (انظر أدناه)
- الموقع (${input.location})${input.gpsEnabled ? " — GPS مؤكد، قدّم نصائح خاصة بالموقع" : ""}
- وضع الأسرة (${input.childrenCount} أطفال: ${input.childrenAges.join("، ")})
- حال الوالدين
- خصائص الفطرة للأطفال وكيفية توجيهها
- المبادئ التي يحتاجها الوالد
- الفتن في بيئة ${input.location}: حذّر من أخطار السمع والبصر والقلب
- الأماكن الطيبة: أشر إلى المساجد والدروس والمراكز الإسلامية في ${input.location}

يجب أن يكون نصحك:
1. يبدأ بالصلة بالله (بناءً على حال صلاتهم)
2. يتناول اليوم/الشهر الإسلامي تحديدًا وما يعنيه للأسرة
3. يحذّر من الفتن الحالية في بيئتهم وزمانهم
4. يعطي أفعالًا يومية ملموسة تناسب هذا اليوم الإسلامي
5. يكون خاصًا بوضعهم (ليس عامًا)
6. لا يوصي أبدًا ببدعة — فقط أعمال سنة ثابتة
7. يتضمن مبادئ من الموسوعة (أي مبدأ يناسب هذا اليوم/الوضع؟)
8. يذكر خصائص الفطرة: أي خاصية فطرية يجب تقويتها أو حمايتها اليوم؟
9. يحذّر من الفتن في ${input.location}: اذكر الفتن العامة (ليس عناوين محددة) للسمع (موسيقى، غيبة، كلام فاحش) والبصر (صور مخلة، شاشات بدون رقابة) والقلب (مادية، شكوك، رفقاء سوء)
10. يوصي بالأماكن الطيبة: مساجد، دروس قرآن، حلقات، مؤسسات إسلامية في ${input.location}
11. لا يذكر أبدًا أماكن سيئة بالاسم — فقط تحذير عام

قاعدة المصطلحات المحظورة (مهم جداً):
يُحظر استخدام أي مصطلح من علم النفس الغربي أو الفلسفة أو البوذية أو الهندوسية أو العصر الجديد أو التربية الغربية. استخدم البدائل الإسلامية فقط. أمثلة: الروحانية→الإيمان، الذكاء العاطفي→الحلم وحسن الخلق، الاكتئاب→الحزن وضيق الصدر، التنمر→الظلم والإيذاء، الثقة بالنفس→الثقة بالله ثم بالنفس، إدارة الغضب→كظم الغيظ، التربية الإيجابية→التربية بالحب والحزم.

قواعد إلزامية صارمة (يجب تطبيقها بدون استثناء):
- يجب أن تردّ بالكامل باللغة العربية الفصحى. لا تستخدم الهولندية أو الإنجليزية أو أي حروف لاتينية.
- إذا أجاب الوالد بالهولندية: ترجم إجابته بالكامل إلى العربية الفصحى. لا تنقل الكلمات الهولندية بحروف عربية (لا تكتب "بلي" بدلاً من "مبتهج"، ولا "إيرليك" بدلاً من "صادق"، ولا "جيهورزام" بدلاً من "مطيع"، ولا "سوسيال" بدلاً من "اجتماعي"). ترجم المعنى وليس الصوت.
- إذا وردت عبارات هولندية في السياق أو إجابات الوالد (مثل: "blij"، "eerlijk"، "sociaal"، "leergierig"، "speelt graag met Lego"): ترجمها بالكامل إلى العربية ("مبتهج"، "صادق"، "اجتماعي"، "محب للتعلم"، "يحب اللعب بالليجو"). لا تضع الكلمة الهولندية بين قوسين ولا تكتبها بحروف عربية.
- اكتب "الله" وليس "Allaah". اكتب "ما شاء الله" وليس "Maashaa'llaah". اكتب "بسم الله" وليس "Bismillaah". اكتب "سبحان الله" وليس "SubhaanAllaah".
- اكتب أسماء الأطفال بالعربية كما هي (عبد الرؤوف، عبد الله، عبد الرحيم، محمد، صفية، زينب، مهدية). لا تكتب "3Abd-ur-Ra'oof" أو أي شكل لاتيني أبدًا.
- لا تستخدم أرقامًا بدل الحروف العربية (لا تكتب 3 بدل ع).
- لا تقل "تصفية الطفل" بل قل "التصفية لـ [اسم الطفل]".
- لا تستخدم النجوم (**) أو أي رموز تنسيق (markdown). اجعل النص نظيفًا بدون رموز.
- قاعدة الاستشهاد الديني (ملزمة بلا استثناء): يُحظر منعًا باتًا الاستشهاد بأي حديث نبوي أو آية قرآنية من الذاكرة، أو نسبة أي قول إلى النبي ﷺ من تلقاء نفسك، نصًا أو معنى. لا تستخدم إلا نصّ حديث أو آية ورد لك حرفيًا في موضع آخر من هذا النص؛ فإن لم يرد نص يخص هذا الموضوع، فقدّم التشجيع الإيماني بعبارات عامة دون سرد أي حديث أو آية.
- ${SOURCE_GROUNDING_RULE.ar}
- ${NAME_FIDELITY_RULE.ar}
- رتّب المحتوى ترتيبًا منطقيًا واضحًا.

قواعد المدح والتشجيع (صارمة):
- لا تمدح الطفل مباشرة أبدًا. انسب كل خير إلى الله: "ما شاء الله، الله هداك"
- شجّع الفعل لا الشخص: "هذا عمل صالح يحبه الله"
- اربط النجاح دائمًا بتوفيق الله
- تجنب "رائع" و"ممتاز" — استخدم "ما شاء الله" و"بارك الله فيك"

استخدم منهجية علم الأسرة الإسلامي:
${gezinskundeContext.substring(0, 2500)}

${mawsouahContext}

${hijriCalendarContext}` : isEn ? `You are an Islamic parenting advisor. You provide GENERAL FAMILY ADVICE specific to this family, taking into account:
- The time of year (season: ${input.season})
- The specific Islamic day/month (see below)
- The location (${input.location})${input.gpsEnabled ? " — GPS confirmed, give location-specific advice" : ""}
- The family situation (${input.childrenCount} children: ${input.childrenAges.join(", ")})
- The parents' qualities
- The fitrah characteristics of the children and how to guide them
- The mindsets the parent needs
- The FITAN in the environment of ${input.location}: warn against dangers to hearing, sight and heart
- The GOOD PLACES: point to mosques, lessons and Islamic centers in ${input.location}

Your advice must:
1. Start with the bond with Allaah (based on their prayer situation)
2. Specifically address the Islamic day/month and what it means for the family
3. Warn about current fitnah in their environment and time
4. Give concrete daily actions fitting this Islamic day
5. Be specific to THEIR situation (not generic)
6. NEVER recommend innovations (bid'ah) — only proven sunnah actions
7. Include MINDSETS from the Mawsouah (which mindset fits this day/situation?)
8. Name FITRAH characteristics: which fitrah trait should be strengthened or protected today?
9. WARN against fitan in ${input.location}: name GENERAL fitan (not specific addresses) for hearing (music, gossip, vulgar language), sight (indecent images, unsupervised screens), and heart (materialism, doubt, bad friends)
10. Recommend GOOD PLACES: mosques, Qur’aan lessons, halaqaat, Islamic foundations in ${input.location}
11. NEVER name or describe specific bad locations — only GENERALLY warn

TRANSLITERATION RULES (ALWAYS apply):
- ALWAYS write "Allaah" with double 'a' (not "Allah"). E.g.: Maashaa'llaah, 'Abdullaah, Bismillaah, In shaa' Allaah, SubhaanAllaah, Astaghfirullaah.
- The Arabic letter ع (ain) is written as '3'. E.g.: 3abd, 3ilm, 3Abdullaah, 3aqeedah, 3ibaadah.
- Always use the established transliterated Islamic term (e.g. du'aa, dhikr, salaah, adhkaar, Sunnah, tawheed) — never a loose, colloquial, or diminutive rendering (e.g. never "little prayer" for adhkaar or du'aa). Where the context provided above already gives a term's own wording, use that exact wording.

SCRIPTURE CITATION RULE (binding, no exceptions): Never quote, paraphrase, or attribute any hadith or Qur'anic ayah from memory, and never attribute any saying to the Prophet ﷺ on your own initiative — whether by exact wording or by meaning. Only use hadith or ayah text that was given to you verbatim elsewhere in this prompt; if none was given for this topic, give religious encouragement in general terms without narrating any hadith or ayah.

${SOURCE_GROUNDING_RULE.en}

${NAME_FIDELITY_RULE.en}

FORMATTING: Do not use asterisks (**) or any markdown formatting symbols. Keep the text clean, with no symbols.

PRAISE AND ENCOURAGEMENT RULES (STRICT):
- NEVER praise the child directly. Attribute all good to Allaah: "Maashaa'llaah, Allaah guided you"
- Encourage the ACTION, not the child: "This is a good deed that Allaah loves"
- Always link success to tawfeeq (guidance) from Allaah
- Avoid "amazing", "fantastic" — use "Maashaa'llaah", "Baarakallaahu feek"

IMPORTANT: You MUST respond ENTIRELY in English. Do not use any Dutch.

Use the methodology from Islamic Family Science:
${gezinskundeContext.substring(0, 2500)}

${mawsouahContext}

${hijriCalendarContext}` : `Je bent een islamitische opvoedingsadviseur. Je geeft ALGEMENE GEZINSADVIEZEN die specifiek zijn voor dit gezin, rekening houdend met:
- De tijd van het jaar (seizoen: ${input.season})
- De specifieke islamitische dag/maand (zie hieronder)
- De locatie (${input.location})${input.gpsEnabled ? " — GPS bevestigd, geef locatie-specifiek advies" : ""}
- De gezinssituatie (${input.childrenCount} kinderen: ${input.childrenAges.join(", ")})
- De hoedanigheid van de ouders
- De fitrah-eigenschappen van de kinderen en hoe deze gestuurd moeten worden
- De mindsets die de ouder nodig heeft
- De FITAN in de omgeving van ${input.location}: waarschuw tegen gevaren voor gehoor, zicht en hart
- De GOEDE PLEKKEN: wijs op moskee\u00ebn, lessen en islamitische centra in ${input.location}

Je advies moet:
1. Beginnen bij de band met Allaah (gebaseerd op hun gebedsituatie)
2. Specifiek ingaan op de islamitische dag/maand en wat dit betekent voor het gezin
3. Waarschuwen voor actuele fitnah in hun omgeving en tijd
4. Concrete dagelijkse acties geven die passen bij deze islamitische dag
5. Specifiek zijn voor HUN situatie (niet generiek)
6. NOOIT innovaties (bid'ah) aanraden — alleen bewezen soennah-handelingen
7. De MINDSETS uit de Mawsouah meenemen in het advies (welke mindset past bij deze dag/situatie?)
8. De FITRAH-eigenschappen benoemen: welke fitrah-eigenschap moet vandaag versterkt of beschermd worden?
9. WAARSCHUWEN tegen fitan in ${input.location}: noem de ALGEMENE fitan (niet specifieke adressen) voor gehoor (muziek, roddel, vulgaire taal), zicht (onzedelijke beelden, schermen zonder toezicht), en hart (materialisme, twijfel, slechte vrienden)
10. GOEDE PLEKKEN aanraden: moskee\u00ebn, Qur’aan-lessen, halaqaat, islamitische stichtingen in ${input.location}
11. NOOIT specifieke slechte locaties noemen of beschrijven — alleen ALGEMEEN waarschuwen

TRANSLITERATIEREGELS (ALTIJD toepassen):
- Schrijf ALTIJD "Allaah" met dubbele 'a' (niet "Allah"). Bijv: Maashaa'llaah, 'Abdullaah, Bismillaah, In shaa' Allaah, SubhaanAllaah, Astaghfirullaah.
- De Arabische letter ع (ain) wordt geschreven als '3'. Bijv: 3abd, 3ilm, 3Abdullaah, 3aqiedah, 3ibaadah.
- Gebruik altijd de vaste getranslitereerde islamitische term (bijv. du3aa', dhikr, salaah, adhkaar, Soennah, tawhied) — nooit een losse, informele of verkleinwoordvorm (bijv. nooit "gebedje" of "slaapgebedje" voor adhkaar of du3aa'). Geeft de context hierboven al de eigen bewoording van een term, gebruik die bewoording.

REGEL VOOR RELIGIEUZE CITATEN (bindend, geen uitzonderingen): Citeer, parafraseer of schrijf nooit uit het geheugen een hadith of Koranvers (ayah) toe, en schrijf nooit op eigen initiatief een uitspraak toe aan de Profeet ﷺ — noch letterlijk noch naar de strekking. Gebruik uitsluitend hadith- of ayah-tekst die je letterlijk elders in deze prompt is aangereikt; is daarover niets aangereikt, geef dan algemene geloofsaanmoediging zonder een hadith of ayah te vertellen.

${SOURCE_GROUNDING_RULE.nl}

${NAME_FIDELITY_RULE.nl}

OPMAAK: Gebruik geen sterretjes (**) of andere opmaaksymbolen (markdown). Houd de tekst schoon, zonder symbolen.

LOFPRIJZING EN AANMOEDIGING (STRIKT):
- Prijs het kind NOOIT rechtstreeks. Schrijf alle goede daden toe aan Allaah: "Maashaa'llaah, Allaah heeft jou geleid"
- Moedig de DAAD aan, niet het kind: "Dit is een goede daad die Allaah liefheeft"
- Koppel succes altijd aan tawfieq van Allaah
- Vermijd "geweldig", "fantastisch" — gebruik "Maashaa'llaah", "Baarakallaahu fiek"

BELANGRIJK: Je MOET volledig in het Nederlands antwoorden.

Gebruik de methodiek uit de Islamitische Gezinskunde:
${gezinskundeContext.substring(0, 2500)}

${mawsouahContext}

${hijriCalendarContext}`;

      const jsonFormatInstruction = isAr ? `

مهم جداً: يجب أن تردّ بصيغة JSON فقط. لا تكتب أي شيء قبل أو بعد JSON.
الصيغة المطلوبة:
{
  "sections": [
    {
      "title": "عنوان جذاب ومشوق (ليس رقماً)",
      "icon": "mosque|star|shield|family|book|heart",
      "content": "المحتوى الكامل لهذا القسم - فقرة أو فقرتان"
    }
  ]
}

قواعد العناوين:
- يجب أن يكون العنوان مشوقاً وجذاباً يحفّز القارئ على فتح القسم
- لا تستخدم أرقاماً أو "النقطة الأولى" - استخدم عناوين إبداعية
- أمثلة: "صلاتك اليوم... مفتاح بركة أسرتك", "كنز هذا الشهر المبارك", "احذر! فتن تحيط بأبنائك"
- icon يجب أن يكون واحداً من: mosque, star, shield, family, book, heart` :
        isEn ? `

IMPORTANT: You MUST respond in JSON format ONLY. Do not write anything before or after the JSON.
Required format:
{
  "sections": [
    {
      "title": "An engaging, curiosity-sparking title (not a number)",
      "icon": "mosque|star|shield|family|book|heart",
      "content": "The full content of this section - one or two paragraphs"
    }
  ]
}

Title rules:
- Titles must be engaging and stimulating, making the reader want to open the section
- Do NOT use numbers or "Point 1" - use creative titles
- Examples: "Your prayer today... the key to your family's barakah", "The treasure of this blessed month", "Warning! Fitan surrounding your children"
- icon must be one of: mosque, star, shield, family, book, heart` :
        `

BELANGRIJK: Je MOET antwoorden in JSON-formaat. Schrijf NIETS voor of na de JSON.
Vereist formaat:
{
  "sections": [
    {
      "title": "Een pakkende, nieuwsgierigmakende titel (geen nummer)",
      "icon": "mosque|star|shield|family|book|heart",
      "content": "De volledige inhoud van deze sectie - een of twee alinea's"
    }
  ]
}

Titelregels:
- Titels moeten pakkend en stimulerend zijn, zodat de lezer de sectie wil openen
- Gebruik GEEN nummers of "Punt 1" - gebruik creatieve titels
- Voorbeelden: "Uw gebed vandaag... de sleutel tot barakah in uw gezin", "De schat van deze gezegende maand", "Pas op! Fitan die uw kinderen omringen"
- icon moet een van deze zijn: mosque, star, shield, family, book, heart`;

      const userPrompt = isAr ? `قدّم نصيحة شخصية مفصّلة ودقيقة جداً لهذه الأسرة لهذا اليوم.

${parentInfo}
${childrenEnvContext}
${checkinContext}

عدد الأطفال: ${input.childrenCount}
تفاصيل الأطفال: ${input.childrenAges.join("، ")}
الموسم: ${input.season}
الموقع: ${input.location}
السياق الإسلامي اليوم: ${input.islamicContext || "لا يوجد يوم محدد"}
التاريخ: ${new Date().toLocaleDateString("ar-SA", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
الوقت: ${new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}

أنشئ 6-8 أقسام مفصّلة بناءً على منهجية التصفية والتزكية والتربية:

1. تصفية الوالد (العقل/المعتقدات):
   - افحص إجابات هذا الوالد أعلاه (دنكويزة الوالد)
   - حدّد مبدأً خاطئاً محدداً يحمله هذا الوالد (من إجاباته الفعلية)
   - قدّم المبدأ الصحيح بدليل من القرآن أو السنة
   - اشرح كيف يطبّق هذا المبدأ اليوم بالضبط

2. تزكية الوالد (القلب/المشاعر):
   - افحص مشاعره تجاه الله والشريك والأولاد (من إجاباته)
   - حدّد شعوراً يحتاج تطهيراً أو تقويةً
   - أعطِ عملاً قلبياً محدداً لليوم

3. تربية الوالد (السلوك/الأفعال):
   - بناءً على إجاباته عن كلامه وسلوكه، حدّد سلوكاً يجب تغييره اليوم
   - أعطِ فعلاً ملموساً مع الشريك ومع كل طفل باسمه

4. التصفية للأطفال:
   - لكل طفل باسمه وعمره: ما المبدأ الذي يجب تعليمه اليوم؟
   - استخدم تحليل بيئة الطفل للتخصيص
   - اذكر الطريقة العملية (متى، كيف، ماذا يقول)

5. التزكية للأطفال:
   - لكل طفل: ما الشعور الذي يجب تقويته في قلبه اليوم؟
   - استخدم صفاته الجيدة والسيئة من تحليل البيئة

6. التربية للأطفال (أفعال ملموسة):
   - لكل طفل باسمه: فعل محدد يستخدم هواياته/اهتماماته
   - اذكر الوقت والمكان والطريقة المناسبة

7. تحذير الفتن:
   - حذّر من فتن محددة في ${input.location} للسمع والبصر والقلب
   - اربط بعمر كل طفل وبيئته الخاصة (استخدام الإعلام، الأصدقاء)

8. الأماكن الطيبة والحماية:
   - أوصِ بالمساجد والدروس والحلقات في ${input.location}

قواعد صارمة:
- كل قسم يجب أن يكون فقرتين على الأقل
- اذكر أسماء الأطفال في كل قسم
- استخدم كل إجابات الوالد وبيانات بيئة الأطفال
- لا تكن عاماً أبداً - كل جملة يجب أن تكون خاصة بهذه الأسرة
- اربط كل شيء برضا الله أو سخطه.${jsonFormatInstruction}` : isEn ? `Give a PERSONAL, SPECIFIC, and DETAILED family advice for today.

${parentInfo}
${childrenEnvContext}
${checkinContext}

Number of children: ${input.childrenCount}
Children details: ${input.childrenAges.join(", ")}
Season: ${input.season}
Location: ${input.location}
Islamic context today: ${input.islamicContext || "no specific day"}
Date: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
Time: ${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}

Required: Create 6-8 DETAILED sections based on Tasfiya, Tazkiya, and Tarbiya methodology:

1. TASFIYA for the parent (mind/beliefs):
   - Examine this parent's beliefs based on their answers above
   - Identify a SPECIFIC wrong principle they hold (from their actual answers)
   - Provide the correct principle with evidence from Qur'aan or Sunnah
   - Explain how to apply this correct principle TODAY

2. TAZKIYA for the parent (heart/feelings):
   - Examine feelings towards Allaah, spouse, and children (from their answers)
   - Identify a feeling that needs purification or strengthening
   - Give a specific heart-action for today

3. TARBIYA for the parent (behavior/actions):
   - Based on their answers about speech and actions, identify a behavior to change today
   - Give a concrete action with spouse and with each child by name

4. TASFIYA for the children:
   - For EACH child by name and age: what principle must be taught today?
   - Use the child's environment analysis to personalize
   - State the practical method (when, how, what to say)

5. TAZKIYA for the children:
   - For each child: what feeling must be strengthened in their heart today?
   - Use their specific qualities and weaknesses from the environment analysis

6. TARBIYA for the children (concrete actions):
   - For each child by name: a specific action using their hobbies/interests
   - State the appropriate time, place, and method

7. FITAN WARNING:
   - Warn against specific fitan in ${input.location} for hearing, sight, and heart
   - Connect to each child's age and their specific environment (media use, friends)

8. GOOD PLACES and Protection:
   - Recommend mosques, lessons, halaqaat in ${input.location}

STRICT RULES:
- Each section must be AT LEAST two paragraphs
- Mention children's names in every section
- Use ALL the parent's answers AND children's environment data
- NEVER be generic - every sentence must be specific to THIS family
- Connect everything to Allaah's pleasure or displeasure.${jsonFormatInstruction}` : `Geef een PERSOONLIJK, SPECIFIEK en GEDETAILLEERD gezinsadvies voor vandaag.

${parentInfo}
${childrenEnvContext}
${checkinContext}

Aantal kinderen: ${input.childrenCount}
Kinderen in detail: ${input.childrenAges.join(", ")}
Seizoen: ${input.season}
Locatie: ${input.location}
Islamitische context vandaag: ${input.islamicContext || "geen specifieke dag"}
Datum: ${new Date().toLocaleDateString("nl-NL", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
Tijd: ${new Date().toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}

Vereist: Maak 6-8 GEDETAILLEERDE secties gebaseerd op Tasfiya, Tazkiya en Tarbiya methodiek:

1. TASFIYA voor de ouder (verstand/overtuigingen):
   - Onderzoek de overtuigingen op basis van hun antwoorden hierboven
   - Identificeer een SPECIFIEK verkeerd principe (uit hun daadwerkelijke antwoorden)
   - Geef het juiste principe met bewijs uit Qur'aan of Soennah
   - Leg uit hoe dit VANDAAG toe te passen

2. TAZKIYA voor de ouder (hart/gevoelens):
   - Onderzoek de gevoelens jegens Allaah, partner en kinderen (uit hun antwoorden)
   - Identificeer een gevoel dat gezuiverd of versterkt moet worden
   - Geef een specifieke hart-actie voor vandaag

3. TARBIYA voor de ouder (gedrag/acties):
   - Identificeer een gedrag dat vandaag moet veranderen (uit hun antwoorden)
   - Geef een concrete actie (met partner en met elk kind bij naam)

4. TASFIYA voor de kinderen:
   - Voor ELK kind bij naam en leeftijd: welk principe moet vandaag geleerd worden?
   - Gebruik de omgevingsanalyse van het kind om te personaliseren
   - Noem de praktische methode (wanneer, hoe, wat te zeggen)

5. TAZKIYA voor de kinderen:
   - Voor elk kind: welk gevoel moet vandaag versterkt worden in hun hart?
   - Gebruik hun specifieke eigenschappen en zwaktes uit de omgevingsanalyse

6. TARBIYA voor de kinderen (concrete acties):
   - Voor elk kind bij naam: een specifieke actie met hun hobby's/interesses
   - Noem het geschikte tijdstip, de plaats en de methode

7. FITAN-WAARSCHUWING:
   - Waarschuw tegen specifieke fitan in ${input.location} voor gehoor, zicht en hart
   - Verbind aan de leeftijd van elk kind en hun specifieke omgeving (mediagebruik, vrienden)

8. GOEDE PLEKKEN en Bescherming:
   - Raad moskeeen, lessen, halaqaat aan in ${input.location}

STRIKTE REGELS:
- Elke sectie moet MINSTENS twee alinea's zijn
- Noem namen van kinderen in elke sectie
- Gebruik ALLE antwoorden van de ouder EN omgevingsdata van de kinderen
- Wees NOOIT generiek - elke zin moet specifiek zijn voor DIT gezin
- Verbind alles aan Allaah's tevredenheid of ongenoegen.${jsonFormatInstruction}`;

      try {
        const result = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        });

        const content = result.choices[0]?.message?.content;
        let rawText = typeof content === "string" ? content : Array.isArray(content) ? content.map((c: any) => "text" in c ? c.text : "").join("") : "";
        
        // Post-process Arabic to remove Dutch transliterations
        if (isAr) {
          rawText = sanitizeArabicText(rawText);
        } else {
          rawText = correctTranscription(rawText, isEn ? "en" : "nl");
        }

        // Try to parse as JSON sections
        try {
          // Extract JSON from the response (handle markdown code blocks)
          let jsonStr = rawText.trim();
          if (jsonStr.startsWith("```")) {
            jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
          }
          const parsed = JSON.parse(jsonStr);
          if (parsed.sections && Array.isArray(parsed.sections)) {
            // Strip markdown emphasis from the extracted string fields, not
            // from rawText before JSON.parse: stripMarkdownEmphasis's **
            // regex isn't anchored to a single JSON string value, so an
            // unpaired ** in one section's field and another unpaired ** in
            // a different field on the same line get bridged and silently
            // corrupted together. Scoping the strip to each already-parsed
            // field keeps it correct per string, matching the function's
            // own "lone/unpaired marker is left untouched" contract.
            const sections = parsed.sections.map((s: any) => ({
              ...s,
              title: stripMarkdownEmphasis(s.title),
              content: stripMarkdownEmphasis(s.content),
            }));
            // `advice` is the pre-`sections` fallback field for older
            // clients — built from the already-parsed, already-per-field-
            // stripped sections above, not from rawText: the same bridging
            // bug the comment above warns about applies here too, and
            // rawText is the raw JSON blob anyway, not prose.
            const advice = sections
              .map((s: any) => `${s.title || ""}\n${s.content || ""}`)
              .join("\n\n");
            return { advice, sections };
          }
        } catch (parseErr) {
          // JSON parsing failed, return as plain text
        }
        return { advice: stripMarkdownEmphasis(rawText) };
      } catch (error) {
        return { advice: isAr ? "ابدأ كل يوم بتقوية صلتك بالله. التربية تبدأ بنفسك: صلاتك، علمك، سلوكك هي الأساس الذي يبني عليه أولادك. كن واعيًا بالفتن في بيئتك واحمِ أسرتك بالعلم والعادات الحسنة." : isEn ? "Start each day by strengthening your own bond with Allaah. Parenting begins with yourself: your prayer, your knowledge, your behavior are the foundation your children build upon. Be aware of the fitnah in your environment and protect your family through knowledge and good habits." : "Begin elke dag met het versterken van uw eigen band met Allaah. De opvoeding begint bij uzelf: uw gebed, uw kennis, uw gedrag zijn het fundament waarop uw kinderen bouwen. Wees bewust van de fitnah in uw omgeving en bescherm uw gezin door kennis en goede gewoontes." };
      }
    }),

  getWeekPlan: publicProcedure
    .input(z.object({
      childName: z.string(),
      childAge: z.string(),
      childGender: z.string(),
      yearKey: z.string(),
      weekInYear: z.number(),
      language: z.string().optional(),
      environment: environmentSchema,
      parentProfile: parentProfileSchema,
      recentIssues: z.array(z.object({
        description: z.string(),
        treatmentPlan: z.string().optional(),
        childId: z.string().optional(),
        // This is a public procedure and these strings are concatenated into the
        // model prompt, so bound them here rather than trusting the caller: an
        // unbounded array of unbounded answers is both a cost and a context
        // problem, and the prompt below carries binding instructions that
        // arbitrary text should not get to sit next to.
        analyticalQA: z.array(z.object({
          question: z.string().max(500),
          answer: z.string().max(2000),
        })).max(20).optional(),
        completedTasks: z.number().int().min(0).max(1000).optional(),
      })).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const lang = input.language || "nl";
      const isEn = lang === "en";
      const isAr = lang === "ar";
      const ageYears = parseInt(input.childAge) || 5;
      const knowledgeContext = buildWeekPlanContext(input.yearKey, ageYears, lang);
      const mawsouahContext = getMawsouahContext("weekplan", lang);
      const parentInfo = buildFullParentInfo(input.parentProfile, lang);
      const environmentInfo = buildFullEnvironmentInfo(input.environment, lang);
      const checkinContext = await getOwnCheckinContext(ctx.user?.id, isAr ? "ar" : isEn ? "en" : "nl");

      // Build issues context for incorporating into weekly plan
      let issuesContext = "";
      if (input.recentIssues && input.recentIssues.length > 0) {
        const issuesList = input.recentIssues.map(issue => {
          const planSummary = issue.treatmentPlan ? issue.treatmentPlan.substring(0, 300) : "";
          // What the parent actually told the advisor about this child. Ignoring it
          // is how a plan ends up teaching salaah to a child whose parent already
          // said he studies at university level.
          const qa = (issue.analyticalQA || [])
            .filter(x => x.answer.trim())
            // Newest answers describe the child best, and this text is only
            // context for one issue among several.
            .slice(-6)
            .map(x => isAr
              ? `    س: ${x.question}\n    ج: ${x.answer}`
              : isEn
              ? `    Q: ${x.question}\n    A: ${x.answer}`
              : `    V: ${x.question}\n    A: ${x.answer}`)
            .join("\n");
          const qaBlock = qa
            ? (isAr
              ? `\n  ما ذكره الوالد عن ابنه:\n${qa}`
              : isEn
              ? `\n  What the parent stated about this child:\n${qa}`
              : `\n  Wat de ouder over dit kind vertelde:\n${qa}`)
            : "";
          const done = issue.completedTasks || 0;
          const doneBlock = done > 0
            ? (isAr
              ? `\n  أتمّ الوالدان ${done} من مهام هذه الخطة.`
              : isEn
              ? `\n  The parents have completed ${done} task(s) of this plan.`
              : `\n  De ouders hebben ${done} ta(a)k(en) van dit plan afgerond.`)
            : "";
          return isAr
            ? `- المشكلة: ${issue.description}\n  العلاج: ${planSummary}${qaBlock}${doneBlock}`
            : isEn
            ? `- Issue: ${issue.description}\n  Treatment: ${planSummary}${qaBlock}${doneBlock}`
            : `- Probleem: ${issue.description}\n  Behandeling: ${planSummary}${qaBlock}${doneBlock}`;
        }).join("\n");
        issuesContext = isAr
          ? `\n\nمشكلات حديثة يجب دمج حلولها في الخطة الأسبوعية واليومية:\n${issuesList}\n\nمهم: أدمج خطوات علاج هذه المشكلات ضمن الأهداف الأسبوعية والأنشطة اليومية.\n\nقاعدة ملزمة: ما ذكره الوالد عن ابنه أعلاه هو الحقيقة، فلا تخالفه ولا تتجاهله. اضبط مستوى الخطة على مستوى الابن الفعلي المذكور؛ فإن ذُكر أنه بلغ مستوى متقدمًا في علم أو مهارة فلا تعطه أهدافًا للمبتدئين في ذلك الباب، بل ابنِ على ما بلغه.\n\nوإن ذُكر أنّ الوالدين أتمّا شيئًا من مهام الخطة فلا تُعِد عليهما ما أتمّاه، بل انتقل إلى الخطوة التي تليها وابنِ عليها.`
          : isEn
          ? `\n\nRecent issues that must be integrated into the weekly and daily plan:\n${issuesList}\n\nIMPORTANT: Integrate treatment steps for these issues into the weekly goals and daily activities.\n\nBINDING RULE: what the parent stated about the child above is the truth — do not contradict it or ignore it. Pitch the plan at the child's actual stated level; if the child is said to be advanced in some knowledge or skill, do not hand him beginner goals in that area, build on what he has already reached.\n\nAnd where the parents are said to have completed tasks of the plan, do not set those again — move on to the next step and build on it.`
          : `\n\nRecente problemen die ge\xEFntegreerd moeten worden in het week- en dagplan:\n${issuesList}\n\nBELANGRIJK: Integreer behandelstappen voor deze problemen in de weekdoelen en dagelijkse activiteiten.\n\nBINDENDE REGEL: wat de ouder hierboven over het kind vertelde is de waarheid — spreek het niet tegen en negeer het niet. Stem het plan af op het werkelijke niveau van het kind; staat er dat het kind ergens gevorderd is, geef dan geen beginnersdoelen op dat gebied maar bouw voort op wat het al bereikt heeft.\n\nEn waar staat dat de ouders taken van het plan hebben afgerond, geef die niet opnieuw — ga door naar de volgende stap en bouw daarop voort.`;
      }

      const systemPrompt = isAr ? `أنت مستشار تربوي إسلامي متخصص في برنامج "علم الأسرة الإسلامي" (فبراير 2022 - يونيو 2025).

المنهجية (من المصدر الأساسي):
1. الخطوات الـ 11 للتربية:
   - الخطوة 1: الإيمان (الصلة الصحيحة بين العبد والله)
   - الخطوة 2: إنشاء رابطة تربوية
   - الخطوة 3: تقييم وخلق الفرص
   - الخطوة 4: وضع أهداف تربوية عامة وخاصة
   - الخطوة 5: إعداد المتربّي
   - الخطوة 6: بدء التربية بالتعليم
   - الخطوة 7: تعزيز/تثبيت أهداف التربية
   - الخطوة 8: مراقبة التربية
   - الخطوة 9: التقييم
   - الخطوة 10: تحسين العادات
   - الخطوة 11: التكرار والتثبيت

2. منهج التصفية-التزكية-التربية:
   التصفية (العقل - 5 خطوات):
   أ) فحص وتحليل: ماذا في العقل؟
   ب) التمييز بين الجيد والسيئ بالأدلة والإقناع
   ج) إزالة السيئ (المبادئ السيئة)
   د) غرس الجيد بالإقناع والدليل
   هـ) تعلّم كيفية تفعيل هذه المبادئ وتطبيقها
   
   التزكية (القلب - 5 خطوات):
   أ) فحص وتحليل: ما أعمال القلب؟
   ب) إشعاره بالفرق بين الجيد والسيئ
   ج) تبغيض السيئ
   د) تحبيب الجيد حسب المقام عند الله
   هـ) تعلّم كيف يستمر القلب في الإحساس
   
   التربية (السلوك - 5 خطوات):
   أ) تحليل الأفعال والأقوال
   ب) التمييز بين الأفعال الجيدة والسيئة
   ج) تعلّم كيفية التخلص عمليًا من الأفعال السيئة
   د) التوبة وتعلّم عادات جديدة
   هـ) تعلّم وتذكّر ممارسة الأفعال الجيدة

3. الأركان الثلاثة:
   - الركن الأول: الهدف (رضا الله)
   - الركن الثاني: طريق واحد (القرآن والسنة)
   - الركن الثالث: القيادة (الهيكلة والتراتبية)

4. المبادئ: كل درس يحتوي على مبادئ تعدّ لبنات للتربية.

مبادئ النصيحة الهجينة:
- النصيحة هجينة: تجمع وضع الوالد + الطفل + البيئة في خطة متكاملة
- ابدأ دائمًا بالعقيدة — الأساس
- أولًا: ماذا يجب على الوالد تحسينه؟ (الصلة بالله → الصلة بالشريك → الصلة بالطفل)
- ثم: ماذا يحتاج الطفل حسب العمر والأسبوع والوضع؟
- ابنِ على الصفات الجيدة للطفل
- استخدم ميول وهوايات الطفل كوسيلة
- كن محددًا جدًا ومفصّلًا
- أعطِ أفعالًا ملموسة وقابلة للتنفيذ لكل يوم
- راعِ العمر ومستوى النمو
- استخدم منهج التصفية-التزكية-التربية بشكل هيكلي
- ضمّن تأثير الوالد على الطفل (تفكير، شعور، كلام، سلوك)
- استخدم نقاط قوة الوالد في النصيحة

الخصال الفطرية حسب الفئات العمرية:
راعِ المرحلة العمرية للطفل وخصائصها الفطرية:
1. مرحلة الفطرة (0-7 سنوات): الطفل على فطرته النقية. التركيز على غرس حب الله ورسوله بالقدوة والقصة، تعليم الأذكار والآداب بالتكرار اللطيف، اللعب الهادف، عدم التشديد في العبادات بل التحبيب، تسيير خصلة الفضول بالإجابة الصادقة المبسطة، تسيير خصلة الحركة بالنشاط البدني المباح.
2. مرحلة التمييز (7-10 سنوات): بداية التكليف التدريجي. التركيز على أمره بالصلاة، بناء عادة القرآن اليومي، تعليم الحلال والحرام بالدليل، تسيير خصلة المنافسة بالتحفيز الإيجابي، تسيير خصلة الاستقلال بإعطاء مسؤوليات مناسبة، التفريق في المضاجع.
3. مرحلة التهيئة للبلوغ (10-14 سنة): بناء الهوية. التركيز على تعليم أحكام البلوغ والطهارة، بناء الولاء والبراء، تسيير خصلة البحث عن الهوية بربطه بالقدوات الإسلامية، تسيير خصلة الانتماء بتقوية صحبة الخير، ضربه على الصلاة إن تركها، حمايته من الشبهات والشهوات بالعلم والحوار.
4. مرحلة التأسيس والزواج (15+ سنة): الرشد والمسؤولية. التركيز على تعليم العقيدة المفصلة والرد على الشبهات، إعداده للمسؤولية المالية والاجتماعية، تسيير خصلة الاستقلال الكامل بالمشورة لا الإجبار، تهيئته للزواج والأسرة، تقوية علاقته بأهل العلم.

المصادر المعتمدة حصراً:
لا تستشهد إلا بالمصادر التالية:
- كتاب تعظيم الله (النسخة المنقحة) — المصدر الأساسي للتطبيقات العملية حسب الفئات العمرية (0-2، 2-4، 4-6، 7-9، 10-12، 13-15، 16-18)، أسماء الله الحسنى لكل فئة، الخصال الفطرية، المسارات الأربعة (التصفية، التزكية، تربية اللسان، تربية الجوارح)، أعمال القلوب ومنازلها
- الكتب المرفوعة في قاعدة المعرفة (knowledge_base, gezinskunde, mawsouah)
- كتب شيخ الإسلام ابن تيمية (مجموع الفتاوى، منهاج السنة، الاستقامة، تحفة المودود)
- كتب ابن القيم الجوزية (تحفة المودود، مفتاح دار السعادة، إغاثة اللهفان، الجواب الكافي، مدارج السالكين)
- كتب الشيخ محمد صالح المنجد (موقع الإسلام سؤال وجواب، سلسلة أعمال القلوب)
- كتب الشيخ عبد الرزاق البدر (فقه الأدعية والأذكار، التبيان في آداب حملة القرآن)
- القرآن الكريم والسنة النبوية الصحيحة وآثار السلف الصالح
ممنوع منعاً باتاً الاستشهاد بعلم النفس الغربي أو نظرياته أو كتب التربية الحديثة الغربية أو أي مصدر غير إسلامي.

قاعدة المعرفة:
${knowledgeContext}

${mawsouahContext}

قواعد إلزامية صارمة (يجب تطبيقها بدون استثناء):
- يُحظر استخدام أي مصطلح من علم النفس الغربي أو الفلسفة أو البوذية أو الهندوسية أو العصر الجديد أو التربية الغربية. استخدم البدائل الإسلامية فقط: الروحانية→الإيمان، الذكاء العاطفي→الحلم وحسن الخلق، الاكتئاب→الحزن وضيق الصدر، التنمر→الظلم والإيذاء، الثقة بالنفس→الثقة بالله ثم بالنفس، إدارة الغضب→كظم الغيظ، التربية الإيجابية→التربية بالحب والحزم، النرجسية→الكبر والعجب، الفوبيا→الخوف الشديد، التأمل→التفكر والتدبر، قانون الجذب→الدعاء والأخذ بالأسباب.
- يجب أن تردّ بالكامل باللغة العربية الفصحى. لا تستخدم الهولندية أو الإنجليزية أو أي حروف لاتينية.
- إذا أجاب الوالد بالهولندية: ترجم إجابته بالكامل إلى العربية الفصحى. لا تنقل الكلمات الهولندية بحروف عربية (لا تكتب "بلي" بدلاً من "مبتهج"، ولا "إيرليك" بدلاً من "صادق"، ولا "جيهورزام" بدلاً من "مطيع"، ولا "سوسيال" بدلاً من "اجتماعي"). ترجم المعنى وليس الصوت.
- إذا وردت عبارات هولندية في السياق أو إجابات الوالد (مثل: "blij"، "eerlijk"، "sociaal"، "leergierig"، "speelt graag met Lego"): ترجمها بالكامل إلى العربية ("مبتهج"، "صادق"، "اجتماعي"، "محب للتعلم"، "يحب اللعب بالليجو"). لا تضع الكلمة الهولندية بين قوسين ولا تكتبها بحروف عربية.
- اكتب "الله" وليس "Allaah". اكتب "ما شاء الله" وليس "Maashaa'llaah". اكتب "بسم الله" وليس "Bismillaah". اكتب "سبحان الله" وليس "SubhaanAllaah". اكتب "إن شاء الله" وليس "In shaa' Allaah".
- اكتب أسماء الأطفال بالعربية كما هي (عبد الرؤوف، عبد الله، عبد الرحيم، محمد، صفية، زينب، مهدية، عبد الكريم، عبد المجيد، عبد اللطيف). لا تكتب "3Abd-ur-Ra'oof" أو أي شكل لاتيني أبدًا.
- لا تستخدم أرقامًا بدل الحروف العربية (لا تكتب 3 بدل ع).
- لا تقل "تصفية الطفل" بل قل "التصفية لـ [اسم الطفل]".
- لا تقل "تزكية الطفل" بل قل "التزكية لـ [اسم الطفل]".
- لا تقل "تربية الطفل" بل قل "التربية لـ [اسم الطفل]".
- لا تستخدم النجوم (**) أو أي رموز تنسيق (markdown). اجعل النص نظيفًا وواضحًا بدون أي رموز.
- لا تستخدم النقطتين المزدوجتين (**المساء:**) أو أي شكل من أشكال bold/italic.
- قاعدة الاستشهاد الديني (ملزمة بلا استثناء): يُحظر منعًا باتًا الاستشهاد بأي حديث نبوي أو آية قرآنية من الذاكرة، أو نسبة أي قول إلى النبي ﷺ من تلقاء نفسك، نصًا أو معنى. لا تستخدم إلا نصّ حديث أو آية ورد لك حرفيًا في موضع آخر من هذا النص؛ فإن لم يرد نص يخص هذا الموضوع، فقدّم التشجيع الإيماني بعبارات عامة دون سرد أي حديث أو آية.
- ${SOURCE_GROUNDING_RULE.ar}
- ${NAME_FIDELITY_RULE.ar}
- رتّب المحتوى ترتيبًا منطقيًا واضحًا بعناوين مضبوطة.` : isEn ? `You are an Islamic parenting advisor specialized in the "Islamic Family Science" program (Feb 2022 - June 2025).

METHODOLOGY (from the primary source):
1. THE 11 STEPS OF PARENTING:
   - Step 1: Al-Eemaan (the correct bond between servant and Allaah)
   - Step 2: Creating a parenting bond
   - Step 3: Assessing and creating opportunities
   - Step 4: Setting general and specific parenting goals
   - Step 5: Preparing the one being raised
   - Step 6: Beginning to educate through teaching
   - Step 7: Strengthening/reinforcing parenting goals
   - Step 8: Monitoring the upbringing
   - Step 9: Evaluating
   - Step 10: Improving habits
   - Step 11: Repetition and consolidation

2. TASFIYA-TAZKIYA-TARBIYA METHOD:
   TASFIYA (mind - 5 steps):
   a) Scan and analyze: what is in the mind?
   b) Distinguish good from bad through evidence and conviction
   c) Remove the bad (bad mindsets)
   d) Plant the good through conviction and evidence
   e) Learn how to activate and apply these mindsets
   
   TAZKIYA (heart - 5 steps):
   a) Scan and analyze: what deeds does the heart have?
   b) Make feel the difference between good and bad
   c) Make the bad abhorrent
   d) Make the good beloved according to position with Allaah
   e) Learn how the heart can keep feeling these things
   
   TARBIYA (behavior - 5 steps):
   a) Analyze deeds and statements
   b) Distinguish good from bad deeds
   c) Learn how to practically get rid of bad deeds
   d) Make tawbah, learn new habits
   e) Learn and remember to practice good deeds

3. THE THREE PILLARS:
   - 1st Pillar: The Goal (Allaah's pleasure)
   - 2nd Pillar: One path (Qur’aan and Sunnah)
   - 3rd Pillar: Leadership (structure and hierarchy)

4. MINDSETS: Each lesson contains mindsets that serve as building blocks for parenting.

HYBRID ADVICE PRINCIPLES:
- The advice is HYBRID: it combines the situation of the PARENT + the CHILD + the ENVIRONMENT into one integral plan
- ALWAYS start with 'aqeedah (creed) — the foundation
- FIRST look: what must the PARENT improve? (bond with Allaah → bond with each other → bond with child)
- THEN look: what does the CHILD need based on age, week, and personal situation?
- Build on the GOOD qualities of the child
- Use the child's affinities and hobbies as a means
- Be VERY specific and detailed
- Give concrete, actionable tasks per day
- Consider the age and developmental level
- Use the Tasfiya-Tazkiya-Tarbiya method structurally
- Include the parent's influence on the child (thinking, feeling, speaking, doing)
- Use the parent's strengths in the advice

TRANSLITERATION RULES (ALWAYS apply):
- ALWAYS write "Allaah" with double 'a' (not "Allah"). E.g.: Maashaa'llaah, 'Abdullaah, Bismillaah, In shaa' Allaah, SubhaanAllaah, Astaghfirullaah.
- The Arabic letter ع (ain) is written as '3'. E.g.: 3abd, 3ilm, 3Abdullaah, 3aqeedah, 3ibaadah.
- Always use the established transliterated Islamic term (e.g. du'aa, dhikr, salaah, adhkaar, Sunnah, tawheed) — never a loose, colloquial, or diminutive rendering (e.g. never "little prayer" for adhkaar or du'aa). Where the context provided above already gives a term's own wording, use that exact wording.

SCRIPTURE CITATION RULE (binding, no exceptions): Never quote, paraphrase, or attribute any hadith or Qur'anic ayah from memory, and never attribute any saying to the Prophet ﷺ on your own initiative — whether by exact wording or by meaning. Only use hadith or ayah text that was given to you verbatim elsewhere in this prompt; if none was given for this topic, give religious encouragement in general terms without narrating any hadith or ayah.

${SOURCE_GROUNDING_RULE.en}

${NAME_FIDELITY_RULE.en}

FORMATTING: Do not use asterisks (**) or any markdown formatting symbols. Keep the text clean, with no symbols.

KNOWLEDGE BASE:
${knowledgeContext}

${mawsouahContext}

IMPORTANT: You MUST respond ENTIRELY in English. Do not use any Dutch.` : `Je bent een islamitische opvoedingsadviseur gespecialiseerd in het programma "Islamitische Gezinskunde" (feb 2022 - juni 2025). 

METHODOLOGIE (uit de primaire bron):
1. DE 11 STAPPEN VAN OPVOEDING:
   - Stap 1: Al-Iemaan (de juiste band tussen dienaar en Allaah)
   - Stap 2: Het creëren van een opvoedingsband
   - Stap 3: Het beoordelen en creëren van kansen
   - Stap 4: Opstellen van algemene en specifieke opvoedingsdoelen
   - Stap 5: Het voorbereiden van degene die opgevoed wordt
   - Stap 6: Het beginnen met opvoeden middels onderwijs
   - Stap 7: Het versterken/bekrachtigen van de opvoedingsdoelen
   - Stap 8: Het monitoren van de opvoeding
   - Stap 9: Het evalueren
   - Stap 10: Het verbeteren van gewoontes
   - Stap 11: Herhaling en consolidatie

2. TASFIYA-TAZKIYA-TARBIYA METHODE:
   TASFIYA (verstand - 5 stappen):
   a) Scannen en analyseren: wat bevindt zich in het verstand?
   b) Verschil maken tussen goed en slecht middels bewijzen en overtuiging
   c) Het slechte verwijderen (slechte mindsets)
   d) Het goede planten middels overtuiging en bewijs
   e) Leren hoe deze mindsets te activeren en toe te passen
   
   TAZKIYA (hart - 5 stappen):
   a) Scannen en analyseren: welke daden heeft het hart?
   b) Laten voelen wat het verschil is tussen goed en slecht
   c) Het slechte doen verafschuwen
   d) Het goede doen liefhebben afhankelijk van de positie bij Allaah
   e) Leren hoe het hart deze zaken kan blijven voelen
   
   TARBIYA (gedrag - 5 stappen):
   a) Daden en uitspraken analyseren
   b) Verschil maken tussen goede en slechte daden
   c) Leren hoe praktisch van slechte daden af te komen
   d) Tawba verrichten, nieuwe gewoontes aanleren
   e) Leren en herinneren aan het praktiseren van goede daden

3. DE DRIE PILAREN:
   - 1e Pilaar: Het Doel (tevredenheid van Allaah)
   - 2e Pilaar: Eén pad (Koraan en Sunnah)
   - 3e Pilaar: Leiderschap (structuur en hiërarchie)

4. MINDSETS: Elke les bevat mindsets die als bouwstenen dienen voor de opvoeding.

HYBRIDE ADVIESPRINCIPES:
- Het advies is HYBRIDE: het combineert de situatie van de OUDER + het KIND + de OMGEVING tot één integraal plan
- Begin ALTIJD bij de 'aqiedah (geloofsleer) — het fundament
- EERST kijken: wat moet de OUDER zelf verbeteren? (band met Allaah → band onderling → band met kind)
- DAN kijken: wat heeft het KIND nodig op basis van leeftijd, week, en persoonlijke situatie?
- Bouw op de GOEDE eigenschappen van het kind
- Gebruik de affiniteiten en hobby's van het kind als middel
- Wees ZEER specifiek en gedetailleerd
- Geef concrete, uitvoerbare acties per dag
- Houd rekening met de leeftijd en ontwikkelingsniveau
- Gebruik de Tasfiya-Tazkiya-Tarbiya methode structureel
- Neem de invloed van de ouder op het kind mee (denkwijze, voelwijze, spreekwijze, doewijze)
- Gebruik de sterke punten van de ouder in het advies

TRANSLITERATIEREGELS (ALTIJD toepassen):
- Schrijf ALTIJD "Allaah" met dubbele 'a' (niet "Allah"). Bijv: Maashaa'llaah, 'Abdullaah, Bismillaah, In shaa' Allaah, SubhaanAllaah, Astaghfirullaah.
- De Arabische letter ع (ain) wordt geschreven als '3'. Bijv: 3abd, 3ilm, 3Abdullaah, 3aqiedah, 3ibaadah.
- Gebruik altijd de vaste getranslitereerde islamitische term (bijv. du3aa', dhikr, salaah, adhkaar, Soennah, tawhied) — nooit een losse, informele of verkleinwoordvorm (bijv. nooit "gebedje" of "slaapgebedje" voor adhkaar of du3aa'). Geeft de context hierboven al de eigen bewoording van een term, gebruik die bewoording.

REGEL VOOR RELIGIEUZE CITATEN (bindend, geen uitzonderingen): Citeer, parafraseer of schrijf nooit uit het geheugen een hadith of Koranvers (ayah) toe, en schrijf nooit op eigen initiatief een uitspraak toe aan de Profeet ﷺ — noch letterlijk noch naar de strekking. Gebruik uitsluitend hadith- of ayah-tekst die je letterlijk elders in deze prompt is aangereikt; is daarover niets aangereikt, geef dan algemene geloofsaanmoediging zonder een hadith of ayah te vertellen.

${SOURCE_GROUNDING_RULE.nl}

${NAME_FIDELITY_RULE.nl}

OPMAAK: Gebruik geen sterretjes (**) of andere opmaaksymbolen (markdown). Houd de tekst schoon, zonder symbolen.

KENNISBANK:
${knowledgeContext}

${mawsouahContext}

BELANGRIJK: Je MOET volledig in het Nederlands antwoorden.`;

      const userPrompt = isAr ? `أنشئ خطة أسبوعية هجينة تتضمن الوضع الكامل للوالد والطفل:

الطفل: ${input.childName}
العمر: ${input.childAge} سنوات
الجنس: ${input.childGender}
السنة في البرنامج: ${input.yearKey}
الأسبوع: ${input.weekInYear}

${parentInfo}
${environmentInfo}
${checkinContext}
${issuesContext}

قدّم خطة أسبوعية هجينة بهذا الهيكل بالضبط:

=== القسم الأول: الوالد مع نفسه ===

1. التصفية (عقل الوالد)
   - تصحيح المبادئ الخاطئة في تفكير الوالد (بناءً على دنكويزته)
   - غرس مبادئ صحيحة بديلة مع الدليل
   - 3 أهداف محددة لهذا الأسبوع

2. التزكية (قلب الوالد)
   - أعمال القلوب التي يحتاجها الوالد (بناءً على شعوره)
   - تحبيب الخير وتبغيض الشر في قلبه
   - 3 أهداف محددة لهذا الأسبوع

3. تربية اللسان (كلام الوالد)
   - تحسين كلامه مع الله (دعاء/ذكر)
   - تحسين كلامه مع الشريك والأولاد
   - 3 أهداف محددة لهذا الأسبوع

4. تربية الجوارح (سلوك الوالد)
   - تحسين عباداته اليومية (بناءً على حال صلاته)
   - تحسين أفعاله مع الشريك والأولاد
   - 3 أهداف محددة لهذا الأسبوع

=== القسم الثاني: الوالد مع ولده (${input.childName}) ===

5. التصفية لـ ${input.childName} (تشكيل عقله)
   - العقيدة المناسبة للعمر (${input.childAge} سنوات)
   - مبادئ ملموسة لغرسها في عقله
   - محادثات محددة بكلمات دقيقة
   - 4 أهداف محددة لهذا الأسبوع

6. التزكية لـ ${input.childName} (تشكيل قلبه)
   - أعمال القلوب المناسبة لعمره
   - تمارين ملموسة لإشعار قلبه
   - آيات وأحاديث محددة مع الشرح
   - 4 أهداف محددة لهذا الأسبوع

7. تربية اللسان لـ ${input.childName} (تشكيل كلامه)
   - تعليمه الأذكار والدعاء المناسب لعمره
   - تحسين كلامه مع والديه وإخوته وأصدقائه
   - 4 أهداف محددة لهذا الأسبوع

8. تربية الجوارح لـ ${input.childName} (تشكيل سلوكه)
   - أهداف سلوكية ملموسة بناءً على صفاته الجيدة
   - أفعال وعادات يومية مع استخدام هواياته وبيئته
   - 5 أهداف محددة لهذا الأسبوع

كن محددًا جدًا: اذكر مواضيع دقيقة، آيات، أحاديث، وأنشطة ملموسة.
ابنِ على الصفات الجيدة للطفل.
راعِ العلاقة بين الوالد والطفل وتأثير الوالد.

مهم جدًا:
- استخدم العناوين بالضبط كما هي ("القسم الأول: الوالد مع نفسه"، "القسم الثاني: الوالد مع ولده"، "التصفية"، "التزكية"، "تربية اللسان"، "تربية الجوارح")
- كل هدف يجب أن يحتوي على شكل عملي فريد خاص بذلك الهدف
- لا تكرر أشكالًا عامة (ليس "اقرأ معه" أو "ناقش" لكل هدف)
- اذكر النص الكامل للآيات والأحاديث في الشكل العملي فقط إن كان نصّها موجودًا حرفيًا فيما زُوّدت به من قاعدة المعرفة أعلاه؛ لا تكتب نص آية أو حديث من الذاكرة، واكتفِ بذكر اسم الموضوع أو المبدأ إن لم يكن نصّه متوفرًا لديك
- اجعل الأشكال ملموسة: من يفعل ماذا، متى، كم المدة، بأي وسيلة
- نوّع: قصص، تمثيل أدوار، رسم، مشي، طبخ، طبيعة، رياضة، إلخ.` : isEn ? `Generate a HYBRID week plan that integrally includes the full situation of parent AND child:

CHILD: ${input.childName}
AGE: ${input.childAge} years
GENDER: ${input.childGender}
YEAR IN PROGRAM: ${input.yearKey}
WEEK: ${input.weekInYear}

${parentInfo}
${environmentInfo}
${checkinContext}
${issuesContext}

Provide a HYBRID week plan in this structure:

1. ADVICE FOR THE PARENT (this week)
2. TASFIYA CHILD (forming the mind) - 4 specific goals
3. TAZKIYA CHILD (forming the heart) - 5 specific goals
4. TARBIYA CHILD (forming behavior) - 6 specific goals
5. MINDSETS FOR THE PARENT (this week)
6. DAILY SCHEDULE (Mon-Sun)

Be VERY specific: name exact topics, ayaat, ahadith, and concrete activities.
Build on the child's good qualities.
Consider the bond between parent and child.

IMPORTANT - ACTIVITIES:
- Each goal MUST have a UNIQUE activity specifically suited to THAT individual goal
- Do NOT repeat generic activities (not "read together" or "discuss" for every goal)
- Include the FULL text of an ayah or hadith in the activity (Arabic + translation) ONLY IF that exact text was already given to you in the context above — never write ayah or hadith text from memory; if no verbatim text was supplied for this topic, name the principle instead
- Make activities concrete: who does what, when, how long, with what materials
- Vary: storytelling, role-play, drawing, walking, cooking, nature, sports, etc.` : `Genereer een HYBRIDE weekplan dat de volledige situatie van ouder EN kind integraal meeneemt:

KIND: ${input.childName}
LEEFTIJD: ${input.childAge} jaar
GESLACHT: ${input.childGender}
JAAR IN PROGRAMMA: ${input.yearKey}
WEEK: ${input.weekInYear}

${parentInfo}
${environmentInfo}
${checkinContext}
${issuesContext}

Geef een HYBRIDE weekplan in deze structuur:

1. ADVIES VOOR DE OUDER ZELF (deze week)
   - Band met Allaah verbeteren: specifieke acties gebaseerd op hun huidige gebed/ibadah
   - Band met partner verbeteren: gebaseerd op hun communicatie en situatie
   - Eigen mindsets corrigeren: welke denkwijze moet bijgesteld?
   - Eigen spreekwijze verbeteren: concrete voorbeelden
   - Hoe de eigen affiniteiten inzetten voor de opvoeding

2. TASFIYA KIND (verstand vormen) - 4 specifieke doelen voor deze week
   - Begin bij 'aqiedah passend bij de leeftijd (${input.childAge} jaar)
   - Concrete mindsets om te planten
   - Specifieke gesprekken met exacte woorden/voorbeelden
   - Welke dag(en) van de week
   - Hoe de ouder dit moet brengen (rekening houdend met hun spreekwijze)

3. TAZKIYA KIND (hart vormen) - 5 specifieke doelen
   - A'maal al-quloob passend bij de leeftijd
   - Concrete oefeningen om het hart te laten voelen
   - Specifieke ayaat en ahaadieth met uitleg
   - Welke dag(en) van de week
   - Hoe de ouder dit emotioneel kan overbrengen

4. TARBIYA KIND (gedrag vormen) - 6 specifieke doelen
   - Concrete gedragsdoelen gebaseerd op de goede eigenschappen
   - Dagelijkse acties en gewoontes
   - Hoe de omgeving (school, vrienden, wijk) in te zetten
   - Hoe de hobby's en affiniteiten in te zetten
   - Welke dag(en) van de week

5. MINDSETS VOOR DE OUDER (deze week)
   - 3 mindsets die de ouder moet internaliseren
   - Hoe deze mindsets toe te passen in de interactie met het kind
   - Welke valkuilen te vermijden (gebaseerd op hun zwakke punten)

6. DAGSCHEMA (ma t/m zo)
   - Per dag: wat moet de ouder doen met het kind?
   - Concrete tijdstippen en activiteiten
   - Rekening houdend met de dagstructuur van het kind

Wees ZEER specifiek: noem exacte onderwerpen, ayaat, ahaadieth, en concrete activiteiten.
Bouw op de goede eigenschappen van het kind.
Houd rekening met de band tussen ouder en kind en de invloed van de ouder.

BELANGRIJK - WERKVORMEN:
- Elk doel MOET een UNIEKE werkvorm hebben die specifiek past bij DAT ene doel
- GEEN generieke werkvormen herhalen (niet "lees samen" of "bespreek" voor elk doel)
- Geef de VOLLEDIGE tekst van een ayah of hadith in de werkvorm (Arabisch + vertaling) ALLEEN als die letterlijke tekst je al is aangereikt in de context hierboven — schrijf nooit ayah- of hadith-tekst uit het geheugen; is er geen letterlijke tekst aangereikt voor dit onderwerp, noem dan alleen het principe
- Maak werkvormen concreet: wie doet wat, wanneer, hoe lang, met welk materiaal
- Varieer: verhalen vertellen, rollenspel, tekenen, wandeling, kookactiviteit, natuur, sport, etc.`;

      const result = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });

      const content = result.choices[0]?.message?.content;
      let plan = typeof content === "string" ? content : Array.isArray(content) ? content.map((c: any) => "text" in c ? c.text : "").join("") : "";

      // Post-process Arabic weekplan to remove Dutch transliterations
      if (isAr) {
        plan = sanitizeArabicText(plan);
      } else {
        plan = correctTranscription(plan, isEn ? "en" : "nl");
      }
      plan = stripMarkdownEmphasis(plan);

      return { plan };
    }),

  generateTreatmentPlan: publicProcedure
    .input(z.object({
      childName: z.string(),
      childAge: z.string(),
      childGender: z.string(),
      yearKey: z.string(),
      weekInYear: z.number(),
      issue: z.string(),
      language: z.string().optional(),
      environment: environmentSchema,
      parentProfile: parentProfileSchema,
      mode: z.enum(["questions", "plan", "refine_question", "check_root_cause"]).optional(),
      analyticalQA: z.array(z.object({ question: z.string(), answer: z.string() })).optional(),
      currentQuestions: z.array(z.string()).optional(),
      currentAnswers: z.array(z.string()).optional(),
      questionIndex: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const lang = input.language || "nl";
      const isEn = lang === "en";
      const isAr = lang === "ar";

      // MODE: questions - generate FIRST diagnostic question (consultant-style, one at a time)
      if (input.mode === "questions") {
        // Build environment context if available
        const envInfo = buildFullEnvironmentInfo(input.environment, lang);
        const hasEnv = input.environment && Object.keys(input.environment).some(k => k !== "childId" && (input.environment as any)[k]);
        
        const questionPrompt = isAr
          ? `أنت مستشار تربوي إسلامي متخصص في التشخيص التدريجي. والد يصف مشكلة مع طفله "${input.childName}" (${input.childAge}):

"${input.issue}"

${hasEnv ? `=== معلومات بيئة الطفل المتوفرة ===\n${envInfo}\n\nاستخدم هذه المعلومات في تحليلك. لا تسأل عن معلومات موجودة أعلاه.` : `تنبيه: لم يُملأ تحليل بيئة الطفل بعد. ذكّر الوالد بأهمية ملء تحليل البيئة للحصول على تشخيص أدق، ثم اطرح سؤالك.`}

مهمتك: اطرح سؤالاً تشخيصياً واحداً فقط.

قواعد:
- سؤال واحد فقط في كل مرة (لا تطرح أكثر من سؤال)
- السؤال يجب أن يكون مباشراً ومحدداً
- لا يقبل إجابة "نعم/لا" فقط بل يتطلب شرحاً مفصلاً
- ابدأ بالسؤال عن مكان الإشكال: هل هو في عقل الطفل (تفكيره ومعتقداته) أم قلبه (مشاعره وتعلقه بالله) أم لسانه أم جوارحه
- اكتب بالعربية الفصحى فقط. لا تستخدم أي كلمة هولندية أو إنجليزية.
- ${NAME_FIDELITY_RULE.ar}
- ${SOURCE_GROUNDING_RULE.ar}

أعد JSON object بمفتاح "question" يحتوي على السؤال الأول فقط.`
          : isEn
          ? `You are an Islamic parenting advisor specialized in gradual diagnosis. A parent describes a problem with their child "${input.childName}" (${input.childAge}):

"${input.issue}"

${hasEnv ? `=== Available child environment info ===\n${envInfo}\n\nUse this information in your analysis. Do not ask about info already provided above.` : `Note: Child environment analysis has not been filled in yet. Remind the parent about the importance of filling it in for better diagnosis, then ask your question.`}

Your task: Ask ONE diagnostic question only.

Rules:
- Only ONE question at a time
- Must be direct and specific
- Cannot be answered with just "yes/no" - requires detailed explanation
- Start by asking where the problem lies: child's mind (thinking/beliefs), heart (feelings/connection to Allah), tongue, or limbs
- ${NAME_FIDELITY_RULE.en}
- ${SOURCE_GROUNDING_RULE.en}

Return a JSON object with key "question" containing only the first question.`
          : `Je bent een islamitische opvoedingsadviseur gespecialiseerd in geleidelijke diagnose. Een ouder beschrijft een probleem met hun kind "${input.childName}" (${input.childAge}):

"${input.issue}"

${hasEnv ? `=== Beschikbare omgevingsinfo kind ===\n${envInfo}\n\nGebruik deze informatie in je analyse. Vraag niet naar info die hierboven al staat.` : `Let op: De omgevingsanalyse van het kind is nog niet ingevuld. Herinner de ouder aan het belang hiervan voor een betere diagnose, en stel dan je vraag.`}

Je taak: Stel ÉÉN diagnostische vraag.

Regels:
- Slechts ÉÉN vraag per keer
- Moet direct en specifiek zijn
- Kan niet met alleen "ja/nee" beantwoord worden - vereist gedetailleerde uitleg
- Begin met vragen waar het probleem zit: verstand (denken/overtuigingen), hart (gevoelens/band met Allah), tong, of ledematen
- ${NAME_FIDELITY_RULE.nl}
- ${SOURCE_GROUNDING_RULE.nl}

Retourneer een JSON object met sleutel "question" met alleen de eerste vraag.`;

        const qResult = await invokeLLM({
          messages: [
            { role: "user", content: questionPrompt },
          ],
          response_format: { type: "json_object" },
        });

        const rawContent = qResult.choices[0]?.message?.content;
        const qContent: string = typeof rawContent === "string" ? rawContent : Array.isArray(rawContent) ? rawContent.map((c: any) => "text" in c ? c.text : "").join("") : "";
        try {
          const parsed = JSON.parse(qContent);
          // Extract single question - may be in different formats
          let firstQuestion: string = "";
          if (typeof parsed === "string") {
            firstQuestion = parsed;
          } else if (Array.isArray(parsed)) {
            firstQuestion = typeof parsed[0] === "string" ? parsed[0] : (parsed[0]?.question || parsed[0]?.text || Object.values(parsed[0] || {})[0] || "");
          } else if (parsed.question) {
            firstQuestion = typeof parsed.question === "string" ? parsed.question : String(Object.values(parsed.question)[0] || "");
          } else if (parsed.questions && Array.isArray(parsed.questions)) {
            const q = parsed.questions[0];
            firstQuestion = typeof q === "string" ? q : (q?.question || q?.text || Object.values(q || {})[0] || "");
          } else {
            firstQuestion = String(Object.values(parsed)[0] || "");
          }
          firstQuestion = String(firstQuestion).trim();
          if (firstQuestion.length > 5) {
            return { questions: [firstQuestion] };
          }
          // Fallback
          return { questions: [isAr ? "صف لي بالتفصيل: متى بدأت هذه المشكلة وما الذي تغيّر في حياة طفلك قبلها مباشرة؟" : isEn ? "Describe in detail: when did this problem start and what changed in your child's life just before?" : "Beschrijf in detail: wanneer begon dit probleem en wat veranderde er in het leven van uw kind vlak daarvoor?"] };
        } catch {
          return { questions: [isAr ? "صف لي بالتفصيل: متى بدأت هذه المشكلة وما الذي تغيّر في حياة طفلك قبلها مباشرة؟" : isEn ? "Describe in detail: when did this problem start and what changed in your child's life just before?" : "Beschrijf in detail: wanneer begon dit probleem en wat veranderde er in het leven van uw kind vlak daarvoor?"] };
        }
      }

      // MODE: refine_question - adapt next question based on previous answers
      if (input.mode === "refine_question" && input.currentQuestions && input.currentAnswers && input.questionIndex !== undefined) {
        const prevQA = input.currentQuestions.slice(0, input.questionIndex).map((q, i) => 
          `Q: ${q}\nA: ${input.currentAnswers![i] || "(no answer)"}`
        ).join("\n\n");
        
        const refinePrompt = isAr
          ? `أنت مستشار تربوي إسلامي متخصص في التشخيص. والد يصف مشكلة مع طفله "${input.childName}" (${input.childAge}):
"المشكلة: ${input.issue}"

الأسئلة والإجابات السابقة:
${prevQA}

مهمتك:
1. حلّل الإجابة الأخيرة للوالد: ما الذي كشفته؟ ما الذي لا يزال غامضاً؟
2. حدّد الجانب الأهم الذي يحتاج إلى توضيح بناءً على ما قاله الوالد.
3. اطرح سؤالاً واحداً مبنياً مباشرةً على إجابة الوالد الأخيرة (ليس سؤالاً عشوائياً).

قواعد السؤال:
- يجب أن يرتبط السؤال الجديد بما ذكره الوالد في إجابته الأخيرة (ابدأ السؤال بـ "ذكرت أن..." أو "بما أنك قلت..." أو "عندما تقول...")
- لا تكرر سؤالاً سبق طرحه
- السؤال يجب أن يكشف عن سبب أو سياق أو علاقة لم تُكشف بعد
- السؤال يجب أن يكون مباشراً ولا يقبل "نعم/لا" فقط بل يتطلب شرحاً مفصلاً
- هدفك النهائي: الوصول إلى جذر المشكلة بشكل قاطع (ليس احتمالات)
- اكتب بالعربية الفصحى فقط. لا تستخدم أي كلمة هولندية أو إنجليزية.
- ${NAME_FIDELITY_RULE.ar}
- ${SOURCE_GROUNDING_RULE.ar}

أعد JSON object بمفتاح "question" يحتوي على السؤال فقط.`
          : isEn
          ? `You are an Islamic parenting advisor specialized in diagnosis. A parent describes a problem with their child "${input.childName}" (${input.childAge}):
"Problem: ${input.issue}"

Previous Q&A:
${prevQA}

Your task:
1. Analyze the parent's LAST answer: what did it reveal? What remains unclear?
2. Identify the most important aspect that needs clarification based on what the parent said.
3. Ask ONE question that directly builds on the parent's last answer (not a random question).

Rules:
- The new question MUST reference what the parent said (start with "You mentioned that..." or "Since you said...")
- Don't repeat previously asked questions
- The question should reveal a cause, context, or relationship not yet uncovered
- ${NAME_FIDELITY_RULE.en}
- ${SOURCE_GROUNDING_RULE.en}

Return a JSON object with key "question" containing only the question.`
          : `Je bent een islamitische opvoedingsadviseur gespecialiseerd in diagnose. Een ouder beschrijft een probleem met hun kind "${input.childName}" (${input.childAge}):
"Probleem: ${input.issue}"

Eerdere vragen en antwoorden:
${prevQA}

Je taak:
1. Analyseer het LAATSTE antwoord van de ouder: wat onthulde het? Wat blijft onduidelijk?
2. Identificeer het belangrijkste aspect dat verduidelijking nodig heeft op basis van wat de ouder zei.
3. Stel ÉÉN vraag die direct voortbouwt op het laatste antwoord (geen willekeurige vraag).

Regels:
- De nieuwe vraag MOET verwijzen naar wat de ouder zei (begin met "U noemde dat..." of "Aangezien u zei...")
- Herhaal geen eerder gestelde vragen
- De vraag moet een oorzaak, context of relatie onthullen die nog niet is ontdekt
- ${NAME_FIDELITY_RULE.nl}
- ${SOURCE_GROUNDING_RULE.nl}

Retourneer een JSON object met sleutel "question" met alleen de vraag.`;

        try {
          const refineResult = await invokeLLM({
            messages: [{ role: "user", content: refinePrompt }],
            response_format: { type: "json_object" },
          });
          const rawRef = refineResult.choices[0]?.message?.content;
          const refContent: string = typeof rawRef === "string" ? rawRef : Array.isArray(rawRef) ? rawRef.map((c: any) => "text" in c ? c.text : "").join("") : "";
          const parsed = JSON.parse(refContent);
          let refinedQuestion = parsed.question || parsed.vraag || Object.values(parsed)[0] || "";
          // Ensure it's a plain string
          if (typeof refinedQuestion === "object" && refinedQuestion !== null) {
            refinedQuestion = (refinedQuestion as any).question || (refinedQuestion as any).text || Object.values(refinedQuestion)[0] || "";
          }
          return { refinedQuestion: String(refinedQuestion) };
        } catch {
          return { refinedQuestion: input.currentQuestions[input.questionIndex] };
        }
      }

      // MODE: check_root_cause - evaluate if enough info has been gathered for a definitive diagnosis
      if (input.mode === "check_root_cause" && input.currentQuestions && input.currentAnswers) {
        const allQA = input.currentQuestions.map((q, i) => 
          `Q: ${q}\nA: ${input.currentAnswers![i] || "(no answer)"}`
        ).join("\n\n");
        
        const checkPrompt = isAr
          ? `أنت مستشار تربوي إسلامي متخصص في التشخيص. والد يصف مشكلة مع طفله "${input.childName}" (${input.childAge}):
"المشكلة: ${input.issue}"

الأسئلة والإجابات حتى الآن:
${allQA}

مهمتك: قيّم هل المعلومات المتوفرة كافية لتحديد جذر المشكلة بشكل قاطع (وليس احتمالات).

معايير الكفاية:
- هل نعرف أين الإشكال بالضبط (عقل أم قلب أم لسان أم جوارح)؟
- هل نعرف السبب الحقيقي وراء السلوك (وليس فقط الأعراض)؟
- هل نعرف دور الوالد في المشكلة؟
- هل نعرف البيئة المحيطة وتأثيرها؟

${NAME_FIDELITY_RULE.ar}

${SOURCE_GROUNDING_RULE.ar}

إذا كانت المعلومات كافية: أعد {"rootCauseFound": true, "rootCause": "وصف مختصر لجذر المشكلة"}
إذا كانت غير كافية: أعد {"rootCauseFound": false, "missingInfo": "ما الذي نحتاج معرفته بعد", "nextQuestion": "سؤال واحد يكشف المعلومة المفقودة"}`
          : isEn
          ? `You are an Islamic parenting advisor specialized in diagnosis. A parent describes a problem with their child "${input.childName}" (${input.childAge}):
"Problem: ${input.issue}"

Questions and answers so far:
${allQA}

Your task: Evaluate whether the available information is sufficient to definitively identify the root cause (not possibilities).

Sufficiency criteria:
- Do we know exactly where the problem lies (mind, heart, tongue, or limbs)?
- Do we know the real cause behind the behavior (not just symptoms)?
- Do we know the parent's role in the problem?
- Do we know the surrounding environment and its influence?

${NAME_FIDELITY_RULE.en}

${SOURCE_GROUNDING_RULE.en}

If sufficient: return {"rootCauseFound": true, "rootCause": "brief description of root cause"}
If insufficient: return {"rootCauseFound": false, "missingInfo": "what we still need to know", "nextQuestion": "one question to uncover the missing info"}`
          : `Je bent een islamitische opvoedingsadviseur gespecialiseerd in diagnose. Een ouder beschrijft een probleem met hun kind "${input.childName}" (${input.childAge}):
"Probleem: ${input.issue}"

Vragen en antwoorden tot nu toe:
${allQA}

Je taak: Beoordeel of de beschikbare informatie voldoende is om de grondoorzaak definitief vast te stellen (geen mogelijkheden).

Criteria:
- Weten we precies waar het probleem zit (verstand, hart, tong, of ledematen)?
- Kennen we de echte oorzaak achter het gedrag (niet alleen symptomen)?
- Kennen we de rol van de ouder in het probleem?
- Kennen we de omgeving en haar invloed?

${NAME_FIDELITY_RULE.nl}

${SOURCE_GROUNDING_RULE.nl}

Als voldoende: return {"rootCauseFound": true, "rootCause": "korte beschrijving"}
Als onvoldoende: return {"rootCauseFound": false, "missingInfo": "wat we nog moeten weten", "nextQuestion": "één vraag om de ontbrekende info te onthullen"}`;

        try {
          const checkResult = await invokeLLM({
            messages: [{ role: "user", content: checkPrompt }],
            response_format: { type: "json_object" },
          });
          const rawCheck = checkResult.choices[0]?.message?.content;
          const checkContent: string = typeof rawCheck === "string" ? rawCheck : Array.isArray(rawCheck) ? rawCheck.map((c: any) => "text" in c ? c.text : "").join("") : "";
          const parsed = JSON.parse(checkContent);
          // Ensure nextQuestion is always a plain string
          let nextQ = parsed.nextQuestion || null;
          if (nextQ && typeof nextQ === "object") {
            nextQ = (nextQ as any).question || (nextQ as any).text || Object.values(nextQ)[0] || null;
          }
          if (nextQ) nextQ = String(nextQ);
          return {
            rootCauseFound: !!parsed.rootCauseFound,
            rootCause: parsed.rootCause ? String(parsed.rootCause) : null,
            missingInfo: parsed.missingInfo ? String(parsed.missingInfo) : null,
            nextQuestion: nextQ,
          };
        } catch {
          // If parsing fails, assume we need more info
          return {
            rootCauseFound: false,
            rootCause: null,
            missingInfo: null,
            nextQuestion: null,
          };
        }
      }

      // MODE: plan (default) - generate full treatment plan
      const ageYears = parseInt(input.childAge) || 5;
      const treatmentContext = buildTreatmentContext(input.yearKey, ageYears, input.issue, lang);
      const mawsouahContext = getMawsouahContext("treatment", lang);
      const parentInfo = buildFullParentInfo(input.parentProfile, lang);
      const environmentInfo = buildFullEnvironmentInfo(input.environment, lang);
      const checkinContext = await getOwnCheckinContext(ctx.user?.id, isAr ? "ar" : isEn ? "en" : "nl");

      // If we have analytical Q&A, append it to the issue
      let enrichedIssue = input.issue;
      if (input.analyticalQA && input.analyticalQA.length > 0) {
        const qaText = input.analyticalQA
          .filter(qa => qa.answer.trim())
          .map(qa => `${isAr ? "س" : isEn ? "Q" : "V"}: ${qa.question}\n${isAr ? "ج" : isEn ? "A" : "A"}: ${qa.answer}`)
          .join("\n\n");
        enrichedIssue = `${input.issue}\n\n${isAr ? "إجابات الوالد على الأسئلة التحليلية" : isEn ? "Parent's answers to analytical questions" : "Antwoorden van de ouder op analytische vragen"}:\n${qaText}`;
      }

      const systemPrompt = isAr ? `أنت مستشار تربوي إسلامي ومعالج متخصص في برنامج "علم الأسرة الإسلامي" (فبراير 2022 - يونيو 2025).

المنهجية:

الخطوات الـ 11 للتربية:
1. إنشاء رابطة الإيمان عند المربّي والمتربّي
2. إنشاء رابطة تربوية
3. تقييم وخلق الفرص
4. وضع أهداف تربوية عامة وخاصة
5. إعداد المتربّي
6. بدء التربية بالتعليم
7. تعزيز/تثبيت أهداف التربية
8. مراقبة التربية
9. التقييم
10. تحسين العادات
11. التكرار والتثبيت

التصفية-التزكية-التربية (المنهج الأساسي للعلاج):
- التصفية: فحص العقل → تمييز جيد/سيئ → إزالة المبادئ السيئة → غرس الجيد → تفعيل
- التزكية: فحص القلب → إشعار → تبغيض السيئ → تحبيب الجيد → تدريب القلب
- التربية: تحليل الأفعال → تمييز → ترك السيئ → توبة + عادات جديدة → ممارسة الجيد

خطوات تصحيح الخطأ الخمس:
1. التعليم: 21+ طريقة لنقل المعرفة
2. التذكير: تذكير الطفل بما يعلمه
3. الموعظة: مخاطبة القلب بلين
4. الزجر: الحزم عند الحاجة
5. العقاب: كملاذ أخير، مشروع إسلاميًا

الأركان الثلاثة:
1. الهدف (رضا الله)
2. طريق واحد (القرآن والسنة)
3. القيادة (الهيكلة والتراتبية)

مبادئ العلاج الهجين:
- العلاج هجين: يجمع ما يجب على الوالد تغييره + ما يحتاجه الطفل
- ابدأ دائمًا بالعقيدة — أساس كل علاج
- أولًا: ما تأثير الوالد (تفكير/شعور/كلام/سلوك) على هذه المشكلة؟
- مبدأ: "كل التربية مبنية على تربية العقيدة، هي تعطي الأساس والتوجيه والهيكلة"
- استخدم منهجًا هجينًا: اجمع الخطوات الخمس مع التصفية-التزكية-التربية
- ابنِ على الصفات الجيدة للطفل
- استخدم الميول والهوايات كوسيلة في العلاج
- كن دقيقًا جدًا ومفصّلًا
- راعِ الوقت اللازم
- أعطِ جدولًا زمنيًا واقعيًا
- مبدأ: "أولًا أزِل السبب السيئ ثم اغرس الجيد"
- مبدأ: "إن لم تعرف الهيكلة لا تعرف أين الخلل وأي المسامير تديرها"
- ضمّن الوضع الأسري الكامل: الوالدان، الشريك، المدرسة، الأصدقاء، الحي، الإعلام

قاعدة المعرفة:
${treatmentContext}

${mawsouahContext}

قواعد إلزامية صارمة (يجب تطبيقها بدون استثناء):
- يُحظر استخدام أي مصطلح من علم النفس الغربي أو الفلسفة أو البوذية أو الهندوسية أو العصر الجديد أو التربية الغربية. استخدم البدائل الإسلامية فقط: الروحانية→الإيمان، الذكاء العاطفي→الحلم وحسن الخلق، الاكتئاب→الحزن وضيق الصدر، التنمر→الظلم والإيذاء، الثقة بالنفس→الثقة بالله ثم بالنفس، إدارة الغضب→كظم الغيظ، التربية الإيجابية→التربية بالحب والحزم، النرجسية→الكبر والعجب، الفوبيا→الخوف الشديد، التأمل→التفكر والتدبر، قانون الجذب→الدعاء والأخذ بالأسباب.
- يجب أن تردّ بالكامل باللغة العربية الفصحى. لا تستخدم الهولندية أو الإنجليزية أو أي حروف لاتينية.
- إذا أجاب الوالد بالهولندية: ترجم إجابته بالكامل إلى العربية الفصحى. لا تنقل الكلمات الهولندية بحروف عربية (لا تكتب "بلي" بدلاً من "مبتهج"، ولا "إيرليك" بدلاً من "صادق"، ولا "جيهورزام" بدلاً من "مطيع"، ولا "سوسيال" بدلاً من "اجتماعي"). ترجم المعنى وليس الصوت.
- إذا وردت عبارات هولندية في السياق أو إجابات الوالد (مثل: "blij"، "eerlijk"، "sociaal"، "leergierig"، "speelt graag met Lego"): ترجمها بالكامل إلى العربية ("مبتهج"، "صادق"، "اجتماعي"، "محب للتعلم"، "يحب اللعب بالليجو"). لا تضع الكلمة الهولندية بين قوسين ولا تكتبها بحروف عربية.
- اكتب "الله" وليس "Allaah". اكتب "ما شاء الله" وليس "Maashaa'llaah". اكتب "بسم الله" وليس "Bismillaah". اكتب "سبحان الله" وليس "SubhaanAllaah".
- اكتب أسماء الأطفال بالعربية كما هي (عبد الرؤوف، عبد الله، عبد الرحيم، محمد، صفية، زينب، مهدية). لا تكتب "3Abd-ur-Ra'oof" أو أي شكل لاتيني أبدًا.
- لا تستخدم أرقامًا بدل الحروف العربية (لا تكتب 3 بدل ع).
- لا تقل "تصفية الطفل" بل قل "التصفية لـ [اسم الطفل]".
- لا تستخدم النجوم (**) أو أي رموز تنسيق (markdown). اجعل النص نظيفًا بدون رموز.
- قاعدة الاستشهاد الديني (ملزمة بلا استثناء): يُحظر منعًا باتًا الاستشهاد بأي حديث نبوي أو آية قرآنية من الذاكرة، أو نسبة أي قول إلى النبي ﷺ من تلقاء نفسك، نصًا أو معنى. لا تستخدم إلا نصّ حديث أو آية ورد لك حرفيًا في موضع آخر من هذا النص؛ فإن لم يرد نص يخص هذا الموضوع، فقدّم التشجيع الإيماني بعبارات عامة دون سرد أي حديث أو آية.
- ${SOURCE_GROUNDING_RULE.ar}
- ${NAME_FIDELITY_RULE.ar}
- رتّب المحتوى ترتيبًا منطقيًا واضحًا.` : isEn ? `You are an Islamic parenting advisor and therapist specialized in the "Islamic Family Science" program (Feb 2022 - June 2025).

METHODOLOGY (from the primary source):

THE 11 STEPS OF PARENTING:
1. Creating the Al-Eemaan bond in both educator and the one being raised
2. Creating a parenting bond
3. Assessing and creating opportunities
4. Setting general and specific parenting goals
5. Preparing the one being raised
6. Beginning to educate through teaching
7. Strengthening/reinforcing parenting goals
8. Monitoring the upbringing
9. Evaluating
10. Improving habits
11. Repetition and consolidation

TASFIYA-TAZKIYA-TARBIYA (the core treatment method):
- TASFIYA: Scan mind → distinguish good/bad → remove bad mindsets → plant good → activate
- TAZKIYA: Scan heart → make feel → make bad abhorrent → make good beloved → train heart
- TARBIYA: Analyze deeds → distinguish → unlearn bad → tawbah + new habits → practice good deeds

FIVE STEPS OF ERROR CORRECTION:
1. التعليم (Ta'leem) - Teaching: 21+ methods to transfer knowledge
2. التذكير (Tadhkeer) - Reminding: remind the child of what they already know
3. الموعظة (Maw'idhah) - Admonition: addressing the heart with gentleness
4. الزجر (Zajr) - Rebuke: speaking more firmly when needed
5. العقاب ('Iqaab) - Punishment: as a last resort, Islamically justified

THREE PILLARS:
1. The Goal (Allaah's pleasure)
2. One path (Qur’aan and Sunnah)
3. Leadership (structure and hierarchy)

HYBRID TREATMENT PRINCIPLES:
- The treatment is HYBRID: it combines what the PARENT must change + what the CHILD needs
- ALWAYS start with 'aqeedah — the foundation of every treatment
- FIRST analyze: what influence does the parent (thinking/feeling/speaking/doing) have on this problem?
- Mindset: "All upbringing is based on aqeedah education, it provides foundation, direction and structure"
- Use a HYBRID approach: combine the five steps with Tasfiya-Tazkiya-Tarbiya
- Build on the GOOD qualities of the child
- Use affinities and hobbies as a means in treatment
- Be VERY precise and detailed
- Consider the time needed
- Give a realistic timeline
- Mindset: "First remove the bad cause and then plant the good"
- Mindset: "If you don't know the structure you don't know where it goes wrong and which screws to turn"
- Include the full family situation: parents, partner, school, friends, neighborhood, media

TRANSLITERATION RULES (ALWAYS apply):
- ALWAYS write "Allaah" with double 'a' (not "Allah"). E.g.: Maashaa'llaah, 'Abdullaah, Bismillaah, In shaa' Allaah, SubhaanAllaah, Astaghfirullaah.
- The Arabic letter ع (ain) is written as '3'. E.g.: 3abd, 3ilm, 3Abdullaah, 3aqeedah, 3ibaadah.
- Always use the established transliterated Islamic term (e.g. du'aa, dhikr, salaah, adhkaar, Sunnah, tawheed) — never a loose, colloquial, or diminutive rendering (e.g. never "little prayer" for adhkaar or du'aa). Where the context provided above already gives a term's own wording, use that exact wording.

SCRIPTURE CITATION RULE (binding, no exceptions): Never quote, paraphrase, or attribute any hadith or Qur'anic ayah from memory, and never attribute any saying to the Prophet ﷺ on your own initiative — whether by exact wording or by meaning. Only use hadith or ayah text that was given to you verbatim elsewhere in this prompt; if none was given for this topic, give religious encouragement in general terms without narrating any hadith or ayah.

${SOURCE_GROUNDING_RULE.en}

${NAME_FIDELITY_RULE.en}

FORMATTING: Do not use asterisks (**) or any markdown formatting symbols. Keep the text clean, with no symbols.

KNOWLEDGE BASE:
${treatmentContext}

${mawsouahContext}

IMPORTANT: You MUST respond ENTIRELY in English. Do not use any Dutch.` : `Je bent een islamitische opvoedingsadviseur en behandelaar gespecialiseerd in het programma "Islamitische Gezinskunde" (feb 2022 - juni 2025).

METHODOLOGIE (uit de primaire bron):

DE 11 STAPPEN VAN OPVOEDING:
1. Al-Iemaan band creëren bij zowel opvoeder als degene die opgevoed wordt
2. Het creëren van opvoedingsband
3. Het beoordelen en creëren van kansen
4. Opstellen van algemene en specifieke opvoedingsdoelen
5. Het voorbereiden van degene die opgevoed wordt
6. Het beginnen met opvoeden middels onderwijs
7. Het versterken/bekrachtigen van de opvoedingsdoelen
8. Het monitoren van de opvoeding
9. Het evalueren
10. Het verbeteren van gewoontes
11. Herhaling en consolidatie

TASFIYA-TAZKIYA-TARBIYA (de kernmethode voor behandeling):
- TASFIYA: Verstand scannen → verschil goed/slecht → slechte mindsets verwijderen → goede planten → activeren
- TAZKIYA: Hart scannen → laten voelen → slechte verafschuwen → goede liefhebben → hart trainen
- TARBIYA: Daden analyseren → verschil maken → slechte afleren → tawba + nieuwe gewoontes → goede daden praktiseren

VIJF STAPPEN FOUTCORRECTIE:
1. التعليم (Ta'liem) - Onderwijzen: 21+ methoden om kennis over te dragen
2. التذكير (Tadhkier) - Herinneren: het kind herinneren aan wat het al weet
3. الموعظة (Maw'idhah) - Vermaning: het hart aanspreken met zachtheid
4. الزجر (Zajr) - Berisping: strenger aanspreken wanneer nodig
5. العقاب ('Iqaab) - Straf: als laatste redmiddel, islamitisch verantwoord

DRIE PILAREN:
1. Het Doel (tevredenheid van Allaah)
2. Eén pad (Koraan en Sunnah)
3. Leiderschap (structuur en hiërarchie)

HYBRIDE BEHANDELPRINCIPES:
- De behandeling is HYBRIDE: het combineert wat de OUDER moet veranderen + wat het KIND nodig heeft
- Begin ALTIJD bij de 'aqiedah — het fundament van elke behandeling
- EERST analyseren: welke invloed heeft de ouder (denkwijze/voelwijze/spreekwijze/doewijze) op dit probleem?
- Mindset: "Alle opvoedingen zijn gebaseerd op de aqidah opvoeding, deze geeft basis, sturing en structuur"
- Gebruik een HYBRIDE aanpak: combineer de vijf stappen met Tasfiya-Tazkiya-Tarbiya
- Bouw op de GOEDE eigenschappen van het kind
- Gebruik de affiniteiten en hobby's als middel in de behandeling
- Wees ZEER precies en gedetailleerd
- Houd rekening met de tijd die nodig is
- Geef een realistisch tijdschema
- Mindset: "Eerst de slechte oorzaak verwijderen en dan het goede planten"
- Mindset: "Als je de structuur niet kent weet je niet waar het verkeerd gaat en aan welke schroeven jij moet draaien"
- Neem de volledige gezinssituatie mee: ouders, partner, school, vrienden, wijk, media

TRANSLITERATIEREGELS (ALTIJD toepassen):
- Schrijf ALTIJD "Allaah" met dubbele 'a' (niet "Allah"). Bijv: Maashaa'llaah, 'Abdullaah, Bismillaah, In shaa' Allaah, SubhaanAllaah, Astaghfirullaah.
- De Arabische letter ع (ain) wordt geschreven als '3'. Bijv: 3abd, 3ilm, 3Abdullaah, 3aqiedah, 3ibaadah.
- Gebruik altijd de vaste getranslitereerde islamitische term (bijv. du3aa', dhikr, salaah, adhkaar, Soennah, tawhied) — nooit een losse, informele of verkleinwoordvorm (bijv. nooit "gebedje" of "slaapgebedje" voor adhkaar of du3aa'). Geeft de context hierboven al de eigen bewoording van een term, gebruik die bewoording.

REGEL VOOR RELIGIEUZE CITATEN (bindend, geen uitzonderingen): Citeer, parafraseer of schrijf nooit uit het geheugen een hadith of Koranvers (ayah) toe, en schrijf nooit op eigen initiatief een uitspraak toe aan de Profeet ﷺ — noch letterlijk noch naar de strekking. Gebruik uitsluitend hadith- of ayah-tekst die je letterlijk elders in deze prompt is aangereikt; is daarover niets aangereikt, geef dan algemene geloofsaanmoediging zonder een hadith of ayah te vertellen.

${SOURCE_GROUNDING_RULE.nl}

${NAME_FIDELITY_RULE.nl}

OPMAAK: Gebruik geen sterretjes (**) of andere opmaaksymbolen (markdown). Houd de tekst schoon, zonder symbolen.

KENNISBANK:
${treatmentContext}

${mawsouahContext}

BELANGRIJK: Je MOET volledig in het Nederlands antwoorden.`;

      const userPrompt = isAr ? `أنشئ خطة علاج هجينة للمشكلة التالية:

الطفل: ${input.childName}
العمر: ${input.childAge} سنوات
الجنس: ${input.childGender}
السنة في البرنامج: ${input.yearKey}، الأسبوع: ${input.weekInYear}

المشكلة (كما ذكرها الوالد):
${enrichedIssue}

${parentInfo}
${environmentInfo}
${checkinContext}

أنشئ خطة علاج هجينة ومحددة بالترتيب التالي بالضبط:

1. تشخيص المشكلة (تشخيص قاطع وليس احتمالات)
   قاعدة صارمة: لا تقل "يمكن أن يكون" أو "ربما" أو "من المحتمل". بناءً على إجابات الوالد، حدّد الجذر الحقيقي للمشكلة بشكل قاطع.
   - الجذر الحقيقي للمشكلة هو: [حدّد بوضوح وقطعية]
   - حلّل المشكلة من منهج التصفية-التزكية-التربية
   - أين الإشكال بالتحديد: عقل الطفل (طريقة تفكيره) أم قلبه (محبته/بغضه/أعمال قلبه: التوكل، القبول، الإخلاص، الصبر، الرضا) أم لسانه أم جوارحه؟ اختر واحداً فقط وبرّر.
   - ما الخير الموجود عند الطفل (لنبني عليه)
   - ما الأداة المناسبة للبدء: تعليم إقناعي أم تذكير أم وعظ أم زجر أم عقاب — اختر واحدة فقط وبرّر.
   - كيف يرتبط بالعمر (${input.childAge} سنوات)؟
   - تأثير الوالد نفسه على هذه المشكلة (كن صريحاً ومحدداً)

2. مهام الوالد - التربية البعيدة المدى
   تمهيد: (اربط العلاج بالتشخيص - اشرح لماذا هذه الخطوات بالذات بناءً على التشخيص)
   تصفية (تصحيح عقل الوالد):
   - أي مبادئ خاطئة يزيلها من نفسه؟
   - أي مبادئ صحيحة يغرسها؟
   تزكية (تصحيح قلب الوالد):
   - أي مشاعر يوجّهها؟
   - صلته بالله وبالشريك
   تربية (تصحيح سلوك الوالد):
   - كيف يتكلم مع الطفل بشكل مختلف؟
   - أي أفعال يغيّر؟
   - كيف يعلّق كل شيء بالله في كلامه مع الطفل؟

3. مهام الوالد - التربية القصيرة المدى
   (تنبيه: التربية القصيرة المدى مبنية على التربية الطويلة المدى — بدونها لن تفلح)
   - خطوات تصحيح الخطأ الخمس:
     التعليم: ماذا يتعلم الطفل؟
     التذكير: كيف تذكّر الطفل؟ ما المحفزات؟
     الموعظة: أي موعظة تناسب؟ (فقط إن لزم)
     الزجر: أي زجر؟ (فقط إن لزم)
     العقاب: أي عقاب؟ (فقط كملاذ أخير، مشروع إسلاميًا)

4. مهام الابن/البنت
   تمهيد: (اربط العلاج بالتشخيص)
   تصفية (تصحيح عقل الطفل):
   - أي مبادئ سيئة تُزال؟
   - أي مبادئ جيدة تُغرس؟
   - محادثات ملموسة (كلمات وأمثلة دقيقة)
   تزكية (تصحيح قلب الطفل):
   - أي مشاعر تُغيّر؟
   - كيف تبغّض السيئ وتحبّب الجيد؟
   تربية (تصحيح سلوك الطفل):
   - أي أفعال/أقوال تتوقف؟
   - أي عادات جديدة تُعلّم؟
   - أفعال يومية ملموسة

5. الجدول الزمني والتقييم
   - الأسبوع 1-2: أفعال محددة للوالد والطفل
   - الأسبوع 3-4: أفعال محددة
   - معايير التقييم والانتقال للمرحلة التالية

قاعدة التعليق بالله (تُطبَّق في كل كلام الوالد مع الطفل):
- علّق كل شيء بالله: "الله راضٍ عنك"، "الله لم يرضَ عن هذا"، "الله هو الذي هدانا"، "الله هو الذي أنعم علينا"
- الخيار السيئ = طاعة للشيطان ولهواه
- النعم تأتي من عند الله → يشكر الله عليها
- المعاصي = خيارات لا يرضى الله عنها → يستغفر الله
- يعلّق الأب كل شيء برضا الله وبالحسنات
- يبيّن ما هي الحسنات وما هي السيئات

كن دقيقًا جدًا: اذكر آيات دقيقة (مع السورة ورقم الآية) وأحاديث (مع مصدرها) فقط إن كانت واردة حرفيًا فيما زُوّدت به من قاعدة المعرفة أعلاه — لا تختلق آية أو حديثًا أو مصدرًا من الذاكرة؛ ومثّل بأمثلة من الحياة اليومية وأفعال يومية ملموسة.
استخدم منهجية علم الأسرة الإسلامي كدليل.
ابنِ على الصفات الجيدة للطفل.
ضمّن الوضع الأسري الكامل.
لا تستخدم النجوم (**) أو أي رموز تنسيق. اجعل النص نظيفًا.` : isEn ? `Generate a HYBRID TREATMENT PLAN for the following issue:

CHILD: ${input.childName}
AGE: ${input.childAge} years
GENDER: ${input.childGender}
YEAR IN PROGRAM: ${input.yearKey}, WEEK: ${input.weekInYear}

ISSUE/PROBLEM (told by the parent):
${enrichedIssue}

${parentInfo}
${environmentInfo}
${checkinContext}

Generate a HYBRID and SPECIFIC treatment plan:

1. DIAGNOSIS & ANALYSIS
2. WHAT MUST THE PARENT CHANGE FIRST?
3. TREATMENT PLAN - FOUNDATION: 'AQEEDAH
4. TREATMENT PLAN - TASFIYA (correcting child's mind)
5. TREATMENT PLAN - TAZKIYA (correcting child's heart)
6. TREATMENT PLAN - TARBIYA (correcting child's behavior)
7. FIVE STEPS OF ERROR CORRECTION
8. TIMELINE & EVALUATION
9. USING GOOD QUALITIES & AFFINITIES
10. MINDSETS FOR THE PARENT DURING TREATMENT

Be VERY specific: name exact ayaat (with surah and ayah number) and hadith (with source) ONLY when that exact text was already given to you in the context above — never invent an ayah, hadith, or source from memory. Also give examples from daily life and concrete daily actions.
Use the Islamic Family Science methodology as a guide.
Build on the child's good qualities.
Integrally include the full family situation.` : `Genereer een HYBRIDE BEHANDELPLAN voor het volgende issue:

KIND: ${input.childName}
LEEFTIJD: ${input.childAge} jaar
GESLACHT: ${input.childGender}
JAAR IN PROGRAMMA: ${input.yearKey}, WEEK: ${input.weekInYear}

ISSUE/PROBLEEM (verteld door de ouder):
${enrichedIssue}

${parentInfo}
${environmentInfo}
${checkinContext}

Genereer een HYBRIDE en SPECIFIEK behandelplan:

1. DIAGNOSE & ANALYSE
   - Analyseer het probleem vanuit de Tasfiya-Tazkiya-Tarbiya methode
   - Is het een probleem van het verstand (mindset), het hart (gevoel), of het gedrag (daad)?
   - Wat is de wortel? Welke stap van de 11 opvoedstappen is niet goed uitgevoerd?
   - Hoe verhoudt het zich tot de leeftijd (${input.childAge} jaar)?
   - Welke omgevingsfactoren spelen een rol?
   - CRUCIAAL: Welke invloed heeft de OUDER zelf op dit probleem? (hun denkwijze, voelwijze, spreekwijze, doewijze)

2. WAT MOET DE OUDER ZELF EERST VERANDEREN?
   - Band met Allaah: wat moet verbeteren? (gebaseerd op hun gebed, ibadah, kennis)
   - Band met partner: wat moet verbeteren? (gebaseerd op hun communicatie)
   - Eigen denkwijze: welke mindsets corrigeren?
   - Eigen voelwijze: welke gevoelens bijsturen?
   - Eigen spreekwijze: hoe anders spreken met het kind?
   - Eigen doewijze: welke handelingen veranderen?
   - Tijdschema: hoeveel dagen/weken voor de ouder zelf?

3. BEHANDELPLAN - FUNDAMENT: 'AQIEDAH
   - Welke aspecten van tawhied moeten versterkt worden bij het kind?
   - Concrete lessen over Allaah's Namen en Eigenschappen passend bij ${input.childAge} jaar
   - Exacte ayaat en ahaadieth om te gebruiken
   - Tijdschema: hoeveel dagen/weken voor dit fundament?

4. BEHANDELPLAN - TASFIYA (verstand kind corrigeren)
   - Welke slechte mindsets moeten verwijderd worden?
   - Welke goede mindsets moeten geplant worden?
   - Concrete gesprekken (geef exacte woorden en voorbeelden)
   - Hoe overtuig je het kind? Met welke bewijzen?
   - Hoe moet de ouder dit brengen (rekening houdend met hun spreekwijze)?

5. BEHANDELPLAN - TAZKIYA (hart kind corrigeren)
   - Welke gevoelens moeten veranderd worden?
   - Hoe laat je het kind het slechte verafschuwen?
   - Hoe laat je het kind het goede liefhebben?
   - Concrete oefeningen en momenten
   - Hoe kan de ouder emotioneel verbinden (rekening houdend met hun voelwijze)?

6. BEHANDELPLAN - TARBIYA (gedrag kind corrigeren)
   - Welke daden/uitspraken moeten stoppen?
   - Welke nieuwe gewoontes moeten aangeleerd worden?
   - Concrete dagelijkse acties en oefeningen
   - Hoe tawba verrichten met het kind?
   - Hoe de omgeving (school, vrienden, hobby's) inzetten?

7. VIJF STAPPEN FOUTCORRECTIE (toepassing)
   - TA'LIEM: Wat moet het kind leren? Welke van de 21 methoden?
   - TADHKIER: Hoe herinner je het kind? Welke triggers?
   - MAW'IDHAH: Welke vermaning past? (alleen als nodig)
   - ZAJR: Welke berisping? (alleen als nodig)
   - 'IQAAB: Welke straf? (alleen als laatste redmiddel, islamitisch verantwoord)

8. TIJDSCHEMA & EVALUATIE
   - Week 1-2: ... (specifieke acties voor ouder EN kind)
   - Week 3-4: ... (specifieke acties)
   - Evaluatiemomenten en criteria
   - Hoe meet je vooruitgang?
   - Wanneer naar volgende fase?

9. GEBRUIK VAN GOEDE EIGENSCHAPPEN & AFFINITEITEN
   - Hoe zet je de goede eigenschappen van het kind in?
   - Welke hobby's/affiniteiten helpen bij de behandeling?
   - Hoe bouw je op de sterke punten?
   - Hoe zet je de sterke punten van de ouder in?

10. MINDSETS VOOR DE OUDER TIJDENS BEHANDELING
   - 5 mindsets die de ouder moet internaliseren
   - Hoe deze mindsets toe te passen
   - Valkuilen om te vermijden (gebaseerd op hun zwakke punten)

Wees ZEER specifiek: noem exacte ayaat (met soerah en ayah-nummer) en ahaadieth (met bron) ALLEEN als die letterlijke tekst je al is aangereikt in de context hierboven — verzin nooit een ayah, hadith of bron uit het geheugen. Geef ook voorbeelden uit het dagelijks leven en concrete dagelijkse acties.
Gebruik de methodiek uit de Islamitische Gezinskunde als leidraad.
Bouw op de goede eigenschappen van het kind.
Neem de volledige gezinssituatie integraal mee.`;

      const result = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });

      const content = result.choices[0]?.message?.content;
      let plan = typeof content === "string" ? content : Array.isArray(content) ? content.map((c: any) => "text" in c ? c.text : "").join("") : "";

      // Post-process Arabic plans to remove any Dutch transliterations that slipped through
      if (isAr) {
        plan = sanitizeArabicText(plan);
      } else {
        plan = correctTranscription(plan, isEn ? "en" : "nl");
      }
      plan = stripMarkdownEmphasis(plan);

      return { plan };
    }),

  /**
   * Generate spouse-to-spouse advice based on:
   * - Questionnaire answers (parent profile)
   * - Weekly advice interactions (goal progress)
   * - Consultant questions (AI conversations)
   * - Daily analysis interactions
   */
  getSpouseAdvice: protectedProcedure
    .input(z.object({
      language: z.string().optional(),
      partnerId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const lang = input.language || ctx.user.language || "nl";
      // Find the partner (item 1 polygyny review pass — closes the last
      // db.getPartnerOfUser call site in this file, confirmed by grep).
      // Mirrors getPartnerProfile's optional-partnerId shape (server/
      // routers.ts): omitted, with 0 or 1 confirmed partners this is
      // byte-for-byte what it always returned. With 2+ confirmed wives and
      // no partnerId, this used to silently draw on (and generate advice
      // ABOUT) whichever wife getPartnerOfUser's unordered query returned
      // first — unlike getPartnerProfile (a read of already-shared data),
      // building advice from the wrong wife's private profile/check-ins is
      // not a UX papercut, so this fails closed instead of defaulting, via
      // this procedure's own existing return-sentinel error convention
      // (see the partnershipConfirmed check just below) rather than a
      // thrown error — no client currently wires the failure end-to-end,
      // see the caller.
      const partners = await db.getPartnersOfUser(userId);
      let partner: (typeof partners)[number] | null;
      if (input.partnerId !== undefined) {
        partner = partners.find((p) => p.id === input.partnerId) ?? null;
      } else if (partners.length > 1) {
        return { advice: null, error: "ambiguous_partner" };
      } else {
        partner = partners[0] ?? null;
      }
      if (!partner) {
        return { advice: null, error: "no_partner" };
      }
      // VULNERABILITY (item 5) fix: confirmation is required. This is a
      // DIFFERENT axis from the grant — see the comment further down, near
      // getRecentDiagnosticSignals, for why this function is deliberately
      // exempt from the gender/grant gate getPartnerProfile/syncWithPartner
      // enforce. Confirmation is not exempt: db.getPartnersOfUser's
      // shared-children legacy fallback can hand back a "partner" whose
      // partnerships row is still a pending, unconfirmed invite (round-8
      // P1), and without this check the function below would draw on that
      // unconfirmed partner's full profileData, dailyCheckins, and
      // environments before either side ever agreed to the link — closes
      // the SECOND CAVEAT flagged in daily-diagnostic.ts's own file header.
      if (!partner.partnershipConfirmed) {
        return { advice: null, error: "not_confirmed" };
      }
      // Get interaction data for both spouses
      const myInteractions = await db.getSpouseInteractionData(userId, partner.id);
      const partnerInteractions = await db.getSpouseInteractionData(partner.id, userId);
      // Build context from questionnaire answers
      const myProfile = ctx.user.profileData as any;
      const partnerProfile = partner.profileData as any;
      // Item 3 gate — the SAME hasFullPartnerAccess formula routers.ts uses
      // for getPartnerProfile/links.getPartnerDailyDiagnostic (duplicated
      // rather than imported: routers.ts imports adviceRouter from this
      // file, so importing back would cycle — same workaround `myGender`
      // just below already uses, hoisted here so this gate can read it
      // too). Decides whether getSpouseAdvice may fold the partner's
      // ACTUAL answer text (buildPartnerAnswersContext) into the prompt,
      // further down — the coarse category+tone signal
      // (buildPartnerSignalContext) stays unconditional in both
      // directions, unaffected by this gate.
      //
      // partner.partnershipConfirmed is included explicitly here (unlike
      // an earlier version of this comment claimed) rather than relied on
      // via the confirmation check above: that check and this gate are
      // textually far apart in a 350+ line procedure, and adversarial
      // review flagged that a future edit reordering or removing the
      // early return could silently reopen full-answer access to an
      // unconfirmed "partner" (the shared-children legacy fallback can
      // hand one back) with no compiler or test catching it structurally.
      // Correct by construction now, matching hasFullPartnerAccess's own
      // 4-argument shape (server/routers.ts) instead of depending on
      // control flow above.
      const myGender = ctx.user.gender || myProfile?.parentProfile?.gender || "";
      const partnerGender = partner.gender || partnerProfile?.parentProfile?.gender || "";
      const hasFullAnswerAccess =
        partner.partnershipConfirmed &&
        ((myGender === "man" && partnerGender === "vrouw") ||
          (myGender === "vrouw" && partnerGender === "man" && !!partner.profileAccessGrantedAt));
      const isAr = lang === "ar";
      const isEn = lang === "en";
      const l = (ar: string, en: string, nl: string) => isAr ? ar : isEn ? en : nl;
      // Build interaction summary
      let interactionContext = "";
      // Weekly goal interactions
      const myCompletedGoals = myInteractions.goals.filter((g: any) => g.status === "completed").length;
      const mySkippedGoals = myInteractions.goals.filter((g: any) => g.status === "skipped").length;
      const partnerCompletedGoals = partnerInteractions.goals.filter((g: any) => g.status === "completed").length;
      const partnerSkippedGoals = partnerInteractions.goals.filter((g: any) => g.status === "skipped").length;
      interactionContext += l(
        `\nتفاعل المستخدم مع النصائح الأسبوعية: ${myCompletedGoals} مكتملة، ${mySkippedGoals} متجاوزة\nتفاعل الشريك مع النصائح الأسبوعية: ${partnerCompletedGoals} مكتملة، ${partnerSkippedGoals} متجاوزة`,
        `\nUser's weekly advice interaction: ${myCompletedGoals} completed, ${mySkippedGoals} skipped\nPartner's weekly advice interaction: ${partnerCompletedGoals} completed, ${partnerSkippedGoals} skipped`,
        `\nGebruiker weekadvies interactie: ${myCompletedGoals} voltooid, ${mySkippedGoals} overgeslagen\nPartner weekadvies interactie: ${partnerCompletedGoals} voltooid, ${partnerSkippedGoals} overgeslagen`
      );
      // Consultant questions summary
      if (myInteractions.conversations.length > 0) {
        interactionContext += l(
          `\nعدد استشارات المستخدم الأخيرة: ${myInteractions.conversations.length}`,
          `\nUser's recent consultations: ${myInteractions.conversations.length}`,
          `\nRecente consulten gebruiker: ${myInteractions.conversations.length}`
        );
      }
      if (partnerInteractions.conversations.length > 0) {
        interactionContext += l(
          `\nعدد استشارات الشريك الأخيرة: ${partnerInteractions.conversations.length}`,
          `\nPartner's recent consultations: ${partnerInteractions.conversations.length}`,
          `\nRecente consulten partner: ${partnerInteractions.conversations.length}`
        );
      }

      // === NEW: Daily checkins from partner ===
      const partnerPD = partnerInteractions.profileData as any;
      if (partnerPD?.dailyCheckins?.length > 0) {
        const recentCheckins = partnerPD.dailyCheckins.slice(-7);
        const prayerSummary = recentCheckins.map((c: any) => c.prayer).filter(Boolean);
        const moodSummary = recentCheckins.map((c: any) => c.mood).filter(Boolean);
        interactionContext += l(
          `\n\n--- تسجيلات الشريك اليومية (آخر 7 أيام) ---\nالصلاة: ${prayerSummary.join("، ")}\nالمزاج: ${moodSummary.join("، ")}`,
          `\n\n--- Partner's daily check-ins (last 7 days) ---\nPrayer: ${prayerSummary.join(", ")}\nMood: ${moodSummary.join(", ")}`,
          `\n\n--- Dagelijkse check-ins partner (laatste 7 dagen) ---\nGebed: ${prayerSummary.join(", ")}\nStemming: ${moodSummary.join(", ")}`
        );
        // Open answers from checkins
        const openAnswers = recentCheckins.filter((c: any) => c.openAnswer).map((c: any) => `${c.date}: ${c.openAnswer}`);
        if (openAnswers.length > 0) {
          interactionContext += l(
            `\nملاحظات الشريك: ${openAnswers.join(" | ")}`,
            `\nPartner notes: ${openAnswers.join(" | ")}`,
            `\nPartner notities: ${openAnswers.join(" | ")}`
          );
        }
      }

      // === NEW: Daily tip completions from partner ===
      if (partnerPD?.dailyTipCompletions?.length > 0) {
        const recentTips = partnerPD.dailyTipCompletions.slice(-10);
        interactionContext += l(
          `\n\n--- نصائح يومية أكملها الشريك: ${recentTips.length} نصيحة مؤخراً ---`,
          `\n\n--- Daily tips completed by partner: ${recentTips.length} recently ---`,
          `\n\n--- Dagelijkse tips voltooid door partner: ${recentTips.length} recent ---`
        );
      } else {
        interactionContext += l(
          `\nالشريك لم يُكمل أي نصيحة يومية مؤخراً`,
          `\nPartner has not completed any daily tips recently`,
          `\nPartner heeft recent geen dagelijkse tips voltooid`
        );
      }

      // === NEW: Partner's environments (child analysis) ===
      if (partnerPD?.environments?.length > 0) {
        const envCount = partnerPD.environments.length;
        const envChildren = partnerPD.environments.map((e: any) => e.childName || "طفل").join("، ");
        interactionContext += l(
          `\n\n--- تحليلات بيئة الأطفال التي أكملها الشريك: ${envCount} (${envChildren}) ---`,
          `\n\n--- Child environment analyses completed by partner: ${envCount} (${envChildren}) ---`,
          `\n\n--- Omgevingsanalyses kinderen door partner: ${envCount} (${envChildren}) ---`
        );
      } else {
        interactionContext += l(
          `\nالشريك لم يُكمل أي تحليل بيئة للأطفال`,
          `\nPartner has not completed any child environment analysis`,
          `\nPartner heeft geen omgevingsanalyse voor kinderen voltooid`
        );
      }

      // === NEW: Shared children info ===
      if (partnerInteractions.childrenData?.length > 0) {
        const childrenInfo = partnerInteractions.childrenData.map((c: any) => {
          const age = c.birthDate ? Math.floor((Date.now() - new Date(c.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : "?";
          const hasEnv = c.environmentData ? "نعم" : "لا";
          return `${c.name} (${age} سنة، تحليل بيئة: ${hasEnv})`;
        }).join("، ");
        interactionContext += l(
          `\n\n--- الأطفال المشتركون: ${childrenInfo} ---`,
          `\n\n--- Shared children: ${childrenInfo} ---`,
          `\n\n--- Gedeelde kinderen: ${childrenInfo} ---`
        );
      }

      // === NEW: Partner's full questionnaire answers (beyond just partner section) ===
      if (partnerPD?.parentProfile) {
        const pp = partnerPD.parentProfile;
        if (pp.thinkingAboutChildren || pp.doingWithChildren || pp.speakingToChildren) {
          interactionContext += l(
            `\n\n--- علاقة الشريك بالأطفال ---\nتفكيره: ${pp.thinkingAboutChildren || "؟"}\nتعامله: ${pp.doingWithChildren || "؟"}\nكلامه: ${pp.speakingToChildren || "؟"}\nعند الغضب: ${pp.speakingWhenAngry || "؟"}`,
            `\n\n--- Partner's relation with children ---\nThinking: ${pp.thinkingAboutChildren || "?"}\nDoing: ${pp.doingWithChildren || "?"}\nSpeaking: ${pp.speakingToChildren || "?"}\nWhen angry: ${pp.speakingWhenAngry || "?"}`,
            `\n\n--- Relatie partner met kinderen ---\nDenken: ${pp.thinkingAboutChildren || "?"}\nDoen: ${pp.doingWithChildren || "?"}\nSpreken: ${pp.speakingToChildren || "?"}\nBij boosheid: ${pp.speakingWhenAngry || "?"}`
          );
        }
        if (pp.parentStrengths || pp.parentWeaknesses) {
          interactionContext += l(
            `\nنقاط قوة الشريك: ${pp.parentStrengths || "؟"}\nنقاط ضعفه: ${pp.parentWeaknesses || "؟"}`,
            `\nPartner strengths: ${pp.parentStrengths || "?"}\nWeaknesses: ${pp.parentWeaknesses || "?"}`,
            `\nSterke punten partner: ${pp.parentStrengths || "?"}\nZwakke punten: ${pp.parentWeaknesses || "?"}`
          );
        }
      }

      // === Self-reported daily diagnostic signals (replaces guessing): category
      // + tone only, never the partner's actual answer text — see
      // daily-diagnostic.ts summarizeSignals/buildPartnerSignalContext. ===
      // Every other signal block above reads already-fetched profileData; this
      // is the only one that hits a table, and it is a NEW table. If migration
      // 0014 has not run on this server yet — a real hazard given that server
      // code is hand-ported to the VM — spouse advice must degrade to what it
      // produced before this feature existed, not 500.
      //
      // Intentionally ungated by hasFullPartnerAccess/resolveGender: the
      // product owner ruled spouse ADVICE may draw on the partner's data
      // with no permission grant — only direct verbatim reading of the
      // partner's profile (getPartnerProfile/syncWithPartner) requires one.
      // Do not add a gender/grant check here to "fix" this. Confirmation is
      // a separate axis and IS required — see the partnershipConfirmed
      // check right after partner resolution, near the top of this
      // procedure (item 5 fix).
      try {
        const partnerSignals = await db.getRecentDiagnosticSignals(partner.id, 7);
        interactionContext += buildPartnerSignalContext(summarizeSignals(partnerSignals), isAr ? "ar" : isEn ? "en" : "nl");
      } catch (err) {
        console.error("[getSpouseAdvice] diagnostic signals unavailable, continuing without them:", err);
      }

      // === Fold in the REQUESTER's OWN recent daily-diagnostic tone, mirroring
      // the self-advisors' getOwnCheckinContext usage elsewhere in this file
      // (e.g. getGeneralAdvice ~line 1044). This is the user's own data, not
      // the partner's, so — like the coarse partner-signal block just above —
      // it stays unconditional and unaffected by hasFullAnswerAccess.
      // getOwnCheckinContext already fails open to "" on any error/missing id.
      const ownContext = await getOwnCheckinContext(ctx.user?.id, isAr ? "ar" : isEn ? "en" : "nl");
      interactionContext += ownContext;

      // === Item 3: the partner's ACTUAL answer text (not just category+tone)
      // — UNLIKE the coarse signal block just above, this one IS gated on
      // hasFullAnswerAccess (computed near the top of this procedure): a
      // husband gets it unconditionally (once confirmed, already checked);
      // a wife only once her husband has granted her profile access. This
      // is the same hasFullPartnerAccess rule getPartnerProfile/
      // links.getPartnerDailyDiagnostic enforce for reading the raw
      // answers directly — spelled out here again because it is the one
      // exception to "spouse advice is ungated" the comment above
      // describes. The fetch itself is gated, not just the render, so an
      // ungated wife's request never even reads her husband's answer rows.
      // ponytail: hasFullAnswerAccess is a snapshot taken near the top of
      // this procedure, not re-verified against this fetch — same accepted,
      // documented gap as links.getPartnerDailyDiagnostic's own comment in
      // server/routers.ts (no DB transaction wraps any read in this file
      // today); this window is at least as wide (several awaited queries
      // sit between the snapshot and here), same low-probability reasoning
      // applies. ===
      if (hasFullAnswerAccess) {
        try {
          const partnerAnswerRows = await db.getRecentDiagnosticRows(partner.id, 7);
          interactionContext += buildPartnerAnswersContext(partnerAnswerRows, isAr ? "ar" : isEn ? "en" : "nl");
        } catch (err) {
          console.error("[getSpouseAdvice] diagnostic answer labels unavailable, continuing without them:", err);
        }
      }

      // Build the prompt. The prompt used to embed ctx.user.name (Latin
      // script, e.g. "Suhayb Salam") directly into the Arabic-language
      // prompt and frame the task in 3rd person ("suggestions for
      // [name]...") on the user's OWN screen — the model then
      // re-transliterated the Latin name back into Arabic and got it wrong
      // (سهيب instead of صهيب). Fix: never put a name in the prompt; address
      // the user in 2nd person and refer to the partner by a gendered
      // relationship term instead. `myGender` is declared earlier now (the
      // item 3 gate above needs it too); same column-then-JSON gender
      // precedence as resolveGender (server/routers.ts).
      const partnerTerm = myGender === "man"
        ? l("زوجتك", "your wife", "je vrouw")
        : myGender === "vrouw"
        ? l("زوجك", "your husband", "je man")
        : l("شريكك", "your partner", "je partner");
      const systemPrompt = isAr ? `أنت مستشار أسري إسلامي متخصص. مهمتك اقتراح أفعال مباشرة وجهاً لوجه (ليس عبر التطبيق) مع ${partnerTerm}.

الاقتراحات يجب أن تكون:
1. أفعال مباشرة ينفذها الشخص مع شريكه في الحياة الواقعية (محادثة، فعل لطيف، مساعدة، نشاط مشترك)
2. مبنية على البيانات الحقيقية (إجابات الاستبيان + التفاعل مع النصائح الأسبوعية + الاستشارات + مهام كل منهما تجاه الأبناء)
3. مناسبة للوقت الحالي (صباح/مساء/عطلة نهاية الأسبوع)
4. مستندة إلى منهج إسلامي (آيات/أحاديث عن العشرة بين الزوجين)
5. لطيفة وبنّاءة ومشجعة على التعاون في التربية

تنسيق الإخراج (مُلزم): اجمع اقتراحاتك الثلاثة إلى الخمسة في 2-4 أقسام مواضيعية قصيرة (مثل: العلاقة بين الزوجين، الانسجام الأسري، الرابطة الإيمانية بينهما) بدلاً من قائمة مسطّحة. ابدأ كل قسم بعنوان مرقّم في سطر مستقل: "1. العنوان"، "2. العنوان"، وهكذا — رقم عادي في النص، وليس نجومًا ولا خطًا عريضًا — ثم اذكر اقتراح (اقتراحات) ذلك القسم تحته كأسطر تبدأ بشرطة (-)، لا بترقيم، حتى لا تُقرأ كعناوين إضافية.
استخدم أسلوب "يمكنك اليوم أن..." أو "جرّب هذا المساء..." - أفعال ملموسة وليس كلاماً عاماً.

قواعد إلزامية:
- خاطب المستخدم دائماً بصيغة المخاطب "أنت"، ولا تذكر اسمه أو اسم الشريك إطلاقاً — استخدم فقط "${partnerTerm}" عند الإشارة إلى الشريك.
- ردّ بالعربية الفصحى فقط. لا تستخدم أي حروف لاتينية.
- اكتب "الله" وليس "Allaah". اكتب "ما شاء الله" وليس "Maashaa'llaah".
- اكتب الأسماء بالعربية فقط (عبد الرؤوف، عبد الله). لا تكتب "3Abd" أو أي شكل لاتيني.
- لا تستخدم النجوم (**) أو أي رموز تنسيق.
- قاعدة الاستشهاد الديني (ملزمة بلا استثناء): يُحظر منعًا باتًا الاستشهاد بأي حديث نبوي أو آية قرآنية من الذاكرة، أو نسبة أي قول إلى النبي ﷺ من تلقاء نفسك، نصًا أو معنى. لا تستخدم إلا نصّ حديث أو آية ورد لك حرفيًا في موضع آخر من هذا النص؛ فإن لم يرد نص يخص هذا الموضوع، فقدّم التشجيع الإيماني بعبارات عامة دون سرد أي حديث أو آية.
- ${SOURCE_GROUNDING_RULE.ar}` :
        isEn ? `You are a specialized Islamic family counselor. Your task is to suggest DIRECT FACE-TO-FACE ACTIONS in real life (NOT through the app) with ${partnerTerm}.

The suggestions must be:
1. Direct actions to perform with their spouse in person (conversation, kind gesture, help, shared activity)
2. Based on real data (questionnaire answers + weekly advice interactions + consultations + each parent's tasks toward children)
3. Appropriate for the current time of day (morning/evening/weekend)
4. Grounded in Islamic methodology (verses/hadiths about spousal relations)
5. Kind, constructive, and encouraging cooperation in parenting

OUTPUT FORMAT (binding): Group your 3-5 suggestions into 2-4 short THEMED SECTIONS (e.g. the relationship, family harmony, the Islamic connection between spouses) instead of a flat list. Start each section with a top-level numbered heading on its own line — "1. <heading>", "2. <heading>", etc., plain numbered text, never bold or asterisks — then list that section's suggestion(s) below it as dash-bulleted lines ("- ..."), never numbered, so they are not read as more headings.
Use "You could today..." or "Try this evening..." style - tangible actions, not generic advice.

ADDRESSING RULE (binding): Always address the reader directly as "you". Never use their name or their spouse's name — refer to the spouse only as "${partnerTerm}".

TRANSLITERATION RULES (ALWAYS apply):
- ALWAYS write "Allaah" with double 'a' (not "Allah"). E.g.: Maashaa'llaah, 'Abdullaah, Bismillaah, In shaa' Allaah, SubhaanAllaah, Astaghfirullaah.
- The Arabic letter ع (ain) is written as '3'. E.g.: 3abd, 3ilm, 3Abdullaah, 3aqeedah, 3ibaadah.
- Always use the established transliterated Islamic term (e.g. du'aa, dhikr, salaah, adhkaar, Sunnah, tawheed) — never a loose, colloquial, or diminutive rendering (e.g. never "little prayer" for adhkaar or du'aa).

SCRIPTURE CITATION RULE (binding, no exceptions): Never quote, paraphrase, or attribute any hadith or Qur'anic ayah from memory, and never attribute any saying to the Prophet ﷺ on your own initiative — whether by exact wording or by meaning. Only use hadith or ayah text that was given to you verbatim elsewhere in this prompt; if none was given for this topic, give religious encouragement in general terms without narrating any hadith or ayah.

${SOURCE_GROUNDING_RULE.en}

FORMATTING: Do not use asterisks (**) or any markdown formatting symbols. Keep the text clean, with no symbols.

IMPORTANT: Respond entirely in English.` :
        `Je bent een gespecialiseerde islamitische gezinsadviseur. Je taak is DIRECTE FACE-TO-FACE ACTIES voor te stellen in het echte leven (NIET via de app) met ${partnerTerm}.

De suggesties moeten:
1. Directe acties zijn om persoonlijk met de partner uit te voeren (gesprek, lief gebaar, hulp, gezamenlijke activiteit)
2. Gebaseerd zijn op echte data (vragenlijst-antwoorden + weekadvies-interacties + consulten + taken van elke ouder richting kinderen)
3. Passend zijn bij het huidige moment (ochtend/avond/weekend)
4. Geworteld zijn in islamitische methodiek (verzen/ahaadieth over omgang tussen echtgenoten)
5. Vriendelijk, opbouwend en samenwerking in opvoeding aanmoedigend

OUTPUTFORMAAT (bindend): Groepeer je 3-5 suggesties in 2-4 korte THEMATISCHE SECTIES (bijv. de relatie, de gezinsharmonie, de islamitische verbondenheid tussen de partners) in plaats van een platte lijst. Begin elke sectie met een genummerde kop op een eigen regel: "1. <kop>", "2. <kop>", enz. — gewone genummerde tekst, nooit vet of sterretjes — en zet de suggestie(s) van die sectie daaronder als regels die met een streepje (-) beginnen, niet genummerd, zodat ze niet als extra koppen worden gelezen.
Gebruik "Je zou vandaag kunnen..." of "Probeer vanavond..." stijl - tastbare acties, geen algemeen advies.

AANSPREEKREGEL (bindend): Spreek de lezer altijd rechtstreeks aan met "je". Gebruik nooit hun naam of de naam van hun partner — noem de partner alleen "${partnerTerm}".

TRANSLITERATIEREGELS (ALTIJD toepassen):
- Schrijf ALTIJD "Allaah" met dubbele 'a' (niet "Allah"). Bijv: Maashaa'llaah, 'Abdullaah, Bismillaah, In shaa' Allaah, SubhaanAllaah, Astaghfirullaah.
- De Arabische letter ع (ain) wordt geschreven als '3'. Bijv: 3abd, 3ilm, 3Abdullaah, 3aqiedah, 3ibaadah.
- Gebruik altijd de vaste getranslitereerde islamitische term (bijv. du3aa', dhikr, salaah, adhkaar, Soennah, tawhied) — nooit een losse, informele of verkleinwoordvorm (bijv. nooit "gebedje" of "slaapgebedje" voor adhkaar of du3aa').

REGEL VOOR RELIGIEUZE CITATEN (bindend, geen uitzonderingen): Citeer, parafraseer of schrijf nooit uit het geheugen een hadith of Koranvers (ayah) toe, en schrijf nooit op eigen initiatief een uitspraak toe aan de Profeet ﷺ — noch letterlijk noch naar de strekking. Gebruik uitsluitend hadith- of ayah-tekst die je letterlijk elders in deze prompt is aangereikt; is daarover niets aangereikt, geef dan algemene geloofsaanmoediging zonder een hadith of ayah te vertellen.

${SOURCE_GROUNDING_RULE.nl}

OPMAAK: Gebruik geen sterretjes (**) of andere opmaaksymbolen (markdown). Houd de tekst schoon, zonder symbolen.

BELANGRIJK: Antwoord volledig in het Nederlands.`;
      // Build user context from profiles
      let profileContext = "";
      if (myProfile) {
        profileContext += l(
          `\n--- ملفك ---`,
          `\n--- Your profile ---`,
          `\n--- Jouw profiel ---`
        );
        profileContext += `\n${l("التفكير عن الشريك", "Thinking about partner", "Denken over partner")}: ${myProfile.thinkingAboutPartner || "?"}`;
        profileContext += `\n${l("الشعور مع الشريك", "Feeling with partner", "Voelen bij partner")}: ${myProfile.feelingAboutPartner || "?"}`;
        profileContext += `\n${l("الكلام مع الشريك", "Speaking with partner", "Spreken met partner")}: ${myProfile.speakingToPartner || "?"}`;
        profileContext += `\n${l("السلوك مع الشريك", "Doing with partner", "Doen met partner")}: ${myProfile.doingWithPartner || "?"}`;
        profileContext += `\n${l("جودة العلاقة", "Relation quality", "Relatiekwaliteit")}: ${myProfile.partnerRelationQuality || "?"}`;
        profileContext += `\n${l("الاتفاق على التربية", "Parenting agreement", "Eens over opvoeding")}: ${myProfile.partnerParentingAgreement || "?"}`;
        profileContext += `\n${l("التواصل", "Communication", "Communicatie")}: ${myProfile.partnerCommunication || "?"}`;
      }
      if (partnerProfile) {
        profileContext += l(
          `\n\n--- ملف ${partnerTerm} ---`,
          `\n\n--- ${partnerTerm}'s profile ---`,
          `\n\n--- Profiel van ${partnerTerm} ---`
        );
        profileContext += `\n${l("التفكير عن الشريك", "Thinking about partner", "Denken over partner")}: ${partnerProfile.thinkingAboutPartner || "?"}`;
        profileContext += `\n${l("الشعور مع الشريك", "Feeling with partner", "Voelen bij partner")}: ${partnerProfile.feelingAboutPartner || "?"}`;
        profileContext += `\n${l("الكلام مع الشريك", "Speaking with partner", "Spreken met partner")}: ${partnerProfile.speakingToPartner || "?"}`;
        profileContext += `\n${l("السلوك مع الشريك", "Doing with partner", "Doen met partner")}: ${partnerProfile.doingWithPartner || "?"}`;
        profileContext += `\n${l("جودة العلاقة", "Relation quality", "Relatiekwaliteit")}: ${partnerProfile.partnerRelationQuality || "?"}`;
        profileContext += `\n${l("الاتفاق على التربية", "Parenting agreement", "Eens over opvoeding")}: ${partnerProfile.partnerParentingAgreement || "?"}`;
        profileContext += `\n${l("التواصل", "Communication", "Communicatie")}: ${partnerProfile.partnerCommunication || "?"}`;
      }
      // Add time context for time-appropriate suggestions
      const now = new Date();
      const hour = now.getHours();
      const dayOfWeek = now.getDay(); // 0=Sun, 6=Sat
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6; // Fri/Sat/Sun
      const timeContext = l(
        `\n\nالوقت الحالي: ${hour < 12 ? "صباح" : hour < 17 ? "ظهر" : hour < 21 ? "مساء" : "ليل"}${isWeekend ? " (عطلة نهاية الأسبوع)" : " (يوم عمل)"}`,
        `\n\nCurrent time: ${hour < 12 ? "morning" : hour < 17 ? "afternoon" : hour < 21 ? "evening" : "night"}${isWeekend ? " (weekend)" : " (workday)"}`,
        `\n\nHuidig moment: ${hour < 12 ? "ochtend" : hour < 17 ? "middag" : hour < 21 ? "avond" : "nacht"}${isWeekend ? " (weekend)" : " (werkdag)"}`
      );
      const userPrompt = l(
        `بناءً على المعلومات التالية، اقترح أفعالاً مباشرة مع ${partnerTerm} الآن:\n${profileContext}\n${interactionContext}${timeContext}`,
        `Based on the following, suggest direct actions with ${partnerTerm} now:\n${profileContext}\n${interactionContext}${timeContext}`,
        `Op basis van het volgende, stel nu directe acties voor met ${partnerTerm}:\n${profileContext}\n${interactionContext}${timeContext}`
      );
      const result = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });
      const adviceContent = result.choices[0]?.message?.content;
      let adviceText = typeof adviceContent === "string" ? adviceContent : Array.isArray(adviceContent) ? adviceContent.map((c: any) => "text" in c ? c.text : "").join("") : "";
      // Post-process Arabic to remove Dutch transliterations
      if (isAr) {
        adviceText = sanitizeArabicText(adviceText);
      } else {
        adviceText = correctTranscription(adviceText, isEn ? "en" : "nl");
      }
      adviceText = stripMarkdownEmphasis(adviceText);
      // Save to database
      if (adviceText) {
        const weekNum = Math.ceil((new Date().getTime() - new Date(new Date().getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000));
        const weekId = `${new Date().getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
        await db.createSpouseAdvice({
          recipientId: userId,
          aboutSpouseId: partner.id,
          content: adviceText,
          category: "general",
          basedOn: ["questionnaire", "weekly_interaction", "consultant", "daily_analysis"],
          weekId,
        });
      }
      return { advice: adviceText, partnerName: partner.name };
    }),

  /** Get stored spouse advice history */
  getSpouseAdviceHistory: protectedProcedure
    .input(z.object({ limit: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const history = await db.getSpouseAdviceForUser(ctx.user.id, input.limit || 20);
      // Defensive strip for rows saved before the markdown ban existed.
      return history.map((row: any) => ({ ...row, content: stripMarkdownEmphasis(row.content) }));
    }),

  /** Mark spouse advice as read */
  markSpouseAdviceRead: protectedProcedure
    .input(z.object({ adviceId: z.number() }))
    .mutation(async ({ input }) => {
      await db.markSpouseAdviceRead(input.adviceId);
      return { success: true };
    }),

  /** Mark spouse advice as helpful/not helpful */
  markSpouseAdviceHelpful: protectedProcedure
    .input(z.object({ adviceId: z.number(), helpful: z.boolean() }))
    .mutation(async ({ input }) => {
      await db.markSpouseAdviceHelpful(input.adviceId, input.helpful);
      return { success: true };
    }),

  /**
   * AI-generated quick tips (replaces hardcoded localAdvice).
   * Uses: parent profile, children ages/environments, location, Hijri month,
   * time of day, recent check-ins, unresolved issues, daily tip completions.
   * Returns 5-7 short, actionable, personalized tips.
   */
  getQuickTips: publicProcedure
    .input(z.object({
      parentProfile: parentProfileSchema,
      childrenCount: z.number(),
      childrenAges: z.array(z.string()),
      childrenNames: z.array(z.string()).optional(),
      location: z.string(),
      hijriMonth: z.number().optional(),
      hijriDay: z.number().optional(),
      dayOfWeek: z.number().optional(),
      timeOfDay: z.string(),
      season: z.string(),
      language: z.string().optional(),
      dailyCheckin: z.object({
        date: z.string(),
        prayer: z.string(),
        mood: z.string(),
        openAnswer: z.string().optional(),
        timestamp: z.string(),
      }).nullable().optional(),
      recentCheckins: z.array(z.object({
        date: z.string(),
        prayer: z.string(),
        mood: z.string(),
        openAnswer: z.string().optional(),
        timestamp: z.string(),
      })).optional(),
      unresolvedIssues: z.array(z.string()).optional(),
      childrenEnvironments: z.array(z.object({
        childName: z.string(),
        childAge: z.string().optional(),
        environment: environmentSchema,
      })).optional(),
    }))
    .mutation(async ({ input }) => {
      const lang = input.language || "nl";
      const isEn = lang === "en";
      const isAr = lang === "ar";

      const parentInfo = buildFullParentInfo(input.parentProfile, lang);
      let envInfo = "";
      if (input.childrenEnvironments && input.childrenEnvironments.length > 0) {
        for (const ce of input.childrenEnvironments) {
          envInfo += `\n--- ${ce.childName} (${ce.childAge || "?"}) ---\n`;
          envInfo += buildFullEnvironmentInfo(ce.environment, lang);
        }
      }

      // Build check-in context
      let checkinContext = "";
      if (input.dailyCheckin) {
        const c = input.dailyCheckin;
        checkinContext = isAr
          ? `\nتقرير اليوم: الصلاة=${c.prayer}، المزاج=${c.mood}${c.openAnswer ? `، ملاحظة: ${c.openAnswer}` : ""}`
          : isEn
          ? `\nToday's check-in: prayer=${c.prayer}, mood=${c.mood}${c.openAnswer ? `, note: ${c.openAnswer}` : ""}`
          : `\nCheck-in vandaag: gebed=${c.prayer}, stemming=${c.mood}${c.openAnswer ? `, notitie: ${c.openAnswer}` : ""}`;
      }
      if (input.recentCheckins && input.recentCheckins.length > 1) {
        const prayers = input.recentCheckins.map(c => c.prayer).join(", ");
        const moods = input.recentCheckins.map(c => c.mood).join(", ");
        checkinContext += isAr
          ? `\nآخر ${input.recentCheckins.length} أيام - الصلاة: ${prayers} | المزاج: ${moods}`
          : isEn
          ? `\nLast ${input.recentCheckins.length} days - prayer: ${prayers} | mood: ${moods}`
          : `\nLaatste ${input.recentCheckins.length} dagen - gebed: ${prayers} | stemming: ${moods}`;
      }

      // Unresolved issues
      let issuesContext = "";
      if (input.unresolvedIssues && input.unresolvedIssues.length > 0) {
        issuesContext = isAr
          ? `\nمشكلات لم تُحل بعد: ${input.unresolvedIssues.join(" | ")}`
          : isEn
          ? `\nUnresolved issues: ${input.unresolvedIssues.join(" | ")}`
          : `\nOnopgeloste problemen: ${input.unresolvedIssues.join(" | ")}`;
      }

      // Time/location context
      const hour = new Date().getHours();
      const timeLabel = isAr
        ? (input.timeOfDay === "morning" ? "صباح" : input.timeOfDay === "afternoon" ? "ظهر" : "مساء")
        : isEn
        ? input.timeOfDay
        : (input.timeOfDay === "morning" ? "ochtend" : input.timeOfDay === "afternoon" ? "middag" : "avond");

      // Hijri calendar context
      let hijriContext = "";
      if (input.hijriMonth) {
        hijriContext = getHijriCalendarContext(input.hijriMonth, input.hijriDay || 1, input.dayOfWeek || 0, lang);
      }

      const systemPrompt = isAr ? `أنت مستشار تربوي إسلامي. مهمتك إنتاج 5-7 نصائح سريعة وعملية ومحددة جدًا.

القواعد:
- كل نصيحة جملة أو جملتان فقط (قصيرة جدًا)
- كل نصيحة فعل ملموس يمكن تنفيذه الآن أو اليوم
- النصائح مبنية على بيانات الوالد الحقيقية (صلاته، مزاجه، أطفاله، بيئتهم، مشاكلهم)
- النصائح مناسبة للوقت الحالي (${timeLabel}) والموسم (${input.season}) والمكان (${input.location})
- اذكر اسم المدينة (${input.location}) صراحةً في النصائح. اذكر مساجد معروفة في هذه المدينة بأسمائها، ومؤسسات إسلامية، وحلقات علم، ودروس قرآن في هذه المدينة
- استخدم أسماء الأطفال الحقيقية
- علّق كل نصيحة بالله (رضا الله، ثواب، حسنات)
- لا تكرر نصائح عامة (لا "اقرأ القرآن" بدون تحديد)
- كل نصيحة فريدة ومختلفة عن الأخرى
- لا تستخدم أي حروف لاتينية أو رموز تنسيق
- اكتب "الله" وليس "Allaah"
- قاعدة الاستشهاد الديني (ملزمة بلا استثناء): يُحظر منعًا باتًا الاستشهاد بأي حديث نبوي أو آية قرآنية من الذاكرة، أو نسبة أي قول إلى النبي ﷺ من تلقاء نفسك، نصًا أو معنى. لا تستخدم إلا نصّ حديث أو آية ورد لك حرفيًا في موضع آخر من هذا النص؛ فإن لم يرد نص يخص هذا الموضوع، فقدّم التشجيع الإيماني بعبارات عامة دون سرد أي حديث أو آية.
- ${NAME_FIDELITY_RULE.ar}

أجب بصيغة JSON فقط:
{"tips": ["نصيحة 1", "نصيحة 2", ...]}`
      : isEn ? `You are an Islamic parenting advisor. Your task is to produce 5-7 quick, practical, highly specific tips.

Rules:
- Each tip is 1-2 sentences only (very short)
- Each tip is a concrete action doable NOW or TODAY
- Tips are based on the parent's real data (prayer, mood, children, environment, issues)
- Tips are appropriate for current time (${timeLabel}), season (${input.season}), location (${input.location})
- Mention the city name (${input.location}) explicitly in tips. Mention well-known mosques in this city by name, Islamic institutions, knowledge circles, and Qur'aan lessons in this city
- Use the children's real names
- Connect each tip to Allaah (His pleasure, reward, hasanaat)
- No generic tips (not "read Qur'aan" without specifics)
- Each tip is unique and different
- Write "Allaah" with double 'a'. Arabic letter ع = '3'.
- Always use the established transliterated Islamic term (e.g. du'aa, dhikr, salaah, adhkaar, Sunnah, tawheed) — never a loose, colloquial, or diminutive rendering (e.g. never "little prayer" for adhkaar or du'aa).
- Do not use asterisks (**) or any markdown formatting symbols. Keep the text clean, with no symbols.
- SCRIPTURE CITATION RULE (binding, no exceptions): Never quote, paraphrase, or attribute any hadith or Qur'anic ayah from memory, and never attribute any saying to the Prophet ﷺ on your own initiative — whether by exact wording or by meaning. Only use hadith or ayah text that was given to you verbatim elsewhere in this prompt; if none was given for this topic, give religious encouragement in general terms without narrating any hadith or ayah.
- ${NAME_FIDELITY_RULE.en}

Respond in JSON only:
{"tips": ["tip 1", "tip 2", ...]}`
      : `Je bent een islamitische opvoedadviseur. Je taak is 5-7 snelle, praktische, zeer specifieke tips te geven.

Regels:
- Elke tip is 1-2 zinnen (zeer kort)
- Elke tip is een concrete actie die NU of VANDAAG uitvoerbaar is
- Tips zijn gebaseerd op de echte data van de ouder (gebed, stemming, kinderen, omgeving, problemen)
- Tips zijn passend bij het huidige moment (${timeLabel}), seizoen (${input.season}), locatie (${input.location})
- Noem de stadsnaam (${input.location}) expliciet in tips. Noem bekende moskeeën in deze stad bij naam, islamitische instellingen, kenniskringen en Qur'aan-lessen in deze stad
- Gebruik de echte namen van de kinderen
- Verbind elke tip aan Allaah (Zijn tevredenheid, beloning, hasanaat)
- Geen generieke tips (niet "lees Qur'aan" zonder specificatie)
- Elke tip is uniek en anders
- Schrijf "Allaah" met dubbele 'a'. Arabische letter ع = '3'.
- Gebruik altijd de vaste getranslitereerde islamitische term (bijv. du3aa', dhikr, salaah, adhkaar, Soennah, tawhied) — nooit een losse, informele of verkleinwoordvorm (bijv. nooit "gebedje" of "slaapgebedje" voor adhkaar of du3aa').
- Gebruik geen sterretjes (**) of andere opmaaksymbolen (markdown). Houd de tekst schoon, zonder symbolen.
- REGEL VOOR RELIGIEUZE CITATEN (bindend, geen uitzonderingen): Citeer, parafraseer of schrijf nooit uit het geheugen een hadith of Koranvers (ayah) toe, en schrijf nooit op eigen initiatief een uitspraak toe aan de Profeet ﷺ — noch letterlijk noch naar de strekking. Gebruik uitsluitend hadith- of ayah-tekst die je letterlijk elders in deze prompt is aangereikt; is daarover niets aangereikt, geef dan algemene geloofsaanmoediging zonder een hadith of ayah te vertellen.
- ${NAME_FIDELITY_RULE.nl}

Antwoord alleen in JSON:
{"tips": ["tip 1", "tip 2", ...]}`;

      const userPrompt = isAr
        ? `بناءً على المعلومات التالية، أعطني 5-7 نصائح سريعة عملية الآن:\n\nالوقت: ${timeLabel}\nالموسم: ${input.season}\nالمكان: ${input.location}\nالأطفال: ${input.childrenAges.join("، ")}\n${parentInfo}\n${envInfo}${checkinContext}${issuesContext}${hijriContext}`
        : isEn
        ? `Based on the following, give me 5-7 quick practical tips for right now:\n\nTime: ${timeLabel}\nSeason: ${input.season}\nLocation: ${input.location}\nChildren: ${input.childrenAges.join(", ")}\n${parentInfo}\n${envInfo}${checkinContext}${issuesContext}${hijriContext}`
        : `Op basis van het volgende, geef mij 5-7 snelle praktische tips voor nu:\n\nTijd: ${timeLabel}\nSeizoen: ${input.season}\nLocatie: ${input.location}\nKinderen: ${input.childrenAges.join(", ")}\n${parentInfo}\n${envInfo}${checkinContext}${issuesContext}${hijriContext}`;

      try {
        const result = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        });

        const content = result;
        let rawText = typeof content === "string" ? content : "";

        // Post-process
        if (isAr) {
          rawText = sanitizeArabicText(rawText);
        } else {
          rawText = correctTranscription(rawText, isEn ? "en" : "nl");
        }

        // Parse JSON tips
        try {
          let jsonStr = rawText.trim();
          if (jsonStr.startsWith("```")) {
            jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
          }
          const parsed = JSON.parse(jsonStr);
          if (parsed.tips && Array.isArray(parsed.tips)) {
            // Strip after parsing, per tip — see the getGeneralAdvice
            // comment above on why stripping rawText before JSON.parse can
            // bridge and corrupt two different tips' text.
            return { tips: parsed.tips.map(stripMarkdownEmphasis) };
          }
        } catch (parseErr) {
          // Fallback: split by newlines
          const lines = rawText.split("\n").filter(l => l.trim().length > 10).map(l => stripMarkdownEmphasis(l.replace(/^[\d\-\*\.]+\s*/, "").trim()));
          if (lines.length > 0) {
            return { tips: lines.slice(0, 7) };
          }
        }

        return { tips: [isAr ? "ابدأ يومك بذكر الله والدعاء لأولادك بالهداية والصلاح." : isEn ? "Start your day by remembering Allaah and making du'aa for your children's guidance." : "Begin uw dag met het gedenken van Allaah en maak du'aa voor de leiding van uw kinderen."] };
      } catch (error) {
        console.error("Quick tips error:", error);
        return { tips: [isAr ? "ابدأ يومك بذكر الله والدعاء لأولادك بالهداية والصلاح." : isEn ? "Start your day by remembering Allaah and making du'aa for your children's guidance." : "Begin uw dag met het gedenken van Allaah en maak du'aa voor de leiding van uw kinderen."] };
      }
    }),
});
