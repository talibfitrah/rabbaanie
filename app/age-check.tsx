import {
  Image,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useState } from "react";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { classifyBirthDate, useAgeGate } from "@/lib/age-gate";
import { useI18n } from "@/lib/i18n";

export default function AgeCheckScreen() {
  const colors = useColors();
  const { language, setLanguage, isRTL } = useI18n();
  const { status, setStatus } = useAgeGate();
  const [day, setDay] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [correcting, setCorrecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const tx = (nl: string, en: string, ar: string) =>
    language === "ar" ? ar : language === "en" ? en : nl;

  const showBlocked = status === "minor" && !correcting;

  const submit = async () => {
    const result = classifyBirthDate({
      day: Number(day),
      month: Number(month),
      year: Number(year),
    });
    if (!day || !month || !year || !result) {
      setError(
        tx(
          "Vul een geldige geboortedatum in.",
          "Enter a valid date of birth.",
          "أدخل تاريخ ميلاد صحيحاً.",
        ),
      );
      return;
    }

    setSaving(true);
    setError("");
    try {
      await setStatus(result);
      setCorrecting(false);
    } catch (storageError) {
      console.warn("[AgeGate] Could not save age status:", storageError);
      setError(
        tx(
          "Opslaan is mislukt. Probeer het opnieuw.",
          "Could not save. Please try again.",
          "تعذر الحفظ. حاول مرة أخرى.",
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          padding: 24,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={{ width: "100%", maxWidth: 420, alignSelf: "center", gap: 20 }}
        >
          <View style={{ flexDirection: "row", alignSelf: "center", gap: 8 }}>
            {(["nl", "en", "ar"] as const).map((item) => (
              <TouchableOpacity
                key={item}
                onPress={() => void setLanguage(item)}
                accessibilityRole="button"
                accessibilityLabel={
                  item === "nl"
                    ? "Nederlands"
                    : item === "en"
                      ? "English"
                      : "العربية"
                }
                style={{
                  borderWidth: 1,
                  borderColor:
                    language === item ? colors.primary : colors.border,
                  backgroundColor:
                    language === item ? colors.surface : colors.background,
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                }}
              >
                <Text
                  style={{
                    color: colors.foreground,
                    fontWeight: language === item ? "700" : "500",
                  }}
                >
                  {item === "nl" ? "NL" : item === "en" ? "EN" : "ع"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Image
            source={require("@/assets/images/icon.png")}
            style={{
              width: 76,
              height: 76,
              borderRadius: 18,
              alignSelf: "center",
            }}
            accessibilityIgnoresInvertColors
          />

          {showBlocked ? (
            <>
              <View style={{ gap: 10 }}>
                <Text
                  style={{
                    color: colors.foreground,
                    fontSize: 24,
                    fontWeight: "700",
                    textAlign: "center",
                  }}
                >
                  {tx(
                    "Voor ouders en opvoeders",
                    "For parents and caregivers",
                    "للآباء والمربين",
                  )}
                </Text>
                <Text
                  style={{
                    color: colors.muted,
                    fontSize: 16,
                    lineHeight: 24,
                    textAlign: "center",
                    writingDirection: isRTL ? "rtl" : "ltr",
                  }}
                >
                  {tx(
                    "Rabbaanie is alleen bedoeld voor volwassenen. Vraag een ouder of verzorger om de app te gebruiken.",
                    "Rabbaanie is intended for adults only. Ask a parent or guardian to use the app.",
                    "تطبيق ربّانيّ مخصص للبالغين فقط. اطلب من أحد الوالدين أو ولي الأمر استخدام التطبيق.",
                  )}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setCorrecting(true)}
                accessibilityRole="button"
                style={{ alignSelf: "center", padding: 12 }}
              >
                <Text
                  style={{
                    color: colors.primary,
                    fontSize: 14,
                    fontWeight: "600",
                  }}
                >
                  {tx(
                    "Een invoerfout corrigeren",
                    "Correct an entry mistake",
                    "تصحيح خطأ في الإدخال",
                  )}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={{ gap: 10 }}>
                <Text
                  style={{
                    color: colors.foreground,
                    fontSize: 24,
                    fontWeight: "700",
                    textAlign: "center",
                  }}
                >
                  {tx(
                    "Voordat u verdergaat",
                    "Before you continue",
                    "قبل المتابعة",
                  )}
                </Text>
                <Text
                  style={{
                    color: colors.muted,
                    fontSize: 16,
                    lineHeight: 24,
                    textAlign: "center",
                    writingDirection: isRTL ? "rtl" : "ltr",
                  }}
                >
                  {tx(
                    "We gebruiken uw geboortedatum om te bepalen of deze app geschikt is voor uw leeftijd.",
                    "We use your date of birth to determine whether this app is suitable for your age.",
                    "نستخدم تاريخ ميلادك لتحديد ما إذا كان هذا التطبيق مناسباً لعمرك.",
                  )}
                </Text>
              </View>

              <View
                style={{
                  flexDirection: isRTL ? "row-reverse" : "row",
                  gap: 10,
                }}
              >
                {[
                  {
                    value: day,
                    setValue: setDay,
                    label: tx("Dag", "Day", "اليوم"),
                    maxLength: 2,
                  },
                  {
                    value: month,
                    setValue: setMonth,
                    label: tx("Maand", "Month", "الشهر"),
                    maxLength: 2,
                  },
                  {
                    value: year,
                    setValue: setYear,
                    label: tx("Jaar", "Year", "السنة"),
                    maxLength: 4,
                  },
                ].map((field) => (
                  <View
                    key={field.label}
                    style={{ flex: field.maxLength === 4 ? 1.35 : 1, gap: 6 }}
                  >
                    <Text
                      style={{
                        color: colors.muted,
                        fontSize: 16,
                        textAlign: isRTL ? "right" : "left",
                      }}
                    >
                      {field.label}
                    </Text>
                    <TextInput
                      value={field.value}
                      onChangeText={(value) =>
                        field.setValue(value.replace(/[^0-9]/g, ""))
                      }
                      maxLength={field.maxLength}
                      keyboardType="number-pad"
                      textContentType="none"
                      accessibilityLabel={field.label}
                      style={{
                        color: colors.foreground,
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                        borderWidth: 1,
                        borderRadius: 12,
                        paddingHorizontal: 12,
                        paddingVertical: 14,
                        fontSize: 17,
                        textAlign: "center",
                      }}
                    />
                  </View>
                ))}
              </View>

              {error ? (
                <Text
                  accessibilityRole="alert"
                  accessibilityLiveRegion="polite"
                  style={{
                    color: colors.error,
                    fontSize: 16,
                    lineHeight: 24,
                    textAlign: "center",
                  }}
                >
                  {error}
                </Text>
              ) : null}

              <Text
                style={{
                  color: colors.muted,
                  fontSize: 16,
                  lineHeight: 24,
                  textAlign: "center",
                  writingDirection: isRTL ? "rtl" : "ltr",
                }}
              >
                {tx(
                  "Uw geboortedatum wordt niet opgeslagen. Alleen uw leeftijdscategorie blijft op dit apparaat bewaard.",
                  "Your date of birth is not stored. Only your age category is kept on this device.",
                  "لا يتم حفظ تاريخ ميلادك. يتم الاحتفاظ بفئتك العمرية فقط على هذا الجهاز.",
                )}
              </Text>

              <TouchableOpacity
                onPress={submit}
                disabled={saving}
                accessibilityRole="button"
                style={{
                  backgroundColor: colors.primary,
                  borderRadius: 12,
                  paddingVertical: 15,
                  opacity: saving ? 0.65 : 1,
                }}
              >
                <Text
                  style={{
                    color: "#FFFFFF",
                    textAlign: "center",
                    fontSize: 16,
                    fontWeight: "700",
                  }}
                >
                  {tx("Doorgaan", "Continue", "متابعة")}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
