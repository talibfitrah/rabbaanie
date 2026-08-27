#!/usr/bin/env bash
# Gate a Google Play artifact (.aab, or .apk when checking a Play-channel build)
# against the things that get an app removed or rejected.
#
# Why this exists as a script rather than only as steps in play-release.yml:
# `android/` is gitignored, so CI always prebuilds from a clean tree and the
# workflow's own checks are enough THERE. A build run by hand on a developer
# box is not clean — `expo prebuild` over an existing android/ retains stale
# entries (app.config.ts documents this for USE_FULL_SCREEN_INTENT), so a
# manifest written during an earlier APP_DISTRIBUTION=github prebuild can still
# be carrying REQUEST_INSTALL_PACKAGES when a Play bundle is built on top of it.
# Nothing would catch that. This gate reads the SHIPPED artifact, so it does not
# care how the artifact was produced.
#
#   scripts/assert-play-artifact.sh path/to/app-release.aab
#
# Exit 0 = safe to upload. Any non-zero = do not upload.
set -uo pipefail

ART="${1:-}"
if [ -z "$ART" ] || [ ! -f "$ART" ]; then
  echo "usage: $0 <path-to-.aab-or-.apk>" >&2
  exit 2
fi

FAILED=0
fail() { echo "FORBIDDEN: $*" >&2; FAILED=1; }

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# --- 1. Release channel, read from the artifact itself -----------------------
# app.config.ts embeds `extra.distribution` into assets/app.config, so the
# channel the bundle was actually built with is a property of the file rather
# than of the environment someone believes they built it in. This is the check
# that catches a Play bundle built from a stale github-channel tree.
CFG=""
for P in assets/app.config base/assets/app.config; do
  if unzip -p "$ART" "$P" > "$TMP/app.config" 2>/dev/null && [ -s "$TMP/app.config" ]; then
    CFG="$TMP/app.config"; break
  fi
done
if [ -z "$CFG" ]; then
  echo "Could not read the embedded Expo config from $ART — refusing to ship unverified" >&2
  exit 1
fi
if ! grep -q '"distribution":"play"' "$CFG"; then
  fail "artifact is not a Play-channel build (expected \"distribution\":\"play\"): $(grep -o '"distribution":"[a-z]*"' "$CFG" || echo 'field absent')"
fi
# The sideload-only capability flag rides along with the channel; assert it
# directly so a future edit that decouples the two still fails here.
if ! grep -q '"childMonitoring":false' "$CFG"; then
  fail "childMonitoring is not disabled in the artifact's config"
fi

# --- 2. Signing certificate --------------------------------------------------
# Stock Expo points the `release` buildType at signingConfigs.debug, so a bundle
# built by hand with `./gradlew bundleRelease` and no injected signing is
# silently DEBUG-signed and only Play's rejection tells you. play-release.yml
# pins this same fingerprint for the builds IT produces; hand-built artifacts,
# the ones this script exists for, had no such check until now.
# openssl rather than keytool: keytool needs a JDK, which a box that only runs
# the gate need not have — /usr/bin/keytool on macOS is a stub that prints
# "Unable to locate a Java Runtime" and exits 1. A check that cannot fire is
# worse than none, so read the certificate out of the PKCS#7 block directly.
# Only a TOP-LEVEL META-INF/*.RSA is a jar signature; a bundled library's own
# block under base/root/META-INF must not inflate the count. An artifact with
# no such block at all (an APK signed only with v2/v3) is reported here rather
# than waved through unchecked — every AAB carries a v1 signature.
EXPECTED_SHA256="D8:1A:74:E9:72:03:8B:30:96:F7:A1:0B:81:17:44:A4:76:33:5F:98:CB:C5:BF:94:08:BA:23:3E:21:F3:5B:63"
SIG=$(unzip -l "$ART" | awk '{print $NF}' | grep -E '^META-INF/[^/]+\.(RSA|DSA|EC)$')
NSIG=$(printf '%s' "$SIG" | grep -c .)
if [ "$NSIG" -ne 1 ]; then
  # More than one means the debug key was added alongside the upload key; none
  # means the artifact carries no verifiable signing identity at all.
  fail "expected exactly 1 signer, found $NSIG: $(printf '%s' "$SIG" | tr '\n' ' ')"
