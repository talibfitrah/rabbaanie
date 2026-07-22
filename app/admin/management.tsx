import { useState, useCallback } from "react";
import { ScrollView, Text, View, TouchableOpacity, TextInput, Alert, RefreshControl } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

type Tab = "families" | "children" | "specialists" | "teachers" | "analytics";

export default function AdminManagementScreen() {
  const colors = useColors();
  const [activeTab, setActiveTab] = useState<Tab>("families");
  const [refreshing, setRefreshing] = useState(false);

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: "families", label: "Gezinnen", icon: "👨‍👩‍👧‍👦" },
    { key: "children", label: "Kinderen", icon: "👶" },
    { key: "specialists", label: "Specialisten", icon: "🎓" },
    { key: "teachers", label: "Leraren", icon: "📚" },
    { key: "analytics", label: "Analyse", icon: "📊" },
  ];

  return (
    <ScreenContainer className="flex-1">
      <View className="px-4 pt-4 pb-2">
        <Text className="text-2xl font-bold text-foreground">Beheer</Text>
        <Text className="text-sm text-muted mt-1">Families, kinderen, specialisten en leraren beheren</Text>
      </View>

      {/* Tab Bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-4 mb-3" contentContainerStyle={{ gap: 8 }}>
        {tabs.map(tab => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={{ backgroundColor: activeTab === tab.key ? colors.primary : colors.surface, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 }}
          >
            <Text style={{ color: activeTab === tab.key ? "#fff" : colors.foreground, fontSize: 13, fontWeight: "600" }}>
              {tab.icon} {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Content */}
      {activeTab === "families" && <FamiliesTab />}
      {activeTab === "children" && <ChildrenTab />}
      {activeTab === "specialists" && <SpecialistsTab />}
      {activeTab === "teachers" && <TeachersTab />}
      {activeTab === "analytics" && <AnalyticsTab />}
    </ScreenContainer>
  );
}

function FamiliesTab() {
  const colors = useColors();
  const { data: families, refetch, isLoading } = trpc.admin.families.useQuery();
  const deleteMutation = trpc.admin.deleteFamily.useMutation({ onSuccess: () => refetch() });

  const handleDelete = (familyId: number, name: string) => {
    Alert.alert("Verwijderen", `Weet je zeker dat je "${name}" wilt verwijderen? Dit verwijdert ook alle kinderen en berichten.`, [
      { text: "Annuleren", style: "cancel" },
      { text: "Verwijderen", style: "destructive", onPress: () => deleteMutation.mutate({ familyId }) },
    ]);
  };

  return (
    <ScrollView className="flex-1 px-4" refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}>
      {!families?.length ? (
        <View className="items-center py-12">
          <Text className="text-muted text-base">Geen gezinnen gevonden</Text>
        </View>
      ) : (
        families.map((family: any) => (
          <View key={family.id} className="bg-surface rounded-xl p-4 mb-3 border border-border">
            <View className="flex-row justify-between items-start">
              <View className="flex-1">
                <Text className="text-base font-semibold text-foreground">{family.name}</Text>
                <Text className="text-xs text-muted mt-1">Code: {family.inviteCode}</Text>
              </View>
              <TouchableOpacity onPress={() => handleDelete(family.id, family.name)} style={{ padding: 6 }}>
                <Text style={{ color: colors.error, fontSize: 12 }}>Verwijderen</Text>
              </TouchableOpacity>
            </View>
            <View className="flex-row mt-3 gap-4">
              <View className="bg-background rounded-lg px-3 py-1.5">
                <Text className="text-xs text-muted">Leden</Text>
                <Text className="text-sm font-bold text-foreground">{family.memberCount}</Text>
              </View>
              <View className="bg-background rounded-lg px-3 py-1.5">
                <Text className="text-xs text-muted">Kinderen</Text>
                <Text className="text-sm font-bold text-foreground">{family.childrenCount}</Text>
              </View>
            </View>
            {family.childrenList?.length > 0 && (
              <View className="mt-2">
                <Text className="text-xs text-muted mb-1">Kinderen:</Text>
                {family.childrenList.map((child: any) => (
                  <Text key={child.id} className="text-xs text-foreground ml-2">• {child.name} ({child.gender})</Text>
                ))}
              </View>
            )}
          </View>
        ))
      )}
      <View className="h-20" />
    </ScrollView>
  );
}

