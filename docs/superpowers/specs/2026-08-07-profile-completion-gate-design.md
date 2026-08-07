# Mandatory Profile-Completion Gate — Hardening Design

Date: 2026-08-07
Status: Approved, not yet implemented
Repos touched: **both** — `rabbanieserver/repo` (Expo client, this repo) and `~/Development/rabbaanie-api` (production backend, separate git history, deployed to api.rabbaanie.com)

## Problem

A mandatory profile-completion gate already ships today (client commit `a434568`, 2026-07-29): `AuthGate` in `app/_layout.tsx` redirects a signed-in adult user with an incomplete profile to `/onboarding` before letting them reach any other screen. This is not a build-from-zero request — it's a hardening pass on a real, partially-working implementation with several concrete bugs.

1. **The server-side completeness signal is corrupted.** `updateUserProfile` (`rabbaanie-api/server/db.ts:154-165`) sets `onboardingCompleted: true` unconditionally on every `profile.save` call — not just when onboarding actually finishes, since `profile.save` fires on every debounced state mutation the app makes. The dedicated `users.onboardingCompleted` DB column therefore flips to `true` the moment a signed-in user's app syncs anything at all, and stays true forever after. The client works around this by trusting a *different* value — `profileData.onboardingCompleted`, a field inside the JSON blob that happens to round-trip faithfully — but nothing server-side (admin views, CSV export) can use the dedicated column for anything meaningful.
2. **Three separate, disagreeing "is this profile complete" computations exist**, none of them a shared source of truth:
   - Onboarding's own already-done check (`app/onboarding/index.tsx:34-47`) — 6 fields (firstName, lastName, birthDate, address-or-street, gender, phoneNumber). Notably does not check `maritalStatus` or child count either, despite both being required to actually finish the flow.
   - `(tabs)/index.tsx`'s independently recomputed `basicInfoComplete` (`app/(tabs)/index.tsx:416-417`) — the same 6 fields, but silently omits `maritalStatus`, which the onboarding wizard itself treats as required (`app/onboarding/index.tsx:107-110`).
   - The opaque `state.onboardingCompleted` boolean itself, which `AuthGate` trusts directly (`app/_layout.tsx:75`) — the only one of the three that's actually correct today, because it's only set `true` by `completeOnboarding()` at the very end of step 3 (`app/onboarding/index.tsx:129-169`), after child count is collected. Replacing it with a field-based check that omits child count (as a naive unification of the other two would) is a real regression, not a fix — see Design §1.
3. **Zero resumability.** All of onboarding's mandatory fields live only in component `useState` until the very last step (`handleChildrenSubmit`, `app/onboarding/index.tsx:129-169`, fired only when the user taps "Starten"). Back out anywhere in the first two steps and nothing is saved — not locally, not to the server. Next launch restarts from "basic." The *optional* deep wizard (`app/onboarding/parent-profile.tsx`) already saves incrementally after every phase (`handleNext`, `app/onboarding/parent-profile.tsx:857-863`) — mandatory onboarding never adopted that pattern.
4. **Cross-account leakage risk on shared devices.** `AppState` (including `onboardingCompleted`) lives in one device-wide AsyncStorage key (`STORAGE_KEY`, `lib/store.ts:325`), not scoped per account. Every logout/delete path currently remembers to clear it first (`app/(tabs)/settings.tsx:2093-2096`, `app/register.tsx:134-142`, both with comments acknowledging the risk) — but this is convention, not enforcement. A session ending via token expiry or a crash bypasses it, and the next account signing in on that device can inherit a stranger's completion status (or lose their own).
5. **Zero admin visibility.** `admin/users.tsx` and `admin/user.tsx` already fetch every user column (`getAllUsers`, `rabbaanie-api/server/db.ts:182-185`, a plain `select()`) but render nothing about profile completeness. There's no way for an admin to see, or filter to, users who haven't finished onboarding.

## Goals

- One function computes "is this profile complete," used everywhere completeness is checked — self-healing by construction (always recomputed from actual profile fields), not a cached flag that can drift out of sync with reality.
- The server-side completeness signal stops being unconditionally true.
- A user who backs out of mandatory onboarding resumes at the first incomplete step next time, instead of starting over.
- Profile-completion state can never leak from one account to another on a shared device.
- An admin can see, and filter to, users with incomplete profiles.

