# Play submission — Rabbaanie 1.6.0

Written 2026-08-25. `local-docs/` is gitignored; this file is not versioned.

Previous accepted release: **1.5.7** (versionCode 1005007), uploaded 2026-08-17.
This one is **1.6.0** (versionCode 1006000).

Split by who can do it, the same as the 1.4.94 checklist. I can build and gate
the artifact; every Console click below is yours.

---

## 1. Why the version jumped a minor

The sideload channel is at **1.5.22** right now
(`api.rabbaanie.com/downloads/latest.json`), while Play is on 1.5.7. Both
channels report their version to the same API, and the server's
minimum-client-version gate (`lib/app-version.ts`, HTTP 426 →
`VersionBlockScreen`) compares one number for both. A Play build numbered 1.5.8
would sit *below* the whole live sideload fleet, so the day you raise
`minVersion` to force sideload users forward you would hard-block every Play
user with an undismissable screen.

1.6.0 sits above 1.5.22, leaves the rest of 1.5.x free for sideload, and marks
what this release actually is. If you want a different number, it is one env
var — `APP_VERSION=x.y.z` — and I rebuild.

---

## 2. What shipped since 1.5.7

**This is not a one-feature release.** The last Play upload was cut at `a9ed96b`
(2026-08-17 11:07; the AAB was built at 11:15). Since then `main` has taken
**25 commits, 46 app-facing files, +1690/-478**. All of it ships here.

Proven against the artifacts rather than inferred from git: two strings
introduced in the delta — `Failed to schedule native iqamah alarms:` and
`Educational Supervisor Dashboard` — read **0** in the accepted 1.5.7 bundle and
**1** in this one, with a positive control at 1 in both.

The nine cross-wife security commits are **not** in this delta — verified with
`git merge-base --is-ancestor`; they were already in 1.5.7.

### The ten major changes

1. **Tablets and large screens.** The portrait lock is gone and the layouts that
   the unlock exposed were reworked — library grid, prayer popup, five QR
   modals, splash — from live window dimensions instead of a value read once at
   import (`74f337d`, `038d17d`, `98d33ad`).
2. **Device reach.** Six implied hardware features declared `required="false"`,
   which restores every camera-less, GPS-less and TV device Play was filtering
   out — 3,037 TV models on the `screen.portrait` entry alone (`74f337d`).
3. **Your own daily check-in now drives your advice** — personal advice, the
   advisor, and parenting advice all read it (`fedeb5a`).
4. **Spouse visibility.** Her daily-diagnostic answers are served and rendered,
   the advice engages with them, with a husband-side access toggle and a route
   into Settings (`987a77d`, `f91305e`).
5. **Iqamah auto-silence that survives the app being killed**, via native
   AlarmManager rather than a JS timer (`bbcd91c`).
6. **Source-grounding standard.** The AI answers religious content only from
   the sources it was given (`2c6bdbf`).
7. **Name-fidelity standard.** Personal names are reproduced verbatim instead of
   being mis-transliterated (`a77d96f`).
8. **The children's AI chat never worked at all** — fixed, and child screens no
   longer cite unsourced scripture (`a4a7435`).
9. **Updating users were trapped in an onboarding loop.** A P0 that hit every
   user who updated (`b11ba1e`).
10. **A stale partner profile leaked across accounts on login** — the query
    cache was not cleared between sessions (`9d12bd2`).

### Also in the delta, below that bar

- Educational supervisors: specialists renamed to «مشرفون تربويون», with a
  dashboard, "ask a supervisor" and nearest-supervisor lookup (`66b60c6`,
  `3fe8a0f`).
- Broadcasts, mostly admin-side: scheduling by day + hour, send reports,
  notification deep-link (`db675d6`), and recurring automated broadcasts
  (`8d1f75a`).
- Plan progress survives translation and UI-language switches (`3dd7740`).
- Spouse advice addresses the user directly (`ed73456`); linked-spouse deleted
  parity and a spurious decline (`9a003cf`); partner-selection audit and
  data-integrity fixes (`3fe8a0f`); child-AI double-submit and broadcast
  localization (`66b60c6`).

**Verify before you release:** most of the AI-behaviour items above (source
grounding, name fidelity, check-in-informed advice, spouse visibility) have a
server half in the separate `rabbaanie-api` repo. The sideload channel is live
at 1.5.22 — later than every commit in this delta — so production must already
serve them. That is an inference from a version number, not a check; confirm one
AI answer cites its sources before you roll out.

