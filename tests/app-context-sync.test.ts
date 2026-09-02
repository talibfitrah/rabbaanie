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

import AsyncStorage from "@react-native-async-storage/async-storage";
import { defaultAppState, isProfileComplete } from "@/lib/store";
import {
  syncToServer,
  reconcileEffectiveGender,
  applyReconciledGender,
  mergeServerState,
  fillParentProfileFromServer,
  applyPartnerReplace,
  applyPartnerReplaceForAccount,
  isStillCurrentAccount,
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

/**
 * The autoSync-with-partner path (lib/app-context.tsx hydrate) does a FULL
 * REPLACE of local state with the server copy, so a partner's server-side
 * child removal propagates. But profile.get for a LINKED PARTNER can return
 * onboardingCompleted:true while THIS user's own per-user parentProfile fields
 * (gender/maritalStatus/address/phone — never shared with a partner) are blank
 * server-side. A raw setState(fresh) then reads isProfileComplete=false for one
 * render: AuthGate (lib/app-gate.ts) redirects to /onboarding, onboarding's
 * "already complete -> skip to home" effect fires on the fresh mount and sends
 * the user back — the reported tab<->onboarding loop for spouse accounts.
 * applyPartnerReplace recovers only the own-profile fields the fresh copy left
 * empty, from local; children/environments/etc. still come from fresh.
 */
describe("applyPartnerReplace (guards the linked-partner full replace)", () => {
  const completeProfile = {
    ...defaultAppState.parentProfile,
    firstName: "Yusuf",
    lastName: "Ali",
    birthDate: "1990-01-01",
    country: "Netherlands",
    city: "Amsterdam",
    street: "Hoofdstraat",
    houseNumber: "1",
    phoneNumber: "0612345678",
    gender: "man",
    maritalStatus: "getrouwd",
  };
  const child = { id: "c1", name: "Aisha", birthDate: "2015-01-01" } as any;

  const completeLocal = {
    ...defaultAppState,
    onboardingCompleted: true,
    parentProfile: completeProfile,
    children: [child],
  };

  it("does not demote a complete local profile when the partner's server copy has blank own-profile fields", () => {
    // Server (spouse) copy: onboardingCompleted true (guard passes), full
    // address/name, but the per-user gender + maritalStatus are blank.
    const thinFresh = {
      ...defaultAppState,
      onboardingCompleted: true,
      parentProfile: { ...completeProfile, gender: "", maritalStatus: "" },
      children: [child],
    };
    expect(isProfileComplete(thinFresh)).toBe(false); // precondition: fresh WOULD demote

    const result = applyPartnerReplace(completeLocal, thinFresh);

    expect(isProfileComplete(result)).toBe(true);
    expect(result.parentProfile.gender).toBe("man");
    expect(result.parentProfile.maritalStatus).toBe("getrouwd");
  });

  it("keeps the fresh copy's children so a partner's child removal still propagates", () => {
    const second = { id: "c2", name: "Bilal", birthDate: "2018-02-02" } as any;
    const localTwoKids = { ...completeLocal, children: [child, second] };
    // Partner removed the second child server-side; own profile intact.
    const freshOneKid = {
      ...defaultAppState,
      onboardingCompleted: true,
      parentProfile: completeProfile,
      children: [child],
    };

    const result = applyPartnerReplace(localTwoKids, freshOneKid);

    expect(result.children).toHaveLength(1);
    expect(result.children[0].id).toBe("c1");
  });

  it("lets a non-empty server field win over local (a real server edit is not clobbered)", () => {
    const freshEditedGender = {
      ...defaultAppState,
      onboardingCompleted: true,
      parentProfile: { ...completeProfile, gender: "vrouw" },
      children: [child],
    };

    const result = applyPartnerReplace(completeLocal, freshEditedGender);

    expect(result.parentProfile.gender).toBe("vrouw");
  });

  // hasNoChildren is a boolean, so fillParentProfileFromServer's string-only
  // fill (above) never recovers it: a linked wife who declared "no children"
  // (app/onboarding/index.tsx) has that flag wiped by the next partner sync
  // whose fresh copy carries hasNoChildren false/undefined, demoting her back
  // to onboarding's "children" step forever.
  it("keeps hasNoChildren:true from local when the fresh copy has it missing or false", () => {
    const localChildless = {
      ...defaultAppState,
      onboardingCompleted: true,
      parentProfile: { ...completeProfile, hasNoChildren: true },
      children: [],
    };
    const freshMissing = {
      ...defaultAppState,
      onboardingCompleted: true,
      parentProfile: { ...completeProfile },
      children: [],
    };
    const freshFalse = {
      ...defaultAppState,
      onboardingCompleted: true,
      parentProfile: { ...completeProfile, hasNoChildren: false },
      children: [],
    };

    expect(applyPartnerReplace(localChildless, freshMissing).parentProfile.hasNoChildren).toBe(true);
    expect(applyPartnerReplace(localChildless, freshFalse).parentProfile.hasNoChildren).toBe(true);
  });

  it("does not invent hasNoChildren when local never declared it", () => {
    const freshNoDeclaration = {
      ...defaultAppState,
      onboardingCompleted: true,
      parentProfile: { ...completeProfile },
      children: [child],
    };

    // completeLocal never sets hasNoChildren (see the fixture above).
    const result = applyPartnerReplace(completeLocal, freshNoDeclaration);

    expect(result.parentProfile.hasNoChildren).not.toBe(true);
  });

  it("[regression] a fresh copy with blank gender/maritalStatus and 10 children stays profile-complete", () => {
    const tenChildren = Array.from({ length: 10 }, (_, i) => ({
      id: `c${i}`,
      name: `Child ${i}`,
      birthDate: "2015-01-01",
    })) as any;
    const freshBlankGenderManyChildren = {
      ...defaultAppState,
      onboardingCompleted: true,
      parentProfile: { ...completeProfile, gender: "", maritalStatus: "" },
      children: tenChildren,
    };

    const result = applyPartnerReplace(completeLocal, freshBlankGenderManyChildren);

    expect(isProfileComplete(result)).toBe(true);
  });
});

/**
 * rehydrateFromServer's two raw replaces (post-login, and after a partner
 * sync re-fetch) need the same applyPartnerReplace guard hydrate() got — but
 * they cannot use stateRef.current as the recovery source the way hydrate()
 * does. hydrate() only ever guards its OWN account's in-memory state, already
 * loaded for that account at mount. rehydrateFromServer runs right after
 * login: the Log Out button explicitly calls resetState() before logout()
 * BECAUSE otherwise "the next account to log in on this device inherits it"
 * (see app/(tabs)/settings.tsx) — a session that ends without that button
 * (e.g. a token expiring) leaves a PREVIOUS account's profile sitting in
 * stateRef.current, and applyPartnerReplace(stateRef.current, fresh) would
 * leak that account's gender/maritalStatus/hasNoChildren into whoever logs
 * in next. applyPartnerReplaceForAccount loads THIS account's own saved copy
 * from disk (keyed by userId) instead, which is correctly scoped regardless
 * of what is sitting in memory.
 */
describe("applyPartnerReplaceForAccount (rehydrateFromServer's post-login guard)", () => {
  const ownSavedProfile = {
    firstName: "Yusuf",
    lastName: "Ali",
    birthDate: "1990-01-01",
    country: "Netherlands",
    city: "Amsterdam",
    street: "Hoofdstraat",
    houseNumber: "1",
    phoneNumber: "0612345678",
    gender: "man",
    maritalStatus: "getrouwd",
    hasNoChildren: true,
  };

  beforeEach(() => {
    vi.mocked(AsyncStorage.getItem).mockClear();
  });

  it("recovers this account's own saved profile, not whatever is currently in memory", async () => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValueOnce(
      JSON.stringify({
        ...defaultAppState,
        onboardingCompleted: true,
        parentProfile: { ...defaultAppState.parentProfile, ...ownSavedProfile },
        children: [],
      }),
    );
    const freshFromLogin = {
      ...defaultAppState,
      onboardingCompleted: true,
      // profile.get right after login: own per-user fields still blank.
      parentProfile: { ...defaultAppState.parentProfile },
      children: [],
    };

    const result = await applyPartnerReplaceForAccount(42, freshFromLogin);

    expect(isProfileComplete(result)).toBe(true);
    expect(result.parentProfile.gender).toBe("man");
    expect(result.parentProfile.hasNoChildren).toBe(true);
  });

  it("reads this account's own AsyncStorage key (scoped by userId), not the in-memory state", async () => {
    await applyPartnerReplaceForAccount(42, {
      ...defaultAppState,
      onboardingCompleted: true,
    });

    expect(AsyncStorage.getItem).toHaveBeenCalledWith(
      expect.stringContaining("_42"),
    );
  });
});

