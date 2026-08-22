import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import {
  AppState,
  ChildProfile,
  ChildEnvironment,
  Issue,
  ActionPlan,
  ParentProfile,
  ReminderSettings,
  LocationSettings,
  DailyCheckin,
  defaultAppState,
  loadAppState,
  saveAppState,
  isProfileComplete,
} from "./store";
import * as Auth from "@/lib/_core/auth";
import { getApiBaseUrl } from "@/constants/oauth";

import { authedFetch } from "@/lib/authed-fetch";
interface AppContextType {
  state: AppState;
  loading: boolean;
  updateParentProfile: (profile: Partial<ParentProfile>) => Promise<void>;
  completeParentProfile: () => Promise<void>;
  addChild: (child: ChildProfile) => Promise<void>;
  addChildren: (children: ChildProfile[]) => Promise<void>;
  updateChild: (id: string, data: Partial<ChildProfile>) => Promise<void>;
  removeChild: (id: string) => Promise<void>;
  updateEnvironment: (env: ChildEnvironment) => Promise<void>;
  addIssue: (issue: Issue) => Promise<void>;
  updateIssue: (id: string, data: Partial<Issue>) => Promise<void>;
  removeIssue: (id: string) => Promise<void>;
  updateReminderSettings: (settings: Partial<ReminderSettings>) => Promise<void>;
  updateLocationSettings: (settings: Partial<LocationSettings>) => Promise<void>;
  completeOnboarding: () => Promise<void>;
  completePermissionsSetup: () => Promise<void>;
  resetState: () => Promise<void>;
  saveDailyCheckin: (checkin: DailyCheckin) => Promise<void>;
  markTipCompleted: (tipId: string) => Promise<void>;
  unmarkTipCompleted: (tipId: string) => Promise<void>;
  saveActionPlan: (plan: ActionPlan) => Promise<void>;
  updateActionPlan: (id: string, data: Partial<ActionPlan>) => Promise<void>;
  removeActionPlan: (id: string) => Promise<void>;
  /** Re-fetch state from server after login (restores previously saved data) */
  rehydrateFromServer: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// ============ CLOUD SYNC HELPERS ============

/**
 * profile.save reports the gender it actually persisted (see server/routers.ts
 * profile.save), which can differ from what was just sent — e.g. a stale
 * local value falls back to the authoritative server-side value there.
 * Returns the effective gender when it differs from what was sent, or
 * undefined when there's nothing to reconcile: either they already match, or
 * the response didn't parse into the expected tRPC envelope.
 */
export function reconcileEffectiveGender(sentGender: string, body: unknown): string | undefined {
  const result = (body as any)?.result?.data?.json;
  if (!result || typeof result !== "object") return undefined;
  const effective = typeof result.gender === "string" ? result.gender : "";
  return effective !== sentGender ? effective : undefined;
}

/**
 * Patches parentProfile.gender to the server's effective value. Returns the
 * SAME state reference when the gender already matches, so a caller can skip
 * setState/saveAppState on a no-op instead of manufacturing a "change" that
 * isn't one.
 */
export function applyReconciledGender(current: AppState, gender: string): AppState {
  if (current.parentProfile.gender === gender) return current;
  return { ...current, parentProfile: { ...current.parentProfile, gender } };
}

/**
 * Save state to server (fire-and-forget, non-blocking).
 *
 * onGenderReconciled, when given, is invoked with the server's effective
 * gender whenever it differs from what was just sent — see
 * reconcileEffectiveGender. Callers must patch local state directly (e.g.
 * via applyReconciledGender + setState) rather than through persist(), or
 * the patch would itself arm another debounced syncToServer call.
 */
export async function syncToServer(
  state: AppState,
  onGenderReconciled?: (gender: string) => void
): Promise<void> {
  try {
    const token = await Auth.getSessionToken();
    if (!token) return; // Not authenticated, skip sync
    // Logout in progress: the token is still valid for a few seconds while the
    // server-side logout call races a 5s timeout, but resetState() has already
    // armed a debounced sync of the empty default state. Without this guard that
    // sync overwrites the account's real profile (children, issues, plans) on
    // the server with blanks. The tombstone is set before logout starts.
    if (await Auth.isLogoutPending()) return;
    const baseUrl = getApiBaseUrl();
    // Use a simple fetch to the profile.save tRPC mutation
    const response = await authedFetch(`/api/trpc/profile.save`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        json: {
          profileData: {
            parentProfile: state.parentProfile,
            children: state.children,
            environments: state.environments,
            issues: state.issues,
            actionPlans: state.actionPlans,
            onboardingCompleted: state.onboardingCompleted,
            parentProfileCompleted: state.parentProfileCompleted,
            reminderSettings: state.reminderSettings,
            locationSettings: state.locationSettings,
            dailyCheckins: state.dailyCheckins,
            dailyTipCompletions: state.dailyTipCompletions,
          },
        },
      }),
    });
    if (!response.ok) {
      console.warn("[CloudSync] Save failed:", response.status);
      return;
    }
    if (onGenderReconciled) {
      const body = await response.json().catch(() => null);
      const effectiveGender = reconcileEffectiveGender(state.parentProfile.gender, body);
      if (effectiveGender !== undefined) onGenderReconciled(effectiveGender);
    }
  } catch (e) {
    console.warn("[CloudSync] Save error (non-blocking):", e);
  }
}

