import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * lib/app-context.tsx's syncToServer POSTs the local profile to
 * /api/trpc/profile.save and used to discard the response body entirely —
 * only response.ok was checked. The server deliberately returns the
 * EFFECTIVE gender it persisted (server/routers.ts profile.save), which can
 * differ from what was just sent (e.g. a stale/garbage local value falls
 * back to the authoritative server-side value, or a linked partner's action
 * changed it server-side). Discarding the response meant that reconciliation
 * never happened and the client/server divergence persisted. These tests
 * cover the fix: syncToServer must consume the response and hand the
 * effective gender to a caller-supplied callback when it differs — without
 * that callback re-triggering another sync (see the "no write-back loop"
 * test below).
 */

// AsyncStorage is a transitive import via lib/store.ts; mock it so importing
// lib/app-context.tsx doesn't try to load the real RN package under vitest
// (same pattern as tests/app-state-storage-scoping.test.ts).
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(() => Promise.resolve(null)),
    setItem: vi.fn(() => Promise.resolve()),
    removeItem: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock("@/constants/oauth", () => ({
  getApiBaseUrl: () => "https://api.example.com",
}));

const getSessionToken = vi.fn();
const isLogoutPending = vi.fn();
vi.mock("@/lib/_core/auth", () => ({
  getSessionToken: () => getSessionToken(),
  isLogoutPending: () => isLogoutPending(),
}));

const authedFetch = vi.fn();
vi.mock("@/lib/authed-fetch", () => ({
  authedFetch: (...args: unknown[]) => authedFetch(...args),
}));

import { defaultAppState, isProfileComplete } from "@/lib/store";
import {
  syncToServer,
  reconcileEffectiveGender,
  applyReconciledGender,
  mergeServerState,
  fillParentProfileFromServer,
} from "@/lib/app-context";

/** Shape of the raw fetch Response profile.save returns over HTTP. */
function saveResponse(gender: string | null) {
  return {
    ok: true,
    json: async () => ({ result: { data: { json: { success: true, gender } } } }),
  };
}

describe("reconcileEffectiveGender (parses profile.save's tRPC response)", () => {
  it("returns the server's gender when it differs from what was sent", () => {
    const body = { result: { data: { json: { success: true, gender: "man" } } } };
    expect(reconcileEffectiveGender("", body)).toBe("man");
  });

  it("returns undefined when the server confirms the same gender that was sent", () => {
    const body = { result: { data: { json: { success: true, gender: "man" } } } };
    expect(reconcileEffectiveGender("man", body)).toBeUndefined();
  });

  it("treats a null server gender as equivalent to an empty local value (no spurious reconciliation)", () => {
    const body = { result: { data: { json: { success: true, gender: null } } } };
    expect(reconcileEffectiveGender("", body)).toBeUndefined();
  });

  it("returns undefined for a response that doesn't match the expected tRPC envelope", () => {
    expect(reconcileEffectiveGender("man", null)).toBeUndefined();
    expect(reconcileEffectiveGender("man", {})).toBeUndefined();
    expect(reconcileEffectiveGender("man", { result: {} })).toBeUndefined();
    expect(reconcileEffectiveGender("man", { result: { data: {} } })).toBeUndefined();
  });
});

describe("applyReconciledGender (patches local state to the server's effective gender)", () => {
  const state = {
    ...defaultAppState,
    parentProfile: { ...defaultAppState.parentProfile, gender: "vrouw", firstName: "Fatima" },
  };

  it("patches only the gender, preserving the rest of parentProfile and state", () => {
    const patched = applyReconciledGender(state, "man");
    expect(patched.parentProfile.gender).toBe("man");
    expect(patched.parentProfile.firstName).toBe("Fatima");
    expect(patched).not.toBe(state);
  });

  it("returns the SAME reference when the gender already matches (nothing to persist)", () => {
    const patched = applyReconciledGender(state, "vrouw");
    expect(patched).toBe(state);
  });
});

describe("syncToServer reconciles the server's effective gender", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionToken.mockResolvedValue("token-123");
    isLogoutPending.mockResolvedValue(false);
  });

  const sentState = {
    ...defaultAppState,
    parentProfile: { ...defaultAppState.parentProfile, gender: "" },
  };

  it("hands the server's effective gender to the reconciliation callback when it differs from what was sent", async () => {
    authedFetch.mockResolvedValueOnce(saveResponse("man"));
    const onGenderReconciled = vi.fn();

    await syncToServer(sentState, onGenderReconciled);

    expect(onGenderReconciled).toHaveBeenCalledTimes(1);
    expect(onGenderReconciled).toHaveBeenCalledWith("man");
  });

  it("does not call back when the server confirms the same gender that was sent", async () => {
    authedFetch.mockResolvedValueOnce(saveResponse(""));
    const onGenderReconciled = vi.fn();

    await syncToServer(sentState, onGenderReconciled);

    expect(onGenderReconciled).not.toHaveBeenCalled();
  });

  it("does not call back on a failed save (response not ok)", async () => {
    authedFetch.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    const onGenderReconciled = vi.fn();

    await syncToServer(sentState, onGenderReconciled);

    expect(onGenderReconciled).not.toHaveBeenCalled();
  });

  it("no write-back loop: reconciling does not itself trigger another network call", async () => {
    authedFetch.mockResolvedValueOnce(saveResponse("man"));
    const onGenderReconciled = vi.fn();

    await syncToServer(sentState, onGenderReconciled);

    expect(authedFetch).toHaveBeenCalledTimes(1);
  });

  it("still fails closed while logout is pending: no fetch, no reconciliation", async () => {
    isLogoutPending.mockResolvedValue(true);
    const onGenderReconciled = vi.fn();

    await syncToServer(sentState, onGenderReconciled);

    expect(authedFetch).not.toHaveBeenCalled();
    expect(onGenderReconciled).not.toHaveBeenCalled();
  });
});

