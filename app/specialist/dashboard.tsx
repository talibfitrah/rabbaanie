import React, { useState } from "react";
import {
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { useI18n } from "@/lib/i18n";

const tx = (lang: string, nl: string, en: string, ar: string) =>
  lang === "ar" ? ar : lang === "en" ? en : nl;

type TabType = "caseload" | "families" | "messages" | "plans" | "profile";

export default function SpecialistDashboardScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user } = useAuth();
  const { language } = useI18n();
  const lang = language || "nl";
  const isRTL = lang === "ar";
  const [activeTab, setActiveTab] = useState<TabType>("families");

  const profileQuery = trpc.specialist.getProfile.useQuery();
  const familyQuery = trpc.specialist.familyAnalysis.useQuery();

  const profile = profileQuery.data;
  const families = familyQuery.data || [];

  // Heartbeat to update online status
  const heartbeatMutation = trpc.specialist.heartbeat.useMutation();
  React.useEffect(() => {
    heartbeatMutation.mutate();
    const interval = setInterval(() => heartbeatMutation.mutate(), 60000);
    return () => clearInterval(interval);
  }, []);

  const statsQuery = trpc.specialist.stats.useQuery();
  const plansQuery = trpc.specialist.plans.useQuery();
  const stats = statsQuery.data;
  const plans = plansQuery.data || [];

  const tabs: { key: TabType; label: string; icon: string }[] = [
    { key: "caseload", label: tx(lang, "Overzicht", "Overview", "نظرة عامة"), icon: "dashboard" },
    { key: "families", label: tx(lang, "Gezinnen", "Families", "العائلات"), icon: "family-restroom" },
    { key: "plans", label: tx(lang, "Plannen", "Plans", "الخطط"), icon: "assignment" },
    { key: "messages", label: tx(lang, "Berichten", "Messages", "الرسائل"), icon: "chat" },
    { key: "profile", label: tx(lang, "Profiel", "Profile", "الملف"), icon: "person" },
  ];

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: colors.border, flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <MaterialIcons name={isRTL ? "chevron-right" : "chevron-left"} size={28} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.foreground, textAlign: isRTL ? "right" : "left" }]}>
          {tx(lang, "Educational Supervisor Dashboard", "Educational Supervisor Dashboard", "لوحة المشرف التربوي")}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs */}
      <View style={[s.tabBar, { borderBottomColor: colors.border, flexDirection: isRTL ? "row-reverse" : "row" }]}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[s.tab, { flexDirection: isRTL ? "row-reverse" : "row" }, activeTab === tab.key && { borderBottomColor: "#2E7D32", borderBottomWidth: 2 }]}
            onPress={() => {
              setActiveTab(tab.key);
              if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <MaterialIcons name={tab.icon as any} size={20} color={activeTab === tab.key ? "#2E7D32" : colors.muted} />
            <Text style={[s.tabText, { color: activeTab === tab.key ? "#2E7D32" : colors.muted }]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {activeTab === "caseload" && <CaseloadTab stats={stats} isLoading={statsQuery.isLoading} lang={lang} isRTL={isRTL} colors={colors} />}
        {activeTab === "families" && <FamiliesTab families={families} isLoading={familyQuery.isLoading} lang={lang} isRTL={isRTL} colors={colors} router={router} />}
        {activeTab === "plans" && <PlansTab plans={plans} isLoading={plansQuery.isLoading} lang={lang} isRTL={isRTL} colors={colors} router={router} />}
        {activeTab === "messages" && <MessagesTab lang={lang} isRTL={isRTL} colors={colors} router={router} userId={user?.id} />}
        {activeTab === "profile" && <ProfileTab profile={profile} lang={lang} isRTL={isRTL} colors={colors} userId={user?.id} />}
      </ScrollView>
    </ScreenContainer>
  );
}

function CaseloadTab({ stats, isLoading, lang, isRTL, colors }: any) {
  if (isLoading) {
    return (
      <View style={s.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const statCards = [
    { label: tx(lang, "Toegewezen gezinnen", "Assigned families", "العائلات المعينة"), value: stats?.totalFamilies || 0, icon: "family-restroom", color: "#2E7D32" },
    { label: tx(lang, "Actieve plannen", "Active plans", "الخطط النشطة"), value: stats?.activePlans || 0, icon: "assignment", color: "#1565C0" },
    { label: tx(lang, "Kinderen", "Children", "الأطفال"), value: stats?.totalChildren || 0, icon: "child-care", color: "#FF8F00" },
    { label: tx(lang, "Ongelezen berichten", "Unread messages", "رسائل غير مقروءة"), value: stats?.unreadMessages || 0, icon: "mark-email-unread", color: "#C62828" },
    { label: tx(lang, "Voltooide plannen", "Completed plans", "الخطط المكتملة"), value: stats?.completedPlans || 0, icon: "check-circle", color: "#4CAF50" },
    { label: tx(lang, "Wachtende verzoeken", "Pending requests", "طلبات معلقة"), value: stats?.pendingAssignments || 0, icon: "pending-actions", color: "#7B1FA2" },
  ];

  return (
    <View style={{ gap: 12 }}>
      <Text style={[s.sectionTitle, { color: colors.foreground, textAlign: isRTL ? "right" : "left" }]}>
        {tx(lang, "Caseload Overzicht", "Caseload Overview", "نظرة عامة على الحالات")}
      </Text>
      <View style={{ flexDirection: isRTL ? "row-reverse" : "row", flexWrap: "wrap", gap: 10 }}>
        {statCards.map((card, idx) => (
          <View key={idx} style={[s.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[s.statIconBox, { backgroundColor: card.color + "15" }]}>
              <MaterialIcons name={card.icon as any} size={22} color={card.color} />
            </View>
            <Text style={[s.statValue, { color: colors.foreground }]}>{card.value}</Text>
            <Text style={[s.statLabel, { color: colors.muted }]}>{card.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function PlansTab({ plans, isLoading, lang, isRTL, colors, router }: any) {
  if (isLoading) {
    return (
      <View style={s.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (plans.length === 0) {
    return (
      <View style={s.emptyContainer}>
        <MaterialIcons name="assignment" size={48} color={colors.muted} />
        <Text style={[s.emptyText, { color: colors.muted }]}>
          {tx(lang, "Nog geen behandelplannen aangemaakt.", "No treatment plans created yet.", "لم يتم إنشاء خطط علاج بعد.")}
        </Text>
      </View>
    );
  }

  const statusColor = (status: string) => {
    switch (status) {
      case "active": return "#2E7D32";
      case "completed": return "#4CAF50";
      case "paused": return "#FF8F00";
      default: return colors.muted;
    }
  };

  return (
    <View style={{ gap: 12 }}>
      <Text style={[s.sectionTitle, { color: colors.foreground, textAlign: isRTL ? "right" : "left" }]}>
        {tx(lang, `${plans.length} behandelplan(nen)`, `${plans.length} treatment plan(s)`, `${plans.length} خطة(خطط) علاج`)}
      </Text>
      {plans.map((plan: any) => (
        <View key={plan.id} style={[s.familyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 10 }}>
            <View style={[s.statusDot, { backgroundColor: statusColor(plan.status) }]} />
            <Text style={[s.familyName, { color: colors.foreground, flex: 1 }]}>{plan.title}</Text>
          </View>
          {plan.issueDescription && (
            <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4, textAlign: isRTL ? "right" : "left" }} numberOfLines={2}>
              {plan.issueDescription}
            </Text>
          )}
          <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 12, marginTop: 8 }}>
            <Text style={{ fontSize: 11, color: colors.muted }}>
              {tx(lang, "Status", "Status", "الحالة")}: <Text style={{ color: statusColor(plan.status), fontWeight: "600" }}>{plan.status}</Text>
            </Text>
            {plan.priority && (
              <Text style={{ fontSize: 11, color: colors.muted }}>
                {tx(lang, "Prioriteit", "Priority", "الأولوية")}: {plan.priority}
              </Text>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

function FamiliesTab({ families, isLoading, lang, isRTL, colors, router }: any) {
  if (isLoading) {
    return (
      <View style={s.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (families.length === 0) {
    return (
      <View style={s.emptyContainer}>
        <MaterialIcons name="family-restroom" size={48} color={colors.muted} />
        <Text style={[s.emptyText, { color: colors.muted, textAlign: isRTL ? "right" : "left" }]}>
          {tx(lang,
            "Er zijn nog geen gezinnen aan je toegewezen. Wanneer ouders je selecteren, verschijnen hun gegevens hier.",
            "No families assigned to you yet. When parents select you, their data will appear here.",
            "لم يتم تعيين عائلات لك بعد. عندما يختارك الآباء، ستظهر بياناتهم هنا."
          )}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 16 }}>
      <Text style={[s.sectionTitle, { color: colors.foreground, textAlign: isRTL ? "right" : "left" }]}>
        {tx(lang, `${families.length} gezin(nen) toegewezen`, `${families.length} family(ies) assigned`, `${families.length} عائلة(عائلات) معينة`)}
      </Text>

      {families.map((family: any, idx: number) => (
        <View key={idx} style={[s.familyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Family header */}
          <View style={[s.familyHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <MaterialIcons name="home" size={24} color="#2E7D32" />
            <Text style={[s.familyName, { color: colors.foreground }]}>
              {family.family?.name || tx(lang, "Gezin", "Family", "عائلة")}
            </Text>
          </View>

          {/* Parents */}
          <Text style={[s.subTitle, { color: colors.muted, textAlign: isRTL ? "right" : "left" }]}>
            {tx(lang, "Ouders", "Parents", "الآباء")}
          </Text>
          {family.parents?.map((parent: any, pIdx: number) => (
            <View key={pIdx} style={[s.parentRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <MaterialIcons name="person" size={18} color={colors.muted} />
              <Text style={[s.parentName, { color: colors.foreground }]}>
                {parent.name || "Ouder"} ({parent.role || "parent"})
              </Text>
              {parent.lastActive && (
                <Text style={[s.lastActive, { color: colors.muted }]}>
                  {new Date(parent.lastActive).toLocaleDateString()}
                </Text>
              )}
            </View>
          ))}

          {/* Children */}
          <Text style={[s.subTitle, { color: colors.muted, textAlign: isRTL ? "right" : "left", marginTop: 10 }]}>
            {tx(lang, "Kinderen", "Children", "الأطفال")} ({family.children?.length || 0})
          </Text>
          {family.children?.map((child: any, cIdx: number) => (
            <View key={cIdx} style={[s.childRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <MaterialIcons name="child-care" size={18} color="#FF9800" />
              <View style={{ flex: 1 }}>
                <Text style={[s.childName, { color: colors.foreground }]}>{child.name}</Text>
                <Text style={[s.childAge, { color: colors.muted }]}>
                  {child.birthDate ? `${tx(lang, "Geb.", "Born", "م.")} ${new Date(child.birthDate).toLocaleDateString()}` : ""}
                  {child.gender ? ` • ${child.gender}` : ""}
                </Text>
              </View>
            </View>
          ))}

          {/* Recent observations */}
          {family.observations?.length > 0 && (
            <>
              <Text style={[s.subTitle, { color: colors.muted, textAlign: isRTL ? "right" : "left", marginTop: 10 }]}>
                {tx(lang, "Recente observaties", "Recent observations", "الملاحظات الأخيرة")}
              </Text>
              {family.observations.slice(0, 5).map((obs: any, oIdx: number) => (
                <View key={oIdx} style={[s.obsRow, isRTL ? { borderRightWidth: 3, borderRightColor: "#2E7D32", paddingRight: 10 } : { borderLeftWidth: 3, borderLeftColor: "#2E7D32", paddingLeft: 10 }]}>
                  <Text style={[s.obsChild, { color: "#2E7D32" }]}>{obs.childName}</Text>
                  <Text style={[s.obsContent, { color: colors.foreground, textAlign: isRTL ? "right" : "left" }]} numberOfLines={2}>
                    {obs.observation || obs.content || obs.notes || "—"}
                  </Text>
                  <Text style={[s.obsDate, { color: colors.muted }]}>
                    {new Date(obs.createdAt).toLocaleDateString()}
                  </Text>
                </View>
              ))}
            </>
          )}

          {/* Chat button */}
          {family.parents?.[0] && (
            <TouchableOpacity
              style={[s.chatFamilyBtn, { flexDirection: isRTL ? "row-reverse" : "row" }]}
              onPress={() => router.push(`/specialist-chat?id=${family.parents[0].id}&name=${encodeURIComponent(family.parents[0].name || "Ouder")}`)}
            >
              <MaterialIcons name="chat" size={18} color="#fff" />
              <Text style={s.chatFamilyBtnText}>
                {tx(lang, "Bericht sturen", "Send message", "إرسال رسالة")}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ))}
    </View>
  );
}

function MessagesTab({ lang, isRTL, colors, router, userId }: any) {
  // Use specialist messages list
  const linksQuery = trpc.specialist.getMessages.useQuery(
    { specialistId: 0 },
    { enabled: !!userId }
  );
  const conversations = linksQuery.data || [];

  if (linksQuery.isLoading) {
    return (
      <View style={s.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (conversations.length === 0) {
    return (
      <View style={s.emptyContainer}>
        <MaterialIcons name="chat-bubble-outline" size={48} color={colors.muted} />
        <Text style={[s.emptyText, { color: colors.muted, textAlign: isRTL ? "right" : "left" }]}>
          {tx(lang,
            "Nog geen berichten. Ouders kunnen je berichten sturen nadat ze je selecteren.",
            "No messages yet. Parents can message you after selecting you.",
            "لا توجد رسائل بعد. يمكن للآباء مراسلتك بعد اختيارك."
          )}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 8 }}>
      {conversations.map((conv: any, idx: number) => (
        <TouchableOpacity
          key={idx}
          style={[s.convCard, { backgroundColor: colors.surface, borderColor: colors.border, flexDirection: isRTL ? "row-reverse" : "row" }]}
          onPress={() => router.push(`/specialist-chat?id=${conv.otherUserId || conv.senderId}&name=${encodeURIComponent(conv.otherUserName || conv.senderName || "Ouder")}`)}
        >
          <View style={s.convAvatar}>
            <MaterialIcons name="person" size={22} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.convName, { color: colors.foreground }]}>
              {conv.otherUserName || conv.senderName || "Ouder"}
            </Text>
            <Text style={[s.convPreview, { color: colors.muted }]} numberOfLines={1}>
              {conv.lastMessage || conv.content || "..."}
            </Text>
          </View>
          {conv.unreadCount > 0 && (
            <View style={s.unreadBadge}>
              <Text style={s.unreadText}>{conv.unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      ))}
    </View>
  );
}

function ProfileTab({ profile, lang, isRTL, colors, userId }: any) {
  const updateMutation = trpc.specialist.updateProfile.useMutation();
  const [isAvailable, setIsAvailable] = useState(profile?.isAvailable ?? true);

  const toggleAvailability = () => {
    const newVal = !isAvailable;
    setIsAvailable(newVal);
    updateMutation.mutate({ isAvailable: newVal });
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  return (
    <View style={{ gap: 16 }}>
      {/* Status card */}
      <View style={[s.profileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[s.profileLabel, { color: colors.muted, textAlign: isRTL ? "right" : "left" }]}>
          {tx(lang, "Beschikbaarheid", "Availability", "التوفر")}
        </Text>
        <TouchableOpacity
          style={[s.availToggle, { backgroundColor: isAvailable ? "#E8F5E9" : "#FFEBEE", flexDirection: isRTL ? "row-reverse" : "row" }]}
          onPress={toggleAvailability}
        >
          <MaterialIcons
            name={isAvailable ? "check-circle" : "cancel"}
            size={24}
            color={isAvailable ? "#2E7D32" : "#C62828"}
          />
          <Text style={{ fontSize: 15, fontWeight: "600", color: isAvailable ? "#2E7D32" : "#C62828" }}>
            {isAvailable
              ? tx(lang, "Beschikbaar", "Available", "متاح")
              : tx(lang, "Niet beschikbaar", "Not available", "غير متاح")}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Profile info */}
      <View style={[s.profileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[s.profileLabel, { color: colors.muted, textAlign: isRTL ? "right" : "left" }]}>
          {tx(lang, "Profiel informatie", "Profile information", "معلومات الملف")}
        </Text>

        {profile ? (
          <View style={{ gap: 8 }}>
            <ProfileRow icon="person" label={tx(lang, "Naam", "Name", "الاسم")} value={profile.displayName || "—"} colors={colors} isRTL={isRTL} />
            <ProfileRow icon="location-city" label={tx(lang, "Stad", "City", "المدينة")} value={profile.city || "—"} colors={colors} isRTL={isRTL} />
            <ProfileRow icon="public" label={tx(lang, "Land", "Country", "البلد")} value={profile.country || "—"} colors={colors} isRTL={isRTL} />
            <ProfileRow icon="phone" label={tx(lang, "Telefoon", "Phone", "الهاتف")} value={profile.phone || "—"} colors={colors} isRTL={isRTL} />
            <ProfileRow icon="people" label={tx(lang, "Max gezinnen", "Max families", "الحد الأقصى")} value={String(profile.maxFamilies || 10)} colors={colors} isRTL={isRTL} />
            <ProfileRow icon="star" label={tx(lang, "Beoordeling", "Rating", "التقييم")} value={profile.rating ? `${profile.rating}/5` : "—"} colors={colors} isRTL={isRTL} />
          </View>
        ) : (
          <Text style={[s.emptyText, { color: colors.muted, textAlign: isRTL ? "right" : "left" }]}>
            {tx(lang,
              "Je profiel is nog niet ingesteld. Neem contact op met de beheerder.",
              "Your profile is not set up yet. Contact the administrator.",
              "لم يتم إعداد ملفك بعد. تواصل مع المسؤول."
            )}
          </Text>
        )}
      </View>
    </View>
  );
}

function ProfileRow({ icon, label, value, colors, isRTL }: any) {
  return (
    <View style={[s.profileRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
      <MaterialIcons name={icon} size={18} color={colors.muted} />
      <Text style={[s.profileRowLabel, { color: colors.muted }]}>{label}:</Text>
      <Text style={[s.profileRowValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  header: { alignItems: "center", paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 0.5 },
  backBtn: { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "700" },
  tabBar: { borderBottomWidth: 0.5, paddingHorizontal: 8 },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12 },
  tabText: { fontSize: 13, fontWeight: "600" },
  loadingContainer: { alignItems: "center", paddingVertical: 40 },
  emptyContainer: { alignItems: "center", paddingVertical: 40, gap: 12 },
  emptyText: { fontSize: 14, lineHeight: 22, textAlign: "center" },
  sectionTitle: { fontSize: 15, fontWeight: "600", marginBottom: 4 },
  familyCard: { borderRadius: 16, padding: 16, borderWidth: 1, gap: 6 },
  familyHeader: { alignItems: "center", gap: 10, marginBottom: 8 },
  familyName: { fontSize: 17, fontWeight: "700" },
  subTitle: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", marginTop: 6 },
  parentRow: { alignItems: "center", gap: 8, paddingVertical: 4 },
  parentName: { fontSize: 14, flex: 1 },
  lastActive: { fontSize: 11 },
  childRow: { alignItems: "center", gap: 8, paddingVertical: 4 },
  childName: { fontSize: 14, fontWeight: "500" },
  childAge: { fontSize: 11 },
  obsRow: { marginVertical: 4 },
  obsChild: { fontSize: 11, fontWeight: "600" },
  obsContent: { fontSize: 13, lineHeight: 18 },
  obsDate: { fontSize: 10, marginTop: 2 },
  chatFamilyBtn: { alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#2E7D32", borderRadius: 12, paddingVertical: 12, marginTop: 12 },
  chatFamilyBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  convCard: { alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  convAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#2E7D32", justifyContent: "center", alignItems: "center" },
  convName: { fontSize: 15, fontWeight: "600" },
  convPreview: { fontSize: 13, marginTop: 2 },
  unreadBadge: { backgroundColor: "#2E7D32", borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  unreadText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  profileCard: { borderRadius: 16, padding: 16, borderWidth: 1, gap: 12 },
  profileLabel: { fontSize: 12, fontWeight: "600", textTransform: "uppercase" },
  availToggle: { alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12 },
  profileRow: { alignItems: "center", gap: 8, paddingVertical: 4 },
  profileRowLabel: { fontSize: 13 },
  profileRowValue: { fontSize: 14, fontWeight: "500", flex: 1 },
  statCard: { width: "47%", borderRadius: 14, padding: 14, borderWidth: 1, alignItems: "center", gap: 6 },
  statIconBox: { width: 40, height: 40, borderRadius: 20, justifyContent: "center", alignItems: "center" },
  statValue: { fontSize: 22, fontWeight: "700" },
  statLabel: { fontSize: 11, textAlign: "center" },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
});
