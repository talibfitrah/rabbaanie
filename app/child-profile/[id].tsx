import { View, Text, ScrollView, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/use-colors";
import { useAppState } from "@/lib/app-context";
import { useI18n } from "@/lib/i18n";
import { calculateAgeInWeeks } from "@/lib/store";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

type Lang = "nl" | "en" | "ar";
function tx(lang: Lang, nl: string, en: string, ar: string): string {
  return lang === "ar" ? ar : lang === "en" ? en : nl;
}

// All environment fields grouped by section
function getEnvironmentSections(lang: Lang) {
  return [
    {
      title: tx(lang, "Onderwijs", "Education", "التعليم"),
      fields: [
        { key: "education", label: tx(lang, "Type onderwijs", "Education type", "نوع التعليم") },
        { key: "educationDetails", label: tx(lang, "Details onderwijs", "Education details", "تفاصيل التعليم") },
      ],
    },
    {
      title: tx(lang, "Sociale analyse", "Social analysis", "التحليل الاجتماعي"),
      fields: [
        { key: "familyLife", label: tx(lang, "Gezinsleven", "Family life", "الحياة الأسرية") },
        { key: "relationWithFather", label: tx(lang, "Band met vader", "Bond with father", "العلاقة مع الأب") },
        { key: "relationWithMother", label: tx(lang, "Band met moeder", "Bond with mother", "العلاقة مع الأم") },
        { key: "relationWithSiblings", label: tx(lang, "Band met broers/zussen", "Bond with siblings", "العلاقة مع الإخوة") },
        { key: "friends", label: tx(lang, "Vrienden", "Friends", "الأصدقاء") },
        { key: "neighborhood", label: tx(lang, "Buurt", "Neighborhood", "الحي") },
      ],
    },
    {
      title: tx(lang, "Band met Allaah", "Bond with Allaah", "العلاقة مع الله"),
      fields: [
        { key: "bondWithAllaah", label: tx(lang, "Band met Allaah", "Bond with Allaah", "العلاقة بالله") },
        { key: "prayerStatus", label: tx(lang, "Gebed", "Prayer", "الصلاة") },
        { key: "quranConnection", label: tx(lang, "Qur'aan", "Qur'aan", "القرآن") },
        { key: "islamicEducation", label: tx(lang, "Islamitisch onderwijs", "Islamic education", "التعليم الإسلامي") },
      ],
    },
    {
      title: tx(lang, "Persoonlijkheidsanalyse", "Personality analysis", "تحليل الشخصية"),
      fields: [
        { key: "goodThinking", label: tx(lang, "Goed denken", "Good thinking", "التفكير الإيجابي") },
        { key: "badThinking", label: tx(lang, "Slecht denken", "Bad thinking", "التفكير السلبي") },
        { key: "goodFeeling", label: tx(lang, "Goede gevoelens", "Good feelings", "المشاعر الإيجابية") },
        { key: "badFeeling", label: tx(lang, "Slechte gevoelens", "Bad feelings", "المشاعر السلبية") },
        { key: "goodSpeaking", label: tx(lang, "Goed spreken", "Good speaking", "الكلام الإيجابي") },
        { key: "badSpeaking", label: tx(lang, "Slecht spreken", "Bad speaking", "الكلام السلبي") },
        { key: "goodDoing", label: tx(lang, "Goed gedrag", "Good behavior", "السلوك الإيجابي") },
        { key: "badDoing", label: tx(lang, "Slecht gedrag", "Bad behavior", "السلوك السلبي") },
      ],
    },
    {
      title: tx(lang, "Gezondheid", "Health", "الصحة"),
      fields: [
        { key: "physicalHealth", label: tx(lang, "Fysieke gezondheid", "Physical health", "الصحة الجسدية") },
        { key: "mentalHealth", label: tx(lang, "Mentale gezondheid", "Mental health", "الصحة النفسية") },
        { key: "sleepQuality", label: tx(lang, "Slaapkwaliteit", "Sleep quality", "جودة النوم") },
      ],
    },
    {
      title: tx(lang, "Media & Structuur", "Media & Structure", "الوسائط والتنظيم"),
      fields: [
        { key: "mediaUse", label: tx(lang, "Mediagebruik", "Media use", "استخدام الوسائط") },
        { key: "socialMedia", label: tx(lang, "Sociale media", "Social media", "وسائل التواصل") },
        { key: "dailyStructure", label: tx(lang, "Dagstructuur", "Daily structure", "التنظيم اليومي") },
      ],
    },
    {
      title: tx(lang, "Interesses & Gewoontes", "Interests & Habits", "الاهتمامات والعادات"),
      fields: [
        { key: "affinities", label: tx(lang, "Affiniteiten", "Affinities", "الميول") },
        { key: "hobbies", label: tx(lang, "Hobby's", "Hobbies", "الهوايات") },
        { key: "goodHabits", label: tx(lang, "Goede gewoontes", "Good habits", "العادات الجيدة") },
        { key: "badHabits", label: tx(lang, "Slechte gewoontes", "Bad habits", "العادات السيئة") },
      ],
    },
  ];
}

export default function ChildProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { language } = useI18n();
  const { state } = useAppState();
  const lang: Lang = language as Lang;
  const isRTL = lang === "ar";

  const child = state.children.find((c) => c.id === id);
  const env = state.environments.find((e) => e.childId === id);
  const issues = state.issues.filter((i) => i.childId === id);

  if (!child) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background, paddingTop: insets.top }}>
        <Text style={{ color: colors.muted, fontSize: 16 }}>{tx(lang, "Kind niet gevonden", "Child not found", "لم يتم العثور على الطفل")}</Text>
      </View>
    );
  }

  const age = child.birthDate ? calculateAgeInWeeks(child.birthDate) : null;
  const genderLabel = child.gender === "jongen" ? tx(lang, "Jongen", "Boy", "ولد") : child.gender === "meisje" ? tx(lang, "Meisje", "Girl", "بنت") : tx(lang, "Onbekend", "Unknown", "غير محدد");
  const sections = getEnvironmentSections(lang);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between" }}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 4 }]}>
            <MaterialIcons name={isRTL ? "chevron-right" : "chevron-left"} size={24} color={colors.primary} />
            <Text style={{ color: colors.primary, fontSize: 14, fontWeight: "600" }}>{tx(lang, "Terug", "Back", "رجوع")}</Text>
          </Pressable>
          <Text style={{ color: colors.foreground, fontSize: 17, fontWeight: "800" }}>{tx(lang, "Kindprofiel", "Child Profile", "ملف الطفل")}</Text>
          <Pressable onPress={() => router.push(`/child/${child.id}`)} style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1, backgroundColor: colors.primary + "15", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }]}>
            <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>{tx(lang, "Bewerken", "Edit", "تعديل")}</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
        {/* Basic Info Card */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border }}>
          <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary + "20", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 24 }}>{child.gender === "jongen" ? "👦" : child.gender === "meisje" ? "👧" : "👶"}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "800", textAlign: isRTL ? "right" : "left" }}>{child.name}</Text>
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2, textAlign: isRTL ? "right" : "left" }}>
                {genderLabel} — {age ? `${age.years} ${tx(lang, "jaar", "years", "سنة")} ${age.months} ${tx(lang, "maanden", "months", "شهر")}` : tx(lang, "Onbekend", "Unknown", "غير معروف")}
              </Text>
            </View>
          </View>
          <InfoRow label={tx(lang, "Geboortedatum", "Birth date", "تاريخ الميلاد")} value={child.birthDate || tx(lang, "Niet ingevuld", "Not filled", "لم يُدخل")} colors={colors} isRTL={isRTL} />
          <InfoRow
            label={tx(lang, "Profielstatus", "Profile status", "حالة الملف")}
            value={child.profileCompleted ? tx(lang, "Voltooid ✓", "Completed ✓", "مكتمل ✓") : tx(lang, "Onvolledig ⚠", "Incomplete ⚠", "غير مكتمل ⚠")}
            colors={colors}
            isRTL={isRTL}
            valueColor={child.profileCompleted ? colors.success : colors.warning}
          />
          <InfoRow
            label={tx(lang, "Omgevingsanalyse", "Environment analysis", "تحليل البيئة")}
            value={env?.completed ? tx(lang, "Voltooid ✓", "Completed ✓", "مكتمل ✓") : tx(lang, "Niet ingevuld", "Not filled", "لم يُكمل")}
            colors={colors}
            isRTL={isRTL}
            valueColor={env?.completed ? colors.success : colors.warning}
          />
        </View>

        {/* Full Environment Analysis */}
        {env && env.completed && (
          <>
            <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "800", marginBottom: 10, marginTop: 8, textAlign: isRTL ? "right" : "left" }}>
              {tx(lang, "Volledige omgevingsanalyse", "Full Environment Analysis", "التحليل البيئي الكامل")}
            </Text>
            {sections.map((section) => {
              const filledFields = section.fields.filter((f) => (env as any)[f.key]);
              if (filledFields.length === 0) return null;
              return (
                <View key={section.title} style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ color: colors.primary, fontSize: 14, fontWeight: "700", marginBottom: 10, textAlign: isRTL ? "right" : "left" }}>
                    {section.title}
                  </Text>
                  {filledFields.map((field, idx) => (
                    <View key={field.key} style={{ paddingVertical: 8, borderBottomWidth: idx < filledFields.length - 1 ? 1 : 0, borderBottomColor: colors.border + "40" }}>
                      <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "600", marginBottom: 3, textAlign: isRTL ? "right" : "left" }}>
                        {field.label}
                      </Text>
                      <Text style={{ color: colors.foreground, fontSize: 13, lineHeight: 20, textAlign: isRTL ? "right" : "left" }}>
                        {(env as any)[field.key]}
                      </Text>
                    </View>
                  ))}
                </View>
              );
            })}
          </>
        )}

        {/* No environment analysis message */}
        {(!env || !env.completed) && (
          <View style={{ backgroundColor: colors.warning + "10", borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.warning + "30" }}>
            <Text style={{ color: colors.warning, fontSize: 14, fontWeight: "700", textAlign: isRTL ? "right" : "left", marginBottom: 6 }}>
              {tx(lang, "Geen omgevingsanalyse", "No environment analysis", "لا يوجد تحليل بيئي")}
            </Text>
            <Text style={{ color: colors.foreground, fontSize: 12, textAlign: isRTL ? "right" : "left" }}>
              {tx(lang, "Vul de omgevingsanalyse in om het volledige profiel te zien", "Fill in the environment analysis to see the full profile", "أكمل تحليل البيئة لرؤية الملف الكامل")}
            </Text>
            <Pressable
              onPress={() => router.push(`/child/environment?id=${child.id}` as any)}
              style={({ pressed }) => [{ marginTop: 10, backgroundColor: colors.warning, borderRadius: 8, padding: 10, alignItems: "center", opacity: pressed ? 0.85 : 1 }]}
            >
              <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>{tx(lang, "Nu invullen", "Fill in now", "أكمل الآن")}</Text>
            </Pressable>
          </View>
        )}

        {/* Active Issues */}
        {issues.filter(i => !i.resolved).length > 0 && (
          <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "700", marginBottom: 10, textAlign: isRTL ? "right" : "left" }}>
              {tx(lang, "Actieve problemen", "Active Issues", "المشكلات النشطة")} ({issues.filter(i => !i.resolved).length})
            </Text>
            {issues.filter(i => !i.resolved).map((issue) => (
              <View key={issue.id} style={{ backgroundColor: colors.warning + "10", borderRadius: 8, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: colors.warning + "30" }}>
                <Text style={{ color: colors.foreground, fontSize: 12, textAlign: isRTL ? "right" : "left" }}>{issue.description}</Text>
                {issue.treatmentPlan && (
                  <Text style={{ color: colors.primary, fontSize: 11, marginTop: 4, textAlign: isRTL ? "right" : "left" }}>
                    {tx(lang, "Plan:", "Plan:", "الخطة:")} {issue.treatmentPlan}
                  </Text>
                )}
                <Text style={{ color: colors.muted, fontSize: 9, marginTop: 4, textAlign: isRTL ? "right" : "left" }}>
                  {new Date(issue.createdAt).toLocaleDateString(lang === "ar" ? "ar-SA" : lang === "en" ? "en-US" : "nl-NL")}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Buttons: View Environment + Edit */}
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 10, marginTop: 8 }}>
          {env?.completed && (
            <Pressable
              onPress={() => router.push(`/child/environment?id=${child.id}` as any)}
              style={({ pressed }) => [{
                flex: 1,
                backgroundColor: colors.primary + "12",
                borderRadius: 12,
                padding: 14,
                alignItems: "center",
                opacity: pressed ? 0.85 : 1,
                borderWidth: 1,
                borderColor: colors.primary + "30",
              }]}
            >
              <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "700" }}>{tx(lang, "Bewerk omgeving", "Edit environment", "تعديل البيئة")}</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => router.push(`/child/${child.id}`)}
            style={({ pressed }) => [{
              flex: 1,
              backgroundColor: colors.primary,
              borderRadius: 12,
              padding: 14,
              alignItems: "center",
              opacity: pressed ? 0.85 : 1,
            }]}
          >
            <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>{tx(lang, "Profiel bewerken", "Edit Profile", "تعديل الملف")}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function InfoRow({ label, value, colors, isRTL, valueColor }: { label: string; value: string; colors: any; isRTL: boolean; valueColor?: string }) {
  return (
    <View style={{ flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border + "50" }}>
      <Text style={{ color: colors.muted, fontSize: 12, textAlign: isRTL ? "right" : "left" }}>{label}</Text>
      <Text style={{ color: valueColor || colors.foreground, fontSize: 12, fontWeight: "600", textAlign: isRTL ? "left" : "right" }}>{value}</Text>
    </View>
  );
}
