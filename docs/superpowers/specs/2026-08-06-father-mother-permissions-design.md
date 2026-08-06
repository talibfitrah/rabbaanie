# Father/Mother Permission Model — Design

Date: 2026-08-06
Status: Approved, not yet implemented
Repos touched: **both** — `rabbanieserver/repo` (Expo client, this repo) and `~/Development/rabbaanie-api` (production backend, separate git history, deployed to api.rabbaanie.com)

## Problem

The reported symptom — daa3iyah@gmail.com "not registered as a father despite having children registered" — doesn't hold at the data level: his `functionRole` is `vader`, he has a `family_members` row with all four permissions already `true`, and 13 confirmed `parent_child_links` rows. His data is arguably the most complete parent record in production. Live-database investigation (see below) found the real, larger problem underneath the report.

**Two backend systems both claim to represent "family," and they don't reconcile:**

1. **`family` / `family_members`** — role (`vader`/`moeder`/`familielid`/etc.) + a `permissions` JSON (`canEditChildren`, `canViewAdvice`, `canMessage`, `canManageGoals`), enforced server-side for real actions (`canMessage`/`canManageGoals` gate real messaging/goal-management endpoints; `canEditChildren`-equivalent logic gates child write-access). Created silently as a side effect of `profile.save` the first time a parent adds a child (`rabbaanie-api/server/routers.ts:1330-1339` → `db.createFamily`), which **hardcodes the creator's `role` to `"vader"` regardless of actual gender** (`server/db.ts:211`) and grants full permissions to everyone by default. **Zero client UI anywhere reads or writes this system** — not a rudimentary version, nothing. A user has no way to see their own role, their permissions, or anyone else's.
2. **`links` / `parent_child_links` / `partnerships`** — a simpler, public-ID-based linking model (a single `canEdit` boolean, hardcoded `true`, never edited by any UI either) that **every real end-user screen actually uses** (`app/id-management.tsx`, `app/(tabs)/messages.tsx`'s "FAMILY SECTION", `app/(tabs)/family.tsx`'s co-parent card) for linking a spouse or child by ID.

These two systems are populated independently and can disagree. Confirmed live: every one of the 14 `family_members` rows in production has `role='vader'` — zero `'moeder'` rows exist, and 4 of those 14 users are women per their own `functionRole`. Sharpest concrete case: **daa3iyah's own partner, samdahri@gmail.com, is correctly recorded as a mother and confirmed-linked as partner to all 9 of his children via `parent_child_links` — but has no `family_members` row at all, so she holds none of the four permissions on those same children.** This is live, present-tense, not historical.

A third finding, from the same investigation: 68% of users have no `gender` set at all, and the two write paths for parent identity (`users.gender` from onboarding, `user_functions.functionRole` from a separate `setMyGender` mutation) never reconcile with each other. A free-form `users.roles` jsonb "parent" tag also exists, admin-settable, and can be present with zero real family data behind it (confirmed: one super_admin account carries the tag with no children anywhere) — not a reliable signal either.

## Goals

- One authoritative signal for "is this user a father/mother," not a fifth ad-hoc one layered on top of the four that already exist and disagree.
- Fix the root cause (family creation hardcoding `vader`) so it stops producing wrong data going forward, and reconcile the two independent family-creation paths (`profile.save`'s silent auto-family-creation vs. the `links` linking flow) so they don't keep drifting apart.
- Backfill the concrete, already-identified live gaps (the 4 mismatched rows; the samdahri-pattern missing rows) as a reviewed, one-time production data fix.
- A father can view and, if he chooses, restrict a mother's `canEditChildren`/`canManageGoals` — both default full, restriction is optional, never automatic.
- Either partner can invite the other by email/phone when the other doesn't have an account yet, producing a real, immediately-linked account claimable later.
- Restriction capability requires an *active* father account to exist — a single rule that covers both a genuine single-parent family and a father who's been invited but hasn't activated yet, without needing a separate temporary-state mechanism.

## Non-goals

- No change to the `links`/`parent_child_links` `canEdit` boolean or its enforcement — out of scope, a separate mechanism from the `family_members` permissions this design governs.
- No support for family configurations beyond the app's existing binary gender model (`man`/`vrouw` → `vader`/`moeder`) — not a new limitation introduced here, the schema already only supports this.
- No change to `canViewAdvice`/`canMessage` — both stay always-true for every parent, never part of the restriction mechanism.
- No new "father-only, never-adjustable" permission is added now — none was named as a concrete need. The existing JSON `permissions` blob already has room to add one later without a schema change if a real one shows up.

## Design

### 1. Root-cause fix — `createFamily` (rabbaanie-api)

`server/db.ts`'s `createFamily` stops hardcoding `role: "vader"` (currently line 211) and instead derives the creator's role from their `user_functions.functionRole` (`vader`/`moeder`) if set. If unset (no gender on file), the row is created with a neutral placeholder role and the normal permission defaults (full access) still apply — this is exactly where finding 5's mandatory profile-completion gate becomes relevant elsewhere in this project: a user with no gender can't yet be classified as father or mother, but that doesn't block them from having full parent permissions in the meantime.

### 2. Linking-flow reconciliation — `linkPartnerByPublicId` / `confirmLink` / `linkChildByPublicId` (rabbaanie-api)

These currently only write to `parent_child_links`/`partnerships`, never touching `family_members` — this is exactly how samdahri ends up linked-but-unpermissioned. Each gets a new step: after a successful link/confirmation, ensure the linked user has a `family_members` row for the relevant family, creating one (role derived the same way as above) if they don't already have one. This closes the gap going forward for every new link, not just the ones already discovered.

### 3. Backfill (one-time, production data, reviewed script — not an app code path)

- Correct the 4 existing `family_members` rows where `role` contradicts the user's own `functionRole`.
- For every confirmed `parent_child_links`/`partnerships` entry with no corresponding `family_members` row (the samdahri pattern), create one, role derived the same way.
- Run against production directly, reviewed before execution — this is real user data, gets the same care as any other production data change in this project.

### 4. Permission model

- `canViewAdvice` / `canMessage`: always `true` for every parent. Not part of the restriction mechanism.
- `canEditChildren` / `canManageGoals`: default `true` for both father and mother. A father can restrict a mother's access to these two specifically — never the reverse, never his own.
- **Authority gating**: restriction is only *possible* when an active (non-stub) father account exists and is linked to the family. This single condition covers:
  - A genuine single-parent family (no father record at all) → the active parent (of either gender) has full, unrestricted access, same reasoning as today.
  - A father who's been invited but hasn't activated his stub account yet → same outcome, same reasoning — there's no active father to hold the restriction capability yet.
  - Once the father's account activates, the condition becomes true and the standard model applies from that point: he has full access and *can* restrict the mother, starting from full by default (he hasn't taken any restricting action yet, same as any newly-linked father).
  - This condition is evaluated live, not tracked as a one-time transition. If a father's account is later deleted (an existing feature, `profile.deleteAccount`) after he restricted the mother, the "active father exists" condition becomes false again on its own, and her access reverts to full automatically — the same rule that grants her full access in a genuine single-parent family applies for the same reason, without needing separate handling for "father used to exist." No restriction can ever outlive the active father account that set it.

