import React from "react";
import { View, Text, ActivityIndicator, Modal } from "react-native";
import { useUpdates } from "@/hooks/use-updates";
import { useI18n } from "@/lib/i18n";

/**
 * Full-screen overlay shown while an APK update is downloading or launching the
 * installer. Progress lives in the shared updater store, but only Settings used
 * to render it — so an update started from the push-notification tap (which
 * opens the app on Home) ran invisibly. This surfaces it everywhere, so the user
 * always sees that the update is working instead of a frozen-looking screen.
 */
export function UpdateProgressOverlay() {
  const { language } = useI18n();
  const { isDownloading, downloadProgress } = useUpdates(language);
  const tx = (nl: string, en: string, ar: string) =>
    language === "ar" ? ar : language === "en" ? en : nl;

  if (!isDownloading) return null;

  const pct = Math.max(0, Math.min(100, Math.round((downloadProgress || 0) * 100)));
  // Download finished (100%) → we're now launching the system installer.
  const installing = pct >= 100;

  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.65)",
          justifyContent: "center",
          alignItems: "center",
          padding: 32,
        }}
      >
        <View
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: 18,
            paddingVertical: 28,
            paddingHorizontal: 24,
            alignItems: "center",
            width: "100%",
            maxWidth: 320,
          }}
        >
          <ActivityIndicator size="large" color="#0D7C5F" />
          <Text style={{ marginTop: 18, fontSize: 16, fontWeight: "700", color: "#1B4332", textAlign: "center" }}>
            {installing
              ? tx("Installatie openen...", "Opening installer...", "جارٍ فتح المُثبِّت...")
              : tx("Update downloaden...", "Downloading update...", "جارٍ تنزيل التحديث...")}
          </Text>
          {!installing && (
            <>
              <Text style={{ marginTop: 6, fontSize: 24, fontWeight: "800", color: "#0D7C5F" }}>{pct}%</Text>
              <View
                style={{
                  marginTop: 12,
                  height: 8,
                  width: "100%",
                  backgroundColor: "#E5E7EB",
                  borderRadius: 4,
                  overflow: "hidden",
                }}
              >
                <View style={{ height: "100%", width: `${pct}%`, backgroundColor: "#0D7C5F", borderRadius: 4 }} />
              </View>
            </>
          )}
          <Text style={{ marginTop: 16, fontSize: 12, color: "#6B7280", textAlign: "center", lineHeight: 18 }}>
            {tx(
              "Sluit de app niet tijdens het bijwerken.",
              "Don't close the app while updating.",
              "لا تُغلق التطبيق أثناء التحديث."
            )}
          </Text>
        </View>
      </View>
    </Modal>
  );
}