## Non-goals

- No change to *which* fields are required to finish onboarding (still exactly what the wizard's own three steps already validate: firstName, lastName, birthDate, address, phoneNumber, gender, maritalStatus, and child count) — this is a hardening pass on signal integrity and consistency, not a redesign of what "complete" means. The *unified* check does need to include child count where today's two field-based checks both omit it — see Design §1 — but that's fixing an existing inconsistency against the wizard's own validation, not adding a new requirement.
- No change to the client-trusted architecture itself (the client, not the server, remains where the live gating decision is made during a session) — a server-authoritative redesign was considered and explicitly not chosen.
- No change to `deriveFamilyRole`'s (rabbaanie-api, from this session's Father/Mother work) deliberate stance that a missing gender degrades gracefully to a neutral family role rather than blocking access. That function governs family-permission labeling, a separate concern from app-access gating — this spec does not touch it, and re-requiring gender here (which onboarding's UI already does today, unchanged) does not contradict it.
- No fix to the unrelated, currently-broken Subscribe-screen "My details" save (`app/subscribe.tsx`'s `info` object has no `gender` field, but `rabbaanie-api/server/_core/index.ts:395`'s `REQUIRED_INFO` demands one — a commit message claims a server fix `dd2fc77` that was never actually landed in this repo). Flagged for separate attention, out of scope here.
- No change to the optional deep wizard (`parent-profile.tsx`) or per-child completeness (`children.profileCompleted`) — both already work and are unrelated to the mandatory gate.

## Design

### 1. Single source of truth — `isProfileComplete`

A new pure function, `isProfileComplete(state: { parentProfile: ParentProfile; children: Child[] }): boolean`, added to `lib/app-context.tsx` (or a new small `lib/profile-completeness.ts` if that file is a cleaner home — decided during planning by reading the current file's size and existing exports). Checks exactly what the onboarding wizard's three steps already validate before letting a user tap "Starten": firstName, lastName, birthDate, address-or-street, phoneNumber (step "basic"), gender and maritalStatus (step "gender"), and that a child count was actually submitted — i.e. `children.length > 0` covers both a real child and a placeholder from "I'll fill in children later," since `laterInvullen` placeholders are still real entries in the array (step "children"). This is the field list from `app/onboarding/index.tsx:64-126`'s own per-step validation, not a new definition — the point of unifying is that no caller independently gets to forget one of these the way the two existing field-based checks currently forget `maritalStatus` and child count respectively.

Three existing call sites are updated to call this function instead of their own inline computation:
- `AuthGate` (`app/_layout.tsx:75`) — replaces trusting `appState?.onboardingCompleted` directly with `isProfileComplete({ parentProfile: appState?.parentProfile, children: appState?.children })`. The boolean flag is no longer part of the gating decision, and because the unified check now includes child count, this is not a regression from today's boolean-gates-on-step-3-completion behavior.
- Onboarding's own skip-check (`app/onboarding/index.tsx:34-47`).
- `(tabs)/index.tsx`'s redirect check (`app/(tabs)/index.tsx:405-419`), which also picks up the currently-missing `maritalStatus` and child-count checks as a side effect of switching to the shared function.

`app/(tabs)/treatments.tsx`, `app/(tabs)/family.tsx`, `app/(tabs)/personal-advice.tsx`, and `app/details/personal-advice.tsx`'s existing soft in-screen prompts (keyed on the separate `parentProfileCompleted` flag, for the *optional* deep wizard) are untouched — that's a different completeness concept from this spec's scope.

### 2. Server signal fix

`updateUserProfile` (`rabbaanie-api/server/db.ts:154-165`) stops unconditionally setting `onboardingCompleted: true`. It sets the column from whatever `profileData.onboardingCompleted` actually is in the incoming payload (defaulting to the existing row's current value, not `false`, when the incoming payload doesn't include the field at all — most `profile.save` calls are partial-state syncs that don't touch onboarding status either way, and treating "field absent" as "flip to false" would immediately re-break already-completed users on their very next sync).

The dedicated column still isn't precise enough to gate on directly even after this fix (it reflects "was the *client's* onboarding flow marked done at last sync," not a live recomputation) — so a parallel server-side `isProfileComplete` (the same fields-plus-child-count check as §1, reading `profileData.parentProfile` and `profileData.children` from the fetched row) is what actually backs the admin view in §5, not the column. The column becomes a coarse historical signal only, useful for "has this user ever finished onboarding at all," not for precise gating.

### 3. Resumable onboarding

`app/onboarding/index.tsx` calls `updateParentProfile` after each of the first two steps completes (matching `parent-profile.tsx`'s existing incremental-save pattern, `app/onboarding/parent-profile.tsx:857-863`), instead of only persisting once at the very end. On mount, the screen jumps to the first incomplete step using the same three step boundaries §1's `isProfileComplete` checks: "basic" if any of firstName/lastName/birthDate/address/phoneNumber is missing, "gender" if those are present but gender or maritalStatus is missing, "children" if all of the above are present but no child count has been submitted yet — instead of always starting at "basic." The final "Starten" step (child count + the existing side-effect mutations — `setMyGender`, `generateMyId`, `completeOnboarding`) is otherwise unchanged: it's still where child count is first submitted, and reaching it already implies the first two steps saved successfully, so a user who backs out during step 3 correctly resumes there via the same jump logic without needing a separate incremental-save call inside the children step itself.

### 4. Per-account state scoping

`AppState` moves from one fixed device-wide AsyncStorage key (`STORAGE_KEY`, `lib/store.ts:325`) to a key derived from the signed-in user's id (e.g. `` `opvoedadvies_app_state_${userId}` ``). A one-time migration on next login: if the old fixed key still has data and no scoped key exists yet for the signing-in user, adopt the old data as that user's initial scoped state, then delete the old key. Any account signing in after the migration has already run for a different account gets a clean scoped slate — it can never read another account's cached completeness (or any other cached state).

This closes the leakage structurally: every existing logout/delete/expiry path keeps working exactly as it does today, but there is no longer a shared key for a stale write to land in regardless of whether cleanup ran.

### 5. Admin visibility

`admin/users.tsx` (list) gains a completeness badge per row and a filter toggle ("show only incomplete"), both sourced from the server-side `isProfileComplete` computed in §2 (added to whatever payload shape `getAllUsers`/the `admin.users` query already returns, or a small dedicated field added to it — decided during planning). `admin/user.tsx` (detail) gains the same badge plus which of the required fields — including child count — are specifically missing, so an admin looking at one user doesn't have to guess.

## Error handling

- `isProfileComplete` treats any falsy/missing field, or an empty `children` array, as incomplete — no partial credit, no special-casing of empty strings vs. `null` vs. `undefined` (matches the existing onboarding checks' behavior, e.g. `!!(state.parentProfile.firstName && ...)`). It also tolerates a wholly missing `parentProfile` or `children` object without throwing (guards with optional chaining, e.g. `state.parentProfile?.firstName`) — `AuthGate` calls it on every app launch, including before app state has finished hydrating.
- The per-account storage migration (§4) is best-effort and non-destructive: if reading or parsing the old fixed-key data fails for any reason, the signing-in user simply starts with an empty scoped state (equivalent to today's behavior for a brand-new device) rather than blocking login.
- The server signal fix (§2) never rejects a `profile.save` call — it only changes what gets written to one column; a malformed or missing `profileData.onboardingCompleted` in the payload falls back to preserving the existing row's value, never throws.

## Testing

- Client: no screen-component test harness exists in this codebase (same as every other sub-project this session) — verified manually. Manual checklist: back out of onboarding after step 1, relaunch, confirm it resumes at "basic" with the already-entered fields intact; back out after step 2 (gender/maritalStatus set, no child count yet), relaunch, confirm it resumes directly at "children" rather than replaying "basic" or "gender" — this is the case Design §1/§3 exist to fix, so it's the one most worth checking by hand; complete onboarding, confirm `AuthGate` never redirects back; sign out and sign in as a different account on the same device (or simulate via clearing only the session, not app storage), confirm the second account starts with a clean slate regardless of the first account's completeness state.
- Server: unit test for `updateUserProfile`'s corrected `onboardingCompleted` logic (DI-injectable per this session's established pattern, given no test-database exists in this repo) — covering: payload explicitly true → column true; payload explicitly false → column false; payload omits the field entirely → column preserves the existing row's prior value.
