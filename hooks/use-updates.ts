import { useState, useEffect, useCallback, useRef } from "react";
import { Alert, Platform } from "react-native";
import * as Application from "expo-application";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import { isNewerVersion, parseTag, pickApkAsset, type ReleaseAsset } from "@/lib/app-version";

const LATEST_RELEASE_URL =
  "https://api.github.com/repos/talibfitrah/rabbaanie/releases/latest";
const CHECK_TIMEOUT_MS = 10_000;
// Android grants read access on the content:// URI to the installer.
const FLAG_GRANT_READ_URI_PERMISSION = 1;

export interface UpdateState {
  isChecking: boolean;
  isDownloading: boolean;
  isUpdateAvailable: boolean;
  currentVersion: string;
  lastChecked: Date | null;
  downloadProgress: number;
  error: string | null;
}

type PendingUpdate = { version: string; apkUrl: string };

/**
 * In-app APK updater. Checks the repo's latest GitHub Release on mount and
 * on demand; on confirmation downloads the APK and opens Android's installer.
 */
export function useUpdates(language: string = "ar") {
  const [state, setState] = useState<UpdateState>({
    isChecking: false,
    isDownloading: false,
    isUpdateAvailable: false,
    currentVersion: Application.nativeApplicationVersion ?? "dev",
    lastChecked: null,
    downloadProgress: 0,
    error: null,
  });
  const pendingRef = useRef<PendingUpdate | null>(null);

  const tx = (nl: string, en: string, ar: string) =>
    language === "ar" ? ar : language === "en" ? en : nl;

  const downloadAndApplyUpdate = useCallback(async () => {
    const pending = pendingRef.current;
    if (__DEV__ || Platform.OS !== "android" || !pending) return;

    setState((s) => ({ ...s, isDownloading: true, downloadProgress: 0, error: null }));

    try {
      const fileUri = `${FileSystem.cacheDirectory}rabbaanie-v${pending.version}.apk`;
      const info = await FileSystem.getInfoAsync(fileUri);
      if (!info.exists) {
        const download = FileSystem.createDownloadResumable(
          pending.apkUrl,
          fileUri,
          {},
          (p) => {
            const total = p.totalBytesExpectedToWrite;
            setState((s) => ({
              ...s,
              downloadProgress: total > 0 ? p.totalBytesWritten / total : 0,
            }));
          }
        );
        const result = await download.downloadAsync();
        if (!result || result.status !== 200) {
          throw new Error(`Download failed with status ${result?.status ?? "unknown"}`);
        }
      }

      const contentUri = await FileSystem.getContentUriAsync(fileUri);
      // Not in the ActivityAction enum; the raw Android action string is accepted.
      await IntentLauncher.startActivityAsync(
        "android.intent.action.INSTALL_PACKAGE",
        {
          data: contentUri,
          type: "application/vnd.android.package-archive",
          flags: FLAG_GRANT_READ_URI_PERMISSION,
        }
      );
      // If the user cancels the installer, the cached APK is reused on the
      // next attempt; leftovers are cleaned up on the next app launch.
    } catch (e: any) {
      setState((s) => ({ ...s, error: e.message || "Download failed" }));
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

  const checkForUpdate = useCallback(
    async (silent: boolean = false) => {
      if (__DEV__ || Platform.OS !== "android") {
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
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
        let release: { tag_name: string; assets: ReleaseAsset[] };
        try {
          const res = await fetch(LATEST_RELEASE_URL, {
            signal: controller.signal,
            headers: { Accept: "application/vnd.github+json" },
          });
          if (!res.ok) throw new Error(`GitHub API responded ${res.status}`);
          release = await res.json();
        } finally {
          clearTimeout(timeout);
        }

        const latest = parseTag(release.tag_name);
        const apkUrl = latest ? pickApkAsset(release.assets ?? []) : null;
        const current = Application.nativeApplicationVersion ?? "0.0.0";

        if (latest !== null && apkUrl !== null && isNewerVersion(latest, current)) {
          pendingRef.current = { version: latest, apkUrl };
        } else {
          pendingRef.current = null;
        }
        const hasUpdate = pendingRef.current !== null;
        setState((s) => ({
          ...s,
          isChecking: false,
          isUpdateAvailable: hasUpdate,
          lastChecked: new Date(),
        }));

        if (hasUpdate) {
          Alert.alert(
            tx("Update beschikbaar", "Update Available", "تحديث متاح"),
            tx(
              "Er is een nieuwe versie beschikbaar. Wilt u nu updaten?",
              "A new version is available. Would you like to update now?",
              "يوجد إصدار جديد متاح. هل تريد التحديث الآن؟"
            ),
            [
              { text: tx("Later", "Later", "لاحقاً"), style: "cancel" },
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
        setState((s) => ({ ...s, isChecking: false, error: e.message || "Unknown error" }));
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
    },
    [language, downloadAndApplyUpdate]
  );

  // On launch: clean up APKs left by previous sessions, then check silently
  // after a 3s delay so the app finishes loading first.
  useEffect(() => {
    if (__DEV__ || Platform.OS !== "android") return;

    (async () => {
      try {
        const dir = FileSystem.cacheDirectory;
        if (!dir) return;
        const entries = await FileSystem.readDirectoryAsync(dir);
        await Promise.all(
          entries
            .filter((name) => /^rabbaanie-v.+\.apk$/.test(name))
            .map((name) => FileSystem.deleteAsync(`${dir}${name}`, { idempotent: true }))
        );
      } catch {
        // Cleanup is best-effort; never block or crash on it.
      }
    })();

    const timer = setTimeout(() => {
      checkForUpdate(true);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  return {
    ...state,
    checkForUpdate,
    downloadAndApplyUpdate,
  };
}
