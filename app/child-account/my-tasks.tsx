import { useState, useEffect } from "react";
import { Text, View, ScrollView, TouchableOpacity, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import { startScreenTracking, endScreenTracking } from "@/lib/app-usage-tracker";

interface Task {
  id: number;
  title: string;
  description: string | null;
  category: string | null;
  priority: string | null;
  status: string | null;
  dueDate: string | null;
  createdAt: Date | string;
}

export default function ChildMyTasksScreen() {
  const colors = useColors();
  const router = useRouter();
  const { language, isRTL } = useI18n();
  const params = useLocalSearchParams<{ accountId: string }>();
  const accountId = Number(params.accountId) || 0;

  useEffect(() => {
    startScreenTracking("my-tasks");
    return () => { endScreenTracking(); };
  }, []);

  const textAlign = isRTL ? "right" as const : "left" as const;
  const flexDir = isRTL ? "row-reverse" as const : "row" as const;

  const tasksQuery = trpc.customTasks.list.useQuery(
    { childAccountId: accountId },
    { refetchInterval: 30000 }
  );

  const completeMutation = trpc.customTasks.complete.useMutation({
    onSuccess: () => tasksQuery.refetch(),
  });

  const tasks: Task[] = (tasksQuery.data as unknown as Task[]) || [];
  const pendingTasks = tasks.filter(t => t.status === "pending");
  const completedTasks = tasks.filter(t => t.status === "completed");

  const handleComplete = (taskId: number, title: string) => {
    Alert.alert(
      language === "ar" ? "إتمام المهمة" : "Taak voltooien",
      language === "ar" ? `هل أتممت "${title}"؟` : `Heb je "${title}" voltooid?`,
      [
        { text: language === "ar" ? "إلغاء" : "Annuleren", style: "cancel" },
        {
          text: language === "ar" ? "نعم ✓" : "Ja ✓",
          onPress: () => completeMutation.mutate({ taskId }),
        },
      ]
    );
  };

  const getCategoryEmoji = (cat: string) => {
    switch (cat) {
      case "quran": return "📖";
      case "prayer": return "🕌";
      case "study": return "📚";
      case "chores": return "🏠";
      case "exercise": return "🏃";
      case "dhikr": return "📿";
      default: return "📋";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high": return colors.error;
      case "medium": return colors.warning;
      default: return colors.success;
    }
  };

  return (
    <ScreenContainer className="p-4" edges={["top", "bottom", "left", "right"]}>
      {/* Header */}
      <View style={{ flexDirection: flexDir, alignItems: "center", marginBottom: 16 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
          <Text style={{ color: colors.primary, fontSize: 16 }}>{isRTL ? "→" : "←"}</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={{ color: colors.foreground, fontSize: 20, fontWeight: "bold" }}>
            📋 {language === "ar" ? "مهامي" : language === "nl" ? "Mijn taken" : "My tasks"}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Pending Tasks */}
        {pendingTasks.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "bold", textAlign, marginBottom: 12 }}>
              {language === "ar" ? `المهام المطلوبة (${pendingTasks.length})` : `Te doen (${pendingTasks.length})`}
            </Text>
            {pendingTasks.map(task => (
              <TouchableOpacity
                key={task.id}
                onPress={() => handleComplete(task.id, task.title)}
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 8,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderLeftWidth: 4,
                  borderLeftColor: getPriorityColor(task.priority || "medium"),
                }}
              >
                <View style={{ flexDirection: flexDir, alignItems: "center", gap: 8 }}>
                  <Text style={{ fontSize: 24 }}>{getCategoryEmoji(task.category || "other")}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.foreground, fontWeight: "bold", textAlign, fontSize: 15 }}>
                      {task.title}
                    </Text>
                    {task.description && (
                      <Text style={{ color: colors.muted, textAlign, fontSize: 13, marginTop: 4 }}>
                        {task.description}
                      </Text>
                    )}
                    {task.dueDate && (
                      <Text style={{ color: colors.warning, fontSize: 12, textAlign, marginTop: 4 }}>
                        ⏰ {new Date(task.dueDate).toLocaleDateString()}
                      </Text>
                    )}
                  </View>
                  <View style={{ backgroundColor: colors.success + "20", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 }}>
                    <Text style={{ color: colors.success, fontSize: 12, fontWeight: "bold" }}>
                      {language === "ar" ? "أتممت ✓" : "Klaar ✓"}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Completed Tasks */}
        {completedTasks.length > 0 && (
          <View>
            <Text style={{ color: colors.muted, fontSize: 16, fontWeight: "bold", textAlign, marginBottom: 12 }}>
              {language === "ar" ? `تم إنجازها ✓ (${completedTasks.length})` : `Voltooid ✓ (${completedTasks.length})`}
            </Text>
            {completedTasks.map(task => (
              <View
                key={task.id}
                style={{
                  backgroundColor: colors.success + "10",
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 8,
                  borderWidth: 1,
                  borderColor: colors.success + "30",
                }}
              >
                <View style={{ flexDirection: flexDir, alignItems: "center", gap: 8 }}>
                  <Text style={{ fontSize: 20 }}>✅</Text>
                  <Text style={{ color: colors.muted, flex: 1, textAlign, textDecorationLine: "line-through" }}>
                    {task.title}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Empty state */}
        {tasks.length === 0 && !tasksQuery.isLoading && (
          <View style={{ alignItems: "center", paddingVertical: 60 }}>
            <Text style={{ fontSize: 48, marginBottom: 16 }}>🎉</Text>
            <Text style={{ color: colors.muted, textAlign: "center", fontSize: 16, lineHeight: 24 }}>
              {language === "ar" ? "لا توجد مهام حالياً.\nأحسنت!" : language === "nl" ? "Geen taken op dit moment.\nGoed gedaan!" : "No tasks right now.\nWell done!"}
            </Text>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
