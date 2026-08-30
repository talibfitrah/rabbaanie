import { useState } from "react";
import { Text, View, TouchableOpacity, Platform, Alert } from "react-native";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useRouter } from "expo-router";

/**
 * QR Scanner Screen
 * Scans a QR code holding a person's public ID and links them. The ID's shape
 * is NOT parsed here: user public IDs come in several live formats (RB-NNNN,
 * legacy U-…, and YYYYMMDD_XX_NNN), and children reuse the YYYYMMDD_XX_NNN
 * shape too, so a regex/age guess misroutes real accounts. Instead the server
 * resolves it — a hit in lookupUser means an adult (partner), a miss means it
 * is not a user, so we try it as a child ID.
 */
export default function QrScannerScreen() {
  const colors = useColors();
  const router = useRouter();
  const utils = trpc.useUtils();
  const [scanned, setScanned] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const linkChild = trpc.links.linkChildByPublicId.useMutation({
    onSuccess: (data) => {
      setResult(`Gekoppeld aan: ${data.childName}\nLinked to: ${data.childName}\n\u062a\u0645 \u0627\u0644\u0631\u0628\u0637 \u0628\u0640: ${data.childName}`);
    },
    onError: (err) => {
      setResult(`Fout / Error: ${err.message}`);
    },
  });

  const linkPartner = trpc.links.linkPartnerByPublicId.useMutation({
    onSuccess: (data) => {
      setResult(`Koppelverzoek verstuurd naar ${data.partnerName || "Partner"}; gegevens worden pas na bevestiging gedeeld.\nLink request sent to ${data.partnerName || "Partner"}; data is shared only after confirmation.\nتم إرسال طلب الربط إلى ${data.partnerName || "الشريك"}؛ لن تتم مشاركة البيانات إلا بعد التأكيد.`);
    },
    onError: (err) => {
      setResult(`Fout / Error: ${err.message}`);
    },
  });

  const handleBarcode = async ({ data }: BarcodeScanningResult) => {
    if (scanned) return;
    setScanned(true);

    const trimmed = data.trim();
    if (!trimmed || trimmed === "empty") {
      setResult(`Ongeldig ID: "${trimmed}"\nInvalid ID\n\u0645\u0639\u0631\u0651\u0641 \u063a\u064a\u0631 \u0635\u0627\u0644\u062d`);
      return;
    }

    // Resolve by lookup, not by format. lookupUser -> getUserByPublicId already
    // matches every live user format; a hit is an adult (partner), a miss means
    // it is not a user account, so treat it as a child public ID.
    try {
      const user = await utils.links.lookupUser.fetch({ publicId: trimmed });
      if (user) {
        linkPartner.mutate({ partnerPublicId: trimmed, relationship: "partner" });
      } else {
        linkChild.mutate({ childPublicId: trimmed, relationship: "parent" });
      }
    } catch (e: any) {
      setResult(`Fout / Error: ${e?.message || "lookup"}`);
    }
  };

  // Web fallback - camera not available
  if (Platform.OS === "web") {
    return (
      <ScreenContainer className="p-6">
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: "bold", color: colors.foreground, textAlign: "center" }}>
            QR Scanner
          </Text>
          <Text style={{ fontSize: 14, color: colors.muted, textAlign: "center" }}>
            De QR-scanner is alleen beschikbaar op mobiele apparaten.{"\n"}
            QR scanner is only available on mobile devices.{"\n"}
            ماسح QR متاح فقط على الأجهزة المحمولة.
          </Text>
          <Text style={{ fontSize: 13, color: colors.muted, textAlign: "center" }}>
            Voer het kind-ID handmatig in via het ID-beheerscherm.{"\n"}
            Enter the child ID manually via the ID management screen.
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24, marginTop: 16 }}
          >
            <Text style={{ color: "#fff", fontWeight: "600" }}>Terug / Back / رجوع</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  if (!permission) {
    return (
      <ScreenContainer className="p-6">
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: colors.muted }}>Camera laden...</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (!permission.granted) {
    return (
      <ScreenContainer className="p-6">
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16 }}>
          <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground, textAlign: "center" }}>
            Camera-toegang nodig{"\n"}Camera access needed{"\n"}يلزم الوصول إلى الكاميرا
          </Text>
          <Text style={{ fontSize: 13, color: colors.muted, textAlign: "center" }}>
            Om QR-codes te scannen heeft de app toegang tot je camera nodig.{"\n"}
            To scan QR codes, the app needs camera access.
          </Text>
          <TouchableOpacity
            onPress={requestPermission}
            style={{ backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24 }}
          >
            <Text style={{ color: "#fff", fontWeight: "600" }}>Toestemming geven / Grant permission</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ color: colors.primary, fontSize: 14 }}>Terug / Back</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      {!scanned ? (
        <CameraView
          style={{ flex: 1 }}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={handleBarcode}
        >
          {/* Overlay */}
          <View style={{ flex: 1, justifyContent: "space-between" }}>
            {/* Top bar */}
            <View style={{ paddingTop: 60, paddingHorizontal: 20, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <TouchableOpacity onPress={() => router.back()}>
                <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>← Terug</Text>
              </TouchableOpacity>
              <Text style={{ color: "#fff", fontSize: 14, fontWeight: "500" }}>QR Scanner</Text>
            </View>

            {/* Center frame */}
            <View style={{ alignItems: "center" }}>
              <View style={{ width: 240, height: 240, borderWidth: 3, borderColor: colors.primary, borderRadius: 16 }} />
              <Text style={{ color: "#fff", fontSize: 13, marginTop: 16, textAlign: "center" }}>
                Richt de camera op een QR-code{"\n"}
                Point camera at a QR code{"\n"}
                وجّه الكاميرا نحو رمز QR
              </Text>
            </View>

            {/* Bottom spacer */}
            <View style={{ height: 100 }} />
          </View>
        </CameraView>
      ) : (
        <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: 24, gap: 16 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: result?.startsWith("Fout") || result?.startsWith("Ongeldig") ? colors.error + "20" : colors.success + "20", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 28 }}>
              {result?.startsWith("Fout") || result?.startsWith("Ongeldig") ? "✗" : "✓"}
            </Text>
          </View>
          <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground, textAlign: "center" }}>
            {result || "Verwerken..."}
          </Text>
          <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
            <TouchableOpacity
              onPress={() => { setScanned(false); setResult(null); }}
              style={{ backgroundColor: colors.surface, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 20, borderWidth: 1, borderColor: colors.border }}
            >
              <Text style={{ color: colors.foreground, fontWeight: "600" }}>Opnieuw scannen / Scan again</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.back()}
              style={{ backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 20 }}
            >
              <Text style={{ color: "#fff", fontWeight: "600" }}>Klaar / Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}
