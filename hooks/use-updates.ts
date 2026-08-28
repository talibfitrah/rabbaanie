import { useEffect, useSyncExternalStore } from "react";
import { Alert, Linking, Platform } from "react-native";
import * as Application from "expo-application";
import Constants from "expo-constants";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import { evaluateLatest, isNewerVersion, type PendingUpdate } from "@/lib/app-version";
import { DISTRIBUTION_CHANNEL } from "@/lib/distribution";
import { APP_PACKAGE } from "../constants/app-identity";

// Our own update manifest, served from the app's server (no third-party/GitHub).
const LATEST_JSON_URL = "https://api.rabbaanie.com/downloads/latest.json";
const CHECK_TIMEOUT_MS = 10_000;
// Cancel only a STALLED download (no bytes for this long) — a big APK on a slow
// connection may legitimately take many minutes, so we don't bound total time.
const DOWNLOAD_STALL_MS = 60_000;
// Cached download filename convention. Downloads go to <name>.apk.part and are
// renamed to <name>.apk on success, so a file ending in .apk is always complete.
const APK_PREFIX = "rabbaanie-v";
// Android grants read access on the content:// URI to the installer.
const FLAG_GRANT_READ_URI_PERMISSION = 1;
// Android always sets versionName; on web/dev it is null, so fall back to the
// configured app version (Settings displays this) rather than a bogus 0.0.0.
// Exported: lib/authed-fetch.ts, lib/_core/api.ts and lib/trpc.ts reuse this
// exact value for the X-App-Version header rather than reading it a second way.
export const INSTALLED_VERSION =
  Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? "0.0.0";

/**
 * The version identity every API request carries. Spread this rather than
 * writing X-App-Version by hand, so a new call site cannot ship half of it.
 *
 * X-App-Platform is the missing half of a real hazard. The server compares
 * X-App-Version against ONE global minVersion (lib/app-version.ts
 * isVersionRefused) and, with no platform on the request, cannot scope that
 * minimum to Android even if it wanted to. app/_layout.tsx renders
 * VersionBlockScreen ahead of every other gate, undismissable, with one button
 * — so raising minVersion to retire an old Android build hard-blocks every
 * older iOS install too, and on iOS that button opens a site carrying no iOS
 * download and (until the first submission mints an App Store ID) no store link
 * either. That is a stranded user, and a reviewer on an older build is one of
 * them.
 *
 * Sending the header does not fix it on its own — `rabbaanie-api` has to key
 * minVersion by platform and read this, defaulting to "do not block" for a
 * platform with no minimum configured. It is sent now because its absence is
 * what makes that server change impossible, and because a header the server
 * ignores costs nothing ON NATIVE, where fetch has no CORS. The web target is
 * the caveat, and this repo cannot settle it: a custom header forces a preflight
 * against Access-Control-Allow-Headers, and the only allowlist visible here
 * (server/_core/index.ts) lists neither X-App-Platform NOR the X-App-Version
 * that has always been sent — but that file is not what runs in production (see
 * *Two repos* in CLAUDE.md), so it proves nothing either way. What is true: this
 * header rides the same preflight X-App-Version already needed, so it adds no
 * new requirement. If a web build fails CORS, add both to the API's allowlist.
 * Until BOTH halves ship: do not raise minVersion for an
 * Android release.
 */
export const CLIENT_VERSION_HEADERS: Record<string, string> = {
  "X-App-Version": INSTALLED_VERSION,
  // Native only. A custom header must be named individually in the API's
  // Access-Control-Allow-Headers, and React Native's fetch has no CORS — so on
  // native this is free, while on web it would widen a preflight against an
  // allowlist this repo cannot see (server/_core/index.ts is not what runs in
  // production). If that allowlist enumerates headers rather than using "*",
  // adding one breaks EVERY browser call. There is nothing to gain against
  // that: X-App-Platform exists so minVersion can be scoped per store, and web
  // is not a store — a browser reloads to the current build by definition. The
  // server must therefore treat a request with no platform as "do not block",
  // which is the same default it needs for any platform with no minimum set.
  ...(Platform.OS === "web" ? {} : { "X-App-Platform": Platform.OS }),
};

