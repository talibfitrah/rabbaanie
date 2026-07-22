import { useState } from "react";
import { Text, View, ScrollView, TouchableOpacity, TextInput, Alert } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useI18n } from "@/lib/i18n";

const ACTIVITY_TYPES = [
  { key: "outing", label: { ar: "نزهة", nl: "Uitje", en: "Outing" }, icon: "🏞️" },
  { key: "lesson", label: { ar: "درس عائلي", nl: "Familieles", en: "Family lesson" }, icon: "📖" },
  { key: "game", label: { ar: "لعبة", nl: "Spel", en: "Game" }, icon: "🎲" },
  { key: "worship", label: { ar: "عبادة جماعية", nl: "Gezamenlijke 'ibaadah", en: "Group worship" }, icon: "🕌" },
  { key: "sport", label: { ar: "رياضة", nl: "Sport", en: "Sport" }, icon: "⚽" },
] as const;

const REMINDER_TYPES = [
  { key: "prayer", label: { ar: "صلاة", nl: "Gebed", en: "Prayer" }, icon: "🕌" },
  { key: "activity", label: { ar: "نشاط", nl: "Activiteit", en: "Activity" }, icon: "🎯" },
  { key: "meeting", label: { ar: "لقاء", nl: "Bijeenkomst", en: "Meeting" }, icon: "👨‍👩‍👧‍👦" },
  { key: "other", label: { ar: "أخرى", nl: "Overig", en: "Other" }, icon: "📌" },
] as const;