/**
 * C1: applyPartnerReplaceForAccount (above) already scopes the MERGE step to
 * this account's own disk copy — but rehydrateFromServer/hydrate then also
 * SAVE under userIdRef.current at the time each await resolves. userIdRef is
 * a mutable ref shared across the whole provider: if a different account
 * signs in (or this one logs out) while a fetch is still in flight,
 * userIdRef has moved on by the time the save runs, and account A's
 * fetched/merged data would be written under account B's key. Every async
 * checkpoint below has to re-check against the id IT captured at the start,
 * not the live ref, and discard (no setState/save) on a mismatch.
 */
describe("isStillCurrentAccount (C1 discard-on-account-switch guard)", () => {
  it("is true only while the ref still matches the id captured when the async op started", () => {
    const ref = { current: 5 as number | null };
    expect(isStillCurrentAccount(ref, 5)).toBe(true);
    ref.current = 6; // a different account signed in mid-flight
    expect(isStillCurrentAccount(ref, 5)).toBe(false);
  });

  it("treats two logged-out reads (both null) as still current", () => {
    expect(isStillCurrentAccount({ current: null }, null)).toBe(true);
  });

  it("catches a logout (ref goes to null) while an op captured a real account id", () => {
    expect(isStillCurrentAccount({ current: null }, 5)).toBe(false);
  });
});

