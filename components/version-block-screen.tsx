/**
 * Full-screen, undismissable block shown when the server refuses this build
 * as too old (HTTP 426 — see lib/app-version.ts's useVersionBlocked). Mounted
 * in app/_layout.tsx's AuthGate ahead of every other gate, the same way that
 * component already blocks on age/auth state, so there is no route the user
 * can navigate to instead.
 */
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Linking } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { DISTRIBUTION_CHANNEL } from "@/lib/distribution";

// Google Play forbids an app distributed on Play from sending users to obtain
// or update it anywhere but Play — the same policy that keeps the in-app APK
// updater dark on this channel (UPDATER_ENABLED, hooks/use-updates.ts). This
// screen is undismissable and its button is the only way out of it, so an
// ungated APK link here is a sideload funnel shown to every Play user the
// server refuses. Only the sideload build may point at the APK page.
const DOWNLOAD_URL =
  DISTRIBUTION_CHANNEL === "play"
    ? "https://play.google.com/store/apps/details?id=com.rabbaanie.app"
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
  const body =
    language === "ar"
      ? "هذا الإصدار لم يعد مدعومًا. يرجى تنزيل أحدث إصدار للمتابعة."
      : language === "en"
      ? "This version is no longer supported. Please download the latest version to continue."
      : "Deze versie wordt niet meer ondersteund. Download de nieuwste versie om verder te gaan.";
  const button =
    language === "ar" ? "تنزيل التحديث" : language === "en" ? "Download Update" : "Update downloaden";

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