function ChildrenTab() {
  const colors = useColors();
  const { data: children, refetch, isLoading } = trpc.admin.children.useQuery();
  const deleteMutation = trpc.admin.deleteChild.useMutation({ onSuccess: () => refetch() });

  const handleDelete = (childId: number, name: string) => {
    Alert.alert("Verwijderen", `Weet je zeker dat je "${name}" wilt verwijderen?`, [
      { text: "Annuleren", style: "cancel" },
      { text: "Verwijderen", style: "destructive", onPress: () => deleteMutation.mutate({ childId }) },
    ]);
  };

  const getAge = (birthDate: string | null) => {
    if (!birthDate) return "Onbekend";
    const diff = Date.now() - new Date(birthDate).getTime();
    const years = Math.floor(diff / (365.25 * 86400000));
    const months = Math.floor((diff % (365.25 * 86400000)) / (30.44 * 86400000));
    return `${years} jaar, ${months} maanden`;
  };

  return (
    <ScrollView className="flex-1 px-4" refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}>
      {!children?.length ? (
        <View className="items-center py-12">
          <Text className="text-muted text-base">Geen kinderen gevonden</Text>
        </View>
      ) : (
        children.map((child: any) => (
          <View key={child.id} className="bg-surface rounded-xl p-4 mb-3 border border-border">
            <View className="flex-row justify-between items-start">
              <View className="flex-1">
                <Text className="text-base font-semibold text-foreground">{child.name}</Text>
                <Text className="text-xs text-muted mt-0.5">
                  {(child.gender === "male" || child.gender === "jongen") ? "Jongen" : "Meisje"} • {getAge(child.birthDate)}
                </Text>
                {child.family && (
                  <Text className="text-xs text-primary mt-1">Gezin: {child.family.name}</Text>
                )}
              </View>
              <TouchableOpacity onPress={() => handleDelete(child.id, child.name)} style={{ padding: 6 }}>
                <Text style={{ color: colors.error, fontSize: 12 }}>Verwijderen</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
      <View className="h-20" />
    </ScrollView>
  );
}

function SpecialistsTab() {
  const colors = useColors();
  const { data: specialists, refetch, isLoading } = trpc.admin.specialists.useQuery();
  const updateRoleMutation = trpc.admin.updateUserRole.useMutation({ onSuccess: () => refetch() });

  const handleDemote = (userId: number, name: string) => {
    Alert.alert("Rol wijzigen", `"${name}" terugzetten naar gewone gebruiker?`, [
      { text: "Annuleren", style: "cancel" },
      { text: "Bevestigen", onPress: () => updateRoleMutation.mutate({ userId, role: "user" }) },
    ]);
  };

  return (
    <ScrollView className="flex-1 px-4" refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}>
      {!specialists?.length ? (
        <View className="items-center py-12">
          <Text className="text-muted text-base">Geen specialisten gevonden</Text>
        </View>
      ) : (
        specialists.map((spec: any) => (
          <View key={spec.id} className="bg-surface rounded-xl p-4 mb-3 border border-border">
            <View className="flex-row justify-between items-start">
              <View className="flex-1">
                <Text className="text-base font-semibold text-foreground">{spec.name || "Onbekend"}</Text>
                <Text className="text-xs text-muted mt-0.5">{spec.email || "Geen e-mail"}</Text>
              </View>
              <TouchableOpacity onPress={() => handleDemote(spec.id, spec.name || "Specialist")} style={{ padding: 6 }}>
                <Text style={{ color: colors.warning, fontSize: 12 }}>Degraderen</Text>
              </TouchableOpacity>
            </View>
            <View className="flex-row mt-3 gap-4">
              <View className="bg-background rounded-lg px-3 py-1.5">
                <Text className="text-xs text-muted">Toewijzingen</Text>
                <Text className="text-sm font-bold text-foreground">{spec.assignmentCount}</Text>
              </View>
              <View className="bg-background rounded-lg px-3 py-1.5">
                <Text className="text-xs text-muted">Behandelplannen</Text>
                <Text className="text-sm font-bold text-foreground">{spec.planCount}</Text>
              </View>
            </View>
          </View>
        ))
      )}
      <View className="h-20" />
    </ScrollView>
  );
}

function TeachersTab() {
  const colors = useColors();
  const { data: teachers, refetch, isLoading } = trpc.admin.teachers.useQuery();
  const updateRoleMutation = trpc.admin.updateUserRole.useMutation({ onSuccess: () => refetch() });

  const handleDemote = (userId: number, name: string) => {
    Alert.alert("Rol wijzigen", `"${name}" terugzetten naar gewone gebruiker?`, [
      { text: "Annuleren", style: "cancel" },
      { text: "Bevestigen", onPress: () => updateRoleMutation.mutate({ userId, role: "user" }) },
    ]);
  };

  return (
    <ScrollView className="flex-1 px-4" refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}>
      {!teachers?.length ? (
        <View className="items-center py-12">
          <Text className="text-muted text-base">Geen leraren gevonden</Text>
        </View>
      ) : (
        teachers.map((teacher: any) => (
          <View key={teacher.id} className="bg-surface rounded-xl p-4 mb-3 border border-border">
            <View className="flex-row justify-between items-start">
              <View className="flex-1">
                <Text className="text-base font-semibold text-foreground">{teacher.name || "Onbekend"}</Text>
                <Text className="text-xs text-muted mt-0.5">{teacher.email || "Geen e-mail"}</Text>
              </View>
              <TouchableOpacity onPress={() => handleDemote(teacher.id, teacher.name || "Leraar")} style={{ padding: 6 }}>
                <Text style={{ color: colors.warning, fontSize: 12 }}>Degraderen</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
      <View className="h-20" />
    </ScrollView>
  );
}

function AnalyticsTab() {
  const colors = useColors();
  const { data: dashboard } = trpc.admin.dashboard.useQuery();
  const { data: ageGroups } = trpc.admin.childrenByAgeGroup.useQuery();
  const { data: familySizes } = trpc.admin.familiesBySize.useQuery();
  const { data: registrations } = trpc.admin.registrationAnalytics.useQuery({ days: 30 });

  return (
    <ScrollView className="flex-1 px-4">
      {/* Overview Stats */}
      <Text className="text-lg font-bold text-foreground mb-3">Overzicht</Text>
      <View className="flex-row flex-wrap gap-3 mb-6">
        {[
          { label: "Gebruikers", value: dashboard?.totalUsers ?? 0, color: colors.primary },
          { label: "Gezinnen", value: dashboard?.totalFamilies ?? 0, color: colors.success },
          { label: "Kinderen", value: dashboard?.totalChildren ?? 0, color: colors.warning },
          { label: "Berichten", value: dashboard?.totalMessages ?? 0, color: colors.error },
          { label: "AI Gesprekken", value: dashboard?.totalConversations ?? 0, color: "#9333ea" },
        ].map(stat => (
          <View key={stat.label} className="bg-surface rounded-xl p-4 border border-border" style={{ width: "47%" }}>
            <Text className="text-xs text-muted">{stat.label}</Text>
            <Text style={{ color: stat.color, fontSize: 24, fontWeight: "700" }}>{stat.value}</Text>
          </View>
        ))}
      </View>

      {/* Age Distribution */}
      <Text className="text-lg font-bold text-foreground mb-3">Leeftijdsverdeling kinderen</Text>
      <View className="bg-surface rounded-xl p-4 border border-border mb-6">
        {ageGroups?.map((group: any) => (
          <View key={group.group} className="flex-row items-center mb-2">
            <Text className="text-sm text-foreground w-16">{group.group}</Text>
            <View className="flex-1 h-6 bg-background rounded-full overflow-hidden mx-2">
              <View
                style={{
                  width: `${Math.min(100, (group.count / Math.max(1, ...(ageGroups?.map((g: any) => g.count) || [1]))) * 100)}%`,
                  height: "100%",
                  backgroundColor: colors.primary,
                  borderRadius: 12,
                }}
              />
            </View>
            <Text className="text-sm font-bold text-foreground w-8 text-right">{group.count}</Text>
          </View>
        ))}
      </View>

      {/* Family Size Distribution */}
      <Text className="text-lg font-bold text-foreground mb-3">Gezinsgrootte</Text>
      <View className="bg-surface rounded-xl p-4 border border-border mb-6">
        {familySizes?.map((size: any) => (
          <View key={size.size} className="flex-row items-center mb-2">
            <Text className="text-sm text-foreground w-20">{size.size} kind{size.size !== "1" ? "eren" : ""}</Text>
            <View className="flex-1 h-6 bg-background rounded-full overflow-hidden mx-2">
              <View
                style={{
                  width: `${Math.min(100, (size.count / Math.max(1, ...(familySizes?.map((s: any) => s.count) || [1]))) * 100)}%`,
                  height: "100%",
                  backgroundColor: colors.success,
                  borderRadius: 12,
                }}
              />
            </View>
            <Text className="text-sm font-bold text-foreground w-8 text-right">{size.count}</Text>
          </View>
        ))}
      </View>

      {/* Registration Trend */}
      <Text className="text-lg font-bold text-foreground mb-3">Registraties (30 dagen)</Text>
      <View className="bg-surface rounded-xl p-4 border border-border mb-6">
        {registrations?.length ? (
          registrations.map((reg: any) => (
            <View key={reg.date} className="flex-row justify-between py-1.5 border-b border-border">
              <Text className="text-xs text-muted">{reg.date}</Text>
              <Text className="text-xs font-bold text-foreground">{reg.count} nieuwe gebruikers</Text>
            </View>
          ))
        ) : (
          <Text className="text-sm text-muted text-center py-4">Geen registratiedata beschikbaar</Text>
        )}
      </View>

      <View className="h-20" />
    </ScrollView>
  );
}