else
  CERT_SHA256=$(unzip -p "$ART" "$SIG" | openssl pkcs7 -inform DER -print_certs 2>/dev/null \
                | openssl x509 -noout -fingerprint -sha256 2>/dev/null | sed 's/^.*=//')
  if [ -z "$CERT_SHA256" ]; then
    echo "Could not read the signing certificate from $ART — refusing to ship unverified" >&2
    exit 1
  fi
  if [ "$CERT_SHA256" != "$EXPECTED_SHA256" ]; then
    fail "signed with $CERT_SHA256, not the Rabbaanie upload certificate ($EXPECTED_SHA256)"
  fi
fi

# --- 3. Permissions and manifest metadata -----------------------------------
# A compiled AndroidManifest is NOT greppable as text. In an APK it is binary
# XML whose string pool is UTF-16LE, so a plain `grep -a` finds nothing and the
# gate would report a clean bill of health on a bundle that does declare
# REQUEST_INSTALL_PACKAGES — silently worse than having no gate. An AAB stores
# the manifest as protobuf, where the same strings are UTF-8. Extracting both
# encodings and searching the union covers APK, AAB, and a plain-text merged
# manifest, without needing aapt2 or bundletool on the machine running this.
MAN="$TMP/manifest.bin"
: > "$MAN"
for P in AndroidManifest.xml base/manifest/AndroidManifest.xml; do
  unzip -p "$ART" "$P" >> "$MAN" 2>/dev/null || true
done
if [ ! -s "$MAN" ]; then
  echo "Could not read a manifest from $ART — refusing to ship unverified" >&2
  exit 1
fi
MANTXT="$TMP/manifest.txt"
{ strings -a "$MAN"; strings -a -e l "$MAN"; } > "$MANTXT"
# Self-check: every Android manifest names the package. If neither encoding
# yields it, the extraction is broken and every check below would pass
# vacuously — fail loudly instead of shipping on a false negative.
if ! grep -q 'com.rabbaanie.app' "$MANTXT"; then
  echo "Manifest text extraction failed (package name not found) — refusing to ship unverified" >&2
  exit 1
fi

# REQUEST_INSTALL_PACKAGES: Play forbids an app distributed on Play from
# updating itself by any mechanism other than Play's own.
# PACKAGE_USAGE_STATS: the broad Rabbaanie listing cannot qualify as an
# exclusively marketed monitoring app. The rest are unused sensitive
# permissions pulled in by dependencies.
for PERM in REQUEST_INSTALL_PACKAGES SYSTEM_ALERT_WINDOW RECORD_AUDIO \
            PACKAGE_USAGE_STATS READ_EXTERNAL_STORAGE WRITE_EXTERNAL_STORAGE \
            USE_FULL_SCREEN_INTENT ACTIVITY_RECOGNITION; do
  if grep -q "android.permission.$PERM" "$MANTXT"; then
    fail "$PERM is present in the Play build"
  fi
done
if grep -q 'isMonitoringTool' "$MANTXT"; then
  fail "isMonitoringTool metadata is present in the Play build"
fi

# expo-location's LocationTaskService is declared with
# foregroundServiceType="location" and merges in whether or not the app uses
# it. This app never starts it. Left in, it obliges a Play Console
# foreground-service declaration for the location type — the most closely
# scrutinised — with no truthful use case to give. app.config.ts removes it;
# this asserts the removal survived into the artifact, because a config plugin
# that silently stops matching is exactly the failure the other checks here
# exist for.
if grep -q 'LocationTaskService' "$MANTXT"; then
  fail "expo-location's LocationTaskService is present — that is a location foreground service the app never starts"
fi

