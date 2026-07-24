# In-app APK Updater Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a newer GitHub Release exists, the app shows a trilingual "update available" dialog whose Update button downloads the release APK and opens Android's install screen.

**Architecture:** The git tag `vX.Y.Z` is the single source of truth. A GitHub Actions workflow builds, signs (openssl-generated PKCS12 keystore, apksigner re-sign), and publishes a Release with the APK attached. The app polls `releases/latest`, compares versions numerically, downloads via `expo-file-system/legacy`, and hands the file to the Android installer via `expo-intent-launcher`. `expo-updates` is removed entirely.

**Tech Stack:** Expo SDK 54 / RN 0.81 (managed, `expo prebuild` in CI only), vitest, GitHub Actions (ubuntu-latest, temurin JDK 17), openssl PKCS12 keystore.

## Global Constraints

- Work happens in `/home/murabbie/Development/rabbaanie-telegram` on branch `telegram-dev`. All commands below run from that directory.
- Versioning continues from Manus's last release **1.1.29**; first self-built release is **v1.2.0**. `versionCode = major*1_000_000 + minor*1_000 + patch` (1.2.0 → `1002000`).
- The hook must keep exporting exactly: `isChecking`, `isDownloading`, `isUpdateAvailable`, `currentVersion`, `lastChecked`, `error`, `checkForUpdate`, `downloadAndApplyUpdate` — `app/(tabs)/settings.tsx:2620` destructures six of these and must not change.
- All user-facing strings are trilingual `tx(nl, en, ar)` — reuse the exact existing strings from the old hook where the situation is unchanged.
- `minSdkVersion` stays 24. Repo stays public. The keystore is NEVER committed to git.
- Commit messages end with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- After all coding tasks, the CLAUDE.md **9-stage review pipeline** runs before the release tag is pushed (Task 6).

---

### Task 1: Version logic module (`lib/app-version.ts`)

**Files:**
- Create: `lib/app-version.ts`
- Test: `lib/app-version.test.ts`

**Interfaces:**
- Consumes: nothing (pure, dependency-free).
- Produces (Task 3 imports these from `@/lib/app-version`):
  - `parseTag(tag: string): string | null` — `"v1.2.0"` → `"1.2.0"`, null if not `vN.N.N`.
  - `isNewerVersion(latest: string, current: string): boolean` — numeric semver compare.
  - `pickApkAsset(assets: ReleaseAsset[]): string | null` — `browser_download_url` of the first `.apk` asset.
  - `type ReleaseAsset = { name: string; browser_download_url: string }`

- [ ] **Step 1: Write the failing test**

Create `lib/app-version.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isNewerVersion, parseTag, pickApkAsset } from "./app-version";

describe("parseTag", () => {
  it("strips the v prefix from a release tag", () => {
    expect(parseTag("v1.2.0")).toBe("1.2.0");
  });
  it("rejects malformed tags", () => {
    expect(parseTag("1.2.0")).toBeNull();
    expect(parseTag("v1.2")).toBeNull();
    expect(parseTag("v1.2.0-beta")).toBeNull();
    expect(parseTag("")).toBeNull();
  });
});

describe("isNewerVersion", () => {
  it("detects newer patch, minor, and major versions", () => {
    expect(isNewerVersion("1.2.1", "1.2.0")).toBe(true);
    expect(isNewerVersion("1.3.0", "1.2.9")).toBe(true);
    expect(isNewerVersion("2.0.0", "1.99.99")).toBe(true);
  });
  it("compares numerically, not as strings", () => {
    expect(isNewerVersion("1.2.10", "1.2.9")).toBe(true); // string compare would say false
    expect(isNewerVersion("1.10.0", "1.9.0")).toBe(true);
  });
  it("is false for equal or older versions", () => {
    expect(isNewerVersion("1.2.0", "1.2.0")).toBe(false);
    expect(isNewerVersion("1.1.29", "1.2.0")).toBe(false);
  });
  it("is false when either side is malformed", () => {
    expect(isNewerVersion("abc", "1.2.0")).toBe(false);
    expect(isNewerVersion("1.2.0", "")).toBe(false);
  });
});

describe("pickApkAsset", () => {
  it("returns the download URL of the first .apk asset", () => {
    expect(
      pickApkAsset([
        { name: "checksums.txt", browser_download_url: "https://x/checksums.txt" },
        { name: "rabbaanie-v1.2.0.apk", browser_download_url: "https://x/rabbaanie-v1.2.0.apk" },
      ])
    ).toBe("https://x/rabbaanie-v1.2.0.apk");
  });
  it("returns null when no .apk asset exists", () => {
    expect(pickApkAsset([])).toBeNull();
    expect(pickApkAsset([{ name: "notes.md", browser_download_url: "https://x/notes.md" }])).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/app-version.test.ts`
