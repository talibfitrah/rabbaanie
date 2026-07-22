import type { Express } from "express";
import { invokeLLM } from "./_core/llm";

// Cache for morphology data fetched from corpus
const morphologyCache: Record<string, string> = {};

/**
 * Fetch morphology/i'rab data from Quranic Arabic Corpus (GitHub)
 * Format: each line is "LOCATION|FORM|TAG|FEATURES"
 * e.g., "(1:1:1:1)|bi|P|PREFIX|bi+ <pos>P</pos>"
 */
async function fetchMorphologyForVerse(surah: number, ayah: number): Promise<string | null> {
  const cacheKey = `${surah}:${ayah}`;
  if (morphologyCache[cacheKey]) return morphologyCache[cacheKey];

  try {
    // Fetch from the Quranic Arabic Corpus raw data on GitHub
    const url = `https://raw.githubusercontent.com/mustafa0x/quran-morphology/master/declension.txt`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return null;
    
    const text = await response.text();
    // Filter lines for this specific verse
    const prefix = `(${surah}:${ayah}:`;
    const verseLines = text.split("\n").filter(line => line.startsWith(prefix));
    
    if (verseLines.length === 0) return null;

    // Parse morphology data into readable Arabic i'rab
    const result = parseCorpusMorphology(verseLines, surah, ayah);
    if (result) {
      morphologyCache[cacheKey] = result;
    }
    return result;
  } catch {
    return null;
  }
}

/**
 * Parse corpus morphology lines into readable Arabic grammar analysis
 */
function parseCorpusMorphology(lines: string[], surah: number, ayah: number): string {
  const words: Map<number, { segments: { word: string; type: string; details: string }[] }> = new Map();

  for (const line of lines) {
    // Format: (surah:ayah:word:segment)|form|tag|features
    const match = line.match(/^\((\d+):(\d+):(\d+):(\d+)\)\t([^\t]*)\t([^\t]*)\t(.*)$/);
    if (!match) continue;

    const wordPos = parseInt(match[3]);
    const form = match[5] || "";
    const tag = match[6] || "";
    const features = match[7] || "";

    if (!words.has(wordPos)) {
      words.set(wordPos, { segments: [] });
    }

    // Convert POS tags to Arabic grammar terms
    const arabicType = posToArabic(tag, features);
    const details = featuresToArabic(features, tag);

    words.get(wordPos)!.segments.push({
      word: form,
      type: arabicType,
      details,
    });
  }

  if (words.size === 0) return "";

  // Format output
  const result: string[] = [];
  result.push(`┌─ إعراب الآية ${surah}:${ayah} ─┐\n`);

  for (const [, { segments }] of words) {
    const fullWord = segments.filter(Boolean).map(s => s.word).join("");
    result.push(`◆ ${fullWord}`);
    for (const seg of segments) {
      if (!seg) continue;
      if (seg.details) {
        result.push(`   ${seg.type}: ${seg.details}`);
      } else {
        result.push(`   ${seg.type}`);
      }
    }
    result.push("");
  }

  return result.join("\n");
}

function posToArabic(tag: string, features: string): string {
  const map: Record<string, string> = {
    "N": "اسم",
    "PN": "اسم علم",
    "ADJ": "صفة",
    "V": "فعل",
    "IMPV": "فعل أمر",
    "PV": "فعل ماضٍ",
    "IV": "فعل مضارع",
    "P": "حرف جر",
    "CONJ": "حرف عطف",
    "DET": "أداة تعريف",
    "REL": "اسم موصول",
    "DEM": "اسم إشارة",
    "PRON": "ضمير",
    "NEG": "حرف نفي",
    "INTG": "اسم استفهام",
    "COND": "أداة شرط",
    "RES": "حرف جواب",
    "CERT": "حرف تحقيق",
    "SUP": "حرف دعاء",
    "EXH": "حرف تحضيض",
    "AMD": "حرف استدراك",
    "ANS": "حرف جواب",
    "AVR": "حرف ردع",
    "INC": "حرف ابتداء",
    "SUR": "حرف مفاجأة",
    "LOC": "ظرف مكان",
    "T": "ظرف زمان",
    "ACC": "حرف نصب",
    "EMPH": "نون التوكيد",
    "CIRC": "واو الحال",
    "COM": "واو المعية",
    "EXP": "تفسيرية",
    "VOC": "حرف نداء",
    "PREV": "كافة",
  };
  
  // Check for verb forms in features
  if (features.includes("PERF")) return "فعل ماضٍ";
  if (features.includes("IMPF")) return "فعل مضارع";
  if (features.includes("IMPV")) return "فعل أمر";
  
  return map[tag] || tag;
}

