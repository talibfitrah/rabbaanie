import { useState, useEffect } from "react";
import {
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
} from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

export default function NewsletterListScreen() {
  const colors = useColors();
  const router = useRouter();
  const newslettersQuery = trpc.newsletter.list.useQuery();

  if (newslettersQuery.isLoading) {
    return (
      <ScreenContainer className="items-center justify-center">
        <ActivityIndicator size="large" color={colors.primary} />
      </ScreenContainer>
    );
  }

  const newsletters = newslettersQuery.data ?? [];
  const sentNewsletters = newsletters.filter((n: any) => n.status === "sent");

  return (
    <ScreenContainer>
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
        <TouchableOpacity onPress={() => router.back()}>
          <IconSymbol name="chevron.right" size={24} color={colors.primary} style={{ transform: [{ scaleX: -1 }] }} />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-foreground">Nieuwsbrieven</Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={sentNewsletters}
        keyExtractor={(item: any) => item.id.toString()}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        renderItem={({ item }: { item: any }) => (
          <TouchableOpacity
            className="bg-surface rounded-xl p-4 border border-border"
            onPress={() => router.push(`/newsletter/${item.id}` as any)}
          >
            <Text className="text-base font-semibold text-foreground">{item.titleNl || item.titleEn || "Nieuwsbrief"}</Text>
            <Text className="text-xs text-muted mt-1">
              {item.sentAt ? new Date(item.sentAt).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" }) : ""}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View className="items-center py-12">
            <IconSymbol name="newspaper.fill" size={48} color={colors.muted} />
            <Text className="text-muted text-center mt-4">Nog geen nieuwsbrieven ontvangen.</Text>
          </View>
        }
      />
    </ScreenContainer>
  );
}
