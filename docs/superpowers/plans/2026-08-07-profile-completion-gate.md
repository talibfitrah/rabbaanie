# Mandatory Profile-Completion Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three disagreeing "is this profile complete" checks with one shared function per repo, fix the server column that's always true, make onboarding resumable, scope local state per account, and give admins visibility into who hasn't finished.

**Architecture:** Two repos, both touched. `~/Development/rabbaanie-api` (server, branch `master`) gets a corrected `updateUserProfile` plus a new `isProfileComplete`/`getMissingProfileFields` pair backing the admin view. `rabbanieserver/repo` (client, branch `main`, this repo) gets a matching `isProfileComplete`/`getFirstIncompleteOnboardingStep` pair in `lib/store.ts`, wired into the three places that gate on completeness today, plus per-account AsyncStorage scoping and an admin UI pass. The two `isProfileComplete` implementations cannot share code (unrelated git histories, no shared package) — they are kept in sync by hand, and every task below states the exact 8-condition field list so both stay identical.

**Tech Stack:** Expo/React Native + TypeScript (client), Node/Drizzle/tRPC + TypeScript (server), vitest in both repos.

## Global Constraints

- Repos: client = `rabbanieserver/repo` (this repo, branch `main`); server = `~/Development/rabbaanie-api` (branch `master`, remote `talibfitrah/rabbaanie-api`, unrelated git history, deployed to api.rabbaanie.com). This repo's own `server/` directory is dead code — never touch it.
- The 8 conditions that define "profile complete" (must match exactly in both repos' implementations): `parentProfile.firstName`, `parentProfile.lastName`, `parentProfile.birthDate`, `parentProfile.streetHouseNumber || parentProfile.address`, `parentProfile.phoneNumber`, `parentProfile.gender`, `parentProfile.maritalStatus`, and `children.length > 0`.
- Client types live in `lib/store.ts`: `ParentProfile`, `ChildProfile` (not `Child`), `AppState`. Import these exact names.
- Test commands: client = `npx vitest run <path>` from `rabbanieserver/repo`; server = `npx vitest run <path>` from `rabbaanie-api`. Both use `describe`/`expect`/`it`/`vi` from `"vitest"`.
- No screen-component test harness exists in either repo. Pure-logic changes (Tasks 1, 2, 3, 6) get real vitest unit tests, matching each repo's existing convention for non-UI logic. UI-only changes (Task 7, and the rendering parts of Tasks 4-5) get manual verification steps instead — do not attempt to mount a React Native screen in a test.
- Every task's file/line citations below were read directly from the current tip of each repo's default branch on 2026-08-07; if a task's target lines have shifted by the time it's dispatched (a prior task in this plan touched the same file), re-read the file rather than trusting the line number blindly.

---

### Task 1: Fix `updateUserProfile`'s always-true onboarding signal (server)

**Repo:** `~/Development/rabbaanie-api`

**Files:**
- Modify: `server/db.ts:154-168` (`updateUserProfile`)
- Test: `tests/profile-update-fields.test.ts` (new)

**Interfaces:**
- Produces: `computeProfileUpdateFields(profileData: unknown): Record<string, any>` (new, exported from `server/db.ts`). `updateUserProfile(userId: number, profileData: unknown): Promise<void>` keeps its existing signature — no caller changes needed.

The current function (verified at `server/db.ts:154-168`):

```typescript
export async function updateUserProfile(userId: number, profileData: unknown) {
  const db = await getDb();
  if (!db) return;
  // Extract key fields into dedicated columns for querying
  const data = profileData as any;
  const parentProfile = data?.parentProfile || {};
  const setFields: any = { profileData, onboardingCompleted: true, lastActive: new Date() };
  if (parentProfile.gender) setFields.gender = parentProfile.gender;
  if (parentProfile.maritalStatus) setFields.maritalStatus = parentProfile.maritalStatus;
  if (parentProfile.maritalStatus) {
    const hasKids = ["getrouwd", "gescheiden", "weduwe_weduwnaar"].includes(parentProfile.maritalStatus) && (data?.children?.length > 0);
    setFields.hasChildren = hasKids;
  }
  await db.update(users).set(setFields).where(eq(users.id, userId));
}
```

`onboardingCompleted: true` is unconditional — it fires on every `profile.save` call, not just when onboarding actually finishes. The fix: only set the column when the payload explicitly says so. Omitting the key from the `SET` clause (rather than reading the row first and re-writing its current value) leaves the column untouched at the SQL level — no extra DB read needed, and this repo has no DI wrapper anywhere that reads-before-writing for this kind of default.

Both call sites were checked and are safe under this change: `server/routers.ts:1305` (`profile.save`) always sends the client's real `AppState.onboardingCompleted` boolean, so behavior there becomes "trust what the client says" (the actual fix). `server/routers.ts:2199` (the partner-merge procedure) builds `mergedData` via `{ ...myData, children: ..., environments: ..., issues: ..., actionPlans: ... }` where `myData = myUser?.profileData` — since `onboardingCompleted` is a top-level field on the client's `AppState` shape, it survives the spread untouched, so this call site's behavior is unchanged (it never intended to touch onboarding status).

- [ ] **Step 1: Write the failing tests**

Create `tests/profile-update-fields.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { computeProfileUpdateFields } from "../server/db";

describe("computeProfileUpdateFields", () => {
  it("sets onboardingCompleted from an explicit true in the payload", () => {
    const fields = computeProfileUpdateFields({ onboardingCompleted: true, parentProfile: {} });
    expect(fields.onboardingCompleted).toBe(true);
  });

  it("sets onboardingCompleted from an explicit false in the payload", () => {
    const fields = computeProfileUpdateFields({ onboardingCompleted: false, parentProfile: {} });
    expect(fields.onboardingCompleted).toBe(false);
  });

  it("omits onboardingCompleted entirely when absent from the payload, preserving the existing row's value", () => {
    const fields = computeProfileUpdateFields({ parentProfile: {} });
    expect(fields).not.toHaveProperty("onboardingCompleted");
  });

  it("still derives gender, maritalStatus and hasChildren the same way as before", () => {
    const fields = computeProfileUpdateFields({
      parentProfile: { gender: "vrouw", maritalStatus: "getrouwd" },
      children: [{ id: "1" }],
    });
    expect(fields.gender).toBe("vrouw");
    expect(fields.maritalStatus).toBe("getrouwd");
    expect(fields.hasChildren).toBe(true);
  });

  it("always includes profileData and lastActive", () => {
    const fields = computeProfileUpdateFields({ parentProfile: {} });
    expect(fields.profileData).toEqual({ parentProfile: {} });
    expect(fields.lastActive).toBeInstanceOf(Date);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/profile-update-fields.test.ts`
Expected: FAIL — `computeProfileUpdateFields` is not exported from `../server/db`.

- [ ] **Step 3: Extract and fix the function**

In `server/db.ts`, replace the current `updateUserProfile` (lines 154-168) with:

```typescript
export function computeProfileUpdateFields(profileData: unknown): Record<string, any> {
  // Extract key fields into dedicated columns for querying
  const data = profileData as any;
  const parentProfile = data?.parentProfile || {};
  const setFields: any = { profileData, lastActive: new Date() };
  // Only touch the column when the client actually reports a value.
  // Omitting the key (instead of defaulting to false) leaves the existing
  // row's value untouched at the SQL level — most profile.save calls are
  // partial-state syncs that don't carry onboarding status either way.
  if (typeof data?.onboardingCompleted === "boolean") {
    setFields.onboardingCompleted = data.onboardingCompleted;
  }
  if (parentProfile.gender) setFields.gender = parentProfile.gender;
  if (parentProfile.maritalStatus) setFields.maritalStatus = parentProfile.maritalStatus;
  if (parentProfile.maritalStatus) {
    const hasKids = ["getrouwd", "gescheiden", "weduwe_weduwnaar"].includes(parentProfile.maritalStatus) && (data?.children?.length > 0);
    setFields.hasChildren = hasKids;
  }
  return setFields;
}

export async function updateUserProfile(userId: number, profileData: unknown) {
  const db = await getDb();
  if (!db) return;
  const setFields = computeProfileUpdateFields(profileData);
  await db.update(users).set(setFields).where(eq(users.id, userId));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/profile-update-fields.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Run the full server test suite to check for regressions**

Run: `npm test`
Expected: All existing tests still pass (this change only affects `updateUserProfile`'s internals; both callers were verified safe above).

- [ ] **Step 6: Commit**

```bash
git add server/db.ts tests/profile-update-fields.test.ts
git commit -m "fix: updateUserProfile must not unconditionally mark onboarding complete"
```

---

### Task 2: Server-side `isProfileComplete` + admin visibility wiring (server)

**Repo:** `~/Development/rabbaanie-api`

**Files:**
- Modify: `server/db.ts` (add two functions near `getAllUsers`, currently at lines 182-186)
- Modify: `server/routers.ts:879` (`adminRouter.users` procedure)
- Test: `tests/profile-completeness-admin.test.ts` (new)

**Interfaces:**
- Consumes: nothing from Task 1 (independent addition to the same file).
- Produces: `getMissingProfileFields(profileData: unknown): string[]`, `isProfileComplete(profileData: unknown): boolean` (both new, exported from `server/db.ts`). Response shape of the `admin.users` tRPC query changes: each row gains `profileComplete: boolean` and `missingProfileFields: string[]`, and loses the raw `profileData` field. Task 7 (client) consumes these two new fields.

`getAllUsers()` (`server/db.ts:182-186`, unqualified `select()`) already returns every column including the full `profileData` JSON blob for every user. The admin router is the right layer to shape this into an API response — `db.getAllUsers()` itself stays a plain data fetch.

- [ ] **Step 1: Write the failing tests**

Create `tests/profile-completeness-admin.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { isProfileComplete, getMissingProfileFields } from "../server/db";

describe("getMissingProfileFields / isProfileComplete", () => {
  it("reports every field missing for an empty profile", () => {
    const missing = getMissingProfileFields({});
    expect(missing).toEqual(["firstName", "lastName", "birthDate", "address", "phoneNumber", "gender", "maritalStatus", "children"]);
    expect(isProfileComplete({})).toBe(false);
  });

  it("accepts streetHouseNumber as satisfying the address requirement", () => {
    const profileData = {
      parentProfile: {
        firstName: "A", lastName: "B", birthDate: "1990-01-01",
        streetHouseNumber: "Kerkstraat 1", phoneNumber: "+31612345678",
        gender: "man", maritalStatus: "getrouwd",
      },
      children: [{ id: "1" }],
    };
    expect(getMissingProfileFields(profileData)).toEqual([]);
    expect(isProfileComplete(profileData)).toBe(true);
  });

  it("still reports incomplete when every field but child count is present", () => {
    const profileData = {
      parentProfile: {
        firstName: "A", lastName: "B", birthDate: "1990-01-01",
        address: "Kerkstraat 1, 1012 AB, Nederland", phoneNumber: "+31612345678",
        gender: "man", maritalStatus: "getrouwd",
      },
      children: [],
    };
    expect(getMissingProfileFields(profileData)).toEqual(["children"]);
    expect(isProfileComplete(profileData)).toBe(false);
  });

  it("tolerates missing profileData without throwing", () => {
    expect(() => getMissingProfileFields(null)).not.toThrow();
    expect(isProfileComplete(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/profile-completeness-admin.test.ts`
Expected: FAIL — `isProfileComplete`/`getMissingProfileFields` are not exported from `../server/db`.

- [ ] **Step 3: Add the two functions to server/db.ts**

Add directly after `getAllUsers` (`server/db.ts:182-186`):

```typescript
export function getMissingProfileFields(profileData: unknown): string[] {
  const data = profileData as any;
  const p = data?.parentProfile || {};
  const missing: string[] = [];
  if (!p.firstName) missing.push("firstName");
  if (!p.lastName) missing.push("lastName");
  if (!p.birthDate) missing.push("birthDate");
  if (!(p.streetHouseNumber || p.address)) missing.push("address");
  if (!p.phoneNumber) missing.push("phoneNumber");
  if (!p.gender) missing.push("gender");
  if (!p.maritalStatus) missing.push("maritalStatus");
  if (!(Array.isArray(data?.children) && data.children.length > 0)) missing.push("children");
  return missing;
}

export function isProfileComplete(profileData: unknown): boolean {
  return getMissingProfileFields(profileData).length === 0;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/profile-completeness-admin.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Wire into the admin router**

In `server/routers.ts`, replace the `users` procedure (currently at line 879):

```typescript
  /** Get all users */
  users: adminProcedure.query(async () => {
    return db.getAllUsers();
  }),
```

with:

```typescript
  /** Get all users, with derived profile-completeness for the admin views.
   *  Drops the raw profileData blob — the admin list/detail screens only
   *  need the derived summary, not every user's full personal answers. */
  users: adminProcedure.query(async () => {
    const allUsers = await db.getAllUsers();
    return allUsers.map(({ profileData, ...rest }) => ({
      ...rest,
      profileComplete: db.isProfileComplete(profileData),
      missingProfileFields: db.getMissingProfileFields(profileData),
    }));
  }),
```

- [ ] **Step 6: Run the full server test suite**

Run: `npm test`
Expected: All tests pass. No existing test reads `profileData` off the `admin.users` response (verify with `grep -rn "profileData" tests/` — if any test does depend on it, that is a real, unexpected coupling; stop and report it rather than adjusting the test to match).

- [ ] **Step 7: Commit**

```bash
git add server/db.ts server/routers.ts tests/profile-completeness-admin.test.ts
git commit -m "feat: server-side isProfileComplete backing admin user visibility"
```

---

### Task 3: Client `isProfileComplete` + resumability helper (client)

**Repo:** `rabbanieserver/repo` (this repo)

**Files:**
- Modify: `lib/store.ts` (add two functions after `clearAppState`, currently ending at line 381, before the `// ============ HELPER FUNCTIONS ============` comment at line 383)
- Test: `tests/profile-completeness.test.ts` (new)

**Interfaces:**
- Produces: `getFirstIncompleteOnboardingStep(state: { parentProfile?: ParentProfile; children?: ChildProfile[] }): "basic" | "gender" | "children" | null` and `isProfileComplete(state: { parentProfile?: ParentProfile; children?: ChildProfile[] }): boolean` (both new, exported from `lib/store.ts`). Tasks 4 and 5 consume both.

`isProfileComplete` is defined in terms of `getFirstIncompleteOnboardingStep` so the two can never disagree — the whole point of this task is one source of truth, including for the step-level resume logic Task 5 needs.

- [ ] **Step 1: Write the failing tests**

Create `tests/profile-completeness.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { isProfileComplete, getFirstIncompleteOnboardingStep, defaultParentProfile } from "../lib/store";

describe("getFirstIncompleteOnboardingStep / isProfileComplete", () => {
  it("resumes at basic when a required basic field is missing", () => {
    expect(getFirstIncompleteOnboardingStep({ parentProfile: defaultParentProfile, children: [] })).toBe("basic");
  });

  it("resumes at gender when basic fields are present but gender/maritalStatus are not", () => {
    const parentProfile = {
      ...defaultParentProfile,
      firstName: "A", lastName: "B", birthDate: "1990-01-01",
      streetHouseNumber: "Kerkstraat 1", phoneNumber: "+31612345678",
    };
    expect(getFirstIncompleteOnboardingStep({ parentProfile, children: [] })).toBe("gender");
  });

  it("resumes at children when basic and gender fields are present but no children were submitted", () => {
    const parentProfile = {
      ...defaultParentProfile,
      firstName: "A", lastName: "B", birthDate: "1990-01-01",
      streetHouseNumber: "Kerkstraat 1", phoneNumber: "+31612345678",
      gender: "man", maritalStatus: "getrouwd",
    };
    expect(getFirstIncompleteOnboardingStep({ parentProfile, children: [] })).toBe("children");
    expect(isProfileComplete({ parentProfile, children: [] })).toBe(false);
  });

  it("is complete once a child (or a later-invullen placeholder) exists", () => {
    const parentProfile = {
      ...defaultParentProfile,
      firstName: "A", lastName: "B", birthDate: "1990-01-01",
      streetHouseNumber: "Kerkstraat 1", phoneNumber: "+31612345678",
      gender: "man", maritalStatus: "getrouwd",
    };
    const children = [{ id: "1", name: "Kind 1", birthDate: "", gender: "" as const, profileCompleted: false, laterInvullen: true }];
    expect(getFirstIncompleteOnboardingStep({ parentProfile, children })).toBe(null);
    expect(isProfileComplete({ parentProfile, children })).toBe(true);
  });

  it("tolerates a wholly missing parentProfile or children without throwing", () => {
    expect(() => isProfileComplete({})).not.toThrow();
    expect(isProfileComplete({})).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/profile-completeness.test.ts`
Expected: FAIL — `isProfileComplete`/`getFirstIncompleteOnboardingStep` are not exported from `../lib/store`.

- [ ] **Step 3: Add the two functions to lib/store.ts**

Add a new section after `clearAppState` (ends at line 381) and before the `// ============ HELPER FUNCTIONS ============` comment (line 383):

```typescript
// ============ PROFILE COMPLETENESS ============

export function getFirstIncompleteOnboardingStep(
  state: { parentProfile?: ParentProfile; children?: ChildProfile[] }
): "basic" | "gender" | "children" | null {
  const p = state.parentProfile;
  if (!(p?.firstName && p?.lastName && p?.birthDate && (p?.streetHouseNumber || p?.address) && p?.phoneNumber)) {
    return "basic";
  }
  if (!(p?.gender && p?.maritalStatus)) {
    return "gender";
  }
  if (!(state.children && state.children.length > 0)) {
    return "children";
  }
  return null;
}

export function isProfileComplete(state: { parentProfile?: ParentProfile; children?: ChildProfile[] }): boolean {
  return getFirstIncompleteOnboardingStep(state) === null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/profile-completeness.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Run the full client test suite**

Run: `npm test`
Expected: All existing tests still pass (this is a pure addition, nothing else imports from `lib/store.ts` in a way this touches).

- [ ] **Step 6: Commit**

```bash
git add lib/store.ts tests/profile-completeness.test.ts
git commit -m "feat: shared isProfileComplete and onboarding-resume helper"
```

---

### Task 4: Wire `isProfileComplete` into AuthGate and the home tab (client)

**Repo:** `rabbanieserver/repo`

**Files:**
- Modify: `app/_layout.tsx:224` (`AuthGate`'s `profileDone`)
- Modify: `app/(tabs)/index.tsx:415-420` (the `basicInfoComplete` gate)

**Interfaces:**
- Consumes: `isProfileComplete` from Task 3 (`lib/store.ts`).

This task is a mechanical swap — no new logic, just replacing two of the three disagreeing checks documented in the spec with the shared function. The third (onboarding's own skip-check) is Task 5, because it also needs the resumability helper.

- [ ] **Step 1: Update app/_layout.tsx**

Add an import alongside the existing `@/lib/app-context` import (near line 26):

```typescript
import { isProfileComplete } from "@/lib/store";
```

Replace line 224:

```typescript
  const profileDone = appLoading ? true : !!appState?.onboardingCompleted;
```

with:

```typescript
  const profileDone = appLoading
    ? true
    : isProfileComplete({ parentProfile: appState?.parentProfile, children: appState?.children });
```

The `appLoading ? true : ...` wrapper is unchanged — it exists so a user with a complete profile never sees a one-frame flash of the onboarding redirect while local state is still hydrating (see the comment immediately above this line in the file). Only the completeness computation itself changes.

- [ ] **Step 2: Update app/(tabs)/index.tsx**

Extend the existing `lib/store` import (line 8):

```typescript
import { calculateAgeInWeeks, getYearKey, getWeekInYear, type DailyCheckin } from "@/lib/store";
```

becomes:

```typescript
import { calculateAgeInWeeks, getYearKey, getWeekInYear, isProfileComplete, type DailyCheckin } from "@/lib/store";
```

Replace lines 415-420:

```typescript
  // Gate: mandatory basic info must be filled
  const hasAddress = !!(state.parentProfile.streetHouseNumber || state.parentProfile.address);
  const basicInfoComplete = !!(state.parentProfile.firstName && state.parentProfile.lastName && state.parentProfile.birthDate && hasAddress && state.parentProfile.gender && state.parentProfile.phoneNumber);
  if (!basicInfoComplete) {
    setTimeout(() => router.replace("/onboarding"), 0);
    return <View style={s.loadingWrap}><ActivityIndicator size="large" color="#1B4332" /></View>;
  }
```

with:

```typescript
  // Gate: mandatory profile fields must be complete
  if (!isProfileComplete({ parentProfile: state.parentProfile, children: state.children })) {
    setTimeout(() => router.replace("/onboarding"), 0);
    return <View style={s.loadingWrap}><ActivityIndicator size="large" color="#1B4332" /></View>;
  }
```

Leave the block immediately above this (lines 405-413, the `!state.onboardingCompleted` → language-select-or-onboarding branch) untouched — it is a separate first-launch UX decision, not a completeness gate, and is out of this spec's scope.

- [ ] **Step 3: Manual verification**

No test harness exists for screen components in this repo. Verify by hand:
1. Start the app with a fresh/incomplete account. Confirm the home tab still redirects to `/onboarding` (now via `isProfileComplete` instead of `basicInfoComplete`).
2. Complete onboarding fully. Confirm the home tab renders normally and `AuthGate` does not redirect.
3. In dev tools or via a debug build, manually set `parentProfile.maritalStatus` to empty on an otherwise-complete local profile (this is exactly the case the old `basicInfoComplete` missed). Confirm you are now correctly redirected to onboarding — this is the regression the old check had and the new one fixes.

- [ ] **Step 4: Commit**

```bash
git add app/_layout.tsx "app/(tabs)/index.tsx"
git commit -m "fix: gate on the shared isProfileComplete, not two disagreeing field lists"
```

---

### Task 5: Resumable onboarding (client)

**Repo:** `rabbanieserver/repo`

**Files:**
- Modify: `app/onboarding/index.tsx` (skip-check at lines 34-47, step initializer at line 49, `handleBasicSubmit` at lines 64-100, `handleGenderSubmit` at lines 102-112, `handleChildrenSubmit` at lines 121-173)

**Interfaces:**
- Consumes: `isProfileComplete`, `getFirstIncompleteOnboardingStep` from Task 3 (`lib/store.ts`).

This is the task the whole spec exists for: today, all three onboarding steps' data is held only in local `useState` until the final "Starten" tap (`handleChildrenSubmit`) — backing out anywhere before that loses everything. This task saves after each of the first two steps and resumes at the correct step next time.

- [ ] **Step 1: Extend the lib/store import**

Line 8 currently:

```typescript
import { ChildProfile } from "@/lib/store";
```

becomes:

```typescript
import { ChildProfile, isProfileComplete, getFirstIncompleteOnboardingStep } from "@/lib/store";
```

- [ ] **Step 2: Fix the skip-check useEffect**

Replace lines 34-47:

```typescript
  // If the user already has completed onboarding and has basic info,
  // skip this screen entirely (data was restored from server after login)
  useEffect(() => {
    if (
      state.onboardingCompleted &&
      state.parentProfile.firstName &&
      state.parentProfile.lastName &&
      state.parentProfile.birthDate &&
      (state.parentProfile.streetHouseNumber || state.parentProfile.address) &&
      state.parentProfile.gender &&
      state.parentProfile.phoneNumber
    ) {
      console.log("[Onboarding] Data already exists, skipping to main app");
      router.replace("/(tabs)");
    }
  }, [state.onboardingCompleted, state.parentProfile]);
```

with:

```typescript
  // If the profile is already complete, skip this screen entirely (data was
  // restored from server after login). Deliberately does not gate on
  // state.onboardingCompleted first — that flag can be stale on a device
  // that never locally called completeOnboarding() even though the profile
  // itself is fully filled in (e.g. restored from another device).
  useEffect(() => {
    if (isProfileComplete({ parentProfile: state.parentProfile, children: state.children })) {
      console.log("[Onboarding] Data already exists, skipping to main app");
      router.replace("/(tabs)");
    }
  }, [state.parentProfile, state.children]);
```

- [ ] **Step 3: Resume at the first incomplete step**

Replace line 49:

```typescript
  const [step, setStep] = useState<"basic" | "gender" | "children">("basic");
```

with:

```typescript
  const [step, setStep] = useState<"basic" | "gender" | "children">(
    () => getFirstIncompleteOnboardingStep({ parentProfile: state.parentProfile, children: state.children }) || "basic"
  );
```

(The `|| "basic"` fallback only matters if this screen is somehow reached with a fully complete profile — the effect in Step 2 already redirects away from that case, but the lazy initializer runs before that effect's first run, so the fallback keeps the type correct without changing behavior.)

- [ ] **Step 4: Save after step 1 (basic)**

In `handleBasicSubmit` (lines 64-100), replace the final line:

```typescript
    setStep("gender");
```

with:

```typescript
    // Save partial progress
    await updateParentProfile({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      birthDate,
      address: `${streetHouseNumber.trim()}, ${postalCodeCity.trim()}, ${country.trim()}`,
      streetHouseNumber: streetHouseNumber.trim(),
      postalCodeCity: postalCodeCity.trim(),
      country: country.trim(),
      phoneNumber: phoneNumber.trim(),
    });
    setStep("gender");
```

And change the function signature (line 64) from:

```typescript
  const handleBasicSubmit = () => {
```

to:

```typescript
  const handleBasicSubmit = async () => {
```

This matches the existing incremental-save pattern already used in `app/onboarding/parent-profile.tsx:852-853` (`// Save partial progress` / `await updateParentProfile(profile);`). `updateParentProfile` merges into the existing `parentProfile` object (verified at `lib/app-context.tsx:369-380`: `parentProfile: { ...current.parentProfile, ...profile }`) — it does not replace it, so this partial save cannot wipe fields saved by a later step.

- [ ] **Step 5: Save after step 2 (gender)**

In `handleGenderSubmit` (lines 102-112), replace the final line:

```typescript
    setStep("children");
```

with:

```typescript
    // Save partial progress
    await updateParentProfile({ gender, maritalStatus });
    setStep("children");
```

And change the function signature (line 102) from:

```typescript
  const handleGenderSubmit = () => {
```

to:

```typescript
  const handleGenderSubmit = async () => {
```

- [ ] **Step 6: Remove the now-redundant fields from the final submit**

In `handleChildrenSubmit` (starts line 121), the current code (lines 128-140):

```typescript
    // Save all basic info to parent profile
    await updateParentProfile({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      birthDate,
      address: `${streetHouseNumber.trim()}, ${postalCodeCity.trim()}, ${country.trim()}`,
      streetHouseNumber: streetHouseNumber.trim(),
      postalCodeCity: postalCodeCity.trim(),
      country: country.trim(),
      phoneNumber: phoneNumber.trim(),
      gender,
      maritalStatus,
    });

```

is now entirely redundant — every field in it was already saved by Steps 4 and 5 above. Delete this block (the blank line after it too). `handleChildrenSubmit` now starts directly with the child-count validation, followed by `// Create child profiles linked to parent` and the rest of the function (addChildren, setGenderMutation, generateMyIdMutation, completeOnboarding, router.replace) — all unchanged.

- [ ] **Step 7: Manual verification**

No test harness exists for screen components in this repo. Verify by hand:
1. Start onboarding, fill in step 1 (basic), tap Next. Force-quit the app before step 2. Relaunch. Confirm you land on step 2 (gender), not step 1, and step 1's fields are gone from view (they're saved server/local-side, not re-shown — this matches the wizard's existing per-step UI, which doesn't re-render step 1 once you've moved on).
2. Continue: fill in step 2, tap Next. Force-quit before step 3. Relaunch. Confirm you land on step 3 (children) directly — this is the exact scenario the spec's Problem section flags as the core bug.
3. Complete step 3 (Starten). Confirm you land in the main app and relaunching never shows onboarding again.
4. Confirm a completely fresh account still starts at step 1 as before.

- [ ] **Step 8: Commit**

```bash
git add app/onboarding/index.tsx
git commit -m "feat: resume onboarding at the first incomplete step instead of restarting"
```

---

### Task 6: Per-account AsyncStorage scoping (client)

**Repo:** `rabbanieserver/repo`

**Files:**
- Modify: `lib/store.ts:325-373` (`loadAppState`, `saveAppState`)
- Modify: `lib/app-context.tsx` (add `userIdRef`; thread it through `hydrate()`, `persist()`, `rehydrateFromServer()`, `resetState()`)
- Test: `tests/app-state-storage-scoping.test.ts` (new)

**Interfaces:**
- Consumes: nothing from Tasks 3-5 (independent concern — storage keying, not completeness checking). `loadAppState`/`saveAppState` are called only from `lib/app-context.tsx` (verified — no other file in the repo imports them).
- Produces: `loadAppState(userId: number | null): Promise<AppState>`, `saveAppState(state: AppState, userId: number | null): Promise<void>` — signatures change (both gain a required `userId` parameter). This is a breaking change to both functions' call sites, all of which are inside `lib/app-context.tsx` and are updated in this same task.

Today, `AppState` lives under one fixed AsyncStorage key (`opvoedadvies_app_state`) shared by every account that ever signs in on a device. `settings.tsx` (logout) and `register.tsx` (fresh signup) both already call `resetState()` specifically to avoid leaking one account's cached data into the next — but a session that ends via token expiry or a crash skips that call. Scoping the key by user id closes this structurally: a new account can never read a key it has never written to, regardless of whether cleanup ran.

`Auth.getUserInfo()` (`lib/_core/auth.ts:118`, already imported in `app-context.tsx` as `import * as Auth from "@/lib/_core/auth"`) reads the signed-in user's `{ id, ... }` from SecureStore/localStorage — a separate, fast, local, non-network read, independent of `AppState`'s own storage. This is the userId source for every call site below.

- [ ] **Step 1: Write the failing tests**

Create `tests/app-state-storage-scoping.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockStorage: Record<string, string> = {};
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn((key: string) => Promise.resolve(mockStorage[key] ?? null)),
    setItem: vi.fn((key: string, value: string) => {
      mockStorage[key] = value;
      return Promise.resolve();
    }),
    removeItem: vi.fn((key: string) => {
      delete mockStorage[key];
      return Promise.resolve();
    }),
  },
}));

import { loadAppState, saveAppState, defaultAppState } from "../lib/store";

describe("per-account app state storage", () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
  });

  it("saves and loads under a key scoped to the user id", async () => {
    const state = { ...defaultAppState, onboardingCompleted: true };
    await saveAppState(state, 42);
    expect(mockStorage["opvoedadvies_app_state_42"]).toBeDefined();
    expect(mockStorage["opvoedadvies_app_state"]).toBeUndefined();

    const loaded = await loadAppState(42);
    expect(loaded.onboardingCompleted).toBe(true);
  });

  it("a second account never reads the first account's scoped key", async () => {
    await saveAppState({ ...defaultAppState, onboardingCompleted: true }, 1);
    const loadedForOtherUser = await loadAppState(2);
    expect(loadedForOtherUser.onboardingCompleted).toBe(false);
  });

  it("migrates legacy unscoped data to the first account that hydrates after the upgrade, then deletes it", async () => {
    mockStorage["opvoedadvies_app_state"] = JSON.stringify({ ...defaultAppState, onboardingCompleted: true });

    const loaded = await loadAppState(7);
    expect(loaded.onboardingCompleted).toBe(true);
    expect(mockStorage["opvoedadvies_app_state_7"]).toBeDefined();
    expect(mockStorage["opvoedadvies_app_state"]).toBeUndefined();
  });

  it("does not migrate legacy data to a second account once the legacy key is already gone", async () => {
    mockStorage["opvoedadvies_app_state"] = JSON.stringify({ ...defaultAppState, onboardingCompleted: true });
    await loadAppState(7); // first account adopts and clears the legacy key

    const loadedForSecondUser = await loadAppState(8);
    expect(loadedForSecondUser.onboardingCompleted).toBe(false);
  });

  it("falls back to the unscoped key when userId is null", async () => {
    await saveAppState({ ...defaultAppState, onboardingCompleted: true }, null);
    expect(mockStorage["opvoedadvies_app_state"]).toBeDefined();
    const loaded = await loadAppState(null);
    expect(loaded.onboardingCompleted).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/app-state-storage-scoping.test.ts`
Expected: FAIL — `loadAppState`/`saveAppState` don't accept a second/first `userId` argument yet (TypeScript will also flag this at the call sites once Step 3 lands; for now the runtime behavior is what fails).

- [ ] **Step 3: Update lib/store.ts**

Replace lines 325-373 (from `const STORAGE_KEY = ...` through the end of `saveAppState`):

```typescript
const STORAGE_KEY = "opvoedadvies_app_state";

function scopedStorageKey(userId: number | null): string {
  return userId != null ? `${STORAGE_KEY}_${userId}` : STORAGE_KEY;
}

export async function loadAppState(userId: number | null): Promise<AppState> {
  try {
    const key = scopedStorageKey(userId);
    let data = await AsyncStorage.getItem(key);
    if (!data && userId != null) {
      // One-time migration: this account has no scoped data yet on this
      // device. Adopt whatever the old shared key holds (if anything), then
      // retire it, so no later account can ever read it.
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
```

(`clearAppState` is unchanged — it is unused anywhere in the codebase today, confirmed by `grep -rn "clearAppState"` returning only its own definition. Leave it as pre-existing dead code; do not delete it in this task.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/app-state-storage-scoping.test.ts`
Expected: PASS (5 tests). Note: this step will show TypeScript errors from `lib/app-context.tsx`'s now-stale call sites — that's expected until Step 5. Vitest still runs the test file itself since it imports `lib/store.ts` directly, not `app-context.tsx`.

- [ ] **Step 5: Thread userId through lib/app-context.tsx**

Add a ref alongside `stateRef` (currently at line 197):

```typescript
  const stateRef = useRef(state);
  stateRef.current = state;
  const userIdRef = useRef<number | null>(null);
```

In `hydrate()` (starts line 201), before the current first line (`const localState = await loadAppState();`, line 204), add:

```typescript
        const user = await Auth.getUserInfo();
        userIdRef.current = user?.id ?? null;
```

Then change that line itself:

```typescript
        const localState = await loadAppState();
```

to:

```typescript
        const localState = await loadAppState(userIdRef.current);
```

Update the three other `saveAppState`/`loadAppState` calls inside `hydrate()`:
- Line 315: `saveAppState(updatedState);` → `saveAppState(updatedState, userIdRef.current);`
- Line 327: `saveAppState(freshState);` → `saveAppState(freshState, userIdRef.current);`
- Line 341: `await saveAppState(serverState);` → `await saveAppState(serverState, userIdRef.current);`

In `persist()` (line 357), update line 361:

```typescript
    await saveAppState(newState);
```

to:

```typescript
    await saveAppState(newState, userIdRef.current);
```

In `resetState()` (line 565), add a refresh at the start, before its existing `await persist(defaultAppState);`:

```typescript
  const resetState = useCallback(async () => {
    const user = await Auth.getUserInfo();
    userIdRef.current = user?.id ?? null;
    await persist(defaultAppState);
```

(This matters most for the `register.tsx` call site: `completeTokenSignIn` already calls `Auth.setUserInfo()` with the new account's info before `resetState()` runs, per `lib/auth-context.tsx:122`, so this refresh correctly scopes the fresh account's empty state to its own key instead of whatever `userIdRef` held before.)

In `rehydrateFromServer()` (line 679), add the same refresh at the start:

```typescript
  const rehydrateFromServer = useCallback(async () => {
    console.log("[AppContext] rehydrateFromServer called");
    const user = await Auth.getUserInfo();
    userIdRef.current = user?.id ?? null;
    try {
```

And update its three `saveAppState`/`loadAppState` calls:
- Line 687: `await saveAppState(serverState);` → `await saveAppState(serverState, userIdRef.current);`
- Line 691: `const localState = await loadAppState();` → `const localState = await loadAppState(userIdRef.current);`
- Line 708: `await saveAppState(mergedState);` → `await saveAppState(mergedState, userIdRef.current);`

- [ ] **Step 6: Run the full client test suite**

Run: `npm test`
Expected: All tests pass, including the new `tests/app-state-storage-scoping.test.ts` and the TypeScript compile now succeeds (no remaining call sites with the old signature — verify with `grep -n "loadAppState(\|saveAppState(" lib/app-context.tsx` and confirm every match now passes `userIdRef.current` as the appropriate argument).

- [ ] **Step 7: Manual verification**

No test harness exists for the hydration flow's timing in a real app. Verify by hand:
1. Log in as account A on a device, complete onboarding. Log out (via the existing `resetState()` + `logout()` path in settings.tsx — unchanged by this task). Log in as account B on the same device. Confirm B sees a fresh onboarding flow, not A's data.
2. Log out of B, log back in as A. Confirm A's own previously-saved local data is still there (this is a deliberate feature of scoping by id rather than wiping on every logout: each account keeps its own cache across sessions on the same device).
3. If feasible, simulate a crash (force-quit without going through settings.tsx's logout button) after being logged in as A, then log in as B. Confirm B still does not see A's data — this is the exact gap Task 6 exists to close.

- [ ] **Step 8: Commit**

```bash
git add lib/store.ts lib/app-context.tsx tests/app-state-storage-scoping.test.ts
git commit -m "fix: scope local app state per account, not one shared device-wide key"
```

---

### Task 7: Admin visibility (client)

**Repo:** `rabbanieserver/repo`

**Files:**
- Modify: `app/admin/users.tsx` (filter state at lines 27-28, filter logic at lines 31-37, row rendering at lines 71-84)
- Modify: `app/admin/user.tsx` (add a completeness row after the existing info card's last `Row`, before line 84)

**Interfaces:**
- Consumes: `profileComplete: boolean` and `missingProfileFields: string[]` from Task 2's server change, via the existing `trpc.admin.users.useQuery()` (both admin screens already call this same query — `admin/user.tsx` has no separate single-user fetch, it filters the list query's results by id at line 28).

- [ ] **Step 1: Add the filter toggle to app/admin/users.tsx**

Add a new piece of state alongside the existing filters (lines 27-28):

```typescript
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [incompleteOnly, setIncompleteOnly] = useState(false);
```

Extend the filter chain (lines 31-37):

```typescript
  const users = ((usersQuery.data as any[]) || []).filter((u) => {
    const rs = Array.isArray(u.roles) && u.roles.length ? u.roles : [u.role];
    if (roleFilter && !rs.includes(roleFilter)) return false;
    if (incompleteOnly && u.profileComplete) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (u.name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q);
  });
```

- [ ] **Step 2: Add the toggle button and per-row badge**

Add a toggle button right after the existing role-filter `ScrollView` closes — after line 57's `</ScrollView>`, before line 58's closing `</View>` (still inside the same padded container):

```tsx
        <TouchableOpacity onPress={() => setIncompleteOnly(!incompleteOnly)}
          style={{ alignSelf: isRTL ? "flex-end" : "flex-start", flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 6, backgroundColor: incompleteOnly ? colors.error : colors.surface, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14, borderWidth: 1, borderColor: incompleteOnly ? colors.error : colors.border, marginBottom: 4 }}>
          <MaterialIcons name={incompleteOnly ? "check-box" : "check-box-outline-blank"} size={15} color={incompleteOnly ? "#fff" : colors.muted} />
          <Text style={{ fontSize: 12, fontWeight: "700", color: incompleteOnly ? "#fff" : colors.foreground }}>الملفات غير المكتملة فقط</Text>
        </TouchableOpacity>
```

Add a per-row badge, inside the row's `TouchableOpacity` (currently lines 72-83), right after the existing role badge `View` (line 79-81) and before the chevron icon (line 82):

```tsx
              {!u.profileComplete && (
                <View style={{ backgroundColor: colors.error + "20", borderRadius: 10, paddingVertical: 3, paddingHorizontal: 8 }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: colors.error }}>غير مكتمل</Text>
                </View>
              )}
```

- [ ] **Step 3: Add the completeness row and missing-fields list to app/admin/user.tsx**

Add a label lookup near the existing `ROLES`/`roleAr` block (after line 17):

```typescript
const MISSING_FIELD_LABELS: Record<string, string> = {
  firstName: "الاسم الأول",
  lastName: "اسم العائلة",
  birthDate: "تاريخ الميلاد",
  address: "العنوان",
  phoneNumber: "رقم الهاتف",
  gender: "الجنس",
  maritalStatus: "الحالة الاجتماعية",
  children: "عدد الأبناء",
};
```

Add a row after the existing `<Row label="الموقع" .../>` (line 77) and its conditional map link (lines 78-83), inside the same info-card `View`, before its closing tag (line 84):

```tsx
              <Row label="اكتمال الملف الشخصي" value={u.profileComplete ? "مكتمل" : "غير مكتمل"} />
              {!u.profileComplete && Array.isArray(u.missingProfileFields) && u.missingProfileFields.length > 0 && (
                <Text style={{ fontSize: 12, color: colors.error, textAlign: isRTL ? "right" : "left", marginTop: 4 }}>
                  {"الحقول الناقصة: " + u.missingProfileFields.map((k: string) => MISSING_FIELD_LABELS[k] || k).join("، ")}
                </Text>
              )}
```

- [ ] **Step 4: Manual verification**

No test harness exists for screen components in this repo. Verify by hand (requires Task 2 deployed or running locally, since these fields come from the server):
1. Open `/admin/users` as an admin. Confirm users with an incomplete profile show the "غير مكتمل" badge and users with a complete one don't.
2. Tap the "الملفات غير المكتملة فقط" toggle. Confirm the list filters to only incomplete profiles, and toggling again restores the full list. Confirm it composes correctly with the existing role filter and search box (all three should AND together).
3. Open a specific incomplete user's detail screen. Confirm the completeness row shows "غير مكتمل" and the missing-fields line lists the correct Arabic labels for exactly the fields that user hasn't filled in.
4. Open a complete user's detail screen. Confirm it shows "مكتمل" and no missing-fields line.

- [ ] **Step 5: Commit**

```bash
git add app/admin/users.tsx app/admin/user.tsx
git commit -m "feat: admin visibility into profile-completion status"
```
