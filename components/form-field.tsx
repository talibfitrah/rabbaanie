import React from "react";
import { View, Text, TextInput, Pressable, ScrollView } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";

interface FormFieldProps {
  label: string;
  required?: boolean;
  error?: boolean;
  children: React.ReactNode;
  id?: string;
}

export function FormField({ label, required = true, error = false, children, id }: FormFieldProps) {
  const colors = useColors();
  return (
    <View
      className={`mb-4 rounded-xl p-4 ${error ? "border-2" : "border"}`}
      style={{
        backgroundColor: colors.surface,
        borderColor: error ? colors.error : colors.border,
      }}
      accessibilityLabel={id}
    >
      <Text
        className="text-sm font-semibold mb-2"
        style={{ color: error ? colors.error : colors.foreground }}
      >
        {label}
        {required && <Text style={{ color: colors.error }}> *</Text>}
      </Text>
      {children}
    </View>
  );
}

interface TextFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
  error?: boolean;
}

export function TextField({ value, onChangeText, placeholder, multiline = false, error = false }: TextFieldProps) {
  const colors = useColors();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      multiline={multiline}
      numberOfLines={multiline ? 4 : 1}
      className={`rounded-lg px-4 py-3 text-base ${multiline ? "min-h-[100px] text-start" : ""}`}
      style={{
        backgroundColor: colors.background,
        color: colors.foreground,
        borderWidth: 1,
        borderColor: error ? colors.error : colors.border,
        textAlignVertical: multiline ? "top" : "center",
      }}
    />
  );
}

interface SelectOption {
  value: string;
  label: string;
}

// === SELECT FIELD WITH TOGGLE: "اختيار" / "جواب مفتوح" ===
interface SelectFieldProps {
  value: string;
  options: SelectOption[];
  onSelect: (value: string) => void;
  onChangeText?: (text: string) => void;
  error?: boolean;
}

