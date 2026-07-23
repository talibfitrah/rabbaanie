# In-app APK Updater — Design

**Date:** 2026-07-23
**Status:** Approved by owner (repo visibility, build system, detection mechanism, versioning)
**Branch:** `telegram-dev`

## Goal

When a new version of Rabbaanie is released, users see a dialog inside the app — "A new version is available" — with an **Update** button that downloads the new `.apk` and opens Android's install screen. No app store, no Expo account, no third-party update service.

This replaces the previously proposed Expo OTA (EAS Update) plan and the app's current dead `expo-updates` wiring, which points at an invalid `u.expo.dev` URL and can never deliver anything.

## Decisions made

| Decision | Choice |
|---|---|
| Repo visibility | `talibfitrah/rabbaanie` stays **public** (enables free CI + public release downloads) |
| Build system | **GitHub Actions**: tag push → build, sign, publish Release automatically |
| Update detection | **GitHub Releases API** (`/releases/latest`) — no extra infrastructure |
| APK hosting | GitHub Release assets on the same repo |
| Versioning | Continue from Manus's last release **1.1.29** → first self-built release is **1.2.0** |

## Versioning rules

The app was previously built by Manus; its last released version was **1.1.29**. We continue that line — never reset or fork the numbering.

- Format: `MAJOR.MINOR.PATCH` (semver).
- **PATCH** (1.2.1): bug fixes, text corrections, small tweaks.
- **MINOR** (1.3.0): new features or visible changes.
- **MAJOR** (2.0.0): redesigns or changes that break stored data.
- First self-built release: **1.2.0** (new feature: the updater itself; also marks the new signing key era).
- The **git tag `vX.Y.Z` is the single source of truth**. CI derives from it:
  - `versionName` = `X.Y.Z` (shown to humans)
  - `versionCode` = `X*1_000_000 + Y*1_000 + Z` (e.g. 1.2.0 → `1002000`) — strictly monotonic, room for up to 999 minors/patches, immune to the patch>99 overflow a `*100` scheme would hit (Manus already reached patch 29).
- `app.config.ts` reads both from env (`APP_VERSION`, `APP_VERSION_CODE`) with fallbacks, so local dev builds work without a tag. The hardcoded `version: "1.0.0"` currently in the config was never true and goes away.
- The old Manus `versionCode` is irrelevant: the signature changes anyway, so existing users do a fresh install (see Migration).

## Release flow (publishing an update)

1. Work is finished and merged; I push tag `vX.Y.Z`.
2. `.github/workflows/release.yml` triggers on `v*` tags:
   - checkout, Node setup, `npm ci`
   - `npx expo prebuild --platform android` (generates the native project fresh from `app.config.ts`)
   - decode the signing keystore from a repo secret; inject signing config + version env vars
   - Gradle `assembleRelease`
   - publish a GitHub Release for the tag with `rabbaanie-vX.Y.Z.apk` attached
3. Nothing manual. The Release's existence *is* the announcement to the app.

## In-app flow (what users see)

1. On launch (3-second delay, silent — same pattern as today) and via the existing manual button in Settings, the app GETs `https://api.github.com/repos/talibfitrah/rabbaanie/releases/latest`.
2. Compare the release tag with the installed version (`expo-application`.`nativeApplicationVersion`) using numeric semver comparison — never string comparison.
3. If newer: the existing trilingual (ar/en/nl, RTL-correct) dialog appears — **Update now / Later**.
4. **Update now**: download the `.apk` asset (picked by `.apk` name match, not `assets[0]`) to the app cache via `expo-file-system`, progress exposed in hook state for the Settings screen.
5. When the download completes, obtain a `content://` URI (`getContentUriAsync`) and launch the installer via `expo-intent-launcher` (`INSTALL_PACKAGE` intent, grant-read flag).
6. First time only: Android asks the user to allow the app to install updates (standard for non-store apps). Then the normal install confirmation. The app reopens as the new version.

## Code changes (client-only; the production server is not involved)

- **`hooks/use-updates.ts`** — keep the exported interface and trilingual texts; replace internals: GitHub check + download + install intent instead of `expo-updates` calls. State gains `downloadProgress`.
- **`app.config.ts`** — add `REQUEST_INSTALL_PACKAGES` to `android.permissions`; version/versionCode from env; **remove the `updates` block and `expo-updates` plugin**.
- **`package.json`** — remove `expo-updates`; add `expo-file-system`, `expo-application`.
- **New:** `.github/workflows/release.yml`.
- Settings screen: no interface break expected; verify at implementation time.

Removing `expo-updates` also removes the app's failing startup call to the invalid `u.expo.dev` URL — that existing bug dies as a side effect.

## Signing keystore

- Generated once (locally, `keytool`), used by CI for every release.
- Stored: GitHub repo secret (base64) + `~/.claude/secrets/` on the VM + **one copy the owner keeps off-VM** (password manager / private drive).
- Losing it means future updates can no longer install over installed versions. Treat as the crown jewel.

## Error handling

- Silent check fails (offline, API down): stay silent, retry next launch.
- Manual check fails: trilingual error alert (exists today).
- Download fails: alert with retry.
- User cancels the install screen: keep the downloaded APK; next Update tap reuses it (re-download only if the file is missing or a newer release exists).
- Stale downloaded APKs are deleted on app launch.
- GitHub API rate limit (60/hr per device IP): treated as a failed silent check; effectively unreachable at 1–2 checks/day/device.

## One-time migration (existing users)

Existing installs are Manus-signed; our APKs use a new key, so Android will not install them over the old app. This cost was accepted in the 2026-07-22 rollout discussion: users get the v1.2.0 download link directly (shared by Daa3iyah), uninstall the old app, install the new one. **Locally saved data does not carry over.** Every release after v1.2.0 flows through the in-app dialog.

## Testing

- Unit tests: version comparison (ordering, equal, malformed tags) and release-asset selection.
- CI: first tag push is the integration test of the workflow (build succeeds, Release appears, APK installs on a device).
- End-to-end (needs a real Android phone, ~5 min, guided): install v1.2.0 → publish v1.2.1 → dialog appears → Update → app is v1.2.1.

## Deliberately out of scope (add later via the updater itself if ever needed)

- Forced/mandatory updates, release notes in the dialog, delta downloads, per-ABI APK splits, iOS.
- **Google Play note:** Play policy forbids self-updating apps. If a Play build ever happens, the updater must be disabled in that build (single build-time flag). Nothing to do now.
