import AsyncStorage from "@react-native-async-storage/async-storage";

// ============ TYPES ============

export interface ParentProfile {
  // Verplichte basisgegevens (gate)
  firstName: string;
  lastName: string;
  address: string; // Legacy single field (kept for backward compatibility)
  streetHouseNumber: string; // Legacy combined field (kept for backward compatibility) — الشارع ورقم البيت
  postalCodeCity: string; // Legacy combined field (kept for backward compatibility) — الرمز البريدي والمدينة
  country: string; // البلد
  city: string; // المدينة
  street: string; // الشارع
  houseNumber: string; // رقم البيت
  postalCode: string; // الرمز البريدي (اختياري — غير إلزامي)
  phoneNumber: string; // رقم الهاتف (إلزامي)
  
  // Basis
  gender: string;
  maritalStatus: string;
  birthDate: string; // ISO date YYYY-MM-DD
  
  // Band met Allaah - Gebed
  prayer: string;
  fajr: string;
  prayerKhushoo: string; // Hoe beleeft u het gebed? (feitelijk)
  
  // Hijaab
  hijab: string;
  hijabPartner: string;
  
  // Kennis
  knowledgeSource: string[];
  obligatoryKnowledge: string;
  obligatoryKnowledgeDetails: string; // Welke verplichte kennis heeft u gestudeerd?
  knowledgeWithScholars: string;
  knowledgeMedia: string; // Welke media/kanalen gebruikt u voor kennis?
  
  // Gezinskunde
  familyScience: string;
  familyScienceWhere: string;
  familyScienceDuration: string; // Hoe lang heeft u gezinskunde gestudeerd?
  
  // Psycholoog/instanties
  psychologist: string;
  psychologistDetails: string;
  psychologistChildren: string;
  psychologistChildrenDetails: string;
  
  // Onderwijs kinderen
  schoolType: string;
  schoolTypeDetails: string;
  teacherContact: string;
  teacherContactDetails: string; // Hoe verloopt het contact?
  
  // Denkwijze ouder (feitelijkheden)
  thinkingAboutAllaah: string; // Hoe denkt u over uw band met Allaah? (feiten)
  thinkingAboutPartner: string; // Hoe denkt u over uw band met uw partner? (feiten)
  thinkingAboutChildren: string; // Hoe denkt u over uw band met uw kinderen? (feiten)
  thinkingAboutParenting: string; // Hoe denkt u over opvoeding? (feiten)
  thinkingMindsets: string; // Welke overtuigingen/mindsets heeft u over opvoeding?
  
  // Voelwijze ouder (feitelijkheden)
  feelingAboutAllaah: string; // Wat voelt u bij het gedenken van Allaah? (feiten)
  feelingAboutPartner: string; // Wat voelt u bij uw partner? (feiten)
  feelingAboutChildren: string; // Wat voelt u bij uw kinderen? (feiten)
  feelingAboutParenting: string; // Wat voelt u bij het opvoeden? (feiten)
  feelingChallenges: string; // Welke gevoelens ervaart u bij opvoeduitdagingen?
  
  // Spreekwijze ouder (feitelijkheden)
  speakingToAllaah: string; // Hoe spreekt u tot Allaah (du'aa, dhikr)? (feiten)
  speakingToPartner: string; // Hoe spreekt u met uw partner? (feiten)
  speakingToChildren: string; // Hoe spreekt u met uw kinderen? (feiten)
  speakingWhenAngry: string; // Hoe spreekt u wanneer u boos bent? (feiten)
  speakingWhenCorrecting: string; // Hoe spreekt u wanneer u corrigeert? (feiten)
  
  // Doewijze/werkwijze ouder (feitelijkheden)
  doingIbadah: string; // Welke ibadaat verricht u dagelijks? (feiten)
  doingWithPartner: string; // Hoe handelt u met uw partner? (feiten)
  doingWithChildren: string; // Hoe handelt u met uw kinderen? (feiten)
  doingWhenProblem: string; // Wat doet u bij een opvoedprobleem? (feiten)
  doingDailyRoutine: string; // Hoe ziet uw dagelijkse routine eruit? (feiten)
  
