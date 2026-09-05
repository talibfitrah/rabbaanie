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
  // Set true when the user answers "I have no children" at the onboarding gate.
  // Optional so pre-existing profiles (undefined) are unaffected. Makes a
  // zero-children profile a valid *complete* state — see
  // getFirstIncompleteOnboardingStep — so a childless married user isn't
  // trapped on the "add children" screen.
  hasNoChildren?: boolean;
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
  // Polygamy support (Phase 2) — nasab attribution, all optional so every
  // pre-existing child (and every child a single-partner family creates)
  // stays byte-for-byte unaffected. motherId/fatherId are co-parent user
  // ids (links.coParents[].id); externalFatherName is a plain name for a
  // father who isn't an app user (e.g. a previous marriage); relationship
  // is this child's relationship to the CURRENT viewer ("biological_mother"
  // | "biological_father" | "stepmother" | "stepfather"), populated by the
  // server's profile.get merge — a client never sets it.
  motherId?: number;
  fatherId?: number;
  externalFatherName?: string;
  relationship?: string;
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
  // Trimmed, so a field holding only spaces does not read as filled. Only the
  // NEW branch trims: doing the same to the legacy one would fail a stored
  // " " that passes today, which is precisely the lockout this OR exists to
  // prevent — so it stays byte-identical to the check it replaces.
  const filled = (v?: string) => typeof v === "string" && v.trim().length > 0;
  const hasDiscreteAddress = filled(p?.country) && filled(p?.city) && filled(p?.street) && filled(p?.houseNumber);
  const hasLegacyAddress = !!(p?.streetHouseNumber || p?.address);
  if (!(p?.firstName && p?.lastName && p?.birthDate && (hasDiscreteAddress || hasLegacyAddress) && p?.phoneNumber)) {
    return "basic";
  }
  if (!(p?.gender && p?.maritalStatus)) {
    return "gender";
  }
  // A childless user satisfies this step either by having children OR by
  // explicitly declaring they have none at the onboarding gate (hasNoChildren).
  // Without the second clause, children.length === 0 always read as incomplete,
  // trapping a newly-married user on the "add children" screen forever.
  const hasChildrenOrDeclaredNone =
    (Array.isArray(state.children) && state.children.length > 0) || p?.hasNoChildren === true;
  if (!hasChildrenOrDeclaredNone) {
    return "children";
  }
  return null;
}

export function isProfileComplete(state: { parentProfile?: ParentProfile; children?: ChildProfile[] }): boolean {
  return getFirstIncompleteOnboardingStep(state) === null;
}

// Onboarding used to spawn N empty "Kind N"/"Child N"/"طفل N" children per
// signup (~52 users / 136 placeholders in production — see handleChildrenSubmit
// fix). mergeServerState is union-only and never deletes, so cleanup has to
// happen here, on the client, and the caller must push the result back up or
// the next sync just re-adds what this removed.
const PLACEHOLDER_NAME_PATTERN = /^(Kind|Child|طفل)\s*\d+$/i;

// A child is an unfilled onboarding placeholder ONLY if EVERY guard below
// holds. This runs on a delete path, so each guard errs toward keeping a real
// child the others might miss:
//   - laterInvullen === true: the marker the old count-based onboarding stamped
//     on its auto-generated "Kind N" rows. Every real-child path sets it false
//     (add-child.tsx, onboarding/add-child.tsx, the new onboarding, a completed
//     environment in child/environment.tsx), so a child a user *deliberately*
//     named "Kind 1" is never deleted.
//   - placeholder/empty name AND no birthDate AND not profileCompleted: the
//     shape of an untouched placeholder.
//   - no environment/issue/actionPlan of its own: a partial "fill later"
//     environment save (child/environment.tsx) keeps laterInvullen:true but
//     writes a real environments[] row — never delete a child that already
//     carries work. (Checking the side-arrays here also means a pruned child
//     provably has nothing to cascade-delete.)
function isEmptyPlaceholderChild(c: ChildProfile, state: AppState): boolean {
  if (c.laterInvullen !== true) return false;
  const name = (c.name ?? "").trim();
  if (!(name === "" || PLACEHOLDER_NAME_PATTERN.test(name))) return false;
  if ((c.birthDate ?? "").trim() !== "") return false;
  if (c.profileCompleted === true) return false;
  // `?? []` guards a corrupted/legacy cache that serialized any of these as an
  // explicit null (loadAppState's `...parsed` would let it override the default
  // []) — a delete path must degrade, not throw, during hydration.
  if ((state.environments ?? []).some((e) => e.childId === c.id)) return false;
  if ((state.issues ?? []).some((i) => i.childId === c.id)) return false;
  if ((state.actionPlans ?? []).some((p) => p.childId === c.id)) return false;
  return true;
}

/**
 * Removes empty onboarding-placeholder children (see isEmptyPlaceholderChild).
 * A child that qualifies has no environment/issue/actionPlan of its own by
 * definition, so there is nothing to cascade-delete. Pure — returns a new
 * state, never mutates the input; returns the SAME state reference (and
 * removedCount: 0) on a no-op so a caller can skip persisting/syncing.
 */
export function pruneEmptyPlaceholderChildren(state: AppState): { state: AppState; removedCount: number } {
  if (!Array.isArray(state.children)) return { state, removedCount: 0 };
  const keptChildren = state.children.filter((c) => !isEmptyPlaceholderChild(c, state));
  const removedCount = state.children.length - keptChildren.length;
  if (removedCount === 0) {
    return { state, removedCount: 0 };
  }
  return { state: { ...state, children: keptChildren }, removedCount };
}