// Google Play forbids an app distributed on Play from updating itself by any
// mechanism other than Play's own. The Play build therefore ships without
// REQUEST_INSTALL_PACKAGES (see DISTRIBUTION in app.config.ts) — this flag keeps
// the matching code paths dark so nothing can attempt an install it cannot do.
// Settings reads it to hide the update controls entirely.
//
// Read through the shared channel rather than expo-constants a second time.
// The direct config read was true on an iOS build made with
// APP_DISTRIBUTION=github, and Settings gates its download controls on this
// flag ALONE with no platform check — so that build offered an iPhone user an
// APK the device cannot install. DISTRIBUTION_CHANNEL resolves iOS to "apple"
// before it ever looks at the configured value, which makes the impossibility
// structural instead of a coincidence of how iOS happens to be built today.
export const UPDATER_ENABLED = DISTRIBUTION_CHANNEL === "github";

// True exactly when the Play hand-off below is offered. Exported because the
// Settings section TITLE and the button must read the same flag: gating the
// button on Android while leaving the title unconditional puts "App Updates"
// over a bare version number on web and iOS, which is the dishonesty the
// title's original conditional existed to prevent.
//
// Android-only, and not merely "not the sideload channel": `expo export
// --platform web` builds with distribution "play" too, and there market://
// resolves to nothing while react-native-web's openURL does not even reject,
// so the https fallback could not fire either.
export const PLAY_UPDATE_HANDOFF =
  !UPDATER_ENABLED && Platform.OS === "android";