### 5. New backend mutation — `family.updatePermissions` (rabbaanie-api)

Doesn't exist today — the existing `family.updateRole` (owner-only) only ever wrote the `role` column, never `permissions`. New owner-only mutation, modeled on `updateRole`'s existing authorization pattern (`assertFamilyOwner`), restricted to only ever writing `canEditChildren`/`canManageGoals` on another family member's row (never `canViewAdvice`/`canMessage`, never the caller's own row).

### 6. Bidirectional invitation (rabbaanie-api + client)

Either linked partner can invite the other by email or phone when the other doesn't have an account yet. Follows the existing `createUserFromPurchase` pattern (`server/db.ts`, rabbaanie-api) exactly: creates a real user row with an unusable random password hash (bcrypt of a random string — `bcrypt.compare` always fails cleanly, never throws), claimable later via the app's existing "forgot password" flow. The inviting partner specifies the invited person's relationship at invite time (father or mother), reusing the same relationship-picker pattern `app/id-management.tsx`'s existing linking form already has, rather than inventing a new one. The new account is immediately linked (`parent_child_links`/`partnerships`) and given a `family_members` row with the specified role and default (full) permissions.

### 7. Activation detection

"Activated" means the invited person has claimed the stub account — set a real password via the password-reset flow (or completed registration properly some other way). Exact detection mechanism (a dedicated flag vs. inferring from the password hash no longer matching the stub pattern) to be confirmed during planning by reading the current password-reset implementation directly, rather than assumed here.

### 8. Notification

The mother is notified when the father's invited account activates — a real state change worth surfacing (his restriction capability becomes live from that point). Uses the app's existing push-notification infrastructure (already scheduling several notification types for other features) — one new trigger added to existing plumbing, not a new delivery mechanism.

### 9. Client UI — integrated into `app/(tabs)/messages.tsx`'s existing "FAMILY SECTION"

This is genuinely new UI (nothing existed before for any of this) but lives next to the existing spouse-link card rather than as a disconnected new screen, since that's where users already manage their co-parent relationship:

- A father sees his own recognition (father badge) and a way to view/toggle the linked mother's `canEditChildren`/`canManageGoals`.
- A mother sees her own recognition and her current permission state, read-only from her side.
- When no active father exists (single-parent, or father's stub not yet activated), the mother's card shows her as having full access with no restriction controls shown to her (there's nothing to restrict against yet).
- The invite flow (email/phone entry + relationship picker) surfaces when no co-parent is linked yet at all.
- Both surfaces read from `family.members` (already exists server-side, currently has zero client callers) and write via the new `family.updatePermissions` (father-only) and the new invite mutation.

## Error handling

- Invite to an email/phone that already has a real (non-stub) account: surface a clear "this person already has an account — link them by their ID instead" error rather than silently creating a duplicate.
- `family.updatePermissions` called by anyone other than an active father, or targeting the caller's own row: rejected server-side (authorization, not just UI hiding) — mirrors `assertFamilyOwner`'s existing enforcement style.
- Password-reset claim flow: no change to its existing behavior — a stub account's claim is just a normal password reset on an account that happens to have an unusable password already.

## Testing

- Server: `createFamily`'s corrected role derivation (with and without gender set); the linking-flow reconciliation step (link created → `family_members` row appears); `family.updatePermissions` authorization (father-only, can't touch own row, can't touch `canViewAdvice`/`canMessage`); the authority-gating condition (no father / stub father / active father, in each case what a mother can and can't do); the invite flow (stub creation, immediate linking, duplicate-account rejection); the notification trigger firing exactly once on activation.
- Client: no screen-component test harness exists in this codebase (same as the other sub-projects) — verified manually.
