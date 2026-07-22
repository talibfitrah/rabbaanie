import React, { useState } from "react";
import {
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
  RefreshControl,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";

export default function TreatmentPlanDetailScreen() {
  const colors = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isAuthenticated } = useAuth();
  const planId = parseInt(id || "0", 10);

  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteContent, setNoteContent] = useState("");
  const [noteType, setNoteType] = useState("feedback");
  const [visibleToParents, setVisibleToParents] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editingStatus, setEditingStatus] = useState(false);

  const planQuery = trpc.specialist.getPlan.useQuery({ planId }, { enabled: isAuthenticated && planId > 0 });
  const notesQuery = trpc.specialist.planNotes.useQuery(
    { treatmentPlanId: planId, includePrivate: true },
    { enabled: isAuthenticated && planId > 0 }
  );

  const addNoteMutation = trpc.specialist.addNote.useMutation({
    onSuccess: () => {
      setNoteContent("");
      setShowNoteForm(false);
      notesQuery.refetch();
    },
  });

  const updatePlanMutation = trpc.specialist.updatePlan.useMutation({
    onSuccess: () => {
      planQuery.refetch();
      setEditingStatus(false);
    },
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([planQuery.refetch(), notesQuery.refetch()]);
    setRefreshing(false);
  };

  if (!planQuery.data && planQuery.isLoading) {
    return (
      <ScreenContainer className="p-6">
        <ActivityIndicator size="large" color={colors.primary} />
      </ScreenContainer>
    );
  }

  const plan = planQuery.data;
  if (!plan) {
    return (
      <ScreenContainer className="p-6">
        <View className="flex-1 items-center justify-center">
          <Text className="text-base text-muted">Treatment plan not found.</Text>
        </View>
      </ScreenContainer>
    );
  }

  const goals = plan.goals ? (typeof plan.goals === "string" ? JSON.parse(plan.goals) : plan.goals) : [];
  const notes = notesQuery.data ?? [];
  const noteTypes = ["feedback", "progress", "guidance", "observation", "milestone", "concern"];
  const statuses = ["active", "paused", "completed", "archived"];

  return (
    <ScreenContainer>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
        <TouchableOpacity onPress={() => router.back()}>
          <IconSymbol name="chevron.right" size={24} color={colors.primary} style={{ transform: [{ scaleX: -1 }] }} />
        </TouchableOpacity>
        <Text className="text-base font-bold text-foreground" numberOfLines={1} style={{ maxWidth: "60%" }}>
          {plan.title}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Plan Overview Card */}
        <View className="rounded-2xl p-5 mb-4" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-lg font-bold" style={{ color: colors.foreground }}>{plan.title}</Text>
            <TouchableOpacity onPress={() => setEditingStatus(!editingStatus)}>
              <View className="rounded-full px-3 py-1" style={{ backgroundColor: getStatusColor(plan.status) + "15" }}>
                <Text className="text-xs font-bold" style={{ color: getStatusColor(plan.status) }}>
                  {plan.status} {editingStatus ? "▼" : ""}
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Status change dropdown */}
          {editingStatus && (
            <View className="flex-row flex-wrap gap-2 mb-3 p-3 rounded-lg" style={{ backgroundColor: colors.background }}>
              {statuses.map((s) => (
                <TouchableOpacity
                  key={s}
                  className="px-3 py-1.5 rounded-full"
                  style={{ backgroundColor: s === plan.status ? getStatusColor(s) : getStatusColor(s) + "15" }}
                  onPress={() => updatePlanMutation.mutate({ planId, status: s })}
                >
                  <Text className="text-xs font-medium" style={{ color: s === plan.status ? "#fff" : getStatusColor(s) }}>
                    {s}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Meta info */}
          <View className="flex-row flex-wrap gap-3 mb-3">
            {plan.priority && (
              <View className="flex-row items-center gap-1">
                <Text className="text-xs" style={{ color: colors.muted }}>Priority:</Text>
                <Text className="text-xs font-bold" style={{ color: getPriorityColor(plan.priority) }}>
                  {plan.priority}
                </Text>
              </View>
            )}
            {plan.category && (
              <View className="flex-row items-center gap-1">
                <Text className="text-xs" style={{ color: colors.muted }}>Category:</Text>
                <Text className="text-xs font-bold" style={{ color: colors.foreground }}>{plan.category}</Text>
              </View>
            )}
            {plan.startDate && (
              <View className="flex-row items-center gap-1">
                <Text className="text-xs" style={{ color: colors.muted }}>Start:</Text>
                <Text className="text-xs" style={{ color: colors.foreground }}>{plan.startDate}</Text>
              </View>
            )}
            {plan.targetEndDate && (
              <View className="flex-row items-center gap-1">
                <Text className="text-xs" style={{ color: colors.muted }}>Target:</Text>
                <Text className="text-xs" style={{ color: colors.foreground }}>{plan.targetEndDate}</Text>
              </View>
            )}
          </View>

          {/* Issue Description */}
          {plan.issueDescription && (
            <View className="mb-3">
              <Text className="text-xs font-bold mb-1" style={{ color: colors.muted }}>Issue Description</Text>
              <Text className="text-sm leading-5" style={{ color: colors.foreground }}>
                {plan.issueDescription}
              </Text>
            </View>
          )}

          {/* Plan Content */}
          {plan.planContent && (
            <View className="mb-3">
              <Text className="text-xs font-bold mb-1" style={{ color: colors.muted }}>Treatment Plan</Text>
              <Text className="text-sm leading-5" style={{ color: colors.foreground }}>
                {plan.planContent}
              </Text>
            </View>
          )}
        </View>

        {/* Goals Section */}
        {goals.length > 0 && (
          <View className="rounded-2xl p-5 mb-4" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
            <Text className="text-base font-bold mb-3" style={{ color: colors.foreground }}>
              Goals ({goals.filter((g: any) => g.completed).length}/{goals.length})
            </Text>
            {goals.map((goal: any, idx: number) => (
              <View key={idx} className="flex-row items-start gap-3 mb-2">
                <TouchableOpacity
                  onPress={() => {
                    const updatedGoals = [...goals];
                    updatedGoals[idx] = { ...updatedGoals[idx], completed: !updatedGoals[idx].completed };
                    updatePlanMutation.mutate({ planId, goals: updatedGoals });
                  }}
                >
                  <View
                    className="w-5 h-5 rounded-md items-center justify-center mt-0.5"
                    style={{
                      backgroundColor: goal.completed ? colors.success : "transparent",
                      borderWidth: goal.completed ? 0 : 2,
                      borderColor: colors.border,
                    }}
                  >
                    {goal.completed && <Text className="text-xs text-white font-bold">✓</Text>}
                  </View>
                </TouchableOpacity>
                <Text
                  className="text-sm flex-1"
                  style={{ color: goal.completed ? colors.muted : colors.foreground, textDecorationLine: goal.completed ? "line-through" : "none" }}
                >
                  {goal.text}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Notes Section */}
        <View className="mb-4">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-base font-bold" style={{ color: colors.foreground }}>
              Notes & Feedback ({notes.length})
            </Text>
            <TouchableOpacity
              className="px-3 py-2 rounded-lg"
              style={{ backgroundColor: colors.primary }}
              onPress={() => setShowNoteForm(!showNoteForm)}
            >
              <Text className="text-xs font-bold text-white">
                {showNoteForm ? "Cancel" : "+ Add Note"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Add Note Form */}
          {showNoteForm && (
            <View className="rounded-xl p-4 mb-4" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary + "40" }}>
              <Text className="text-sm font-bold mb-2" style={{ color: colors.foreground }}>New Note</Text>

              {/* Note type selector */}
              <Text className="text-xs mb-1" style={{ color: colors.muted }}>Type</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
                <View className="flex-row gap-2">
                  {noteTypes.map((t) => (
                    <TouchableOpacity
                      key={t}
                      className={`px-3 py-1.5 rounded-full`}
                      style={{ backgroundColor: noteType === t ? colors.primary : colors.background, borderWidth: 1, borderColor: colors.border }}
                      onPress={() => setNoteType(t)}
                    >
                      <Text className="text-xs" style={{ color: noteType === t ? "#fff" : colors.foreground }}>
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              {/* Content */}
              <TextInput
                className="rounded-lg p-3 mb-3 text-sm"
                style={{ backgroundColor: colors.background, color: colors.foreground, borderWidth: 1, borderColor: colors.border, minHeight: 100, textAlignVertical: "top" }}
                placeholder="Write your note, feedback, or guidance here..."
                placeholderTextColor={colors.muted}
                value={noteContent}
                onChangeText={setNoteContent}
                multiline
              />

              {/* Visibility toggle */}
              <TouchableOpacity
                className="flex-row items-center gap-2 mb-3"
                onPress={() => setVisibleToParents(!visibleToParents)}
              >
                <View
                  className="w-5 h-5 rounded-md items-center justify-center"
                  style={{
                    backgroundColor: visibleToParents ? colors.primary : "transparent",
                    borderWidth: visibleToParents ? 0 : 2,
                    borderColor: colors.border,
                  }}
                >
                  {visibleToParents && <Text className="text-xs text-white font-bold">✓</Text>}
                </View>
                <Text className="text-xs" style={{ color: colors.foreground }}>Visible to parents</Text>
              </TouchableOpacity>

              {/* Submit */}
              <TouchableOpacity
                className="rounded-lg py-3 items-center"
                style={{ backgroundColor: colors.primary, opacity: noteContent.trim() ? 1 : 0.5 }}
                onPress={() => {
                  if (!noteContent.trim()) return;
                  addNoteMutation.mutate({
                    treatmentPlanId: planId,
                    type: noteType,
                    content: noteContent.trim(),
                    visibleToParents,
                  });
                }}
                disabled={!noteContent.trim() || addNoteMutation.isPending}
              >
                <Text className="text-sm font-bold text-white">
                  {addNoteMutation.isPending ? "Saving..." : "Save Note"}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Notes List */}
          {notes.length === 0 && !showNoteForm && (
            <View className="items-center py-6 rounded-xl" style={{ backgroundColor: colors.surface }}>
              <Text className="text-sm text-center" style={{ color: colors.muted }}>
                No notes yet. Add your first note or feedback.
              </Text>
            </View>
          )}

          {notes.map((note: any) => (
            <View
              key={note.id}
              className="rounded-xl p-4 mb-3"
              style={{
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: note.pinned ? colors.warning + "50" : colors.border,
                borderLeftWidth: 4,
                borderLeftColor: getNoteTypeColor(note.type),
              }}
            >
              <View className="flex-row items-center justify-between mb-2">
                <View className="flex-row items-center gap-2">
                  <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: getNoteTypeColor(note.type) + "15" }}>
                    <Text className="text-xs font-medium" style={{ color: getNoteTypeColor(note.type) }}>
                      {note.type}
                    </Text>
                  </View>
                  {note.pinned && (
                    <Text className="text-xs" style={{ color: colors.warning }}>📌</Text>
                  )}
                  {!note.visibleToParents && (
                    <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: colors.error + "15" }}>
                      <Text className="text-xs" style={{ color: colors.error }}>Private</Text>
                    </View>
                  )}
                </View>
                <Text className="text-xs" style={{ color: colors.muted }}>
                  {new Date(note.createdAt).toLocaleDateString()}
                </Text>
              </View>
              <Text className="text-sm leading-5" style={{ color: colors.foreground }}>
                {note.content}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </ScreenContainer>
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

function getNoteTypeColor(type: string): string {
  switch (type) {
    case "progress": return "#3B82F6";
    case "feedback": return "#8B5CF6";
    case "guidance": return "#10B981";
    case "observation": return "#F59E0B";
    case "milestone": return "#EC4899";
    case "concern": return "#EF4444";
    default: return "#6B7280";
  }
}
