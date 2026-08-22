import { useState } from "react";
import { View, Text, TextInput, ScrollView, TouchableOpacity, Alert, ActivityIndicator, StyleSheet, Platform } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

const EXPERTISE_OPTIONS = [
  { id: "tarbiya", label: "تربية (Opvoeding)" },
  { id: "tazkiya", label: "تزكية (Spirituele groei)" },
  { id: "tasfiya", label: "تصفية (Zuivering)" },
  { id: "psychology", label: "Psychologie" },
  { id: "family", label: "Gezinstherapie" },
  { id: "education", label: "Onderwijs" },
  { id: "quran", label: "Qur'aan & Arabisch" },
];

const LANGUAGE_OPTIONS = [
  { id: "nl", label: "Nederlands" },
  { id: "ar", label: "العربية" },
  { id: "en", label: "English" },
  { id: "fr", label: "Français" },
  { id: "tr", label: "Türkçe" },
];

export default function SpecialistRegisterScreen() {
  const router = useRouter();
  const colors = useColors();
  const [step, setStep] = useState<"code" | "profile">("code");
  const [code, setCode] = useState("");
  const [codeValid, setCodeValid] = useState(false);
  const [loading, setLoading] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [selectedExpertise, setSelectedExpertise] = useState<string[]>([]);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);

  const registerMutation = trpc.specialist.registerWithCode.useMutation();
  const utils = trpc.useUtils();

  const validateCode = async () => {
    if (!code.trim()) {
      Alert.alert("Fout", "Voer een uitnodigingscode in");
      return;
    }
    setLoading(true);
    try {
      // Was a bare relative fetch whose result was then thrown away: on web any
      // string advanced the wizard, and on native the URL had no base at all, so
      // it always threw and no code could ever be entered from a phone.
      // staleTime: 0 so a code is re-checked against the server every time. The
      // default would serve a cached "valid" for a code consumed or revoked
      // since — an authorization answer must not come out of a client cache.
      const result = await utils.specialist.validateInvitationCode.fetch(
        { code: code.trim() },
        { staleTime: 0 },
      );
      if (!result.valid) {
        Alert.alert("Fout", "Ongeldige of verlopen uitnodigingscode");
        return;
      }
      setCodeValid(true);
      setStep("profile");
    } catch (e) {
      // A thrown request is not a rejected code. Telling someone offline that
      // their code is invalid sends them hunting for a new one.
      Alert.alert("Fout", "Kon de code niet controleren. Controleer uw internetverbinding en probeer opnieuw.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!displayName.trim()) {
      Alert.alert("Fout", "Voer je naam in");
      return;
    }
    if (selectedExpertise.length === 0) {
      Alert.alert("Fout", "Selecteer minstens één expertise");
      return;
    }
    setLoading(true);
    try {
      await registerMutation.mutateAsync({
        code: code.trim(),
        displayName: displayName.trim(),
        bio: bio.trim() || undefined,
        expertise: selectedExpertise,
        languages: selectedLanguages.length > 0 ? selectedLanguages : ["nl"],
        country: country.trim() || undefined,
        city: city.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      Alert.alert(
        "Geregistreerd!",
        "Je bent nu geregistreerd als pedagogisch begeleider. Je kunt nu het pedagogisch-begeleider-dashboard gebruiken.",
        [{ text: "OK", onPress: () => router.replace("/specialist/dashboard" as any) }]
      );
    } catch (e: any) {
      Alert.alert("Fout", e.message || "Registratie mislukt");
    } finally {
      setLoading(false);
    }
  };

  const toggleExpertise = (id: string) => {
    setSelectedExpertise(prev =>
      prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]
    );
  };

  const toggleLanguage = (id: string) => {
    setSelectedLanguages(prev =>
      prev.includes(id) ? prev.filter(l => l !== id) : [...prev, id]
    );
  };

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 20 }}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Pedagogisch begeleider Registratie
          </Text>
        </View>

        {step === "code" ? (
          <View style={styles.section}>
            <View style={[styles.iconContainer, { backgroundColor: colors.primary + "15" }]}>
              <MaterialIcons name="vpn-key" size={48} color={colors.primary} />
            </View>
            <Text style={[styles.subtitle, { color: colors.foreground }]}>
              Uitnodigingscode
            </Text>
            <Text style={[styles.description, { color: colors.muted }]}>
              Voer de uitnodigingscode in die je hebt ontvangen om je als pedagogisch begeleider te registreren.
            </Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.surface }]}
              placeholder="Bijv. TARB-XXXXX-XXXX"
              placeholderTextColor={colors.muted}
              value={code}
              onChangeText={setCode}
              autoCapitalize="characters"
              returnKeyType="done"
              onSubmitEditing={validateCode}
            />
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: loading ? 0.7 : 1 }]}
              onPress={validateCode}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Verifiëren</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={[styles.subtitle, { color: colors.foreground }]}>
              Profiel Aanmaken
            </Text>
            <Text style={[styles.description, { color: colors.muted }]}>
              Vul je gegevens in zodat ouders je kunnen vinden.
            </Text>

            {/* Display Name */}
            <Text style={[styles.label, { color: colors.foreground }]}>Naam *</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.surface }]}
              placeholder="Je volledige naam"
              placeholderTextColor={colors.muted}
              value={displayName}
              onChangeText={setDisplayName}
            />

            {/* Bio */}
            <Text style={[styles.label, { color: colors.foreground }]}>Bio</Text>
            <TextInput
              style={[styles.input, styles.textArea, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.surface }]}
              placeholder="Vertel iets over jezelf en je ervaring..."
              placeholderTextColor={colors.muted}
              value={bio}
              onChangeText={setBio}
              multiline
              numberOfLines={4}
            />

            {/* Expertise */}
            <Text style={[styles.label, { color: colors.foreground }]}>Expertise *</Text>
            <View style={styles.chipContainer}>
              {EXPERTISE_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.id}
                  style={[
                    styles.chip,
                    { borderColor: colors.border, backgroundColor: colors.surface },
                    selectedExpertise.includes(opt.id) && { backgroundColor: colors.primary + "20", borderColor: colors.primary },
                  ]}
                  onPress={() => toggleExpertise(opt.id)}
                >
                  <Text style={[
                    styles.chipText,
                    { color: colors.muted },
                    selectedExpertise.includes(opt.id) && { color: colors.primary },
                  ]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Languages */}
            <Text style={[styles.label, { color: colors.foreground }]}>Talen</Text>
            <View style={styles.chipContainer}>
              {LANGUAGE_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.id}
                  style={[
                    styles.chip,
                    { borderColor: colors.border, backgroundColor: colors.surface },
                    selectedLanguages.includes(opt.id) && { backgroundColor: colors.primary + "20", borderColor: colors.primary },
                  ]}
                  onPress={() => toggleLanguage(opt.id)}
                >
                  <Text style={[
                    styles.chipText,
                    { color: colors.muted },
                    selectedLanguages.includes(opt.id) && { color: colors.primary },
                  ]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* City */}
            <Text style={[styles.label, { color: colors.foreground }]}>Stad</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.surface }]}
              placeholder="Bijv. Amsterdam"
              placeholderTextColor={colors.muted}
              value={city}
              onChangeText={setCity}
            />

            {/* Country */}
            <Text style={[styles.label, { color: colors.foreground }]}>Land</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.surface }]}
              placeholder="Bijv. Nederland"
              placeholderTextColor={colors.muted}
              value={country}
              onChangeText={setCountry}
            />

            {/* Phone */}
            <Text style={[styles.label, { color: colors.foreground }]}>Telefoonnummer</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.surface }]}
              placeholder="+31 6 12345678"
              placeholderTextColor={colors.muted}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />

            {/* Register Button */}
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: loading ? 0.7 : 1, marginTop: 24 }]}
              onPress={handleRegister}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Registreren als Pedagogisch begeleider</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
  },
  backBtn: {
    padding: 8,
    marginRight: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
  },
  section: {
    alignItems: "center",
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  subtitle: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 8,
    textAlign: "center",
  },
  description: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    alignSelf: "flex-start",
    marginBottom: 6,
    marginTop: 16,
  },
  input: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  chipContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    width: "100%",
    marginTop: 4,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "500",
  },
  primaryBtn: {
    width: "100%",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 16,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
