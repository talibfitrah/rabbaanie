import { useState } from "react";
import { ScrollView, Text, View, TouchableOpacity, TextInput, Alert, ActivityIndicator } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { useL3 } from "@/lib/admin-text";
import { trpc } from "@/lib/trpc";

type SectionType = "intro" | "islamic_context" | "practical" | "examples" | "action_steps" | "dua" | "conclusion" | "hadieth" | "story" | "custom";

interface ArticleSection {
  type: SectionType;
  title: string;
  description: string;
}

export default function ArticleGeneratorScreen() {
  const colors = useColors();
  const { isRTL } = useI18n();
  const L3 = useL3();

  // These are prompt settings sent to the AI, not DB-stored enum keys, so the
  // Dutch `key` (unchanged) stays the submitted value — only what's displayed
  // switches with L3, mirroring content.tsx's TYPES array.
  const CATEGORIES = [
    { key: "Aqeedah & Tawheed", label: L3("العقيدة والتوحيد", "Aqeedah & Tawheed", "Aqeedah & Tawheed") },
    { key: "Ibadah & Gebed", label: L3("العبادة والصلاة", "Ibadah & Gebed", "Ibadah & Prayer") },
    { key: "Qur'aan & Dhikr", label: L3("القرآن والذكر", "Qur'aan & Dhikr", "Qur'aan & Dhikr") },
    { key: "Akhlaq & Gedrag", label: L3("الأخلاق والسلوك", "Akhlaq & Gedrag", "Akhlaq & Behavior") },
    { key: "Tarbiyah & Opvoeding", label: L3("التربية", "Tarbiyah & Opvoeding", "Tarbiyah & Parenting") },
    { key: "Emotionele ontwikkeling", label: L3("التطور العاطفي", "Emotionele ontwikkeling", "Emotional development") },
    { key: "Sociale vaardigheden", label: L3("المهارات الاجتماعية", "Sociale vaardigheden", "Social skills") },
    { key: "Onderwijs & Leren", label: L3("التعليم والتعلّم", "Onderwijs & Leren", "Education & Learning") },
    { key: "Gezondheid & Voeding", label: L3("الصحة والتغذية", "Gezondheid & Voeding", "Health & Nutrition") },
    { key: "Media & Technologie", label: L3("الإعلام والتقنية", "Media & Technologie", "Media & Technology") },
    { key: "Puberiteit & Adolescentie", label: L3("البلوغ والمراهقة", "Puberiteit & Adolescentie", "Puberty & Adolescence") },
    { key: "Huwelijk & Gezin", label: L3("الزواج والأسرة", "Huwelijk & Gezin", "Marriage & Family") },
    { key: "Ramadan & Feestdagen", label: L3("رمضان والأعياد", "Ramadan & Feestdagen", "Ramadan & Holidays") },
  ];

  const AGE_RANGES = [
    { key: "0-2 jaar", label: L3("0-2 سنة", "0-2 jaar", "0-2 yrs") },
    { key: "3-5 jaar", label: L3("3-5 سنة", "3-5 jaar", "3-5 yrs") },
    { key: "5-7 jaar", label: L3("5-7 سنة", "5-7 jaar", "5-7 yrs") },
    { key: "7-10 jaar", label: L3("7-10 سنة", "7-10 jaar", "7-10 yrs") },
    { key: "10-12 jaar", label: L3("10-12 سنة", "10-12 jaar", "10-12 yrs") },
    { key: "12-16 jaar", label: L3("12-16 سنة", "12-16 jaar", "12-16 yrs") },
    { key: "Alle leeftijden", label: L3("كل الأعمار", "Alle leeftijden", "All ages") },
  ];

  const SEASONS = [
    { key: "Ramadan", label: L3("رمضان", "Ramadan", "Ramadan") },
    { key: "Dhul Hijjah / Eid al-Adha", label: L3("ذو الحجة / عيد الأضحى", "Dhul Hijjah / Eid al-Adha", "Dhul Hijjah / Eid al-Adha") },
    { key: "Muharram / Nieuwjaar", label: L3("محرم / رأس السنة", "Muharram / Nieuwjaar", "Muharram / New Year") },
    { key: "Rabi al-Awwal / Mawlid", label: L3("ربيع الأول / المولد", "Rabi al-Awwal / Mawlid", "Rabi al-Awwal / Mawlid") },
    { key: "Schoolstart (september)", label: L3("بداية العام الدراسي (سبتمبر)", "Schoolstart (september)", "Start of school year (September)") },
    { key: "Wintervakantie", label: L3("عطلة الشتاء", "Wintervakantie", "Winter break") },
    { key: "Zomervakantie", label: L3("عطلة الصيف", "Zomervakantie", "Summer break") },
    { key: "Examenperiode", label: L3("فترة الامتحانات", "Examenperiode", "Exam period") },
    { key: "Geen specifiek seizoen", label: L3("لا يوجد موسم محدد", "Geen specifiek seizoen", "No specific season") },
  ];

  const AUDIENCES = [
    { key: "Moeders", label: L3("الأمهات", "Moeders", "Mothers") },
    { key: "Vaders", label: L3("الآباء", "Vaders", "Fathers") },
    { key: "Beide ouders", label: L3("كلا الوالدين", "Beide ouders", "Both parents") },
    { key: "Leraren", label: L3("المعلمون", "Leraren", "Teachers") },
    { key: "Pedagogisch begeleiders", label: L3("المشرفون التربويّون", "Pedagogisch begeleiders", "Educational specialists") },
    { key: "Tieners", label: L3("المراهقون", "Tieners", "Teens") },
    { key: "Algemeen", label: L3("عام", "Algemeen", "General") },
  ];

  const TONES = [
    { key: "Warm & bemoedigend", label: L3("دافئ ومشجّع", "Warm & bemoedigend", "Warm & encouraging") },
    { key: "Informatief & educatief", label: L3("معلوماتي وتربوي", "Informatief & educatief", "Informative & educational") },
    { key: "Spiritueel & reflectief", label: L3("روحاني وتأملي", "Spiritueel & reflectief", "Spiritual & reflective") },
    { key: "Praktisch & direct", label: L3("عملي ومباشر", "Praktisch & direct", "Practical & direct") },
    { key: "Wetenschappelijk onderbouwd", label: L3("مبني على أساس علمي", "Wetenschappelijk onderbouwd", "Scientifically grounded") },
  ];

  const DEFAULT_SECTIONS: ArticleSection[] = [
    { type: "intro", title: L3("المقدمة", "Inleiding", "Introduction"), description: L3("افتتاحية جذابة تُعرّف بالموضوع", "Pakkende opening die het onderwerp introduceert", "An engaging opening that introduces the topic") },
    { type: "islamic_context", title: L3("الأساس الشرعي", "Islamitische basis", "Islamic foundation"), description: L3("الاستدلال بالقرآن والحديث", "Qur'aan en Hadieth onderbouwing", "Qur'aan and Hadith evidence") },
    { type: "practical", title: L3("نصائح عملية", "Praktisch advies", "Practical advice"), description: L3("نصائح ملموسة للوالدين", "Concrete tips voor ouders", "Concrete tips for parents") },
    { type: "examples", title: L3("أمثلة", "Voorbeelden", "Examples"), description: L3("مواقف مألوفة من الحياة اليومية", "Herkenbare situaties uit het dagelijks leven", "Relatable everyday situations") },
    { type: "action_steps", title: L3("خطوات عملية", "Actiestappen", "Action steps"), description: L3("خطة تدريجية", "Stap-voor-stap plan", "Step-by-step plan") },
    { type: "dua", title: L3("دعاء", "Du'a", "Du'a"), description: L3("دعاء مناسب للموضوع", "Relevante smeekbede", "A relevant supplication") },
    { type: "conclusion", title: L3("الخاتمة", "Conclusie", "Conclusion"), description: L3("تلخيص وتحفيز", "Samenvatting en aanmoediging", "Summary and encouragement") },
  ];

  const [sourceContent, setSourceContent] = useState("");
  const [category, setCategory] = useState<string>(CATEGORIES[0].key);
  const [ageRange, setAgeRange] = useState<string>(AGE_RANGES[6].key);
  const [season, setSeason] = useState<string>(SEASONS[8].key);
  const [audience, setAudience] = useState<string>(AUDIENCES[3].key);
  const [tone, setTone] = useState<string>(TONES[0].key);
  const [includeHadieth, setIncludeHadieth] = useState(true);
  const [includeQuraan, setIncludeQuraan] = useState(true);
  const [publishNow, setPublishNow] = useState(false);
  const [sections, setSections] = useState<ArticleSection[]>(DEFAULT_SECTIONS);
  const [generatedArticle, setGeneratedArticle] = useState<any>(null);
  const [showSettings, setShowSettings] = useState(true);
  const [showStructure, setShowStructure] = useState(false);

  const generateMutation = trpc.admin.generateArticle.useMutation({
    onSuccess: (data) => {
      setGeneratedArticle(data);
      Alert.alert(L3("تم", "Succes", "Success"), L3("تمّ توليد المقال بنجاح!", "Artikel succesvol gegenereerd!", "Article generated successfully!"));
    },
    onError: (error) => {
      Alert.alert(L3("خطأ", "Fout", "Error"), error.message || L3("حدث خطأ أثناء التوليد.", "Er is een fout opgetreden bij het genereren.", "An error occurred while generating."));
    },
  });

  const handleGenerate = () => {
    if (!sourceContent.trim()) {
      Alert.alert(L3("خطأ", "Fout", "Error"), L3("أدخل مادةً مصدرًا لتوليد مقال.", "Voer bronmateriaal in om een artikel te genereren.", "Enter source material to generate an article."));
      return;
    }
    generateMutation.mutate({
      sourceContent,
      structure: { sections },
      settings: {
        language: "all",
        category,
        ageRange,
        audience,
        tone,
        season: season !== "Geen specifiek seizoen" ? season : undefined,
        includeHadith: includeHadieth,
        includeQuran: includeQuraan,
        maxWords: 1500,
      },
      publishSettings: {
        publishNow,
      },
    });
  };

  const addSection = () => {
    setSections([...sections, { type: "custom", title: L3("قسم جديد", "Nieuw onderdeel", "New section"), description: L3("الوصف", "Beschrijving", "Description") }]);
  };

  const removeSection = (index: number) => {
    setSections(sections.filter((_, i) => i !== index));
  };

  const updateSection = (index: number, field: keyof ArticleSection, value: string) => {
    const updated = [...sections];
    updated[index] = { ...updated[index], [field]: value };
    setSections(updated);
  };

  return (
    <ScreenContainer className="flex-1">
      <ScrollView className="flex-1 px-4 pt-4">
        <Text className="text-2xl font-bold text-foreground mb-1">{L3("مولّد المقالات", "Artikelgenerator", "Article generator")}</Text>
        <Text className="text-sm text-muted mb-4">{L3("توليد مقالات تربوية إسلامية من مادة مصدر", "Genereer islamitische opvoedingsartikelen vanuit bronmateriaal", "Generate Islamic parenting articles from source material")}</Text>

        {/* Source Content */}
        <View className="bg-surface rounded-xl p-4 border border-border mb-4">
          <Text className="text-sm font-semibold text-foreground mb-2">{L3("المادة المصدر *", "Bronmateriaal *", "Source material *")}</Text>
          <Text className="text-xs text-muted mb-2">
            {L3("الصق هنا نصًا من كتب أو مقالات أو محاضرات أو ملاحظاتك الخاصة. سيولّد الذكاء الاصطناعي مقالًا احترافيًا بناءً عليه.", "Plak hier tekst uit boeken, artikelen, lezingen of eigen notities. De AI genereert een professioneel artikel op basis hiervan.", "Paste text from books, articles, lectures or your own notes here. The AI generates a professional article based on it.")}
          </Text>
          <TextInput
            value={sourceContent}
            onChangeText={setSourceContent}
            placeholder={L3("الصق هنا المادة المصدر (نص من كتاب أو محاضرة أو ملاحظات)...", "Plak hier het bronmateriaal (tekst uit boek, lezing, notities)...", "Paste the source material here (text from a book, lecture, notes)...")}
            placeholderTextColor={colors.muted}
            multiline
            numberOfLines={8}
            style={{
              backgroundColor: colors.background,
              color: colors.foreground,
              borderRadius: 12,
              padding: 12,
              fontSize: 14,
              minHeight: 150,
              textAlignVertical: "top",
              borderWidth: 1,
              borderColor: colors.border,
              textAlign: isRTL ? "right" : "left",
            }}
          />
        </View>

        {/* Settings */}
        <TouchableOpacity onPress={() => setShowSettings(!showSettings)} className="flex-row justify-between items-center mb-2" style={{ flexDirection: isRTL ? "row-reverse" : "row" }}>
          <Text className="text-lg font-bold text-foreground">{L3("الإعدادات", "Instellingen", "Settings")}</Text>
          <Text className="text-muted">{showSettings ? "▼" : "▶"}</Text>
        </TouchableOpacity>

        {showSettings && (
          <View className="bg-surface rounded-xl p-4 border border-border mb-4">
            {/* Category */}
            <Text className="text-sm font-semibold text-foreground mb-2">{L3("التصنيف", "Categorie", "Category")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4" contentContainerStyle={{ gap: 6, flexDirection: isRTL ? "row-reverse" : "row" }}>
              {CATEGORIES.map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => setCategory(opt.key)}
                  style={{ backgroundColor: category === opt.key ? colors.primary : colors.background, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: colors.border }}
                >
                  <Text style={{ color: category === opt.key ? "#fff" : colors.foreground, fontSize: 12 }}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Age Range */}
            <Text className="text-sm font-semibold text-foreground mb-2">{L3("الفئة العمرية", "Leeftijdsgroep", "Age group")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4" contentContainerStyle={{ gap: 6, flexDirection: isRTL ? "row-reverse" : "row" }}>
              {AGE_RANGES.map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => setAgeRange(opt.key)}
                  style={{ backgroundColor: ageRange === opt.key ? colors.primary : colors.background, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: colors.border }}
                >
                  <Text style={{ color: ageRange === opt.key ? "#fff" : colors.foreground, fontSize: 12 }}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Season */}
            <Text className="text-sm font-semibold text-foreground mb-2">{L3("الموسم / الفترة", "Seizoen / Periode", "Season / Period")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4" contentContainerStyle={{ gap: 6, flexDirection: isRTL ? "row-reverse" : "row" }}>
              {SEASONS.map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => setSeason(opt.key)}
                  style={{ backgroundColor: season === opt.key ? colors.primary : colors.background, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: colors.border }}
                >
                  <Text style={{ color: season === opt.key ? "#fff" : colors.foreground, fontSize: 12 }}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Audience */}
            <Text className="text-sm font-semibold text-foreground mb-2">{L3("الفئة المستهدفة", "Doelgroep", "Audience")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4" contentContainerStyle={{ gap: 6, flexDirection: isRTL ? "row-reverse" : "row" }}>
              {AUDIENCES.map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => setAudience(opt.key)}
                  style={{ backgroundColor: audience === opt.key ? colors.primary : colors.background, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: colors.border }}
                >
                  <Text style={{ color: audience === opt.key ? "#fff" : colors.foreground, fontSize: 12 }}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Tone */}
            <Text className="text-sm font-semibold text-foreground mb-2">{L3("الأسلوب", "Toon", "Tone")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4" contentContainerStyle={{ gap: 6, flexDirection: isRTL ? "row-reverse" : "row" }}>
              {TONES.map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => setTone(opt.key)}
                  style={{ backgroundColor: tone === opt.key ? colors.primary : colors.background, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: colors.border }}
                >
                  <Text style={{ color: tone === opt.key ? "#fff" : colors.foreground, fontSize: 12 }}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Toggles */}
            <View className="flex-row gap-4 mb-2" style={{ flexDirection: isRTL ? "row-reverse" : "row" }}>
              <TouchableOpacity onPress={() => setIncludeHadieth(!includeHadieth)} className="flex-row items-center gap-2" style={{ flexDirection: isRTL ? "row-reverse" : "row" }}>
                <View style={{ width: 20, height: 20, borderRadius: 4, backgroundColor: includeHadieth ? colors.primary : colors.background, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}>
                  {includeHadieth && <Text style={{ color: "#fff", fontSize: 12 }}>✓</Text>}
                </View>
                <Text className="text-sm text-foreground">{L3("إضافة حديث", "Hadieth toevoegen", "Add Hadith")}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setIncludeQuraan(!includeQuraan)} className="flex-row items-center gap-2" style={{ flexDirection: isRTL ? "row-reverse" : "row" }}>
                <View style={{ width: 20, height: 20, borderRadius: 4, backgroundColor: includeQuraan ? colors.primary : colors.background, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}>
                  {includeQuraan && <Text style={{ color: "#fff", fontSize: 12 }}>✓</Text>}
                </View>
                <Text className="text-sm text-foreground">{L3("إضافة قرآن", "Qur'aan toevoegen", "Add Qur'aan")}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={() => setPublishNow(!publishNow)} className="flex-row items-center gap-2 mt-2" style={{ flexDirection: isRTL ? "row-reverse" : "row" }}>
              <View style={{ width: 20, height: 20, borderRadius: 4, backgroundColor: publishNow ? colors.success : colors.background, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}>
                {publishNow && <Text style={{ color: "#fff", fontSize: 12 }}>✓</Text>}
              </View>
              <Text className="text-sm text-foreground">{L3("نشر مباشرةً", "Direct publiceren", "Publish immediately")}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Article Structure */}
        <TouchableOpacity onPress={() => setShowStructure(!showStructure)} className="flex-row justify-between items-center mb-2" style={{ flexDirection: isRTL ? "row-reverse" : "row" }}>
          <Text className="text-lg font-bold text-foreground">{L3("بنية المقال", "Artikelstructuur", "Article structure")}</Text>
          <Text className="text-muted">{showStructure ? "▼" : "▶"}</Text>
        </TouchableOpacity>

        {showStructure && (
          <View className="bg-surface rounded-xl p-4 border border-border mb-4">
            <Text className="text-xs text-muted mb-3">{L3("عدّل بنية المقال. اسحب الأقسام أو أضف أقسامًا جديدة.", "Pas de opbouw van het artikel aan. Sleep onderdelen of voeg nieuwe toe.", "Adjust the article's structure. Drag sections or add new ones.")}</Text>
            {sections.map((section, index) => (
              <View key={index} className="flex-row items-center mb-2 gap-2" style={{ flexDirection: isRTL ? "row-reverse" : "row" }}>
                <Text className="text-xs text-muted w-5">{index + 1}.</Text>
                <View className="flex-1">
                  <TextInput
                    value={section.title}
                    onChangeText={(v) => updateSection(index, "title", v)}
                    style={{ backgroundColor: colors.background, color: colors.foreground, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 13, borderWidth: 1, borderColor: colors.border, textAlign: isRTL ? "right" : "left" }}
                  />
                  <TextInput
                    value={section.description}
                    onChangeText={(v) => updateSection(index, "description", v)}
                    style={{ backgroundColor: colors.background, color: colors.muted, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, fontSize: 11, marginTop: 4, borderWidth: 1, borderColor: colors.border, textAlign: isRTL ? "right" : "left" }}
                  />
                </View>
                <TouchableOpacity onPress={() => removeSection(index)} style={{ padding: 6 }}>
                  <Text style={{ color: colors.error, fontSize: 16 }}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity onPress={addSection} style={{ backgroundColor: colors.background, borderRadius: 8, padding: 10, marginTop: 8, alignItems: "center", borderWidth: 1, borderColor: colors.border, borderStyle: "dashed" }}>
              <Text style={{ color: colors.primary, fontSize: 13 }}>{L3("+ إضافة قسم", "+ Onderdeel toevoegen", "+ Add section")}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Generate Button */}
        <TouchableOpacity
          onPress={handleGenerate}
          disabled={generateMutation.isPending || !sourceContent.trim()}
          style={{
            backgroundColor: sourceContent.trim() ? colors.primary : colors.muted,
            borderRadius: 12,
            padding: 16,
            alignItems: "center",
            marginBottom: 16,
            opacity: generateMutation.isPending ? 0.7 : 1,
          }}
        >
          {generateMutation.isPending ? (
            <View className="flex-row items-center gap-2" style={{ flexDirection: isRTL ? "row-reverse" : "row" }}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>{L3("جارٍ توليد المقال...", "Artikel genereren...", "Generating article...")}</Text>
            </View>
          ) : (
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>{L3("توليد المقال", "Artikel genereren", "Generate article")}</Text>
          )}
        </TouchableOpacity>

        {/* Generated Article Preview */}
        {generatedArticle && (
          <View className="bg-surface rounded-xl p-4 border border-border mb-6">
            <Text className="text-lg font-bold text-foreground mb-2">{L3("المقال المُولَّد", "Gegenereerd artikel", "Generated article")}</Text>
            <Text className="text-base font-semibold text-primary mb-2">{generatedArticle.titleNl}</Text>
            {generatedArticle.excerptNl && (
              <Text className="text-sm text-muted italic mb-3">{generatedArticle.excerptNl}</Text>
            )}
            <View className="bg-background rounded-lg p-3 mb-3">
              <Text className="text-xs text-foreground" numberOfLines={20}>{generatedArticle.contentNl}</Text>
            </View>
            {generatedArticle.source && (
              <View className="bg-primary/10 rounded-lg p-3">
                <Text className="text-xs font-semibold text-primary mb-1">{L3("المصدر:", "Bron:", "Source:")}</Text>
                <Text className="text-xs text-foreground">{generatedArticle.source}</Text>
              </View>
            )}
            <View className="flex-row gap-2 mt-3" style={{ flexDirection: isRTL ? "row-reverse" : "row" }}>
              {generatedArticle.tags?.map((tag: string, i: number) => (
                <View key={i} style={{ backgroundColor: colors.background, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text className="text-xs text-muted">{tag}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View className="h-20" />
      </ScrollView>
    </ScreenContainer>
  );
}
