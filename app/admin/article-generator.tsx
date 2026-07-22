import { useState } from "react";
import { ScrollView, Text, View, TouchableOpacity, TextInput, Alert, ActivityIndicator } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

type SectionType = "intro" | "islamic_context" | "practical" | "examples" | "action_steps" | "dua" | "conclusion" | "hadieth" | "story" | "custom";

interface ArticleSection {
  type: SectionType;
  title: string;
  description: string;
}

const DEFAULT_SECTIONS: ArticleSection[] = [
  { type: "intro", title: "Inleiding", description: "Pakkende opening die het onderwerp introduceert" },
  { type: "islamic_context", title: "Islamitische basis", description: "Qur'aan en Hadieth onderbouwing" },
  { type: "practical", title: "Praktisch advies", description: "Concrete tips voor ouders" },
  { type: "examples", title: "Voorbeelden", description: "Herkenbare situaties uit het dagelijks leven" },
  { type: "action_steps", title: "Actiestappen", description: "Stap-voor-stap plan" },
  { type: "dua", title: "Du'a", description: "Relevante smeekbede" },
  { type: "conclusion", title: "Conclusie", description: "Samenvatting en aanmoediging" },
];

const CATEGORIES = [
  "Aqeedah & Tawheed", "Ibadah & Gebed", "Qur'aan & Dhikr", "Akhlaq & Gedrag",
  "Tarbiyah & Opvoeding", "Emotionele ontwikkeling", "Sociale vaardigheden",
  "Onderwijs & Leren", "Gezondheid & Voeding", "Media & Technologie",
  "Puberiteit & Adolescentie", "Huwelijk & Gezin", "Ramadan & Feestdagen",
];

const AGE_RANGES = ["0-2 jaar", "3-5 jaar", "5-7 jaar", "7-10 jaar", "10-12 jaar", "12-16 jaar", "Alle leeftijden"];

const SEASONS = [
  "Ramadan", "Dhul Hijjah / Eid al-Adha", "Muharram / Nieuwjaar", "Rabi al-Awwal / Mawlid",
  "Schoolstart (september)", "Wintervakantie", "Zomervakantie", "Examenperiode",
  "Geen specifiek seizoen",
];

const AUDIENCES = ["Moeders", "Vaders", "Beide ouders", "Leraren", "Specialisten", "Tieners", "Algemeen"];

const TONES = ["Warm & bemoedigend", "Informatief & educatief", "Spiritueel & reflectief", "Praktisch & direct", "Wetenschappelijk onderbouwd"];