  // Affiniteiten ouder
  parentAffinities: string; // Waar bent u goed in / wat zijn uw talenten?
  parentHobbies: string; // Wat zijn uw hobby's?
  parentStrengths: string; // Wat zijn uw sterke punten in de opvoeding?
  parentWeaknesses: string; // Wat zijn uw zwakke punten in de opvoeding?
  
  // Band ouders onderling
  partnerRelationQuality: string; // Hoe is de band met uw partner? (feiten)
  partnerParentingAgreement: string; // Zijn jullie het eens over de opvoeding? (feiten)
  partnerCommunication: string; // Hoe communiceren jullie over de kinderen?
  
  // Partner/spouse info
  partnerName: string; // Name of connected partner/mother
  partnerId: string; // Public ID of connected partner
  
  // Social status extended fields
  hasChildren: boolean; // Whether user has children
  previousMethodology: string; // Previous parenting methodology before Quran & Sunnah
  
  completed: boolean;
}

export interface ChildProfile {
  id: string;
  name: string;
  birthDate: string; // ISO date
  gender: "jongen" | "meisje" | "";
  profileCompleted: boolean;
  laterInvullen: boolean;
  parentId?: string; // Links child to parent who created them
}

export interface ChildEnvironment {
  childId: string;
  education: string;
  educationDetails: string;
  familyLife: string;
  neighborhood: string;
  friends: string;
  islamicEducation: string;
  mediaUse: string;
  socialMedia: string;
  dailyStructure: string;
  goodThinking: string;
  goodFeeling: string;
  goodSpeaking: string;
  goodDoing: string;
  badThinking: string;
  badFeeling: string;
  badSpeaking: string;
  badDoing: string;
  affinities: string;
  hobbies: string;
  goodHabits: string;
  badHabits: string;
  // Sociale analyse
  relationWithFather: string;
  relationWithMother: string;
  relationWithSiblings: string;
  // Band met Allaah (leeftijdsafhankelijk)
  bondWithAllaah: string;
  prayerStatus: string;
  quranConnection: string;
  // Gezondheid
  physicalHealth: string;
  mentalHealth: string;
  sleepQuality: string;
  completed: boolean;
}

export interface Issue {
  id: string;
  childId: string;
  description: string;
  treatmentPlan: string;
  createdAt: string;
  resolved: boolean;
  syncedFromPartner?: boolean;
  analyticalQA?: { question: string; answer: string }[];
  updatedAt?: string;
}

export interface LocationSettings {
  gpsEnabled: boolean;
  city: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  lastUpdated: string;
  manualCity?: string; // Handmatig ingevoerde stad
}

export const defaultLocationSettings: LocationSettings = {
  gpsEnabled: false,
  city: "",
  country: "",
  latitude: null,
  longitude: null,
  lastUpdated: "",
  manualCity: "",
};

export interface ReminderSettings {
  enabled: boolean;
  frequencyDays: number; // How often to remind (in days)
  lastReminded: string; // ISO date of last reminder
  lastProfileUpdate: string; // ISO date of last profile update
}

export const defaultReminderSettings: ReminderSettings = {
  enabled: true,
  frequencyDays: 30,
  lastReminded: "",
  lastProfileUpdate: "",
};

export interface ActionPlan {
  id: string;
  content: string;
  phases: { phase: string; steps: { id: string; text: string; day?: number }[] }[];
  childId?: string;
  childName?: string;
  childAge?: string;
  savedAt: string;
  startDate: string;
  language: string;
  completedSteps: string[];
  autoSaved?: boolean;
}

export interface AppState {
  onboardingCompleted: boolean;
  parentProfileCompleted: boolean; // Whether full parent wizard is done
  parentProfile: ParentProfile;
  children: ChildProfile[];
  environments: ChildEnvironment[];
  issues: Issue[];
  actionPlans: ActionPlan[];
  reminderSettings: ReminderSettings;
  locationSettings: LocationSettings;
  dailyCheckins: DailyCheckin[];
  dailyTipCompletions: DailyTipCompletion[];
  permissionsSetupCompleted: boolean;
}

// ============ DAILY TIP COMPLETIONS ============
export interface DailyTipCompletion {
  date: string; // ISO date YYYY-MM-DD
  tipId: string; // unique tip identifier
  completedAt: string; // ISO datetime
}