Expected: FAIL — `Cannot find module './app-version'` (or equivalent resolve error).

- [ ] **Step 3: Write the implementation**

Create `lib/app-version.ts`:

```ts
export type ReleaseAsset = { name: string; browser_download_url: string };

const TAG_RE = /^v(\d+)\.(\d+)\.(\d+)$/;

/** "v1.2.0" -> "1.2.0"; null for anything that is not exactly vMAJOR.MINOR.PATCH. */
export function parseTag(tag: string): string | null {
  const m = TAG_RE.exec(tag);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : null;
}

function toParts(version: string): number[] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Numeric semver comparison; false when either side is malformed. */
export function isNewerVersion(latest: string, current: string): boolean {
  const a = toParts(latest);
  const b = toParts(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

/** Download URL of the first .apk asset in a GitHub release, or null. */
export function pickApkAsset(assets: ReleaseAsset[]): string | null {
  const apk = assets.find((a) => a.name.endsWith(".apk"));
  return apk ? apk.browser_download_url : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/app-version.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/app-version.ts lib/app-version.test.ts
git commit -m "feat: version comparison logic for APK updater

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Rewrite `hooks/use-updates.ts` against GitHub Releases

**Files:**
- Modify: `hooks/use-updates.ts` (full replacement, 167 lines currently)
- Modify: `package.json` (via `npx expo install`, adds two deps)

**Interfaces:**
- Consumes: `parseTag`, `isNewerVersion`, `pickApkAsset`, `ReleaseAsset` from `@/lib/app-version` (Task 1).
- Produces: same hook surface as before plus `downloadProgress: number` (0..1) and `latestVersion: string | null` in the returned state. `app/(tabs)/settings.tsx` needs **no changes**.

- [ ] **Step 1: Install the two new runtime deps (SDK-pinned versions)**

Run: `npx expo install expo-file-system expo-application`
Expected: `package.json` gains `expo-file-system` (~19.x for SDK 54) and `expo-application` (~7.x). `expo-updates` remains for now — it is removed in Task 3 so the tree stays green at every commit.

- [ ] **Step 2: Replace the hook implementation**

Replace the entire contents of `hooks/use-updates.ts` with:

```ts
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
  latestVersion: string | null;
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
    latestVersion: null,
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
      await IntentLauncher.startActivityAsync(
        IntentLauncher.ActivityAction.INSTALL_PACKAGE,
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
        const hasUpdate = latest !== null && apkUrl !== null && isNewerVersion(latest, current);

        pendingRef.current = hasUpdate ? { version: latest!, apkUrl: apkUrl! } : null;
        setState((s) => ({
          ...s,
          isChecking: false,
          isUpdateAvailable: hasUpdate,
          latestVersion: latest,
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
              { text: tx("Updaten", "Update Now", "تحديث الآن"), onPress: () => downloadAndApplyUpdate() },
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
```

Notes for the implementer:
- `expo-file-system/legacy` is deliberate: on SDK 54 the package's root export is the new class-based API; the legacy entry point keeps `createDownloadResumable`, `getContentUriAsync`, `cacheDirectory`, etc.
- The old hook gated on `Platform.OS === "web"`; the new one gates on `!== "android"` because APK installs only exist on Android (the old code also only ever ran on Android in practice).
- The trilingual strings are copied verbatim from the old hook.

- [ ] **Step 3: Typecheck and run the full test suite**

Run: `npx tsc --noEmit && npm test`
Expected: tsc exits 0; vitest passes (Task 1 tests still green).

- [ ] **Step 4: Commit**

```bash
git add hooks/use-updates.ts package.json package-lock.json
git commit -m "feat: replace dead expo-updates OTA with GitHub Releases APK updater

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Purge expo-updates; version + permission config

**Files:**
- Modify: `app.config.ts` (lines 44-56, 74, 94-96 in the current file)
- Modify: `package.json` (remove `expo-updates`)

**Interfaces:**
- Consumes: nothing from earlier tasks (Task 2 already stopped importing `expo-updates`).
- Produces: env contract for Task 4's CI — `APP_VERSION` (e.g. `1.2.0`) and `APP_VERSION_CODE` (e.g. `1002000`) read at `expo prebuild` time.

- [ ] **Step 1: Remove the dependency**

Run: `npm uninstall expo-updates`
Then verify nothing still imports it: `grep -rn "expo-updates" app components hooks lib app.config.ts`
Expected: no matches (Task 2 removed the only importer; the config references go next).
If `app.config.ts` still matches, that is expected until Step 2 — the grep must be clean after Step 2.

- [ ] **Step 2: Edit `app.config.ts`**

Three edits:

(a) Replace the version block and `updates` block (currently lines 44-56):

```ts
  // OLD:
  version: "1.0.0",
  runtimeVersion: "1.0.0",
  ...
  updates: {
    enabled: true,
    checkAutomatically: "ON_LOAD",
    fallbackToCacheTimeout: 5000,
    url: "https://u.expo.dev/" + (process.env.EAS_PROJECT_ID || "opvoedadvies_apk"),
  },
```

```ts
  // NEW (updates block deleted entirely; tag-driven via CI, fallbacks for local dev):
  version: process.env.APP_VERSION ?? "1.2.0",
```

(b) In the `android` section, add the version code and the installer permission:

```ts
  android: {
    ...
    versionCode: Number(process.env.APP_VERSION_CODE ?? 1002000),
    package: env.androidPackage,
    permissions: [
      "POST_NOTIFICATIONS",
      "USE_FULL_SCREEN_INTENT",
      "SCHEDULE_EXACT_ALARM",
      "VIBRATE",
      "WAKE_LOCK",
      "REQUEST_INSTALL_PACKAGES",
    ],
    ...
  },
```

(c) In `plugins`, delete the `"expo-updates"` entry (currently line 96). Keep `"expo-router"` and everything else untouched.

- [ ] **Step 3: Verify the config still evaluates and nothing references expo-updates**

Run: `npx expo config --type public > /dev/null && echo CONFIG_OK && grep -rn "expo-updates" app components hooks lib app.config.ts package.json; npx tsc --noEmit && npm test`
Expected: `CONFIG_OK`, grep finds nothing (exit 1 from grep is fine), tsc clean, tests pass.

- [ ] **Step 4: Commit**

```bash
git add app.config.ts package.json package-lock.json
git commit -m "chore: remove expo-updates; tag-driven version and install permission

Kills the app's failing startup call to the invalid u.expo.dev URL.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Signing keystore (openssl PKCS12) + secrets handoff

**Files:**
- Create (outside the repo, never committed): `/home/murabbie/.claude/secrets/rabbaanie-keystore/release.p12`, `release.p12.base64`, `keystore-info.txt`

**Interfaces:**
- Produces: the four GitHub Actions secret values Task 5's workflow expects: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (= `rabbaanie`), `ANDROID_KEY_PASSWORD` (= same as keystore password; PKCS12 uses one password).

- [ ] **Step 1: Generate the keystore (no Java on the VM — openssl PKCS12, which apksigner accepts)**

```bash
mkdir -p ~/.claude/secrets/rabbaanie-keystore && cd ~/.claude/secrets/rabbaanie-keystore
PASS=$(openssl rand -base64 24)
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 10950 \
  -nodes -subj "/CN=Rabbaanie/O=Rabbaanie/C=NL"
openssl pkcs12 -export -inkey key.pem -in cert.pem -name rabbaanie \
  -out release.p12 -passout pass:"$PASS"
rm key.pem cert.pem
base64 -w0 release.p12 > release.p12.base64
printf 'alias: rabbaanie\npassword: %s\ncreated: 2026-07-23\npurpose: Rabbaanie release APK signing (GitHub Actions)\n' "$PASS" > keystore-info.txt
chmod 600 release.p12 release.p12.base64 keystore-info.txt
```

Expected: three files, permissions `-rw-------`. 10950 days ≈ 30 years validity.

- [ ] **Step 2: Verify the keystore is loadable**

Run: `openssl pkcs12 -in ~/.claude/secrets/rabbaanie-keystore/release.p12 -passin pass:"$(grep '^password:' ~/.claude/secrets/rabbaanie-keystore/keystore-info.txt | cut -d' ' -f2)" -nokeys -info 2>&1 | head -5`
Expected: prints `MAC: sha256 ...` and certificate bag info, no errors.

- [ ] **Step 3: Hand the user the secret-setup instructions (they add secrets via the GitHub web UI; no gh CLI on this VM)**

Tell the user to open `https://github.com/talibfitrah/rabbaanie/settings/secrets/actions` and add:

| Secret name | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | contents of `~/.claude/secrets/rabbaanie-keystore/release.p12.base64` |
| `ANDROID_KEYSTORE_PASSWORD` | `password:` line from `keystore-info.txt` |
| `ANDROID_KEY_ALIAS` | `rabbaanie` |
| `ANDROID_KEY_PASSWORD` | same value as `ANDROID_KEYSTORE_PASSWORD` |

Also tell them: copy `release.p12` + `keystore-info.txt` somewhere off this VM (password manager or private drive). Losing them permanently breaks update-in-place for all installed apps.

No commit in this task (nothing repo-tracked changes).

---

### Task 5: GitHub Actions release workflow

**Files:**
- Create: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: the four secrets from Task 4; the `APP_VERSION`/`APP_VERSION_CODE` env contract from Task 3.
- Produces: on tag `vX.Y.Z` push — a GitHub Release with `rabbaanie-vX.Y.Z.apk` attached, which the Task 2 hook consumes via `releases/latest`.

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/release.yml`:

```yaml
name: release

on:
  push:
    tags: ["v*"]

permissions:
  contents: write

jobs:
  build-and-release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Validate tag format
        run: |
          if ! echo "$GITHUB_REF_NAME" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+$'; then
            echo "Tag '$GITHUB_REF_NAME' is not vMAJOR.MINOR.PATCH" >&2
            exit 1
          fi

      - name: Derive version from tag
        run: |
          VERSION="${GITHUB_REF_NAME#v}"
          IFS='.' read -r MAJOR MINOR PATCH <<< "$VERSION"
          echo "APP_VERSION=$VERSION" >> "$GITHUB_ENV"
          echo "APP_VERSION_CODE=$((MAJOR * 1000000 + MINOR * 1000 + PATCH))" >> "$GITHUB_ENV"

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 17

      - run: npm ci

      # Reads APP_VERSION / APP_VERSION_CODE from env via app.config.ts
      - name: Generate native Android project
        run: npx expo prebuild --platform android --no-install

      - name: Build release APK
        working-directory: android
        run: ./gradlew assembleRelease --no-daemon

      - name: Sign APK
        env:
          ANDROID_KEYSTORE_BASE64: ${{ secrets.ANDROID_KEYSTORE_BASE64 }}
          ANDROID_KEYSTORE_PASSWORD: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
          ANDROID_KEY_ALIAS: ${{ secrets.ANDROID_KEY_ALIAS }}
          ANDROID_KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}
        run: |
          echo "$ANDROID_KEYSTORE_BASE64" | base64 -d > release.p12
          BUILD_TOOLS="$ANDROID_HOME/build-tools/$(ls "$ANDROID_HOME/build-tools" | sort -V | tail -n1)"
          "$BUILD_TOOLS/apksigner" sign \
            --ks release.p12 --ks-type PKCS12 \
            --ks-pass env:ANDROID_KEYSTORE_PASSWORD \
            --ks-key-alias "$ANDROID_KEY_ALIAS" \
            --key-pass env:ANDROID_KEY_PASSWORD \
            --out "rabbaanie-v${APP_VERSION}.apk" \
            android/app/build/outputs/apk/release/app-release.apk
          "$BUILD_TOOLS/apksigner" verify --print-certs "rabbaanie-v${APP_VERSION}.apk"
          rm release.p12

      - name: Publish GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: rabbaanie-v*.apk
          fail_on_unmatched_files: true
```

Notes for the implementer:
- ubuntu-latest ships Android SDK (`ANDROID_HOME` preset) and accepts the Expo-generated `./gradlew` (executable bit set by prebuild).
- The Expo template signs `assembleRelease` output with the debug keystore; `apksigner sign` fully replaces that signature with ours, and gradle's output is already zipaligned, which apksigner preserves.
- Expect the first run to take 15–25 minutes (cold Gradle).

- [ ] **Step 2: Lint the workflow locally (no actionlint installed — YAML sanity only)**

Run: `node -e "const y=require('fs').readFileSync('.github/workflows/release.yml','utf8'); require('node:util'); console.log(y.includes('softprops/action-gh-release')?'YAML_PRESENT':'MISSING')" && npx tsc --noEmit`
Expected: `YAML_PRESENT`; tsc still clean. (Real validation happens on the first tag push in Task 7.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: build, sign, and publish release APK on version tags

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Mandatory 9-stage review pipeline (CLAUDE.md)

Run the full pipeline over the cumulative diff `main...telegram-dev` before anything ships:

- [ ] Stage 1 already ran pre-implementation? No — run **Bloat audit (pre → here acts on the full diff)** via the `code-upgrade` skill's `bloat-audit.md`, scoped to the files touched in Tasks 1-5. Strip self-introduced bloat.
- [ ] Stage 2 **Baseline**: `git status` clean except intended files; `npx tsc --noEmit && npm test` green.
- [ ] Stage 3 **Code review**: gstack `/review` (or code-review subagent) over `git diff main...telegram-dev`.
- [ ] Stage 4 **Security review** (`/cso`): REQUIRED — this change touches network input (GitHub API), file downloads, an install-privilege permission, CI secrets, and signing.
- [ ] Stage 5 **Adversarial challenge**: `/codex` challenge if available; otherwise closest agent fallback, stated explicitly.
- [ ] Stage 6 **Consolidate findings**; classify severity.
- [ ] Stage 7 **Patch + re-review** until Critical/Important findings closed.
- [ ] Stage 8 **Bloat audit (post)** over the final cumulative diff.
- [ ] Stage 9 **gstack `/review` + `cubic review --base $(git merge-base main telegram-dev) --json`**, re-run until two consecutive clean rounds (no new P0/P1).
- [ ] Commit any fixes; note any stage that could not run and its substitute.

---

### Execution notes (deviations discovered while implementing)

- The repo is a **pnpm** project (`packageManager: pnpm@9.12.0`, `pnpm-lock.yaml`, `.npmrc` `node-linker=hoisted`) — every `npm ci`/`npx` in this plan was executed as `pnpm install --frozen-lockfile`/`pnpm exec`, and the workflow uses `pnpm/action-setup@v4` + `cache: pnpm`.
- `IntentLauncher.ActivityAction.INSTALL_PACKAGE` does not exist in expo-intent-launcher v13; the hook passes the raw string `"android.intent.action.INSTALL_PACKAGE"` instead.
- Extra prerequisite commit: `assets/data/library/` (45 book JSONs + index + covers, 33 MB) was never committed to the repo and was restored from the production checkout `/home/murabbie/rabbaanie-api/assets/data/library/` — without it Metro cannot bundle any release.
- Pre-existing, unrelated to this feature (left for the review-pipeline findings list): 16 failing tests in `tests/` (content-enrichment assertions against data that was never committed, plus 2 env/network-dependent `api-base-url` tests).

### Review outcome (9-stage pipeline, 2026-07-23)

All coding tasks (1-5) implemented and put through the mandatory 9-stage review:
bloat audit (pre/post), baseline (tsc clean, 14 updater tests green, 16
pre-existing data/network failures unchanged), code review + 2 specialists,
`/cso` security review, two adversarial passes (Claude subagent + codex), and
7 cubic rounds. Cubic reached no-new-P0/P1 from round 3 onward (the one P1 —
a `useSyncExternalStore` server-snapshot regression breaking the web static
export — was found and fixed in round 2). ~15 findings were fixed across the
fix batches; the commits above record them.

**Documented deferrals (non-blocking, no P0/P1 open):**
- **versionCode / signing continuity from Manus 1.1.29 (P2):** moot. Our new
  signing key differs from Manus's, so Android forces the accepted uninstall/
  reinstall migration regardless of versionCode; all our future versionCodes
  are monotonic from 1002000. Nothing to install "over". Verify against a real
  1.1.29 APK only if the migration model ever changes.
- **`assets/data/library/cover_urls.json` completeness (P2/P3):** pre-existing.
  Byte-identical to the production API data; only ~9-14 of 45 books have covers
  there too. Restored verbatim so the app builds (lib/book-data.ts imports it).
  Completing the covers is a separate data task for the owner, not updater scope.
- **Manual check during the 3s launch-check window (P3):** a manual "Check for
  Updates" tapped in the brief window while the silent launch check runs shares
  its in-flight state and may not show its own "up to date" confirmation (the
  button still shows "Checking…", and an available update still alerts). Narrow;
  a correct fix risks reintroducing double-alerts. Follow-up if it bites.
- **Unauthenticated GitHub API rate limit, 60/hr/IP (P3):** fine at current
  scale; add `If-None-Match`/ETag or a min-interval throttle before growth.
- **"Update available" re-prompts each launch after "Later" (P3):** acceptable
  for the rollout (we want prompt updates); add a snooze/"skip this version"
  later if reflexive dismissal becomes a problem.
- **Signer-fingerprint pin in CI:** cannot pin before v1.2.0 exists. After the
  first release, add the `apksigner verify` fingerprint assertion (commented in
  release.yml) so a wrong/rotated keystore fails the build.
- **Pre-existing, flagged for owner (not touched):** unused `isEn` prop on
  `UpdateSection` in settings.tsx; 16 pre-existing failing tests in `tests/`
  (content-enrichment data + env/network `api-base-url`), unrelated to this work.

### Task 7: Ship v1.2.0

**Depends on:** the user having added the four GitHub secrets (Task 4 Step 3).

- [ ] **Step 1: Merge to main and push**

```bash
cd /home/murabbie/Development/rabbaanie
git merge --no-ff telegram-dev -m "feat: in-app APK updater via GitHub Releases

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push origin main
```

- [ ] **Step 2: Tag and push the release tag**

```bash
git tag v1.2.0
git push origin v1.2.0
```

- [ ] **Step 3: Watch the workflow**

Run (poll until `"status": "completed"`):
`curl -s https://api.github.com/repos/talibfitrah/rabbaanie/actions/runs?event=push | python3 -c "import json,sys; r=json.load(sys.stdin)['workflow_runs'][0]; print(r['name'], r['status'], r['conclusion'])"`
Expected: `release completed success`. If it fails: read the run's logs via the API, fix on `telegram-dev`, re-merge, `git tag -d v1.2.0 && git push origin :refs/tags/v1.2.0`, re-tag, re-push (safe before anyone has the release).

- [ ] **Step 4: Verify the release is live and the APK downloads**

```bash
curl -s https://api.github.com/repos/talibfitrah/rabbaanie/releases/latest | python3 -c "import json,sys; r=json.load(sys.stdin); print(r['tag_name']); [print(a['name'], a['size']) for a in r['assets']]"
curl -sL -o /tmp/claude-1000/-home-murabbie-Development-rabbaanie/d2974f1a-6cff-41b9-abff-07dd87fa75fd/scratchpad/rabbaanie-v1.2.0.apk $(curl -s https://api.github.com/repos/talibfitrah/rabbaanie/releases/latest | python3 -c "import json,sys; print(json.load(sys.stdin)['assets'][0]['browser_download_url'])")
unzip -l /tmp/claude-1000/-home-murabbie-Development-rabbaanie/d2974f1a-6cff-41b9-abff-07dd87fa75fd/scratchpad/rabbaanie-v1.2.0.apk | grep -c AndroidManifest.xml
```

Expected: `v1.2.0`, one `.apk` asset > 30 MB, and `1` (valid zip with a manifest).

- [ ] **Step 5: Sync worktrees, hand off for device QA**

```bash
git -C /home/murabbie/Development/rabbaanie-telegram merge --ff-only main 2>/dev/null || git -C /home/murabbie/Development/rabbaanie-telegram rebase main
git -C /home/murabbie/Development/rabbaanie-develop merge --ff-only main
```

Then: send Daa3iyah the APK download link on Telegram (plain language: install this once; users must uninstall the old app first; future updates arrive inside the app). Ask the user/Daa3iyah to run the guided E2E when convenient: install v1.2.0 → later we publish v1.2.1 → dialog appears → Update works.
```