### And specifically in 1.6.0 itself

**Tablets and landscape.** 1.5.7 was locked to portrait, so on a 1920×1200
tablet Android letterboxed it: 510 px of black down each side, with the app
reporting itself as a 600×800dp phone. That lock is gone. Measured on the
emulator before and after; the grid, the prayer popup, the QR modals and the
splash were all reworked to use live window dimensions instead of a value read
once at import.

**Device reach.** Play does not read which hardware an app needs, it *infers*
it — from the permissions, and from any portrait-locked activity — and every
inferred feature defaults to **required**. That silently excluded every
camera-less, GPS-less and TV device, including all 3,037 TV models. The build
now declares six features `required="false"`, which overrides the inference:

    screen.portrait  camera  camera.autofocus  location  location.gps  location.network

None of them is genuinely required — QR scanning is optional and both
location screens offer manual city selection. Nothing was added or removed
from the permission set to achieve this (see §5).

**A Play-friendly update path — new in this build.** The Play build has never
carried the in-app APK updater (Play forbids it) and it still does not. But
"no updater" had turned into "no update": Settings showed a bare version
number, and a push notification of type `app_update` — the one mechanism that
exists to announce a new version — called into the updater anyway and told
Android users *"Updates are only available in the Android app."* Both now open
the Play listing instead, which is Play's own mechanism and therefore allowed.
That is the last sideload-only surface that had no Play counterpart.

---

## 3. What is in the artifact, and what is kept out

Gated by `scripts/assert-play-artifact.sh`, which reads the shipped bundle
rather than trusting the build config — see §6 for the run.

| Sideload-only capability | In the AAB? | Play-friendly alternative |
|---|---|---|
| In-app APK download + install | no | **"Update in Google Play" in Settings**, and the same hand-off from an `app_update` push |
| `REQUEST_INSTALL_PACKAGES` | no | — (Play installs) |
| Child app-usage monitoring (`PACKAGE_USAGE_STATS`, `isMonitoringTool`, native module) | no | child mode itself still ships; only screen-time collection is out |
| Stripe checkout | no | **Play Billing** (`lib/play-billing.ts`) |
| APK link on the too-old-version block screen | no | opens the **Play listing** |
| AI chat image attachments | no | text chat unchanged |
| `rabbaanie://` navigation scheme | no | — (Google sign-in is certificate-bound, needs no scheme) |
| `LocationTaskService` (expo-location) | no | never started by this app; removing it avoids a foreground-service declaration |
| Free coupon redemption | **yes** | unchanged — only *sold* coupons are refused on this channel |

---

## 4. Console — do these

### 4a. Before you upload

1. **Check for manual device exclusions.** Release → *Reach and devices* →
   *Device catalog* → excluded devices. A rule you added by hand there
   overrides everything the manifest says, and it would quietly cancel the
   whole point of this release.
2. **Confirm no declaration is pending.** The Financial-features declaration
   in particular *hard-blocks every update* until it is complete, whatever the
   app does. 1.5.7 got through, so it should be done — confirm rather than
   assume.
3. **Check the App-access demo account still works and its subscription is
   still active.** `play-review@albunyaan.tv`. A lapsed demo subscription is a
   rejection on its own, and the reviewer cannot see the paid surfaces without
   it. Log in once on a device before you upload.

### 4b. Write down the number before you upload

On the release page, before you attach the bundle, note the **supported
devices count** for the current 1.5.7 release. Then attach 1.6.0 and note it
again. That difference is the entire measurable payoff of this release, and it
is the only place it is visible. The TV box that started this is one device out
of thousands — the count is the outcome, not the box.

### 4c. Upload

Production track (1.5.7 is already live there), or internal testing first if
you would rather see it on a real tablet before rollout. Either is fine; the
artifact is the same.

Consider a **staged rollout** rather than 100%. The device catalog is about to
grow by thousands of models this app has never run on — mostly TV boxes and
camera-less tablets, none of which any of us has tested. A 20% rollout for a
few days makes the crash rate on those visible before it reaches everyone.

### 4d. Store listing — the tablet screenshots are now wrong

`assets/store/screenshots-tablet{,-ar,-nl}` are eight portrait 1602×2848
images each. They were captured from the portrait-locked build. They no longer
show what a tablet user gets, which is the one thing this release changed.

Re-capture them in **landscape** on a tablet (or the Pixel_Tablet AVD at
1920×1200), all three language sets. This is not a formality: the large-screen
screenshots are what Play shows tablet users deciding whether to install, and
an app whose tablet shots are portrait phone screens reads as not built for
the device.