// The Play build still has to be updatable — "no in-app updater" is a policy
// constraint on the MECHANISM, not permission to leave the user stranded. Play
// distributes its own updates, so its listing is the sanctioned destination,
// and it is already what components/version-block-screen.tsx opens when the
// server refuses a build as too old.
//
// market:// hands off to the installed Play app directly. It is the only form
// that works on a device with Play but no browser (a TV box), and the https
// form is the fallback for the reverse — openURL REJECTS an unhandled scheme
// rather than returning false, so the catch is the whole fallback mechanism.
//
// The last catch is NOT swallowed. A button that silently does nothing is the
// same dead end this function exists to remove, only quieter — and both URLs
// can genuinely fail together on a Play-flavoured build sideloaded onto a
// device with no Play services and no browser.
export async function openPlayStoreListing() {
  try {
    await Linking.openURL(`market://details?id=${APP_PACKAGE}`);
    return;
  } catch {
    // Play app absent or disabled — fall through to the web listing.
  }
  try {
    await Linking.openURL(
      `https://play.google.com/store/apps/details?id=${APP_PACKAGE}`,
    );
    return;
  } catch {
    // Neither Play nor a browser could take it.
  }
  Alert.alert(
    tx("Google Play", "Google Play", "Google Play"),
    tx(
      "Google Play kon niet worden geopend. Werk de app bij via de Play Store op dit apparaat.",
      "Google Play could not be opened. Update the app from the Play Store on this device.",
      "تعذّر فتحُ Google Play. حدِّث التطبيقَ من متجر Play على هذا الجهاز.",
    ),
  );
}

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
// Set true only when the silent launch check actually fires, so a remount
// before the 3s delay re-arms the timer instead of losing the check.
let launchCheckDone = false;

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
  // Snapshot the target: a check completing mid-download can reassign or null
  // the module-level `pending`, and we must not mix one version's URL with
  // another version's filename.
  const target = pending;
  if (__DEV__ || !UPDATER_ENABLED || Platform.OS !== "android" || !target) return;
  if (store.isDownloading) return;
  set({ isDownloading: true, downloadProgress: 0, error: null });

  const fileUri = `${FileSystem.cacheDirectory}${APK_PREFIX}${target.version}.apk`;
  const partUri = `${fileUri}.part`;

  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists) {
      try {
        await FileSystem.deleteAsync(partUri, { idempotent: true }).catch(() => {});
        let lastPercent = -1;
        let stallTimer: ReturnType<typeof setTimeout> | undefined;
        const download = FileSystem.createDownloadResumable(
          target.apkUrl,
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

export async function checkForUpdate(silent: boolean = false) {
  if (__DEV__ || !UPDATER_ENABLED || Platform.OS !== "android") {
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
      } else if (PLAY_UPDATE_HANDOFF) {
        // The same flag Settings reads, not a re-derived `Platform.OS ===
        // "android"`. That spelling is equivalent here ONLY because __DEV__ is
        // handled in the branch above, so reordering these branches or adding a
        // third channel would silently decouple the very sites the flag exists
        // to keep together. This
        // used to fall through to the message below and tell an Android user
        // that updates are Android-only. Settings hides its updater button, but
        // that was never the only caller: a push of type app_update calls this
        // directly (hooks/use-push-notifications.ts), so the dead end was
        // reachable by the one path that exists to announce a new version.
        //
        // The third channel that warning anticipated has now arrived, and it
        // decoupled nothing: PLAY_UPDATE_HANDOFF already requires
        // Platform.OS === "android", which no "apple" build can satisfy, so
        // the two arms are mutually exclusive and this one still fires in
        // exactly the cases Settings renders its button for.
        await openPlayStoreListing();
      } else {
        // Web and iOS. The wording — that in-app updating is Android-only — is
        // true for both: the sideload APK updater is the only in-app mechanism
        // this app has. iOS reaches this only in theory, because nothing there
        // calls this function at all: Settings wraps its updater in
        // `UPDATER_ENABLED &&`, false off the github channel, and the push path
        // returns null before it can call.
        //
        // An "apple" arm naming the App Store used to sit above this one. It was
        // removed as dead code: eight lines that never executed. If iOS ever
        // does reach here — someone enabling push, or widening UPDATER_ENABLED —
        // this string needs an App Store arm, and by then the numeric App Store
        // ID will exist so it can deep-link instead of merely naming the store.
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
    let latest: { version?: string; apkUrl?: string };
    try {
      const res = await fetch(LATEST_JSON_URL, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (res.status === 404) {
        // No manifest yet — nothing to update to; treat as "up to date".
        latest = {};
      } else if (!res.ok) {
        throw new Error(`Update server responded ${res.status}`);
      } else {
        latest = await res.json();
      }
    } finally {
      clearTimeout(timeout);
    }

    pending = evaluateLatest(latest, INSTALLED_VERSION);
    set({
      isChecking: false,
      isUpdateAvailable: pending !== null,
      lastChecked: new Date(),
      error: null,
    });

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
  } catch (e) {
    // Never alarm the user: if the check couldn't reach the server or find a
    // release for any reason, there is simply no new version to offer right
    // now. Present that calmly instead of an error, and keep no error state.
    // Still log it, so a silently-dead manifest endpoint stays diagnosable.
    console.warn("[updates] check failed:", e);
    set({ isChecking: false, lastChecked: new Date(), error: null });
    if (!silent) {
      Alert.alert(
        tx("Geen update", "No Update", "لا يوجد تحديث"),
        tx(
          "Er is momenteel geen nieuwe versie beschikbaar.",
          "No new version is available right now.",
          "لا يوجد إصدار جديد متاح حالياً."
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
    if (!autoCheck || __DEV__ || !UPDATER_ENABLED || Platform.OS !== "android" || launchCheckDone) return;

    (async () => {
      try {
        if (store.isDownloading) return;
        const dir = FileSystem.cacheDirectory;
        if (!dir) return;
        const entries = await FileSystem.readDirectoryAsync(dir);
        const stale = entries.filter((name) => {
          if (!name.startsWith(APK_PREFIX)) return false;
          // Orphaned partial downloads are always stale.
          if (name.endsWith(".apk.part")) return true;
          if (!name.endsWith(".apk")) return false;
          // Keep an APK newer than what's installed: the user may have
          // downloaded it and be mid-retry (e.g. after granting install
          // permission, which force-restarts the app). Delete already-installed
          // or unparseable ones.
          const version = name.slice(APK_PREFIX.length, -".apk".length);
          return !isNewerVersion(version, INSTALLED_VERSION);
        });
        await Promise.all(
          stale.map((name) => FileSystem.deleteAsync(`${dir}${name}`, { idempotent: true }))
        );
      } catch {
        // Cleanup is best-effort; never block or crash on it.
      }
    })();

    const timer = setTimeout(() => {
      launchCheckDone = true;
      checkForUpdate(true);
    }, 3000);
    return () => clearTimeout(timer);
  }, [autoCheck]);

  // downloadAndApplyUpdate is not returned: it is invoked directly from the
  // "Update Now" alert action, and no consumer calls it via the hook.
  return { ...snapshot, checkForUpdate };
}
