import { readFileSync } from "node:fs";
import { join } from "node:path";
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
  locationSettingsForSync,
  locationSettingsFromServer,
} from "@/lib/app-context";

/** Shape of the raw fetch Response profile.save returns over HTTP. */
function saveResponse(gender: string | null) {
  return {
    ok: true,
    json: async () => ({
      result: { data: { json: { success: true, gender } } },
    }),
  };
}

describe("reconcileEffectiveGender (parses profile.save's tRPC response)", () => {
  it("returns the server's gender when it differs from what was sent", () => {
    const body = {
      result: { data: { json: { success: true, gender: "man" } } },
    };
    expect(reconcileEffectiveGender("", body)).toBe("man");
  });

  it("returns undefined when the server confirms the same gender that was sent", () => {
    const body = {
      result: { data: { json: { success: true, gender: "man" } } },
    };
    expect(reconcileEffectiveGender("man", body)).toBeUndefined();
  });

  it("treats a null server gender as equivalent to an empty local value (no spurious reconciliation)", () => {
    const body = {
      result: { data: { json: { success: true, gender: null } } },
    };
    expect(reconcileEffectiveGender("", body)).toBeUndefined();
  });

  it("returns undefined for a response that doesn't match the expected tRPC envelope", () => {
    expect(reconcileEffectiveGender("man", null)).toBeUndefined();
    expect(reconcileEffectiveGender("man", {})).toBeUndefined();
    expect(reconcileEffectiveGender("man", { result: {} })).toBeUndefined();
    expect(
      reconcileEffectiveGender("man", { result: { data: {} } }),
    ).toBeUndefined();
  });
});

describe("applyReconciledGender (patches local state to the server's effective gender)", () => {
  const state = {
    ...defaultAppState,
    parentProfile: {
      ...defaultAppState.parentProfile,
      gender: "vrouw",
      firstName: "Fatima",
    },
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
    authedFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    });
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
    const { profile, changed } = fillParentProfileFromServer(
      complete,
      complete,
    );
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
      {
        id: "c1",
        name: "Child",
        birthDate: "2015-01-01",
        gender: "jongen" as const,
        profileCompleted: false,
        laterInvullen: true,
      },
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

    expect(
      isProfileComplete({
        parentProfile: state.parentProfile,
        children: state.children,
      }),
    ).toBe(true);
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
    expect(
      isProfileComplete({
        parentProfile: localState.parentProfile,
        children: localState.children,
      }),
    ).toBe(false);
  });
});

/**
 * Consent-model contradiction, found by security review before the first
 * Apple submission.
 *
 * Two paths uploaded the SAME precise GPS coordinate to the backend and only
 * one asked the user. hooks/use-push-notifications.ts gates its upload behind
 * `@share_location_with_team` (Settings → "Share location with the team",
 * default OFF) because precise coordinates are personal data. syncToServer had
 * no such gate: profile.save carried state.locationSettings — raw unrounded
 * floats — and persist()'s 2s debounce fires it on ANY state mutation.
 *
 * The privacy policy (server/legal.ts, "Location: coarse or precise, used
 * SOLELY to calculate prayer times and the qibla direction") settles which
 * behaviour was intended: both of those are computed on-device
 * (lib/prayer-data.ts calculatePrayerTimes, app/qibla.tsx calculateQiblaAngle)
 * from the separate @prayer_location key, never from locationSettings and
 * never server-side. So the coordinate in the profile blob served no user
 * feature and was outside the stated purpose — it is dropped.
 *
 * "Two paths" is the count for BACKGROUND uploads, not for the app. A third
 * exists and is deliberately untouched here: app/find-specialist.tsx:38-43
 * sends state.locationSettings.latitude/longitude to trpc.specialist.findNearest
 * on mount with no gate. It is not in scope for these tests because it is
 * user-initiated and feature-inherent — the screen exists to match by proximity
 * and falls back to city/country on its own. It does mean the policy line
 * quoted above is currently WIDER than the app's behaviour, which is a decision
 * for the privacy policy or that screen, not something a test can settle. See
 * the comment at hooks/use-push-notifications.ts for the open question.
 *
 * These tests assert PRESENCE as well as absence: a gate that only checks
 * "no coordinates" would also pass if the whole sync broke and nothing was
 * sent at all (see coding-rules.txt / tests/dissolve-partner-location.ts).
 */