/** Load state from server */
async function syncFromServer(): Promise<AppState | null> {
  try {
    const token = await Auth.getSessionToken();
    if (!token) return null;
    const baseUrl = getApiBaseUrl();
    const response = await authedFetch(`/api/trpc/profile.get`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) return null;
    const data = await response.json();
    // tRPC wraps result in { result: { data: { json: ... } } }
    const profileData = data?.result?.data?.json;
    if (!profileData || typeof profileData !== "object") return null;
    // Check if server has meaningful data (onboarding completed)
    if (!profileData.onboardingCompleted) return null;
    // Merge server data with defaults for any missing fields
    const serverState: AppState = {
      ...defaultAppState,
      parentProfile: {
        ...defaultAppState.parentProfile,
        ...(profileData.parentProfile || {}),
      },
      children: profileData.children || [],
      environments: profileData.environments || [],
      issues: profileData.issues || [],
      actionPlans: profileData.actionPlans || [],
      onboardingCompleted: profileData.onboardingCompleted ?? false,
      parentProfileCompleted: profileData.parentProfileCompleted ?? false,
      reminderSettings: {
        ...defaultAppState.reminderSettings,
        ...(profileData.reminderSettings || {}),
      },
      locationSettings: {
        ...defaultAppState.locationSettings,
        ...(profileData.locationSettings || {}),
      },
      dailyCheckins: profileData.dailyCheckins || [],
      dailyTipCompletions: profileData.dailyTipCompletions || [],
    };
    return serverState;
  } catch (e) {
    console.warn("[CloudSync] Load error:", e);
    return null;
  }
}

/**
 * Fills empty LOCAL parentProfile string fields (gender, maritalStatus,
 * firstName, address, …) from the server's copy. A user whose local
 * onboardingCompleted stays true but whose local parentProfile is missing a
 * field the server has (e.g. after an app update) fails isProfileComplete
 * forever and is forced back through onboarding on every launch, even
 * though the account's data is intact server-side — this is the recovery.
 * Only fills a field that is EMPTY locally; a non-empty local value always
 * wins, even over a differing server value, so an edit in flight is never
 * clobbered. partnerName/partnerId are skipped: the dedicated partner-info
 * merge in mergeServerState below already owns those two fields.
 */
export function fillParentProfileFromServer(
  local: ParentProfile,
  server: ParentProfile
): { profile: ParentProfile; changed: boolean } {
  let changed = false;
  const filled: ParentProfile = { ...local };
  for (const key of Object.keys(server) as (keyof ParentProfile)[]) {
    if (key === "partnerName" || key === "partnerId") continue;
    const localValue = local[key];
    const serverValue = server[key];
    if (
      typeof localValue === "string" &&
      typeof serverValue === "string" &&
      localValue.trim() === "" &&
      serverValue.trim() !== ""
    ) {
      (filled as any)[key] = serverValue;
      changed = true;
    }
  }
  return { profile: changed ? filled : local, changed };
}

