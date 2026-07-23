import { useState, useEffect, useCallback, useRef } from "react";
import { Alert, Platform } from "react-native";
import * as Application from "expo-application";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import { evaluateRelease, type PendingUpdate } from "@/lib/app-version";

const LATEST_RELEASE_URL =
  "https://api.github.com/repos/talibfitrah/rabbaanie/releases/latest";
const CHECK_TIMEOUT_MS = 10_000;
// A stalled download must not pin isDownloading/downloadInFlight forever.
const DOWNLOAD_TIMEOUT_MS = 300_000;
// Cached download filename convention — the cleanup on launch must match
// whatever downloadAndApplyUpdate writes.
const APK_PREFIX = "rabbaanie-v";
// Android grants read access on the content:// URI to the installer.
const FLAG_GRANT_READ_URI_PERMISSION = 1;

// Shared across hook instances (root layout + settings screen): never run two
// downloads writing the same file, no matter which screen started the first.
let downloadInFlight = false;

// Android always sets versionName; the fallback only applies to non-Android /
// dev builds, which never reach the update check anyway.
const INSTALLED_VERSION = Application.nativeApplicationVersion ?? "0.0.0";

export interface UpdateState {
  isChecking: boolean;
  isDownloading: boolean;
  isUpdateAvailable: boolean;
  currentVersion: string;
  lastChecked: Date | null;
  downloadProgress: number;
  error: string | null;
}

/**
 * In-app APK updater. Checks the repo's latest GitHub Release and, on
 * confirmation, downloads the APK and opens Android's installer.
 *
 * Mount with autoCheck=true exactly once (root layout) — that instance runs
 * the silent launch check and cleans up leftover APK downloads. Other mounts
 * (Settings) provide the manual check button and status display.
 */