// ============ DAILY CHECK-IN ============
export interface DailyCheckin {
  date: string; // ISO date YYYY-MM-DD
  prayer: string; // e.g. "alle_5_op_tijd", "sommige_gemist", "fajr_gemist", "werk_eraan"
  mood: string; // e.g. "energiek", "rustig", "moe", "gestrest"
  openAnswer?: string; // optional open text
  timestamp: string; // ISO datetime when answered
}

// ============ DEFAULT STATE ============

export const defaultParentProfile: ParentProfile = {
  firstName: "",
  lastName: "",
  address: "",
  streetHouseNumber: "",
  postalCodeCity: "",
  country: "",
  city: "",
  street: "",
  houseNumber: "",
  postalCode: "",
  phoneNumber: "",
  gender: "",
  maritalStatus: "",
  birthDate: "",
  prayer: "",
  fajr: "",
  prayerKhushoo: "",
  hijab: "",
  hijabPartner: "",
  knowledgeSource: [],
  obligatoryKnowledge: "",
  obligatoryKnowledgeDetails: "",
  knowledgeWithScholars: "",
  knowledgeMedia: "",
  familyScience: "",
  familyScienceWhere: "",
  familyScienceDuration: "",
  psychologist: "",
  psychologistDetails: "",
  psychologistChildren: "",
  psychologistChildrenDetails: "",
  schoolType: "",
  schoolTypeDetails: "",
  teacherContact: "",
  teacherContactDetails: "",
  thinkingAboutAllaah: "",
  thinkingAboutPartner: "",
  thinkingAboutChildren: "",
  thinkingAboutParenting: "",
  thinkingMindsets: "",
  feelingAboutAllaah: "",
  feelingAboutPartner: "",
  feelingAboutChildren: "",
  feelingAboutParenting: "",
  feelingChallenges: "",
  speakingToAllaah: "",
  speakingToPartner: "",
  speakingToChildren: "",
  speakingWhenAngry: "",
  speakingWhenCorrecting: "",
  doingIbadah: "",
  doingWithPartner: "",
  doingWithChildren: "",
  doingWhenProblem: "",
  doingDailyRoutine: "",
  parentAffinities: "",
  parentHobbies: "",
  parentStrengths: "",
  parentWeaknesses: "",
  partnerRelationQuality: "",
  partnerParentingAgreement: "",
  partnerCommunication: "",
  partnerName: "",
  partnerId: "",
  hasChildren: false,
  previousMethodology: "",
  completed: false,
};

export const defaultAppState: AppState = {
  onboardingCompleted: false,
  parentProfileCompleted: false,
  parentProfile: defaultParentProfile,
  children: [],
  environments: [],
  issues: [],
  actionPlans: [],
  reminderSettings: defaultReminderSettings,
  locationSettings: defaultLocationSettings,
  dailyCheckins: [],
  dailyTipCompletions: [],
  permissionsSetupCompleted: false,
};

// ============ STORAGE FUNCTIONS ============

const STORAGE_KEY = "opvoedadvies_app_state";

function scopedStorageKey(userId: number | null): string {
  return userId != null ? `${STORAGE_KEY}_${userId}` : STORAGE_KEY;
}

