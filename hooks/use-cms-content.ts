import { trpc } from "@/lib/trpc";
import { useI18n } from "@/lib/i18n";

// Map route section names to DB appSection enum values
const SECTION_MAP: Record<string, string> = {
  treatments: "behandelingen",
  concepts: "begrippen",
  weekly: "weekprogramma",
  fitrah: "fitrah",
  general: "general",
  tips: "tips",
};

/**
 * Hook to fetch CMS content by app section.
 * Returns content items in the user's current language.
 */
export function useCmsContent(appSection: string, contentType?: string, limit?: number) {
  const { language } = useI18n();
  const dbSection = SECTION_MAP[appSection] || appSection;
  
  const query = trpc.content.getBySection.useQuery({
    appSection: dbSection,
    language: language || "nl",
    contentType,
    limit: limit || 50,
  });

  return {
    items: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to fetch a single CMS content item with all translations.
 */
export function useCmsItem(id: number) {
  const query = trpc.content.getCmsItem.useQuery({ id }, { enabled: id > 0 });

  return {
    item: query.data,
    isLoading: query.isLoading,
    error: query.error,
  };
}