/**
 * Combines a hydrated local AppState with a freshly-fetched server AppState
 * (see syncFromServer) into what hydrate()'s background sync should persist.
 * Merges children/environments/issues/actionPlans/partner-info — unchanged
 * from the inline version this replaces, extracted only so it's unit
 * testable the same way reconcileEffectiveGender/applyReconciledGender are —
 * plus recovers any empty local parentProfile field via
 * fillParentProfileFromServer (see that function for why).
 */
export function mergeServerState(
  localState: AppState,
  serverState: AppState
): { state: AppState; changed: boolean } {
  let changed = false;
  let updatedState = { ...localState };

  const { profile: filledProfile, changed: profileChanged } = fillParentProfileFromServer(
    localState.parentProfile,
    serverState.parentProfile
  );
  if (profileChanged) {
    updatedState = { ...updatedState, parentProfile: filledProfile };
    changed = true;
  }

  // Merge children
  if (serverState.children && serverState.children.length > 0) {
    const localChildren = localState.children || [];
    const merged = [...localChildren];
    for (const sc of serverState.children) {
      const exists = merged.some(
        (lc: any) => (lc.name === sc.name && lc.birthDate === sc.birthDate) || lc.id === sc.id
      );
      if (!exists) {
        merged.push(sc);
      }
    }
    if (merged.length > localChildren.length) {
      updatedState = { ...updatedState, children: merged };
      changed = true;
      console.log(`[CloudSync] Merged ${merged.length - localChildren.length} new children from server`);
    }
  }

  // Merge environments (from partner via shared DB)
  if (serverState.environments && serverState.environments.length > 0) {
    const localEnvs = updatedState.environments || [];
    const mergedEnvs = [...localEnvs];
    for (const se of serverState.environments) {
      if (!se.completed) continue;
      // Match by childId - server already mapped it to local child ID
      const hasLocal = mergedEnvs.some(
        (le: any) => le.childId === se.childId && le.completed
      );
      if (!hasLocal) {
        mergedEnvs.push(se);
      }
    }
    if (mergedEnvs.length > localEnvs.length) {
      updatedState = { ...updatedState, environments: mergedEnvs };
      changed = true;
      console.log(`[CloudSync] Merged ${mergedEnvs.length - localEnvs.length} new environments from server`);
    }
  }

  // Merge issues (from partner via shared DB)
  if (serverState.issues && serverState.issues.length > 0) {
    const localIssues = updatedState.issues || [];
    const mergedIssues = [...localIssues];
    for (const si of serverState.issues) {
      const exists = mergedIssues.some(
        (li: any) => li.id === si.id || (li.description === si.description && li.childId === si.childId)
      );
      if (!exists) {
        mergedIssues.push(si);
      }
    }
    if (mergedIssues.length > localIssues.length) {
      updatedState = { ...updatedState, issues: mergedIssues };
      changed = true;
      console.log(`[CloudSync] Merged ${mergedIssues.length - localIssues.length} new issues from server`);
    }
  }

  // Merge action plans (from partner via shared DB)
  if (serverState.actionPlans && serverState.actionPlans.length > 0) {
    const localPlans = updatedState.actionPlans || [];
    const mergedPlans = [...localPlans];
    for (const sp of serverState.actionPlans) {
      const exists = mergedPlans.some((lp: any) => lp.id === sp.id);
      if (!exists) {
        mergedPlans.push(sp);
      }
    }
    if (mergedPlans.length > localPlans.length) {
      updatedState = { ...updatedState, actionPlans: mergedPlans };
      changed = true;
      console.log(`[CloudSync] Merged ${mergedPlans.length - localPlans.length} new action plans from server`);
    }
  }

  // Merge partner info from server (authoritative source from partnerships table)
  if (serverState.parentProfile?.partnerName || serverState.parentProfile?.partnerId) {
    const localPartnerName = updatedState.parentProfile?.partnerName || "";
    const localPartnerId = updatedState.parentProfile?.partnerId || "";
    const serverPartnerName = serverState.parentProfile?.partnerName || "";
    const serverPartnerId = serverState.parentProfile?.partnerId || "";
    if ((!localPartnerName && serverPartnerName) || (!localPartnerId && serverPartnerId)) {
      updatedState = {
        ...updatedState,
        parentProfile: {
          ...updatedState.parentProfile,
          partnerName: serverPartnerName || localPartnerName,
          partnerId: serverPartnerId || localPartnerId,
        },
      };
      changed = true;
      console.log(`[CloudSync] Merged partner info from server: ${serverPartnerName}`);
    }
  }

  return { state: updatedState, changed };
}

