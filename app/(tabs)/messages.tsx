import { useState, useEffect, useCallback, useRef } from "react";
import { useI18n } from "@/lib/i18n";
import { useAppState } from "@/lib/app-context";
import {
  Text,
  View,
  TouchableOpacity,
  TextInput,
  FlatList,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
  Share,
  Switch,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import QRCode from "react-native-qrcode-svg";
import {
  NetworkPerson,
  NetworkCategory,
  loadNetwork,
  addNetworkPerson,
  removeNetworkPerson,
  getByCategory,
  generatePersonId,
} from "@/lib/network-store";
import { DatePicker } from "@/components/date-picker";
import { SpouseVisibilityNotice } from "@/components/form-field";
import { SyncToast } from "@/components/sync-toast";
import { PremiumGate } from "@/components/premium-notice";
import { syncRefusedMessage } from "@/lib/sync-refusal";
import { toggleProfileAccess } from "@/lib/partner-profile-toggle";

type Tab = "id" | "parents" | "reports" | "teachers" | "scholars" | "doctors";

type ConversationType = "coparent";

interface SelectedConversation {
  type: ConversationType;
  id: number;
  name: string;
  relationship?: string;
  sharedChildren?: { id: number; name: string; publicId: string | null }[];
}

function tx(lang: string, nl: string, en: string, ar: string): string {
  return lang === "ar" ? ar : lang === "en" ? en : nl;
}

function getRelationshipLabel(relationship: string, lang: string, userGender: string, wasDivorced?: boolean): string {
  const isMale = userGender === "man";
  if (wasDivorced) {
    // R3: a former spouse who remains a co-parent of shared children — label
    // by the co-parent's gender (opposite the caller for a spouse relationship).
    return lang === "ar" ? (isMale ? "مطلَّقة" : "مطلَّق") : lang === "en" ? (isMale ? "Ex-wife" : "Ex-husband") : (isMale ? "Ex-vrouw" : "Ex-man");
  }
  if (relationship === "partner" || relationship === "parent") {
    if (isMale) {
      return lang === "ar" ? "الزوجة" : lang === "en" ? "Wife" : "Echtgenote";
    } else {
      return lang === "ar" ? "الزوج" : lang === "en" ? "Husband" : "Echtgenoot";
    }
  }
  if (relationship === "biological_mother" || relationship === "stepmother") {
    return lang === "ar" ? "الأم" : lang === "en" ? "Mother" : "Moeder";
  }
  if (relationship === "biological_father" || relationship === "stepfather") {
    return lang === "ar" ? "الأب" : lang === "en" ? "Father" : "Vader";
  }
  return lang === "ar" ? "شريك التربية" : lang === "en" ? "Co-parent" : "Mede-ouder";
}

// ============ ID HELPERS ============
const DAY_LETTERS = ["ZO", "MA", "DI", "WO", "DO", "VR", "ZA"];
function getChildIdString(birthDate: string, idx: number): string {
  const datePart = birthDate.replace(/-/g, "");
  const dayLetter = DAY_LETTERS[new Date(birthDate).getDay()];
  const seqPart = String(idx + 1).padStart(3, "0");
  return `${datePart}_${dayLetter}_${seqPart}`;
}

function MessagesScreenInner() {
  const colors = useColors();
  const { t, language, isRTL } = useI18n();
  const lang = language as string;
  const { state, rehydrateFromServer } = useAppState();
  const userGender = state.parentProfile.gender || "man";
  // The RAW value, deliberately without userGender's "man" default. That
  // default exists for the relationship labels above, but it collapses
  // "gender not recorded locally" into "man" — which is exactly the legacy
  // case the disclosure has to cover (gender living only in the server's
  // users.gender column, the case resolveGender was added for). Gating the
  // notice on userGender therefore hid it from the very women it is for.
  const knownToBeMan = state.parentProfile.gender === "man";
  const { user, isAuthenticated } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<Tab>("parents");
  const [selected, setSelected] = useState<SelectedConversation | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const flatListRef = useRef<FlatList>(null);

  // Local network contacts
  const [contacts, setContacts] = useState<NetworkPerson[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formPublicId, setFormPublicId] = useState("");
  const [lookupResult, setLookupResult] = useState<{ id: number; name: string | null; publicId: string | null; role: string } | null>(null);
  const [lookupError, setLookupError] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);

  // ID generation
  const [birthDateInput, setBirthDateInput] = useState("");
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [qrValue, setQrValue] = useState("");
  const [qrLabel, setQrLabel] = useState("");

  // Partner link
  const [partnerIdInput, setPartnerIdInput] = useState("");
  const [linkResult, setLinkResult] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  // Toast state
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState<"success" | "info" | "error">("success");
  const showToast = (msg: string, type: "success" | "info" | "error" = "success") => {
    setToastMessage(msg);
    setToastType(type);
    setToastVisible(true);
  };

  // Load contacts
  useEffect(() => {
    loadNetwork().then(setContacts);
  }, []);

  // Server queries
  const coParentsQuery = trpc.links.coParents.useQuery(undefined, { enabled: isAuthenticated, refetchOnMount: "always", staleTime: 0 });
  const myIdQuery = trpc.links.getMyId.useQuery(undefined, { enabled: isAuthenticated });
  const generateMyId = trpc.links.generateMyId.useMutation({
    onSuccess: () => { myIdQuery.refetch(); },
  });

  // Auto-refetch partner data when authentication state changes
  useEffect(() => {
    if (isAuthenticated) {
      coParentsQuery.refetch();
    }
  }, [isAuthenticated]);

  // Direct messages for conversation
  const directMessagesQuery = trpc.links.directMessages.useQuery(
    { otherParentId: selected?.id! },
    { enabled: !!selected && selected.type === "coparent", refetchInterval: 5000 }
  );

  const sendDirectMutation = trpc.links.sendDirectMessage.useMutation({
    onSuccess: () => {
      directMessagesQuery.refetch();
      setNewMessage("");
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
  });

  const markDirectReadMutation = trpc.messages.markDirectRead.useMutation();
  const syncMut = trpc.links.syncWithPartner.useMutation();

  // Mark messages as read when opening a conversation
  useEffect(() => {
    if (!selected) return;
    if (selected.type === "coparent") {
      markDirectReadMutation.mutate({ senderId: selected.id });
    }
  }, [selected?.id, selected?.type]);

  const handleSend = useCallback(() => {
    if (!newMessage.trim() || !selected) return;
    sendDirectMutation.mutate({
      recipientId: selected.id,
      content: newMessage.trim(),
      childId: selected.sharedChildren?.[0]?.id,
    });
  }, [newMessage, selected, sendDirectMutation]);

  // Partner link mutation
  const linkPartner = trpc.links.linkPartnerByPublicId.useMutation({
    onSuccess: (data) => {
      setLinkResult(
        lang === "ar"
          ? `تم إرسال طلب الربط إلى ${data.partnerName || "الشريك"}. لن تتم مشاركة البيانات حتى يتم التأكيد.`
          : lang === "en"
            ? `Link request sent to ${data.partnerName || "partner"}. No data is shared until they confirm.`
            : `Koppelverzoek verstuurd naar ${data.partnerName || "partner"}. Er worden pas gegevens gedeeld na bevestiging.`,
      );
      setLinkError(null);
      setPartnerIdInput("");
    },
    onError: (err) => {
      setLinkError(err.message);
      setLinkResult(null);
    },
  });

  const handleLinkPartner = () => {
    const trimmed = partnerIdInput.trim();
    if (!trimmed) {
      Alert.alert(
        lang === "ar" ? "مطلوب" : lang === "en" ? "Required" : "Verplicht",
        lang === "ar" ? "أدخل رقم هوية الشريك" : lang === "en" ? "Enter partner ID" : "Voer partner-ID in"
      );
      return;
    }
    linkPartner.mutate({ partnerPublicId: trimmed, relationship: "partner" });
  };

  const handleGenerateId = () => {
    if (!birthDateInput || !birthDateInput.match(/^\d{4}-\d{2}-\d{2}$/)) {
      Alert.alert(
        lang === "ar" ? "مطلوب" : lang === "en" ? "Required" : "Verplicht",
        lang === "ar" ? "اختر تاريخ ميلادك" : lang === "en" ? "Select your birth date" : "Kies uw geboortedatum"
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

  // Lookup user for adding to network
  const lookupUserQuery = trpc.links.lookupUser.useQuery(
    { publicId: formPublicId.trim() },
    { enabled: false }
  );

  const handleLookupPerson = async () => {
    if (!formPublicId.trim()) {
      setLookupError(lang === "ar" ? "أدخل الرمز المميز" : lang === "en" ? "Enter the unique code" : "Voer de unieke code in");
      return;
    }
    setLookupLoading(true);
    setLookupError("");
    setLookupResult(null);
    try {
      const result = await lookupUserQuery.refetch();
      if (result.data) {
        setLookupResult(result.data);
      } else {
        setLookupError(lang === "ar" ? "لم يتم العثور على شخص بهذا الرقم" : lang === "en" ? "No person found with this ID" : "Geen persoon gevonden met dit ID");
      }
    } catch (e) {
      setLookupError(lang === "ar" ? "خطأ في البحث" : lang === "en" ? "Search error" : "Zoekfout");
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
      lang === "ar" ? "هل أنت متأكد؟" : lang === "en" ? "Are you sure?" : "Weet u het zeker?",
      [
        { text: lang === "ar" ? "إلغاء" : lang === "en" ? "Cancel" : "Annuleren", style: "cancel" },
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

  // Network is accessible without login - sync features require auth but viewing is always available

  // ============ CONVERSATION VIEW ============
  if (selected) {
    const messages = [...(directMessagesQuery.data ?? [])].reverse();
    const isLoading = directMessagesQuery.isLoading;
    const isSending = sendDirectMutation.isPending;

    return (
      <ScreenContainer className="flex-1">
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={90}
        >
          {/* Chat Header */}
          <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface }}>
            <TouchableOpacity onPress={() => setSelected(null)} style={isRTL ? { marginLeft: 12 } : { marginRight: 12 }}>
              <MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={24} color={colors.primary} />
            </TouchableOpacity>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary + "20", alignItems: "center", justifyContent: "center", ...(isRTL ? { marginLeft: 10 } : { marginRight: 10 }) }}>
              <MaterialIcons name="person" size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: "bold", color: colors.foreground }}>{selected.name}</Text>
              <Text style={{ fontSize: 11, color: colors.primary, fontWeight: "600" }}>
                {getRelationshipLabel(selected.relationship || "partner", lang, userGender, (selected as any).wasDivorced)}
                {selected.sharedChildren && selected.sharedChildren.length > 0 && (
                  ` \u2022 ${selected.sharedChildren.map(c => c.name).join(", ")}`
                )}
              </Text>
            </View>
          </View>

          {/* Messages list */}
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item: any) => item.id.toString()}
            style={{ flex: 1, paddingHorizontal: 14 }}
            contentContainerStyle={{ paddingVertical: 12 }}
            renderItem={({ item }: { item: any }) => {
              const isMe = item.senderId === user?.id;
              const isNotification = item.type === "notification";
              const isLinkRequest = item.type === "link_request";

              if (isLinkRequest && !isMe) {
                return (
                  <View style={{ alignItems: "center", marginVertical: 10 }}>
                    <View style={{ backgroundColor: colors.primary + "10", borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, maxWidth: "90%", borderWidth: 1, borderColor: colors.primary + "30" }}>
                      <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <MaterialIcons name="person-add" size={18} color={colors.primary} />
                        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.primary }}>
                          {tx(lang, "Koppelverzoek", "Link Request", "طلب ربط")}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 12, color: colors.foreground, lineHeight: 18, marginBottom: 12 }}>
                        {item.content}
                      </Text>
                      <LinkRequestActions item={item} colors={colors} lang={lang} />
                    </View>
                  </View>
                );
              }

              if (isNotification || isLinkRequest) {
                return (
                  <View style={{ alignItems: "center", marginVertical: 8 }}>
                    <View style={{ backgroundColor: colors.warning + "20", borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14, maxWidth: "85%" }}>
                      <Text style={{ fontSize: 12, color: colors.warning, textAlign: "center" }}>
                        {item.content}
                      </Text>
                    </View>
                  </View>
                );
              }

              // Activity/interaction notifications from co-parent
              const isActivity = item.type === "activity_update" || item.type === "environment_update" || item.type === "consultation_share";
              if (isActivity) {
                return (
                  <View style={{ alignItems: "center", marginVertical: 8 }}>
                    <View style={{ backgroundColor: colors.success + "12", borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, maxWidth: "90%", borderWidth: 1, borderColor: colors.success + "30" }}>
                      <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <MaterialIcons
                          name={item.type === "activity_update" ? "check-circle" : item.type === "environment_update" ? "edit-note" : "help-outline"}
                          size={16}
                          color={colors.success}
                        />
                        <Text style={{ fontSize: 11, color: colors.success, fontWeight: "600" }}>
                          {item.type === "activity_update"
                            ? tx(lang, "Activiteit bijgewerkt", "Activity updated", "تحديث نشاط")
                            : item.type === "environment_update"
                            ? tx(lang, "Omgeving bijgewerkt", "Environment updated", "تحديث البيئة")
                            : tx(lang, "Consultatie gedeeld", "Consultation shared", "استشارة مشتركة")}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 12, color: colors.foreground, lineHeight: 18 }}>
                        {item.content}
                      </Text>
                      <Text style={{ fontSize: 9, color: colors.muted, marginTop: 4 }}>
                        {new Date(item.createdAt).toLocaleString(lang === "ar" ? "ar-SA" : lang === "en" ? "en-US" : "nl-NL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </Text>
                    </View>
                  </View>
                );
              }

              return (
                <View style={{ marginBottom: 10, alignItems: isMe !== isRTL ? "flex-end" : "flex-start" }}>
                  <View
                    style={{
                      maxWidth: "80%",
                      borderRadius: 16,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      backgroundColor: isMe ? colors.primary : colors.surface,
                      borderWidth: isMe ? 0 : 1,
                      borderColor: colors.border,
                    }}
                  >
                    <Text style={{ fontSize: 14, color: isMe ? "#fff" : colors.foreground, textAlign: isRTL ? "right" : "left" }}>
                      {item.content}
                    </Text>
                    <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: isMe ? "flex-end" : "flex-start", marginTop: 4, gap: 4 }}>
                      <Text style={{ fontSize: 9, color: isMe ? "rgba(255,255,255,0.6)" : colors.muted }}>
                        {new Date(item.createdAt).toLocaleTimeString(lang === "ar" ? "ar-SA" : lang === "en" ? "en-US" : "nl-NL", { hour: "2-digit", minute: "2-digit" })}
                      </Text>
                      {isMe && (
                        <Text style={{ fontSize: 9, color: item.isRead ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.5)" }}>
                          {item.isRead ? "\u2713\u2713" : "\u2713"}
                        </Text>
                      )}
                    </View>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              isLoading ? (
                <ActivityIndicator size="large" color={colors.primary} />
              ) : (
                <View style={{ alignItems: "center", paddingVertical: 40 }}>
                  <MaterialIcons name="chat-bubble-outline" size={48} color={colors.muted} />
                  <Text style={{ color: colors.muted, textAlign: "center", marginTop: 12 }}>
                    {tx(lang, "Nog geen berichten. Stuur het eerste bericht!", "No messages yet. Send the first message!", "لا توجد رسائل بعد. أرسل أول رسالة!")}
                  </Text>
                </View>
              )
            }
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          />

          {/* Input bar */}
          <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", padding: 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background }}>
            <TextInput
              style={{
                flex: 1,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 20,
                paddingHorizontal: 16,
                paddingVertical: 10,
                fontSize: 14,
                color: colors.foreground,
                ...(isRTL ? { marginLeft: 8 } : { marginRight: 8 }),
                textAlign: isRTL ? "right" : "left",
              }}
              placeholder={tx(lang, "Typ een bericht...", "Type a message...", "اكتب رسالة...")}
              placeholderTextColor={colors.muted}
              value={newMessage}
              onChangeText={setNewMessage}
              multiline
              maxLength={2000}
              returnKeyType="send"
              onSubmitEditing={handleSend}
            />
            <TouchableOpacity
              onPress={handleSend}
              disabled={!newMessage.trim() || isSending}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: colors.primary,
                alignItems: "center",
                justifyContent: "center",
                opacity: newMessage.trim() ? 1 : 0.5,
              }}
            >
              {isSending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <MaterialIcons name="send" size={18} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </ScreenContainer>
    );
  }

  // ============ MAIN NETWORK VIEW ============
  const coParents = coParentsQuery.data ?? [];
  const localChildren = state.children || [];
  const filteredContacts = activeTab === "id" || activeTab === "parents" || activeTab === "reports" ? [] : getByCategory(contacts, activeTab as NetworkCategory);

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: "id", label: t("network.my_id"), icon: "fingerprint" },
    { key: "parents", label: tx(lang, "Mijn gezin", "My Family", "أسرتي"), icon: "family-restroom" },
    { key: "teachers", label: t("network.teachers"), icon: "menu-book" },
    { key: "scholars", label: t("network.scholars"), icon: "menu-book" },

    { key: "doctors", label: t("network.doctors"), icon: "nightlight-round" },
  ];

  return (
    
    <ScreenContainer className="p-0">
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 24, fontWeight: "800", color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>
              {t("network.title")}
            </Text>
            <Text style={{ fontSize: 13, color: colors.muted, marginTop: 4, textAlign: isRTL ? "right" : "left" }}>
              {t("network.subtitle")}
            </Text>
          </View>
          <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 8 }}>
            <TouchableOpacity
              onPress={() => setActiveTab("reports")}
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: activeTab === "reports" ? colors.primary : colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: activeTab === "reports" ? colors.primary : colors.border }}
            >
              <MaterialIcons name="assessment" size={20} color={activeTab === "reports" ? "#fff" : colors.muted} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={async () => {
                try {
                  const result = await syncMut.mutateAsync();
                  if (result?.success) {
                    // Own catch, for the same reason the AsyncStorage write
                    // below has one: this runs AFTER a sync that succeeded, so
                    // letting a throw reach the outer catch would report
                    // "could not sync" for a merge the server already did.
                    try {
                      await rehydrateFromServer();
                    } catch {}
                    // Save sync report
                    const m = result.merged;
                    const total = (m?.children || 0) + (m?.environments || 0) + (m?.issues || 0) + (m?.actionPlans || 0);
                    try {
                      const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
                      const report = { timestamp: new Date().toISOString(), merged: m, total };
                      const existing = await AsyncStorage.getItem("sync_reports");
                      const reports = existing ? JSON.parse(existing) : [];
                      reports.unshift(report);
                      await AsyncStorage.setItem("sync_reports", JSON.stringify(reports.slice(0, 50)));
                    } catch {}
                    // Show toast with details
                    if (total > 0) {
                      const parts: string[] = [];
                      if (m?.children) parts.push(lang === "ar" ? `${m.children} \u0637\u0641\u0644` : lang === "en" ? `${m.children} child(ren)` : `${m.children} kind(eren)`);
                      if (m?.environments) parts.push(lang === "ar" ? `${m.environments} \u0628\u064a\u0626\u0629` : lang === "en" ? `${m.environments} environment(s)` : `${m.environments} omgeving(en)`);
                      if (m?.issues) parts.push(lang === "ar" ? `${m.issues} \u0645\u0634\u0643\u0644\u0629` : lang === "en" ? `${m.issues} issue(s)` : `${m.issues} probleem/problemen`);
                      if (m?.actionPlans) parts.push(lang === "ar" ? `${m.actionPlans} \u062e\u0637\u0629 \u0639\u0644\u0627\u062c` : lang === "en" ? `${m.actionPlans} plan(s)` : `${m.actionPlans} actieplan(nen)`);
                      const detail = parts.join(" + ");
                      showToast(lang === "ar" ? `\u062a\u0645\u062a \u0627\u0644\u0645\u0632\u0627\u0645\u0646\u0629: ${detail}` : lang === "en" ? `Synced: ${detail}` : `Gesynchroniseerd: ${detail}`, "success");
                    } else {
                      showToast(lang === "ar" ? "\u0643\u0644 \u0634\u064a\u0621 \u0645\u062d\u062f\u0651\u062b" : lang === "en" ? "Everything is up-to-date" : "Alles is up-to-date", "info");
                    }
                    // Inside the success branch now. It fired unconditionally,
                    // so a refusal buzzed "success" and showed nothing at all.
                    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  } else {
                    // The access gate returns success:false where this used to
                    // succeed (ungated wife, unconfirmed partnership,
                    // unresolvable gender), and there was no branch for it.
                    showToast(syncRefusedMessage(lang, result.message), "info");
                  }
                } catch {
                  // The OUTER catch — the one a rejected mutateAsync reaches.
                  // Not the inner AsyncStorage catch above: a failed local
                  // report write follows a sync that DID succeed, and saying
                  // "could not sync" there reports the wrong outcome.
                  showToast(syncRefusedMessage(lang), "info");
                }
              }}
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border }}
            >
              <MaterialIcons name="sync" size={20} color="#1B4332" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push("/network" as any)}
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border }}
            >
              <MaterialIcons name="settings" size={20} color={colors.muted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Tab Bar */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 12 }}>
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => { setActiveTab(tab.key); setShowAddForm(false); }}
              style={{
                flexDirection: isRTL ? "row-reverse" : "row",
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
          {activeTab === "id" && (
            <IdSection
              colors={colors}
              lang={lang}
              isRTL={isRTL}
              isAuthenticated={isAuthenticated}
              myIdQuery={myIdQuery}
              generateMyId={generateMyId}
              birthDateInput={birthDateInput}
              setBirthDateInput={setBirthDateInput}
              handleGenerateId={handleGenerateId}
              localChildren={localChildren}
              showQr={showQr}
              router={router}
              t={t}
            />
          )}

          {activeTab === "parents" && (
            <ParentsSection
              colors={colors}
              lang={lang}
              isRTL={isRTL}
              isAuthenticated={isAuthenticated}
              coParents={coParents}
              coParentsQuery={coParentsQuery}
              knownToBeMan={knownToBeMan}
              userGender={userGender}
              localChildren={localChildren}
              setSelected={setSelected}
              partnerIdInput={partnerIdInput}
              setPartnerIdInput={setPartnerIdInput}
              handleLinkPartner={handleLinkPartner}
              linkPartner={linkPartner}
              linkResult={linkResult}
              linkError={linkError}
              router={router}
              t={t}
            />
          )}

          {activeTab === "reports" && (
            <SyncReportsSection colors={colors} lang={lang} isRTL={isRTL} />
          )}

          {(activeTab === "teachers" || activeTab === "scholars" || activeTab === "doctors") && (
            <ContactsSection
              colors={colors}
              lang={lang}
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
              {tx(lang, "Laat de andere persoon deze code scannen", "Let the other person scan this code", "اجعل الشخص الآخر يمسح هذا الرمز")}
            </Text>
            <TouchableOpacity
              onPress={() => setQrModalVisible(false)}
              style={{ backgroundColor: colors.surface, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24, borderWidth: 1, borderColor: colors.border }}
            >
              <Text style={{ color: colors.foreground, fontWeight: "600" }}>
                {tx(lang, "Sluiten", "Close", "إغلاق")}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </Modal>
      <SyncToast
        visible={toastVisible}
        message={toastMessage}
        type={toastType}
        onHide={() => setToastVisible(false)}
      />
    </ScreenContainer>
    
  );
}

function CoParentPermissions({
  colors, lang, isRTL, setSelected,
}: { colors: any; lang: string; isRTL: boolean; setSelected: (c: SelectedConversation) => void }) {
  const familyListQuery = trpc.family.list.useQuery();
  const myFamily = (familyListQuery.data as any[])?.[0];
  const membersQuery = trpc.family.members.useQuery(
    { familyId: myFamily?.id! },
    { enabled: !!myFamily?.id },
  );
  // amFather gates the husband-only per-wife permission panels below. Computed
  // before the hooks-must-run-unconditionally guards and reused as the sole
  // isFather check (membersQuery isn't needed for the role itself). Each wife's
  // own profile-access query + grant/revoke live in WifePermissionsPanel (one
  // instance per wife) rather than here, so the split stays polygyny-correct.
  const amFather = myFamily?.membership?.role === "vader";
  // The wives are the active, confirmed partnerships (partnershipConfirmed) —
  // NOT coParents/getCoParents, which also carries divorced / never-married
  // co-parents. Those must never be offered the "access my profile + daily
  // activity" grant this panel exposes (R3: an ex sees only shared children).
  const partnersQuery = trpc.links.listPartners.useQuery(undefined, { enabled: amFather });

  if (!myFamily || !membersQuery.data) return null;
  const members = membersQuery.data as any[];
  const myUserId = myFamily.membership?.userId;
  const activeFather = members.find((m) => m.role === "vader" && !m.stubAccount);
  const myMember = members.find((m) => m.userId === myUserId);
  const myPerms = myMember?.permissions || {};

  const PERMS: Array<{ key: "canEditChildren" | "canManageGoals"; label: string }> = [
    { key: "canEditChildren", label: tx(lang, "Kinderen bewerken", "Edit children", "تعديل بيانات الأبناء") },
    { key: "canManageGoals", label: tx(lang, "Doelen beheren", "Manage goals", "إدارة الأهداف") },
  ];

  if (!activeFather) {
    return (
      <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border, marginTop: 10 }}>
        <Text style={{ fontSize: 12, color: colors.muted, textAlign: isRTL ? "right" : "left" }}>
          {tx(lang, "U heeft volledige toegang tot de gezinsgegevens.", "You have full access to the family data.", "لديك صلاحية كاملة للوصول إلى بيانات الأسرة.")}
        </Text>
      </View>
    );
  }

  if (!amFather) {
    return (
      <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border, marginTop: 10 }}>
        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 8, textAlign: isRTL ? "right" : "left" }}>
          {tx(lang, "Mijn rechten", "My permissions", "صلاحياتي")}
        </Text>
        {PERMS.map((p) => (
          <View key={p.key} style={{ flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
            <Text style={{ fontSize: 12, color: colors.foreground }}>{p.label}</Text>
            <Text style={{ fontSize: 12, fontWeight: "700", color: myPerms[p.key] !== false ? colors.success : colors.error }}>
              {myPerms[p.key] !== false ? tx(lang, "Toegestaan", "Allowed", "مسموح") : tx(lang, "Beperkt", "Restricted", "مقيّد")}
            </Text>
          </View>
        ))}
      </View>
    );
  }

  // Husband: one collapsed, name-labelled permission panel per wife — so
  // co-wife permissions are set independently and never conflated (each wife's
  // rights are folded under her own name, opened on tap). Daa3iyah's request.
  const wives = (partnersQuery.data ?? []).filter((p) => p.confirmed === true);
  if (wives.length === 0) return null;
  return (
    <View style={{ marginTop: 10, gap: 8 }}>
      <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 2, textAlign: isRTL ? "right" : "left" }}>
        {tx(lang, "Rechten per partner", "Permissions per partner", "صلاحيات كلّ زوجة")}
      </Text>
      {wives.map((wife) => (
        <WifePermissionsPanel
          key={wife.id}
          wife={wife}
          member={members.find((m) => m.userId === wife.id)}
          PERMS={PERMS}
          setSelected={setSelected}
          colors={colors}
          lang={lang}
          isRTL={isRTL}
        />
      ))}
    </View>
  );
}

