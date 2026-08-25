# Tablet landscape + Play device exclusion — findings NOT fixed, with follow-ups

Commits `74f337d`, `038d17d`, `98d33ad` on `main`, 2026-08-25.
Reviewers: cubic (6 rounds), `/code-review high`, codex (`codex review`).

Everything below was **verified as real** on the artifact or a live emulator, or is **already
documented in-code**. Nothing here is an un-triaged guess. What was fixed is in the commit
messages; this file is only the residue.

Same convention as `FINDINGS-1.5.7-deferred.md`: `local-docs/` is gitignored, this file is
force-added so the residue survives the session.

---

## Deferred: hardware the app now installs on but does not handle

1. **No `CameraView` in the app handles `onMountError`.** `android.hardware.camera` is now
   `required="false"`, so the app installs on camera-less devices — TV boxes, Wi-Fi-only tablets.
   `app/qr-scanner.tsx:135` and `app/child-account/login.tsx:275` gate only on
   `useCameraPermissions()`. Permission and hardware are different things: a camera-less device
   can *grant* CAMERA, after which `<CameraView>` mounts against nothing and the user gets a black
   screen with no explanation. Not a trap — both screens keep a back control, and
   `child-account/login.tsx:299` offers manual code entry — but it is a dead end.
   **Follow-up:** add an `onMountError` handler on both `CameraView`s that swaps in the same
   "camera unavailable" copy the permission-denied branch already renders.

2. **Android TV listing still needs leanback.** Making `screen.portrait` optional restores the
   3,037 TV devices to the *device catalog* for the phone/tablet listing. It does **not** put the
   app in the Android TV Play Store, which requires a `LEANBACK_LAUNCHER` intent-filter, a 320×180
   banner, and D-pad focus order.
   Codex raised this as a P1. It is **not** a blocker for the MINIX NEO U22-XJ MAX that started
   this: `aapt2 dump badging` on `com.albunyaan.tube` — which installs on that box — shows no
   leanback, no banner, only `faketouch`. That box uses the regular Play Store. The original work
   order also scoped real TV support out ("worth doing only if TV is a market, not for one box").
   **Follow-up:** none unless TV becomes a market. Do not re-litigate per-device.

## Deferred: a guard that cannot check what it is named for

3. **`scripts/assert-play-artifact.sh` verifies feature NAMES, never `android:required="false"`.**
   The value is a compiled boolean in both container formats, absent from the `strings` output
   entirely, and `aapt2` cannot open an AAB (`error: could not identify format of APK`). A
   manifest-merger OR-in of a library's `required="true"` — the exact silent path back to the
   original exclusion — passes the gate clean. Documented in-code at the loop, and raised by
   cubic in three separate rounds, so it is a known limit rather than an oversight.
   No dependency declares a `uses-feature` today (checked across `node_modules` manifests), so it
   is latent.
   **Follow-up, pick one:** either add `tools:replace="android:required"` in
   `withOptionalHardwareFeatures` so the app's value wins the merge outright (prevention, and
   cheaper than detection), or run `aapt2 dump badging` in `release.yml`, which builds an APK that
   aapt2 *can* read, and assert `uses-feature-not-required:` there. The AAB path stays unverifiable
   either way.

4. **The orientation attribute itself is not gated on the artifact.** Same root cause as 3 —
   `screenOrientation` is a plain string in an AAB's protobuf manifest but a compiled enum int in
   an APK's binary XML. Guarded at its source by `tests/device-compatibility.test.ts` instead, which
   is sound because Expo's `withOrientation` mod rewrites that attribute from `app.config.ts` on
   every prebuild — there is no stale-manifest path around it.
   **Follow-up:** none. This is the correct place for it.

## Deferred: duplication the fix had to work around

5. **The QR pairing modal is duplicated verbatim in five files.** `app/(tabs)/family.tsx`,
   `app/(tabs)/family-hub.tsx`, `app/(tabs)/messages.tsx`, `app/network.tsx`,
   `app/id-management.tsx` each hold the same ~30-line card. The landscape overflow fix had to be
   made five times, and the next change to that card will too. Pre-existing — the change only
   added the `ScrollView` swap.
   **Follow-up:** extract `<QrCodeModal qrValue label onClose />` and collapse all five.

## Deferred: remaining import-time window snapshots

6. **`components/loading-screen.tsx:20`** — decorative circles at `width * 1.5` from a module-scope
   `Dimensions.get("window")`, so the value is the long edge on a landscape launch and stale after
   a rotation. Rendered from `app/_layout.tsx` during init. Impact is cosmetic only: the circles are
   `colors.primary + "08"` / `"05"`, roughly 3% alpha.
   **Follow-up:** `useWindowDimensions`, same shape as the `animated-splash.tsx` conversion in
   `98d33ad`. Low value; do it when the file is open for another reason.

7. **Pre-existing dead code, left alone deliberately** (the coding rules say mention, do not delete):
   - `components/swipeable-tabs.tsx` — **zero consumers**, nothing imports it. Its
     `SWIPE_THRESHOLD` and `±SCREEN_WIDTH` translate would both be wrong after a rotation if it is
     ever wired up. Note: one cubic round claimed this component "wraps every tab screen" — it does
     not; `app/(tabs)/_layout.tsx` has no reference to it.
   - `app/(tabs)/mosques.tsx:760,984` — `SCREEN_WIDTH` feeds `styles.map` / `styles.mapContainer`,
     neither of which is ever applied (no bracket-notation access either). One cubic round rated
     this a P1 live bug; it is not, and two other reviewers agreed it is dead.
   - `app/(tabs)/concepts.tsx:12` — imports `Dimensions` without using it.
   - `app.config.ts:58` — eslint `Array<T>` warning, predates this work.

## Not verifiable here

8. **Play Console supported-device count.** The actual payoff — the number on the release page
   before and after upload — needs the AAB uploaded. Note it before and after; the TV box is one
   device out of thousands, so the count is the outcome that matters, not the box.

9. **iOS is unaffected in practice.** Codex flagged that `orientation: "default"` also enables
   landscape in the iOS Info.plist, and that RN's native `Modal` defaults to portrait-only on
   iPhone when `supportedOrientations` is omitted (`components/date-picker.tsx:107` and
   `components/prayer-popup-modal.tsx` both omit it). Technically correct, but inert: there is no
   `ios/` directory, no iOS workflow, and no `eas.json` — nothing builds iOS from this repo.
   **Follow-up:** revisit only if iOS ships. Then set `supportedOrientations` on every `Modal`.