function featuresToArabic(features: string, tag: string): string {
  const parts: string[] = [];
  
  if (features.includes("NOM")) parts.push("مرفوع");
  if (features.includes("ACC")) parts.push("منصوب");
  if (features.includes("GEN")) parts.push("مجرور");
  
  if (features.includes("1P")) parts.push("متكلم");
  if (features.includes("2P")) parts.push("مخاطب");
  if (features.includes("3P")) parts.push("غائب");
  
  if (features.includes("MS")) parts.push("مذكر مفرد");
  if (features.includes("FS")) parts.push("مؤنث مفرد");
  if (features.includes("MD")) parts.push("مثنى");
  if (features.includes("MP")) parts.push("جمع مذكر");
  if (features.includes("FP")) parts.push("جمع مؤنث");
  
  if (features.includes("DEF")) parts.push("معرفة");
  if (features.includes("INDEF")) parts.push("نكرة");
  
  if (features.includes("ACT")) parts.push("مبني للمعلوم");
  if (features.includes("PASS")) parts.push("مبني للمجهول");
  
  return parts.join("، ");
}

export function registerQuranRoutes(app: Express) {
  // I'rab (grammatical analysis) endpoint - uses corpus data + LLM fallback
  app.post("/api/quran/iraab", async (req, res) => {
    try {
      const { verseKey, text } = req.body;
      if (!verseKey || !text) {
        return res.status(400).json({ error: "verseKey and text are required" });
      }

      // Parse surah:ayah from verseKey
      const [surahStr, ayahStr] = verseKey.split(":");
      const surah = parseInt(surahStr);
      const ayah = parseInt(ayahStr);

      // Try to get real morphology data from corpus first
      let iraabText = "";
      if (surah && ayah) {
        const corpusData = await fetchMorphologyForVerse(surah, ayah);
        if (corpusData) {
          iraabText = corpusData;
        }
      }

      // If corpus data is empty or failed, use LLM as fallback
      if (!iraabText) {
        const result = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `أنت عالم نحو عربي متخصص في إعراب القرآن الكريم. أعرب الآية التالية إعراباً كاملاً مفصلاً كلمة كلمة.
لكل كلمة اذكر:
- نوعها (اسم/فعل/حرف)
- موقعها الإعرابي (مبتدأ، خبر، فاعل، مفعول به، مضاف إليه، إلخ)
- علامة إعرابها (الضمة، الفتحة، الكسرة، السكون)
- ما يتعلق بها من فوائد نحوية

استخدم هذا التنسيق:
◆ الكلمة
   النوع: ...
   الإعراب: ...
   العلامة: ...`
            },
            {
              role: "user",
              content: `أعرب الآية التالية (${verseKey}):\n\n${text}`
            }
          ],
        });

        const content = result.choices[0]?.message?.content;
        iraabText = typeof content === "string" ? content : Array.isArray(content) ? content.map((c: any) => "text" in c ? c.text : "").join("") : "";
      }

      res.json({ iraab: iraabText.trim() });
    } catch (error: any) {
      console.error("Quran i'rab error:", error.message);
      res.status(500).json({ iraab: "خطأ في تحميل الإعراب. يرجى المحاولة لاحقًا.", error: error.message });
    }
  });

  // Hidayat (6 guidance points per verse) endpoint
  app.post("/api/quran/hidayat", async (req, res) => {
    try {
      const { verseKey, text, language } = req.body;
      if (!verseKey || !text) {
        return res.status(400).json({ error: "verseKey and text are required" });
      }

      const lang = language || "ar";
      const langInstruction = lang === "nl" ? "\n\nAntwoord VOLLEDIG in het Nederlands." : lang === "en" ? "\n\nRespond ENTIRELY in English." : "";

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 55000); // 55s timeout
      const result = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `استخرج الهدايات القرآنية من الآية المعطاة مباشرةً دون مقدمات.

المصادر الحصرية: تفسير ابن كثير، تفسير السعدي، تفسير الطبري، تفسير البغوي، كتب ابن تيمية وابن القيم.
لا تستخدم مصادر أخرى. لا تبدأ بـ"بصفتي" أو "أنا عالم" أو أي مقدمة. ابدأ بالمحتوى مباشرة.

استخرج 6 هدايات:
١. هداية عقدية: ما تدل عليه الآية من أمور الإيمان والتوحيد
٢. هداية سلوكية: ما تدل عليه من أعمال وأخلاق
٣. هداية تربوية: ما يُستفاد في تربية النفس والأولاد
٤. هداية قلبية: أعمال القلوب (خوف، رجاء، محبة، توكل)
٥. هداية اجتماعية: آداب التعامل مع الناس
٦. فائدة لغوية/بلاغية

التنسيق المطلوب:
١. [العنوان]: الشرح في 2-3 أسطر. (الدليل: "نص من الآية")
٢. [العنوان]: ...
...حتى ٦${langInstruction}`
          },
          {
            role: "user",
            content: `الآية ${verseKey}: ${text}`
          }
        ],
      });

      clearTimeout(timeoutId);
      const content = result.choices[0]?.message?.content;
      const rawText = typeof content === "string" ? content : Array.isArray(content) ? content.map((c: any) => "text" in c ? c.text : "").join("") : "";

      res.json({ hidayat: rawText.trim() || "لا توجد هدايات متاحة لهذه الآية" });
    } catch (error: any) {
      console.error("Quran hidayat error:", error.message);
      res.status(500).json({ hidayat: "خطأ في تحميل الهدايات. يرجى المحاولة لاحقًا.", error: error.message });
    }
  });

  // Surah info endpoint
  app.post("/api/quran/surah-info", async (req, res) => {
    try {
      const { surahNumber, language } = req.body;
      if (!surahNumber) {
        return res.status(400).json({ error: "surahNumber is required" });
      }

      const lang = language || "ar";
      const langInstruction = lang === "nl" ? "\n\nAntwoord VOLLEDIG in het Nederlands." : lang === "en" ? "\n\nRespond ENTIRELY in English." : "";

      const controller2 = new AbortController();
      const timeoutId2 = setTimeout(() => controller2.abort(), 55000);
      const result = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `قدّم معلومات عن السورة مباشرةً دون مقدمات.

المصادر الحصرية: تفسير ابن كثير، تفسير السعدي، تفسير الطبري، تفسير البغوي، كتب ابن تيمية وابن القيم.
لا تستخدم مصادر أخرى. لا تبدأ بـ"بصفتي" أو "أنا عالم" أو أي مقدمة. ابدأ بالمحتوى مباشرة.

البنود المطلوبة:
١. اسم السورة وسبب التسمية
٢. مكية أم مدنية
٣. موضوعاتها الرئيسية
٤. مقاصدها
٥. فضلها (أحاديث صحيحة فقط)
٦. علاقتها بما قبلها وما بعدها

اكتب بأسلوب واضح ومنظم ومختصر.${langInstruction}`
          },
          {
            role: "user",
            content: `السورة رقم ${surahNumber}`
          }
        ],
      });
      clearTimeout(timeoutId2);

      const content = result.choices[0]?.message?.content;
      const rawText = typeof content === "string" ? content : Array.isArray(content) ? content.map((c: any) => "text" in c ? c.text : "").join("") : "";

      res.json({ info: rawText.trim() });
    } catch (error: any) {
      console.error("Quran surah-info error:", error.message);
      if (error?.name === "AbortError") {
        res.status(504).json({ info: "انتهت المهلة. حاول مرة أخرى.", error: "timeout" });
      } else {
        res.status(500).json({ info: "خطأ في تحميل معلومات السورة. يرجى المحاولة لاحقًا.", error: error.message });
      }
    }
  });
}
