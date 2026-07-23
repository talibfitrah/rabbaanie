import { useEffect, useSyncExternalStore } from "react";
import { Alert, Platform } from "react-native";
import * as Application from "expo-application";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import { evaluateRelease, type PendingUpdate } from "@/lib/app-version";

const LATEST_RELEASE_URL =
  "https://api.github.com/repos/talibfitrah/rabbaanie/releases/latest";
const CHECK_TIMEOUT_MS = 10_000;
// Cancel only a STALLED download (no bytes for this long) — a big APK on a slow
// connection may legitimately take many minutes, so we don't bound total time.
const DOWNLOAD_STALL_MS = 60_000;
// Cached download filename convention. Downloads go to <name>.apk.part and are
// renamed to <name>.apk on success, so a file ending in .apk is always complete.
const APK_PREFIX = "rabbaanie-v";
// Android grants read access on the content:// URI to the installer.
const FLAG_GRANT_READ_URI_PERMISSION = 1;
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

// One updater for the whole app. The root layout (silent launch check) and the
// Settings screen mount separate useUpdates() calls but must reflect ONE shared
// download/check — a global flag with per-instance React state would let a
// launch-triggered download run with no visible progress. So state lives in a
// module-level store that every consumer subscribes to.
let store: UpdateState = {
  isChecking: false,
  isDownloading: false,
  isUpdateAvailable: false,
  currentVersion: INSTALLED_VERSION,
  lastChecked: null,
  downloadProgress: 0,
  error: null,
};
let pending: PendingUpdate | null = null;
// Updated on every render; alerts fire in whatever language the app is in now.
let currentLanguage = "ar";
let launchCheckStarted = false;

const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const getSnapshot = () => store;
const set = (patch: Partial<UpdateState>) => {
  store = { ...store, ...patch };
  for (const l of listeners) l();
};

const tx = (nl: string, en: string, ar: string) =>
  currentLanguage === "ar" ? ar : currentLanguage === "en" ? en : nl;

async function downloadAndApplyUpdate() {
  if (__DEV__ || Platform.OS !== "android" || !pending) return;
  if (store.isDownloading) return;
  set({ isDownloading: true, downloadProgress: 0, error: null });

  const fileUri = `${FileSystem.cacheDirectory}${APK_PREFIX}${pending.version}.apk`;
  const partUri = `${fileUri}.part`;

  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists) {
      try {
        await FileSystem.deleteAsync(partUri, { idempotent: true }).catch(() => {});
        let lastPercent = -1;
        let stallTimer: ReturnType<typeof setTimeout> | undefined;
        const download = FileSystem.createDownloadResumable(
          pending.apkUrl,
          partUri,
          {},
          (p) => {
            resetStall(); // bytes arrived — not stalled
            const total = p.totalBytesExpectedToWrite;
            if (total <= 0) return;
            // Update at whole-percent steps only — every tick would re-render
            // consumers hundreds of times per download.
            const percent = Math.floor((p.totalBytesWritten / total) * 100);
            if (percent !== lastPercent) {
              lastPercent = percent;
              set({ downloadProgress: percent / 100 });
            }
          }
        );
        function resetStall() {
          clearTimeout(stallTimer);
          stallTimer = setTimeout(() => {
            download.cancelAsync().catch(() => {});
          }, DOWNLOAD_STALL_MS);
        }
        resetStall();
        let result;
        try {
          result = await download.downloadAsync();
        } finally {
          clearTimeout(stallTimer);
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
    set({ isDownloading: false, error: e.message || "Download failed" });
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
    // INSTALL_PACKAGE is not in the ActivityAction enum; the raw Android action
    // string is accepted.
    await IntentLauncher.startActivityAsync(
      "android.intent.action.INSTALL_PACKAGE",
      {
        data: contentUri,
        type: "application/vnd.android.package-archive",
        flags: FLAG_GRANT_READ_URI_PERMISSION,
      }
    );
  } catch (e: any) {
    set({ error: e.message || "Install failed" });
    Alert.alert(
      tx("Installatie", "Installation", "التثبيت"),
      tx(
        "De update is gedownload maar kon niet worden geopend. Sta 'onbekende apps installeren' toe en probeer opnieuw.",
        "The update was downloaded but could not be opened. Allow 'install unknown apps' and try again.",
        "تم تنزيل التحديث لكن تعذّر فتحه. اسمح بتثبيت التطبيقات غير المعروفة ثم أعد المحاولة."
      )
    );
  } finally {
    set({ isDownloading: false });
  }
}

async function checkForUpdate(silent: boolean = false) {
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

  // Shared guard: one check at a time app-wide, so the launch check and a
  // manual check can't double-fetch or stack two "Update Available" alerts.
  if (store.isChecking) return;
  set({ isChecking: true, error: null });

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

    pending = evaluateRelease(release, INSTALLED_VERSION);
    set({ isChecking: false, isUpdateAvailable: pending !== null, lastChecked: new Date() });

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
        tx("U heeft de nieuwste versie.", "You have the latest version.", "لديك أحدث إصدار.")
      );
    }
  } catch (e: any) {
    // A silent launch check must not leave an error banner for an attempt the
    // user never made (offline at launch, rate limit); only user-initiated
    // checks record the error.
    set({ isChecking: false, ...(silent ? {} : { error: e.message || "Unknown error" }) });
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
}

/**
 * Subscribe to the shared updater state. Mount with autoCheck=true exactly once
 * (root layout) to run the silent launch check and clean up leftover downloads;
 * other mounts (Settings) get the same state plus the manual check/apply actions.
 */
export function useUpdates(language: string = "ar", autoCheck: boolean = false) {
  currentLanguage = language;
  // Third arg (server snapshot) is required: web.output is "static", so routes
  // are server-rendered at export time and React demands getServerSnapshot.
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // Launch instance only: sweep leftover APK downloads, then check silently
  // after a 3s delay so the app finishes loading first. Guarded to run once.
  useEffect(() => {
    if (!autoCheck || __DEV__ || Platform.OS !== "android" || launchCheckStarted) return;
    launchCheckStarted = true;

    (async () => {
      try {
        if (store.isDownloading) return;
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
  }, [autoCheck]);

  // downloadAndApplyUpdate is not returned: it is invoked directly from the
  // "Update Now" alert action, and no consumer calls it via the hook.
  return { ...snapshot, checkForUpdate };
}
