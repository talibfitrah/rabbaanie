import { useState, useCallback } from "react";
import { Text, View, ScrollView, TouchableOpacity, Alert, Share, Platform, TextInput, FlatList } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useI18n } from "@/lib/i18n";

type TabType = "overview" | "tasks" | "chat" | "apps" | "ai";

export default function ParentMonitorScreen() {
  const colors = useColors();
  const router = useRouter();
  const { t, language, isRTL } = useI18n();
  const params = useLocalSearchParams<{ childAccountId?: string; childId?: string; childName: string; childAge?: string; childGender?: string }>();
  
  // Support both childAccountId (direct) and childId (profile ID - needs lookup)
  const directAccountId = Number(params.childAccountId) || 0;
  const childProfileId = Number(params.childId) || 0;
  
  // If childId is provided but not childAccountId, lookup the account
  const accountListQuery = trpc.childAccount.list.useQuery(undefined, {
    enabled: directAccountId === 0 && childProfileId > 0,
  });
  
  // Find childAccountId from profile ID
  const childAccountId = directAccountId > 0 
    ? directAccountId 
    : (accountListQuery.data?.find((a: any) => a.childProfileId === childProfileId)?.id || 0);
  
  const childName = params.childName || t("monitor.child");
  const childAge = params.childAge ? Number(params.childAge) : undefined;
  const childGender = params.childGender || "jongen";
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [showQR, setShowQR] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskCategory, setNewTaskCategory] = useState("other");
  const [chatMessage, setChatMessage] = useState("");

  const flexDir = isRTL ? "row-reverse" as const : "row" as const;
  const textAlign = isRTL ? "right" as const : "left" as const;

  // Queries
  const accountQuery = trpc.childAccount.getAccount.useQuery(
    { childAccountId },
    { enabled: childAccountId > 0 }
  );
  const childAccessCode = (accountQuery.data as any)?.accessCode || "";

  const activityQuery = trpc.childAccount.getActivityLog.useQuery(
    { childAccountId, limit: 50 },
    { enabled: childAccountId > 0 }
  );

  const achievementsQuery = trpc.childAccount.getAchievements.useQuery(
    { childAccountId },
    { enabled: childAccountId > 0 }
  );

  const challengesQuery = trpc.childAccount.getChallenges.useQuery(
    { childAccountId },
    { enabled: childAccountId > 0 }
  );

  // New queries for monitoring system
  const todayDate = new Date().toISOString().split("T")[0];
  
  // Weekly data for charts
  const weekStart = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d.toISOString().split("T")[0];
  })();
  const weeklySummaryQuery = trpc.childSummary.getWeekly.useQuery(
    { childAccountId, startDate: weekStart, endDate: todayDate },
    { enabled: childAccountId > 0 }
  );
  const weeklyData = weeklySummaryQuery.data || [];
  const dailySummaryQuery = trpc.childSummary.getDaily.useQuery(
    { childAccountId, date: todayDate },
    { enabled: childAccountId > 0 }
  );

  const tasksQuery = trpc.customTasks.list.useQuery(
    { childAccountId },
    { enabled: childAccountId > 0 }
  );

  const chatQuery = trpc.familyChat.getMessages.useQuery(
    { childAccountId, limit: 100 },
    { enabled: childAccountId > 0 && activeTab === "chat" }
  );

  const appUsageQuery = trpc.childAppUsage.getDaily.useQuery(
    { childAccountId, date: todayDate },
    { enabled: childAccountId > 0 && activeTab === "apps" }
  );

  const aiConversationsQuery = trpc.childAiChat.listConversations.useQuery(
    { childAccountId, limit: 20 },
    { enabled: childAccountId > 0 && activeTab === "ai" }
  );

  // Mutations
  const createTaskMutation = trpc.customTasks.create.useMutation({
    onSuccess: () => {
      setNewTaskTitle("");
      tasksQuery.refetch();
    },
  });

  const sendChatMutation = trpc.familyChat.send.useMutation({
    onSuccess: () => {
      setChatMessage("");
      chatQuery.refetch();
    },
  });

  const markReadMutation = trpc.familyChat.markRead.useMutation();

  // Data
  const activities = activityQuery.data || [];
  const achievements = achievementsQuery.data || [];
  const challenges = challengesQuery.data || [];
  const completedChallenges = challenges.filter((c: any) => c.status === "completed").length;
  const dailySummary = dailySummaryQuery.data;
  const tasks = tasksQuery.data || [];
  const chatMessages = chatQuery.data || [];
  const appUsage = appUsageQuery.data || [];
  const aiConversations = aiConversationsQuery.data || [];

  const pendingTasks = tasks.filter((t: any) => t.status === "pending");
  const completedTasks = tasks.filter((t: any) => t.status === "completed");

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "advisor_chat": return "💬";
      case "challenge_complete": return "✅";
      case "wird_complete": return "📖";
      case "emergency": return "🆘";
      case "app_guide_view": return "📱";
      default: return "📝";
    }
  };

  const getActivityLabel = (type: string) => {
    const labels: Record<string, Record<string, string>> = {
      advisor_chat: { ar: "محادثة مع المستشار", nl: "Gesprek met adviseur", en: "Advisor chat" },
      challenge_complete: { ar: "إكمال تحدي", nl: "Uitdaging voltooid", en: "Challenge completed" },
      wird_complete: { ar: "إكمال الورد", nl: "Wird voltooid", en: "Wird completed" },
      emergency: { ar: "زر الطوارئ", nl: "Noodknop", en: "Emergency button" },
      app_guide_view: { ar: "مراجعة دليل التطبيقات", nl: "App-gids bekeken", en: "App guide viewed" },
    };
    return labels[type]?.[language] || labels[type]?.ar || type;
  };

  const getCategoryLabel = (cat: string) => {
    const labels: Record<string, Record<string, string>> = {
      prayer: { ar: "صلاة", nl: "Gebed", en: "Prayer" },
      quran: { ar: "قرآن", nl: "Qur'aan", en: "Qur'aan" },
      study: { ar: "دراسة", nl: "Studie", en: "Study" },
      chores: { ar: "أعمال منزلية", nl: "Huishoudelijk", en: "Chores" },
      sport: { ar: "رياضة", nl: "Sport", en: "Sport" },
      other: { ar: "أخرى", nl: "Overig", en: "Other" },
    };
    return labels[cat]?.[language] || labels[cat]?.nl || cat;
  };

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case "prayer": return "🕌";
      case "quran": return "📖";
      case "study": return "📚";
      case "chores": return "🧹";
      case "sport": return "⚽";
      default: return "📋";
    }
  };

  const handleCreateTask = () => {
    if (!newTaskTitle.trim()) return;
    createTaskMutation.mutate({
      childAccountId,
      title: newTaskTitle.trim(),
      category: newTaskCategory as any,
      priority: "medium",
    });
  };

  const handleSendChat = () => {
    if (!chatMessage.trim()) return;
    sendChatMutation.mutate({
      childAccountId,
      senderType: "parent",
      content: chatMessage.trim(),
    });
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}${language === "ar" ? "س" : "u"} ${m}${language === "ar" ? "د" : "m"}`;
    return `${m}${language === "ar" ? " دقيقة" : " min"}`;
  };

  const tabLabels: Record<TabType, Record<string, string>> = {
    overview: { ar: "نظرة عامة", nl: "Overzicht", en: "Overview" },
    tasks: { ar: "المهام", nl: "Taken", en: "Tasks" },
    chat: { ar: "دردشة", nl: "Chat", en: "Chat" },
    apps: { ar: "التطبيقات", nl: "Apps", en: "Apps" },
    ai: { ar: "محادثات AI", nl: "AI Gesprekken", en: "AI Chats" },
  };

  // Show account creation prompt if no account found
  const isLoading = directAccountId === 0 && childProfileId > 0 && accountListQuery.isLoading;
  const noAccountFound = childAccountId === 0 && !isLoading;

  const createAccountMutation = trpc.childAccount.create.useMutation({
    onSuccess: () => {
      accountListQuery.refetch();
    },
  });

  const renderTab = (tab: TabType) => (
    <TouchableOpacity
      key={tab}
      onPress={() => {
        setActiveTab(tab);
        if (tab === "chat") markReadMutation.mutate({ childAccountId, readerType: "parent" });
      }}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: activeTab === tab ? colors.primary : colors.surface,
        borderWidth: 1,
        borderColor: activeTab === tab ? colors.primary : colors.border,
      }}
    >
      <Text style={{ color: activeTab === tab ? "#fff" : colors.foreground, fontSize: 13, fontWeight: "600" }}>
        {tabLabels[tab][language] || tabLabels[tab].nl}
      </Text>
    </TouchableOpacity>
  );

  // ===== OVERVIEW TAB =====
  const renderOverview = () => (
    <View style={{ gap: 16 }}>
      {/* Today's Summary */}
      <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border }}>
        <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "bold", textAlign, marginBottom: 12 }}>
          {language === "ar" ? "ملخص اليوم" : language === "nl" ? "Samenvatting vandaag" : "Today's Summary"}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          <View style={{ flex: 1, minWidth: 100, alignItems: "center", padding: 8 }}>
            <Text style={{ fontSize: 24 }}>{dailySummary?.morningAdhkarDone ? "✅" : "❌"}</Text>
            <Text style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>{language === "ar" ? "أذكار الصباح" : "Ochtend adhkaar"}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 100, alignItems: "center", padding: 8 }}>
            <Text style={{ fontSize: 24 }}>{dailySummary?.eveningAdhkarDone ? "✅" : "❌"}</Text>
            <Text style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>{language === "ar" ? "أذكار المساء" : "Avond adhkaar"}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 100, alignItems: "center", padding: 8 }}>
            <Text style={{ fontSize: 24 }}>⏱️</Text>
            <Text style={{ color: colors.foreground, fontWeight: "bold", fontSize: 14, marginTop: 4 }}>
              {dailySummary?.totalAppUsageSeconds ? formatTime(dailySummary.totalAppUsageSeconds) : "0 min"}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 11 }}>{language === "ar" ? "وقت الاستخدام" : "Gebruikstijd"}</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
          <View style={{ flex: 1, minWidth: 100, alignItems: "center", padding: 8 }}>
            <Text style={{ fontSize: 24 }}>📋</Text>
            <Text style={{ color: colors.foreground, fontWeight: "bold", fontSize: 14, marginTop: 4 }}>
              {dailySummary?.customTasksCompleted || 0}/{dailySummary?.customTasksTotal || pendingTasks.length + completedTasks.length}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 11 }}>{language === "ar" ? "مهام منجزة" : "Taken voltooid"}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 100, alignItems: "center", padding: 8 }}>
            <Text style={{ fontSize: 24 }}>❓</Text>
            <Text style={{ color: colors.foreground, fontWeight: "bold", fontSize: 14, marginTop: 4 }}>
              {dailySummary?.aiQuestionsAsked || 0}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 11 }}>{language === "ar" ? "أسئلة AI" : "AI vragen"}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 100, alignItems: "center", padding: 8 }}>
            <Text style={{ fontSize: 24 }}>🎯</Text>
            <Text style={{ color: colors.foreground, fontWeight: "bold", fontSize: 14, marginTop: 4 }}>
              {dailySummary?.challengesCompleted || 0}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 11 }}>{language === "ar" ? "تحديات" : "Uitdagingen"}</Text>
          </View>
        </View>
      </View>

      {/* Weekly Charts */}
      <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border }}>
        <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "bold", textAlign, marginBottom: 16 }}>
          {language === "ar" ? "إحصائيات الأسبوع" : language === "nl" ? "Weekstatistieken" : "Weekly Statistics"}
        </Text>
        
        {/* Screen Time Bar Chart */}
        <View style={{ marginBottom: 20 }}>
          <Text style={{ color: colors.muted, fontSize: 12, textAlign, marginBottom: 8 }}>
            {language === "ar" ? "وقت الشاشة (بالدقائق)" : language === "nl" ? "Schermtijd (minuten)" : "Screen Time (minutes)"}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", height: 100, paddingTop: 8 }}>
            {(() => {
              const days = [];
              const dayNames = language === "ar" 
                ? ["أحد", "إثن", "ثلا", "أرب", "خمي", "جمع", "سبت"]
                : language === "nl" ? ["Zo", "Ma", "Di", "Wo", "Do", "Vr", "Za"]
                : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
              for (let i = 6; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const dateStr = d.toISOString().split("T")[0];
                const dayData = weeklyData.find((w: any) => w.date === dateStr);
                const minutes = Math.round((dayData?.totalAppUsageSeconds || 0) / 60);
                days.push({ day: dayNames[d.getDay()], minutes, isToday: i === 0 });
              }
              const maxMin = Math.max(...days.map(d => d.minutes), 30);
              return days.map((day, idx) => (
                <View key={idx} style={{ alignItems: "center", flex: 1 }}>
                  <Text style={{ color: colors.muted, fontSize: 9, marginBottom: 2 }}>{day.minutes > 0 ? day.minutes : ""}</Text>
                  <View style={{
                    width: 20, borderRadius: 4,
                    height: Math.max((day.minutes / maxMin) * 70, 4),
                    backgroundColor: day.isToday ? colors.primary : day.minutes > 120 ? colors.error : colors.primary + "60",
                  }} />
                  <Text style={{ color: day.isToday ? colors.primary : colors.muted, fontSize: 9, marginTop: 4, fontWeight: day.isToday ? "bold" : "normal" }}>{day.day}</Text>
                </View>
              ));
            })()}
          </View>
        </View>

        {/* Tasks Completion Chart */}
        <View style={{ marginBottom: 20 }}>
          <Text style={{ color: colors.muted, fontSize: 12, textAlign, marginBottom: 8 }}>
            {language === "ar" ? "المهام المنجزة" : language === "nl" ? "Voltooide taken" : "Tasks Completed"}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", height: 80, paddingTop: 8 }}>
            {(() => {
              const days = [];
              const dayNames = language === "ar" 
                ? ["أحد", "إثن", "ثلا", "أرب", "خمي", "جمع", "سبت"]
                : language === "nl" ? ["Zo", "Ma", "Di", "Wo", "Do", "Vr", "Za"]
                : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
              for (let i = 6; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const dateStr = d.toISOString().split("T")[0];
                const dayData = weeklyData.find((w: any) => w.date === dateStr);
                days.push({ day: dayNames[d.getDay()], completed: dayData?.customTasksCompleted || 0, total: dayData?.customTasksTotal || 0, isToday: i === 0 });
              }
              const maxTasks = Math.max(...days.map(d => d.total), 3);
              return days.map((day, idx) => (
                <View key={idx} style={{ alignItems: "center", flex: 1 }}>
                  <Text style={{ color: colors.muted, fontSize: 9, marginBottom: 2 }}>{day.completed > 0 ? `${day.completed}/${day.total}` : ""}</Text>
                  <View style={{ width: 20, height: Math.max((day.total / maxTasks) * 50, 4), borderRadius: 4, backgroundColor: colors.border, overflow: "hidden" }}>
                    <View style={{ position: "absolute", bottom: 0, width: 20, borderRadius: 4, height: day.total > 0 ? (day.completed / day.total) * Math.max((day.total / maxTasks) * 50, 4) : 0, backgroundColor: colors.success }} />
                  </View>
                  <Text style={{ color: day.isToday ? colors.primary : colors.muted, fontSize: 9, marginTop: 4, fontWeight: day.isToday ? "bold" : "normal" }}>{day.day}</Text>
                </View>
              ));
            })()}
          </View>
        </View>

        {/* Adhkar Streak */}
        <View style={{ marginBottom: 8 }}>
          <Text style={{ color: colors.muted, fontSize: 12, textAlign, marginBottom: 8 }}>
            {language === "ar" ? "الأذكار اليومية" : language === "nl" ? "Dagelijkse adhkaar" : "Daily Adhkaar"}
          </Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            {(() => {
              const days = [];
              const dayNames = language === "ar" 
                ? ["أحد", "إثن", "ثلا", "أرب", "خمي", "جمع", "سبت"]
                : language === "nl" ? ["Zo", "Ma", "Di", "Wo", "Do", "Vr", "Za"]
                : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
              for (let i = 6; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const dateStr = d.toISOString().split("T")[0];
                const dayData = weeklyData.find((w: any) => w.date === dateStr);
                const morning = dayData?.morningAdhkarDone || false;
                const evening = dayData?.eveningAdhkarDone || false;
                days.push({ day: dayNames[d.getDay()], morning, evening, isToday: i === 0 });
              }
              return days.map((day, idx) => (
                <View key={idx} style={{ alignItems: "center", gap: 4 }}>
                  <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: day.morning && day.evening ? colors.success + "30" : day.morning || day.evening ? colors.warning + "30" : colors.border + "50", alignItems: "center", justifyContent: "center", borderWidth: day.isToday ? 2 : 0, borderColor: colors.primary }}>
                    <Text style={{ fontSize: 12 }}>{day.morning && day.evening ? "✅" : day.morning || day.evening ? "🌤" : "⬜"}</Text>
                  </View>
                  <Text style={{ color: day.isToday ? colors.primary : colors.muted, fontSize: 9, fontWeight: day.isToday ? "bold" : "normal" }}>{day.day}</Text>
                </View>
              ));
            })()}
          </View>
          <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 12, marginTop: 8, justifyContent: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success + "30" }} />
              <Text style={{ color: colors.muted, fontSize: 10 }}>{language === "ar" ? "كاملة" : "Volledig"}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.warning + "30" }} />
              <Text style={{ color: colors.muted, fontSize: 10 }}>{language === "ar" ? "جزئية" : "Gedeeltelijk"}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.border + "50" }} />
              <Text style={{ color: colors.muted, fontSize: 10 }}>{language === "ar" ? "لم تُكمل" : "Niet gedaan"}</Text>
            </View>
          </View>
        </View>

        {/* Weekly Summary Numbers */}
        <View style={{ flexDirection: "row", justifyContent: "space-around", marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
          <View style={{ alignItems: "center" }}>
            <Text style={{ color: colors.primary, fontSize: 20, fontWeight: "bold" }}>
              {weeklyData.reduce((sum: number, d: any) => sum + Math.round((d.totalAppUsageSeconds || 0) / 60), 0)}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 10 }}>{language === "ar" ? "دقيقة إجمالي" : "min totaal"}</Text>
          </View>
          <View style={{ alignItems: "center" }}>
            <Text style={{ color: colors.success, fontSize: 20, fontWeight: "bold" }}>
              {weeklyData.reduce((sum: number, d: any) => sum + (d.customTasksCompleted || 0), 0)}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 10 }}>{language === "ar" ? "مهمة منجزة" : "taken gedaan"}</Text>
          </View>
          <View style={{ alignItems: "center" }}>
            <Text style={{ color: colors.warning, fontSize: 20, fontWeight: "bold" }}>
              {weeklyData.filter((d: any) => d.morningAdhkarDone && d.eveningAdhkarDone).length}/7
            </Text>
            <Text style={{ color: colors.muted, fontSize: 10 }}>{language === "ar" ? "أيام أذكار" : "adhkaar dagen"}</Text>
          </View>
        </View>
      </View>

      {/* Stats Cards */}
      <View style={{ flexDirection: flexDir, gap: 12 }}>
        <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 16, padding: 16, alignItems: "center", borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ fontSize: 28 }}>🎯</Text>
          <Text style={{ color: colors.foreground, fontWeight: "bold", fontSize: 20, marginTop: 4 }}>{completedChallenges}</Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>{language === "ar" ? "تحديات منجزة" : "Uitdagingen"}</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 16, padding: 16, alignItems: "center", borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ fontSize: 28 }}>🏆</Text>
          <Text style={{ color: colors.foreground, fontWeight: "bold", fontSize: 20, marginTop: 4 }}>{achievements.length}</Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>{language === "ar" ? "إنجازات" : "Prestaties"}</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 16, padding: 16, alignItems: "center", borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ fontSize: 28 }}>📊</Text>
          <Text style={{ color: colors.foreground, fontWeight: "bold", fontSize: 20, marginTop: 4 }}>{activities.length}</Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>{language === "ar" ? "أنشطة" : "Activiteiten"}</Text>
        </View>
      </View>

      {/* Child Access Code */}
      <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border, alignItems: "center" }}>
        <Text style={{ color: colors.muted, fontSize: 14, marginBottom: 8 }}>
          {language === "ar" ? "كود الدخول للطفل" : language === "nl" ? "Toegangscode kind" : "Child access code"}
        </Text>
        <Text style={{ color: colors.foreground, fontSize: 24, fontWeight: "bold", letterSpacing: 2, marginBottom: 12 }}>
          {childAccessCode || "..."}
        </Text>
        <TouchableOpacity
          onPress={() => {
            if (childAccessCode) {
              Share.share({ message: `${language === "ar" ? "كود الدخول" : "Toegangscode"}: ${childAccessCode}` });
            }
          }}
          style={{ backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 }}
        >
          <Text style={{ color: "#fff", fontWeight: "600" }}>{language === "ar" ? "مشاركة الكود" : "Code delen"}</Text>
        </TouchableOpacity>
      </View>

      {/* Recent Activity */}
      <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border }}>
        <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "bold", textAlign, marginBottom: 12 }}>
          {language === "ar" ? "آخر النشاطات" : "Recente activiteiten"}
        </Text>
        {activities.length === 0 ? (
          <Text style={{ color: colors.muted, textAlign: "center", padding: 20 }}>
            {language === "ar" ? "لا توجد نشاطات بعد" : "Nog geen activiteiten"}
          </Text>
        ) : (
          activities.slice(0, 10).map((activity: any, i: number) => (
            <View key={i} style={{ flexDirection: flexDir, alignItems: "center", padding: 12, borderBottomWidth: i < Math.min(activities.length, 10) - 1 ? 1 : 0, borderBottomColor: colors.border }}>
              <Text style={{ fontSize: 20, marginHorizontal: 12 }}>{getActivityIcon(activity.activityType)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.foreground, textAlign, fontSize: 14 }}>{getActivityLabel(activity.activityType)}</Text>
                <Text style={{ color: colors.muted, textAlign, fontSize: 12 }}>{new Date(activity.createdAt).toLocaleDateString(language === "ar" ? "ar-SA" : language === "nl" ? "nl-NL" : "en-US")}</Text>
              </View>
            </View>
          ))
        )}
      </View>
    </View>
  );

  // ===== TASKS TAB =====
  const renderTasks = () => (
    <View style={{ gap: 16 }}>
      {/* Add Task */}
      <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border }}>
        <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "bold", textAlign, marginBottom: 12 }}>
          {language === "ar" ? "إضافة مهمة جديدة" : language === "nl" ? "Nieuwe taak toevoegen" : "Add new task"}
        </Text>
        <TextInput
          value={newTaskTitle}
          onChangeText={setNewTaskTitle}
          placeholder={language === "ar" ? "عنوان المهمة..." : "Taaknaam..."}
          placeholderTextColor={colors.muted}
          style={{ backgroundColor: colors.background, borderRadius: 12, padding: 12, color: colors.foreground, borderWidth: 1, borderColor: colors.border, textAlign, marginBottom: 12 }}
          returnKeyType="done"
          onSubmitEditing={handleCreateTask}
        />
        {/* Category selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {["prayer", "quran", "study", "chores", "sport", "other"].map((cat) => (
              <TouchableOpacity
                key={cat}
                onPress={() => setNewTaskCategory(cat)}
                style={{
                  paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
                  backgroundColor: newTaskCategory === cat ? colors.primary : colors.background,
                  borderWidth: 1, borderColor: newTaskCategory === cat ? colors.primary : colors.border,
                }}
              >
                <Text style={{ color: newTaskCategory === cat ? "#fff" : colors.foreground, fontSize: 12 }}>
                  {getCategoryIcon(cat)} {getCategoryLabel(cat)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
        <TouchableOpacity
          onPress={handleCreateTask}
          disabled={!newTaskTitle.trim() || createTaskMutation.isPending}
          style={{ backgroundColor: colors.primary, borderRadius: 12, padding: 12, alignItems: "center", opacity: !newTaskTitle.trim() ? 0.5 : 1 }}
        >
          <Text style={{ color: "#fff", fontWeight: "bold" }}>
            {createTaskMutation.isPending ? "..." : language === "ar" ? "إضافة" : "Toevoegen"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Pending Tasks */}
      <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border }}>
        <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "bold", textAlign, marginBottom: 12 }}>
          {language === "ar" ? `مهام قيد الانتظار (${pendingTasks.length})` : `Openstaande taken (${pendingTasks.length})`}
        </Text>
        {pendingTasks.length === 0 ? (
          <Text style={{ color: colors.muted, textAlign: "center", padding: 16 }}>
            {language === "ar" ? "لا توجد مهام قيد الانتظار" : "Geen openstaande taken"}
          </Text>
        ) : (
          pendingTasks.map((task: any) => (
            <View key={task.id} style={{ flexDirection: flexDir, alignItems: "center", padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ fontSize: 20, marginHorizontal: 8 }}>{getCategoryIcon(task.category)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.foreground, textAlign, fontWeight: "600" }}>{task.title}</Text>
                {task.description && <Text style={{ color: colors.muted, textAlign, fontSize: 12 }}>{task.description}</Text>}
              </View>
              <View style={{ backgroundColor: colors.warning + "30", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                <Text style={{ color: colors.warning, fontSize: 11 }}>{language === "ar" ? "قيد الانتظار" : "Wachtend"}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Completed Tasks */}
      {completedTasks.length > 0 && (
        <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "bold", textAlign, marginBottom: 12 }}>
            {language === "ar" ? `مهام منجزة (${completedTasks.length})` : `Voltooide taken (${completedTasks.length})`}
          </Text>
          {completedTasks.slice(0, 10).map((task: any) => (
            <View key={task.id} style={{ flexDirection: flexDir, alignItems: "center", padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ fontSize: 20, marginHorizontal: 8 }}>✅</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.foreground, textAlign, fontWeight: "600" }}>{task.title}</Text>
                {task.childNote && <Text style={{ color: colors.muted, textAlign, fontSize: 12 }}>{task.childNote}</Text>}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );

  // ===== CHAT TAB =====
  const renderChat = () => {
    const sortedMessages = [...chatMessages].reverse();
    return (
      <View style={{ flex: 1, gap: 12 }}>
        <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border, flex: 1, maxHeight: 400 }}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {sortedMessages.length === 0 ? (
              <Text style={{ color: colors.muted, textAlign: "center", padding: 20 }}>
                {language === "ar" ? "ابدأ محادثة مع طفلك" : "Begin een gesprek met je kind"}
              </Text>
            ) : (
              sortedMessages.map((msg: any, i: number) => (
                <View key={i} style={{
                  alignSelf: msg.senderType === "parent" ? (isRTL ? "flex-start" : "flex-end") : (isRTL ? "flex-end" : "flex-start"),
                  backgroundColor: msg.senderType === "parent" ? colors.primary : colors.background,
                  borderRadius: 16,
                  padding: 12,
                  marginBottom: 8,
                  maxWidth: "80%",
                }}>
                  <Text style={{ color: msg.senderType === "parent" ? "#fff" : colors.foreground, textAlign }}>
                    {msg.content}
                  </Text>
                  <Text style={{ color: msg.senderType === "parent" ? "rgba(255,255,255,0.7)" : colors.muted, fontSize: 10, marginTop: 4, textAlign }}>
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
              ))
            )}
          </ScrollView>
        </View>
        {/* Input */}
        <View style={{ flexDirection: flexDir, gap: 8 }}>
          <TextInput
            value={chatMessage}
            onChangeText={setChatMessage}
            placeholder={language === "ar" ? "اكتب رسالة..." : "Schrijf een bericht..."}
            placeholderTextColor={colors.muted}
            style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: colors.foreground, borderWidth: 1, borderColor: colors.border, textAlign }}
            returnKeyType="send"
            onSubmitEditing={handleSendChat}
          />
          <TouchableOpacity
            onPress={handleSendChat}
            disabled={!chatMessage.trim() || sendChatMutation.isPending}
            style={{ backgroundColor: colors.primary, borderRadius: 20, width: 44, height: 44, alignItems: "center", justifyContent: "center", opacity: !chatMessage.trim() ? 0.5 : 1 }}
          >
            <Text style={{ color: "#fff", fontSize: 18 }}>➤</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ===== APPS TAB =====
  const renderApps = () => {
    const summary = dailySummaryQuery.data as any;
    const internalScreens: string[] = summary?.screensVisited ? (typeof summary.screensVisited === "string" ? JSON.parse(summary.screensVisited) : summary.screensVisited) : [];
    const internalMinutes = summary?.appUsageMinutes || 0;

    return (
      <View style={{ gap: 16 }}>
        {/* Internal app usage */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "bold", textAlign, marginBottom: 12 }}>
            {language === "ar" ? "استخدام التطبيق الداخلي اليوم" : language === "nl" ? "Intern app-gebruik vandaag" : "Internal app usage today"}
          </Text>
          {internalMinutes > 0 || internalScreens.length > 0 ? (
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: flexDir, alignItems: "center", padding: 12, backgroundColor: colors.primary + "15", borderRadius: 12 }}>
                <Text style={{ fontSize: 24, marginHorizontal: 8 }}>⏱️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.foreground, textAlign, fontWeight: "600" }}>
                    {language === "ar" ? "إجمالي وقت الاستخدام" : language === "nl" ? "Totale gebruikstijd" : "Total usage time"}
                  </Text>
                </View>
                <Text style={{ color: colors.primary, fontWeight: "bold", fontSize: 16 }}>
                  {internalMinutes} {language === "ar" ? "دقيقة" : "min"}
                </Text>
              </View>
              {internalScreens.length > 0 && (
                <View style={{ padding: 12 }}>
                  <Text style={{ color: colors.muted, textAlign, fontSize: 13, marginBottom: 8 }}>
                    {language === "ar" ? "الشاشات التي زارها:" : language === "nl" ? "Bezochte schermen:" : "Screens visited:"}
                  </Text>
                  {internalScreens.map((screen: string, i: number) => (
                    <View key={i} style={{ flexDirection: flexDir, alignItems: "center", paddingVertical: 4 }}>
                      <Text style={{ color: colors.foreground, marginHorizontal: 4 }}>•</Text>
                      <Text style={{ color: colors.foreground, textAlign }}>{screen}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ) : (
            <View style={{ alignItems: "center", padding: 16 }}>
              <Text style={{ color: colors.muted, textAlign: "center" }}>
                {language === "ar" ? "لم يستخدم الطفل التطبيق اليوم بعد" : language === "nl" ? "Het kind heeft de app vandaag nog niet gebruikt" : "The child hasn't used the app today yet"}
              </Text>
            </View>
          )}
        </View>

        {/* External app usage (Android) */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "bold", textAlign, marginBottom: 12 }}>
            {language === "ar" ? "تطبيقات الهاتف الخارجية" : language === "nl" ? "Externe telefoon-apps" : "External phone apps"}
          </Text>
          {appUsage.length === 0 ? (
            <View style={{ alignItems: "center", padding: 20 }}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>📱</Text>
              <Text style={{ color: colors.muted, textAlign: "center", lineHeight: 22 }}>
                {language === "ar"
                  ? "مراقبة التطبيقات الخارجية تتطلب:\n• هاتف Android\n• منح إذن UsageStats\n• تثبيت التطبيق كـ APK (ليس عبر المتصفح)"
                  : language === "nl"
                  ? "Externe app-monitoring vereist:\n• Android-telefoon\n• UsageStats-toestemming\n• App geïnstalleerd als APK (niet via browser)"
                  : "External app monitoring requires:\n• Android phone\n• UsageStats permission\n• App installed as APK (not via browser)"}
              </Text>

              {/* Activation button for parent to guide child */}
              <TouchableOpacity
                onPress={() => router.push("/child-account/usage-permission" as any)}
                style={{ marginTop: 16, backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 }}
              >
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>
                  {language === "ar" ? "📋 دليل التفعيل" : language === "nl" ? "📋 Activatiegids" : "📋 Activation Guide"}
                </Text>
              </TouchableOpacity>

              <View style={{ marginTop: 12, backgroundColor: colors.warning + "20", padding: 12, borderRadius: 8, width: "100%" }}>
                <Text style={{ color: colors.warning, textAlign: "center", fontSize: 12 }}>
                  {language === "ar"
                    ? "ℹ️ iOS لا يسمح بمراقبة التطبيقات الأخرى بسبب قيود Apple"
                    : language === "nl"
                    ? "ℹ️ iOS staat geen monitoring van andere apps toe vanwege Apple-beperkingen"
                    : "ℹ️ iOS does not allow monitoring other apps due to Apple restrictions"}
                </Text>
              </View>
            </View>
          ) : (
            <View style={{ gap: 4 }}>
              {/* Total screen time header */}
              {appUsage.length > 0 && (
                <View style={{ flexDirection: flexDir, alignItems: "center", padding: 12, backgroundColor: colors.primary + "12", borderRadius: 10, marginBottom: 8 }}>
                  <Text style={{ fontSize: 20, marginHorizontal: 6 }}>⏱️</Text>
                  <Text style={{ flex: 1, color: colors.foreground, textAlign, fontWeight: "600" }}>
                    {language === "ar" ? "إجمالي وقت الشاشة" : language === "nl" ? "Totale schermtijd" : "Total screen time"}
                  </Text>
                  <Text style={{ color: colors.primary, fontWeight: "bold", fontSize: 16 }}>
                    {formatTime(appUsage.reduce((sum: number, a: any) => sum + (a.usageSeconds || 0), 0))}
                  </Text>
                </View>
              )}
              {/* App list with category icons */}
              {appUsage.map((app: any, i: number) => {
                const catIcons: Record<string, string> = { social: "👥", games: "🎮", media: "📺", browser: "🌐", islamic: "🕌", education: "📚", news: "📰", productivity: "💼", other: "📱" };
                const catColors: Record<string, string> = { social: "#E91E63", games: "#FF5722", media: "#9C27B0", browser: "#2196F3", islamic: "#4CAF50", education: "#00BCD4", other: "#9E9E9E" };
                const icon = catIcons[app.category] || "📱";
                const catColor = catColors[app.category] || "#9E9E9E";
                return (
                  <View key={i} style={{ flexDirection: flexDir, alignItems: "center", paddingVertical: 10, paddingHorizontal: 8, borderBottomWidth: i < appUsage.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                    <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: catColor + "20", alignItems: "center", justifyContent: "center", marginHorizontal: 6 }}>
                      <Text style={{ fontSize: 18 }}>{icon}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.foreground, textAlign, fontWeight: "600", fontSize: 14 }}>{app.appName || app.packageName}</Text>
                      <Text style={{ color: catColor, textAlign, fontSize: 11, fontWeight: "500" }}>
                        {app.category === "social" ? (language === "ar" ? "تواصل" : "Sociaal") :
                         app.category === "games" ? (language === "ar" ? "ألعاب" : "Games") :
                         app.category === "media" ? (language === "ar" ? "وسائط" : "Media") :
                         app.category === "browser" ? (language === "ar" ? "متصفح" : "Browser") :
                         app.category === "islamic" ? (language === "ar" ? "إسلامي" : "Islamitisch") :
                         app.category === "education" ? (language === "ar" ? "تعليمي" : "Educatief") :
                         app.category || ""}
                      </Text>
                    </View>
                    <Text style={{ color: colors.primary, fontWeight: "bold", fontSize: 14 }}>{formatTime(app.usageSeconds)}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </View>
    );
  };

  // ===== AI CONVERSATIONS TAB =====
  const renderAiConversations = () => (
    <View style={{ gap: 16 }}>
      <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border }}>
        <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "bold", textAlign, marginBottom: 12 }}>
          {language === "ar" ? "محادثات الطفل مع الذكاء الاصطناعي" : "AI-gesprekken van het kind"}
        </Text>
        {aiConversations.length === 0 ? (
          <Text style={{ color: colors.muted, textAlign: "center", padding: 20 }}>
            {language === "ar" ? "لم يبدأ الطفل أي محادثة بعد" : "Het kind heeft nog geen gesprekken gestart"}
          </Text>
        ) : (
          aiConversations.map((conv: any) => (
            <View key={conv.id} style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View style={{ flexDirection: flexDir, justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: colors.foreground, textAlign, fontWeight: "600", flex: 1 }}>{conv.title || "..."}</Text>
                <View style={{
                  backgroundColor: conv.parentReviewed ? colors.success + "30" : colors.warning + "30",
                  paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
                }}>
                  <Text style={{ color: conv.parentReviewed ? colors.success : colors.warning, fontSize: 11 }}>
                    {conv.parentReviewed ? (language === "ar" ? "تمت المراجعة" : "Beoordeeld") : (language === "ar" ? "جديد" : "Nieuw")}
                  </Text>
                </View>
              </View>
              <Text style={{ color: colors.muted, textAlign, fontSize: 12, marginTop: 4 }}>
                {conv.messageCount || 0} {language === "ar" ? "رسائل" : "berichten"} • {new Date(conv.updatedAt || conv.createdAt).toLocaleDateString()}
              </Text>
            </View>
          ))
        )}
      </View>
    </View>
  );

  return (
    <ScreenContainer className="p-4" edges={["top", "bottom", "left", "right"]}>
      {/* Header */}
      <View style={{ flexDirection: flexDir, alignItems: "center", marginBottom: 16 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
          <Text style={{ color: colors.primary, fontSize: 16 }}>{isRTL ? "→" : "←"}</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "bold" }}>
            {language === "ar" ? `متابعة ${childName}` : `${childName} volgen`}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Loading state */}
      {isLoading && (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 40 }}>
          <Text style={{ color: colors.muted, fontSize: 14 }}>
            {language === "ar" ? "جارٍ التحميل..." : "Laden..."}
          </Text>
        </View>
      )}

      {/* No account - offer to create one */}
      {noAccountFound && (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 40 }}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>📱</Text>
          <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "bold", textAlign: "center", marginBottom: 8 }}>
            {language === "ar" ? "لا يوجد حساب متابعة لهذا الطفل" : language === "nl" ? "Geen monitoraccount voor dit kind" : "No monitoring account for this child"}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 13, textAlign: "center", marginBottom: 20, lineHeight: 20 }}>
            {language === "ar" ? "أنشئ حساب متابعة ليتمكن طفلك من استخدام التطبيق بشكل مستقل مع إمكانية متابعة نشاطه" : language === "nl" ? "Maak een monitoraccount aan zodat uw kind de app zelfstandig kan gebruiken" : "Create a monitoring account so your child can use the app independently"}
          </Text>
          <TouchableOpacity
            onPress={() => {
              createAccountMutation.mutate({
                childProfileId: childProfileId,
                ageGroup: childAge && childAge >= 18 ? "18+" : childAge && childAge >= 15 ? "15-17" : "12-14",
                gender: childGender === "meisje" ? "female" : "male",
                language: language,
              });
            }}
            style={{ backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}
          >
            <Text style={{ color: "#fff", fontSize: 14, fontWeight: "bold" }}>
              {language === "ar" ? "إنشاء حساب متابعة" : language === "nl" ? "Monitoraccount aanmaken" : "Create monitoring account"}
            </Text>
          </TouchableOpacity>
          {createAccountMutation.isPending && (
            <Text style={{ color: colors.muted, fontSize: 12, marginTop: 8 }}>
              {language === "ar" ? "جارٍ الإنشاء..." : "Creating..."}
            </Text>
          )}
        </View>
      )}

      {childAccountId > 0 && (
        <View style={{ flex: 1 }}>
          {/* Tabs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16, maxHeight: 44 }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["overview", "tasks", "chat", "apps", "ai"] as TabType[]).map(renderTab)}
            </View>
          </ScrollView>

          {/* Content */}
          <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            {activeTab === "overview" && renderOverview()}
            {activeTab === "tasks" && renderTasks()}
            {activeTab === "chat" && renderChat()}
            {activeTab === "apps" && renderApps()}
            {activeTab === "ai" && renderAiConversations()}
          </ScrollView>
        </View>
      )}
    </ScreenContainer>
  );
}
