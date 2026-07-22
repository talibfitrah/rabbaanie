import { useState, useEffect, useCallback } from "react";
import {
  Text,
  View,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
  FlatList,
  KeyboardAvoidingView,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { useRouter } from "expo-router";
import { useAppState } from "@/lib/app-context";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/use-auth";
import {
  NetworkPerson,
  NetworkCategory,
  loadNetwork,
  addNetworkPerson,
  removeNetworkPerson,
  getByCategory,
  generatePersonId,
} from "@/lib/network-store";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { DatePicker } from "@/components/date-picker";
import QRCode from "react-native-qrcode-svg";

type Tab = "id" | "parents" | "teachers" | "scholars" | "doctors";

const CATEGORY_ICONS: Record<Tab, string> = {
  id: "fingerprint",
  parents: "people",
  teachers: "menu-book",
  scholars: "menu-book",
  doctors: "nightlight-round",
};

export default function FamilyHubScreen() {
  const colors = useColors();
  const { t, language, isRTL } = useI18n();
  const router = useRouter();
  const { state } = useAppState();
  const { isAuthenticated } = useAuth();

  const [activeTab, setActiveTab] = useState<Tab>("id");
  const [contacts, setContacts] = useState<NetworkPerson[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [qrValue, setQrValue] = useState("");
  const [qrLabel, setQrLabel] = useState("");

  // Form state - ID-only lookup
  const [formPublicId, setFormPublicId] = useState("");
  const [lookupResult, setLookupResult] = useState<{ id: number; name: string | null; publicId: string | null; role: string } | null>(null);
  const [lookupError, setLookupError] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);

  // Load contacts
  useEffect(() => {
    loadNetwork().then(setContacts);
  }, []);

  // Server queries (only if authenticated)
  const myIdQuery = trpc.links.getMyId.useQuery(undefined, { enabled: isAuthenticated });
  const linkedChildrenQuery = trpc.links.myLinkedChildren.useQuery(undefined, { enabled: isAuthenticated });
  const generateMyId = trpc.links.generateMyId.useMutation({
    onSuccess: () => { myIdQuery.refetch(); },
  });

  const [birthDateInput, setBirthDateInput] = useState("");

  const handleGenerateId = () => {
    if (!birthDateInput || !birthDateInput.match(/^\d{4}-\d{2}-\d{2}$/)) {
      Alert.alert(
        language === "ar" ? "مطلوب" : language === "en" ? "Required" : "Verplicht",
        language === "ar" ? "اختر تاريخ ميلادك" : language === "en" ? "Select your birth date" : "Kies uw geboortedatum"
      );
      return;
    }
    generateMyId.mutate({ birthDate: birthDateInput });
  };

  const showQr = (value: string, label: string) => {
    setQrValue(value);
    setQrLabel(label);
    setQrModalVisible(true);
  };

  const lookupUserMutation = trpc.links.lookupUser.useQuery(
    { publicId: formPublicId.trim() },
    { enabled: false }
  );

  const handleLookupPerson = async () => {
    if (!formPublicId.trim()) {
      setLookupError(language === "ar" ? "أدخل الرمز المميز" : language === "en" ? "Enter the unique code" : "Voer de unieke code in");
      return;
    }
    setLookupLoading(true);
    setLookupError("");
    setLookupResult(null);
    try {
      const result = await lookupUserMutation.refetch();
      if (result.data) {
        setLookupResult(result.data);
      } else {
        setLookupError(language === "ar" ? "لم يتم العثور على شخص بهذا الرقم" : language === "en" ? "No person found with this ID" : "Geen persoon gevonden met dit ID");
      }
    } catch (e) {
      setLookupError(language === "ar" ? "خطأ في البحث" : language === "en" ? "Search error" : "Zoekfout");
    }
    setLookupLoading(false);
  };

  const handleAddPerson = async () => {
    if (!lookupResult) return;
    const category: NetworkCategory = activeTab === "id" ? "parents" : activeTab as NetworkCategory;
    const person: NetworkPerson = {
      id: generatePersonId(),
      category,
      name: lookupResult.name || "",
      specialization: lookupResult.role || "",
      institution: "",
      contact: "",
      notes: "",
      publicId: lookupResult.publicId || undefined,
      createdAt: new Date().toISOString(),
    };
    const updated = await addNetworkPerson(person);
    setContacts(updated);
    resetForm();
  };

  const handleRemovePerson = async (id: string) => {
    Alert.alert(
      t("network.delete"),
      language === "ar" ? "هل أنت متأكد؟" : language === "en" ? "Are you sure?" : "Weet u het zeker?",
      [
        { text: language === "ar" ? "إلغاء" : language === "en" ? "Cancel" : "Annuleren", style: "cancel" },
        {
          text: t("network.delete"),
          style: "destructive",
          onPress: async () => {
            const updated = await removeNetworkPerson(id);
            setContacts(updated);
          },
        },
      ]
    );
  };

  const resetForm = () => {
    setFormPublicId("");
    setLookupResult(null);
    setLookupError("");
    setShowAddForm(false);
  };

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: "id", label: t("network.my_id"), icon: "fingerprint" },
    { key: "parents", label: t("network.parents"), icon: "people" },
    { key: "teachers", label: t("network.teachers"), icon: "menu-book" },
    { key: "scholars", label: t("network.scholars"), icon: "menu-book" },
    { key: "doctors", label: t("network.doctors"), icon: "nightlight-round" },
  ];

  const filteredContacts = activeTab === "id" ? [] : getByCategory(contacts, activeTab as NetworkCategory);

  // Local children IDs (from local state)
  const localChildren = state.children || [];

  return (
    <ScreenContainer className="p-0">
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 }}>
            <Text style={{ fontSize: 22, fontWeight: "bold", color: colors.foreground, flex: 1, textAlign: isRTL ? "right" : "left" }}>
              {t("network.title")}
            </Text>
          </View>
          <Text style={{ fontSize: 13, color: colors.muted, paddingLeft: isRTL ? 0 : 40, paddingRight: isRTL ? 40 : 0, textAlign: isRTL ? "right" : "left" }}>
            {t("network.subtitle")}
          </Text>
        </View>

        {/* Tab Bar */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 12 }}>
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => { setActiveTab(tab.key); setShowAddForm(false); }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: 20,
                backgroundColor: activeTab === tab.key ? colors.primary : colors.surface,
                borderWidth: 1,
                borderColor: activeTab === tab.key ? colors.primary : colors.border,
              }}
            >
              <MaterialIcons name={tab.icon as any} size={16} color={activeTab === tab.key ? "#fff" : colors.muted} />
              <Text style={{ fontSize: 12, fontWeight: "600", color: activeTab === tab.key ? "#fff" : colors.foreground }}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Content */}
        <View style={{ paddingHorizontal: 20 }}>
          {activeTab === "id" ? (
            <IdSection
              colors={colors}
              language={language}
              isRTL={isRTL}
              isAuthenticated={isAuthenticated}
              myIdQuery={myIdQuery}
              generateMyId={generateMyId}
              birthDateInput={birthDateInput}
              setBirthDateInput={setBirthDateInput}
              handleGenerateId={handleGenerateId}
              linkedChildrenQuery={linkedChildrenQuery}
              localChildren={localChildren}
              showQr={showQr}
              router={router}
              t={t}
            />
          ) : (
            <ContactsSection
              colors={colors}
              language={language}
              isRTL={isRTL}
              contacts={filteredContacts}
              category={activeTab as NetworkCategory}
              showAddForm={showAddForm}
              setShowAddForm={setShowAddForm}
              formPublicId={formPublicId}
              setFormPublicId={setFormPublicId}
              lookupResult={lookupResult}
              lookupError={lookupError}
              lookupLoading={lookupLoading}
              handleLookupPerson={handleLookupPerson}
              handleAddPerson={handleAddPerson}
              handleRemovePerson={handleRemovePerson}
              resetForm={resetForm}
              t={t}
            />
          )}
        </View>
      </ScrollView>

      {/* QR Code Modal */}
      <Modal visible={qrModalVisible} transparent animationType="fade" onRequestClose={() => setQrModalVisible(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center" }}>
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
              {language === "ar" ? "اجعل الشخص الآخر يمسح هذا الرمز" : language === "en" ? "Let the other person scan this code" : "Laat de andere persoon deze code scannen"}
            </Text>
            <TouchableOpacity
              onPress={() => setQrModalVisible(false)}
              style={{ backgroundColor: colors.surface, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24, borderWidth: 1, borderColor: colors.border }}
            >
              <Text style={{ color: colors.foreground, fontWeight: "600" }}>
                {language === "ar" ? "إغلاق" : language === "en" ? "Close" : "Sluiten"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

// ============ ID HELPERS ============

const DAY_LETTERS = ["ZO", "MA", "DI", "WO", "DO", "VR", "ZA"];

function getChildIdString(birthDate: string, idx: number): string {
  const datePart = birthDate.replace(/-/g, "");
  const dayLetter = DAY_LETTERS[new Date(birthDate).getDay()];
  const seqPart = String(idx + 1).padStart(3, "0");
  return `${datePart}_${dayLetter}_${seqPart}`;
}

// ============ ID SECTION ============

function IdSection({
  colors, language, isRTL, isAuthenticated, myIdQuery, generateMyId,
  birthDateInput, setBirthDateInput, handleGenerateId, linkedChildrenQuery,
  localChildren, showQr, router, t,
}: any) {
  return (
    <View style={{ gap: 16 }}>
      {/* My ID Card */}
      <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: colors.border }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary + "15", alignItems: "center", justifyContent: "center" }}>
            <MaterialIcons name="fingerprint" size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>
              {t("network.my_id")}
            </Text>
            <Text style={{ fontSize: 11, color: colors.muted }}>
              {t("network.id_format_info")}
            </Text>
          </View>
        </View>

        {isAuthenticated && myIdQuery.data?.publicId ? (
          <View style={{ alignItems: "center", gap: 10 }}>
            <View style={{ backgroundColor: colors.primary + "10", borderRadius: 12, paddingVertical: 14, paddingHorizontal: 24, borderWidth: 2, borderColor: colors.primary, borderStyle: "dashed" }}>
              <Text style={{ fontSize: 20, fontWeight: "bold", color: colors.primary, letterSpacing: 2, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}>
                {myIdQuery.data.publicId}
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                onPress={() => showQr(myIdQuery.data!.publicId!, t("network.my_id"))}
                style={{ backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <MaterialIcons name="qr-code" size={16} color="#fff" />
                <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>{t("network.share_qr")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.push("/qr-scanner")}
                style={{ backgroundColor: colors.surface, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.primary, flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <MaterialIcons name="qr-code-scanner" size={16} color={colors.primary} />
                <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 13 }}>{t("network.scan_qr")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : isAuthenticated ? (
          <View style={{ gap: 12 }}>
            <Text style={{ fontSize: 13, color: colors.muted }}>
              {language === "ar" ? "أدخل تاريخ ميلادك لإنشاء رمزك المميز:" : language === "en" ? "Enter your birth date to generate your unique code:" : "Voer uw geboortedatum in om uw unieke code te genereren:"}
            </Text>
            <DatePicker
              value={birthDateInput}
              onChange={setBirthDateInput}
              placeholder={language === "ar" ? "اختر تاريخ ميلادك" : language === "en" ? "Select your birth date" : "Kies uw geboortedatum"}
              isRTL={language === "ar"}
              maxDate={new Date(2010, 11, 31)}
              minDate={new Date(1940, 0, 1)}
            />
            <TouchableOpacity
              onPress={handleGenerateId}
              disabled={generateMyId.isPending}
              style={{ backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 10, alignItems: "center", opacity: generateMyId.isPending ? 0.7 : 1 }}
            >
              {generateMyId.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
                  {language === "ar" ? "إنشاء الرمز" : language === "en" ? "Generate Code" : "Code Genereren"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ alignItems: "center", paddingVertical: 16 }}>
            <Text style={{ fontSize: 13, color: colors.muted, textAlign: "center" }}>
              {language === "ar" ? "سجّل الدخول لإنشاء رمزك المميز" : language === "en" ? "Sign in to generate your unique code" : "Log in om uw unieke code te genereren"}
            </Text>
          </View>
        )}
      </View>

      {/* Children IDs */}
      <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: colors.border }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <MaterialIcons name="child-care" size={20} color={colors.primary} />
          <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>
            {t("network.child_id")}
          </Text>
        </View>

        {localChildren.length > 0 ? (
          <View style={{ gap: 10 }}>
            {localChildren.map((child: any, idx: number) => (
              <View key={child.id} style={{ backgroundColor: colors.background, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                    {child.name || `Kind ${idx + 1}`}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.muted }}>
                    {child.birthDate || (language === "ar" ? "لا تاريخ ميلاد" : language === "en" ? "No birth date" : "Geen geboortedatum")}
                  </Text>
                  {child.birthDate && (
                    <Text style={{ fontSize: 12, color: colors.primary, fontWeight: "600", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", marginTop: 4 }}>
                      {getChildIdString(child.birthDate, idx)}
                    </Text>
                  )}
                </View>
                {child.birthDate && (
                  <TouchableOpacity
                    onPress={() => showQr(getChildIdString(child.birthDate, idx), `${child.name || "Kind"} - QR`)}
                    style={{ backgroundColor: colors.primary + "15", borderRadius: 8, padding: 8 }}
                  >
                    <MaterialIcons name="qr-code" size={18} color={colors.primary} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        ) : (
          <Text style={{ fontSize: 13, color: colors.muted, textAlign: "center", paddingVertical: 12 }}>
            {language === "ar" ? "لم تتم إضافة أطفال بعد" : language === "en" ? "No children added yet" : "Nog geen kinderen toegevoegd"}
          </Text>
        )}
      </View>

      {/* Partner linking is only available in the Network (شبكتي) tab */}
    </View>
  );
}

// Partner link section removed - only available in messages.tsx (شبكتي tab)
// This prevents duplicate partner linking from multiple entry points

// ============ CONTACTS SECTION ============

function ContactsSection({
  colors, language, isRTL, contacts, category, showAddForm, setShowAddForm,
  formPublicId, setFormPublicId,
  lookupResult, lookupError, lookupLoading,
  handleLookupPerson, handleAddPerson, handleRemovePerson, resetForm, t,
}: any) {
  const categoryLabels: Record<NetworkCategory, { icon: string }> = {
    parents: { icon: "people" },
    teachers: { icon: "menu-book" },
    scholars: { icon: "menu-book" },
    doctors: { icon: "nightlight-round" },
  };

  const info = categoryLabels[category as NetworkCategory] || categoryLabels.teachers;

  return (
    <View style={{ gap: 16 }}>
      {/* Add button */}
      <TouchableOpacity
        onPress={() => setShowAddForm(!showAddForm)}
        style={{ backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}
      >
        <MaterialIcons name={showAddForm ? "close" : "add"} size={20} color="#fff" />
        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
          {showAddForm ? (language === "ar" ? "إلغاء" : language === "en" ? "Cancel" : "Annuleren") : t("network.add_person")}
        </Text>
      </TouchableOpacity>

      {/* ID Lookup Form */}
      {showAddForm && (
        <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: colors.border, gap: 14 }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>
            {language === "ar" ? "أدخل الرمز المميز للشخص" : language === "en" ? "Enter the person's unique code" : "Voer de unieke code van de persoon in"}
          </Text>
          <Text style={{ fontSize: 12, color: colors.muted, textAlign: isRTL ? "right" : "left" }}>
            {language === "ar" ? "سيتم البحث عن الشخص في الشبكة العامة للتطبيق" : language === "en" ? "The person will be searched in the app's public network" : "De persoon wordt gezocht in het openbare netwerk van de app"}
          </Text>
          <TextInput
            value={formPublicId}
            onChangeText={setFormPublicId}
            placeholder={language === "ar" ? "الرمز المميز" : language === "en" ? "Unique Code" : "Unieke code"}
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            returnKeyType="search"
            onSubmitEditing={handleLookupPerson}
            style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 14, fontSize: 16, color: colors.foreground, backgroundColor: colors.background, textAlign: isRTL ? "right" : "left", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}
          />
          
          <TouchableOpacity
            onPress={handleLookupPerson}
            disabled={lookupLoading}
            style={{ backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 14, alignItems: "center", opacity: lookupLoading ? 0.6 : 1 }}
          >
            {lookupLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
                {language === "ar" ? "بحث" : language === "en" ? "Search" : "Zoeken"}
              </Text>
            )}
          </TouchableOpacity>

          {/* Lookup Error */}
          {lookupError ? (
            <View style={{ backgroundColor: colors.error + "15", borderRadius: 8, padding: 10 }}>
              <Text style={{ color: colors.error, fontSize: 13, textAlign: "center" }}>{lookupError}</Text>
            </View>
          ) : null}

          {/* Lookup Result */}
          {lookupResult && (
            <View style={{ backgroundColor: colors.success + "10", borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.success + "40", gap: 8 }}>
              <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 10 }}>
                <MaterialIcons name="check-circle" size={24} color={colors.success} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>{lookupResult.name || (language === "ar" ? "مستخدم" : "User")}</Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>{lookupResult.role}</Text>
                  <Text style={{ fontSize: 11, color: colors.primary, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}>ID: {lookupResult.publicId}</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={handleAddPerson}
                style={{ backgroundColor: colors.success, borderRadius: 10, paddingVertical: 12, alignItems: "center", marginTop: 4 }}
              >
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
                  {language === "ar" ? "إضافة إلى شبكتي" : language === "en" ? "Add to my network" : "Toevoegen aan mijn netwerk"}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Contact List */}
      {contacts.length > 0 ? (
        <View style={{ gap: 10 }}>
          {contacts.map((person: NetworkPerson) => (
            <View key={person.id} style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border }}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>{person.name}</Text>
                  {person.specialization ? (
                    <Text style={{ fontSize: 12, color: colors.primary }}>{person.specialization}</Text>
                  ) : null}
                  {person.publicId ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <MaterialIcons name="fingerprint" size={12} color={colors.primary} />
                      <Text style={{ fontSize: 12, color: colors.primary, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}>{person.publicId}</Text>
                    </View>
                  ) : null}
                </View>
                <TouchableOpacity
                  onPress={() => handleRemovePerson(person.id)}
                  style={{ padding: 6 }}
                >
                  <MaterialIcons name="delete-outline" size={20} color={colors.error} />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      ) : !showAddForm ? (
        <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 32, alignItems: "center", borderWidth: 1, borderColor: colors.border }}>
          <MaterialIcons name={info.icon as any} size={40} color={colors.muted + "60"} />
          <Text style={{ fontSize: 14, color: colors.muted, marginTop: 12, textAlign: "center" }}>
            {t("network.no_persons")}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