function PermBadge({ allowed, colors, lang }: { allowed: boolean; colors: any; lang: string }) {
  return (
    <View style={{ backgroundColor: allowed ? colors.success + "20" : colors.error + "20", borderRadius: 8, paddingVertical: 3, paddingHorizontal: 10 }}>
      <Text style={{ fontSize: 11, fontWeight: "700", color: allowed ? colors.success : colors.error }}>
        {allowed ? tx(lang, "Toegestaan", "Allowed", "مسموح") : tx(lang, "Beperkt", "Restricted", "مقيّد")}
      </Text>
    </View>
  );
}

// One wife's permissions, folded under her name and opened on tap, so a
// polygynous husband sets each wife's rights separately. Her profile-access
// query + grant/revoke live here (one hook-set per wife) rather than in the
// parent, which is what makes the per-wife split polygyny-correct.
function WifePermissionsPanel({
  wife, member, PERMS, setSelected, colors, lang, isRTL,
}: {
  wife: { id: number; name?: string | null };
  member: any;
  PERMS: Array<{ key: "canEditChildren" | "canManageGoals"; label: string }>;
  setSelected: (c: SelectedConversation) => void;
  colors: any; lang: string; isRTL: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const perms = member?.permissions || {};
  // Own mutation per panel (not one shared from the parent) so setting one
  // wife's permission never disables another wife's toggles. Invalidates the
  // shared members query on success.
  const utils = trpc.useUtils();
  const updatePerm = (trpc.family as any).updatePermissions.useMutation({
    onSuccess: () => utils.family.members.invalidate(),
  });
  // Only fetch this wife's profile-access state once her panel is opened —
  // panels are collapsed by default, so this avoids N eager fetches on mount.
  const profileAccessQuery = trpc.links.getPartnerProfile.useQuery(
    { partnerId: wife.id },
    { enabled: !!wife.id && expanded },
  );
  const grantProfileAccess = trpc.links.grantPartnerProfileAccess.useMutation({
    onSuccess: () => profileAccessQuery.refetch(),
  });
  const revokeProfileAccess = trpc.links.revokePartnerProfileAccess.useMutation({
    onSuccess: () => profileAccessQuery.refetch(),
  });
  const profileGranted = !!profileAccessQuery.data?.grantedToPartner;
  const name = wife.name || tx(lang, "Partner", "Partner", "الزوجة");

  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
      <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10 }}>
        <TouchableOpacity
          onPress={() => setExpanded((e) => !e)}
          style={{ flex: 1, flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 }}
        >
          <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>{name}</Text>
          <MaterialIcons name={expanded ? "expand-less" : "expand-more"} size={22} color={colors.muted} />
        </TouchableOpacity>
        {/* Message this wife independently — her own private conversation. */}
        <TouchableOpacity
          onPress={() => setSelected({ type: "coparent", id: wife.id, name })}
          accessibilityLabel={tx(lang, "Bericht sturen", "Message", "مراسلة")}
          style={{ backgroundColor: colors.primary, borderRadius: 16, width: 34, height: 34, alignItems: "center", justifyContent: "center" }}
        >
          <MaterialIcons name="chat" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
      {expanded && (
        <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
          {member ? PERMS.map((p) => {
            const allowed = perms[p.key] !== false;
            return (
              <TouchableOpacity
                key={p.key}
                onPress={() => updatePerm.mutate({ memberId: member.id, [p.key]: !allowed } as any)}
                disabled={updatePerm.isPending}
                style={{ flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "center", marginTop: 6, paddingVertical: 4 }}
              >
                <Text style={{ fontSize: 12, color: colors.foreground }}>{p.label}</Text>
                <PermBadge allowed={allowed} colors={colors} lang={lang} />
              </TouchableOpacity>
            );
          }) : null}
          <View style={{ height: 1, backgroundColor: colors.border, marginTop: 10, marginBottom: 4 }} />
          <TouchableOpacity
            onPress={() => toggleProfileAccess(profileGranted, wife.id, { grant: grantProfileAccess, revoke: revokeProfileAccess })}
            disabled={grantProfileAccess.isPending || revokeProfileAccess.isPending || profileAccessQuery.isLoading}
            style={{ flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "center", marginTop: 6, paddingVertical: 4 }}
          >
            <Text style={{ fontSize: 12, color: colors.foreground, flex: 1, textAlign: isRTL ? "right" : "left" }}>
              {tx(lang, "Toegang tot mijn profiel en mijn dagelijkse activiteit", "Access to my profile and my daily activity", "الاطّلاع على ملفي الشخصي وتفاعلي اليومي")}
            </Text>
            {/* Neutral while the lazy (expand-gated) query resolves, so the badge
                never flashes a false "Restricted" before the real state loads. */}
            {profileAccessQuery.isLoading
              ? <Text style={{ fontSize: 11, fontWeight: "700", color: colors.muted }}>…</Text>
              : <PermBadge allowed={profileGranted} colors={colors} lang={lang} />}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function InvitePartnerForm({ colors, lang, isRTL, userGender }: { colors: any; lang: string; isRTL: boolean; userGender: string }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState<"biological_father" | "biological_mother">(
    userGender === "man" ? "biological_mother" : "biological_father"
  );
  // Vendored router type predates this procedure (see CoParentPermissions above).
  const invite = (trpc.family as any).invitePartner.useMutation();

  const RELATIONSHIPS: Array<{ value: "biological_father" | "biological_mother"; label: string }> = [
    { value: "biological_father", label: tx(lang, "Vader", "Father", "أب") },
    { value: "biological_mother", label: tx(lang, "Moeder", "Mother", "أم") },
  ];

  return (
    <View style={{ marginTop: 12, gap: 8 }}>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder={tx(lang, "Naam van partner", "Partner's name", "اسم الشريك")}
        placeholderTextColor={colors.muted}
        style={{ backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 14, color: colors.foreground, textAlign: isRTL ? "right" : "left" }}
      />
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder={tx(lang, "E-mailadres van partner", "Partner's email", "البريد الإلكتروني للشريك")}
        placeholderTextColor={colors.muted}
        keyboardType="email-address"
        autoCapitalize="none"
        style={{ backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 14, color: colors.foreground, textAlign: isRTL ? "right" : "left" }}
      />
      <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 8 }}>
        {RELATIONSHIPS.map((r) => (
          <TouchableOpacity
            key={r.value}
            onPress={() => setRelationship(r.value)}
            style={{ flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5, alignItems: "center", borderColor: relationship === r.value ? colors.primary : colors.border, backgroundColor: relationship === r.value ? colors.primary + "15" : "transparent" }}
          >
            <Text style={{ fontSize: 12, color: relationship === r.value ? colors.primary : colors.muted, fontWeight: relationship === r.value ? "700" : "400" }}>{r.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity
        onPress={() => invite.mutate({ email: email.trim(), name: name.trim(), relationship })}
        disabled={invite.isPending || !email.trim() || !name.trim()}
        style={{ backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 12, alignItems: "center", opacity: invite.isPending || !email.trim() || !name.trim() ? 0.6 : 1 }}
      >
        {invite.isPending ? <ActivityIndicator color="#fff" size="small" /> : (
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>{tx(lang, "Uitnodiging sturen", "Send invite", "إرسال دعوة")}</Text>
        )}
      </TouchableOpacity>
      {invite.isSuccess && (
        <Text style={{ color: colors.success, fontSize: 12, textAlign: "center" }}>{tx(lang, "Uitnodiging verstuurd!", "Invite sent!", "تم إرسال الدعوة!")}</Text>
      )}
      {invite.isError && (
        <Text style={{ color: colors.error, fontSize: 12, textAlign: "center" }}>{(invite.error as any)?.message || tx(lang, "Mislukt", "Failed", "فشل")}</Text>
      )}
    </View>
  );
}

// ============ FAMILY SECTION (أسرتي) ============
function ParentsSection({
  colors, lang, isRTL, isAuthenticated, coParents, coParentsQuery, userGender, knownToBeMan,
  localChildren, setSelected, partnerIdInput, setPartnerIdInput, handleLinkPartner, linkPartner,
  linkResult, linkError, router, t,
}: any) {
  const [showInvite, setShowInvite] = useState(false);
  const utils = trpc.useUtils();
  // Incoming partner-link requests awaiting my confirmation. This is the surface
  // that was missing: an unconfirmed request never shows in coParents and its
  // DM thread is gated, so without this the recipient got a notification but had
  // nowhere to accept it.
  const incomingRequestsQuery = trpc.links.incomingLinkRequests.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchOnMount: "always",
    staleTime: 0,
  });
  const incomingRequests = incomingRequestsQuery.data ?? [];
  // Co-wife visibility (spec 2026-09-02-cowife-visibility-design.md): husband-only
  // switch + the wife-facing names-only list it unlocks.
  const coWivesVis = trpc.links.coWivesVisibility.useQuery(undefined, { enabled: isAuthenticated && knownToBeMan });
  const setCoWivesVis = trpc.links.setCoWivesVisible.useMutation({
    onSuccess: () => { utils.links.coWivesVisibility.invalidate(); utils.links.coWives.invalidate(); },
  });
  const coWivesQuery = trpc.links.coWives.useQuery(undefined, { enabled: isAuthenticated && userGender === "vrouw" });
  // Second husband switch (2026-09-04): lets his wives message each other.
  const coWivesCanChat = trpc.links.coWivesCanChat.useQuery(undefined, { enabled: isAuthenticated && knownToBeMan });
  const setCoWivesCanChat = trpc.links.setCoWivesCanChat.useMutation({
    onSuccess: () => { utils.links.coWivesCanChat.invalidate(); utils.links.coWives.invalidate(); },
  });
  // Sort children by birth date (oldest first)
  const sortedChildren = [...(localChildren || [])].sort((a: any, b: any) => {
    if (!a.birthDate) return 1;
    if (!b.birthDate) return -1;
    return new Date(a.birthDate).getTime() - new Date(b.birthDate).getTime();
  });

  return (
    <View style={{ gap: 16 }}>
      {/* === INCOMING LINK REQUESTS === */}
      {incomingRequests.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.primary, textAlign: isRTL ? "right" : "left", textTransform: "uppercase", letterSpacing: 1 }}>
            {tx(lang, "Koppelverzoeken", "Link requests", "طلبات الربط")}
          </Text>
          {incomingRequests.map((r: any) => (
            <View key={r.partnershipId} style={{ backgroundColor: colors.primary + "10", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.primary + "30", gap: 10 }}>
              <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 8 }}>
                <MaterialIcons name="person-add" size={18} color={colors.primary} />
                <Text style={{ flex: 1, fontSize: 13, color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>
                  {tx(lang,
                    `${r.senderName || "Iemand"} wil met u koppelen. Uw gegevens worden pas na bevestiging gedeeld.`,
                    `${r.senderName || "Someone"} wants to link with you. No data is shared until you confirm.`,
                    `${r.senderName || "أحدهم"} يريد الارتباط بك. لن تتم مشاركة بياناتك إلا بعد التأكيد.`)}
                </Text>
              </View>
              <LinkRequestActions item={{ senderId: r.senderId }} colors={colors} lang={lang} />
            </View>
          ))}
        </View>
      )}

      {/* === SPOUSE SECTION === */}
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.muted, textAlign: isRTL ? "right" : "left", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
          {tx(lang, "Partner", "Spouse", "الزوجة")}
        </Text>

        {coParents.length > 0 && (
          <View style={{ gap: 10 }}>
            {coParents.map((cp: any) => {
              const relLabel = getRelationshipLabel(cp.relationship || "partner", lang, userGender, cp.wasDivorced);
              return (
                <TouchableOpacity
                  key={cp.id}
                  onPress={() => setSelected({
                    type: "coparent",
                    id: cp.id,
                    name: cp.name || relLabel,
                    relationship: cp.relationship,
                    sharedChildren: cp.sharedChildren,
                  })}
                  style={{
                    backgroundColor: colors.primary + "08",
                    borderRadius: 16,
                    padding: 16,
                    borderWidth: 2,
                    borderColor: colors.primary + "40",
                  }}
                >
                  <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center" }}>
                    <View style={{
                      width: 50, height: 50, borderRadius: 25,
                      backgroundColor: colors.primary + "20",
                      alignItems: "center", justifyContent: "center",
                      marginRight: isRTL ? 0 : 12, marginLeft: isRTL ? 12 : 0,
                      borderWidth: 2, borderColor: colors.primary + "40",
                    }}>
                      <MaterialIcons name="person" size={26} color={colors.primary} />
                      <View style={{ position: "absolute", bottom: -2, right: -2, backgroundColor: "#fff", borderRadius: 10, padding: 2 }}>
                        <MaterialIcons name="favorite" size={12} color="#E11D48" />
                      </View>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 17, fontWeight: "800", color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>
                        {cp.name || relLabel}
                      </Text>
                      <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                        <View style={{ backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 2, paddingHorizontal: 8 }}>
                          <Text style={{ fontSize: 11, color: "#fff", fontWeight: "700" }}>{relLabel}</Text>
                        </View>
                      </View>
                    </View>
                    <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 8 }}>
                      <TouchableOpacity
                        onPress={() => router.push("/spouse-profile" as any)}
                        style={{ backgroundColor: colors.success + "20", borderRadius: 20, width: 40, height: 40, alignItems: "center", justifyContent: "center" }}
                      >
                        <MaterialIcons name="person" size={18} color={colors.success} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setSelected({
                          type: "coparent", id: cp.id, name: cp.name || relLabel,
                          relationship: cp.relationship, sharedChildren: cp.sharedChildren,
                        })}
                        style={{ backgroundColor: colors.primary, borderRadius: 20, width: 40, height: 40, alignItems: "center", justifyContent: "center" }}
                      >
                        <MaterialIcons name="chat" size={18} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Add-partner form: always shown with 0 co-parents (first spouse);
            for a man, also shown below the list up to 4 wives (polygyny —
            INV-6). ⚠ SHIP-GATED (POLYGAMY-PHASE2-PLAN.md): a man with an
            existing wife only reaches this once Phase-1 server isolation
            (co-wife blindness, INV-1) is deployed — do not ship an APK with
            this unhidden before then. */}
        {(coParents.length === 0 || (userGender === "man" && coParents.length < 4)) && (
          <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border }}>
            <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <MaterialIcons name="person-add" size={18} color={colors.primary} />
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>
                {tx(lang, "Partner koppelen", "Link Spouse", "ربط الزوج / الزوجة")}
              </Text>
            </View>
            <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 10, textAlign: isRTL ? "right" : "left" }}>
              {tx(lang,
                "Voer het ID van uw partner in of scan hun QR-code.",
                "Enter your partner's ID or scan their QR code.",
                "أدخل رقم هوية شريكك أو امسح رمز QR."
              )}
            </Text>
            {/* Shown unless the user is KNOWN to be a man — see knownToBeMan,
                which reads the raw value rather than userGender. Failing open
                costs a man an irrelevant notice; failing closed costs a woman
                the owner-mandated disclosure itself. */}
            {!knownToBeMan && <SpouseVisibilityNotice />}
            <View style={{ gap: 8 }}>
              <TextInput
                value={partnerIdInput}
                onChangeText={setPartnerIdInput}
                placeholder={tx(lang, "Partner-ID", "Partner ID", "رقم هوية الشريك")}
                placeholderTextColor={colors.muted}
                style={{
                  backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border,
                  borderRadius: 10, padding: 12, fontSize: 14, color: colors.foreground,
                  fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                  textAlign: isRTL ? "right" : "left",
                }}
                autoCapitalize="characters"
                returnKeyType="done"
                onSubmitEditing={handleLinkPartner}
              />
              <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 8 }}>
                <TouchableOpacity
                  onPress={handleLinkPartner}
                  disabled={linkPartner.isPending}
                  style={{ flex: 1, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 12, alignItems: "center", opacity: linkPartner.isPending ? 0.7 : 1 }}
                >
                  {linkPartner.isPending ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>
                      {tx(lang, "Koppelen", "Link", "ربط")}
                    </Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => router.push("/qr-scanner")}
                  style={{ backgroundColor: colors.surface, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.primary, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 6 }}
                >
                  <MaterialIcons name="qr-code-scanner" size={16} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 13 }}>QR</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={() => setShowInvite((v: boolean) => !v)} style={{ marginTop: 10, alignItems: "center" }}>
                <Text style={{ fontSize: 12, color: colors.primary, fontWeight: "600", textDecorationLine: "underline" }}>
                  {showInvite
                    ? tx(lang, "Ik heb toch een ID", "I have an ID after all", "لديّ معرّف في الواقع")
                    : tx(lang, "Partner heeft nog geen account?", "Partner doesn't have an account yet?", "الشريك ليس لديه حساب بعد؟")}
                </Text>
              </TouchableOpacity>
              {showInvite && <InvitePartnerForm colors={colors} lang={lang} isRTL={isRTL} userGender={userGender} />}
            </View>
            {linkResult && (
              <View style={{ backgroundColor: colors.success + "15", borderRadius: 8, padding: 8, marginTop: 8 }}>
                <Text style={{ color: colors.success, fontSize: 12, fontWeight: "600", textAlign: "center" }}>{linkResult}</Text>
              </View>
            )}
            {linkError && (
              <View style={{ backgroundColor: colors.error + "15", borderRadius: 8, padding: 8, marginTop: 8 }}>
                <Text style={{ color: colors.error, fontSize: 12, fontWeight: "600", textAlign: "center" }}>{linkError}</Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Mount when any co-parent exists; the component itself decides what to
          show (per-wife panels for a husband via listPartners, own rights for a
          wife). Safe that the gate reads coParents while the husband body reads
          listPartners: both derive from the same active+confirmed partnerships,
          so a confirmed wife is always present in both — never one without the
          other. */}
      {coParents.length > 0 && (
        <CoParentPermissions colors={colors} lang={lang} isRTL={isRTL} setSelected={setSelected} />
      )}

      {/* Wife cycle status moved to «العائلة» per-wife cards (family.tsx
          «الحيض وأثره» button) — Daa3iyah 2026-09-04. */}

      {/* === CO-WIFE VISIBILITY (spec 2026-09-02-cowife-visibility-design.md) ===
          Husband-only switch; the wife-facing list it unlocks is names + a
          badge only — no chat button, no navigation, no children. */}
      {knownToBeMan && (
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between", gap: 10, backgroundColor: colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.foreground, flex: 1, fontSize: 13, textAlign: isRTL ? "right" : "left" }}>
              {tx(lang, "Mijn echtgenotes mogen elkaars naam zien", "Let my wives see each other's names", "السماح لزوجاتي بمعرفة بعضهن (بالاسم فقط)")}
            </Text>
            <Switch
              value={!!coWivesVis.data?.visible}
              disabled={setCoWivesVis.isPending}
              onValueChange={(v) => setCoWivesVis.mutate({ visible: v })}
            />
          </View>
          {/* Second switch: lets those wives message EACH OTHER. Useless until
              they can see each other, so it's disabled until the names switch
              above is on. */}
          <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between", gap: 10, backgroundColor: colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border, opacity: coWivesVis.data?.visible ? 1 : 0.5 }}>
            <Text style={{ color: colors.foreground, flex: 1, fontSize: 13, textAlign: isRTL ? "right" : "left" }}>
              {tx(lang, "Mijn echtgenotes mogen met elkaar praten", "Let my wives talk to each other", "السماح لزوجاتي بالتواصل مع بعضهن")}
            </Text>
            <Switch
              value={!!coWivesCanChat.data?.canChat}
              disabled={!coWivesVis.data?.visible || setCoWivesCanChat.isPending}
              onValueChange={(v) => setCoWivesCanChat.mutate({ canChat: v })}
            />
          </View>
        </View>
      )}
      {userGender === "vrouw" && (coWivesQuery.data?.length ?? 0) > 0 && (
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.muted, textAlign: isRTL ? "right" : "left", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
            {tx(lang, "Mede-echtgenotes", "Co-wives", "الأخوات الشريكات")}
          </Text>
          <View style={{ gap: 8 }}>
            {coWivesQuery.data!.map((w) => (
              <View
                key={w.id}
                style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between" }}
              >
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>
                  {w.name || tx(lang, "Mede-echtgenote", "Co-wife", "الأخت الشريكة")}
                </Text>
                {w.canChat ? (
                  <TouchableOpacity
                    onPress={() => setSelected({ type: "coparent", id: w.id, name: w.name || tx(lang, "Mede-echtgenote", "Co-wife", "الأخت الشريكة") })}
                    style={{ backgroundColor: colors.primary, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 6 }}
                  >
                    <MaterialIcons name="chat" size={16} color="#fff" />
                    <Text style={{ fontSize: 12, color: "#fff", fontWeight: "700" }}>{tx(lang, "Chat", "Chat", "محادثة")}</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={{ backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 2, paddingHorizontal: 8 }}>
                    <Text style={{ fontSize: 11, color: "#fff", fontWeight: "700" }}>
                      {tx(lang, "Mede-echtgenote", "Co-wife", "الأخت الشريكة")}
                    </Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        </View>
      )}

      {/* === CHILDREN SECTION === */}
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.muted, textAlign: isRTL ? "right" : "left", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
          {tx(lang, "Mijn kinderen", "My Children", "أبنائي")}
        </Text>

        {sortedChildren.length > 0 ? (
          <View style={{ gap: 8 }}>
            {sortedChildren.map((child: any, idx: number) => {
              const age = child.birthDate ? Math.floor((Date.now() - new Date(child.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : null;
              const isFemale = child.gender === "female" || child.gender === "meisje";
              const genderIcon = isFemale ? "face-3" : "face";
              const genderColor = isFemale ? "#EC4899" : "#3B82F6";
              return (
                <TouchableOpacity
                  key={child.id || idx}
                  onPress={() => router.push(`/child/${child.id}` as any)}
                  style={{
                    backgroundColor: colors.surface,
                    borderRadius: 14,
                    padding: 14,
                    borderWidth: 1,
                    borderColor: colors.border,
                    flexDirection: isRTL ? "row-reverse" : "row",
                    alignItems: "center",
                  }}
                >
                  <View style={{
                    width: 44, height: 44, borderRadius: 22,
                    backgroundColor: genderColor + "15",
                    alignItems: "center", justifyContent: "center",
                    marginRight: isRTL ? 0 : 12, marginLeft: isRTL ? 12 : 0,
                    borderWidth: 1.5, borderColor: genderColor + "30",
                  }}>
                    <MaterialIcons name={genderIcon as any} size={22} color={genderColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>
                      {child.name || tx(lang, `Kind ${idx + 1}`, `Child ${idx + 1}`, `طفل ${idx + 1}`)}
                    </Text>
                    <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 8, marginTop: 3 }}>
                      {age !== null && (
                        <Text style={{ fontSize: 12, color: colors.muted }}>
                          {age} {tx(lang, "jaar", "years", "سنة")}
                        </Text>
                      )}
                      <View style={{ backgroundColor: genderColor + "15", borderRadius: 6, paddingVertical: 2, paddingHorizontal: 6 }}>
                        <Text style={{ fontSize: 10, color: genderColor, fontWeight: "600" }}>
                          {isFemale ? tx(lang, "Meisje", "Girl", "بنت") : tx(lang, "Jongen", "Boy", "ولد")}
                        </Text>
                      </View>
                    </View>
                  </View>
                    <TouchableOpacity
                      onPress={() => router.push(`/child-account/parent-monitor?childId=${child.id}&childName=${encodeURIComponent(child.name || '')}` as any)}
                      style={{
                        width: 36, height: 36, borderRadius: 18,
                        backgroundColor: colors.primary + "15",
                        alignItems: "center", justifyContent: "center",
                        marginRight: isRTL ? 8 : 0, marginLeft: isRTL ? 0 : 8,
                      }}
                    >
                      <MaterialIcons name="monitor" size={18} color={colors.primary} />
                    </TouchableOpacity>
                  <MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={20} color={colors.muted} />
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 24, alignItems: "center", borderWidth: 1, borderColor: colors.border }}>
            <MaterialIcons name="child-care" size={36} color={colors.muted + "50"} />
            <Text style={{ fontSize: 13, color: colors.muted, marginTop: 10, textAlign: "center" }}>
              {tx(lang, "Voeg kinderen toe via het tabblad 'Kinderen'", "Add children via the 'Children' tab", "أضف أبناءك من تبويب 'الأبناء'")}
            </Text>
          </View>
        )}
      </View>

      {coParentsQuery.isLoading && (
        <View style={{ alignItems: "center", paddingVertical: 20 }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}
    </View>
  );
}

// ============ ID SECTION ============
function IdSection({
  colors, lang, isRTL, isAuthenticated, myIdQuery, generateMyId,
  birthDateInput, setBirthDateInput, handleGenerateId,
  localChildren, showQr, router, t,
}: any) {
  return (
    <View style={{ gap: 16 }}>
      {/* My ID Card */}
      <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: colors.border }}>
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
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
            <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
              <TouchableOpacity
                onPress={async () => {
                  const id = myIdQuery.data!.publicId!;
                  if (Platform.OS === "web") {
                    try { navigator.clipboard.writeText(id); } catch(e) {}
                    Alert.alert(
                      tx(lang, "Gekopieerd!", "Copied!", "تم النسخ!"),
                      tx(lang, "Uw ID is gekopieerd naar het klembord.", "Your ID has been copied to clipboard.", "تم نسخ معرّفك إلى الحافظة.")
                    );
                  } else {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    await Share.share({ message: id });
                  }
                }}
                style={{ backgroundColor: colors.primary + "15", borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.primary }}
              >
                <MaterialIcons name="content-copy" size={16} color={colors.primary} />
                <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 13 }}>{tx(lang, "Kopieer ID", "Copy ID", "انسخ المعرّف")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => showQr(myIdQuery.data!.publicId!, t("network.my_id"))}
                style={{ backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 6 }}
              >
                <MaterialIcons name="qr-code" size={16} color="#fff" />
                <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>{t("network.share_qr")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.push("/qr-scanner")}
                style={{ backgroundColor: colors.surface, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.primary, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 6 }}
              >
                <MaterialIcons name="qr-code-scanner" size={16} color={colors.primary} />
                <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 13 }}>{t("network.scan_qr")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : isAuthenticated ? (
          <View style={{ gap: 12 }}>
            <Text style={{ fontSize: 13, color: colors.muted }}>
              {tx(lang, "Voer uw geboortedatum in om uw unieke code te genereren:", "Enter your birth date to generate your unique code:", "أدخل تاريخ ميلادك لإنشاء رمزك المميز:")}
            </Text>
            <DatePicker
              value={birthDateInput}
              onChange={setBirthDateInput}
              placeholder={tx(lang, "Kies uw geboortedatum", "Select your birth date", "اختر تاريخ ميلادك")}
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
                  {tx(lang, "Code Genereren", "Generate Code", "إنشاء الرمز")}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ alignItems: "center", paddingVertical: 16, gap: 12 }}>
            <Text style={{ fontSize: 13, color: colors.muted, textAlign: "center" }}>
              {tx(lang, "Log in om uw unieke code te genereren", "Sign in to generate your unique code", "سجّل الدخول لإنشاء رمزك المميز")}
            </Text>
            <TouchableOpacity
              onPress={() => router.push("/login" as any)}
              style={{ backgroundColor: colors.primary, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10, alignItems: "center" }}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>
                {tx(lang, "Inloggen", "Sign In", "تسجيل الدخول")}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Children IDs */}
      {localChildren.length > 0 && (
        <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: colors.border }}>
          <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <MaterialIcons name="child-care" size={20} color={colors.primary} />
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>
              {t("network.child_id")}
            </Text>
          </View>
          <View style={{ gap: 10 }}>
            {[...localChildren].sort((a: any, b: any) => {
              if (!a.birthDate) return 1;
              if (!b.birthDate) return -1;
              return new Date(a.birthDate).getTime() - new Date(b.birthDate).getTime();
            }).map((child: any, idx: number) => (
              <View key={child.id} style={{ backgroundColor: colors.background, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                    {child.name || `Kind ${idx + 1}`}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.muted }}>
                    {child.birthDate || (tx(lang, "Geen geboortedatum", "No birth date", "لا تاريخ ميلاد"))}
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
        </View>
      )}
    </View>
  );
}

// ============ CONTACTS SECTION (Teachers/Scholars/Doctors) ============
function ContactsSection({
  colors, lang, isRTL, contacts, category, showAddForm, setShowAddForm,
  formPublicId, setFormPublicId,
  lookupResult, lookupError, lookupLoading,
  handleLookupPerson, handleAddPerson, handleRemovePerson, resetForm, t,
}: any) {
  return (
    <View style={{ gap: 16 }}>
      {/* Add button */}
      <TouchableOpacity
        onPress={() => setShowAddForm(!showAddForm)}
        style={{ backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "center", gap: 8 }}
      >
        <MaterialIcons name={showAddForm ? "close" : "add"} size={20} color="#fff" />
        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
          {showAddForm ? tx(lang, "Annuleren", "Cancel", "إلغاء") : t("network.add_person")}
        </Text>
      </TouchableOpacity>

      {/* ID Lookup Form */}
      {showAddForm && (
        <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: colors.border, gap: 14 }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>
            {tx(lang, "Voer de unieke code van de persoon in", "Enter the person's unique code", "أدخل الرمز المميز للشخص")}
          </Text>
          <Text style={{ fontSize: 12, color: colors.muted, textAlign: isRTL ? "right" : "left" }}>
            {tx(lang, "De persoon wordt gezocht in het openbare netwerk van de app", "The person will be searched in the app's public network", "سيتم البحث عن الشخص في الشبكة العامة للتطبيق")}
          </Text>
          <TextInput
            value={formPublicId}
            onChangeText={setFormPublicId}
            placeholder={tx(lang, "Unieke code", "Unique Code", "الرمز المميز")}
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
                {tx(lang, "Zoeken", "Search", "بحث")}
              </Text>
            )}
          </TouchableOpacity>

          {lookupError ? (
            <View style={{ backgroundColor: colors.error + "15", borderRadius: 8, padding: 10 }}>
              <Text style={{ color: colors.error, fontSize: 13, textAlign: "center" }}>{lookupError}</Text>
            </View>
          ) : null}

          {lookupResult && (
            <View style={{ backgroundColor: colors.success + "10", borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.success + "40", gap: 8 }}>
              <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 10 }}>
                <MaterialIcons name="check-circle" size={24} color={colors.success} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>{lookupResult.name || (tx(lang, "Gebruiker", "User", "مستخدم"))}</Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>{lookupResult.role}</Text>
                  <Text style={{ fontSize: 11, color: colors.primary, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}>ID: {lookupResult.publicId}</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={handleAddPerson}
                style={{ backgroundColor: colors.success, borderRadius: 10, paddingVertical: 12, alignItems: "center", marginTop: 4 }}
              >
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
                  {tx(lang, "Toevoegen aan mijn netwerk", "Add to my network", "إضافة إلى شبكتي")}
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
              <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "flex-start", justifyContent: "space-between" }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>{person.name}</Text>
                  {person.specialization ? (
                    <Text style={{ fontSize: 12, color: colors.primary }}>{person.specialization}</Text>
                  ) : null}
                  {person.publicId ? (
                    <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 4 }}>
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
          <MaterialIcons name="people-outline" size={40} color={colors.muted + "60"} />
          <Text style={{ fontSize: 14, color: colors.muted, marginTop: 12, textAlign: "center" }}>
            {t("network.no_persons")}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// ============ LINK REQUEST ACTIONS ============
function LinkRequestActions({ item, colors, lang }: { item: any; colors: any; lang: string }) {
  const { isRTL } = useI18n();
  const [handled, setHandled] = useState(false);
  const [action, setAction] = useState<"accepted" | "rejected" | null>(null);
  const utils = trpc.useUtils();
  // A resolved request must leave the incoming list, and an accepted one turns
  // the sender into a co-parent, so refresh both surfaces.
  const refreshLinkSurfaces = () => {
    utils.links.incomingLinkRequests.invalidate();
    utils.links.coParents.invalidate();
    utils.links.listPartners.invalidate();
  };
  const confirmMutation = trpc.links.confirmLink.useMutation({
    onSuccess: (res: any) => {
      setHandled(true);
      setAction("accepted");
      refreshLinkSurfaces();
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // The child links succeeded, but the partnership half was refused. The
      // server reports that rather than throwing, precisely so this outcome is
      // not lost — reporting only "accepted" would leave the person believing
      // they are now linked as partners when they are not.
      if (res?.partnershipBlocked) {
        Alert.alert(
          tx(lang, "Gedeeltelijk bevestigd", "Partly confirmed", "تم التأكيد جزئيًا"),
          res.partnershipBlocked === "not_found"
            ? tx(lang,
                "De kinderkoppeling is bevestigd, maar het partnerverzoek bestaat niet meer.",
                "The child link was confirmed, but the partner request no longer exists.",
                "تم تأكيد ارتباط الطفل، لكن طلب الشريك لم يعد موجودًا.")
            : tx(lang,
                "De kinderkoppeling is bevestigd. Het partnerverzoek niet: een van u beiden heeft al een bevestigde partner.",
                "The child link was confirmed. The partner request was not: one of you already has a confirmed partner.",
                "تم تأكيد ارتباط الطفل. أما طلب الشريك فلا: أحدكما لديه شريك مؤكَّد بالفعل."),
        );
      }
    },
    // Without this a thrown CONFLICT/NOT_FOUND — the case where NOTHING could
    // be confirmed — showed the user nothing at all.
    onError: (err: any) => {
      Alert.alert(
        tx(lang, "Mislukt", "Failed", "فشلت العملية"),
        err?.message ||
          tx(lang, "Kon het verzoek niet bevestigen.", "Could not confirm the request.", "تعذّر تأكيد الطلب."),
      );
    },
  });
  const removeMutation = trpc.links.removeLink.useMutation({
    onSuccess: () => {
      setHandled(true);
      setAction("rejected");
      refreshLinkSurfaces();
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    },
  });

  if (handled) {
    return (
      <View style={{ alignItems: "center", paddingVertical: 4 }}>
        <Text style={{ fontSize: 12, color: action === "accepted" ? colors.success : colors.error, fontWeight: "600" }}>
          {action === "accepted"
            ? tx(lang, "\u2713 Geaccepteerd", "\u2713 Accepted", "\u2713 تم القبول")
            : tx(lang, "\u2717 Geweigerd", "\u2717 Rejected", "\u2717 تم الرفض")}
        </Text>
      </View>
    );
  }

  const handleAccept = () => {
    Alert.alert(
      tx(lang, "Accepteren", "Accept", "قبول"),
      tx(lang, "Wilt u dit koppelverzoek accepteren?", "Do you want to accept this link request?", "هل تريد قبول طلب الربط هذا؟"),
      [
        { text: tx(lang, "Annuleren", "Cancel", "إلغاء"), style: "cancel" },
        {
          text: tx(lang, "Accepteren", "Accept", "قبول"),
          onPress: () => confirmMutation.mutate({ senderId: item.senderId }),
        },
      ]
    );
  };

  const handleReject = () => {
    Alert.alert(
      tx(lang, "Weigeren", "Reject", "رفض"),
      tx(lang, "Wilt u dit koppelverzoek weigeren?", "Do you want to reject this link request?", "هل تريد رفض طلب الربط هذا؟"),
      [
        { text: tx(lang, "Annuleren", "Cancel", "إلغاء"), style: "cancel" },
        {
          text: tx(lang, "Weigeren", "Reject", "رفض"),
          style: "destructive",
          onPress: () => removeMutation.mutate({ senderId: item.senderId }),
        },
      ]
    );
  };

  return (
    <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 10 }}>
      <TouchableOpacity
        onPress={handleAccept}
        disabled={confirmMutation.isPending || removeMutation.isPending}
        style={{
          flex: 1,
          backgroundColor: colors.success,
          borderRadius: 8,
          paddingVertical: 10,
          alignItems: "center",
          opacity: confirmMutation.isPending ? 0.6 : 1,
        }}
      >
        {confirmMutation.isPending ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>
            {tx(lang, "\u2713 Accepteren", "\u2713 Accept", "\u2713 قبول")}
          </Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity
        onPress={handleReject}
        disabled={confirmMutation.isPending || removeMutation.isPending}
        style={{
          flex: 1,
          backgroundColor: colors.error,
          borderRadius: 8,
          paddingVertical: 10,
          alignItems: "center",
          opacity: removeMutation.isPending ? 0.6 : 1,
        }}
      >
        {removeMutation.isPending ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>
            {tx(lang, "\u2717 Weigeren", "\u2717 Reject", "\u2717 رفض")}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}


// ============ SYNC REPORTS SECTION ============
function SyncReportsSection({ colors, lang, isRTL }: { colors: any; lang: string; isRTL: boolean }) {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
        const stored = await AsyncStorage.getItem("sync_reports");
        if (stored) {
          setReports(JSON.parse(stored));
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  function formatDate(iso: string): string {
    const d = new Date(iso);
    const day = d.getDate();
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    const hours = d.getHours().toString().padStart(2, "0");
    const mins = d.getMinutes().toString().padStart(2, "0");
    return `${day}/${month}/${year} - ${hours}:${mins}`;
  }

  function getMergeDetails(merged: any): { label: string; count: number; icon: string }[] {
    const details: { label: string; count: number; icon: string }[] = [];
    if (merged?.children > 0) {
      details.push({
        label: lang === "ar" ? "\u0623\u0637\u0641\u0627\u0644 \u062c\u062f\u062f/\u0645\u062d\u062f\u0651\u062b\u0648\u0646" : lang === "en" ? "Children added/updated" : "Kinderen toegevoegd/bijgewerkt",
        count: merged.children,
        icon: "child-care",
      });
    }
    if (merged?.environments > 0) {
      details.push({
        label: lang === "ar" ? "\u062a\u062d\u0644\u064a\u0644\u0627\u062a \u0627\u0644\u0628\u064a\u0626\u0629" : lang === "en" ? "Environment analyses" : "Omgevingsanalyses",
        count: merged.environments,
        icon: "nature-people",
      });
    }
    if (merged?.issues > 0) {
      details.push({
        label: lang === "ar" ? "\u0645\u0634\u0643\u0644\u0627\u062a \u062c\u062f\u064a\u062f\u0629" : lang === "en" ? "New issues reported" : "Nieuwe problemen gemeld",
        count: merged.issues,
        icon: "report-problem",
      });
    }
    if (merged?.actionPlans > 0) {
      details.push({
        label: lang === "ar" ? "\u062e\u0637\u0637 \u0639\u0644\u0627\u062c\u064a\u0629" : lang === "en" ? "Treatment/action plans" : "Actieplannen",
        count: merged.actionPlans,
        icon: "assignment-turned-in",
      });
    }
    return details;
  }

  const handleExportPDF = async () => {
    if (exporting || reports.length === 0) return;
    setExporting(true);
    try {
      const { printToFileAsync } = await import("expo-print");
      const { isAvailableAsync, shareAsync } = await import("expo-sharing");
      const dateStr = new Date().toLocaleDateString(lang === "ar" ? "ar-SA" : lang === "en" ? "en-US" : "nl-NL");
      const rowsHtml = reports.map((report) => {
        const details = getMergeDetails(report.merged);
        const detailsText = details.length > 0
          ? details.map(d => `${d.label}: ${d.count}`).join(" | ")
          : (lang === "ar" ? "\u0628\u062f\u0648\u0646 \u062a\u063a\u064a\u064a\u0631\u0627\u062a" : lang === "en" ? "No changes" : "Geen wijzigingen");
        return `<tr>
          <td>${formatDate(report.timestamp)}</td>
          <td>${detailsText}</td>
          <td style="text-align:center;font-weight:bold;">${report.total || 0}</td>
        </tr>`;
      }).join("");

      const html = `
        <html dir="${isRTL ? "rtl" : "ltr"}">
        <head><meta charset="utf-8"><style>
          body { font-family: Arial, sans-serif; padding: 24px; font-size: 12px; line-height: 1.6; direction: ${isRTL ? "rtl" : "ltr"}; color: #333; }
          h1 { color: #1B4332; font-size: 20px; border-bottom: 3px solid #1B4332; padding-bottom: 8px; margin-bottom: 4px; }
          .subtitle { color: #666; font-size: 11px; margin-bottom: 20px; }
          .summary { background: #E8F5E9; padding: 12px 16px; border-radius: 8px; margin-bottom: 20px; }
          .summary strong { color: #1B4332; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th { background: #1B4332; color: white; padding: 10px 8px; font-size: 11px; text-align: ${isRTL ? "right" : "left"}; }
          td { padding: 8px; border-bottom: 1px solid #eee; font-size: 11px; text-align: ${isRTL ? "right" : "left"}; }
          tr:nth-child(even) { background: #f9fafb; }
          .footer { margin-top: 30px; padding-top: 12px; border-top: 2px solid #ddd; color: #888; font-size: 10px; text-align: center; }
        </style></head>
        <body>
          <h1>${lang === "ar" ? "\u062a\u0642\u0627\u0631\u064a\u0631 \u0627\u0644\u0634\u0628\u0643\u0629 - \u0633\u062c\u0644 \u0627\u0644\u0645\u0632\u0627\u0645\u0646\u0629" : lang === "en" ? "Network Reports - Sync Log" : "Netwerk Rapporten - Synchronisatielog"}</h1>
          <p class="subtitle">${lang === "ar" ? "\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u062a\u0635\u062f\u064a\u0631" : lang === "en" ? "Export date" : "Exportdatum"}: ${dateStr}</p>
          <div class="summary">
            <strong>${reports.length}</strong> ${lang === "ar" ? "\u0639\u0645\u0644\u064a\u0629 \u0645\u0632\u0627\u0645\u0646\u0629 \u0645\u0633\u062c\u0644\u0629" : lang === "en" ? "sync operations recorded" : "synchronisaties geregistreerd"} |
            <strong>${reports.filter(r => r.total > 0).length}</strong> ${lang === "ar" ? "\u0645\u0639 \u0628\u064a\u0627\u0646\u0627\u062a \u062c\u062f\u064a\u062f\u0629" : lang === "en" ? "with new data" : "met nieuwe gegevens"}
          </div>
          <table>
            <thead>
              <tr>
                <th>${lang === "ar" ? "\u0627\u0644\u062a\u0627\u0631\u064a\u062e \u0648\u0627\u0644\u0648\u0642\u062a" : lang === "en" ? "Date & Time" : "Datum & Tijd"}</th>
                <th>${lang === "ar" ? "\u0627\u0644\u062a\u0641\u0627\u0635\u064a\u0644" : lang === "en" ? "Details" : "Details"}</th>
                <th style="text-align:center;">${lang === "ar" ? "\u0627\u0644\u0639\u062f\u062f" : lang === "en" ? "Count" : "Aantal"}</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          <div class="footer">${lang === "ar" ? "\u062a\u0645 \u0625\u0646\u0634\u0627\u0624\u0647 \u0628\u0648\u0627\u0633\u0637\u0629 \u062a\u0637\u0628\u064a\u0642 \u0631\u0628\u0651\u0627\u0646\u064a\u0651" : lang === "en" ? "Generated by Rabbaanie App" : "Gegenereerd door Rabbaanie App"} - ${dateStr}</div>
        </body></html>
      `;
      const { uri } = await printToFileAsync({ html, base64: false });
      if (await isAvailableAsync()) {
        await shareAsync(uri, { mimeType: "application/pdf", dialogTitle: lang === "ar" ? "\u062a\u0635\u062f\u064a\u0631 \u062a\u0642\u0627\u0631\u064a\u0631 \u0627\u0644\u0634\u0628\u0643\u0629 PDF" : lang === "en" ? "Export Network Reports PDF" : "Netwerk Rapporten PDF exporteren" });
      } else {
        Alert.alert("PDF", uri);
      }
    } catch (e: any) {
      Alert.alert(lang === "ar" ? "\u062e\u0637\u0623" : "Error", e?.message || "PDF export failed");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <View style={{ alignItems: "center", paddingVertical: 40 }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (reports.length === 0) {
    return (
      <View style={{ alignItems: "center", paddingVertical: 40 }}>
        <MaterialIcons name="sync-disabled" size={48} color={colors.muted} />
        <Text style={{ fontSize: 16, color: colors.muted, marginTop: 12, textAlign: "center" }}>
          {lang === "ar" ? "\u0644\u0627 \u062a\u0648\u062c\u062f \u062a\u0642\u0627\u0631\u064a\u0631 \u0645\u0632\u0627\u0645\u0646\u0629 \u0628\u0639\u062f.\n\u0633\u062a\u0638\u0647\u0631 \u0647\u0646\u0627 \u062a\u0644\u0642\u0627\u0626\u064a\u064b\u0627 \u0639\u0646\u062f \u0643\u0644 \u0645\u0632\u0627\u0645\u0646\u0629 \u0645\u0639 \u0627\u0644\u0634\u0631\u064a\u0643." : lang === "en" ? "No sync reports yet.\nThey will appear here automatically after each partner sync." : "Nog geen synchronisatierapporten.\nZe verschijnen hier automatisch na elke partnersynchronisatie."}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      {/* Header with title and PDF export button */}
      <View style={{ flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "center" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>
            {lang === "ar" ? "\u062a\u0642\u0627\u0631\u064a\u0631 \u0627\u0644\u0634\u0628\u0643\u0629" : lang === "en" ? "Network Reports" : "Netwerk Rapporten"}
          </Text>
          <Text style={{ fontSize: 12, color: colors.muted, textAlign: isRTL ? "right" : "left", marginTop: 2 }}>
            {lang === "ar" ? "\u0633\u062c\u0644 \u0627\u0644\u0645\u0632\u0627\u0645\u0646\u0627\u062a \u0645\u0639 \u0627\u0644\u0634\u0631\u064a\u0643 - \u0645\u0627 \u062a\u0645 \u0627\u0633\u062a\u0644\u0627\u0645\u0647 \u0648\u0645\u062a\u0649" : lang === "en" ? "Partner sync log - what was received and when" : "Synchronisatielog met partner - wat ontvangen en wanneer"}
          </Text>
        </View>
        <TouchableOpacity
          onPress={handleExportPDF}
          style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 6, backgroundColor: "#E8F5E9", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: "#4CAF5030" }}
        >
          {exporting ? (
            <ActivityIndicator size={14} color="#1B4332" />
          ) : (
            <MaterialIcons name="picture-as-pdf" size={16} color="#1B4332" />
          )}
          <Text style={{ fontSize: 11, fontWeight: "700", color: "#1B4332" }}>
            {lang === "ar" ? "\u062a\u0635\u062f\u064a\u0631 PDF" : lang === "en" ? "Export PDF" : "PDF exporteren"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Summary stats */}
      <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 8, marginBottom: 4 }}>
        <View style={{ flex: 1, backgroundColor: "#E8F5E9", borderRadius: 10, padding: 12, alignItems: "center" }}>
          <Text style={{ fontSize: 20, fontWeight: "800", color: "#1B4332" }}>{reports.length}</Text>
          <Text style={{ fontSize: 10, color: "#1B4332", fontWeight: "600", marginTop: 2 }}>
            {lang === "ar" ? "\u0639\u0645\u0644\u064a\u0629 \u0645\u0632\u0627\u0645\u0646\u0629" : lang === "en" ? "Total syncs" : "Totaal syncs"}
          </Text>
        </View>
        <View style={{ flex: 1, backgroundColor: "#F0FFF4", borderRadius: 10, padding: 12, alignItems: "center" }}>
          <Text style={{ fontSize: 20, fontWeight: "800", color: "#22C55E" }}>{reports.filter(r => r.total > 0).length}</Text>
          <Text style={{ fontSize: 10, color: "#22C55E", fontWeight: "600", marginTop: 2 }}>
            {lang === "ar" ? "\u0645\u0639 \u0628\u064a\u0627\u0646\u0627\u062a \u062c\u062f\u064a\u062f\u0629" : lang === "en" ? "With new data" : "Met nieuwe data"}
          </Text>
        </View>
        <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 10, padding: 12, alignItems: "center" }}>
          <Text style={{ fontSize: 20, fontWeight: "800", color: colors.muted }}>{reports.filter(r => !r.total || r.total === 0).length}</Text>
          <Text style={{ fontSize: 10, color: colors.muted, fontWeight: "600", marginTop: 2 }}>
            {lang === "ar" ? "\u0628\u062f\u0648\u0646 \u062a\u063a\u064a\u064a\u0631" : lang === "en" ? "No changes" : "Geen wijzigingen"}
          </Text>
        </View>
      </View>

      {/* Reports list */}
      {reports.map((report, idx) => {
        const details = getMergeDetails(report.merged);
        const hasNew = report.total > 0;
        return (
          <View
            key={idx}
            style={{
              backgroundColor: hasNew ? "#F0FFF4" : colors.surface,
              borderRadius: 12,
              padding: 16,
              borderWidth: 1,
              borderColor: hasNew ? "#22C55E" : colors.border,
              ...(isRTL ? { borderRightWidth: 4, borderRightColor: hasNew ? "#22C55E" : colors.primary } : { borderLeftWidth: 4, borderLeftColor: hasNew ? "#22C55E" : colors.primary }),
            }}
          >
            <View style={{ flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 8 }}>
                <MaterialIcons name={hasNew ? "cloud-download" : "cloud-done"} size={20} color={hasNew ? "#22C55E" : colors.muted} />
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>
                  {hasNew
                    ? (lang === "ar" ? "\u0628\u064a\u0627\u0646\u0627\u062a \u062c\u062f\u064a\u062f\u0629 \u0645\u0646 \u0627\u0644\u0634\u0631\u064a\u0643" : lang === "en" ? "New data from partner" : "Nieuwe gegevens van partner")
                    : (lang === "ar" ? "\u0645\u0632\u0627\u0645\u0646\u0629 \u0628\u062f\u0648\u0646 \u062a\u063a\u064a\u064a\u0631\u0627\u062a" : lang === "en" ? "Sync without changes" : "Synchronisatie zonder wijzigingen")}
                </Text>
              </View>
            </View>
            <Text style={{ fontSize: 12, color: colors.muted, textAlign: isRTL ? "right" : "left", marginBottom: hasNew ? 8 : 0 }}>
              {formatDate(report.timestamp)}
            </Text>
            {hasNew && details.length > 0 && (
              <View style={{ gap: 6, marginTop: 4, backgroundColor: "#FFFFFF90", borderRadius: 8, padding: 10 }}>
                {details.map((d, i) => (
                  <View key={i} style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 8 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: "#22C55E15", alignItems: "center", justifyContent: "center" }}>
                      <MaterialIcons name={d.icon as any} size={14} color="#22C55E" />
                    </View>
                    <Text style={{ fontSize: 13, color: colors.foreground, flex: 1, textAlign: isRTL ? "right" : "left" }}>{d.label}</Text>
                    <View style={{ backgroundColor: "#22C55E", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 11, color: "#FFFFFF", fontWeight: "700" }}>{d.count}</Text>
                    </View>
                  </View>
                ))}
                <View style={{ marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: "#22C55E20" }}>
                  <Text style={{ fontSize: 12, color: colors.primary, fontWeight: "700", textAlign: isRTL ? "right" : "left" }}>
                    {lang === "ar" ? `\u0625\u062c\u0645\u0627\u0644\u064a: ${report.total} \u0639\u0646\u0635\u0631 \u062c\u062f\u064a\u062f` : lang === "en" ? `Total: ${report.total} new item(s)` : `Totaal: ${report.total} nieuw(e) item(s)`}
                  </Text>
                </View>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

/**
 * Paid feature: advertised on the subscribe screen, so it is closed to
 * non-subscribers rather than shown with a banner over it. Wrapping rather
 * than an early return means every return path inside is covered, and the
 * inner component's hooks never run for a non-subscriber.
 */
export default function MessagesScreen() {
  return (
    <PremiumGate>
      <MessagesScreenInner />
    </PremiumGate>
  );
}
