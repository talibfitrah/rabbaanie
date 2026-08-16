/**
 * AI Chat Screen
 * 
 * Interactive chat with the Islamic parenting AI advisor.
 * Supports conversation history, attachments (images/files), and multilingual responses.
 * Extracts action plans and saves them to weekly tips.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Image,
  Alert,
  ScrollView,
  BackHandler,
} from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { PremiumGate } from "@/components/premium-notice";
import { useColors } from "@/hooks/use-colors";
import { useAutoTranslate } from "@/hooks/use-auto-translate";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { TreatmentPlanRenderer } from "@/components/treatment-plan-renderer";
import { authedFetch, accessDeniedMessage } from "@/lib/authed-fetch";
import * as ImagePicker from "expo-image-picker";
import { DISTRIBUTION_CHANNEL } from "@/lib/distribution";

/**
 * The server's attachment bounds, duplicated because the two repos share no
 * types (rabbaanie-api server/chat-attachments.ts). Checked HERE as well as
 * there for one reason: the API answers a breach with a 400, and this screen
 * maps any failed send to getOfflineResponse — so the parent got confident
 * canned advice about a photo the model never received, with nothing saying
 * why. Change these only together with that server.
 */
const MAX_IMAGE_ATTACHMENTS = 3;

/**
 * Whether this build offers photo attachments at all.
 *
 * A named constant rather than an inline channel check at each use, so the
 * guard in tests/play-store-compliance.test.ts can assert on a symbol instead
 * of on how far apart two strings sit in the file. Both the trigger and the
 * menu must use it: hiding only the trigger leaves the menu renderable if
 * showAttachMenu is ever set by another path.
 */
const ATTACHMENTS_ENABLED = DISTRIBUTION_CHANNEL === "github";
const MAX_ATTACHMENT_DATA_URL_LENGTH = 4_000_000;
import * as DocumentPicker from "expo-document-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppState } from "@/lib/app-context";
import { calculateAgeInWeeks } from "@/lib/store";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { ReportAiContent } from "@/components/report-ai-content";
import { getDeviceId } from "@/lib/device-id";
import { parseActionPlanSteps } from "@/lib/plan-steps";
import { buildConsultationDocx, toBase64 } from "@/lib/consultation-docx";
import { withPlanStore } from "@/lib/plan-progress";

// Types
interface Attachment {
  uri: string;
  name: string;
  type: "image" | "file";
  mimeType?: string;
  /**
   * The picture itself, as a data: URL, for the one purpose that matters: the
   * model can only look at an image that is actually sent. Before this the
   * attachment was flattened to `[صورة مرفقة: <name>]` and the model received a
   * FILENAME, so every answer about an attached photo was necessarily invented.
   * Populated at pick time, since ImagePicker hands back base64 there and
   * re-reading the uri later is another failure mode for nothing.
   */
  dataUrl?: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: Attachment[];
  createdAt: string;
  hasActionPlan?: boolean;
}

interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  childId?: string;
  language: string;
  createdAt: string;
}

// API base URL

/**
 * Format AI response text: remove markdown asterisks, format numbered steps,
 * and render with proper hierarchy and spacing.
 */