export default function FamilyGroupScreen() {
  const colors = useColors();
  const router = useRouter();
  const { t, language, isRTL } = useI18n();
  const [activeTab, setActiveTab] = useState<"reminders" | "activities">("reminders");
  const [showAddReminder, setShowAddReminder] = useState(false);
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [reminderTitle, setReminderTitle] = useState("");
  const [reminderType, setReminderType] = useState("prayer");
  const [activityTitle, setActivityTitle] = useState("");
  const [activityType, setActivityType] = useState("outing");
  const [activityDesc, setActivityDesc] = useState("");

  const flexDir = isRTL ? "row-reverse" as const : "row" as const;
  const textAlign = isRTL ? "right" as const : "left" as const;
  const familyId = 1;

  const remindersQuery = trpc.familyActivities.reminders.useQuery({ familyId });
  const activitiesQuery = trpc.familyActivities.activities.useQuery({ familyId });

  const createReminderMutation = trpc.familyActivities.createReminder.useMutation({
    onSuccess: () => { Alert.alert("✓", t("family.reminder_added")); setShowAddReminder(false); setReminderTitle(""); remindersQuery.refetch(); },
  });

  const proposeActivityMutation = trpc.familyActivities.proposeActivity.useMutation({
    onSuccess: () => { Alert.alert("✓", t("family.activity_proposed")); setShowAddActivity(false); setActivityTitle(""); setActivityDesc(""); activitiesQuery.refetch(); },
  });

  const voteMutation = trpc.familyActivities.vote.useMutation({ onSuccess: () => activitiesQuery.refetch() });

  const reminders = remindersQuery.data || [];
  const activities = activitiesQuery.data || [];

  return (
    <ScreenContainer className="p-4" edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={{ flexDirection: flexDir, alignItems: "center", marginBottom: 20 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
            <Text style={{ color: colors.primary, fontSize: 16 }}>{t("family.back")}</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ color: colors.foreground, fontSize: 20, fontWeight: "bold" }}>👨‍👩‍👧‍👦 {t("family.title")}</Text>
          </View>
          <View style={{ width: 50 }} />
        </View>

        {/* Tabs */}
        <View style={{ flexDirection: flexDir, marginBottom: 16, gap: 8 }}>
          <TouchableOpacity
            onPress={() => setActiveTab("reminders")}
            style={{ flex: 1, backgroundColor: activeTab === "reminders" ? colors.primary : colors.surface, borderRadius: 10, padding: 12, alignItems: "center" }}
          >
            <Text style={{ color: activeTab === "reminders" ? "#fff" : colors.foreground, fontWeight: "bold" }}>{t("family.reminders")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab("activities")}
            style={{ flex: 1, backgroundColor: activeTab === "activities" ? colors.primary : colors.surface, borderRadius: 10, padding: 12, alignItems: "center" }}
          >
            <Text style={{ color: activeTab === "activities" ? "#fff" : colors.foreground, fontWeight: "bold" }}>{t("family.activities")}</Text>
          </TouchableOpacity>
        </View>

        {/* Reminders Tab */}
        {activeTab === "reminders" && (
          <>
            <TouchableOpacity onPress={() => setShowAddReminder(!showAddReminder)} style={{ backgroundColor: colors.primary, borderRadius: 12, padding: 12, alignItems: "center", marginBottom: 16 }}>
              <Text style={{ color: "#fff", fontWeight: "bold" }}>+ {t("family.add_reminder")}</Text>
            </TouchableOpacity>

            {showAddReminder && (
              <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border }}>
                <TextInput
                  value={reminderTitle}
                  onChangeText={setReminderTitle}
                  placeholder={t("family.reminder_title")}
                  placeholderTextColor={colors.muted}
                  style={{ backgroundColor: colors.background, borderRadius: 10, padding: 12, fontSize: 15, color: colors.foreground, textAlign, borderWidth: 1, borderColor: colors.border, marginBottom: 12 }}
                />
                <View style={{ flexDirection: flexDir, flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                  {REMINDER_TYPES.map(type => (
                    <TouchableOpacity
                      key={type.key}
                      onPress={() => setReminderType(type.key)}
                      style={{ backgroundColor: reminderType === type.key ? colors.primary + "20" : "transparent", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: reminderType === type.key ? colors.primary : colors.border }}
                    >
                      <Text style={{ color: colors.foreground, fontSize: 13 }}>{type.icon} {type.label[language] || type.label.ar}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity
                  onPress={() => {
                    if (!reminderTitle.trim()) return Alert.alert("✗", t("family.enter_title"));
                    createReminderMutation.mutate({ familyId, title: reminderTitle.trim(), reminderType: reminderType as any });
                  }}
                  style={{ backgroundColor: colors.primary, borderRadius: 10, padding: 12, alignItems: "center" }}
                >
                  <Text style={{ color: "#fff", fontWeight: "bold" }}>{t("family.save_reminder")}</Text>
                </TouchableOpacity>
              </View>
            )}

            {reminders.length === 0 ? (
              <View style={{ alignItems: "center", padding: 30 }}>
                <Text style={{ fontSize: 40 }}>🔔</Text>
                <Text style={{ color: colors.muted, marginTop: 8 }}>{t("family.no_reminders")}</Text>
              </View>
            ) : (
              reminders.map((reminder: any, i: number) => {
                const typeInfo = REMINDER_TYPES.find(rt => rt.key === reminder.reminderType) || REMINDER_TYPES[3];
                return (
                  <View key={i} style={{ flexDirection: flexDir, backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border, alignItems: "center" }}>
                    <Text style={{ fontSize: 24, marginHorizontal: 12 }}>{typeInfo.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.foreground, fontWeight: "bold", textAlign }}>{reminder.title}</Text>
                      {reminder.scheduledAt && (
                        <Text style={{ color: colors.muted, textAlign, fontSize: 12 }}>{new Date(reminder.scheduledAt).toLocaleDateString(language === "ar" ? "ar-SA" : language === "nl" ? "nl-NL" : "en-US")}</Text>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}

        {/* Activities Tab */}
        {activeTab === "activities" && (
          <>
            <TouchableOpacity onPress={() => setShowAddActivity(!showAddActivity)} style={{ backgroundColor: colors.primary, borderRadius: 12, padding: 12, alignItems: "center", marginBottom: 16 }}>
              <Text style={{ color: "#fff", fontWeight: "bold" }}>+ {t("family.propose_activity")}</Text>
            </TouchableOpacity>

            {showAddActivity && (
              <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border }}>
                <TextInput
                  value={activityTitle}
                  onChangeText={setActivityTitle}
                  placeholder={t("family.activity_title")}
                  placeholderTextColor={colors.muted}
                  style={{ backgroundColor: colors.background, borderRadius: 10, padding: 12, fontSize: 15, color: colors.foreground, textAlign, borderWidth: 1, borderColor: colors.border, marginBottom: 12 }}
                />
                <TextInput
                  value={activityDesc}
                  onChangeText={setActivityDesc}
                  placeholder={t("family.activity_desc")}
                  placeholderTextColor={colors.muted}
                  multiline
                  style={{ backgroundColor: colors.background, borderRadius: 10, padding: 12, fontSize: 15, color: colors.foreground, textAlign, borderWidth: 1, borderColor: colors.border, marginBottom: 12, minHeight: 60 }}
                />
                <View style={{ flexDirection: flexDir, flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                  {ACTIVITY_TYPES.map(type => (
                    <TouchableOpacity
                      key={type.key}
                      onPress={() => setActivityType(type.key)}
                      style={{ backgroundColor: activityType === type.key ? colors.primary + "20" : "transparent", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: activityType === type.key ? colors.primary : colors.border }}
                    >
                      <Text style={{ color: colors.foreground, fontSize: 13 }}>{type.icon} {type.label[language] || type.label.ar}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity
                  onPress={() => {
                    if (!activityTitle.trim()) return Alert.alert("✗", t("family.enter_title"));
                    proposeActivityMutation.mutate({ familyId, title: activityTitle.trim(), description: activityDesc.trim() || undefined, activityType: activityType as any });
                  }}
                  style={{ backgroundColor: colors.primary, borderRadius: 10, padding: 12, alignItems: "center" }}
                >
                  <Text style={{ color: "#fff", fontWeight: "bold" }}>{t("family.propose_activity")}</Text>
                </TouchableOpacity>
              </View>
            )}

            {activities.length === 0 ? (
              <View style={{ alignItems: "center", padding: 30 }}>
                <Text style={{ fontSize: 40 }}>🎯</Text>
                <Text style={{ color: colors.muted, marginTop: 8 }}>{t("family.no_activities")}</Text>
              </View>
            ) : (
              activities.map((activity: any, i: number) => {
                const typeInfo = ACTIVITY_TYPES.find(at => at.key === activity.activityType) || ACTIVITY_TYPES[0];
                return (
                  <View key={i} style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border }}>
                    <View style={{ flexDirection: flexDir, alignItems: "center", marginBottom: 8 }}>
                      <Text style={{ fontSize: 24, marginHorizontal: 8 }}>{typeInfo.icon}</Text>
                      <Text style={{ color: colors.foreground, fontWeight: "bold", flex: 1, textAlign }}>{activity.title}</Text>
                    </View>
                    {activity.description && <Text style={{ color: colors.muted, textAlign, marginBottom: 8, fontSize: 13 }}>{activity.description}</Text>}
                    <View style={{ flexDirection: flexDir, gap: 8 }}>
                      <TouchableOpacity onPress={() => voteMutation.mutate({ activityId: activity.id, vote: "yes" })} style={{ flex: 1, backgroundColor: colors.success + "20", borderRadius: 8, padding: 8, alignItems: "center" }}>
                        <Text style={{ color: colors.success, fontWeight: "bold" }}>👍 {t("family.vote_yes")}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => voteMutation.mutate({ activityId: activity.id, vote: "no" })} style={{ flex: 1, backgroundColor: colors.error + "20", borderRadius: 8, padding: 8, alignItems: "center" }}>
                        <Text style={{ color: colors.error, fontWeight: "bold" }}>👎 {t("family.vote_no")}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
