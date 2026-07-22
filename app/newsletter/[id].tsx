import { useState, useEffect } from "react";
import {
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import * as Haptics from "expo-haptics";

export default function NewsletterDetailScreen() {
  const colors = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [responses, setResponses] = useState<Record<number, any>>({});
  const [reflections, setReflections] = useState<Record<number, string>>({});

  const newsletterQuery = trpc.newsletter.get.useQuery(
    { id: parseInt(id || "0") },
    { enabled: !!id }
  );

  if (newsletterQuery.isLoading) {
    return (
      <ScreenContainer className="items-center justify-center">
        <ActivityIndicator size="large" color={colors.primary} />
      </ScreenContainer>
    );
  }

  const newsletter = newsletterQuery.data;
  if (!newsletter) {
    return (
      <ScreenContainer className="items-center justify-center">
        <Text className="text-muted">Nieuwsbrief niet gevonden.</Text>
      </ScreenContainer>
    );
  }

  const interactiveElements = Array.isArray(newsletter.interactiveElements) ? newsletter.interactiveElements : [];

  const handlePollVote = (elementIdx: number, optionIdx: number) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setResponses({ ...responses, [elementIdx]: optionIdx });
  };

  const handleQuizAnswer = (elementIdx: number, optionIdx: number) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setResponses({ ...responses, [elementIdx]: optionIdx });
  };

  return (
    <ScreenContainer>
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
        <TouchableOpacity onPress={() => router.back()}>
          <IconSymbol name="chevron.right" size={24} color={colors.primary} style={{ transform: [{ scaleX: -1 }] }} />
        </TouchableOpacity>
        <Text className="text-base font-bold text-foreground flex-1 text-center" numberOfLines={1}>
          {newsletter.titleNl || newsletter.titleEn || "Nieuwsbrief"}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingVertical: 20, gap: 20 }}>
        {/* Date */}
        <Text className="text-xs text-muted">
          {newsletter.sentAt ? new Date(newsletter.sentAt).toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : ""}
        </Text>

        {/* Title */}
        <Text className="text-2xl font-bold text-foreground">{newsletter.titleNl || newsletter.titleEn}</Text>

        {/* Content */}
        {newsletter.contentNl && (
          <Text className="text-sm text-foreground leading-relaxed">{newsletter.contentNl}</Text>
        )}

        {/* Interactive Elements */}
        {interactiveElements.length > 0 && (
          <View className="gap-4 mt-4">
            <Text className="text-base font-bold text-foreground">Interactief</Text>
            {interactiveElements.map((element: any, idx: number) => {
              if (element.type === "poll") {
                return (
                  <View key={idx} className="bg-surface rounded-xl p-4 border border-border">
                    <Text className="text-sm font-semibold text-foreground mb-3">{element.question || "Peiling"}</Text>
                    {element.options?.map((option: string, optIdx: number) => {
                      const isSelected = responses[idx] === optIdx;
                      const hasVoted = responses[idx] !== undefined;
                      return (
                        <TouchableOpacity
                          key={optIdx}
                          className={`p-3 rounded-lg mb-2 border ${isSelected ? "border-primary bg-primary/10" : "border-border bg-background"}`}
                          onPress={() => !hasVoted && handlePollVote(idx, optIdx)}
                          disabled={hasVoted}
                        >
                          <View className="flex-row items-center gap-2">
                            <View className={`w-5 h-5 rounded-full border-2 items-center justify-center ${isSelected ? "border-primary bg-primary" : "border-border"}`}>
                              {isSelected && <Text style={{ color: "white", fontSize: 10 }}>✓</Text>}
                            </View>
                            <Text className={`text-sm ${isSelected ? "text-primary font-semibold" : "text-foreground"}`}>{option}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                    {responses[idx] !== undefined && (
                      <Text className="text-xs text-success mt-2">Bedankt voor uw stem!</Text>
                    )}
                  </View>
                );
              }

              if (element.type === "quiz") {
                const correctIdx = element.correctIndex ?? 0;
                const hasAnswered = responses[idx] !== undefined;
                const isCorrect = responses[idx] === correctIdx;
                return (
                  <View key={idx} className="bg-surface rounded-xl p-4 border border-border">
                    <Text className="text-sm font-semibold text-foreground mb-3">{element.question || "Quiz"}</Text>
                    {element.options?.map((option: string, optIdx: number) => {
                      const isSelected = responses[idx] === optIdx;
                      const showCorrect = hasAnswered && optIdx === correctIdx;
                      const showWrong = hasAnswered && isSelected && !isCorrect;
                      return (
                        <TouchableOpacity
                          key={optIdx}
                          className={`p-3 rounded-lg mb-2 border ${showCorrect ? "border-success bg-success/10" : showWrong ? "border-error bg-error/10" : isSelected ? "border-primary bg-primary/10" : "border-border bg-background"}`}
                          onPress={() => !hasAnswered && handleQuizAnswer(idx, optIdx)}
                          disabled={hasAnswered}
                        >
                          <Text className={`text-sm ${showCorrect ? "text-success font-semibold" : showWrong ? "text-error" : "text-foreground"}`}>
                            {showCorrect ? "✓ " : showWrong ? "✗ " : ""}{option}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                    {hasAnswered && (
                      <Text className={`text-xs mt-2 ${isCorrect ? "text-success" : "text-error"}`}>
                        {isCorrect ? "Correct! Maa shaa Allaah." : "Helaas, probeer het opnieuw."}
                      </Text>
                    )}
                  </View>
                );
              }

              if (element.type === "reflection") {
                return (
                  <View key={idx} className="bg-surface rounded-xl p-4 border border-border">
                    <Text className="text-sm font-semibold text-foreground mb-3">{element.prompt || "Reflectie"}</Text>
                    <TextInput
                      className="bg-background border border-border rounded-lg p-3 text-foreground text-sm"
                      placeholder="Schrijf uw gedachten hier..."
                      placeholderTextColor={colors.muted}
                      value={reflections[idx] || ""}
                      onChangeText={(text) => setReflections({ ...reflections, [idx]: text })}
                      multiline
                      numberOfLines={3}
                      textAlignVertical="top"
                    />
                    {reflections[idx] && reflections[idx].length > 10 && (
                      <Text className="text-xs text-success mt-2">Jazaak Allaahu khayran voor uw reflectie.</Text>
                    )}
                  </View>
                );
              }

              return null;
            })}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