/**
 * Deterministic child id from name + birthdate. Onboarding's id derivation, its
 * duplicate check, and the prune's "onboarding children survive" test all share
 * THIS definition so they can't drift apart. Collapses internal whitespace so
 * "Ahmad Ali" and "Ahmad  Ali" resolve to the same id (caught as a duplicate,
 * not colliding). NOTE: add-child.tsx, onboarding/add-child.tsx and
 * child/[id].tsx still inline the same formula (child/[id].tsx without the
 * .trim()) — pre-existing copies, not adopted here to keep this change scoped.
 */
export function childIdFrom(name: string, birthDate: string): string {
  // `?? ""` guards a legacy/corrupted cache child whose name is null — the type
  // says string, but this is fed from stored children (see isEmptyPlaceholderChild,
  // which guards the same way) and would otherwise throw on .trim().
  return `${(name ?? "").trim().toLowerCase().replace(/\s+/g, "_")}_${(birthDate || "unknown").replace(/-/g, "")}`;
}

// ============ POLYGAMY: NASAB ATTRIBUTION (Phase 2) ============

export type OtherParentTier = "skip" | "single" | "choose-required" | "choose-optional";

/**
 * Which tier of the add-child "who is the other parent?" prompt applies,
 * given the adder's own gender and how many CONFIRMED co-parents
 * (links.coParents — already confirmed-only) they have. Shared by
 * add-child.tsx and onboarding/add-child.tsx so the two duplicated screens
 * can't drift apart on this decision.
 *
 * - 0 confirmed partners: nothing to attribute to — skip the prompt.
 * - exactly 1: pre-filled default (the woman's one husband as candidate
 *   father, or the man's one wife as candidate mother). The woman's side
 *   also gets a "someone else" escape hatch (a previous marriage); the
 *   man's does not — there is no externalMotherName field.
 * - 2+ and viewer is a man (2+ wives): which wife is the mother is
 *   genuinely ambiguous and there is no "someone else" concept for a
 *   mother, so a pick is required before saving.
 * - 2+ and viewer is not a man (rare: 2+ confirmed co-parents for a woman):
 *   the same pick-or-type-a-name UI as the "someone else" hatch, but not
 *   required — leaving it unresolved still saves the child, just without a
 *   father recorded.
 */
export function otherParentTier(viewerGender: string, confirmedPartnerCount: number): OtherParentTier {
  if (confirmedPartnerCount <= 0) return "skip";
  if (confirmedPartnerCount === 1) return "single";
  return viewerGender === "man" ? "choose-required" : "choose-optional";
}

export interface MotherGroup {
  motherId: number | null;
  children: ChildProfile[];
}

/**
 * Partitions a children list into groups by motherId, stably: group order
 * follows first appearance in `children`, and each group's internal order
 * is untouched — so sorting children by age before calling this keeps every
 * group age-sorted too. Children with no motherId share one `null` group. A
 * single-mother household (no polygamy) collapses to exactly one group, so
 * a flat render can stay flat by checking `.length <= 1`.
 */
export function groupChildrenByMother(children: ChildProfile[]): MotherGroup[] {
  const groups: MotherGroup[] = [];
  const byKey = new Map<number | null, MotherGroup>();
  for (const child of children ?? []) {
    const key = child.motherId ?? null;
    let group = byKey.get(key);
    if (!group) {
      group = { motherId: key, children: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.children.push(child);
  }
  return groups;
}

/**
 * Children shared between the viewer and one specific co-parent (for a wife
 * card's "N shared children" count) — derived from the viewer's own per-child
 * motherId/fatherId, the same field groupChildrenByMother partitions on.
 * Deliberately NOT links.coParents[].sharedChildren: that field is a
 * confirmed-parentChildLinks intersection, so once a co-wife has ANY
 * confirmed link to a child (even a stale/corrupted one — see the
 * cowife-crosslink-fixed-2026-09-04 incident, where a co-wife's sync wrote
 * her a spurious biological_mother link to her husband's whole household),
 * that child counts as "shared" with her too — reproducing "all N children"
 * under every wife no matter how many times the bad link is cleaned up
 * server-side. A motherId/fatherId match is a partition instead of an
 * independent list: a given child matches at most one coParentId, so two
 * wife cards can never show the same child, regardless of what the server
 * sends or how many times the client re-syncs.
 */
export function childrenSharedWithCoParent(
  children: ChildProfile[],
  coParentId: number,
): ChildProfile[] {
  return (children ?? []).filter(
    (c) => c.motherId === coParentId || c.fatherId === coParentId,
  );
}

/**
 * Child-nasab relationship label — distinct from messages.tsx's
 * getRelationshipLabel, which collapses biological_father/stepfather (and
 * biological_mother/stepmother) into one generic "Father"/"Mother" label for
 * the co-parent card. This one keeps step- distinct so a child card can show
 * it, matching the approved decision to name the previous father alongside it.
 * `relationship` is missing for every child until the server's profile.get
 * enrichment ships (and for every child created before it did, and for the
 * pre-migration "parent" hardcode) — falls back to the viewer's own gender,
 * the same derivation getRelationshipLabel already applies to "parent".
 */
export function getChildNasabLabel(relationship: string | undefined, lang: string, viewerGender: string): string {
  const t = (nl: string, en: string, ar: string) => (lang === "ar" ? ar : lang === "en" ? en : nl);
  switch (relationship) {
    case "biological_mother":
      return t("Moeder", "Mother", "الأم");
    case "biological_father":
      return t("Vader", "Father", "الأب");
    case "stepmother":
      return t("Stiefmoeder", "Stepmother", "زوجة الأب");
    case "stepfather":
      return t("Stiefvader", "Stepfather", "زوج الأم");
    default:
      return viewerGender === "man" ? t("Vader", "Father", "الأب") : t("Moeder", "Mother", "الأم");
  }
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