# --- Device reach --------------------------------------------------------
# Play filters a device out when the app REQUIRES hardware it lacks, and Play
# INFERS those requirements instead of reading them: from the permissions for
# camera and location, and from any portrait-locked activity for
# screen.portrait. Left inferred, that set excluded all 3,037 TV devices plus
# every camera-less or GPS-less tablet. app.config.ts declares them optional,
# which overrides the implication; this asserts the declaration survived into
# the artifact, the same way BILLING is asserted below.
#
# A config plugin that stops matching, or a CI prebuild from a clean tree after
# the plugin was renamed, drops the entries with no signal at all — the app
# still builds, installs and runs, it just reaches fewer devices. Nothing else
# in this app declares a uses-feature, so the name being present is the plugin
# having run.
#
# screen.portrait must not be "tidied away" on the reasoning that orientation
# is no longer locked — it was measured still implied on a build where
# MainActivity was already unspecified. See OPTIONAL_FEATURES in app.config.ts.
#
# Two things are NOT checked here, and both are deliberate rather than
# oversights — read them before trusting this block further than it goes.
#
#   1. The screenOrientation attribute. Its value is a plain string in an AAB's
#      protobuf manifest but a compiled enum int in an APK's binary XML, so the
#      extraction above sees it in one container and never in the other, and
#      aapt2 cannot open an AAB at all. A check that silently cannot fire on
#      APKs is worse than none. Guarded at its source instead, by
#      tests/device-compatibility.test.ts, and Expo's own withOrientation mod
#      rewrites that attribute from app.config.ts on every prebuild — so there
#      is no stale-manifest path around it.
#   2. The android:required VALUE. It is a compiled boolean in both container
#      formats, so it is absent from the `strings` output entirely — only the
#      NAME below is greppable. A flip to required="true", whether by edit or
#      by the manifest merger OR-ing in a library's own required="true" entry,
#      would pass this loop. The name being present still proves the plugin
#      ran, which is the silent-drop failure this guards; it does not prove the
#      entry is optional. `aapt2 dump badging` on an APK is the check that
#      distinguishes them (uses-feature-not-required: vs uses-feature:).
#
# Anchored at the end of the name: a bare substring match for
# android.hardware.camera is satisfied by android.hardware.camera.autofocus,
# and android.hardware.location by .gps/.network — so dropping either of the
# two broadest entries, the ones Play actually filters camera-less and
# GPS-less devices on, would still read clean. Not anchored with grep -x: the
# extracted string pool carries stray leading bytes on some entries.
for FEATURE in screen.portrait camera camera.autofocus location location.gps location.network; do
  if ! grep -qE "android\.hardware\.$FEATURE([^.a-zA-Z0-9]|\$)" "$MANTXT"; then
    fail "android.hardware.$FEATURE is not declared — Play will imply it as required and filter out every device that lacks it"
  fi
done

# The only REQUIRED permission asserted here. Like the device-reach loop above,
# it fails for something being absent rather than present. `android.permissions` in
# app.config.ts is a restrictive allow-list and blockedPermissions emits
# tools:node="remove", so a merge-order change or a future edit could strip the
# billing permission that expo-iap contributes from its own manifest. Nothing
# else would notice: the app builds, launches, and only fails when a real user
# tries to pay. Every purchase on Play depends on this line.
if ! grep -q 'com.android.vending.BILLING' "$MANTXT"; then
  fail "com.android.vending.BILLING is MISSING — Play Billing cannot work"
fi
# Native Google sign-in is certificate-bound and consumes no redirect scheme;
# a surviving auth scheme means a stale manifest. Matched as a whole word: the
# package name com.rabbaanie.app contains "rabbaanie" and is present in every
# manifest, so a substring match would fail every build including a correct one.
if grep -qE '(^|[^.[:alnum:]])rabbaanie([^.[:alnum:]]|$)' "$MANTXT"; then
  fail "legacy \"rabbaanie\" navigation scheme is present in the Play build"
fi
if grep -q 'com.rabbaanie.app.auth' "$MANTXT"; then
  fail "retired OAuth callback scheme is present in the Play build"
fi

# --- 4. Native monitoring code ----------------------------------------------
# A blocked permission does not remove the module that asks for it; Play reads
# the bytecode too.
DEX="$TMP/dex.bin"
if unzip -p "$ART" 'base/dex/*.dex' > "$DEX" 2>/dev/null && [ -s "$DEX" ]; then
  :
elif unzip -p "$ART" '*.dex' > "$DEX" 2>/dev/null && [ -s "$DEX" ]; then
  :
else
  echo "Could not inspect bytecode in $ART — refusing to ship unverified" >&2
  exit 1
fi
if grep -a -qE 'expo/modules/usagestats|UsageStatsModule' "$DEX"; then
  fail "native usage-stats monitoring code is present in the Play artifact"
fi

if [ "$FAILED" -ne 0 ]; then
  echo "" >&2
  echo "$ART is NOT safe to upload to Play." >&2
  exit 1
fi
echo "OK: $ART is a Play-channel build with no forbidden permissions, schemes, or native modules."