function formatAIResponse(content: string, textColor: string, accentColor: string): React.ReactNode[] {
  // Clean up asterisks (** bold ** and * italic *)
  let cleaned = content.replace(/\*\*([^*]+)\*\*/g, '$1');
  cleaned = cleaned.replace(/\*([^*]+)\*/g, '$1');
  // Clean up markdown headers
  cleaned = cleaned.replace(/^#{1,3}\s*/gm, '');
  // Replace Latin transliterations with Arabic
  cleaned = cleaned.replace(/\bAllaah\b/gi, 'الله');
  cleaned = cleaned.replace(/\bMaashaa'llaah\b/gi, 'ما شاء الله');
  cleaned = cleaned.replace(/\bBismillaah\b/gi, 'بسم الله');
  cleaned = cleaned.replace(/\bSubhaanAllaah\b/gi, 'سبحان الله');
  cleaned = cleaned.replace(/\bIn shaa' Allaah\b/gi, 'إن شاء الله');
  cleaned = cleaned.replace(/\bAstaghfirullaah\b/gi, 'أستغفر الله');
  cleaned = cleaned.replace(/3Abd-ur-Ra'oof/gi, 'عبد الرؤوف');
  cleaned = cleaned.replace(/3Abdullaah/gi, 'عبد الله');
  cleaned = cleaned.replace(/3Abd/g, 'عبد');
  // Split into paragraphs
  const paragraphs = cleaned.split(/\n\n+/);
  const elements: React.ReactNode[] = [];
  
  paragraphs.forEach((para, pIdx) => {
    const lines = para.split('\n').filter(l => l.trim());
    lines.forEach((line, lIdx) => {
      const key = `p${pIdx}_l${lIdx}`;
      const trimmed = line.trim();
      // Check if it's a numbered step (1. or ١.)
      const isNumberedStep = /^[\d٠-٩]+[.)\-]\s/.test(trimmed);
      // Check if it's a bullet point
      const isBullet = /^[-\u2022\u25CF]\s/.test(trimmed);
      // Check if it looks like a header/title (short line ending with :)
      const isHeader = trimmed.length < 60 && trimmed.endsWith(':');
      
      if (isHeader) {
        elements.push(
          <Text key={key} style={{ color: accentColor, fontSize: 14, fontWeight: '700', marginTop: pIdx > 0 ? 12 : 4, marginBottom: 4 }}>
            {trimmed}
          </Text>
        );
      } else if (isNumberedStep) {
        elements.push(
          <View key={key} style={{ flexDirection: 'row', marginTop: 6, paddingLeft: 4 }}>
            <Text style={{ color: accentColor, fontSize: 14, fontWeight: '700', marginRight: 6, minWidth: 20 }}>
              {trimmed.match(/^[\d٠-٩]+[.)\-]/)?.[0] || ''}
            </Text>
            <Text style={{ color: textColor, fontSize: 14, lineHeight: 22, flex: 1 }}>
              {trimmed.replace(/^[\d٠-٩]+[.)\-]\s*/, '')}
            </Text>
          </View>
        );
      } else if (isBullet) {
        elements.push(
          <View key={key} style={{ flexDirection: 'row', marginTop: 4, paddingLeft: 12 }}>
            <Text style={{ color: accentColor, fontSize: 14, marginRight: 6 }}>•</Text>
            <Text style={{ color: textColor, fontSize: 14, lineHeight: 22, flex: 1 }}>
              {trimmed.replace(/^[-\u2022\u25CF]\s*/, '')}
            </Text>
          </View>
        );
      } else {
        elements.push(
          <Text key={key} style={{ color: textColor, fontSize: 14, lineHeight: 22, marginTop: lIdx === 0 && pIdx > 0 ? 10 : 2 }}>
            {trimmed}
          </Text>
        );
      }
    });
  });
  
  return elements;
}

// Advisor message body: renders the advice, auto-translating it to the viewer's
// language when the consultation was written in another one (shared cross-language).
function AdvisorBody({ content, colors, isRTL }: { content: string; colors: any; isRTL: boolean }) {
  const { effectiveText, translating, translated, showOriginal, setShowOriginal, needsTranslation, language } = useAutoTranslate(content);
  const L = language === "ar"
    ? { translating: "جارٍ الترجمة…", auto: "مترجَمٌ آليًّا إلى لغتك", showOrig: "إظهار الأصل", showTr: "إظهار الترجمة" }
    : language === "en"
    ? { translating: "Translating…", auto: "Auto-translated to your language", showOrig: "Show original", showTr: "Show translation" }
    : { translating: "Aan het vertalen…", auto: "Automatisch vertaald naar jouw taal", showOrig: "Toon origineel", showTr: "Toon vertaling" };
  return (
    <View>
      {needsTranslation && (translating || translated) ? (
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8, backgroundColor: colors.primary + "12", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
          <Text style={{ fontSize: 11, color: colors.primary, flex: 1, textAlign: isRTL ? "right" : "left" }}>
            {translating ? L.translating : L.auto}
          </Text>
          {translated ? (
            <Pressable onPress={() => setShowOriginal((v) => !v)} hitSlop={8}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: colors.primary }}>{showOriginal ? L.showTr : L.showOrig}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <View>{formatAIResponse(effectiveText, colors.foreground, colors.primary)}</View>
    </View>
  );
}

function AIChatScreenInner() {
  const colors = useColors();
  const router = useRouter();
  const flatListRef = useRef<FlatList>(null);
  // One warning per visit when the server refuses to persist, so a lapsed
  // session is never silent but never nags either.
  const saveWarned = useRef(false);
  // Separate from the save warning: one flag for two unrelated failures meant
  // whichever happened first silenced the other for the rest of the visit.
  const listWarned = useRef(false);
  // Set while a resumed conversation is still laying out, so the list keeps
  // being pulled to the newest message as more of it renders.
  const pendingScrollToEnd = useRef(false);
  const inputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [language, setLanguage] = useState<"nl" | "ar" | "en">("ar");
  const [selectedChild, setSelectedChild] = useState<{ id: string; name: string; age: string } | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [showAttachMenu, setShowAttachMenu] = useState(false);

  // Child selection phase: "select" = must choose, "age_input" = entering age for other person, "ready" = child chosen
  const [childSelectionPhase, setChildSelectionPhase] = useState<"select" | "age_input" | "ready">("select");
  const [customChildAge, setCustomChildAge] = useState("");
  const [customChildName, setCustomChildName] = useState("");
  // Consultation type: "child" = about a child, "spouse" = about spouse, "general" = general question
  const [consultationType, setConsultationType] = useState<"child" | "spouse" | "general">("child");
  // Conversation history
  const [showHistory, setShowHistory] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<Array<{id: string; dbId?: number; title: string; childName?: string; consultationType: string; createdAt: string; messageCount: number}>>([]);
  // Database ID for current conversation
  const [currentDbId, setCurrentDbId] = useState<number | null>(null);
  // Device ID for anonymous persistence
  // Multi-select mode for deleting conversations
  const [selectMode, setSelectMode] = useState(false);
  const [selectedConvIds, setSelectedConvIds] = useState<Set<string>>(new Set());
  // Filter history by child
  const [historyFilter, setHistoryFilter] = useState<string | null>(null); // null = all, childName = filter
  // Search in history
  const [historySearch, setHistorySearch] = useState("");

  // Use app context for children (authoritative source)
  const { state: appState, saveActionPlan: saveActionPlanToContext } = useAppState();
  const children = appState.children || [];

  // Compute child age from birthDate
  const getChildAge = (child: any): string => {
    if (child.birthDate) {
      const { years } = calculateAgeInWeeks(child.birthDate);
      return String(years);
    }
    return "5";
  };

  // Load settings and set initial child
  useEffect(() => {
    loadSettings();
  }, []);

  // Always start fresh - user chooses topic explicitly each time

  const loadSettings = async () => {
    try {
      const lang = await AsyncStorage.getItem("@app_language");
      if (lang === "ar" || lang === "en" || lang === "nl") setLanguage(lang);

      // Do NOT restore last conversation - always start fresh
      // User can access previous conversations via history button
    } catch (e) {
      console.error("Error loading settings:", e);
    }
  };

  const saveConversation = async (convId: string, msgs: ChatMessage[]) => {
    try {
      // Save messages without attachment URIs (files are temporary)
      const cleanMessages = msgs.map(m => ({
        ...m,
        // dataUrl is stripped for the same reason as uri, and more urgently: it
        // is the whole image. Persisting it wrote multi-MB base64 into
        // AsyncStorage (6 MB cap for the entire app, shared with the weekplan
        // caches and the device id) AND re-uploaded it to saveConversationToDb
        // on every later message of the conversation. It is transient input to
        // the model, not conversation history — and photographs of children are
        // the last thing to retain by accident.
        attachments: m.attachments?.map(a => ({ ...a, uri: "", dataUrl: undefined })),
      }));

      // Save to database (persistent).
      //
      // Read the id here rather than trust the `deviceId` state: it starts as
      // "" and is filled by an async effect, and sendMessageWithText's
      // useCallback does not list it as a dependency, so a save could run
      // against the empty initial value and skip the server entirely — with
      // nothing said, because the only report was a console.error.
      const deviceIdNow = await getDeviceId();
      if (deviceIdNow) {
        try {
          const res = await authedFetch(`/api/trpc/aiChat.saveConversationToDb`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              json: {
                conversationId: convId,
                dbId: currentDbId || undefined,
                deviceId: deviceIdNow,
                childId: selectedChild?.id,
                childName: selectedChild?.name,
                childAge: selectedChild?.age,
                consultationType,
                language,
                title: msgs[0]?.content?.slice(0, 50) || "",
                messages: cleanMessages,
              },
            }),
          });
          // Read the body defensively: a gateway error body is not JSON, and
          // letting res.json() throw here jumped straight past the check below.
          const data = await res.json().catch(() => null);
          const dbId = data?.result?.data?.json?.dbId;
          if (dbId && !currentDbId) {
            setCurrentDbId(dbId);
          } else if (!res.ok || dbId == null) {
            // dbId == null covers BOTH shapes of refusal: an update rejected for
            // ownership, and a create the server never stored. Gating on
            // currentDbId missed the second — a brand-new consultation that
            // silently existed on the phone alone, which is the original bug.
            // The server did not persist this. Both ways of failing are
            // indistinguishable from success without this check: a lapsed
            // session makes the endpoint reject, and an ownership refusal
            // returns {dbId: null} inside a normal 200. Either way the
            // consultation only exists on this phone from here on, which is
            // exactly the silence that left Daa3iyah with an empty archive for
            // weeks. Warn once per screen, not per message.
            if (!saveWarned.current) {
              saveWarned.current = true;
              Alert.alert(
                language === "ar" ? "لم تُحفظ في الخادم" : "Not saved to server",
                language === "ar"
                  ? "هذه الاستشارة محفوظةٌ على هذا الهاتف فقط. سجّل الخروج ثمّ الدخول مرّةً أخرى ليُحفظ ما تكتبه."
                  : language === "en"
                  ? "This consultation is saved on this phone only. Sign out and back in so it is stored."
                  : "Dit gesprek staat alleen op deze telefoon. Log uit en weer in zodat het wordt opgeslagen.",
              );
            }
          }
        } catch (dbErr) {
          console.error("Error saving to DB (falling back to local):", dbErr);
        }
      }

      // Also save locally as fallback
      const convData = {
        id: convId,
        messages: cleanMessages,
        childId: selectedChild?.id,
        childName: selectedChild?.name,
        childAge: selectedChild?.age,
        consultationType,
        title: msgs[0]?.content?.slice(0, 50) || "",
        createdAt: new Date().toISOString(),
      };
      await AsyncStorage.setItem(`ai_chat_conv_${convId}`, JSON.stringify(convData));
      await AsyncStorage.setItem("ai_chat_last_conv", convId);
    } catch (e) {
      console.error("Error saving conversation:", e);
    }
  };

  const loadConversationHistory = async () => {
    try {
      // Try loading from database first. Same reason as the save path: the
      // state can still be "" here, and asking the server for an empty device
      // id returns nothing, which reads exactly like an empty archive.
      const deviceIdNow = await getDeviceId();
      if (deviceIdNow) {
        try {
          const res = await authedFetch(`/api/trpc/aiChat.listConversationsFromDb?input=${encodeURIComponent(JSON.stringify({ json: { deviceId: deviceIdNow } }))}`);
          // Defensive, for the same reason as the save path: a 401 or gateway
          // error body is not JSON, so res.json() threw here and jumped past
          // the res.ok check below — the warning added to stop this exact
          // silence could never fire. Fixed there and missed here.
          const data = await res.json().catch(() => null);
          const dbConversations = data?.result?.data?.json || [];
          if (!res.ok && !listWarned.current) {
            // A refused read falls through to local storage below, and local is
            // usually empty for consultations that only ever lived on the
            // server — so the archive reads as "you have none" when the real
            // answer is "we could not ask". Say which.
            listWarned.current = true;
            Alert.alert(
              language === "ar" ? "تعذّر جلب المحادثات" : "Could not load conversations",
              language === "ar"
                ? "لم يقبل الخادم الطلب، وما تراه هنا محفوظٌ على هذا الهاتف فقط. سجّل الخروج ثمّ الدخول مرّةً أخرى."
                : language === "en"
                ? "The server refused the request; what you see is stored on this phone only. Sign out and back in."
                : "De server weigerde het verzoek; wat je ziet staat alleen op deze telefoon. Log uit en weer in.",
            );
          }
          if (dbConversations.length > 0) {
            const history = dbConversations.map((c: any) => ({
              id: `db_${c.dbId}`,
              dbId: c.dbId,
              title: c.title || "",
              childName: c.childName || "",
              consultationType: c.consultationType || "child",
              createdAt: c.createdAt || "",
              messageCount: c.messageCount || 0,
            }));
            setConversationHistory(history);
            return;
          }
        } catch (dbErr) {
          console.error("Error loading from DB, falling back to local:", dbErr);
        }
      }
      // Fallback to local storage
      const historyRaw = await AsyncStorage.getItem("ai_chat_history_index");
      if (historyRaw) {
        setConversationHistory(JSON.parse(historyRaw));
      }
    } catch (e) {
      console.error("Error loading history:", e);
    }
  };

  const resumeConversation = async (convId: string, dbId?: number) => {
    try {
      // Try loading from database first
      if (dbId) {
        try {
          const res = await authedFetch(`/api/trpc/aiChat.getConversationFromDb`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ json: { dbId, deviceId: await getDeviceId() } }),
          });
          const data = await res.json();
          const conv = data.result?.data?.json;
          if (conv && conv.messages) {
            setConversationId(convId);
            setCurrentDbId(dbId);
            setMessages(conv.messages || []);
            if (conv.childId && conv.childName) {
              setSelectedChild({ id: conv.childId, name: conv.childName, age: "5" });
            }
            if (conv.consultationType) {
              setConsultationType(conv.consultationType as any);
            }
            setChildSelectionPhase("ready");
            setShowHistory(false);
            // Land on the newest message. The treatment plan is the last thing
            // the advisor writes, so opening at the top made a resumed
            // consultation look like it had no plan at all. A timer cannot do
            // this — the list is still laying out — so onContentSizeChange
            // follows it down until it settles.
            pendingScrollToEnd.current = true;
            return;
          }
        } catch (dbErr) {
          console.error("Error loading from DB, falling back to local:", dbErr);
        }
      }
      // Fallback to local storage
      const convData = await AsyncStorage.getItem(`ai_chat_conv_${convId}`);
      if (convData) {
        const conv = JSON.parse(convData);
        setConversationId(conv.id);
        setMessages(conv.messages || []);
        if (conv.childId && conv.childName) {
          setSelectedChild({ id: conv.childId, name: conv.childName, age: conv.childAge || "5" });
        }
        if (conv.consultationType) {
          setConsultationType(conv.consultationType);
        }
        setChildSelectionPhase("ready");
        setShowHistory(false);
        pendingScrollToEnd.current = true;
      }
    } catch (e) {
      console.error("Error resuming conversation:", e);
    }
  };

  const deleteConversation = (convId: string, dbId?: number) => {
    const title = language === "ar" ? "حذف المحادثة" : language === "en" ? "Delete Conversation" : "Gesprek verwijderen";
    const msg = language === "ar" ? "هل أنت متأكد من حذف هذه المحادثة؟" : language === "en" ? "Are you sure you want to delete this conversation?" : "Weet je zeker dat je dit gesprek wilt verwijderen?";
    const cancel = language === "ar" ? "إلغاء" : language === "en" ? "Cancel" : "Annuleren";
    const confirm = language === "ar" ? "حذف" : language === "en" ? "Delete" : "Verwijderen";
    Alert.alert(title, msg, [
      { text: cancel, style: "cancel" },
      {
        text: confirm,
        style: "destructive",
        onPress: async () => {
          try {
            // Delete from database
            if (dbId) {
              try {
                await authedFetch(`/api/trpc/aiChat.deleteConversationFromDb`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ json: { dbId, deviceId: await getDeviceId() } }),
                });
              } catch (dbErr) {
                console.error("Error deleting from DB:", dbErr);
              }
            }
            // Also remove from local storage
            await AsyncStorage.removeItem(`ai_chat_conv_${convId}`);
            // Update local history
            setConversationHistory(prev => prev.filter(h => h.id !== convId));
            // If currently viewing this conversation, reset
            if (conversationId === convId) {
              setMessages([]);
              setConversationId(null);
              setCurrentDbId(null);
              setChildSelectionPhase("select");
              setSelectedChild(null);
            }
          } catch (e) {
            console.error("Error deleting conversation:", e);
          }
        },
      },
    ]);
  };

  const deleteSelectedConversations = () => {
    if (selectedConvIds.size === 0) return;
    const title = language === "ar" ? "حذف المحادثات المحددة" : language === "en" ? "Delete Selected" : "Geselecteerde verwijderen";
    const msg = language === "ar" ? `هل تريد حذف ${selectedConvIds.size} محادثة؟` : language === "en" ? `Delete ${selectedConvIds.size} conversations?` : `${selectedConvIds.size} gesprekken verwijderen?`;
    const cancel = language === "ar" ? "إلغاء" : language === "en" ? "Cancel" : "Annuleren";
    const confirm = language === "ar" ? "حذف" : language === "en" ? "Delete" : "Verwijderen";
    Alert.alert(title, msg, [
      { text: cancel, style: "cancel" },
      {
        text: confirm,
        style: "destructive",
        onPress: async () => {
          try {
            for (const convId of Array.from(selectedConvIds)) {
              const conv = conversationHistory.find(h => h.id === convId);
              if (conv?.dbId) {
                try {
                  await authedFetch(`/api/trpc/aiChat.deleteConversationFromDb`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ json: { dbId: conv.dbId, deviceId: await getDeviceId() } }),
                  });
                } catch (dbErr) { /* ignore */ }
              }
              await AsyncStorage.removeItem(`ai_chat_conv_${convId}`);
            }
            setConversationHistory(prev => prev.filter(h => !selectedConvIds.has(h.id)));
            setSelectedConvIds(new Set());
            setSelectMode(false);
          } catch (e) {
            console.error("Error deleting selected:", e);
          }
        },
      },
    ]);
  };

  const deleteAllConversations = () => {
    if (conversationHistory.length === 0) return;
    const filtered = historyFilter ? conversationHistory.filter(h => h.childName === historyFilter) : conversationHistory;
    if (filtered.length === 0) return;
    const title = language === "ar" ? "حذف جميع المحادثات" : language === "en" ? "Delete All" : "Alles verwijderen";
    const msg = language === "ar" ? `هل تريد حذف جميع المحادثات (${filtered.length})؟` : language === "en" ? `Delete all ${filtered.length} conversations?` : `Alle ${filtered.length} gesprekken verwijderen?`;
    const cancel = language === "ar" ? "إلغاء" : language === "en" ? "Cancel" : "Annuleren";
    const confirm = language === "ar" ? "حذف الكل" : language === "en" ? "Delete All" : "Alles verwijderen";
    Alert.alert(title, msg, [
      { text: cancel, style: "cancel" },
      {
        text: confirm,
        style: "destructive",
        onPress: async () => {
          try {
            for (const conv of filtered) {
              if (conv.dbId) {
                try {
                  await authedFetch(`/api/trpc/aiChat.deleteConversationFromDb`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ json: { dbId: conv.dbId, deviceId: await getDeviceId() } }),
                  });
                } catch (dbErr) { /* ignore */ }
              }
              await AsyncStorage.removeItem(`ai_chat_conv_${conv.id}`);
            }
            const idsToRemove = new Set(filtered.map(h => h.id));
            setConversationHistory(prev => prev.filter(h => !idsToRemove.has(h.id)));
            setSelectMode(false);
            setSelectedConvIds(new Set());
          } catch (e) {
            console.error("Error deleting all:", e);
          }
        },
      },
    ]);
  };

  const toggleConvSelection = (convId: string) => {
    setSelectedConvIds(prev => {
      const next = new Set(prev);
      if (next.has(convId)) next.delete(convId);
      else next.add(convId);
      return next;
    });
  };

  const shareConversation = async (convId: string, dbId?: number) => {
    try {
      // Server first, exactly like resumeConversation. Reading only local
      // storage meant every server-backed consultation failed to share: those
      // are listed with id `db_<dbId>` and have no `ai_chat_conv_db_<dbId>`
      // entry, so sharing one always said "conversation not found" — and the
      // local copy, where it exists at all, can be an older, shorter version
      // that stops before the treatment plan.
      let msgs: ChatMessage[] = [];
      if (dbId) {
        try {
          const res = await authedFetch(`/api/trpc/aiChat.getConversationFromDb`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ json: { dbId, deviceId: await getDeviceId() } }),
          });
          const conv = (await res.json())?.result?.data?.json;
          if (conv?.messages?.length) msgs = conv.messages;
        } catch {
          // fall through to the local copy
        }
      }
      if (msgs.length === 0) {
        const stored = await AsyncStorage.getItem(`ai_chat_conv_${convId}`);
        if (!stored) {
          Alert.alert(language === "ar" ? "خطأ" : "Error", language === "ar" ? "لم يتم العثور على المحادثة" : "Conversation not found");
          return;
        }
        msgs = JSON.parse(stored).messages || [];
      }
      const conv = conversationHistory.find(h => h.id === convId);
      const title = conv?.title || (language === "ar" ? "استشارة" : "Consultation");
      const childName = conv?.childName || "";
      const date = conv ? new Date(conv.createdAt).toLocaleDateString(language === "ar" ? "ar-SA" : "en-US") : "";

      // A real .docx. Word-flavoured HTML named .doc and then RTF both failed
      // to open on his phone; .docx is the format Word actually is, so no
      // viewer has to guess. Built in lib/consultation-docx.ts, which is
      // verified against a real unzip and an XML parser — the failure mode here
      // is a corrupt archive, which no type check can see.
      const isAr = language === "ar";
      const docBytes = buildConsultationDocx({
        title,
        childName,
        date,
        messages: msgs.map((m) => ({ role: m.role, content: m.content })),
        isArabic: isAr,
      });

      if (Platform.OS === "web") {
        if (navigator.clipboard) {
          // Plain readable text on the clipboard, never the RTF control words.
          const plain = msgs
            .map((m) => `${m.role === "user" ? (isAr ? "أنت" : "You") : (isAr ? "المستشار" : "Advisor")}:\n${m.content}`)
            .join("\n\n");
          await navigator.clipboard.writeText(`${title}\n\n${plain}`);
          Alert.alert(language === "ar" ? "تم النسخ" : "Copied", language === "ar" ? "تم نسخ الاستشارة إلى الحافظة" : "Consultation copied to clipboard");
        }
      } else {
        const safeName = (childName || title).replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 40) || "consultation";
        const fileUri = FileSystem.documentDirectory + `${safeName}_${Date.now()}.docx`;
        // Binary, so base64 — Hermes has no Buffer.
        await FileSystem.writeAsStringAsync(fileUri, toBase64(docBytes), { encoding: FileSystem.EncodingType.Base64 });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(fileUri, {
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            dialogTitle: language === "ar" ? "مشاركة الاستشارة" : "Share consultation",
          });
        }
      }
    } catch (e) {
      console.error("Error sharing conversation:", e);
    }
  };

  const sendMessageWithText = useCallback(async (text: string) => {
    if ((!text.trim() && attachments.length === 0) || isLoading) return;

    const currentAttachments = [...attachments];
    // One definition, used for the bubble, the stored history and the message
    // actually sent — they were written twice and could drift apart.
    // Covers a DOCUMENT-only turn as well: that has no dataUrl, so keying on
    // images alone still left an attachment-only turn rendering blank.
    const attachmentOnlyPrompt =
      language === "ar" ? "ما الذي تراه في هذا المرفق؟"
      : language === "en" ? "What do you see in this attachment?"
      : "Wat zie je in deze bijlage?";
    const bubbleText =
      text.trim() || (currentAttachments.length > 0 ? attachmentOnlyPrompt : "");
    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}_user`,
      role: "user",
      content: bubbleText,
      // Without dataUrl. Nothing reads it back — the thread renders from `uri`
      // and the send path uses currentAttachments — so keeping it here pinned up
      // to 3 x 4 MB of base64 in the JS heap for the life of the screen, per
      // photo turn. cleanMessages strips it at persist time; this stops it
      // being held in the first place.
      attachments:
        currentAttachments.length > 0
          ? currentAttachments.map((a) => ({ ...a, dataUrl: undefined }))
          : undefined,
      createdAt: new Date().toISOString(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInputText("");
    setAttachments([]);
    setIsLoading(true);

    try {
      let response: any;

      // Images travel as bytes, in `images` below — the model can only look at
      // a picture that is actually sent. Anything WITHOUT bytes still gets a
      // text description, because a named file the model cannot open is better
      // acknowledged than silently dropped.
      const imageDataUrls = currentAttachments
        .map((a) => a.dataUrl)
        .filter((u): u is string => typeof u === "string" && u.length > 0);
      let messageText = text.trim();
      // An image-only turn used to carry `[صورة مرفقة: name]` as its text; now
      // that the picture travels properly, that text is gone and messageText
      // would be "". The server titles a conversation from it, the history list
      // renders that title, and both would be blank — so ask the obvious
      // question instead of sending nothing.
      if (!messageText && currentAttachments.length > 0) messageText = attachmentOnlyPrompt;
      const undescribed = currentAttachments.filter((a) => !a.dataUrl);
      if (undescribed.length > 0) {
        const attachDesc = undescribed.map(a =>
          a.type === "image" ? `[صورة مرفقة: ${a.name}]` : `[ملف مرفق: ${a.name}]`
        ).join("\n");
        messageText = messageText ? `${messageText}\n\n${attachDesc}` : attachDesc;
      }

      // Build environment context for the selected child
      const childEnv = selectedChild?.id ? (appState.environments || []).find((e: any) => e.childId === selectedChild.id) : null;
      let parentContext = "";
      if (childEnv && Object.keys(childEnv).some(k => k !== "childId" && (childEnv as any)[k])) {
        const envEntries = Object.entries(childEnv).filter(([k, v]) => k !== "childId" && v);
        const envLines = envEntries.map(([k, v]) => `- ${k}: ${v}`).join("\n");
        parentContext = language === "ar" 
          ? `=== تحليل بيئة الطفل ===\n${envLines}`
          : language === "en"
            ? `=== Child Environment Analysis ===\n${envLines}`
            : `=== Omgevingsanalyse Kind ===\n${envLines}`;
      }

      let gateStatus = 0;
      if (!conversationId) {
        const res = await authedFetch(`/api/trpc/aiChat.startConversation`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            json: {
              childId: selectedChild?.id,
              childName: selectedChild?.name,
              childAge: selectedChild?.age,
              type: "freeform",
              language,
              initialMessage: messageText,
              parentContext: parentContext || undefined,
              consultationType,
              parentGender: appState.parentProfile?.gender || undefined,
              // Omitted entirely when nothing is attached, so a text-only turn
              // sends the exact body it always has. The server bounds count and
              // size and drops anything it will not vouch for
              // (server/chat-attachments.ts in rabbaanie-api).
              images: imageDataUrls.length > 0 ? imageDataUrls : undefined,
            },
          }),
        });
        gateStatus = res.ok ? 0 : res.status;
        const data = await res.json();
        response = data.result?.data?.json || data.result?.data;
        if (response?.conversationId) {
          setConversationId(response.conversationId);
        }
      } else {
        const res = await authedFetch(`/api/trpc/aiChat.sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            json: {
              conversationId,
              message: messageText,
              language,
              childName: selectedChild?.name,
              childAge: selectedChild?.age,
              parentContext: parentContext || undefined,
              consultationType,
              parentGender: appState.parentProfile?.gender || undefined,
              // Omitted entirely when nothing is attached, so a text-only turn
              // sends the exact body it always has. The server bounds count and
              // size and drops anything it will not vouch for
              // (server/chat-attachments.ts in rabbaanie-api).
              images: imageDataUrls.length > 0 ? imageDataUrls : undefined,
            },
          }),
        });
        gateStatus = res.ok ? 0 : res.status;
        const data = await res.json();
        response = data.result?.data?.json || data.result?.data;
      }

      const aiContent =
        response?.response ||
        accessDeniedMessage(gateStatus, language) ||
        getOfflineResponse(text, language);
      const hasActionPlan = detectActionPlan(aiContent);

      // Auto-save action plan when detected (so it persists even if user exits)
      if (hasActionPlan) {
        try {
          // Through the shared queue: this appends to the same one-blob store
          // cachePlanProgress and the deletes use, so an un-queued append can
          // drop a concurrent progress write or resurrect a deleted plan.
          await withPlanStore(async () => {
          const existing = await AsyncStorage.getItem("@advisor_action_plans");
          const plans = existing ? JSON.parse(existing) : [];
          const parsedPhases = parseActionPlanSteps(aiContent, language);
          const newPlan = {
            id: `plan_${Date.now()}`,
            content: aiContent,
            phases: parsedPhases,
            childId: selectedChild?.id,
            childName: selectedChild?.name,
            savedAt: new Date().toISOString(),
            startDate: new Date().toISOString(),
            language,
            completedSteps: [],
            autoSaved: true,
          };
          plans.push(newPlan);
          await AsyncStorage.setItem("@advisor_action_plans", JSON.stringify(plans));
          // Also sync to server via app context (visible to partner)
          saveActionPlanToContext(newPlan).catch(() => {});
          });
        } catch (e) {
          console.error("Auto-save action plan error:", e);
        }
      }

      const assistantMessage: ChatMessage = {
        id: `msg_${Date.now()}_ai`,
        role: "assistant",
        content: aiContent,
        createdAt: new Date().toISOString(),
        hasActionPlan,
      };

      const updatedMessages = [...newMessages, assistantMessage];
      setMessages(updatedMessages);
      const convId = conversationId || response?.conversationId || `local_${Date.now()}`;
      if (!conversationId) setConversationId(convId);
      saveConversation(convId, updatedMessages);
    } catch (error) {
      const assistantMessage: ChatMessage = {
        id: `msg_${Date.now()}_ai`,
        role: "assistant",
        content: getOfflineResponse(text, language),
        createdAt: new Date().toISOString(),
      };
      const updatedMessages = [...newMessages, assistantMessage];
      setMessages(updatedMessages);
      saveConversation(`local_${Date.now()}`, updatedMessages);
    } finally {
      setIsLoading(false);
    }
  }, [messages, conversationId, language, selectedChild, isLoading, attachments]);

  const sendMessage = useCallback(async () => {
    await sendMessageWithText(inputText);
  }, [inputText, sendMessageWithText]);

  const startNewChat = () => {
    setMessages([]);
    setConversationId(null);
    setCurrentDbId(null);
    setAttachments([]);
    setInputText("");
    setSelectedChild(null);
    setChildSelectionPhase("select");
    setCustomChildAge("");
    setCustomChildName("");
  };

  // Detect if AI response contains an action plan
  const detectActionPlan = (content: string): boolean => {
    const planIndicators = [
      "خطة عملية", "أهداف يومية", "الخطوة الأولى", "الخطوة الثانية",
      "action plan", "daily goals", "step 1", "step 2",
      "actieplan", "dagelijkse doelen", "stap 1", "stap 2",
      "١.", "٢.", "٣.", "1.", "2.", "3.",
    ];
    return planIndicators.some(indicator => content.toLowerCase().includes(indicator.toLowerCase()));
  };


  // Save action plan to weekly tips with structured steps + schedule child-specific reminder
  const saveActionPlanToWeekly = async (messageContent: string) => {
    try {
      // Same shared queue as every other writer of this key. It hands the new
      // plan back so the child-specific store below still gets it.
      const newPlan = await withPlanStore(async () => {
      const existing = await AsyncStorage.getItem("@advisor_action_plans");
      const plans = existing ? JSON.parse(existing) : [];
      const parsedPhases = parseActionPlanSteps(messageContent, language);
      const plan = {
        id: `plan_${Date.now()}`,
        content: messageContent,
        phases: parsedPhases,
        childId: selectedChild?.id,
        childName: selectedChild?.name,
        childAge: selectedChild?.age,
        savedAt: new Date().toISOString(),
        startDate: new Date().toISOString(),
        language,
        completedSteps: [],
      };
      plans.push(plan);
      await AsyncStorage.setItem("@advisor_action_plans", JSON.stringify(plans));
      // Also sync to server via app context (visible to partner)
      saveActionPlanToContext(plan).catch(() => {});
      return plan;
      });

      // Also save to child-specific storage for the child detail screen
      if (selectedChild?.id && !selectedChild.id.startsWith("other_")) {
        const childPlansKey = `@child_plans_${selectedChild.id}`;
        const childPlansRaw = await AsyncStorage.getItem(childPlansKey);
        const childPlans = childPlansRaw ? JSON.parse(childPlansRaw) : [];
        childPlans.push(newPlan);
        await AsyncStorage.setItem(childPlansKey, JSON.stringify(childPlans));
      }

      // Schedule daily reminder for this plan's steps
      try {
        const { scheduleWeeklyGoalsNotification } = require("@/lib/weekly-goals-notification");
        await scheduleWeeklyGoalsNotification();
      } catch (notifErr) {
        // Non-critical: notification scheduling may fail on web
      }
      
      const alertTitle = language === "ar" ? "تم الحفظ" : language === "en" ? "Saved" : "Opgeslagen";
      const alertMsg = language === "ar" 
        ? "تم إدراج الخطة في برنامجك الأسبوعي وسيتم تذكيرك يومياً بالإجراءات. ستجد الخطوات في تبويب الأسبوعي وفي قسم الطفل."
        : language === "en"
          ? "Plan saved to your weekly program. You'll be reminded daily. Find the steps in the Weekly tab and child section."
          : "Plan opgeslagen in je weekprogramma. Je wordt dagelijks herinnerd. Vind de stappen in het tabblad Wekelijks en kindsectie.";
      Alert.alert(alertTitle, alertMsg);
    } catch (e) {
      console.error("Error saving action plan:", e);
    }
  };

  // Pick image from gallery
  /**
   * Whether one more attachment fits, telling the user plainly when it does
   * not. Refusing at pick time is the point: the alternative is the send
   * failing with a 400 that this screen renders as offline advice, so the
   * parent believes the model looked at their photo.
   */
  const acceptAttachment = (base64Length: number, isImage: boolean): boolean => {
    // Counted against IMAGES only, because that is what the server bounds.
    // Counting documents in the same total made the client cap a different
    // quantity from MAX_IMAGES while looking like it matched.
    const imageCount = attachments.filter((a) => a.type === "image").length;
    const tooMany = isImage && imageCount >= MAX_IMAGE_ATTACHMENTS;
    // +32 covers the `data:image/jpeg;base64,` prefix the server also counts.
    const tooBig = base64Length + 32 > MAX_ATTACHMENT_DATA_URL_LENGTH;
    if (!tooMany && !tooBig) return true;
    Alert.alert(
      tooMany
        ? (language === "ar" ? "٣ صور كحدٍّ أقصى" : language === "en" ? "Up to 3 images" : "Maximaal 3 afbeeldingen")
        : (language === "ar" ? "الصورة كبيرة جدًا" : language === "en" ? "Image too large" : "Afbeelding te groot"),
      tooMany
        ? (language === "ar" ? "احذف واحدة قبل إضافة أخرى." : language === "en" ? "Remove one before adding another." : "Verwijder er eerst een voordat u een nieuwe toevoegt.")
        : (language === "ar" ? "اختر صورة أصغر، أو التقط صورة جديدة بتفاصيل أقل." : language === "en" ? "Choose a smaller photo, or take a new one at lower detail." : "Kies een kleinere foto, of maak een nieuwe met minder detail."),
    );
    return false;
  };

  const pickImage = async () => {
    setShowAttachMenu(false);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        // 0.4, not 0.8. A 12 MP photo at 0.8 is 2-4 MB, i.e. ~2.7-5.3 MB of
        // base64, so the previous bound refused every real photo — a guard that
        // rejects the typical input is an outage with a message. Downscaling
        // would be the proper fix (vision models resize to ~1568px anyway) but
        // needs expo-image-manipulator, a new NATIVE dependency, and a native
        // addition has already broken this project's Gradle build once on a
        // Kotlin metadata mismatch that no JS check could see.
        quality: 0.4,
        // The server accepts inline data: URLs only, so the bytes come back
        // with the pick.
        base64: true,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        if (!asset.base64) {
          // Without bytes this would fall back to the filename-only send that
          // this whole change exists to remove — the model would be told a name
          // and the parent would get advice about nothing. Say so instead.
          Alert.alert(
            language === "ar" ? "تعذّر قراءة الصورة" : language === "en" ? "Could not read the image" : "Afbeelding niet leesbaar",
            language === "ar" ? "جرّب صورة أخرى." : language === "en" ? "Try a different photo." : "Probeer een andere foto.",
          );
          return;
        }
        if (!acceptAttachment(asset.base64.length, true)) return;
        setAttachments(prev => [...prev, {
          uri: asset.uri,
          name: asset.fileName || `image_${Date.now()}.jpg`,
          type: "image",
          // Always image/jpeg: expo-image-picker's own type says `base64` is
          // "a Base64-encoded string of the selected image's JPEG data" and
          // documents prepending `data:image/jpeg;base64,`. Using asset.mimeType
          // labelled a picked PNG as PNG while the bytes were JPEG, which is a
          // corrupt input as far as the model provider is concerned.
          // Unconditional: the !asset.base64 guard above already returned, so
          // the ternary here could never take its false branch.
          dataUrl: `data:image/jpeg;base64,${asset.base64}`,
          // image/jpeg to match dataUrl: ImagePicker returns JPEG bytes whatever
          // the source format, so asset.mimeType would contradict what we send.
          mimeType: "image/jpeg",
        }]);
      }
    } catch (e) {
      console.error("Error picking image:", e);
    }
  };

  // Take photo with camera
  const takePhoto = async () => {
    setShowAttachMenu(false);
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          language === "ar" ? "تحتاج إذن الكاميرا" : "Camera permission needed",
          language === "ar" ? "يرجى السماح بالوصول للكاميرا" : "Please allow camera access"
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.4, // see pickImage
        base64: true,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        if (!asset.base64) {
          // Without bytes this would fall back to the filename-only send that
          // this whole change exists to remove — the model would be told a name
          // and the parent would get advice about nothing. Say so instead.
          Alert.alert(
            language === "ar" ? "تعذّر قراءة الصورة" : language === "en" ? "Could not read the image" : "Afbeelding niet leesbaar",
            language === "ar" ? "جرّب صورة أخرى." : language === "en" ? "Try a different photo." : "Probeer een andere foto.",
          );
          return;
        }
        if (!acceptAttachment(asset.base64.length, true)) return;
        setAttachments(prev => [...prev, {
          uri: asset.uri,
          name: `photo_${Date.now()}.jpg`,
          type: "image",
          // Always image/jpeg: expo-image-picker's own type says `base64` is
          // "a Base64-encoded string of the selected image's JPEG data" and
          // documents prepending `data:image/jpeg;base64,`. Using asset.mimeType
          // labelled a picked PNG as PNG while the bytes were JPEG, which is a
          // corrupt input as far as the model provider is concerned.
          // Unconditional: the !asset.base64 guard above already returned, so
          // the ternary here could never take its false branch.
          dataUrl: `data:image/jpeg;base64,${asset.base64}`,
          mimeType: "image/jpeg",
        }]);
      }
    } catch (e) {
      console.error("Error taking photo:", e);
    }
  };

  // Pick document
  const pickDocument = async () => {
    setShowAttachMenu(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        // No base64 check here, and no size bound: a DocumentPicker asset never
        // carries base64, and a PDF is not something the model can look at
        // anyway. Documents keep the filename description they always had —
        // which is honest for a file the model cannot open — so only the count
        // applies. Applying the image guard here rejected every PDF, Word file
        // and text file with "Could not read the image".
        if (!acceptAttachment(0, false)) return;
        setAttachments(prev => [...prev, {
          uri: asset.uri,
          name: asset.name || `file_${Date.now()}`,
          type: "file",
          mimeType: asset.mimeType || "application/pdf",
        }]);
      }
    } catch (e) {
      console.error("Error picking document:", e);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  /**
   * One step back, not out.
   *
   * Every in-screen layer was invisible to the old handler: with the history
   * panel open, or a consultation resumed, it fell straight through to
   * router.back() and left the advisor for the home screen. Android's hardware
   * back never consulted it at all, so it always exited.
   */
  const goBackOneStep = useCallback(() => {
    if (showHistory) { setShowHistory(false); return true; }
    if (messages.length > 0) { startNewChat(); return true; }
    if (childSelectionPhase === "age_input") { setChildSelectionPhase("select"); return true; }
    if (childSelectionPhase === "ready") {
      setChildSelectionPhase("select");
      setSelectedChild(null);
      setConsultationType("child");
      return true;
    }
    router.back();
    return true;
  }, [showHistory, messages.length, childSelectionPhase]);

  // Android's physical/gesture back, which previously bypassed all of the above.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", goBackOneStep);
    return () => sub.remove();
  }, [goBackOneStep]);

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    // Once per message, not twice. Both the renderer choice and the save button
    // asked independently, and this list mounts every item up front
    // (initialNumToRender is the full thread) and re-renders whole whenever the
    // screen's state changes, so the scan was paid 2x per message per render.
    const showsPlan = item.role !== "user" && (item.hasActionPlan || detectActionPlan(item.content));
    const isUser = item.role === "user";
    return (
      <View style={[
        styles.messageBubble,
        isUser ? styles.userBubble : styles.aiBubble,
        { backgroundColor: isUser ? colors.primary : colors.surface },
      ]}>
        {!isUser && (
          <View style={styles.aiHeader}>
            <IconSymbol name="lightbulb.fill" size={14} color={colors.primary} />
            <Text style={[styles.aiLabel, { color: colors.primary }]}>
              {language === "ar" ? "المستشار التربوي" : language === "en" ? "Parenting Advisor" : "Opvoedadviseur"}
            </Text>
          </View>
        )}
        
        {/* Show attachment thumbnails */}
        {item.attachments && item.attachments.length > 0 && (
          <View style={styles.attachmentPreviewRow}>
            {item.attachments.map((att, idx) => (
              <View key={idx} style={[styles.attachmentThumb, { borderColor: colors.border }]}>
                {att.type === "image" && att.uri ? (
                  <Image source={{ uri: att.uri }} style={styles.attachmentImage} />
                ) : (
                  <View style={styles.fileThumb}>
                    <IconSymbol name="doc.text.fill" size={16} color={colors.muted} />
                    <Text style={[styles.fileName, { color: colors.muted }]} numberOfLines={1}>{att.name}</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {isUser ? (
          <Text style={[
            styles.messageText,
            { color: "#FFFFFF" },
            language === "ar" && styles.rtlText,
          ]}>
            {item.content}
          </Text>
        ) : (
          <View style={language === "ar" ? { direction: "rtl" } as any : undefined}>
            {showsPlan ? (
              <TreatmentPlanRenderer
                planText={item.content}
                issueId={item.id}
                colors={colors as any}
              />
            ) : (
              <AdvisorBody content={item.content} colors={colors} isRTL={language === "ar"} />
            )}

            {/* Inside this wrapper, not after it. As a sibling it sat on top of
                the last folded section: the wrapper carries direction:"rtl",
                whose measured height Android reports short, so the next sibling
                began before the content ended. Laid out among the sections it
                simply follows them, and the divider keeps it visibly its own
                thing rather than part of the last fold. */}
            {showsPlan && (
              <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
                <Pressable
                  onPress={() => saveActionPlanToWeekly(item.content)}
                  style={({ pressed }) => [
                    styles.actionPlanBtn,
                    { alignSelf: "flex-start", backgroundColor: colors.success + "20", borderColor: colors.success },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <IconSymbol name="checkmark.circle.fill" size={16} color={colors.success} />
                  <Text style={[styles.actionPlanText, { color: colors.success }]}>
                    {language === "ar" ? "نقل الخطة للنصائح الأسبوعية" : language === "en" ? "Save plan to weekly tips" : "Plan opslaan in wekelijkse tips"}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {/* Required on AI output by Play's AI-Generated Content policy. */}
        {!isUser && <ReportAiContent content={item.content} surface="ai-chat" />}
      </View>
    );
  };

  const placeholderText = language === "ar"
    ? "اكتب سؤالك عن التربية..."
    : language === "en"
      ? "Ask your parenting question..."
      : "Stel je opvoedvraag...";

  const welcomeTitle = language === "ar"
    ? "المستشار التربوي الإسلامي"
    : language === "en"
      ? "Islamic Parenting Advisor"
      : "Islamitische Opvoedadviseur";

    const welcomeSubtitle = consultationType === "spouse"
    ? (language === "ar"
      ? "اسأل أي سؤال حول العلاقة الزوجية وفق المنهج الإسلامي"
      : language === "en"
        ? "Ask any question about your marital relationship according to Islamic guidance"
        : "Stel elke vraag over uw huwelijksrelatie volgens islamitische begeleiding")
    : consultationType === "general"
    ? (language === "ar"
      ? "اسأل أي سؤال عام عن التربية الإسلامية"
      : language === "en"
        ? "Ask any general question about Islamic parenting"
        : "Stel een algemene vraag over islamitische opvoeding")
    : (language === "ar"
      ? "اسأل أي سؤال عن تربية أطفالك وفق منهج التصفية والتزكية والتربية"
      : language === "en"
        ? "Ask any question about raising your children according to the Tasfiya-Tazkiya-Tarbiya method"
        : "Stel elke vraag over het opvoeden van je kinderen volgens de Tasfiya-Tazkiya-Tarbiya methode");

  // Different suggestions based on consultation type
  const childSuggestions = language === "ar"
    ? ["كيف أعلم طفلي الصلاة؟", "طفلي يكذب، ماذا أفعل؟", "كيف أغرس حب القرآن؟", "طفلي عنيد جداً"]
    : language === "en"
      ? ["How do I teach my child to pray?", "My child lies, what do I do?", "How to instill love for Qur'aan?", "My child is very stubborn"]
      : ["Hoe leer ik mijn kind bidden?", "Mijn kind liegt, wat moet ik doen?", "Hoe plant ik liefde voor de Qur'aan?", "Mijn kind is erg koppig"];

  const spouseSuggestions = language === "ar"
    ? ["كيف أحسّن التعامل مع زوجتي؟", "كيف نبني السكينة والمودة؟", "زوجتي لا تلتزم بالحجاب، كيف أنصحها؟", "كيف نتفق على تربية الأولاد؟"]
    : language === "en"
      ? ["How can I improve communication with my wife?", "How to build tranquility and love?", "My wife doesn't wear hijab, how to advise?", "How to agree on children's upbringing?"]
      : ["Hoe verbeter ik de communicatie met mijn vrouw?", "Hoe bouw je rust en liefde op?", "Mijn vrouw draagt geen hijab, hoe adviseer ik?", "Hoe worden we het eens over opvoeding?"];

  const generalSuggestions = language === "ar"
    ? ["كيف أبني بيتاً مسلماً متماسكاً؟", "ما أسس التربية الإسلامية؟", "كيف أتعامل مع ضغوط المجتمع؟", "كيف أربّي أبنائي على التوحيد؟"]
    : language === "en"
      ? ["How to build a strong Muslim household?", "What are the foundations of Islamic parenting?", "How to deal with societal pressures?", "How to raise children upon Tawheed?"]
      : ["Hoe bouw ik een sterk moslimgezin?", "Wat zijn de grondslagen van islamitische opvoeding?", "Hoe ga ik om met maatschappelijke druk?", "Hoe voed ik kinderen op met Tawheed?"];

  const suggestions = consultationType === "spouse" ? spouseSuggestions : consultationType === "general" ? generalSuggestions : childSuggestions;

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={goBackOneStep} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}>
            <IconSymbol name="chevron.right" size={24} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>{welcomeTitle}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Pressable onPress={() => { setHistoryFilter(null); loadConversationHistory(); setShowHistory(true); }} style={({ pressed }) => [styles.newChatBtn, pressed && { opacity: 0.6 }]}>
              <IconSymbol name="clock.fill" size={20} color={colors.primary} />
            </Pressable>
            <Pressable onPress={startNewChat} style={({ pressed }) => [styles.newChatBtn, pressed && { opacity: 0.6 }]}>
              <IconSymbol name="pencil" size={20} color={colors.primary} />
            </Pressable>
          </View>
        </View>

        {/* MODAL: Conversation History */}
        {showHistory && (
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, backgroundColor: colors.background }}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
              <Pressable onPress={() => { setShowHistory(false); setSelectMode(false); setSelectedConvIds(new Set()); setHistoryFilter(null); }} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}>
                <IconSymbol name="chevron.right" size={24} color={colors.foreground} />
              </Pressable>
              <Text style={[styles.headerTitle, { color: colors.foreground }]}>
                {historyFilter ? historyFilter : (language === "ar" ? "المحادثات السابقة" : language === "en" ? "Previous Conversations" : "Eerdere Gesprekken")}
              </Text>
              <Pressable onPress={() => { setSelectMode(!selectMode); setSelectedConvIds(new Set()); }} style={({ pressed }) => [{ padding: 6, opacity: pressed ? 0.6 : 1 }]}>
                <IconSymbol name={selectMode ? "checkmark.circle.fill" : "checkmark.circle"} size={22} color={selectMode ? colors.primary : colors.muted} />
              </Pressable>
            </View>

            {/* Search bar */}
            <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 }}>
              <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border }}>
                <IconSymbol name="magnifyingglass" size={16} color={colors.muted} />
                <TextInput
                  value={historySearch}
                  onChangeText={setHistorySearch}
                  placeholder={language === "ar" ? "ابحث في المحادثات..." : language === "en" ? "Search conversations..." : "Zoek gesprekken..."}
                  placeholderTextColor={colors.muted}
                  style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 8, fontSize: 14, color: colors.foreground, textAlign: language === "ar" ? "right" : "left" }}
                  returnKeyType="search"
                />
                {historySearch.length > 0 && (
                  <Pressable onPress={() => setHistorySearch("")} style={({ pressed }) => [{ padding: 4, opacity: pressed ? 0.6 : 1 }]}>
                    <IconSymbol name="xmark.circle.fill" size={16} color={colors.muted} />
                  </Pressable>
                )}
              </View>
            </View>

            {/* Filter chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, gap: 8 }} style={{ maxHeight: 52 }}>
              <Pressable
                onPress={() => setHistoryFilter(null)}
                style={({ pressed }) => [{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: !historyFilter ? colors.primary : colors.surface, borderWidth: 1, borderColor: !historyFilter ? colors.primary : colors.border, opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={{ color: !historyFilter ? "#FFF" : colors.muted, fontSize: 12, fontWeight: "600" }}>
                  {language === "ar" ? "الكل" : language === "en" ? "All" : "Alles"}
                </Text>
              </Pressable>
              {Array.from(new Set(conversationHistory.map(h => h.childName).filter(Boolean))).map(name => (
                <Pressable
                  key={name}
                  onPress={() => setHistoryFilter(historyFilter === name ? null : name!)}
                  style={({ pressed }) => [{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: historyFilter === name ? colors.primary : colors.surface, borderWidth: 1, borderColor: historyFilter === name ? colors.primary : colors.border, opacity: pressed ? 0.7 : 1 }]}
                >
                  <Text style={{ color: historyFilter === name ? "#FFF" : colors.muted, fontSize: 12, fontWeight: "600" }}>
                    {name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Action bar for select mode */}
            {selectMode && (
              <View style={{ flexDirection: "row", paddingHorizontal: 16, paddingVertical: 8, gap: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Pressable
                  onPress={deleteSelectedConversations}
                  style={({ pressed }) => [{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: selectedConvIds.size > 0 ? colors.error : colors.surface, alignItems: "center" as const, opacity: pressed ? 0.7 : 1 }]}
                >
                  <Text style={{ color: selectedConvIds.size > 0 ? "#FFF" : colors.muted, fontSize: 13, fontWeight: "600" }}>
                    {language === "ar" ? `حذف المحدد (${selectedConvIds.size})` : language === "en" ? `Delete Selected (${selectedConvIds.size})` : `Verwijder (${selectedConvIds.size})`}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={deleteAllConversations}
                  style={({ pressed }) => [{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: colors.error + "20", alignItems: "center" as const, opacity: pressed ? 0.7 : 1 }]}
                >
                  <Text style={{ color: colors.error, fontSize: 13, fontWeight: "600" }}>
                    {language === "ar" ? "حذف الكل" : language === "en" ? "Delete All" : "Alles verwijderen"}
                  </Text>
                </Pressable>
              </View>
            )}

            {/* Conversation list */}
            <FlatList
              data={conversationHistory.filter(h => {
                if (historyFilter && h.childName !== historyFilter) return false;
                if (historySearch.trim()) {
                  const q = historySearch.toLowerCase();
                  return (h.title?.toLowerCase().includes(q) || h.childName?.toLowerCase().includes(q));
                }
                return true;
              })}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 16, gap: 12 }}
              ListEmptyComponent={
                <View style={{ alignItems: "center", paddingTop: 60 }}>
                  <IconSymbol name="bubble.left.and.bubble.right.fill" size={40} color={colors.muted} />
                  <Text style={{ color: colors.muted, fontSize: 15, marginTop: 12 }}>
                    {language === "ar" ? "لا توجد محادثات سابقة" : language === "en" ? "No previous conversations" : "Geen eerdere gesprekken"}
                  </Text>
                </View>
              }
              renderItem={({ item }) => (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  {/* Checkbox in select mode */}
                  {selectMode && (
                    <Pressable
                      onPress={() => toggleConvSelection(item.id)}
                      style={({ pressed }) => [{ width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: selectedConvIds.has(item.id) ? colors.primary : colors.border, backgroundColor: selectedConvIds.has(item.id) ? colors.primary : "transparent", alignItems: "center" as const, justifyContent: "center" as const, opacity: pressed ? 0.7 : 1 }]}
                    >
                      {selectedConvIds.has(item.id) && <IconSymbol name="checkmark" size={14} color="#FFF" />}
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => selectMode ? toggleConvSelection(item.id) : resumeConversation(item.id, item.dbId)}
                    style={({ pressed }) => [{
                      backgroundColor: selectedConvIds.has(item.id) ? colors.primary + "10" : colors.surface,
                      borderRadius: 12,
                      padding: 14,
                      borderWidth: 1,
                      borderColor: selectedConvIds.has(item.id) ? colors.primary : colors.border,
                      opacity: pressed ? 0.7 : 1,
                      flex: 1,
                    }]}
                  >
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                        <Text style={{ fontSize: 16 }}>
                          {item.consultationType === "spouse" ? "💑" : item.consultationType === "general" ? "✨" : "👶"}
                        </Text>
                        <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "600", flex: 1 }} numberOfLines={1}>
                          {item.childName || (language === "ar" ? "سؤال عام" : "General")}
                        </Text>
                      </View>
                      <Text style={{ color: colors.muted, fontSize: 11 }}>
                        {new Date(item.createdAt).toLocaleDateString(language === "ar" ? "ar-SA" : language === "en" ? "en-US" : "nl-NL")}
                      </Text>
                    </View>
                    <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 18 }} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <Text style={{ color: colors.primary, fontSize: 11, marginTop: 4 }}>
                      {item.messageCount} {language === "ar" ? "رسالة" : language === "en" ? "messages" : "berichten"}
                    </Text>
                  </Pressable>
                  {/* Share & Delete buttons (only in non-select mode) */}
                  {!selectMode && (
                    <View style={{ gap: 6 }}>
                      <Pressable
                        onPress={() => shareConversation(item.id, item.dbId)}
                        style={({ pressed }) => [{
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          backgroundColor: colors.primary + "15",
                          alignItems: "center" as const,
                          justifyContent: "center" as const,
                          opacity: pressed ? 0.6 : 1,
                        }]}
                      >
                        <IconSymbol name="square.and.arrow.up" size={16} color={colors.primary} />
                      </Pressable>
                      <Pressable
                        onPress={() => deleteConversation(item.id, item.dbId)}
                        style={({ pressed }) => [{
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          backgroundColor: colors.error + "15",
                          alignItems: "center" as const,
                          justifyContent: "center" as const,
                          opacity: pressed ? 0.6 : 1,
                        }]}
                      >
                        <IconSymbol name="trash.fill" size={18} color={colors.error} />
                      </Pressable>
                    </View>
                  )}
                </View>
              )}
            />
          </View>
        )}

        {/* Content area - takes remaining space */}
        <View style={{ flex: 1 }}>

        {/* PHASE: Child Selection (mandatory before chat) */}
        {childSelectionPhase === "select" && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.welcomeContainer} keyboardShouldPersistTaps="handled">
            <IconSymbol name="bubble.left.and.bubble.right.fill" size={48} color={colors.primary} />
            <Text style={[styles.welcomeTitle, { color: colors.foreground }]}>{welcomeTitle}</Text>
            <Text style={[styles.welcomeSubtitle, { color: colors.muted }]}>
              {language === "ar" ? "عن أي طفل تريد أن تسأل؟" : language === "en" ? "Which child is this about?" : "Over welk kind gaat je vraag?"}
            </Text>

            <View style={[styles.suggestionsContainer, { marginTop: 20 }]}>
              {[...children].sort((a: any, b: any) => {
                const ageA = a.birthDate ? calculateAgeInWeeks(a.birthDate).years : 5;
                const ageB = b.birthDate ? calculateAgeInWeeks(b.birthDate).years : 5;
                return ageB - ageA; // oldest first
              }).map((child: any) => {
                const age = getChildAge(child);
                return (
                  <View key={child.id} style={{ flexDirection: "row", alignItems: "center", gap: 6, width: "100%" }}>
                    <Pressable
                      onPress={() => {
                        setSelectedChild({ id: child.id, name: child.name, age });
                        setChildSelectionPhase("ready");
                      }}
                      style={({ pressed }) => [
                        styles.suggestionChip,
                        { backgroundColor: colors.primary + "15", borderColor: colors.primary, flex: 1 },
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <Text style={[styles.suggestionText, { color: colors.primary, fontWeight: "600" }]}>
                        {child.name} ({language === "ar" ? `${age} سنوات` : language === "en" ? `${age} years` : `${age} jaar`})
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => { setHistoryFilter(child.name); loadConversationHistory(); setShowHistory(true); }}
                      style={({ pressed }) => [{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center" as const, justifyContent: "center" as const, opacity: pressed ? 0.6 : 1 }]}
                    >
                      <IconSymbol name="clock.fill" size={16} color={colors.muted} />
                    </Pressable>
                  </View>
                );
              })}

              {/* Option: Spouse/Partner */}
              {appState.parentProfile?.partnerName && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, width: "100%" }}>
                  <Pressable
                    onPress={() => {
                      setConsultationType("spouse");
                      setSelectedChild({ id: "spouse", name: appState.parentProfile?.partnerName || "", age: "adult" });
                      setChildSelectionPhase("ready");
                    }}
                    style={({ pressed }) => [
                      styles.suggestionChip,
                      { backgroundColor: "#E8F5E9", borderColor: "#4CAF50", flex: 1 },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Text style={[styles.suggestionText, { color: "#2E7D32", fontWeight: "600" }]}>
                      💑 {appState.parentProfile?.partnerName} ({language === "ar" ? (appState.parentProfile?.gender === "male" ? "زوجتي" : "زوجي") : language === "en" ? (appState.parentProfile?.gender === "male" ? "My wife" : "My husband") : (appState.parentProfile?.gender === "male" ? "Mijn vrouw" : "Mijn man")})
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => { setHistoryFilter(appState.parentProfile?.partnerName || null); loadConversationHistory(); setShowHistory(true); }}
                    style={({ pressed }) => [{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center" as const, justifyContent: "center" as const, opacity: pressed ? 0.6 : 1 }]}
                  >
                    <IconSymbol name="clock.fill" size={16} color={colors.muted} />
                  </Pressable>
                </View>
              )}

              {/* Option: Spouse (if no partner name saved) */}
              {!appState.parentProfile?.partnerName && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, width: "100%" }}>
                  <Pressable
                    onPress={() => {
                      setConsultationType("spouse");
                      setSelectedChild({ id: "spouse", name: language === "ar" ? "الزوج/الزوجة" : "Partner", age: "adult" });
                      setChildSelectionPhase("ready");
                    }}
                    style={({ pressed }) => [
                      styles.suggestionChip,
                      { backgroundColor: "#E8F5E9", borderColor: "#4CAF50", flex: 1 },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Text style={[styles.suggestionText, { color: "#2E7D32", fontWeight: "600" }]}>
                      💑 {language === "ar" ? (appState.parentProfile?.gender === "male" ? "زوجتي" : "زوجي") : language === "en" ? (appState.parentProfile?.gender === "male" ? "My wife" : "My husband") : (appState.parentProfile?.gender === "male" ? "Mijn vrouw" : "Mijn man")}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => { setHistoryFilter(null); loadConversationHistory(); setShowHistory(true); }}
                    style={({ pressed }) => [{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center" as const, justifyContent: "center" as const, opacity: pressed ? 0.6 : 1 }]}
                  >
                    <IconSymbol name="clock.fill" size={16} color={colors.muted} />
                  </Pressable>
                </View>
              )}

              {/* Option: Someone else */}
              <Pressable
                onPress={() => setChildSelectionPhase("age_input")}
                style={({ pressed }) => [
                  styles.suggestionChip,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={[styles.suggestionText, { color: colors.muted }]}>
                  {language === "ar" ? "شخص آخر (غير مسجل)" : language === "en" ? "Someone else (not registered)" : "Iemand anders (niet geregistreerd)"}
                </Text>
              </Pressable>

              {/* Option: General question */}
              <Pressable
                onPress={() => {
                  setConsultationType("general");
                  setSelectedChild({ id: "general", name: language === "ar" ? "سؤال عام" : "General", age: "" });
                  setChildSelectionPhase("ready");
                }}
                style={({ pressed }) => [
                  styles.suggestionChip,
                  { backgroundColor: "#FFF3E0", borderColor: "#FF9800" },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={[styles.suggestionText, { color: "#E65100", fontWeight: "600" }]}>
                  {language === "ar" ? "✨ سؤال عام عن التربية" : language === "en" ? "✨ General parenting question" : "✨ Algemene opvoedvraag"}
                </Text>
              </Pressable>

              {/* Option: Contact a specialist / person of knowledge */}
              <Pressable
                onPress={() => router.push("/find-specialist")}
                style={({ pressed }) => [
                  styles.suggestionChip,
                  { backgroundColor: "#E3F2FD", borderColor: "#1976D2" },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={[styles.suggestionText, { color: "#1565C0", fontWeight: "600" }]}>
                  {language === "ar" ? "📖 التواصل مع متخصص / أهل العلم" : language === "en" ? "📖 Contact a specialist / scholar" : "📖 Contact een specialist / geleerde"}
                </Text>
              </Pressable>
            </View>

            {/* Conversation History Button - prominent */}
            <Pressable
              onPress={() => { setHistoryFilter(null); loadConversationHistory(); setShowHistory(true); }}
              style={({ pressed }) => [{
                marginTop: 24,
                paddingVertical: 14,
                paddingHorizontal: 24,
                borderRadius: 14,
                backgroundColor: colors.primary + "12",
                borderWidth: 1.5,
                borderColor: colors.primary + "40",
                flexDirection: "row" as const,
                alignItems: "center" as const,
                justifyContent: "center" as const,
                gap: 10,
                opacity: pressed ? 0.7 : 1,
                width: "100%",
              }]}
            >
              <IconSymbol name="clock.fill" size={20} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: 15, fontWeight: "700" }}>
                {language === "ar" ? "فتح الاستشارات الماضية" : language === "en" ? "Open past consultations" : "Open eerdere consulten"}
              </Text>
            </Pressable>
          </ScrollView>
        )}

        {/* PHASE: Age input for "someone else" */}
        {childSelectionPhase === "age_input" && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.welcomeContainer} keyboardShouldPersistTaps="handled">
            <IconSymbol name="bubble.left.and.bubble.right.fill" size={36} color={colors.primary} />
            <Text style={[styles.welcomeTitle, { color: colors.foreground, fontSize: 18 }]}>
              {language === "ar" ? "أخبرني عن هذا الشخص" : language === "en" ? "Tell me about this person" : "Vertel me over deze persoon"}
            </Text>

            <View style={{ width: "100%", gap: 12, marginTop: 16 }}>
              <Text style={{ color: colors.muted, fontSize: 13, textAlign: language === "ar" ? "right" : "left" }}>
                {language === "ar" ? "الاسم (اختياري):" : language === "en" ? "Name (optional):" : "Naam (optioneel):"}
              </Text>
              <TextInput
                value={customChildName}
                onChangeText={setCustomChildName}
                placeholder={language === "ar" ? "مثال: أحمد" : language === "en" ? "e.g. Ahmad" : "bijv. Ahmad"}
                placeholderTextColor={colors.muted}
                style={[styles.textInput, { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border, textAlign: language === "ar" ? "right" : "left" }]}
              />

              <Text style={{ color: colors.muted, fontSize: 13, textAlign: language === "ar" ? "right" : "left", marginTop: 8 }}>
                {language === "ar" ? "العمر (بالسنوات):" : language === "en" ? "Age (in years):" : "Leeftijd (in jaren):"}
              </Text>
              <TextInput
                value={customChildAge}
                onChangeText={setCustomChildAge}
                placeholder={language === "ar" ? "مثال: 7" : "e.g. 7"}
                placeholderTextColor={colors.muted}
                keyboardType="numeric"
                style={[styles.textInput, { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border, textAlign: language === "ar" ? "right" : "left" }]}
              />

              <Pressable
                onPress={() => {
                  const age = customChildAge.trim() || "5";
                  const name = customChildName.trim() || (language === "ar" ? "طفل" : language === "en" ? "Child" : "Kind");
                  setSelectedChild({ id: `other_${Date.now()}`, name, age });
                  setChildSelectionPhase("ready");
                }}
                style={({ pressed }) => [{
                  backgroundColor: colors.primary,
                  paddingVertical: 14,
                  borderRadius: 12,
                  alignItems: "center" as const,
                  marginTop: 12,
                  opacity: pressed ? 0.8 : 1,
                }]}
              >
                <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 15 }}>
                  {language === "ar" ? "ابدأ الاستشارة" : language === "en" ? "Start consultation" : "Start consultatie"}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setChildSelectionPhase("select")}
                style={({ pressed }) => [{ paddingVertical: 10, alignItems: "center" as const, opacity: pressed ? 0.6 : 1 }]}
              >
                <Text style={{ color: colors.muted, fontSize: 13 }}>
                  {language === "ar" ? "← رجوع" : language === "en" ? "← Back" : "← Terug"}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        )}

        {/* PHASE: Ready - show child context chip + messages/welcome + input */}
        {childSelectionPhase === "ready" && (
          <View style={{ flex: 1 }}>
            {/* Active child indicator */}
            {selectedChild && (
              <View style={[styles.childSelector, { backgroundColor: colors.surface }]}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 16, gap: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.primary + "15", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 }}>
                    <IconSymbol name="person.fill" size={14} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "600" }}>
                      {selectedChild.name} ({selectedChild.age})
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => {
                      setMessages([]);
                      setConversationId(null);
                      setChildSelectionPhase("select");
                      setSelectedChild(null);
                      AsyncStorage.removeItem("ai_chat_last_conv").catch(() => {});
                    }}
                    style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}
                  >
                    <Text style={{ color: colors.muted, fontSize: 11 }}>
                      {language === "ar" ? "تغيير" : language === "en" ? "Change" : "Wijzig"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* Messages or Welcome */}
            {messages.length === 0 ? (
              <ScrollView 
                style={{ flex: 1 }} 
                contentContainerStyle={{ paddingHorizontal: 32, paddingTop: 20, paddingBottom: 16, gap: 12 }}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={[styles.welcomeSubtitle, { color: colors.muted, textAlign: "center" }]}>{welcomeSubtitle}</Text>
                
                <View style={styles.suggestionsContainer}>
                  {suggestions.map((suggestion, index) => (
                    <Pressable
                      key={index}
                      onPress={() => sendMessageWithText(suggestion)}
                      style={({ pressed }) => [
                        styles.suggestionChip,
                        { backgroundColor: colors.surface, borderColor: colors.border },
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <Text style={[styles.suggestionText, { color: colors.foreground }]}>{suggestion}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            ) : (
              <FlatList
                ref={flatListRef}
                data={messages}
                renderItem={renderMessage}
                keyExtractor={(item) => item.id}
                style={{ flex: 1 }}
                contentContainerStyle={styles.messagesList}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                // Render the whole thread up front. FlatList defaults to
                // initialNumToRender=10 and only mounts more as the user
                // scrolls — so on a resumed 22-message consultation it laid out
                // 10, scrollToEnd went to the end of THOSE, nothing scrolled
                // further, items 11+ were never mounted and onContentSizeChange
                // never fired again. That deadlock is why the view stopped at
                // message 7 every single time, identically, across restarts and
                // a clean reinstall — a race would have varied. Consultations
                // run to a few dozen messages, so mounting them all is cheap.
                initialNumToRender={Math.max(messages.length, 10)}
                // Resuming a long consultation used to scroll on a 150ms timer,
                // which raced FlatList's incremental layout: at that moment only
                // the first handful of a 22-message thread existed, so it landed
                // on message 7 and the plan — the last message — was never
                // reached. Daa3iyah reported the plan missing three times over.
                // Content size fires again on every batch, so this keeps
                // following the growing list until it stops growing.
                onContentSizeChange={() => {
                  if (pendingScrollToEnd.current) {
                    flatListRef.current?.scrollToEnd({ animated: false });
                  }
                }}
                // Once the parent scrolls themselves, stop yanking them down.
                onScrollBeginDrag={() => { pendingScrollToEnd.current = false; }}
              />
            )}

            {/* Loading indicator */}
            {isLoading && (
              <View style={[styles.loadingContainer, { backgroundColor: colors.surface }]}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.loadingText, { color: colors.muted }]}>
                  {language === "ar" ? "جارٍ التفكير..." : language === "en" ? "Thinking..." : "Aan het nadenken..."}
                </Text>
              </View>
            )}

          </View>
        )}

        </View>{/* End content area */}

        {/* Input area - FIXED at bottom, above tab bar */}
        {!showHistory && childSelectionPhase === "ready" && (
          <View style={{ paddingBottom: 120 }}>
            {/* Attach menu - shown above input */}
            {ATTACHMENTS_ENABLED && showAttachMenu && (
              <View style={[styles.attachMenu, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
                <Pressable
                  onPress={pickImage}
                  style={({ pressed }) => [styles.attachOption, { backgroundColor: pressed ? colors.border : "transparent" }]}
                >
                  <IconSymbol name="photo.fill" size={20} color={colors.primary} />
                  <Text style={[styles.attachOptionText, { color: colors.foreground }]}>
                    {language === "ar" ? "صورة من المعرض" : language === "en" ? "Photo from gallery" : "Foto uit galerij"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={takePhoto}
                  style={({ pressed }) => [styles.attachOption, { backgroundColor: pressed ? colors.border : "transparent" }]}
                >
                  <IconSymbol name="camera.fill" size={20} color={colors.primary} />
                  <Text style={[styles.attachOptionText, { color: colors.foreground }]}>
                    {language === "ar" ? "التقاط صورة" : language === "en" ? "Take photo" : "Foto maken"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={pickDocument}
                  style={({ pressed }) => [styles.attachOption, { backgroundColor: pressed ? colors.border : "transparent" }]}
                >
                  <IconSymbol name="doc.fill" size={20} color={colors.primary} />
                  <Text style={[styles.attachOptionText, { color: colors.foreground }]}>
                    {language === "ar" ? "ملف (PDF/Word)" : language === "en" ? "File (PDF/Word)" : "Bestand (PDF/Word)"}
                  </Text>
                </Pressable>
              </View>
            )}

            {/* Attachment preview bar */}
            {attachments.length > 0 && (
              <View style={[styles.attachmentBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {attachments.map((att, idx) => (
                    <View key={idx} style={[styles.attachmentItem, { borderColor: colors.border }]}>
                      {att.type === "image" ? (
                        <Image source={{ uri: att.uri }} style={styles.attachPreviewImg} />
                      ) : (
                        <View style={styles.attachFileIcon}>
                          <IconSymbol name="doc.fill" size={16} color={colors.primary} />
                        </View>
                      )}
                      <Text style={[styles.attachName, { color: colors.muted }]} numberOfLines={1}>{att.name}</Text>
                      <Pressable onPress={() => removeAttachment(idx)} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
                        <IconSymbol name="xmark.circle.fill" size={16} color={colors.error} />
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Input row */}
            <View style={[styles.inputContainer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
              {/* Attach button.

                  Sideload only. The Play build would have to ask for CAMERA and
                  photo-library access to power it, and a parenting app sending
                  photographs of children to a third-party model is a data flow
                  worth keeping off the Play listing entirely rather than
                  declaring. CAMERA still ships there for app/qr-scanner.tsx,
                  which is a narrow, explainable use.

                  Nothing is lost by hiding it: until this release the button
                  sent the model a FILENAME, so it never worked on either
                  channel. */}
              {ATTACHMENTS_ENABLED && (
              <Pressable
                onPress={() => setShowAttachMenu(!showAttachMenu)}
                style={({ pressed }) => [
                  styles.attachButton,
                  { backgroundColor: showAttachMenu ? colors.primary : colors.surface },
                  pressed && { opacity: 0.8 },
                ]}
              >
                <IconSymbol name="plus.circle.fill" size={22} color={showAttachMenu ? "#FFF" : colors.primary} />
              </Pressable>
              )}

              {/* Text input */}
              <TextInput
                ref={inputRef}
                style={[
                  styles.textInput,
                  { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border },
                  language === "ar" && styles.rtlText,
                ]}
                value={inputText}
                onChangeText={setInputText}
                placeholder={placeholderText}
                placeholderTextColor={colors.muted}
                multiline
                maxLength={2000}
                textAlign={language === "ar" ? "right" : "left"}
                blurOnSubmit={false}
                onFocus={() => setShowAttachMenu(false)}
                returnKeyType="done"
              />

              {/* Send button */}
              <Pressable
                onPress={() => sendMessage()}
                disabled={(!inputText.trim() && attachments.length === 0) || isLoading}
                style={({ pressed }) => [
                  styles.sendButton,
                  { backgroundColor: (inputText.trim() || attachments.length > 0) ? colors.primary : colors.border },
                  pressed && { opacity: 0.8, transform: [{ scale: 0.95 }] },
                ]}
              >
                <IconSymbol name="paperplane.fill" size={20} color="#FFF" />
              </Pressable>
            </View>
          </View>
        )}

        
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

// Offline fallback responses

function getOfflineResponse(question: string, lang: string): string {
  if (lang === "ar") {
    return "عذراً، لا يمكنني الاتصال بالخادم حالياً. يرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.\n\nفي هذه الأثناء، تذكر أن أساس كل تربية هو العقيدة الصحيحة والقدوة الحسنة. ابدأ بتحسين صلتك بالله ثم انظر في حال طفلك.";
  }
  if (lang === "en") {
    return "Sorry, I cannot connect to the server right now. Please check your internet connection and try again.\n\nIn the meantime, remember that the foundation of all upbringing is correct aqeedah and good example. Start by improving your connection with Allaah, then look at your child's situation.";
  }
  return "Sorry, ik kan momenteel geen verbinding maken met de server. Controleer je internetverbinding en probeer het opnieuw.\n\nOnthoud in de tussentijd dat de basis van alle opvoeding de juiste aqiedah en het goede voorbeeld is. Begin met het verbeteren van je band met Allaah en kijk dan naar de situatie van je kind.";
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  newChatBtn: {
    padding: 4,
  },
  childSelector: {
    paddingVertical: 8,
  },
  childChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  welcomeScroll: {
    flex: 1,
  },
  welcomeContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingVertical: 40,
    gap: 12,
  },
  welcomeTitle: {
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 8,
  },
  welcomeSubtitle: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  suggestionsContainer: {
    marginTop: 24,
    gap: 8,
    width: "100%",
  },
  suggestionChip: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  suggestionText: {
    fontSize: 14,
    textAlign: "center",
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 4,
  },
  messageBubble: {
    maxWidth: "85%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    marginBottom: 8,
  },
  userBubble: {
    alignSelf: "flex-end",
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    alignSelf: "flex-start",
    borderBottomLeftRadius: 4,
  },
  aiHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  aiLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  rtlText: {
    writingDirection: "rtl",
  },
  attachmentPreviewRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 6,
  },
  attachmentThumb: {
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
  },
  attachmentImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  fileThumb: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  fileName: {
    fontSize: 11,
    maxWidth: 60,
  },
  actionPlanBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionPlanText: {
    fontSize: 12,
    fontWeight: "600",
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  loadingText: {
    fontSize: 13,
  },
  attachmentBar: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 0.5,
  },
  attachmentItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  attachPreviewImg: {
    width: 28,
    height: 28,
    borderRadius: 4,
  },
  attachFileIcon: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  attachName: {
    fontSize: 11,
    maxWidth: 60,
  },
  attachMenu: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 0.5,
    gap: 4,
  },
  attachOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  attachOptionText: {
    fontSize: 14,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 8,
    paddingTop: 8,
    gap: 6,
    borderTopWidth: 0.5,
  },
  attachButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  textInput: {
    flex: 1,
    minHeight: 36,
    maxHeight: 120,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 15,
    borderWidth: 1,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
});

/**
 * Paid feature: advertised on the subscribe screen, so it is closed to
 * non-subscribers rather than shown with a banner over it. Wrapping rather
 * than an early return means every return path inside is covered, and the
 * inner component's hooks never run for a non-subscriber.
 */
export default function AIChatScreen() {
  return (
    <PremiumGate>
      <AIChatScreenInner />
    </PremiumGate>
  );
}