Phone screenshots (`screenshots{,-ar,-nl}`, 1323×2352) are unaffected.

### 4e. Release notes

Paste per language. Measured: en-US 494, ar 458, nl-NL 497 — all under Play's
500-character limit. They cover the whole delta since 1.5.7, not just the
tablet work; the ten major changes are listed in §2.

**en-US**

    • Tablets and large screens: the app now fills the screen in landscape, and reaches many more devices.
    • Your daily check-in now shapes your personal, marital and parenting advice.
    • See your spouse's daily answers and engage with them, with permission.
    • Iqamah auto-silence now works with the app closed.
    • AI answers religious questions only from the provided sources, and reproduces names exactly.
    • Fixed: children's AI chat, onboarding loop after updating, plan progress across languages.

**ar**

    • دعمُ الأجهزة اللوحية والشاشات الكبيرة: يملأ التطبيقُ الشاشةَ في الوضع الأفقي، ويصل إلى أجهزةٍ أكثر بكثير.
    • مراجعتُك اليومية صارت تُغذّي نصائحَك الشخصية والزوجية والتربوية.
    • الاطّلاعُ على إجابات زوجِك اليومية والتفاعلُ معها، بإذنها.
    • كتمُ الإقامة التلقائي يعمل والتطبيقُ مُغلق.
    • الذكاءُ الاصطناعي يجيب في المسائل الشرعية من المصادر المرفقة وحدَها، ويكتب الأسماءَ كما هي.
    • إصلاحات: محادثةُ الأطفال، وحلقةُ الإعداد بعد التحديث، وتقدُّمُ الخطة عبر اللغات.

**nl-NL**

    • Tablets en grote schermen: de app vult nu het scherm in liggende stand en werkt op veel meer apparaten.
    • Je dagelijkse check-in bepaalt nu je persoonlijke, huwelijks- en opvoedadvies.
    • Bekijk de dagelijkse antwoorden van je partner en reageer erop, met toestemming.
    • Iqamah automatisch stilzetten werkt nu met de app gesloten.
    • AI beantwoordt religieuze vragen alleen uit de aangeleverde bronnen en schrijft namen exact over.
    • Opgelost: AI-chat voor kinderen, onboarding-lus, planvoortgang.

---

## 5. What did NOT change — do not redo these

- **Permissions: byte-identical to 1.5.7.** Diffed from both bundles' manifests
  (see §6). Declaring a feature optional does not touch the permission set.
- **Data safety** — no new collection, no new sharing.
- **Content rating / target audience** — unchanged (children + adults).
- **Foreground services** — still none declared.
- **Sensitive-permission declarations** — `SCHEDULE_EXACT_ALARM` unchanged; no
  `PACKAGE_USAGE_STATS`, no `QUERY_ALL_PACKAGES`.
- **Signing** — same upload key (`release.p12`, SHA-256 `D8:1A:74:…:5B:63`),
  the one that signed 1.5.7. Play App Signing re-signs it as before.
- **Android TV listing** — *not* included. Restoring TV devices to the
  phone/tablet catalog is not the same as being in the Android TV store, which
  needs a `LEANBACK_LAUNCHER` filter, a 320×180 banner and D-pad focus order.
  The MINIX box this started with uses the regular Play Store, so it does not
  need any of that. Only worth doing if TV becomes a market.

---

## 6. Verification run

**Artifact:** `~/Documents/rabbaanie-v1.6.0.aab`
**SHA-256:** `a3abe03bd31004ea61956ae7fafb34de552aeb965a2aac582033462e4da137c5`
**Size:** 72,554,609 bytes · built 2026-08-25. `android/` came from a `--clean`
prebuild; the review fixes were JS-only rebuilds on top of it, and the gate below
re-ran on the final artifact rather than on the first one.

Checked on the shipped bundle, not on the build config:

| Check | Result |
|---|---|
| `scripts/assert-play-artifact.sh` | **OK** — channel, no forbidden permissions, no monitoring bytecode, `BILLING` present, all 6 device-reach features present |
| Signers | exactly **1** |
| Certificate | `D8:1A:74:…:5B:63` — the same upload key that signed the accepted 1.5.7 |
| Embedded config | `version 1.6.0 · versionCode 1006000 · orientation default · scheme undefined · distribution play · childMonitoring false` |
| Permission set vs 1.5.7 | **identical**, 34 entries, diffed from both bundles' manifests |
| `uses-feature` in the merged manifest | all six `android:required="false"` — the merger did not OR-in a `true` |
| MainActivity orientation | `unspecified` |
| ML Kit barcode activity | still `portrait` — which is why the explicit `screen.portrait` entry is load-bearing, not redundant |
| targetSdk | 36 |
| ABIs | `arm64-v8a`, `armeabi-v7a` |

