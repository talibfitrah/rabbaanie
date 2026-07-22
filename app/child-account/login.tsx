import { useState } from "react";
import { Text, View, TextInput, TouchableOpacity, Alert, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useI18n } from "@/lib/i18n";

type LoginMode = "id" | "qr";
type LoginStep = "enter_id" | "parent_confirm";

export default function ChildLoginScreen() {
  const colors = useColors();
  const router = useRouter();
  const { t } = useI18n();
  const [childId, setChildId] = useState("");
  const [mode, setMode] = useState<LoginMode>("id");
  const [step, setStep] = useState<LoginStep>("enter_id");
  const [scanned, setScanned] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [parentPin, setParentPin] = useState("");
  const [generatedPin, setGeneratedPin] = useState("");
  const [pendingAccount, setPendingAccount] = useState<any>(null);

  const loginMutation = trpc.childAccount.login.useMutation();

  // Step 1: Verify child ID exists
  const handleVerifyId = async (id?: string) => {
    const loginId = id || childId.trim();
    if (!loginId || loginId.length < 3) {
      Alert.alert(t("child_login.error"), t("child_login.enter_id"));
      return;
    }
    try {
      const result = await loginMutation.mutateAsync({ accessCode: loginId });
      if (result.success && result.account) {
        // Generate a random 4-digit PIN for parent confirmation
        const pin = String(Math.floor(1000 + Math.random() * 9000));
        setGeneratedPin(pin);
        setPendingAccount(result.account);
        setStep("parent_confirm");
      } else {
        Alert.alert(t("child_login.error"), t("child_login.invalid_id"));
      }
    } catch {
      Alert.alert(t("child_login.error"), t("child_login.connection_error"));
    }
  };

  // Step 2: Parent confirms with PIN
  const handleParentConfirm = () => {
    if (parentPin === generatedPin) {
      // PIN matches - grant access
      router.replace({
        pathname: "/child-account/home",
        params: {
          accountId: String(pendingAccount.id),
          ageGroup: pendingAccount.ageGroup,
          gender: pendingAccount.gender,
        },
      });
    } else {
      Alert.alert(t("child_login.error"), t("child_login.wrong_pin"));
      setParentPin("");
    }
  };

  const handleQRScanned = ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    handleVerifyId(data);
  };

  const switchToQR = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert(t("child_login.notice"), t("child_login.camera_permission"));
        return;
      }
    }
    setMode("qr");
    setScanned(false);
  };

  // ========== STEP 2: Parent Confirmation ==========
  if (step === "parent_confirm") {
    return (
      <ScreenContainer className="p-6" edges={["top", "bottom", "left", "right"]}>
        <View className="flex-1 justify-center items-center gap-6">
          <View className="items-center gap-3">
            <Text className="text-5xl">🔐</Text>
            <Text style={{ color: colors.foreground, fontSize: 22, fontWeight: "bold", textAlign: "center" }}>
              {t("child_login.parent_confirm_title")}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 14, textAlign: "center", lineHeight: 22 }}>
              {t("child_login.parent_confirm_desc")}
            </Text>
          </View>

          {/* Show PIN to parent */}
          <View style={{
            backgroundColor: colors.surface,
            borderRadius: 16,
            padding: 24,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: "center",
            width: "100%",
            maxWidth: 300,
          }}>
            <Text style={{ color: colors.muted, fontSize: 14, marginBottom: 8 }}>
              {t("child_login.pin_label")}
            </Text>
            <Text style={{
              color: colors.primary,
              fontSize: 40,
              fontWeight: "bold",
              letterSpacing: 12,
            }}>
              {generatedPin}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 12, marginTop: 8, textAlign: "center" }}>
              {t("child_login.pin_instruction")}
            </Text>
          </View>

          {/* Parent enters PIN */}
          <View className="w-full max-w-xs gap-4">
            <TextInput
              value={parentPin}
              onChangeText={setParentPin}
              placeholder={t("child_login.enter_pin")}
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              maxLength={4}
              returnKeyType="done"
              onSubmitEditing={handleParentConfirm}
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderWidth: 1,
                borderRadius: 16,
                padding: 16,
                fontSize: 28,
                textAlign: "center",
                color: colors.foreground,
                letterSpacing: 10,
              }}
            />

            <TouchableOpacity
              onPress={handleParentConfirm}
              disabled={parentPin.length < 4}
              style={{
                backgroundColor: parentPin.length >= 4 ? colors.primary : colors.border,
                borderRadius: 16,
                padding: 16,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#fff", fontSize: 18, fontWeight: "bold" }}>
                {t("child_login.confirm")}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={() => { setStep("enter_id"); setParentPin(""); setGeneratedPin(""); }}
            style={{ padding: 12 }}
          >
            <Text style={{ color: colors.muted, fontSize: 14 }}>
              {t("child_login.back")}
            </Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  // ========== STEP 1: Enter ID or Scan QR ==========
  return (
    <ScreenContainer className="p-6" edges={["top", "bottom", "left", "right"]}>
      <View className="flex-1 justify-center items-center gap-6">
        {/* Header */}
        <View className="items-center gap-3">
          <Text className="text-5xl">🌟</Text>
          <Text className="text-3xl font-bold text-foreground text-center">
            {t("child_login.welcome")}
          </Text>
          <Text className="text-base text-muted text-center">
            {mode === "id"
              ? t("child_login.enter_id_or_qr")
              : t("child_login.point_camera")}
          </Text>
        </View>

        {mode === "id" ? (
          <>
            {/* ID Input */}
            <View className="w-full max-w-xs gap-4">
              <TextInput
                value={childId}
                onChangeText={setChildId}
                placeholder={t("child_login.id_placeholder")}
                placeholderTextColor={colors.muted}
                autoCapitalize="characters"
                returnKeyType="done"
                onSubmitEditing={() => handleVerifyId()}
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderWidth: 1,
                  borderRadius: 16,
                  padding: 16,
                  fontSize: 20,
                  textAlign: "center",
                  color: colors.foreground,
                  letterSpacing: 2,
                }}
              />

              <TouchableOpacity
                onPress={() => handleVerifyId()}
                disabled={loginMutation.isPending || childId.trim().length < 3}
                style={{
                  backgroundColor: childId.trim().length >= 3 ? colors.primary : colors.border,
                  borderRadius: 16,
                  padding: 16,
                  alignItems: "center",
                  opacity: loginMutation.isPending ? 0.6 : 1,
                }}
              >
                <Text style={{ color: "#fff", fontSize: 18, fontWeight: "bold" }}>
                  {loginMutation.isPending ? t("child_login.logging_in") : t("child_login.login")}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Divider */}
            <View className="w-full max-w-xs" style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
              <Text className="text-muted text-sm">{t("child_login.or")}</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
            </View>

            {/* QR Button */}
            <TouchableOpacity
              onPress={switchToQR}
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderWidth: 1,
                borderRadius: 16,
                padding: 16,
                width: "100%",
                maxWidth: 280,
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "center",
                gap: 10,
              }}
            >
              <Text style={{ fontSize: 24 }}>📷</Text>
              <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "600" }}>
                {t("child_login.scan_qr")}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            {/* QR Scanner */}
            <View style={styles.qrContainer}>
              <CameraView
                style={styles.camera}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={scanned ? undefined : handleQRScanned}
              />
              <View style={styles.overlay}>
                <View style={styles.scanFrame} />
              </View>
            </View>

            {/* Switch to ID */}
            <TouchableOpacity
              onPress={() => { setMode("id"); setScanned(false); }}
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderWidth: 1,
                borderRadius: 16,
                padding: 14,
                alignItems: "center",
              }}
            >
              <Text style={{ color: colors.foreground, fontSize: 16 }}>
                {t("child_login.enter_manually")}
              </Text>
            </TouchableOpacity>

            {scanned && (
              <TouchableOpacity
                onPress={() => setScanned(false)}
                style={{ padding: 8 }}
              >
                <Text style={{ color: colors.primary, fontSize: 14 }}>
                  {t("child_login.rescan")}
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {/* Back button */}
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ padding: 12 }}
        >
          <Text className="text-muted text-base">{t("child_login.back_to_parent")}</Text>
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  qrContainer: {
    width: 280,
    height: 280,
    borderRadius: 20,
    overflow: "hidden",
    position: "relative",
  },
  camera: {
    width: "100%",
    height: "100%",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  scanFrame: {
    width: 200,
    height: 200,
    borderWidth: 2,
    borderColor: "#fff",
    borderRadius: 12,
  },
});
