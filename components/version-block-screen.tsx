/**
 * Full-screen, undismissable block shown when the server refuses this build
 * as too old (HTTP 426 — see lib/app-version.ts's useVersionBlocked). Mounted
 * in app/_layout.tsx's AuthGate ahead of every other gate, the same way that
 * component already blocks on age/auth state, so there is no route the user
 * can navigate to instead.
 */
import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
} from "react-native";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { DISTRIBUTION_CHANNEL } from "@/lib/distribution";

// Google Play forbids an app distributed on Play from sending users to obtain
// or update it anywhere but Play — the same policy that keeps the in-app APK
// updater dark on this channel (UPDATER_ENABLED, hooks/use-updates.ts). This
// screen is undismissable and its button is the only way out of it, so an
// ungated APK link here is a sideload funnel shown to every Play user the
// server refuses. Only the sideload build may point at the APK page.
//
// The branch is on the channel and not on "is this Android", so iOS lands on
// the else the moment lib/distribution.ts reports "apple". It used to report
// "play" on an iPhone, which put a Google Play button on the one screen a
// blocked user cannot leave — a store the device cannot install from, and a
// rejection in front of a reviewer.
//
// "apple" gets its own arm, and must NOT share the sideload one. `?p=app` is
// the APK download page — assert-sideload-artifact.sh treats it as the APK
// distribution point — so letting iOS fall through to it put an Android APK
// offer on the one screen an iOS user cannot leave. That is worse than the
// Google Play link it replaced, not better: it is an in-app route to obtain
// the app outside the App Store, shown to a reviewer with no way back.
//
// The site root is the honest destination until the numeric App Store ID
// exists: the first submission is what mints that ID, and a placeholder would
// link to a stranger's listing. Swapping in `https://apps.apple.com/app/id<ID>`
// is a one-line change once it is known.
//
// What is asserted here is only that this is not `?p=app`, the page that hands
// out the Android APK. Whether the site ROOT links onward to that page is a
// property of the website, not of this repo, and nothing here can test it.
// Keeping an iOS user off the direct APK route is what the branch guarantees —
// claims about what the site serves do not belong in a code comment, because
// nothing here can keep them true.
//
// Exported so tests read the resolved destination rather than matching this
// expression as source text: a string match breaks the day Prettier reflows
// the ternary, and the tempting fix for that failure is to loosen the string,
// which deletes the guard.
export const DOWNLOAD_URL =
  DISTRIBUTION_CHANNEL === "play"
    ? "https://play.google.com/store/apps/details?id=com.rabbaanie.app"
    : DISTRIBUTION_CHANNEL === "apple"
      ? "https://rabbaanie.com/"
      : "https://rabbaanie.com/?p=app";

export function VersionBlockScreen() {
  const colors = useColors();
  const { language } = useI18n();

  const title =
    language === "ar"
      ? "يتوفر إصدار جديد من التطبيق"
      : language === "en"
        ? "A new version of the app is available"
        : "Er is een nieuwe versie van de app beschikbaar";
  // Same reasoning as the button label below, applied to the sentence above it.
  // On iOS the destination is the site root — no App Store listing exists to
  // deep-link to yet, and rabbaanie.com deliberately carries no iOS download —
  // so "download the latest version" names an action nothing on the other end
  // can perform. Fixing only the button left the body still promising it, on a
  // screen the user cannot dismiss.
  const body =
    DISTRIBUTION_CHANNEL === "apple"
      ? language === "ar"
        ? "هذا الإصدار لم يعد مدعومًا. يرجى زيارة موقعنا للحصول على أحدث إصدار."
        : language === "en"
          ? "This version is no longer supported. Visit our website for the latest version."
          : "Deze versie wordt niet meer ondersteund. Bezoek onze website voor de nieuwste versie."
      : language === "ar"
        ? "هذا الإصدار لم يعد مدعومًا. يرجى تنزيل أحدث إصدار للمتابعة."
        : language === "en"
          ? "This version is no longer supported. Please download the latest version to continue."
          : "Deze versie wordt niet meer ondersteund. Download de nieuwste versie om verder te gaan.";
  // The label has to match what the button actually does. On the sideload and
  // Play channels it starts a download; on iOS it opens the website, because no
  // App Store listing exists to deep-link to yet and this app cannot be
  // downloaded from anywhere else. "Download Update" there promises an action
  // the platform will not perform, on a screen the user cannot dismiss — the
  // same class of wrongness as the Google Play link this branch replaced.
  const button =
    DISTRIBUTION_CHANNEL === "apple"
      ? language === "ar"
        ? "افتح الموقع"
        : language === "en"
          ? "Open website"
          : "Website openen"
      : language === "ar"
        ? "تنزيل التحديث"
        : language === "en"
          ? "Download Update"
          : "Update downloaden";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={styles.emoji}>⬆️</Text>
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.body, { color: colors.muted }]}>{body}</Text>
      <TouchableOpacity
        style={[styles.button, { backgroundColor: colors.primary }]}
        onPress={() => Linking.openURL(DOWNLOAD_URL)}
      >
        <Text style={styles.buttonText}>{button}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  emoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },
  body: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
    maxWidth: 320,
  },
  button: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 10,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
});
