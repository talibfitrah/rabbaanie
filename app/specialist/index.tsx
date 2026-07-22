import React, { useState } from "react";
import {
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";

type TabId = "overview" | "families" | "plans" | "notes";

export default function SpecialistPortalScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [refreshing, setRefreshing] = useState(false);

  const statsQuery = trpc.specialist.stats.useQuery(undefined, { enabled: isAuthenticated });
  const familiesQuery = trpc.specialist.families.useQuery(undefined, { enabled: isAuthenticated && (activeTab === "families" || activeTab === "overview") });
  const plansQuery = trpc.specialist.plans.useQuery(undefined, { enabled: isAuthenticated && (activeTab === "plans" || activeTab === "overview") });
  const pendingQuery = trpc.specialist.pendingAssignments.useQuery(undefined, { enabled: isAuthenticated });

  const acceptMutation = trpc.specialist.acceptAssignment.useMutation({
    onSuccess: () => {
      pendingQuery.refetch();
      familiesQuery.refetch();
      statsQuery.refetch();
    },
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([statsQuery.refetch(), familiesQuery.refetch(), plansQuery.refetch(), pendingQuery.refetch()]);
    setRefreshing(false);
  };

  if (!isAuthenticated) {
    return (
      <ScreenContainer className="p-6">
        <View className="flex-1 items-center justify-center gap-4">
          <IconSymbol name="stethoscope" size={64} color={colors.muted} />
          <Text className="text-xl font-bold text-foreground text-center">Specialist Portal</Text>
          <Text className="text-base text-muted text-center">
            Log in to access the specialist portal.
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: "overview", label: "Overview", icon: "chart.bar.fill" },
    { id: "families", label: "Families", icon: "person.3.fill" },
    { id: "plans", label: "Treatment Plans", icon: "doc.text.fill" },
    { id: "notes", label: "Notes", icon: "note.text" },
  ];

  return (
    <ScreenContainer>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
        <TouchableOpacity onPress={() => router.back()}>
          <IconSymbol name="chevron.right" size={24} color={colors.primary} style={{ transform: [{ scaleX: -1 }] }} />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-foreground">Specialist Portal</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Tab bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="border-b border-border">
        <View className="flex-row px-4 py-2 gap-2">
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.id}
              className={`px-4 py-2 rounded-full ${activeTab === tab.id ? "bg-primary" : "bg-surface"}`}
              onPress={() => setActiveTab(tab.id)}
            >
              <Text className={`text-xs font-semibold ${activeTab === tab.id ? "text-background" : "text-foreground"}`}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Content */}
      <ScrollView
        className="flex-1 px-4"
        contentContainerStyle={{ paddingVertical: 16, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {activeTab === "overview" && (
          <OverviewTab
            stats={statsQuery.data}
            pending={pendingQuery.data ?? []}
            plans={plansQuery.data ?? []}
            loading={statsQuery.isLoading}
            colors={colors}
            onAccept={(id: number) => acceptMutation.mutate({ assignmentId: id })}
            router={router}
          />
        )}
        {activeTab === "families" && (
          <FamiliesTab
            families={familiesQuery.data ?? []}
            loading={familiesQuery.isLoading}
            colors={colors}
            router={router}
          />
        )}
        {activeTab === "plans" && (
          <PlansTab
            plans={plansQuery.data ?? []}
            loading={plansQuery.isLoading}
            colors={colors}
            router={router}
          />
        )}
        {activeTab === "notes" && (
          <NotesTab colors={colors} router={router} />
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

// ============================================================
// OVERVIEW TAB
// ============================================================
function OverviewTab({ stats, pending, plans, loading, colors, onAccept, router }: any) {
  if (loading) return <ActivityIndicator size="large" color={colors.primary} />;

  const statCards = [
    { label: "Active Plans", value: stats?.activePlans ?? 0, color: "#3B82F6" },
    { label: "Families", value: stats?.totalFamilies ?? 0, color: "#10B981" },
    { label: "Pending", value: stats?.pendingAssignments ?? 0, color: "#F59E0B" },
    { label: "Notes Written", value: stats?.totalNotes ?? 0, color: "#8B5CF6" },
  ];

  return (
    <View className="gap-6">
      {/* Stats Grid */}
      <View>
        <Text className="text-xl font-bold text-foreground mb-3">Dashboard</Text>
        <View className="flex-row flex-wrap gap-3">
          {statCards.map((card, idx) => (
            <View
              key={idx}
              className="rounded-xl p-4"
              style={{ backgroundColor: card.color + "12", borderWidth: 1, borderColor: card.color + "30", width: "47%" }}
            >
              <Text className="text-2xl font-bold" style={{ color: card.color }}>{card.value}</Text>
              <Text className="text-xs mt-1" style={{ color: colors.muted }}>{card.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Pending Assignments */}
      {pending.length > 0 && (
        <View>
          <Text className="text-lg font-bold text-foreground mb-3">
            Pending Assignments ({pending.length})
          </Text>
          {pending.map((assignment: any) => (
            <View
              key={assignment.id}
              className="rounded-xl p-4 mb-3"
              style={{ backgroundColor: colors.warning + "10", borderWidth: 1, borderColor: colors.warning + "30" }}
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-1">
                  <Text className="text-sm font-bold" style={{ color: colors.foreground }}>
                    {assignment.family?.name ?? `Family #${assignment.familyId}`}
                  </Text>
                  {assignment.expertise && (
                    <Text className="text-xs mt-1" style={{ color: colors.muted }}>
                      Expertise: {assignment.expertise}
                    </Text>
                  )}
                  {assignment.assignmentNotes && (
                    <Text className="text-xs mt-1" style={{ color: colors.muted }}>
                      {assignment.assignmentNotes}
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  className="px-4 py-2 rounded-lg"
                  style={{ backgroundColor: colors.success }}
                  onPress={() => onAccept(assignment.id)}
                >
                  <Text className="text-xs font-bold text-white">Accept</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Recent Plans */}
      {plans.length > 0 && (
        <View>
          <Text className="text-lg font-bold text-foreground mb-3">Recent Treatment Plans</Text>
          {plans.slice(0, 5).map((plan: any) => (
            <TouchableOpacity
              key={plan.id}
              className="rounded-xl p-4 mb-3"
              style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
              onPress={() => router.push(`/specialist/plan/${plan.id}`)}
            >
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-sm font-bold flex-1" style={{ color: colors.foreground }}>
                  {plan.title}
                </Text>
                <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: getStatusColor(plan.status) + "15" }}>
                  <Text className="text-xs font-medium" style={{ color: getStatusColor(plan.status) }}>
                    {plan.status}
                  </Text>
                </View>
              </View>
              {plan.category && (
                <Text className="text-xs" style={{ color: colors.muted }}>
                  Category: {plan.category}
                </Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {plans.length === 0 && pending.length === 0 && (
        <View className="items-center py-10">
          <IconSymbol name="stethoscope" size={48} color={colors.muted} />
          <Text className="text-base mt-4 text-center" style={{ color: colors.muted }}>
            No active assignments yet. Families can invite you as a specialist.
          </Text>
        </View>
      )}
    </View>
  );
}

// ============================================================
// FAMILIES TAB
// ============================================================
function FamiliesTab({ families, loading, colors, router }: any) {
  if (loading) return <ActivityIndicator size="large" color={colors.primary} />;

  if (families.length === 0) {
    return (
      <View className="items-center py-10">
        <Text className="text-base text-center" style={{ color: colors.muted }}>
          No families assigned yet.
        </Text>
      </View>
    );
  }

  return (
    <View className="gap-3">
      <Text className="text-xl font-bold text-foreground mb-2">Assigned Families</Text>
      {families.map((assignment: any) => (
        <TouchableOpacity
          key={assignment.id}
          className="rounded-xl p-4"
          style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
          onPress={() => router.push(`/specialist/family/${assignment.familyId}`)}
        >
          <View className="flex-row items-center gap-3">
            <View className="w-12 h-12 rounded-full items-center justify-center" style={{ backgroundColor: colors.primary + "15" }}>
              <IconSymbol name="house.fill" size={24} color={colors.primary} />
            </View>
            <View className="flex-1">
              <Text className="text-base font-bold" style={{ color: colors.foreground }}>
                {assignment.family?.name ?? `Family #${assignment.familyId}`}
              </Text>
              {assignment.expertise && (
                <Text className="text-xs" style={{ color: colors.muted }}>
                  {assignment.expertise}
                </Text>
              )}
              <Text className="text-xs mt-1" style={{ color: colors.muted }}>
                Since: {new Date(assignment.assignedAt).toLocaleDateString()}
              </Text>
            </View>
            <IconSymbol name="chevron.right" size={16} color={colors.muted} />
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ============================================================
// PLANS TAB
// ============================================================
function PlansTab({ plans, loading, colors, router }: any) {
  const [filter, setFilter] = useState("all");

  if (loading) return <ActivityIndicator size="large" color={colors.primary} />;

  const filteredPlans = filter === "all" ? plans : plans.filter((p: any) => p.status === filter);
  const filters = ["all", "active", "paused", "completed"];

  return (
    <View className="gap-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-xl font-bold text-foreground">Treatment Plans</Text>
        <TouchableOpacity
          className="px-3 py-2 rounded-lg"
          style={{ backgroundColor: colors.primary }}
          onPress={() => router.push("/specialist/create-plan")}
        >
          <Text className="text-xs font-bold text-white">+ New Plan</Text>
        </TouchableOpacity>
      </View>

      {/* Filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-2">
          {filters.map((f) => (
            <TouchableOpacity
              key={f}
              className={`px-3 py-1.5 rounded-full ${filter === f ? "bg-primary" : "bg-surface"}`}
              style={filter !== f ? { borderWidth: 1, borderColor: colors.border } : undefined}
              onPress={() => setFilter(f)}
            >
              <Text className={`text-xs font-medium ${filter === f ? "text-background" : "text-foreground"}`}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {filteredPlans.length === 0 ? (
        <View className="items-center py-10">
          <Text className="text-base text-center" style={{ color: colors.muted }}>
            No treatment plans found.
          </Text>
        </View>
      ) : (
        filteredPlans.map((plan: any) => (
          <TouchableOpacity
            key={plan.id}
            className="rounded-xl p-4"
            style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
            onPress={() => router.push(`/specialist/plan/${plan.id}`)}
          >
            <View className="flex-row items-center justify-between mb-2">
              <View className="flex-1">
                <Text className="text-sm font-bold" style={{ color: colors.foreground }}>
                  {plan.title}
                </Text>
              </View>
              <View className="flex-row items-center gap-2">
                {plan.priority && (
                  <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: getPriorityColor(plan.priority) + "15" }}>
                    <Text className="text-xs" style={{ color: getPriorityColor(plan.priority) }}>
                      {plan.priority}
                    </Text>
                  </View>
                )}
                <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: getStatusColor(plan.status) + "15" }}>
                  <Text className="text-xs font-medium" style={{ color: getStatusColor(plan.status) }}>
                    {plan.status}
                  </Text>
                </View>
              </View>
            </View>
            {plan.category && (
              <Text className="text-xs mb-1" style={{ color: colors.muted }}>
                Category: {plan.category}
              </Text>
            )}
            {plan.issueDescription && (
              <Text className="text-xs" style={{ color: colors.muted }} numberOfLines={2}>
                {plan.issueDescription}
              </Text>
            )}
            <View className="flex-row items-center justify-between mt-2">
              <Text className="text-xs" style={{ color: colors.muted }}>
                {plan.startDate ? `Started: ${plan.startDate}` : ""}
              </Text>
              <Text className="text-xs" style={{ color: colors.muted }}>
                Updated: {new Date(plan.updatedAt).toLocaleDateString()}
              </Text>
            </View>
          </TouchableOpacity>
        ))
      )}
    </View>
  );
}

// ============================================================
// NOTES TAB
// ============================================================
function NotesTab({ colors, router }: any) {
  return (
    <View className="gap-4">
      <Text className="text-xl font-bold text-foreground mb-2">Notes & Feedback</Text>
      <View className="items-center py-10">
        <IconSymbol name="note.text" size={48} color={colors.muted} />
        <Text className="text-base mt-4 text-center" style={{ color: colors.muted }}>
          Select a treatment plan to view or add notes.
        </Text>
        <TouchableOpacity
          className="mt-4 px-4 py-2 rounded-lg"
          style={{ backgroundColor: colors.primary }}
          onPress={() => router.push("/specialist/plan/notes")}
        >
          <Text className="text-sm font-bold text-white">View All Plans</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ============================================================
// HELPERS
// ============================================================
function getStatusColor(status: string): string {
  switch (status) {
    case "active": return "#3B82F6";
    case "paused": return "#F59E0B";
    case "completed": return "#10B981";
    case "archived": return "#6B7280";
    default: return "#6B7280";
  }
}

function getPriorityColor(priority: string): string {
  switch (priority) {
    case "urgent": return "#EF4444";
    case "high": return "#F97316";
    case "medium": return "#F59E0B";
    case "low": return "#10B981";
    default: return "#6B7280";
  }
}
