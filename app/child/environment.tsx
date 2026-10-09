import React, { useState, useRef, useCallback } from "react";
import { View, Text, Pressable, ScrollView, Alert, LayoutChangeEvent } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/use-colors";
import { useAppState } from "@/lib/app-context";
import { ChildEnvironment } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { FormField, TextField, SelectField, HybridField, HonestyBanner, ValidationBanner, HasanaatProgressBar } from "@/components/form-field";
import { PremiumGate } from "@/components/premium-notice";
import { getEnvQuestions } from "@/lib/environment-questions";

type Lang = "nl" | "en" | "ar";

function tx(lang: Lang, nl: string, en: string, ar: string): string {
  return lang === "ar" ? ar : lang === "en" ? en : nl;
}


function EnvironmentScreenInner() {
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

/**
 * Paid feature: advertised on the subscribe screen, so it is closed to
 * non-subscribers rather than shown with a banner over it. Wrapping rather
 * than an early return means every return path inside is covered, and the
 * inner component's hooks never run for a non-subscriber.
 */
export default function EnvironmentScreen() {
  return (
    <PremiumGate>
      <EnvironmentScreenInner />
    </PremiumGate>
  );
}