// Debounce timer for server sync
let syncTimer: ReturnType<typeof setTimeout> | null = null;

/** Auto-sync with partner on app open (fire-and-forget) */
async function autoSyncWithPartner(): Promise<{ changed: boolean; details?: any } | null> {
  try {
    const token = await Auth.getSessionToken();
    if (!token) return null;
    const baseUrl = getApiBaseUrl();
    const response = await authedFetch(`/api/trpc/links.syncWithPartner`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ json: undefined }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const result = data?.result?.data?.json;
    if (!result || !result.success) return null;
    const m = result.merged;
    const total = (m?.children || 0) + (m?.environments || 0) + (m?.issues || 0) + (m?.actionPlans || 0);
    // Save sync report to AsyncStorage (both with and without changes)
    const report = {
      timestamp: new Date().toISOString(),
      merged: m,
      total,
    };
    try {
      const { default: AsyncStorage } = await import("@react-native-async-storage/async-storage");
      const existing = await AsyncStorage.getItem("sync_reports");
      const reports = existing ? JSON.parse(existing) : [];
      reports.unshift(report);
      // Keep last 50 reports
      await AsyncStorage.setItem("sync_reports", JSON.stringify(reports.slice(0, 50)));
    } catch {}
    if (total > 0) {
      console.log(`[AutoSync] Partner sync merged ${total} items`);
      return { changed: true, details: m };
    }
    return { changed: false };
  } catch (e) {
    console.warn("[AutoSync] Partner sync error (non-blocking):", e);
    return null;
  }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(defaultAppState);
  const [loading, setLoading] = useState(true);
  const stateRef = useRef(state);
  stateRef.current = state;
  const userIdRef = useRef<number | null>(null);

  // Applies a gender profile.save reconciled server-side (see syncToServer /
  // reconcileEffectiveGender). Deliberately bypasses persist(): patching
  // straight through setState/saveAppState means this can never itself arm
  // another debounced syncToServer call that re-sends the value the server
  // just corrected — matches the "merge partner info from server" pattern
  // below, which reconciles server-authoritative data the same way.
  const applyServerGender = useCallback((gender: string) => {
    const patched = applyReconciledGender(stateRef.current, gender);
    if (patched === stateRef.current) return;
    setState(patched);
    stateRef.current = patched;
    saveAppState(patched, userIdRef.current);
  }, []);

  useEffect(() => {
    async function hydrate() {
      try {
        const user = await Auth.getUserInfo();
        userIdRef.current = user?.id ?? null;
        // 1. Load local state first (fast)
        let localState = await loadAppState(userIdRef.current, { migrateLegacy: true });

        // Self-heal a stale onboardingCompleted flag: the profile data can be
        // complete while the flag is still false (app death between children
        // being saved and completeOnboarding() resolving). Without this, an
        // affected account stays permanently local-only — syncFromServer and
        // the partner-merge logic below both gate on this same flag.
        if (!localState.onboardingCompleted && isProfileComplete({ parentProfile: localState.parentProfile, children: localState.children })) {
          localState = { ...localState, onboardingCompleted: true };
          await saveAppState(localState, userIdRef.current);
          syncToServer(localState, applyServerGender);
        }

        // 2. If local state has data, use it immediately
        if (localState.onboardingCompleted) {
          setState(localState);
          setLoading(false);
          // Also sync from server in background to merge linked children + environments from partner
          syncFromServer().then((serverState) => {
            if (!serverState) return;
            const { state: updatedState, changed } = mergeServerState(localState, serverState);

            if (changed) {
              setState(updatedState);
              stateRef.current = updatedState;
              saveAppState(updatedState, userIdRef.current);
            }
          }).catch(() => {});

          // Auto-sync with partner on app open (fire-and-forget)
          autoSyncWithPartner().then((syncResult) => {
            if (syncResult && syncResult.changed) {
              // Re-fetch from server to get the merged data
              syncFromServer().then((freshState) => {
                if (freshState && freshState.onboardingCompleted) {
                  setState(freshState);
                  stateRef.current = freshState;
                  saveAppState(freshState, userIdRef.current);
                  console.log("[AutoSync] State refreshed after partner sync");
                }
              }).catch(() => {});
            }
          }).catch(() => {});
          return;
        }

        // 3. If local state is empty, try to load from server (user reinstalled app)
        const serverState = await syncFromServer();
        if (serverState && serverState.onboardingCompleted) {
          // Server has data! Restore it locally
          setState(serverState);
          await saveAppState(serverState, userIdRef.current);
          console.log("[CloudSync] Restored state from server");
        } else {
          // No data anywhere, use default
          setState(localState);
        }
      } catch (e) {
        console.error("Hydration failed:", e);
        setState(defaultAppState);
      } finally {
        setLoading(false);
      }
    }
    hydrate();
  }, []);

  const persist = useCallback(async (newState: AppState) => {
    setState(newState);
    stateRef.current = newState;
    // Save locally (immediate)
    await saveAppState(newState, userIdRef.current);
    // Sync to server (debounced, non-blocking)
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      syncToServer(newState, applyServerGender);
    }, 2000); // Wait 2 seconds after last change before syncing
  }, [applyServerGender]);

  const updateParentProfile = useCallback(
    async (profile: Partial<ParentProfile>) => {
      const current = stateRef.current;
      const newState = {
        ...current,
        parentProfile: { ...current.parentProfile, ...profile },
        reminderSettings: {
          ...current.reminderSettings,
          lastProfileUpdate: new Date().toISOString(),
        },
      };
      await persist(newState);
    },
    [persist]
  );

  const completeParentProfile = useCallback(async () => {
    const current = stateRef.current;
    const newState = {
      ...current,
      parentProfileCompleted: true,
      parentProfile: { ...current.parentProfile, completed: true },
      reminderSettings: {
        ...current.reminderSettings,
        lastProfileUpdate: new Date().toISOString(),
      },
    };
    await persist(newState);
  }, [persist]);

  const addChild = useCallback(
    async (child: ChildProfile) => {
      const current = stateRef.current;
      const newState = {
        ...current,
        children: [...current.children, child],
      };
      await persist(newState);
    },
    [persist]
  );

  const addChildren = useCallback(
    async (newChildren: ChildProfile[]) => {
      const current = stateRef.current;
      const newState = {
        ...current,
        children: [...current.children, ...newChildren],
      };
      await persist(newState);
    },
    [persist]
  );

  const updateChild = useCallback(
    async (id: string, data: Partial<ChildProfile>) => {
      const current = stateRef.current;
      const newId = data.id || id;
      const newState = {
        ...current,
        children: current.children.map((c) => (c.id === id ? { ...c, ...data } : c)),
        // Cascade ID change to environments and issues
        environments: newId !== id
          ? current.environments.map((e) => (e.childId === id ? { ...e, childId: newId } : e))
          : current.environments,
        issues: newId !== id
          ? current.issues.map((i) => (i.childId === id ? { ...i, childId: newId } : i))
          : current.issues,
      };
      await persist(newState);
    },
    [persist]
  );

  const removeChild = useCallback(
    async (id: string) => {
      const current = stateRef.current;
      // Find the child being removed (for server-side deletion by name+birthDate)
      const childToRemove = current.children.find((c) => c.id === id);
      const newState = {
        ...current,
        children: current.children.filter((c) => c.id !== id),
        environments: current.environments.filter((e) => e.childId !== id),
        issues: current.issues.filter((i) => i.childId !== id),
      };
      await persist(newState);
      // Also delete from server database (non-blocking)
      // The profile.save sync will also detect the removal, but this is immediate
      if (childToRemove) {
        try {
          const token = await Auth.getSessionToken();
          if (token) {
            const baseUrl = getApiBaseUrl();
            await authedFetch(`/api/trpc/children.deleteByNameBirth`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                json: { name: childToRemove.name, birthDate: childToRemove.birthDate },
              }),
            });
          }
        } catch (e) {
          // Non-critical: profile.save will handle it as a fallback
          console.warn("[removeChild] Server delete failed (will sync via profile.save):", e);
        }
      }
    },
    [persist]
  );

  const updateEnvironment = useCallback(
    async (env: ChildEnvironment) => {
      const current = stateRef.current;
      const existing = current.environments.findIndex((e) => e.childId === env.childId);
      let newEnvironments: ChildEnvironment[];
      if (existing >= 0) {
        newEnvironments = [...current.environments];
        newEnvironments[existing] = env;
      } else {
        newEnvironments = [...current.environments, env];
      }
      const newState = { ...current, environments: newEnvironments };
      await persist(newState);
    },
    [persist]
  );

  const addIssue = useCallback(
    async (issue: Issue) => {
      const current = stateRef.current;
      const newState = {
        ...current,
        issues: [...current.issues, issue],
      };
      await persist(newState);
    },
    [persist]
  );

  const updateIssue = useCallback(
    async (id: string, data: Partial<Issue>) => {
      const current = stateRef.current;
      const newState = {
        ...current,
        issues: current.issues.map((i) => (i.id === id ? { ...i, ...data } : i)),
      };
      await persist(newState);
    },
    [persist]
  );

  const removeIssue = useCallback(
    async (id: string) => {
      const current = stateRef.current;
      const newState = {
        ...current,
        issues: current.issues.filter((i) => i.id !== id),
      };
      await persist(newState);
    },
    [persist]
  );

  const updateReminderSettings = useCallback(
    async (settings: Partial<ReminderSettings>) => {
      const current = stateRef.current;
      const newState = {
        ...current,
        reminderSettings: { ...current.reminderSettings, ...settings },
      };
      await persist(newState);
    },
    [persist]
  );

  const updateLocationSettings = useCallback(
    async (settings: Partial<LocationSettings>) => {
      const current = stateRef.current;
      const newState = {
        ...current,
        locationSettings: { ...current.locationSettings, ...settings },
      };
      await persist(newState);
    },
    [persist]
  );

  const completeOnboarding = useCallback(async () => {
    const current = stateRef.current;
    const newState = { ...current, onboardingCompleted: true };
    await persist(newState);
  }, [persist]);

  const completePermissionsSetup = useCallback(async () => {
    const current = stateRef.current;
    const newState = { ...current, permissionsSetupCompleted: true };
    await persist(newState);
  }, [persist]);

  const resetState = useCallback(async () => {
    const user = await Auth.getUserInfo();
    userIdRef.current = user?.id ?? null;
    await persist(defaultAppState);
    // persist() armed a 2s debounced server sync of the empty default state.
    // resetState is used on logout and delete-account; in both the account is
    // being abandoned, so that sync must never reach the server (it would wipe
    // the real profile). Cancel it here; syncToServer also fails closed on the
    // logout tombstone as a backstop.
    if (syncTimer) {
      clearTimeout(syncTimer);
      syncTimer = null;
    }
  }, [persist]);

  const saveDailyCheckin = useCallback(
    async (checkin: DailyCheckin) => {
      const current = stateRef.current;
      // Replace existing entry for the same date, or add new
      const existing = current.dailyCheckins.findIndex((c) => c.date === checkin.date);
      let newCheckins: DailyCheckin[];
      if (existing >= 0) {
        newCheckins = [...current.dailyCheckins];
        newCheckins[existing] = checkin;
      } else {
        newCheckins = [...current.dailyCheckins, checkin];
      }
      // Keep only last 90 days
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 90);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      newCheckins = newCheckins.filter((c) => c.date >= cutoffStr);
      const newState = { ...current, dailyCheckins: newCheckins };
      await persist(newState);
    },
    [persist]
  );

  const markTipCompleted = useCallback(
    async (tipId: string) => {
      const current = stateRef.current;
      const today = new Date().toISOString().slice(0, 10);
      const completion = { date: today, tipId, completedAt: new Date().toISOString() };
      const existing = current.dailyTipCompletions || [];
      // Don't duplicate
      if (existing.some((c) => c.date === today && c.tipId === tipId)) return;
      // Keep last 90 days
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 90);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      const newCompletions = [...existing, completion].filter((c) => c.date >= cutoffStr);
      const newState = { ...current, dailyTipCompletions: newCompletions };
      await persist(newState);
    },
    [persist]
  );

  const unmarkTipCompleted = useCallback(
    async (tipId: string) => {
      const current = stateRef.current;
      const today = new Date().toISOString().slice(0, 10);
      const existing = current.dailyTipCompletions || [];
      const newCompletions = existing.filter((c) => !(c.date === today && c.tipId === tipId));
      const newState = { ...current, dailyTipCompletions: newCompletions };
      await persist(newState);
    },
    [persist]
  );

  const saveActionPlan = useCallback(
    async (plan: ActionPlan) => {
      const current = stateRef.current;
      // Avoid duplicates by ID
      const existing = current.actionPlans || [];
      if (existing.some((p) => p.id === plan.id)) return;
      const newState = {
        ...current,
        actionPlans: [...existing, plan],
      };
      await persist(newState);
    },
    [persist]
  );

  const updateActionPlan = useCallback(
    async (id: string, data: Partial<ActionPlan>) => {
      const current = stateRef.current;
      const newState = {
        ...current,
        actionPlans: (current.actionPlans || []).map((p) =>
          p.id === id ? { ...p, ...data } : p
        ),
      };
      await persist(newState);
    },
    [persist]
  );

  const removeActionPlan = useCallback(
    async (id: string) => {
      const current = stateRef.current;
      const newState = {
        ...current,
        actionPlans: (current.actionPlans || []).filter((p) => p.id !== id),
      };
      await persist(newState);
    },
    [persist]
  );

  /**
   * Re-fetch state from server after login.
   * This is called after a successful OAuth login to restore any previously saved data.
   * Without this, the user would be asked to fill in their profile again even though
   * the data exists on the server.
   */
  const rehydrateFromServer = useCallback(async () => {
    console.log("[AppContext] rehydrateFromServer called");
    const user = await Auth.getUserInfo();
    userIdRef.current = user?.id ?? null;
    try {
      const serverState = await syncFromServer();
      if (serverState && serverState.onboardingCompleted) {
        console.log("[AppContext] Server has data, restoring...");
        setState(serverState);
        stateRef.current = serverState;
        await saveAppState(serverState, userIdRef.current);
        console.log("[AppContext] State restored from server after login");
      } else {
        // Also try local state (maybe user had data locally before logout)
        const localState = await loadAppState(userIdRef.current);
        if (localState.onboardingCompleted) {
          console.log("[AppContext] Local state has data, using it");
          setState(localState);
          stateRef.current = localState;
        }
      }
      // Always try to sync with partner after login
      console.log("[AppContext] Attempting partner sync after login...");
      const syncResult = await autoSyncWithPartner();
      if (syncResult?.changed) {
        console.log("[AppContext] Partner sync merged data, re-fetching...");
        // Re-fetch the merged state from server
        const mergedState = await syncFromServer();
        if (mergedState && mergedState.onboardingCompleted) {
          setState(mergedState);
          stateRef.current = mergedState;
          await saveAppState(mergedState, userIdRef.current);
        }
      }
    } catch (e) {
      console.warn("[AppContext] rehydrateFromServer failed:", e);
    }
  }, []);

  return (
    <AppContext.Provider
      value={{
        state,
        loading,
        updateParentProfile,
        completeParentProfile,
        addChild,
        addChildren,
        updateChild,
        removeChild,
        updateEnvironment,
        addIssue,
        updateIssue,
        removeIssue,
        updateReminderSettings,
        updateLocationSettings,
        completeOnboarding,
        completePermissionsSetup,
        resetState,
        saveDailyCheckin,
        markTipCompleted,
        unmarkTipCompleted,
        saveActionPlan,
        updateActionPlan,
        removeActionPlan,
        rehydrateFromServer,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppState() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppState must be used within AppProvider");
  }
  return context;
}
