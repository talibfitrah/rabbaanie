import { useState, useEffect, useCallback } from "react";
import { Alert, Platform } from "react-native";
import * as Updates from "expo-updates";

export interface UpdateState {
  isChecking: boolean;
  isDownloading: boolean;
  isUpdateAvailable: boolean;
  currentVersion: string;
  lastChecked: Date | null;
  error: string | null;
}

/**
 * Hook for managing OTA updates via expo-updates.
 * Checks for updates on mount and provides manual check/apply functions.
 */
export function useUpdates(language: string = "ar") {
  const [state, setState] = useState<UpdateState>({
    isChecking: false,
    isDownloading: false,
    isUpdateAvailable: false,
    currentVersion: Updates.runtimeVersion || "1.0.0",
    lastChecked: null,
    error: null,
  });

  const tx = (nl: string, en: string, ar: string) =>
    language === "ar" ? ar : language === "en" ? en : nl;

  const checkForUpdate = useCallback(async (silent: boolean = false) => {
    // In development or web, updates are not available
    if (__DEV__ || Platform.OS === "web") {
      if (!silent) {
        Alert.alert(
          tx("Ontwikkelmodus", "Development Mode", "وضع التطوير"),
          tx(
            "Updates zijn niet beschikbaar in de ontwikkelmodus.",
            "Updates are not available in development mode.",
            "التحديثات غير متاحة في وضع التطوير."
          )
        );
      }
      return;
    }

    setState((s) => ({ ...s, isChecking: true, error: null }));

    try {
      const update = await Updates.checkForUpdateAsync();
      setState((s) => ({
        ...s,
        isChecking: false,
        isUpdateAvailable: update.isAvailable,
        lastChecked: new Date(),
      }));

      if (update.isAvailable) {
        Alert.alert(
          tx("Update beschikbaar", "Update Available", "تحديث متاح"),
          tx(
            "Er is een nieuwe versie beschikbaar. Wilt u nu updaten?",
            "A new version is available. Would you like to update now?",
            "يوجد إصدار جديد متاح. هل تريد التحديث الآن؟"
          ),
          [
            {
              text: tx("Later", "Later", "لاحقاً"),
              style: "cancel",
            },
            {
              text: tx("Updaten", "Update Now", "تحديث الآن"),
              onPress: () => downloadAndApplyUpdate(),
            },
          ]
        );
      } else if (!silent) {
        Alert.alert(
          tx("Geen update", "No Update", "لا يوجد تحديث"),
          tx(
            "U heeft de nieuwste versie.",
            "You have the latest version.",
            "لديك أحدث إصدار."
          )
        );
      }
    } catch (e: any) {
      setState((s) => ({
        ...s,
        isChecking: false,
        error: e.message || "Unknown error",
      }));
      if (!silent) {
        Alert.alert(
          tx("Fout", "Error", "خطأ"),
          tx(
            "Kan niet controleren op updates. Probeer het later opnieuw.",
            "Unable to check for updates. Please try again later.",
            "تعذر التحقق من التحديثات. يرجى المحاولة لاحقاً."
          )
        );
      }
    }
  }, [language]);

  const downloadAndApplyUpdate = useCallback(async () => {
    if (__DEV__ || Platform.OS === "web") return;

    setState((s) => ({ ...s, isDownloading: true, error: null }));

    try {
      const result = await Updates.fetchUpdateAsync();
      if (result.isNew) {
        Alert.alert(
          tx("Update gereed", "Update Ready", "التحديث جاهز"),
          tx(
            "De update is gedownload. De app wordt nu opnieuw gestart.",
            "The update has been downloaded. The app will now restart.",
            "تم تنزيل التحديث. سيتم إعادة تشغيل التطبيق الآن."
          ),
          [
            {
              text: tx("Herstarten", "Restart", "إعادة التشغيل"),
              onPress: async () => {
                await Updates.reloadAsync();
              },
            },
          ]
        );
      }
    } catch (e: any) {
      setState((s) => ({
        ...s,
        isDownloading: false,
        error: e.message || "Download failed",
      }));
      Alert.alert(
        tx("Fout", "Error", "خطأ"),
        tx(
          "Het downloaden van de update is mislukt. Probeer het later opnieuw.",
          "Failed to download the update. Please try again later.",
          "فشل تنزيل التحديث. يرجى المحاولة لاحقاً."
        )
      );
    } finally {
      setState((s) => ({ ...s, isDownloading: false }));
    }
  }, [language]);

  // Auto-check on mount (silent)
  useEffect(() => {
    if (!__DEV__ && Platform.OS !== "web") {
      // Delay check by 3 seconds to let app finish loading
      const timer = setTimeout(() => {
        checkForUpdate(true);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  return {
    ...state,
    checkForUpdate,
    downloadAndApplyUpdate,
  };
}