export function SelectField({ value, options, onSelect, onChangeText, error = false }: SelectFieldProps) {
  const colors = useColors();
  const { language } = useI18n();

  const isOptionSelected = options.some(o => o.value === value);
  const [mode, setMode] = React.useState<"choice" | "open">(
    !isOptionSelected && value.length > 0 ? "open" : "choice"
  );

  const choiceLabel = language === "ar" ? "اختيار" : language === "en" ? "Choose" : "Keuze";
  const openLabel = language === "ar" ? "جواب مفتوح" : language === "en" ? "Open answer" : "Open antwoord";
  const placeholder = language === "ar" ? "اكتب إجابتك هنا..." : language === "en" ? "Type your answer here..." : "Typ hier uw antwoord...";

  const handleSwitchToOpen = () => {
    setMode("open");
  };

  const handleSwitchToChoice = () => {
    setMode("choice");
  };

  return (
    <View>
      {/* Toggle buttons: اختيار / جواب مفتوح */}
      <View style={{ flexDirection: "row", marginBottom: 10, gap: 8 }}>
        <Pressable
          onPress={handleSwitchToChoice}
          style={{
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 20,
            backgroundColor: mode === "choice" ? colors.primary : "transparent",
            borderWidth: 1.5,
            borderColor: mode === "choice" ? colors.primary : colors.border,
          }}
        >
          <Text style={{
            fontSize: 13,
            fontWeight: "700",
            color: mode === "choice" ? "#FFFFFF" : colors.muted,
          }}>
            {choiceLabel}
          </Text>
        </Pressable>
        <Pressable
          onPress={handleSwitchToOpen}
          style={{
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 20,
            backgroundColor: mode === "open" ? colors.primary : "transparent",
            borderWidth: 1.5,
            borderColor: mode === "open" ? colors.primary : colors.border,
          }}
        >
          <Text style={{
            fontSize: 13,
            fontWeight: "700",
            color: mode === "open" ? "#FFFFFF" : colors.muted,
          }}>
            {openLabel}
          </Text>
        </Pressable>
      </View>

      {/* Choice mode: show radio options */}
      {mode === "choice" && (
        <View style={{ borderRadius: 12, borderWidth: 1, borderColor: error ? colors.error : colors.border, overflow: "hidden" }}>
          {options.map((option, idx) => (
            <React.Fragment key={option.value}>
              <Pressable
                onPress={() => onSelect(option.value)}
                style={{
                  paddingHorizontal: 16, paddingVertical: 14,
                  backgroundColor: value === option.value ? colors.primary + "15" : colors.background,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <View style={{
                  width: 20, height: 20, borderRadius: 10,
                  borderWidth: 2,
                  borderColor: value === option.value ? colors.primary : colors.border,
                  backgroundColor: value === option.value ? colors.primary : "transparent",
                  alignItems: "center", justifyContent: "center",
                }}>
                  {value === option.value && (
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#FFFFFF" }} />
                  )}
                </View>
                <Text style={{
                  fontSize: 14, fontWeight: value === option.value ? "700" : "500",
                  color: value === option.value ? colors.primary : colors.foreground,
                  flex: 1,
                }}>
                  {option.label}
                </Text>
              </Pressable>
              {idx < options.length - 1 && (
                <View style={{ height: 1, backgroundColor: colors.border, marginHorizontal: 16 }} />
              )}
            </React.Fragment>
          ))}
        </View>
      )}

      {/* Open mode: show text input */}
      {mode === "open" && (
        <TextInput
          value={isOptionSelected ? "" : value}
          onChangeText={(text) => {
            if (onChangeText) {
              onChangeText(text);
            } else {
              onSelect(text);
            }
          }}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          multiline
          numberOfLines={3}
          style={{
            backgroundColor: colors.background,
            color: colors.foreground,
            borderWidth: 1.5,
            borderColor: error ? colors.error : colors.primary + "60",
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 12,
            fontSize: 14,
            minHeight: 80,
            textAlignVertical: "top",
            textAlign: language === "ar" ? "right" : "left",
          }}
        />
      )}
    </View>
  );
}

interface MultiSelectFieldProps {
  values: string[];
  options: SelectOption[];
  onToggle: (value: string) => void;
  error?: boolean;
}

export function MultiSelectField({ values, options, onToggle, error = false }: MultiSelectFieldProps) {
  const colors = useColors();
  return (
    <View style={{ borderRadius: 12, borderWidth: 1, borderColor: error ? colors.error : colors.border, overflow: "hidden" }}>
      {options.map((option, idx) => {
        const selected = values.includes(option.value);
        return (
          <React.Fragment key={option.value}>
            <Pressable
              onPress={() => onToggle(option.value)}
              style={{
                paddingHorizontal: 16, paddingVertical: 14,
                backgroundColor: selected ? colors.primary + "15" : colors.background,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
              }}
            >
              <View style={{
                width: 20, height: 20, borderRadius: 4,
                borderWidth: 2,
                borderColor: selected ? colors.primary : colors.border,
                backgroundColor: selected ? colors.primary : "transparent",
                alignItems: "center", justifyContent: "center",
              }}>
                {selected && (
                  <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "bold", marginTop: -1 }}>{"\u2713"}</Text>
                )}
              </View>
              <Text style={{
                fontSize: 14, fontWeight: selected ? "700" : "500",
                color: selected ? colors.primary : colors.foreground,
                flex: 1,
              }}>
                {option.label}
              </Text>
            </Pressable>
            {idx < options.length - 1 && (
              <View style={{ height: 1, backgroundColor: colors.border, marginHorizontal: 16 }} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

// === HYBRID FIELD: shows toggle + options OR open text ===
interface HybridFieldProps {
  value: string;
  options: { value: string; label: string }[];
  onSelect: (value: string) => void;
  onChangeText: (text: string) => void;
  placeholder?: string;
  error?: boolean;
}

export function HybridField({ value, options, onSelect, onChangeText, placeholder, error = false }: HybridFieldProps) {
  const colors = useColors();
  const { language } = useI18n();
  const isOptionSelected = options.some(o => o.value === value);
  const [mode, setMode] = React.useState<"choice" | "open">(
    !isOptionSelected && value.length > 0 ? "open" : "choice"
  );

  const choiceLabel = language === "ar" ? "اختيار" : language === "en" ? "Choose" : "Keuze";
  const openLabel = language === "ar" ? "جواب مفتوح" : language === "en" ? "Open answer" : "Open antwoord";
  const defaultPlaceholder = language === "ar" ? "اكتب إجابتك هنا..." : language === "en" ? "Type your answer here..." : "Typ hier uw antwoord...";

  const handleOptionSelect = (optionValue: string) => {
    onSelect(optionValue);
  };

  const handleSwitchToOpen = () => {
    setMode("open");
  };

  const handleSwitchToChoice = () => {
    setMode("choice");
  };

  return (
    <View>
      {/* Toggle buttons: اختيار / جواب مفتوح */}
      <View style={{ flexDirection: "row", marginBottom: 10, gap: 8 }}>
        <Pressable
          onPress={handleSwitchToChoice}
          style={{
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 20,
            backgroundColor: mode === "choice" ? colors.primary : "transparent",
            borderWidth: 1.5,
            borderColor: mode === "choice" ? colors.primary : colors.border,
          }}
        >
          <Text style={{
            fontSize: 13,
            fontWeight: "700",
            color: mode === "choice" ? "#FFFFFF" : colors.muted,
          }}>
            {choiceLabel}
          </Text>
        </Pressable>
        <Pressable
          onPress={handleSwitchToOpen}
          style={{
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 20,
            backgroundColor: mode === "open" ? colors.primary : "transparent",
            borderWidth: 1.5,
            borderColor: mode === "open" ? colors.primary : colors.border,
          }}
        >
          <Text style={{
            fontSize: 13,
            fontWeight: "700",
            color: mode === "open" ? "#FFFFFF" : colors.muted,
          }}>
            {openLabel}
          </Text>
        </Pressable>
      </View>

      {/* Choice mode: show radio options */}
      {mode === "choice" && (
        <View style={{ borderRadius: 12, borderWidth: 1, borderColor: error ? colors.error : colors.border, overflow: "hidden" }}>
          {options.map((option, idx) => (
            <React.Fragment key={option.value}>
              <Pressable
                onPress={() => handleOptionSelect(option.value)}
                style={{
                  paddingHorizontal: 16, paddingVertical: 14,
                  backgroundColor: value === option.value ? colors.primary + "15" : colors.background,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <View style={{
                  width: 20, height: 20, borderRadius: 10,
                  borderWidth: 2,
                  borderColor: value === option.value ? colors.primary : colors.border,
                  backgroundColor: value === option.value ? colors.primary : "transparent",
                  alignItems: "center", justifyContent: "center",
                }}>
                  {value === option.value && (
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#FFFFFF" }} />
                  )}
                </View>
                <Text style={{
                  fontSize: 14, fontWeight: value === option.value ? "700" : "500",
                  color: value === option.value ? colors.primary : colors.foreground,
                  flex: 1,
                }}>
                  {option.label}
                </Text>
              </Pressable>
              {idx < options.length - 1 && (
                <View style={{ height: 1, backgroundColor: colors.border, marginHorizontal: 16 }} />
              )}
            </React.Fragment>
          ))}
        </View>
      )}

      {/* Open mode: show text input */}
      {mode === "open" && (
        <TextInput
          value={isOptionSelected ? "" : value}
          onChangeText={onChangeText}
          placeholder={placeholder || defaultPlaceholder}
          placeholderTextColor={colors.muted}
          multiline
          numberOfLines={3}
          style={{
            backgroundColor: colors.background,
            color: colors.foreground,
            borderWidth: 1.5,
            borderColor: error ? colors.error : colors.primary + "60",
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 12,
            fontSize: 14,
            minHeight: 80,
            textAlignVertical: "top",
            textAlign: language === "ar" ? "right" : "left",
          }}
        />
      )}
    </View>
  );
}

// === HONESTY BANNER ===
export function HonestyBanner() {
  const colors = useColors();
  const { language } = useI18n();
  const title = language === "ar" ? "كن صادقًا — الله مطّلع عليك" : language === "en" ? "Be honest — Allaah is watching" : "Wees eerlijk — Allaah kijkt mee";
  const body = language === "ar" ? "أجب عن كل سؤال بصدق وواقعية. إجاباتك تُستخدم فقط لتقديم نصائح مناسبة لك. والله شهيد على كل ما تقوله وتفعله." : language === "en" ? "Answer every question honestly and factually. Your answers are only used to give you personal advice. Allaah is Witness over everything you say and do." : "Beantwoord elke vraag eerlijk en feitelijk. Uw antwoorden worden alleen gebruikt om u persoonlijk advies te geven. Allaah is Getuige over alles wat u zegt en doet.";
  return (
    <View
      className="mx-0 mb-4 rounded-xl p-4"
      style={{ backgroundColor: "#FFF7ED", borderWidth: 1, borderColor: "#F59E0B40" }}
    >
      <Text style={{ color: "#92400E", fontSize: 13, fontWeight: "700", marginBottom: 4 }}>
        {title}
      </Text>
      <Text style={{ color: "#78350F", fontSize: 11, lineHeight: 17 }}>
        {body}
      </Text>
    </View>
  );
}

// === SPOUSE VISIBILITY NOTICE ===
// Owner-approved text, verbatim. Caller decides when to render this (only
// for a wife, before she writes) — see app/onboarding/parent-profile.tsx and
// app/(tabs)/messages.tsx.
export function SpouseVisibilityNotice() {
  const { language } = useI18n();
  const body =
    language === "ar"
      ? "قبل أن تكتبي: ما تكتبينه هنا يراه زوجك، ليُعينه ذلك على توجيهك وتسيير أمورك ورعايتك، طاعةً لله."
      : language === "en"
        ? "Before you write: what you write here is visible to your husband. This helps him guide you, manage your affairs and care for you, in obedience to Allaah."
        : "Voordat u schrijft: wat u hier schrijft, ziet uw man. Dat helpt hem u te begeleiden, uw zaken te behartigen en voor u te zorgen, in gehoorzaamheid aan Allaah.";
  return (
    <View
      className="mx-0 mb-4 rounded-xl p-4"
      style={{ backgroundColor: "#FFF0F5", borderWidth: 1, borderColor: "#F9A8D440" }}
    >
      <Text style={{ color: "#9D174D", fontSize: 11, lineHeight: 17 }}>{body}</Text>
    </View>
  );
}

// ============ HASANAAT PROGRESS BAR ============

interface HasanaatProgressBarProps {
  answeredCount: number;
  totalCount: number;
}

export function HasanaatProgressBar({ answeredCount, totalCount }: HasanaatProgressBarProps) {
  const colors = useColors();
  const { language } = useI18n();
  const percentage = totalCount > 0 ? Math.round((answeredCount / totalCount) * 100) : 0;

  const getMessage = () => {
    if (percentage === 0) {
      return language === "ar" ? "ابدأ بالإجابة لتكسب حسنات" : language === "en" ? "Start answering to earn hasanaat" : "Begin met beantwoorden om hasanaat te verdienen";
    }
    if (percentage < 25) {
      return language === "ar" ? "أحسنت! استمر — كل إجابة صادقة حسنة" : language === "en" ? "Good start! Every honest answer is a hasanah" : "Goed begin! Elk eerlijk antwoord is een hasanah";
    }
    if (percentage < 50) {
      return language === "ar" ? "ما شاء الله! أنت في الطريق الصحيح" : language === "en" ? "Maa shaa Allaah! You are on the right path" : "Maa shaa Allaah! U bent op de goede weg";
    }
    if (percentage < 75) {
      return language === "ar" ? "بارك الله فيك! أكثر من النصف — واصل بصدق" : language === "en" ? "Baarakallaahu feek! More than half done — continue honestly" : "Baarakallaahu fiek! Meer dan de helft — ga eerlijk verder";
    }
    if (percentage < 100) {
      return language === "ar" ? "أنت قريب جدًا! الصدق يُضاعف الأجر" : language === "en" ? "Almost there! Honesty multiplies the reward" : "Bijna klaar! Eerlijkheid vermeerdert de beloning";
    }
    return language === "ar" ? "اكتمل! جزاك الله خيرًا على صدقك" : language === "en" ? "Complete! Jazaakallaahu khayran for your honesty" : "Voltooid! Jazaakallaahu khayran voor uw eerlijkheid";
  };

  const getBarColor = () => {
    if (percentage < 25) return "#F59E0B";
    if (percentage < 50) return "#3B82F6";
    if (percentage < 75) return "#8B5CF6";
    if (percentage < 100) return "#10B981";
    return "#059669";
  };

  return (
    <View
      style={{
        backgroundColor: "#F0FDF4",
        borderWidth: 1,
        borderColor: "#BBF7D040",
        borderRadius: 12,
        padding: 14,
        marginBottom: 16,
      }}
    >
      {/* Header row */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <Text style={{ fontSize: 13, fontWeight: "700", color: "#166534" }}>
          {language === "ar" ? "\u2728 حسنات الصدق" : language === "en" ? "\u2728 Hasanaat of Honesty" : "\u2728 Hasanaat van Eerlijkheid"}
        </Text>
        <Text style={{ fontSize: 22, fontWeight: "900", color: "#DC2626" }}>
          {percentage}%
        </Text>
      </View>

      {/* Progress bar */}
      <View style={{ height: 10, backgroundColor: "#E5E7EB", borderRadius: 5, overflow: "hidden" }}>
        <View
          style={{
            height: 10,
            width: `${percentage}%`,
            backgroundColor: getBarColor(),
            borderRadius: 5,
          }}
        />
      </View>

      {/* Motivational message */}
      <Text style={{ fontSize: 14, color: "#DC2626", marginTop: 6, lineHeight: 20, fontWeight: "700" }}>
        {getMessage()}
      </Text>

      {/* Count */}
      <Text style={{ fontSize: 13, color: "#6B7280", marginTop: 4, fontWeight: "600" }}>
        {answeredCount}/{totalCount} {language === "ar" ? "مُجاب" : language === "en" ? "answered" : "beantwoord"}
      </Text>
    </View>
  );
}

// ============ VALIDATION BANNER ============

interface ValidationBannerProps {
  unansweredCount: number;
  onGoToFirst: () => void;
}

export function ValidationBanner({ unansweredCount, onGoToFirst }: ValidationBannerProps) {
  const colors = useColors();
  const { language } = useI18n();
  if (unansweredCount === 0) return null;
  const qWord = language === "ar" ? (unansweredCount === 1 ? "سؤال" : "أسئلة") : language === "en" ? (unansweredCount === 1 ? "question" : "questions") : (unansweredCount === 1 ? "vraag" : "vragen");
  const notAnswered = language === "ar" ? "لم تُجَب بعد" : language === "en" ? "not answered" : "niet beantwoord";
  const tapHere = language === "ar" ? "اضغط هنا للانتقال إلى أول سؤال لم يُجَب بعد" : language === "en" ? "Tap here to go to the first unanswered question" : "Tik hier om naar de eerste onbeantwoorde vraag te gaan";
  return (
    <Pressable
      onPress={onGoToFirst}
      className="mx-4 mb-4 rounded-xl p-4 flex-row items-center justify-between"
      style={{ backgroundColor: "#FEF2F2", borderWidth: 2, borderColor: colors.error }}
    >
      <View className="flex-1">
        <Text className="text-base font-bold" style={{ color: colors.error }}>
          {unansweredCount} {qWord} {notAnswered}
        </Text>
        <Text className="text-sm mt-1" style={{ color: colors.error }}>
          {tapHere}
        </Text>
      </View>
    </Pressable>
  );
}