/**
 * v1.5.8 P0: a user who updated in place (not reinstalled) can have
 * onboardingCompleted:true locally while their local parentProfile is
 * missing a field the server has (e.g. gender empty, everything else
 * filled) — hydrate()'s branch for onboardingCompleted:true never runs the
 * full server-restore (that's gated behind the opposite branch), and its
 * background merge used to only recover children/environments/issues/
 * actionPlans/partnerName, never parentProfile. isProfileComplete() then
 * stays false forever, so AuthGate force-sends an already-onboarded user
 * back into onboarding on every launch. These tests cover the recovery:
 * an empty local parentProfile field is filled from a complete server
 * profile, without ever overwriting a non-empty local value.
 */
describe("fillParentProfileFromServer (recovers empty local parentProfile fields from the server)", () => {
  const complete = {
    ...defaultAppState.parentProfile,
    firstName: "Suhayb",
    lastName: "X",
    birthDate: "1985-01-01",
    country: "Marokko",
    city: "Tanger",
    street: "Straat",
    houseNumber: "1",
    phoneNumber: "0600000000",
    gender: "man",
    maritalStatus: "getrouwd",
  };

  it("fills an empty local field (gender) from a non-empty server value", () => {
    const local = { ...complete, gender: "" };
    const { profile, changed } = fillParentProfileFromServer(local, complete);
    expect(changed).toBe(true);
    expect(profile.gender).toBe("man");
  });

  it("fills every empty local field the server has, not just one", () => {
    const local = { ...defaultAppState.parentProfile }; // fully empty
    const { profile, changed } = fillParentProfileFromServer(local, complete);
    expect(changed).toBe(true);
    expect(profile.gender).toBe("man");
    expect(profile.maritalStatus).toBe("getrouwd");
    expect(profile.firstName).toBe("Suhayb");
  });

  it("never clobbers a non-empty local value, even when the server disagrees", () => {
    const local = { ...complete, gender: "vrouw" }; // local disagrees with server's "man"
    const { profile, changed } = fillParentProfileFromServer(local, complete);
    expect(profile.gender).toBe("vrouw");
    expect(changed).toBe(false); // nothing else in this fixture is empty locally
  });

  it("does not touch partnerName/partnerId — the dedicated partner merge owns those", () => {
    const local = { ...complete, partnerName: "" };
    const server = { ...complete, partnerName: "Fatima", partnerId: "abc" };
    const { profile } = fillParentProfileFromServer(local, server);
    expect(profile.partnerName).toBe("");
  });

  it("reports no change and returns the same reference when nothing is missing", () => {
    const { profile, changed } = fillParentProfileFromServer(complete, complete);
    expect(changed).toBe(false);
    expect(profile).toBe(complete);
  });
});

describe("mergeServerState (hydrate's background-sync decision)", () => {
  const completeServerProfile = {
    ...defaultAppState.parentProfile,
    firstName: "Suhayb",
    lastName: "X",
    birthDate: "1985-01-01",
    country: "Marokko",
    city: "Tanger",
    street: "Straat",
    houseNumber: "1",
    phoneNumber: "0600000000",
    gender: "man",
    maritalStatus: "getrouwd",
  };
  const serverState = {
    ...defaultAppState,
    onboardingCompleted: true,
    parentProfile: completeServerProfile,
    children: [
      { id: "c1", name: "Child", birthDate: "2015-01-01", gender: "jongen" as const, profileCompleted: false, laterInvullen: true },
    ],
  };

  it("an updating user (onboardingCompleted:true, gender empty locally) lands profile-complete after merge, not stuck in onboarding", () => {
    const localState = {
      ...defaultAppState,
      onboardingCompleted: true,
      // Matches the reported symptom exactly: marital status filled, gender not.
      parentProfile: { ...completeServerProfile, gender: "" },
      children: [] as typeof serverState.children,
    };

    const { state } = mergeServerState(localState, serverState);

    expect(isProfileComplete({ parentProfile: state.parentProfile, children: state.children })).toBe(true);
  });

  it("does not clobber a locally-set gender with a differing server value", () => {
    const localState = {
      ...defaultAppState,
      onboardingCompleted: true,
      parentProfile: { ...completeServerProfile, gender: "vrouw" },
      children: serverState.children,
    };

    const { state } = mergeServerState(localState, {
      ...serverState,
      parentProfile: { ...completeServerProfile, gender: "man" },
    });

    expect(state.parentProfile.gender).toBe("vrouw");
  });

  it("a genuine new user (local and server both empty/default) reports no change — still onboards", () => {
    const localState = { ...defaultAppState }; // onboardingCompleted: false, everything empty
    const emptyServer = { ...defaultAppState };

    const { changed } = mergeServerState(localState, emptyServer);

    expect(changed).toBe(false);
    expect(isProfileComplete({ parentProfile: localState.parentProfile, children: localState.children })).toBe(false);
  });
});