export default function ArticleGeneratorScreen() {
  const colors = useColors();
  const [sourceContent, setSourceContent] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [ageRange, setAgeRange] = useState(AGE_RANGES[6]);
  const [season, setSeason] = useState(SEASONS[8]);
  const [audience, setAudience] = useState(AUDIENCES[3]);
  const [tone, setTone] = useState(TONES[0]);
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
      Alert.alert("Succes", "Artikel succesvol gegenereerd!");
    },
    onError: (error) => {
      Alert.alert("Fout", error.message || "Er is een fout opgetreden bij het genereren.");
    },
  });

  const handleGenerate = () => {
    if (!sourceContent.trim()) {
      Alert.alert("Fout", "Voer bronmateriaal in om een artikel te genereren.");
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
    setSections([...sections, { type: "custom", title: "Nieuw onderdeel", description: "Beschrijving" }]);
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
        <Text className="text-2xl font-bold text-foreground mb-1">Artikelgenerator</Text>
        <Text className="text-sm text-muted mb-4">Genereer islamitische opvoedingsartikelen vanuit bronmateriaal</Text>

        {/* Source Content */}
        <View className="bg-surface rounded-xl p-4 border border-border mb-4">
          <Text className="text-sm font-semibold text-foreground mb-2">Bronmateriaal *</Text>
          <Text className="text-xs text-muted mb-2">
            Plak hier tekst uit boeken, artikelen, lezingen of eigen notities. De AI genereert een professioneel artikel op basis hiervan.
          </Text>
          <TextInput
            value={sourceContent}
            onChangeText={setSourceContent}
            placeholder="Plak hier het bronmateriaal (tekst uit boek, lezing, notities)..."
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
            }}
          />
        </View>

        {/* Settings */}
        <TouchableOpacity onPress={() => setShowSettings(!showSettings)} className="flex-row justify-between items-center mb-2">
          <Text className="text-lg font-bold text-foreground">Instellingen</Text>
          <Text className="text-muted">{showSettings ? "▼" : "▶"}</Text>
        </TouchableOpacity>

        {showSettings && (
          <View className="bg-surface rounded-xl p-4 border border-border mb-4">
            {/* Category */}
            <Text className="text-sm font-semibold text-foreground mb-2">Categorie</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4" contentContainerStyle={{ gap: 6 }}>
              {CATEGORIES.map(cat => (
                <TouchableOpacity
                  key={cat}
                  onPress={() => setCategory(cat)}
                  style={{ backgroundColor: category === cat ? colors.primary : colors.background, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: colors.border }}
                >
                  <Text style={{ color: category === cat ? "#fff" : colors.foreground, fontSize: 12 }}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Age Range */}
            <Text className="text-sm font-semibold text-foreground mb-2">Leeftijdsgroep</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4" contentContainerStyle={{ gap: 6 }}>
              {AGE_RANGES.map(age => (
                <TouchableOpacity
                  key={age}
                  onPress={() => setAgeRange(age)}
                  style={{ backgroundColor: ageRange === age ? colors.primary : colors.background, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: colors.border }}
                >
                  <Text style={{ color: ageRange === age ? "#fff" : colors.foreground, fontSize: 12 }}>{age}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Season */}
            <Text className="text-sm font-semibold text-foreground mb-2">Seizoen / Periode</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4" contentContainerStyle={{ gap: 6 }}>
              {SEASONS.map(s => (
                <TouchableOpacity
                  key={s}
                  onPress={() => setSeason(s)}
                  style={{ backgroundColor: season === s ? colors.primary : colors.background, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: colors.border }}
                >
                  <Text style={{ color: season === s ? "#fff" : colors.foreground, fontSize: 12 }}>{s}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Audience */}
            <Text className="text-sm font-semibold text-foreground mb-2">Doelgroep</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4" contentContainerStyle={{ gap: 6 }}>
              {AUDIENCES.map(a => (
                <TouchableOpacity
                  key={a}
                  onPress={() => setAudience(a)}
                  style={{ backgroundColor: audience === a ? colors.primary : colors.background, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: colors.border }}
                >
                  <Text style={{ color: audience === a ? "#fff" : colors.foreground, fontSize: 12 }}>{a}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Tone */}
            <Text className="text-sm font-semibold text-foreground mb-2">Toon</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4" contentContainerStyle={{ gap: 6 }}>
              {TONES.map(t => (
                <TouchableOpacity
                  key={t}
                  onPress={() => setTone(t)}
                  style={{ backgroundColor: tone === t ? colors.primary : colors.background, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: colors.border }}
                >
                  <Text style={{ color: tone === t ? "#fff" : colors.foreground, fontSize: 12 }}>{t}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Toggles */}
            <View className="flex-row gap-4 mb-2">
              <TouchableOpacity onPress={() => setIncludeHadieth(!includeHadieth)} className="flex-row items-center gap-2">
                <View style={{ width: 20, height: 20, borderRadius: 4, backgroundColor: includeHadieth ? colors.primary : colors.background, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}>
                  {includeHadieth && <Text style={{ color: "#fff", fontSize: 12 }}>✓</Text>}
                </View>
                <Text className="text-sm text-foreground">Hadieth toevoegen</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setIncludeQuraan(!includeQuraan)} className="flex-row items-center gap-2">
                <View style={{ width: 20, height: 20, borderRadius: 4, backgroundColor: includeQuraan ? colors.primary : colors.background, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}>
                  {includeQuraan && <Text style={{ color: "#fff", fontSize: 12 }}>✓</Text>}
                </View>
                <Text className="text-sm text-foreground">Qur'aan toevoegen</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={() => setPublishNow(!publishNow)} className="flex-row items-center gap-2 mt-2">
              <View style={{ width: 20, height: 20, borderRadius: 4, backgroundColor: publishNow ? colors.success : colors.background, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}>
                {publishNow && <Text style={{ color: "#fff", fontSize: 12 }}>✓</Text>}
              </View>
              <Text className="text-sm text-foreground">Direct publiceren</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Article Structure */}
        <TouchableOpacity onPress={() => setShowStructure(!showStructure)} className="flex-row justify-between items-center mb-2">
          <Text className="text-lg font-bold text-foreground">Artikelstructuur</Text>
          <Text className="text-muted">{showStructure ? "▼" : "▶"}</Text>
        </TouchableOpacity>

        {showStructure && (
          <View className="bg-surface rounded-xl p-4 border border-border mb-4">
            <Text className="text-xs text-muted mb-3">Pas de opbouw van het artikel aan. Sleep onderdelen of voeg nieuwe toe.</Text>
            {sections.map((section, index) => (
              <View key={index} className="flex-row items-center mb-2 gap-2">
                <Text className="text-xs text-muted w-5">{index + 1}.</Text>
                <View className="flex-1">
                  <TextInput
                    value={section.title}
                    onChangeText={(v) => updateSection(index, "title", v)}
                    style={{ backgroundColor: colors.background, color: colors.foreground, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 13, borderWidth: 1, borderColor: colors.border }}
                  />
                  <TextInput
                    value={section.description}
                    onChangeText={(v) => updateSection(index, "description", v)}
                    style={{ backgroundColor: colors.background, color: colors.muted, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, fontSize: 11, marginTop: 4, borderWidth: 1, borderColor: colors.border }}
                  />
                </View>
                <TouchableOpacity onPress={() => removeSection(index)} style={{ padding: 6 }}>
                  <Text style={{ color: colors.error, fontSize: 16 }}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity onPress={addSection} style={{ backgroundColor: colors.background, borderRadius: 8, padding: 10, marginTop: 8, alignItems: "center", borderWidth: 1, borderColor: colors.border, borderStyle: "dashed" }}>
              <Text style={{ color: colors.primary, fontSize: 13 }}>+ Onderdeel toevoegen</Text>
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
            <View className="flex-row items-center gap-2">
              <ActivityIndicator color="#fff" size="small" />
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Artikel genereren...</Text>
            </View>
          ) : (
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Artikel genereren</Text>
          )}
        </TouchableOpacity>

        {/* Generated Article Preview */}
        {generatedArticle && (
          <View className="bg-surface rounded-xl p-4 border border-border mb-6">
            <Text className="text-lg font-bold text-foreground mb-2">Gegenereerd artikel</Text>
            <Text className="text-base font-semibold text-primary mb-2">{generatedArticle.titleNl}</Text>
            {generatedArticle.excerptNl && (
              <Text className="text-sm text-muted italic mb-3">{generatedArticle.excerptNl}</Text>
            )}
            <View className="bg-background rounded-lg p-3 mb-3">
              <Text className="text-xs text-foreground" numberOfLines={20}>{generatedArticle.contentNl}</Text>
            </View>
            {generatedArticle.source && (
              <View className="bg-primary/10 rounded-lg p-3">
                <Text className="text-xs font-semibold text-primary mb-1">Bron:</Text>
                <Text className="text-xs text-foreground">{generatedArticle.source}</Text>
              </View>
            )}
            <View className="flex-row gap-2 mt-3">
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
