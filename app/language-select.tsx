import { View, Text, Pressable, StyleSheet, Image } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/use-colors";
import { useI18n, Language } from "@/lib/i18n";

/**
 * Language Selection Screen
 * First screen shown to new users before onboarding.
 * Displays all three languages so any user can understand.
 */
export default function LanguageSelectScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { language: detectedLang, setLanguage } = useI18n();

  const handleSelect = async (lang: Language) => {
    await setLanguage(lang);
    // Navigate to onboarding after language is set
    router.replace("/onboarding");
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 }]}>
      {/* Logo */}
      <View style={styles.logoWrap}>
        <Image
          source={require("@/assets/images/icon.png")}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>

      {/* Title in all 3 languages */}
      <View style={styles.titleWrap}>
        <Text style={[styles.titleAr, { color: "#1B4332" }]}>
          اختر لغتك المفضلة
        </Text>
        <Text style={[styles.titleEn, { color: "#1B4332" }]}>
          Choose your preferred language
        </Text>
        <Text style={[styles.titleNl, { color: "#1B4332" }]}>
          Kies uw voorkeurstaal
        </Text>
      </View>

      {/* Language buttons */}
      <View style={styles.buttonsWrap}>
        {/* Arabic */}
        <Pressable
          onPress={() => handleSelect("ar")}
          style={({ pressed }) => [
            styles.langButton,
            { backgroundColor: "#1B4332", opacity: pressed ? 0.85 : 1, borderWidth: detectedLang === "ar" ? 2 : 0, borderColor: "#FFD700" },
          ]}
        >
          <Text style={styles.flag}>🇸🇦</Text>
          <View style={styles.langTextWrap}>
            <Text style={styles.langName}>العربية</Text>
            <Text style={styles.langSub}>Arabic / Arabisch</Text>
          </View>
          {detectedLang === "ar" && <Text style={styles.recommended}>✓</Text>}
        </Pressable>

        {/* English */}
        <Pressable
          onPress={() => handleSelect("en")}
          style={({ pressed }) => [
            styles.langButton,
            { backgroundColor: "#1B4332", opacity: pressed ? 0.85 : 1, borderWidth: detectedLang === "en" ? 2 : 0, borderColor: "#FFD700" },
          ]}
        >
          <Text style={styles.flag}>🇬🇧</Text>
          <View style={styles.langTextWrap}>
            <Text style={styles.langName}>English</Text>
            <Text style={styles.langSub}>الإنجليزية / Engels</Text>
          </View>
          {detectedLang === "en" && <Text style={styles.recommended}>✓</Text>}
        </Pressable>

        {/* Dutch */}
        <Pressable
          onPress={() => handleSelect("nl")}
          style={({ pressed }) => [
            styles.langButton,
            { backgroundColor: "#1B4332", opacity: pressed ? 0.85 : 1, borderWidth: detectedLang === "nl" ? 2 : 0, borderColor: "#FFD700" },
          ]}
        >
          <Text style={styles.flag}>🇳🇱</Text>
          <View style={styles.langTextWrap}>
            <Text style={styles.langName}>Nederlands</Text>
            <Text style={styles.langSub}>الهولندية / Dutch</Text>
          </View>
          {detectedLang === "nl" && <Text style={styles.recommended}>✓</Text>}
        </Pressable>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: colors.muted }]}>
          يمكنك تغيير اللغة لاحقًا من الإعدادات
        </Text>
        <Text style={[styles.footerText, { color: colors.muted }]}>
          You can change the language later in Settings
        </Text>
        <Text style={[styles.footerText, { color: colors.muted }]}>
          U kunt de taal later wijzigen in Instellingen
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  logoWrap: {
    marginBottom: 24,
    alignItems: "center",
  },
  logo: {
    width: 100,
    height: 100,
    borderRadius: 20,
  },
  titleWrap: {
    alignItems: "center",
    marginBottom: 40,
    gap: 6,
  },
  titleAr: {
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
  },
  titleEn: {
    fontSize: 20,
    fontWeight: "600",
    textAlign: "center",
  },
  titleNl: {
    fontSize: 20,
    fontWeight: "600",
    textAlign: "center",
  },
  buttonsWrap: {
    width: "100%",
    gap: 14,
    maxWidth: 340,
  },
  langButton: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 20,
    gap: 16,
  },
  flag: {
    fontSize: 32,
  },
  langTextWrap: {
    flex: 1,
  },
  langName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
  },
  langSub: {
    fontSize: 13,
    color: "rgba(255,255,255,0.7)",
    marginTop: 2,
  },
  footer: {
    marginTop: 32,
    alignItems: "center",
    gap: 2,
  },
  footerText: {
    fontSize: 12,
    textAlign: "center",
  },
  recommended: {
    fontSize: 20,
    color: "#FFD700",
    fontWeight: "700",
  },
});