export async function loadAppState(userId: number | null, options: { migrateLegacy?: boolean } = {}): Promise<AppState> {
  try {
    const key = scopedStorageKey(userId);
    let data = await AsyncStorage.getItem(key);
    if (!data && userId != null && options.migrateLegacy) {
      // One-time migration, run only from the cold-start hydrate() path —
      // never from a login-time fallback read, which could otherwise adopt
      // a DIFFERENT account's stale legacy data as this account's own.
      // Adopt whatever the old shared key holds (if anything), then retire
      // it, so no later account can ever read it.
      const legacy = await AsyncStorage.getItem(STORAGE_KEY);
      if (legacy) {
        await AsyncStorage.setItem(key, legacy);
        await AsyncStorage.removeItem(STORAGE_KEY);
        data = legacy;
      }
    }
    if (data) {
      let parsed: any;
      try {
        parsed = JSON.parse(data);
      } catch (parseError) {
        console.error("Corrupt state data, resetting:", parseError);
        await AsyncStorage.removeItem(key);
        return defaultAppState;
      }
      // One-time adoption of the pre-AppState @permissions_setup_completed
      // flag (used to live in its own device-wide AsyncStorage key, written
      // by app/permissions-setup.tsx before that screen's completion state
      // moved onto AppState). Same cold-start-only guard as the legacy-blob
      // migration above and for the same reason: the old key was never
      // account-scoped, so a login-time fallback read could otherwise hand
      // one account's completion to a different one that hydrates next.
      // Accepted tradeoff, same shape as the blob migration above: on a
      // device that had multiple accounts before this upgrade, the old
      // key can only be truthfully attributed to "whichever account
      // hydrates first" — it was never recorded per-account to begin with,
      // and there's no way to recover that after the fact.
      if (parsed.permissionsSetupCompleted === undefined && userId != null && options.migrateLegacy) {
        const legacyDone = await AsyncStorage.getItem("@permissions_setup_completed");
        if (legacyDone === "true") {
          parsed.permissionsSetupCompleted = true;
          // Persist the adoption before discarding the only other copy of
          // this signal below — otherwise it lives only in this call's
          // return value and is gone for good on the very next cold start.
          await AsyncStorage.setItem(key, JSON.stringify(parsed));
        }
        await AsyncStorage.removeItem("@permissions_setup_completed");
      }
      // Merge with defaults to handle schema migrations (new fields)
      return {
        ...defaultAppState,
        ...parsed,
        parentProfile: {
          ...defaultParentProfile,
          ...(parsed.parentProfile || {}),
        },
        reminderSettings: {
          ...defaultReminderSettings,
          ...(parsed.reminderSettings || {}),
        },
        locationSettings: {
          ...defaultLocationSettings,
          ...(parsed.locationSettings || {}),
        },
      };
    }
  } catch (e) {
    console.error("Failed to load app state:", e);
    try {
      await AsyncStorage.removeItem(scopedStorageKey(userId));
    } catch (_) {}
  }
  return defaultAppState;
}

export async function saveAppState(state: AppState, userId: number | null): Promise<void> {
  try {
    await AsyncStorage.setItem(scopedStorageKey(userId), JSON.stringify(state));
  } catch (e) {
    console.error("Failed to save app state:", e);
  }
}

export async function clearAppState(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error("Failed to clear app state:", e);
  }
}

// ============ PROFILE COMPLETENESS ============

export function getFirstIncompleteOnboardingStep(
  state: { parentProfile?: ParentProfile; children?: ChildProfile[] }
): "basic" | "gender" | "children" | null {
  const p = state.parentProfile;
  // Country, city, street and house number are required; postal code never
  // is. A profile satisfies this either through the new discrete fields, or
  // — for anyone who onboarded before those fields existed — through the old
  // combined streetHouseNumber/address fields, unchanged from the check this
  // replaces, so no existing user is newly sent back through onboarding for
  // data the form never asked them for.
  const hasDiscreteAddress = !!(p?.country && p?.city && p?.street && p?.houseNumber);
  const hasLegacyAddress = !!(p?.streetHouseNumber || p?.address);
  if (!(p?.firstName && p?.lastName && p?.birthDate && (hasDiscreteAddress || hasLegacyAddress) && p?.phoneNumber)) {
    return "basic";
  }
  if (!(p?.gender && p?.maritalStatus)) {
    return "gender";
  }
  if (!(Array.isArray(state.children) && state.children.length > 0)) {
    return "children";
  }
  return null;
}

export function isProfileComplete(state: { parentProfile?: ParentProfile; children?: ChildProfile[] }): boolean {
  return getFirstIncompleteOnboardingStep(state) === null;
}

// ============ HELPER FUNCTIONS ============

export function calculateAgeInWeeks(birthDate: string): { years: number; months: number; weeks: number; totalWeeks: number } {
  const birth = new Date(birthDate);
  const now = new Date();
  const diffMs = now.getTime() - birth.getTime();
  const totalWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  const years = Math.floor(totalWeeks / 52);
  const remainingWeeks = totalWeeks - years * 52;
  const months = Math.floor(remainingWeeks / 4.33);
  const weeks = Math.floor(remainingWeeks - months * 4.33);
  return { years, months, weeks, totalWeeks };
}

export function getYearKey(years: number): string {
  if (years < -1) return "Jaar -1";
  if (years > 18) return "Jaar 18"; // Cap at 18
  return `Jaar ${years}`;
}

export function getWeekInYear(totalWeeks: number, years: number): number {
  return totalWeeks - years * 52 + 1; // 1-indexed week within the year
}