describe("syncToServer never uploads precise coordinates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionToken.mockResolvedValue("token-123");
    isLogoutPending.mockResolvedValue(false);
    authedFetch.mockResolvedValue(saveResponse(""));
  });

  const LAT = 52.3701987;
  const LNG = 4.8951679;

  const locatedState = {
    ...defaultAppState,
    locationSettings: {
      gpsEnabled: true,
      city: "Amsterdam",
      country: "Nederland",
      latitude: LAT,
      longitude: LNG,
      lastUpdated: "2026-08-26T10:00:00.000Z",
      manualCity: "Utrecht",
    },
  };

  /** The locationSettings object as it actually goes over the wire. */
  async function sentLocationSettings(state = locatedState) {
    await syncToServer(state);
    const [, init] = authedFetch.mock.calls[0] as [string, { body: string }];
    return JSON.parse(init.body).json.profileData.locationSettings;
  }

  it("omits latitude and longitude from the profile.save payload", async () => {
    const sent = await sentLocationSettings();
    expect(sent.latitude).toBeUndefined();
    expect(sent.longitude).toBeUndefined();
  });

  it("leaks no coordinate digits anywhere in the raw request body", async () => {
    await syncToServer(locatedState);
    const [, init] = authedFetch.mock.calls[0] as [string, { body: string }];
    expect(init.body).not.toContain(String(LAT));
    expect(init.body).not.toContain(String(LNG));
  });

  it("STILL uploads the rest of locationSettings, so a dead sync cannot pass this suite", async () => {
    const sent = await sentLocationSettings();
    expect(authedFetch).toHaveBeenCalledTimes(1);
    expect(sent).toMatchObject({
      gpsEnabled: true,
      city: "Amsterdam",
      country: "Nederland",
      manualCity: "Utrecht",
    });
  });

  it("STILL uploads the non-location profile payload untouched", async () => {
    await syncToServer(locatedState);
    const [, init] = authedFetch.mock.calls[0] as [string, { body: string }];
    const profileData = JSON.parse(init.body).json.profileData;
    expect(profileData).toHaveProperty("parentProfile");
    expect(profileData).toHaveProperty("children");
    expect(profileData).toHaveProperty("reminderSettings");
  });

  /**
   * app/(tabs)/settings.tsx falls back to `city = "52.3702, 4.8952"` when
   * reverse geocoding fails, so dropping latitude/longitude alone would still
   * ship the coordinate — in a field that looks harmless.
   */
  it("scrubs a city/manualCity that is itself a coordinate pair", async () => {
    const sent = await sentLocationSettings({
      ...locatedState,
      locationSettings: {
        ...locatedState.locationSettings,
        city: "52.3702, 4.8952",
        manualCity: "52.37, 4.89",
      },
    });
    expect(sent.city).toBe("");
    expect(sent.manualCity).toBe("");
  });
});

describe("locationSettingsForSync", () => {
  const loc = {
    gpsEnabled: true,
    city: "Rotterdam",
    country: "Nederland",
    latitude: 51.9244,
    longitude: 4.4777,
    lastUpdated: "2026-08-26T10:00:00.000Z",
    manualCity: "Delft",
  };

  it("drops the coordinates and keeps everything else", () => {
    expect(locationSettingsForSync(loc)).toEqual({
      gpsEnabled: true,
      city: "Rotterdam",
      country: "Nederland",
      lastUpdated: "2026-08-26T10:00:00.000Z",
      manualCity: "Delft",
    });
  });

  it("keeps a real place name that merely contains digits", () => {
    expect(
      locationSettingsForSync({ ...loc, city: "'s-Hertogenbosch 2" }).city,
    ).toBe("'s-Hertogenbosch 2");
  });

  it("scrubs a negative/southern-hemisphere coordinate pair too", () => {
    expect(
      locationSettingsForSync({ ...loc, city: "-33.8688, 151.2093" }).city,
    ).toBe("");
  });
});

/**
 * The DOWNLOAD half. Five tests above pin what leaves the device; nothing
 * pinned what comes back, and both of this function's regressions reached
 * review rather than a test because of it.
 *
 * The two halves of the contract are deliberately different, which is the part
 * that keeps being got wrong:
 *   - coordinates: the server no longer receives them, so it can never be
 *     authoritative and the device always wins;
 *   - city: the server DOES still receive it, so the device may only fill a gap,
 *     never overrule an answer.
 */