Source gates: `tsc --noEmit` clean · `pnpm test:release` **308/308** across 27 files ·
eslint 0 errors on changed files · full suite unchanged from baseline (the same 9
pre-existing failing files, none of which reads a changed file).

The Play hand-off was confirmed **inside the shipped Hermes bundle**, with a
positive and a negative control, because `index.android.bundle` is bytecode and a
plain grep can read 0 for strings that are present:

    POSITIVE control (shipped since 1.5.x)   1
    NEGATIVE control (must read 0)           0
    market:// listing                        1
    https listing fallback                   1
    Settings button label (nl)               1
    both-fail alert copy (en)                1

Arabic string literals are **not** greppable in this bundle by any encoding
(`raw-utf8`, `utf16le`, `utf16be` all read 0 for a string known to be present),
so the Arabic labels are evidenced by their Dutch siblings in the same `tx()`
call rather than checked directly.

### Reviews run

Cubic, codex and a cold code-review pass, all three against the same diff. They
converged on the same six defects, every one now fixed and each guard watched
fail before it passed:

1. the button rendered on the **web** build, where `market://` opens a blank tab
   and react-native-web's `openURL` never rejects, so the fallback could not fire;
2. both `openURL` calls swallowed their rejection — total failure was a silent
   no-op, the same dead end this change removes, only quieter;
3. the https fallback had no test at all (deleting it left 45/45 green);
4. `toContain("com.rabbaanie.app")` accepted `https://example.com/com.rabbaanie.app.apk`
   — precisely the off-Play link the guard exists to forbid;
5. `toContain("openPlayStoreListing")` was satisfied by the import line alone;
6. "leaves the sideload updater intact" asserted one boolean and nothing else.

Six cubic rounds in total; rounds 3-6 were clean of P0/P1 throughout, and
rounds 5 and 6 clean of P2 as well. The later rounds still earned their keep: the section title had become unconditional while
the button stayed Android-gated, so web and iOS would read "App Updates" over a
bare version number — the exact dishonesty the original conditional prevented —
and the test asserted the JSX condition as a formatted string, which a reformat
would break and the tempting fix would then loosen. Both now hang off one
exported `PLAY_UPDATE_HANDOFF` flag that the title and the button share, and the
test reads the boolean rather than the source text.

Round 5 then caught the new flag not doing its job — `checkForUpdate` still
spelled its gate out longhand as `Platform.OS === "android"`, equivalent only
because `__DEV__` is handled in the branch above it, so reordering those
branches would silently decouple the three sites the flag exists to couple.
Round 6 caught a test landmine: `loadUpdates`' `vi.doMock("react-native")`
overrides the file-level mock for everything after it and outlives its own
test, so any describe appended below would have received the wrong stub and
failed for an unrelated reason. Both fixed, both baited. The teardown fix took
two attempts — `vi.doUnmock` disables the file-level mock too, and the real
react-native package ships untranspiled, so the next import died on a parse
error rather than falling back.

**Two reviewer findings rejected, with the evidence:**

- *"`PLAY_UPDATE_HANDOFF` should also check `__DEV__`, like every other update
  path."* The symmetry is superficial. That guard exists on the sideload path
  because self-installing an APK over a dev build is destructive; opening a
  store listing is not, and a developer who taps it lands on the listing, which
  is a reasonable outcome. Dev builds do not ship, so nothing user-facing turns
  on it, and adding the check would be a guard for a state that is not a
  problem.
- *"The occurrence-count assertion is redundant with `toContain('{PLAY_UPDATE_HANDOFF&&(')`."*
  It is not: baiting the button's `onPress` to a no-op while leaving the import
  and the gate in place fails on the **count** and passes the gate assertion.
  The count is what catches an unwired control. It is loosely true that a
  comment mentioning the identifier would satisfy it, but tightening it back to
  a spelling match reintroduces exactly the refactor-fragility the previous
  round flagged — `onPress={openPlayStoreListing}` is behaviour-preserving and
  would fail a spelling match.