export function useUpdates(language: string = "ar", autoCheck: boolean = false) {
  const [state, setState] = useState<UpdateState>({
    isChecking: false,
    isDownloading: false,
    isUpdateAvailable: false,
    currentVersion: INSTALLED_VERSION,
    lastChecked: null,
    downloadProgress: 0,
    error: null,
  });
  const pendingRef = useRef<PendingUpdate | null>(null);
  // Alerts can fire long after mount (3s launch check, slow network); read the
  // language at alert time, not at closure-creation time.
  const languageRef = useRef(language);
  languageRef.current = language;

  const tx = (nl: string, en: string, ar: string) => {
    const lang = languageRef.current;
    return lang === "ar" ? ar : lang === "en" ? en : nl;
  };

  const downloadAndApplyUpdate = useCallback(async () => {
    const pending = pendingRef.current;
    if (__DEV__ || Platform.OS !== "android" || !pending) return;
    if (downloadInFlight) return;
    downloadInFlight = true;

    setState((s) => ({ ...s, isDownloading: true, downloadProgress: 0, error: null }));

    const fileUri = `${FileSystem.cacheDirectory}${APK_PREFIX}${pending.version}.apk`;
    // Download to a .part file and rename on success, so a file at fileUri is
    // ALWAYS complete — a killed/aborted download can never be reused as if
    // whole, and launch cleanup (which matches .apk) skips in-flight .part.
    const partUri = `${fileUri}.part`;

    try {
      const info = await FileSystem.getInfoAsync(fileUri);
      if (!info.exists) {
        try {
          await FileSystem.deleteAsync(partUri, { idempotent: true }).catch(() => {});
          let lastPercent = -1;
          const download = FileSystem.createDownloadResumable(
            pending.apkUrl,
            partUri,
            {},
            (p) => {
              const total = p.totalBytesExpectedToWrite;
              if (total <= 0) return;
              // Update at whole-percent steps only — every tick would re-render
              // the consuming screen hundreds of times per download.
              const percent = Math.floor((p.totalBytesWritten / total) * 100);
              if (percent !== lastPercent) {
                lastPercent = percent;
                setState((s) => ({ ...s, downloadProgress: percent / 100 }));
              }
            }
          );
          const timeout = setTimeout(() => {
            download.cancelAsync().catch(() => {});
          }, DOWNLOAD_TIMEOUT_MS);
          let result;
          try {
            result = await download.downloadAsync();
          } finally {
            clearTimeout(timeout);
          }
          if (!result || result.status !== 200) {
            throw new Error(`Download failed with status ${result?.status ?? "unknown"}`);
          }
          await FileSystem.moveAsync({ from: partUri, to: fileUri });
        } catch (e: any) {
          await FileSystem.deleteAsync(partUri, { idempotent: true }).catch(() => {});
          throw e;
        }
      }
    } catch (e: any) {
      downloadInFlight = false;
      setState((s) => ({ ...s, isDownloading: false, error: e.message || "Download failed" }));
      Alert.alert(
        tx("Fout", "Error", "خطأ"),
        tx(
          "Het downloaden van de update is mislukt. Probeer het later opnieuw.",
          "Failed to download the update. Please try again later.",
          "فشل تنزيل التحديث. يرجى المحاولة لاحقاً."
        )
      );
      return;
    }

    // The APK is complete and valid. A failure launching the installer (intent
    // unavailable, "install unknown apps" not granted) must NOT delete it — the
    // user can retry or grant permission and the cached file is reused.
    try {
      const contentUri = await FileSystem.getContentUriAsync(fileUri);
      // INSTALL_PACKAGE is not in the ActivityAction enum; the raw Android
      // action string is accepted.
      await IntentLauncher.startActivityAsync(
        "android.intent.action.INSTALL_PACKAGE",
        {
          data: contentUri,
          type: "application/vnd.android.package-archive",
          flags: FLAG_GRANT_READ_URI_PERMISSION,
        }
      );
    } catch (e: any) {
      setState((s) => ({ ...s, error: e.message || "Install failed" }));
      Alert.alert(
        tx("Installatie", "Installation", "التثبيت"),
        tx(
          "De update is gedownload maar kon niet worden geopend. Sta 'onbekende apps installeren' toe en probeer opnieuw.",
          "The update was downloaded but could not be opened. Allow 'install unknown apps' and try again.",
          "تم تنزيل التحديث لكن تعذّر فتحه. اسمح بتثبيت التطبيقات غير المعروفة ثم أعد المحاولة."
        )
      );
    } finally {
      downloadInFlight = false;
      setState((s) => ({ ...s, isDownloading: false }));
    }
  }, []);

  const checkForUpdate = useCallback(
    async (silent: boolean = false) => {
      if (__DEV__ || Platform.OS !== "android") {
        if (!silent) {
          if (__DEV__) {
            Alert.alert(
              tx("Ontwikkelmodus", "Development Mode", "وضع التطوير"),
              tx(
                "Updates zijn niet beschikbaar in de ontwikkelmodus.",
                "Updates are not available in development mode.",
                "التحديثات غير متاحة في وضع التطوير."
              )
            );
          } else {
            Alert.alert(
              tx("Niet beschikbaar", "Not Available", "غير متاح"),
              tx(
                "Updates zijn alleen beschikbaar in de Android-app.",
                "Updates are only available in the Android app.",
                "التحديثات متاحة فقط في تطبيق أندرويد."
              )
            );
          }
        }
        return;
      }

      setState((s) => ({ ...s, isChecking: true, error: null }));

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
        let release: { tag_name: string; assets?: { name: string; browser_download_url: string }[] };
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

        const pending = evaluateRelease(release, INSTALLED_VERSION);
        pendingRef.current = pending;
        setState((s) => ({
          ...s,
          isChecking: false,
          isUpdateAvailable: pending !== null,
          lastChecked: new Date(),
        }));

        if (pending !== null) {
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
    [downloadAndApplyUpdate]
  );

  // Launch instance only: clean up APKs left by previous sessions, then check
  // silently after a 3s delay so the app finishes loading first.
  useEffect(() => {
    if (!autoCheck || __DEV__ || Platform.OS !== "android") return;

    (async () => {
      try {
        // Never delete a file an in-flight download or a just-launched
        // installer may still be using.
        if (downloadInFlight) return;
        const dir = FileSystem.cacheDirectory;
        if (!dir) return;
        const entries = await FileSystem.readDirectoryAsync(dir);
        await Promise.all(
          entries
            .filter(
              (name) =>
                name.startsWith(APK_PREFIX) &&
                (name.endsWith(".apk") || name.endsWith(".apk.part"))
            )
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
