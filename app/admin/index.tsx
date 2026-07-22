import { useState, useEffect } from "react";
import {
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";

type TabId = "overview" | "users" | "content" | "newsletters";

export default function AdminDashboardScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [refreshing, setRefreshing] = useState(false);

  const dashboardQuery = trpc.admin.dashboard.useQuery(undefined, { enabled: isAuthenticated });
  const usersQuery = trpc.admin.users.useQuery(undefined, { enabled: isAuthenticated && activeTab === "users" });
  const contentQuery = trpc.content.list.useQuery({}, { enabled: isAuthenticated && activeTab === "content" });
  const newslettersQuery = trpc.newsletter.list.useQuery(undefined, { enabled: isAuthenticated && activeTab === "newsletters" });

  const onRefresh = async () => {
    setRefreshing(true);
    await dashboardQuery.refetch();
    setRefreshing(false);
  };

  if (!isAuthenticated) {
    return (
      <ScreenContainer className="p-6">
        <View className="flex-1 items-center justify-center gap-4">
          <IconSymbol name="chart.bar.fill" size={64} color={colors.muted} />
          <Text className="text-xl font-bold text-foreground text-center">Admin Dashboard</Text>
          <Text className="text-base text-muted text-center">
            Log in als admin om het dashboard te bekijken.
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  const tabs: { id: TabId; label: string; icon: any }[] = [
    { id: "overview", label: "Overzicht", icon: "chart.bar.fill" },
    { id: "users", label: "Gebruikers", icon: "person.3.fill" },
    { id: "content", label: "Content", icon: "doc.text.fill" },
    { id: "newsletters", label: "Nieuwsbrieven", icon: "newspaper.fill" },
  ];

  return (
    <ScreenContainer>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
        <TouchableOpacity onPress={() => router.back()}>
          <IconSymbol name="chevron.right" size={24} color={colors.primary} style={{ transform: [{ scaleX: -1 }] }} />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-foreground">Admin Dashboard</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Quick Actions */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-4 py-2 border-b border-border" contentContainerStyle={{ gap: 8 }}>
        <TouchableOpacity
          onPress={() => router.push("/admin/management" as any)}
          style={{ backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: colors.border }}
        >
          <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "600" }}>Beheer (Gezinnen/Kinderen)</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push("/admin/article-generator" as any)}
          style={{ backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: colors.border }}
        >
          <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "600" }}>Artikelgenerator (AI)</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push("/admin/content-editor" as any)}
          style={{ backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: colors.border }}
        >
          <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "600" }}>Content Editor</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push("/admin/newsletter-editor" as any)}
          style={{ backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: colors.border }}
        >
          <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "600" }}>Nieuwsbrief Editor</Text>
        </TouchableOpacity>
      </ScrollView>

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
        contentContainerStyle={{ paddingVertical: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {activeTab === "overview" && <OverviewTab stats={dashboardQuery.data} loading={dashboardQuery.isLoading} colors={colors} />}
        {activeTab === "users" && <UsersTab users={usersQuery.data ?? []} loading={usersQuery.isLoading} colors={colors} />}
        {activeTab === "content" && <ContentTab content={contentQuery.data ?? []} loading={contentQuery.isLoading} colors={colors} router={router} />}
        {activeTab === "newsletters" && <NewslettersTab newsletters={newslettersQuery.data ?? []} loading={newslettersQuery.isLoading} colors={colors} router={router} />}
      </ScrollView>
    </ScreenContainer>
  );
}

