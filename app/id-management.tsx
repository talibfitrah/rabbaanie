import { useState, useEffect, useCallback } from "react";
import { Text, View, TouchableOpacity, TextInput, ScrollView, ActivityIndicator, Alert, Platform, Modal,
  KeyboardAvoidingView,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useRouter } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import { DatePicker } from "@/components/date-picker";

/**
 * ID Management & Parent-Child Linking Screen
 * 
 * Features:
 * - View your own public ID (UXXXX-YYYYMMDD)
 * - Generate your ID by entering birth date
 * - View children's IDs (KXXXX-YYYYMMDD)
 * - Link an existing child by entering their public ID
 * - View linked parents for each child
 * - Send direct messages to co-parents
 */
export default function IdManagementScreen() {
  const colors = useColors();
  const router = useRouter();
  const [birthDate, setBirthDate] = useState("");
  const [childPublicId, setChildPublicId] = useState("");
  const [relationship, setRelationship] = useState("parent");
  const [linking, setLinking] = useState(false);
  const [linkResult, setLinkResult] = useState<string | null>(null);

  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [qrValue, setQrValue] = useState("");
  const [qrLabel, setQrLabel] = useState("");

  const showQr = (value: string, label: string) => {
    setQrValue(value);
    setQrLabel(label);
    setQrModalVisible(true);
  };

  // Fetch user's public ID
  const myIdQuery = trpc.links.getMyId.useQuery();
  // Fetch linked children
  const linkedChildrenQuery = trpc.links.myLinkedChildren.useQuery();
  // Generate ID mutation
  const generateMyId = trpc.links.generateMyId.useMutation({
    onSuccess: () => { myIdQuery.refetch(); },
  });
  // Link child mutation
  const linkChild = trpc.links.linkChildByPublicId.useMutation({
    onSuccess: (data) => {
      setLinkResult(`Gekoppeld aan: ${data.childName}`);
      setChildPublicId("");
      linkedChildrenQuery.refetch();
    },
    onError: (err) => {
      setLinkResult(`Fout: ${err.message}`);
    },
  });

  const handleGenerateId = () => {
    if (!birthDate || !birthDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      Alert.alert("Verplicht / Required / مطلوب", "Kies uw geboortedatum\nSelect your birth date\nاختر تاريخ ميلادك");
      return;
    }
    generateMyId.mutate({ birthDate });
  };

  const handleLinkChild = () => {
    if (!childPublicId.trim()) return;
    setLinking(true);
    setLinkResult(null);
    linkChild.mutate({ childPublicId: childPublicId.trim(), relationship });
    setLinking(false);
  };

  return (
    <ScreenContainer className="p-4">
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Header */}
        <View style={{ marginBottom: 24 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 12 }}>
            <Text style={{ color: colors.primary, fontSize: 16 }}>{"← Terug / Back / رجوع"}</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 24, fontWeight: "bold", color: colors.foreground }}>
            Mijn ID & Koppelingen
          </Text>
          <Text style={{ fontSize: 14, color: colors.muted, marginTop: 4 }}>
            My ID & Links / معرّفي والروابط
          </Text>
        </View>

        {/* My Public ID Section */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>
            Mijn ID / My ID / معرّفي
          </Text>
          
          {myIdQuery.data?.publicId ? (
            <View style={{ alignItems: "center", gap: 8 }}>
              <View style={{ backgroundColor: colors.primary + "15", borderRadius: 12, paddingVertical: 16, paddingHorizontal: 24, borderWidth: 2, borderColor: colors.primary }}>
                <Text style={{ fontSize: 22, fontWeight: "bold", color: colors.primary, letterSpacing: 2, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}>
                  {myIdQuery.data.publicId}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => showQr(myIdQuery.data!.publicId!, `Mijn ID / My ID`)}
                style={{ backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20, marginTop: 8 }}
              >
                <Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>QR-code tonen / Show QR</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 12, color: colors.muted, textAlign: "center", marginTop: 4 }}>
                Deel dit ID of de QR-code met de andere ouder{"\n"}
                Share this ID or QR code with the other parent{"\n"}
                شارك هذا المعرّف أو رمز QR مع الوالد الآخر
              </Text>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              <Text style={{ fontSize: 13, color: colors.muted }}>
                Voer je geboortedatum in om je unieke ID te genereren:{"\n"}
                Enter your birth date to generate your unique ID:{"\n"}
                أدخل تاريخ ميلادك لإنشاء معرّفك الفريد:
              </Text>
              <DatePicker
                value={birthDate}
                onChange={setBirthDate}
                placeholder="Kies uw geboortedatum / Select your birth date / اختر تاريخ ميلادك"
                maxDate={new Date(2010, 11, 31)}
                minDate={new Date(1940, 0, 1)}
              />
              <TouchableOpacity
                onPress={handleGenerateId}
                disabled={generateMyId.isPending}
                style={{
                  backgroundColor: colors.primary,
                  paddingVertical: 14,
                  borderRadius: 10,
                  alignItems: "center",
                  opacity: generateMyId.isPending ? 0.7 : 1,
                }}
              >
                {generateMyId.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
                    ID Genereren / Generate ID / إنشاء المعرّف
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Link Child Section */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 8 }}>
            Kind koppelen / Link Child / ربط طفل
          </Text>
          <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 12 }}>
            Voer het ID van het kind in of scan de QR-code:{"\n"}
            {"Enter the child's ID or scan the QR code:"}{"\n"}
            أدخل معرّف الطفل أو امسح رمز QR:
          </Text>

          {/* QR Scanner Button */}
          <TouchableOpacity
            onPress={() => router.push("/qr-scanner")}
            style={{ backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 14, alignItems: "center", marginBottom: 12, flexDirection: "row", justifyContent: "center", gap: 8 }}
          >
            <Text style={{ color: "#fff", fontSize: 18 }}>📷</Text>
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
              QR-code scannen / Scan QR code
            </Text>
          </TouchableOpacity>

          <Text style={{ fontSize: 12, color: colors.muted, textAlign: "center", marginBottom: 12 }}>
            — of voer handmatig in / or enter manually —
          </Text>

          <TextInput
            value={childPublicId}
            onChangeText={setChildPublicId}
            placeholder="K0001-20180722"
            placeholderTextColor={colors.muted}
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 10,
              padding: 14,
              fontSize: 16,
              color: colors.foreground,
              backgroundColor: colors.background,
              fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
              marginBottom: 12,
            }}
          />

          {/* Relationship selector */}
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            {[
              { value: "biological_father", label: "Vader / Father / أب" },
              { value: "biological_mother", label: "Moeder / Mother / أم" },
              { value: "stepfather", label: "Stiefvader / Stepfather / زوج الأم" },
              { value: "stepmother", label: "Stiefmoeder / Stepmother / زوجة الأب" },
              { value: "guardian", label: "Voogd / Guardian / وصي" },
            ].map((opt) => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => setRelationship(opt.value)}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 8,
                  borderWidth: 1.5,
                  borderColor: relationship === opt.value ? colors.primary : colors.border,
                  backgroundColor: relationship === opt.value ? colors.primary + "15" : "transparent",
                }}
              >
                <Text style={{ fontSize: 12, color: relationship === opt.value ? colors.primary : colors.muted, fontWeight: relationship === opt.value ? "600" : "400" }}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            onPress={handleLinkChild}
            disabled={linking || !childPublicId.trim()}
            style={{
              backgroundColor: colors.primary,
              paddingVertical: 14,
              borderRadius: 10,
              alignItems: "center",
              opacity: !childPublicId.trim() ? 0.5 : 1,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
              Koppelen / Link / ربط
            </Text>
          </TouchableOpacity>

          {linkResult && (
            <Text style={{ marginTop: 10, fontSize: 14, color: linkResult.startsWith("Fout") ? colors.error : colors.success, textAlign: "center" }}>
              {linkResult}
            </Text>
          )}
        </View>

        {/* Linked Children List */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>
            Mijn kinderen / My Children / أطفالي
          </Text>

          {linkedChildrenQuery.isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : linkedChildrenQuery.data && linkedChildrenQuery.data.length > 0 ? (
            <View style={{ gap: 12 }}>
              {linkedChildrenQuery.data.map((child: any) => (
                <ChildCard key={child.id} child={child} colors={colors} onShowQr={showQr} />
              ))}
            </View>
          ) : (
            <Text style={{ fontSize: 13, color: colors.muted, textAlign: "center", paddingVertical: 20 }}>
              Nog geen kinderen gekoppeld{"\n"}
              No children linked yet{"\n"}
              لم يتم ربط أطفال بعد
            </Text>
          )}
        </View>
      </ScrollView>

      {/* QR Code Modal */}
      <Modal visible={qrModalVisible} transparent animationType="fade" onRequestClose={() => setQrModalVisible(false)}
        supportedOrientations={["portrait", "portrait-upside-down", "landscape"]}>
        {/* ScrollView: fixed-height card + landscape clips the close button. See components/prayer-popup-modal.tsx. */}
        <ScrollView
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)" }}
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", alignItems: "center" }}
        >
          <View style={{ backgroundColor: colors.background, borderRadius: 20, padding: 32, alignItems: "center", width: 300, gap: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, textAlign: "center" }}>
              {qrLabel}
            </Text>
            <View style={{ backgroundColor: "#fff", padding: 16, borderRadius: 12 }}>
              <QRCode value={qrValue || "empty"} size={180} />
            </View>
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.primary, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}>
              {qrValue}
            </Text>
            <Text style={{ fontSize: 11, color: colors.muted, textAlign: "center" }}>
              Laat de andere ouder deze QR-code scannen{"\n"}
              Let the other parent scan this QR code{"\n"}
              اجعل الوالد الآخر يمسح رمز QR هذا
            </Text>
            <TouchableOpacity
              onPress={() => setQrModalVisible(false)}
              style={{ backgroundColor: colors.surface, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24, borderWidth: 1, borderColor: colors.border }}
            >
              <Text style={{ color: colors.foreground, fontWeight: "600" }}>Sluiten / Close / إغلاق</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </Modal>
    </ScreenContainer>
  );
}