describe("rehydrateFromServer discards a stale account's result instead of saving it under whoever is current now (C1)", () => {
  const src = readFileSync(join(__dirname, "..", "lib", "app-context.tsx"), "utf8");
  const flat = src.replace(/\s+/g, " ");

  function body(): string {
    const start = flat.indexOf("const rehydrateFromServer = useCallback(async () => {");
    expect(start, "rehydrateFromServer not found").toBeGreaterThan(-1);
    const end = flat.indexOf("}, []);", start);
    expect(end, "rehydrateFromServer's end not found").toBeGreaterThan(start);
    return flat.slice(start, end);
  }

  it("captures accountId once and re-checks it after every await before touching state or disk", () => {
    const b = body();
    expect(b).toContain("const accountId = user?.id ?? null;");
    expect(b).toContain("isStillCurrentAccount(userIdRef, accountId)");
    // Every write below keys off the captured accountId, not the live
    // (mutable) ref — the exact substitution the bug needed.
    expect(b).toContain("applyPartnerReplaceForAccount( accountId,");
    expect(b).toContain("saveAppState(safeServerState, accountId)");
    expect(b).toContain("loadAppState(accountId)");
    expect(b).toContain("saveAppState(localState, accountId)");
    expect(b).toContain("saveAppState(safeMergedState, accountId)");
    // The only remaining userIdRef.current in this function is the initial
    // capture — nothing else re-reads the live ref directly.
    const directReads = (b.match(/userIdRef\.current/g) ?? []).length;
    expect(directReads).toBe(1);
  });
});

describe("hydrate's background syncs discard a stale account's result too (C1)", () => {
  const src = readFileSync(join(__dirname, "..", "lib", "app-context.tsx"), "utf8");
  const flat = src.replace(/\s+/g, " ");

  it("pins the post-mount syncFromServer/autoSyncWithPartner chains to the account hydrate() started for", () => {
    const hydrateStart = flat.indexOf("async function hydrate() {");
    expect(hydrateStart).toBeGreaterThan(-1);
    const branchStart = flat.indexOf("if (localState.onboardingCompleted) {", hydrateStart);
    const branchEnd = flat.indexOf("// 3. If local state is empty", branchStart);
    expect(branchStart).toBeGreaterThan(hydrateStart);
    expect(branchEnd).toBeGreaterThan(branchStart);
    const branch = flat.slice(branchStart, branchEnd);

    expect(branch).toContain("const accountId = userIdRef.current;");
    expect(branch).toContain("isStillCurrentAccount(userIdRef, accountId)");
    expect(branch).toContain("saveAppState(updatedState, accountId)");
    expect(branch).toContain("saveAppState(safeState, accountId)");
  });
});