// ============================================================
// OVERVIEW TAB
// ============================================================
function OverviewTab({ stats, loading, colors }: { stats: any; loading: boolean; colors: any }) {
  if (loading) return <ActivityIndicator size="large" color={colors.primary} />;

  const statCards = [
    { label: "Gebruikers", value: stats?.totalUsers ?? 0, icon: "person.3.fill", color: "#3B82F6" },
    { label: "Gezinnen", value: stats?.totalFamilies ?? 0, icon: "house.fill", color: "#10B981" },
    { label: "Kinderen", value: stats?.totalChildren ?? 0, icon: "child.fill", color: "#F59E0B" },
    { label: "Berichten", value: stats?.totalMessages ?? 0, icon: "envelope.fill", color: "#8B5CF6" },
    { label: "AI-gesprekken", value: stats?.totalConversations ?? 0, icon: "bubble.left.and.bubble.right.fill", color: "#EC4899" },
  ];

  return (
    <View className="gap-4">
      <Text className="text-xl font-bold text-foreground mb-2">Platform Overzicht</Text>
      <View className="flex-row flex-wrap gap-3">
        {statCards.map((card, idx) => (
          <View
            key={idx}
            className="bg-surface rounded-xl p-4 border border-border"
            style={{ width: "47%", minWidth: 140 }}
          >
            <View className="flex-row items-center gap-2 mb-2">
              <View style={{ backgroundColor: card.color + "20", borderRadius: 8, padding: 6 }}>
                <IconSymbol name={card.icon as any} size={18} color={card.color} />
              </View>
            </View>
            <Text className="text-2xl font-bold text-foreground">{card.value}</Text>
            <Text className="text-xs text-muted mt-1">{card.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ============================================================
// USERS TAB
// ============================================================
function UsersTab({ users, loading, colors }: { users: any[]; loading: boolean; colors: any }) {
  if (loading) return <ActivityIndicator size="large" color={colors.primary} />;

  return (
    <View className="gap-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-xl font-bold text-foreground">Gebruikers ({users?.length ?? 0})</Text>
      </View>
      {users?.map((u: any) => (
        <View key={u.id} className="bg-surface rounded-xl p-4 border border-border">
          <View className="flex-row items-center gap-3">
            <View className="w-10 h-10 rounded-full bg-primary/20 items-center justify-center">
              <Text className="text-primary font-bold">{(u.name || u.email || "?")[0].toUpperCase()}</Text>
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-foreground">{u.name || "Onbekend"}</Text>
              <Text className="text-xs text-muted">{u.email || "Geen e-mail"}</Text>
            </View>
            <View className={`px-2 py-1 rounded-full ${u.role === "admin" ? "bg-primary/20" : "bg-surface"}`}>
              <Text className={`text-[10px] font-semibold ${u.role === "admin" ? "text-primary" : "text-muted"}`}>
                {u.role}
              </Text>
            </View>
          </View>
          <View className="flex-row mt-2 gap-4">
            <Text className="text-[10px] text-muted">Aangemeld: {new Date(u.createdAt).toLocaleDateString("nl-NL")}</Text>
            <Text className="text-[10px] text-muted">Laatst actief: {u.lastActive ? new Date(u.lastActive).toLocaleDateString("nl-NL") : "Onbekend"}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

// ============================================================
// CONTENT TAB
// ============================================================
function ContentTab({ content, loading, colors, router }: { content: any[]; loading: boolean; colors: any; router: any }) {
  if (loading) return <ActivityIndicator size="large" color={colors.primary} />;

  return (
    <View className="gap-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-xl font-bold text-foreground">Content ({content?.length ?? 0})</Text>
        <TouchableOpacity
          className="bg-primary rounded-lg px-3 py-2"
          onPress={() => router.push("/admin/content-editor")}
        >
          <Text className="text-background text-xs font-semibold">+ Nieuw</Text>
        </TouchableOpacity>
      </View>
      {content?.map((item: any) => (
        <TouchableOpacity
          key={item.id}
          className="bg-surface rounded-xl p-4 border border-border"
          onPress={() => router.push(`/admin/content-editor?id=${item.id}`)}
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="text-sm font-semibold text-foreground">{item.titleNl || item.titleEn || "Zonder titel"}</Text>
              <Text className="text-xs text-muted mt-1">
                {item.type} • {item.category || "Geen categorie"} • {item.ageRange || "Alle leeftijden"}
              </Text>
            </View>
            <View className={`px-2 py-1 rounded-full ${item.published ? "bg-success/20" : "bg-warning/20"}`}>
              <Text className={`text-[10px] font-semibold ${item.published ? "text-success" : "text-warning"}`}>
                {item.published ? "Gepubliceerd" : "Concept"}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      ))}
      {(!content || content.length === 0) && (
        <View className="items-center py-8">
          <Text className="text-muted text-center">Nog geen content. Maak uw eerste item aan.</Text>
        </View>
      )}
    </View>
  );
}

// ============================================================
// NEWSLETTERS TAB
// ============================================================
function NewslettersTab({ newsletters, loading, colors, router }: { newsletters: any[]; loading: boolean; colors: any; router: any }) {
  if (loading) return <ActivityIndicator size="large" color={colors.primary} />;

  return (
    <View className="gap-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-xl font-bold text-foreground">Nieuwsbrieven ({newsletters?.length ?? 0})</Text>
        <TouchableOpacity
          className="bg-primary rounded-lg px-3 py-2"
          onPress={() => router.push("/admin/newsletter-editor")}
        >
          <Text className="text-background text-xs font-semibold">+ Nieuw</Text>
        </TouchableOpacity>
      </View>
      {newsletters?.map((nl: any) => (
        <TouchableOpacity
          key={nl.id}
          className="bg-surface rounded-xl p-4 border border-border"
          onPress={() => router.push(`/admin/newsletter-editor?id=${nl.id}`)}
        >
          <Text className="text-sm font-semibold text-foreground">{nl.titleNl || "Zonder titel"}</Text>
          <View className="flex-row items-center gap-3 mt-2">
            <View className={`px-2 py-1 rounded-full ${nl.status === "sent" ? "bg-success/20" : nl.status === "scheduled" ? "bg-warning/20" : "bg-surface border border-border"}`}>
              <Text className={`text-[10px] font-semibold ${nl.status === "sent" ? "text-success" : nl.status === "scheduled" ? "text-warning" : "text-muted"}`}>
                {nl.status === "sent" ? "Verzonden" : nl.status === "scheduled" ? "Gepland" : "Concept"}
              </Text>
            </View>
            <Text className="text-[10px] text-muted">
              {nl.sentAt ? `Verzonden: ${new Date(nl.sentAt).toLocaleDateString("nl-NL")}` : `Aangemaakt: ${new Date(nl.createdAt).toLocaleDateString("nl-NL")}`}
            </Text>
          </View>
        </TouchableOpacity>
      ))}
      {(!newsletters || newsletters.length === 0) && (
        <View className="items-center py-8">
          <Text className="text-muted text-center">Nog geen nieuwsbrieven. Maak uw eerste aan.</Text>
        </View>
      )}
    </View>
  );
}