function ChildCard({ child, colors, onShowQr }: { child: any; colors: any; onShowQr: (value: string, label: string) => void }) {
  const childParentsQuery = trpc.links.childParents.useQuery({ childId: child.id });

  return (
    <View style={{ backgroundColor: colors.background, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>{child.name}</Text>
          <Text style={{ fontSize: 12, color: colors.muted }}>
            {child.birthDate || "Geen geboortedatum"}
          </Text>
        </View>
        {child.publicId && (
          <TouchableOpacity
            onPress={() => onShowQr(child.publicId, `${child.name} - QR`)}
            style={{ backgroundColor: colors.primary + "15", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 4 }}
          >
            <Text style={{ fontSize: 11, fontWeight: "600", color: colors.primary, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}>
              {child.publicId}
            </Text>
            <Text style={{ fontSize: 10, color: colors.primary }}>QR</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Show linked parents */}
      {childParentsQuery.data && childParentsQuery.data.length > 0 && (
        <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
          <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 4 }}>
            Gekoppelde ouders / Linked parents / الوالدان المرتبطان:
          </Text>
          {childParentsQuery.data.map((parent: any) => (
            <View key={parent.id} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: parent.link?.confirmed ? colors.success : colors.warning }} />
              <Text style={{ fontSize: 12, color: colors.foreground }}>
                {parent.name || "Onbekend"} ({parent.link?.relationship || "ouder"})
              </Text>
              {parent.publicId && (
                <Text style={{ fontSize: 10, color: colors.muted, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}>
                  {parent.publicId}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