describe("locationSettingsFromServer", () => {
  const LOCAL = {
    ...defaultAppState.locationSettings,
    latitude: 51.9244,
    longitude: 4.4777,
    city: "Rotterdam",
    country: "NL",
  };
  const EMPTY_LOCAL = { ...defaultAppState.locationSettings };

  it("keeps the device's coordinates, which the server can no longer send", () => {
    const merged = locationSettingsFromServer({ city: "Rotterdam" }, LOCAL);
    expect(merged.latitude).toBe(51.9244);
    expect(merged.longitude).toBe(4.4777);
  });

  it("does not let a fresh install's nulls erase a coordinate the server still has", () => {
    // The regression that shipped first: guarding on the local OBJECT instead
    // of its contents. On a fresh install the local object exists with null
    // coordinates, so it spread those nulls last and destroyed a coordinate a
    // pre-1.6.0 profileData blob was still carrying — losing exactly what
    // passing no local state at all would have restored.
    const merged = locationSettingsFromServer(
      { latitude: 52.37, longitude: 4.9 },
      EMPTY_LOCAL,
    );
    expect(merged.latitude).toBe(52.37);
    expect(merged.longitude).toBe(4.9);
  });

  it("lets another device's city win, so the two converge", () => {
    // The regression that shipped second, fixing the first: carrying the local
    // city through on mere truthiness. Correct the city on the phone and the
    // tablet would read the old one for ever — a worse bug than the blanking
    // it was written to fix, because it never heals.
    const merged = locationSettingsFromServer(
      { city: "Amsterdam" },
      { ...LOCAL, city: "Rotterdam" },
    );
    expect(merged.city).toBe("Amsterdam");
  });

  it("restores the local city when the scrub left the server's empty", () => {
    // The case the carry-through exists for: locationSettingsForSync rewrites a
    // coordinate-shaped city to "" on the way up, so the server's copy is not
    // the truth. Without this the label was blanked in memory AND on disk on an
    // ordinary app open, for anyone whose reverse geocoding had failed.
    const merged = locationSettingsFromServer(
      { city: "", manualCity: "" },
      { ...LOCAL, city: "52.37, 4.90", manualCity: "52.37, 4.90" },
    );
    expect(merged.city).toBe("52.37, 4.90");
    expect(merged.manualCity).toBe("52.37, 4.90");
  });

  it("still takes everything else the server sends", () => {
    // Presence, not just absence: a merge that dropped the server's fields
    // entirely would satisfy every assertion above about local values winning.
    const merged = locationSettingsFromServer(
      { country: "MA", gpsEnabled: false },
      LOCAL,
    );
    expect(merged.country).toBe("MA");
    expect(merged.gpsEnabled).toBe(false);
  });
});

/**
 * Every syncFromServer call must be told what the device already knows.
 *
 * The merge is only as good as its inputs: a call that omits the argument gets
 * `undefined` local state, and the server's blanks — no coordinate at all, and
 * a city the scrub may have emptied — win by default. That is the wipe the
 * merge exists to prevent, reintroduced one call site at a time.
 *
 * A source scan rather than a behavioural test, because the call sites live
 * inside a React effect and a callback that a unit test cannot reach; static
 * review found the one site that was missing its argument, and nothing in the
 * suite would have. Whitespace is collapsed first so the match survives a
 * reformat — see the note in tests/subscription-auth.test.ts for why that
 * matters more than it sounds.
 */
describe("every syncFromServer call carries the device's own location", () => {
  it("passes local state at every call site, not just most of them", () => {
    const src = readFileSync(
      join(__dirname, "..", "lib/app-context.tsx"),
      "utf8",
    ).replace(/\s+/g, " ");

    // The declaration is not a call; drop it before counting.
    const calls = (src.match(/(?<!function )syncFromServer\(/g) ?? []).length;
    expect(
      calls,
      "no syncFromServer calls found — this guard would pass vacuously",
    ).toBeGreaterThan(0);

    const bare = (src.match(/(?<!function )syncFromServer\(\s*\)/g) ?? [])
      .length;
    expect(
      bare,
      "a syncFromServer call passes no local state, so the server's blanks win " +
        "and the device's coordinate and city are wiped on an ordinary app open",
    ).toBe(0);
  });
});