**Deliberately not fixed — pre-existing, and worth someone's decision:**
`components/version-block-screen.tsx:22` opens the Play listing too, but with a
hardcoded `com.rabbaanie.app` literal and a bare `Linking.openURL(DOWNLOAD_URL)`
— no catch, no fallback, no message — on an **undismissable** screen whose
single button is the only way out. So there are now two Play-listing paths with
different robustness, and two copies of the package id.

Left alone on purpose: it is pre-existing and working, extracting a shared
constant would break the guard at `tests/play-store-compliance.test.ts:583`
which pins that literal, and the package id is permanent once published so
drift risk is nil.

The *robustness* gap is the part with teeth, and **this release makes it more
reachable, which is the honest argument for fixing it.** An https `openURL`
fails only where no activity handles https — i.e. no browser at all. That is
close to impossible on a phone or tablet. It is not impossible on the TV boxes
and stripped-down devices this very release adds to the catalog. So the
population of devices where that undismissable screen's only button can do
nothing just grew, because of this change.

Cheapest fix if you want it: have that button call `openPlayStoreListing()` on
the play branch — it already handles market://, the https fallback and the
both-failed case — and rewrite the :583 guard to assert the call rather than
the literal. Raised three rounds running by cubic; not done here because it
means touching working code and rewriting a working guard on the eve of a
submission. Your call, not mine.

**Operational note, the expensive one.** `codex exec` is not read-only: asked
only to review, it reverted two applied fixes and deleted two tests from the
working tree, and a `cubic` round running at the same time then reported the
pre-fix findings. `pnpm test:release` still passed, because the reverted tests
were gone too. Caught by re-reading the source before rebuilding — one step
later and this AAB would have shipped without the fixes. Commit before running
stage 5 or 9, and never run those two together on an uncommitted tree.

---

## 7. Two things to check on the server side, not in Console

1. **Play Billing needs its server half already deployed.** `/api/subscription/verify-play`
   and the `playAccountTag` field on `/api/subscription/status` live in the
   separate `rabbaanie-api` repo, not this one. Until they answer, the tag is
   absent and the purchase button never renders — fail-closed by design, but it
   means a Play user cannot buy. 1.5.7 is live and selling, so this is a
   *confirm*, not a task: hit `/api/subscription/status` for the demo account
   and check `playAccountTag` is present.

2. **`app_update` pushes now reach Play users differently.** The server sends
   that push to announce a sideload release. A Play user who taps it used to
   get a wrong error message; now they get the Play listing, which may show
   "Open" rather than "Update" if the Play release has not rolled out yet.
   Harmless, but the clean fix is server-side: target `app_update` at sideload
   installs only.

---

## 8. Follow-ups, deliberately not in this build

- **x86_64 ABI.** The build ships `armeabi-v7a` + `arm64-v8a` only, same as
  1.5.7, which filters out Chromebooks and Intel-based tablets and TV boxes.
  Worth adding *because it is an AAB*: Play delivers one ABI split per device,
  so a third architecture costs nothing in user download size — only build time
  and upload size. Not done here because it is a new native build surface and
  this release is already a device-reach change; do it as its own change with
  its own verification.
- **Android TV listing** (leanback + banner + D-pad focus) — see §5.
- **The nine deferred findings** from the tablet/landscape work are in
  `local-docs/FINDINGS-tablet-landscape-deferred.md`.

---

## 9. If you rebuild by hand

`android/` is now a **Play** prebuild. Building a sideload APK on top of it
without `--clean` is a known trap in this repo: it once shipped an APK that had
lost child monitoring entirely, and nothing failed. Always:

```bash
export APP_DISTRIBUTION=github APP_VERSION=<ver>
pnpm exec expo prebuild --platform android --clean --no-install
```

And to rebuild this Play bundle:

```bash
export APP_DISTRIBUTION=play APP_VERSION=1.6.0
export ANDROID_HOME=$ANDROID_SDK_ROOT
pnpm exec tsc --noEmit && pnpm test:release
pnpm exec expo prebuild --platform android --clean --no-install
# signing injected via ~/.gradle/gradle.properties (0600), keystore
# keys/rabbaanie-keystore/release.p12, alias "rabbaanie"
(cd android && ./gradlew bundleRelease --no-daemon)
./scripts/assert-play-artifact.sh android/app/build/outputs/bundle/release/app-release.aab
```

`APP_DISTRIBUTION` must be exported for **both** steps: expo-constants
re-evaluates `app.config.ts` during Gradle and bundles the result as the
`app.config` asset, so setting it only on prebuild ships a bundle whose
`extra.distribution` is wrong.
