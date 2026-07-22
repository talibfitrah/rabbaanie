import React from "react";
import {
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";

export default function SpecialistFamilyDetailScreen() {
  const colors = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isAuthenticated } = useAuth();
  const familyId = parseInt(id || "0", 10);
  const [refreshing, setRefreshing] = React.useState(false);

  const plansQuery = trpc.specialist.familyPlans.useQuery(
    { familyId },
    { enabled: isAuthenticated && familyId > 0 }
  );
  const childrenQuery = trpc.specialist.children.useQuery(undefined, { enabled: isAuthenticated });

  const familyChildren = (childrenQuery.data ?? []).filter((c: any) => c.familyId === familyId);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([plansQuery.refetch(), childrenQuery.refetch()]);
    setRefreshing(false);
  };

  return (
    <ScreenContainer>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
        <TouchableOpacity onPress={() => router.back()}>
          <IconSymbol name="chevron.right" size={24} color={colors.primary} style={{ transform: [{ scaleX: -1 }] }} />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-foreground">Family Details</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        className="flex-1 px-4"
        contentContainerStyle={{ paddingVertical: 16, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Children Section */}
        <View className="mb-6">
          <Text className="text-lg font-bold text-foreground mb-3">
            Children ({familyChildren.length})
          </Text>
          {childrenQuery.isLoading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : familyChildren.length === 0 ? (
            <Text className="text-sm" style={{ color: colors.muted }}>No children found.</Text>
          ) : (
            familyChildren.map((child: any) => (
              <View
                key={child.id}
                className="rounded-xl p-4 mb-3"
                style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
              >
                <View className="flex-row items-center gap-3">
                  <View className="w-10 h-10 rounded-full items-center justify-center" style={{ backgroundColor: colors.primary + "15" }}>
                    <Text className="text-base font-bold" style={{ color: colors.primary }}>
                      {child.name?.charAt(0) ?? "?"}
                    </Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-bold" style={{ color: colors.foreground }}>{child.name}</Text>
                    {child.birthDate && (
                      <Text className="text-xs" style={{ color: colors.muted }}>
                        Born: {child.birthDate}
                      </Text>
                    )}
                    {child.gender && (
                      <Text className="text-xs" style={{ color: colors.muted }}>
                        Gender: {child.gender}
                      </Text>
                    )}
                  </View>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Treatment Plans Section */}
        <View className="mb-6">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-lg font-bold text-foreground">
              Treatment Plans ({plansQuery.data?.length ?? 0})
            </Text>
            <TouchableOpacity
              className="px-3 py-2 rounded-lg"
              style={{ backgroundColor: colors.primary }}
              onPress={() => router.push("/specialist/create-plan")}
            >
              <Text className="text-xs font-bold text-white">+ New Plan</Text>
            </TouchableOpacity>
          </View>

          {plansQuery.isLoading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (plansQuery.data ?? []).length === 0 ? (
            <View className="items-center py-8 rounded-xl" style={{ backgroundColor: colors.surface }}>
              <IconSymbol name="doc.text.fill" size={32} color={colors.muted} />
              <Text className="text-sm mt-2 text-center" style={{ color: colors.muted }}>
                No treatment plans yet for this family.
              </Text>
            </View>
          ) : (
            (plansQuery.data ?? []).map((plan: any) => (
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
                    Category: {plan.category} | Priority: {plan.priority ?? "medium"}
                  </Text>
                )}
                {plan.issueDescription && (
                  <Text className="text-xs mt-1" style={{ color: colors.muted }} numberOfLines={2}>
                    {plan.issueDescription}
                  </Text>
                )}
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function getStatusColor(status: string): string {
  switch (status) {
    case "active": return "#3B82F6";
    case "paused": return "#F59E0B";
    case "completed": return "#10B981";
    case "archived": return "#6B7280";
    default: return "#6B7280";
  }
}
