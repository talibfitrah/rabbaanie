import React, { useState } from "react";
import {
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import { DatePicker } from "@/components/date-picker";

export default function CreateTreatmentPlanScreen() {
  const colors = useColors();
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  const [title, setTitle] = useState("");
  const [issueDescription, setIssueDescription] = useState("");
  const [planContent, setPlanContent] = useState("");
  const [priority, setPriority] = useState("medium");
  const [category, setCategory] = useState("");
  const [goals, setGoals] = useState<{ text: string; completed: boolean }[]>([]);
  const [newGoal, setNewGoal] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [targetEndDate, setTargetEndDate] = useState("");
  const [selectedFamilyId, setSelectedFamilyId] = useState<number | null>(null);
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null);

  const familiesQuery = trpc.specialist.families.useQuery(undefined, { enabled: isAuthenticated });
  const childrenQuery = trpc.specialist.children.useQuery(undefined, { enabled: isAuthenticated });

  const createMutation = trpc.specialist.createPlan.useMutation({
    onSuccess: (data) => {
      Alert.alert("Success", "Treatment plan created successfully.");
      router.replace(`/specialist/plan/${data.id}`);
    },
    onError: (err) => {
      Alert.alert("Error", err.message);
    },
  });

  const addGoal = () => {
    if (newGoal.trim()) {
      setGoals([...goals, { text: newGoal.trim(), completed: false }]);
      setNewGoal("");
    }
  };

  const removeGoal = (idx: number) => {
    setGoals(goals.filter((_, i) => i !== idx));
  };

  const handleSubmit = () => {
    if (!title.trim()) {
      Alert.alert("Error", "Please enter a title for the treatment plan.");
      return;
    }
    if (!selectedFamilyId || !selectedChildId) {
      Alert.alert("Error", "Please select a family and child.");
      return;
    }
    createMutation.mutate({
      familyId: selectedFamilyId,
      childId: selectedChildId,
      title: title.trim(),
      issueDescription: issueDescription.trim() || undefined,
      planContent: planContent.trim() || undefined,
      priority,
      category: category || undefined,
      goals: goals.length > 0 ? goals : undefined,
      startDate: startDate || undefined,
      targetEndDate: targetEndDate || undefined,
    });
  };

  const priorities = ["low", "medium", "high", "urgent"];
  const categories = ["behavior", "emotional", "social", "academic", "faith", "health"];

  const families = familiesQuery.data ?? [];
  const allChildren = childrenQuery.data ?? [];
  const familyChildren = selectedFamilyId ? allChildren.filter((c: any) => c.familyId === selectedFamilyId) : [];

  return (
    <ScreenContainer>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
        <TouchableOpacity onPress={() => router.back()}>
          <IconSymbol name="chevron.right" size={24} color={colors.primary} style={{ transform: [{ scaleX: -1 }] }} />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-foreground">New Treatment Plan</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16, paddingBottom: 100 }}
      >
        {/* Family Selection */}
        <View className="mb-4">
          <Text className="text-sm font-bold mb-2" style={{ color: colors.foreground }}>Family *</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-2">
              {families.map((f: any) => (
                <TouchableOpacity
                  key={f.id}
                  className="px-4 py-2 rounded-lg"
                  style={{
                    backgroundColor: selectedFamilyId === f.familyId ? colors.primary : colors.surface,
                    borderWidth: 1,
                    borderColor: selectedFamilyId === f.familyId ? colors.primary : colors.border,
                  }}
                  onPress={() => { setSelectedFamilyId(f.familyId); setSelectedChildId(null); }}
                >
                  <Text className="text-xs font-medium" style={{ color: selectedFamilyId === f.familyId ? "#fff" : colors.foreground }}>
                    {f.family?.name ?? `Family #${f.familyId}`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Child Selection */}
        {selectedFamilyId && (
          <View className="mb-4">
            <Text className="text-sm font-bold mb-2" style={{ color: colors.foreground }}>Child *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-2">
                {familyChildren.map((c: any) => (
                  <TouchableOpacity
                    key={c.id}
                    className="px-4 py-2 rounded-lg"
                    style={{
                      backgroundColor: selectedChildId === c.id ? colors.primary : colors.surface,
                      borderWidth: 1,
                      borderColor: selectedChildId === c.id ? colors.primary : colors.border,
                    }}
                    onPress={() => setSelectedChildId(c.id)}
                  >
                    <Text className="text-xs font-medium" style={{ color: selectedChildId === c.id ? "#fff" : colors.foreground }}>
                      {c.name}
                    </Text>
                  </TouchableOpacity>
                ))}
                {familyChildren.length === 0 && (
                  <Text className="text-xs" style={{ color: colors.muted }}>No children in this family.</Text>
                )}
              </View>
            </ScrollView>
          </View>
        )}

        {/* Title */}
        <View className="mb-4">
          <Text className="text-sm font-bold mb-2" style={{ color: colors.foreground }}>Title *</Text>
          <TextInput
            className="rounded-lg p-3 text-sm"
            style={{ backgroundColor: colors.surface, color: colors.foreground, borderWidth: 1, borderColor: colors.border }}
            placeholder="e.g., Behavioral improvement plan"
            placeholderTextColor={colors.muted}
            value={title}
            onChangeText={setTitle}
          />
        </View>

        {/* Category */}
        <View className="mb-4">
          <Text className="text-sm font-bold mb-2" style={{ color: colors.foreground }}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-2">
              {categories.map((c) => (
                <TouchableOpacity
                  key={c}
                  className="px-3 py-1.5 rounded-full"
                  style={{
                    backgroundColor: category === c ? colors.primary : colors.surface,
                    borderWidth: 1,
                    borderColor: category === c ? colors.primary : colors.border,
                  }}
                  onPress={() => setCategory(category === c ? "" : c)}
                >
                  <Text className="text-xs" style={{ color: category === c ? "#fff" : colors.foreground }}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Priority */}
        <View className="mb-4">
          <Text className="text-sm font-bold mb-2" style={{ color: colors.foreground }}>Priority</Text>
          <View className="flex-row gap-2">
            {priorities.map((p) => (
              <TouchableOpacity
                key={p}
                className="px-3 py-1.5 rounded-full"
                style={{
                  backgroundColor: priority === p ? getPriorityColor(p) : colors.surface,
                  borderWidth: 1,
                  borderColor: priority === p ? getPriorityColor(p) : colors.border,
                }}
                onPress={() => setPriority(p)}
              >
                <Text className="text-xs font-medium" style={{ color: priority === p ? "#fff" : colors.foreground }}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Issue Description */}
        <View className="mb-4">
          <Text className="text-sm font-bold mb-2" style={{ color: colors.foreground }}>Issue Description</Text>
          <TextInput
            className="rounded-lg p-3 text-sm"
            style={{ backgroundColor: colors.surface, color: colors.foreground, borderWidth: 1, borderColor: colors.border, minHeight: 80, textAlignVertical: "top" }}
            placeholder="Describe the issue or concern..."
            placeholderTextColor={colors.muted}
            value={issueDescription}
            onChangeText={setIssueDescription}
            multiline
          />
        </View>

        {/* Plan Content */}
        <View className="mb-4">
          <Text className="text-sm font-bold mb-2" style={{ color: colors.foreground }}>Treatment Plan</Text>
          <TextInput
            className="rounded-lg p-3 text-sm"
            style={{ backgroundColor: colors.surface, color: colors.foreground, borderWidth: 1, borderColor: colors.border, minHeight: 120, textAlignVertical: "top" }}
            placeholder="Describe the treatment approach, methods, and steps..."
            placeholderTextColor={colors.muted}
            value={planContent}
            onChangeText={setPlanContent}
            multiline
          />
        </View>

        {/* Goals */}
        <View className="mb-4">
          <Text className="text-sm font-bold mb-2" style={{ color: colors.foreground }}>Goals</Text>
          {goals.map((goal, idx) => (
            <View key={idx} className="flex-row items-center gap-2 mb-2">
              <View className="flex-1 rounded-lg p-3" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                <Text className="text-xs" style={{ color: colors.foreground }}>{goal.text}</Text>
              </View>
              <TouchableOpacity onPress={() => removeGoal(idx)}>
                <Text className="text-base" style={{ color: colors.error }}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
          <View className="flex-row items-center gap-2">
            <TextInput
              className="flex-1 rounded-lg p-3 text-sm"
              style={{ backgroundColor: colors.surface, color: colors.foreground, borderWidth: 1, borderColor: colors.border }}
              placeholder="Add a goal..."
              placeholderTextColor={colors.muted}
              value={newGoal}
              onChangeText={setNewGoal}
              onSubmitEditing={addGoal}
              returnKeyType="done"
            />
            <TouchableOpacity
              className="px-3 py-3 rounded-lg"
              style={{ backgroundColor: colors.primary, opacity: newGoal.trim() ? 1 : 0.5 }}
              onPress={addGoal}
              disabled={!newGoal.trim()}
            >
              <Text className="text-xs font-bold text-white">Add</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Dates */}
        <View className="flex-row gap-3 mb-6">
          <View className="flex-1">
            <DatePicker
              value={startDate}
              onChange={setStartDate}
              label="Start Date"
              placeholder="Select start date"
              minDate={new Date()}
              maxDate={new Date(2030, 11, 31)}
            />
          </View>
          <View className="flex-1">
            <DatePicker
              value={targetEndDate}
              onChange={setTargetEndDate}
              label="Target End"
              placeholder="Select end date"
              minDate={new Date()}
              maxDate={new Date(2030, 11, 31)}
            />
          </View>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          className="rounded-xl py-4 items-center"
          style={{ backgroundColor: colors.primary, opacity: title.trim() && selectedFamilyId && selectedChildId ? 1 : 0.5 }}
          onPress={handleSubmit}
          disabled={!title.trim() || !selectedFamilyId || !selectedChildId || createMutation.isPending}
        >
          <Text className="text-base font-bold text-white">
            {createMutation.isPending ? "Creating..." : "Create Treatment Plan"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
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
