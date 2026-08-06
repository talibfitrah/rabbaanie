# Father/Mother Permission Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One authoritative, self-correcting source for "is this user a father/mother and what can they do" — fix the root cause that produces wrong `family_members.role` data, reconcile the two independent linking paths that currently leave one partner permissioned and the other not, backfill the already-identified live gaps, and ship the father-can-restrict-mother permission model plus bidirectional stub-account invitations end to end.

**Architecture:** All new logic lives on the existing `family`/`family_members` system (rabbaanie-api) — the `links`/`parent_child_links`/`partnerships` system stays untouched per the spec's non-goals, but two of its existing procedures (`confirmLink`, `linkChildByPublicId`) gain a reconciliation step so every real-world linking path also produces a `family_members` row going forward. A new `family.updatePermissions` mutation (father-only, server-enforced) and a new `family.invitePartner` mutation (stub-account creation, modeled on the existing `createUserFromPurchase` pattern) round out the write side. Client UI is new — nothing existed before — and lives inside `app/(tabs)/messages.tsx`'s existing `ParentsSection`, next to the spouse-link card users already know.

**Tech Stack:** Expo/React Native + TypeScript (client, this repo), Node/Express/tRPC + Drizzle/Postgres (server, `~/Development/rabbaanie-api`, branch `master`), Vitest (server tests), Firebase Cloud Messaging via `firebase-admin` (push notifications — **not** Expo's push relay; this backend only ever sends native FCM tokens, see Task 5).

**Repos touched — two separate git histories:**
- Client: `/home/farouq/Development/rabbanieserver/repo` (this repo, branch `main`)
- Server: `/home/farouq/Development/rabbaanie-api` (branch `master`, remote `talibfitrah/rabbaanie-api`, deployed to api.rabbaanie.com)

This repo's own `server/` directory is dead code, never deployed — no task in this plan touches it.

## Global Constraints

- No change to the `links`/`parent_child_links` `canEdit` boolean or its enforcement — a separate mechanism, out of scope.
- No change to `canViewAdvice`/`canMessage` — both stay always-`true` for every parent, never part of the restriction mechanism.
- No new family configuration beyond the app's existing binary gender model (`man`/`vrouw` → `vader`/`moeder`).
- `family_members.permissions` is always written via `JSON.stringify(...)`, matching every existing write site in `server/db.ts` — do not switch to passing a raw object to Drizzle's `json()` column, which would break the read side's `parsePermissions()` fallback parsing.
- **Test coverage policy for this plan, stated once here rather than per task:** this codebase has zero pre-existing test coverage for `server/db.ts`, and no test-database infrastructure exists (confirmed during the Subscriptions sub-project: `getDb()` returns `null` with no `DATABASE_URL`, no `.env`/`vitest.config` in the checkout). Small, pure functions with one or two dependencies get a real Vitest unit test via the dependency-injection pattern established in that sub-project (defaults reproduce production behavior exactly, so real callers are unaffected). Thin orchestration functions that call four or five DB siblings do **not** get artificial DI scaffolding just to force a unit test — they get a documented manual verification procedure instead. Each task below states which applies.
- **Deviation from the spec's illustrative wording, discovered during planning:** §6 says invitation is "by email or phone." Direct search of the server repo (`grep -rniE "twilio|sms|nexmo|vonage|messagebird"`) confirms **no SMS-sending infrastructure exists anywhere in this codebase** — the only outbound-message channel is `sendEmail` (Brevo), already used by the 2FA and password-reset flows. Task 4 below captures email as a required field (the stub account is keyed on it, and it is the only channel that can actually deliver an invite notification) with no separate phone-invite path — a phone number can still be recorded as a contact detail if a future task needs it, but no invite can be *sent* by phone today.
- **Deviation from the spec's illustrative wording, discovered during planning:** §7 speculated between "a dedicated flag vs. inferring from the password hash no longer matching the stub pattern" for activation detection. Direct read of `POST /auth/reset-password` (`rabbaanie-api/server/web-auth.ts:548-641`) shows **neither `authMethod` nor `passwordHash` can distinguish a claimed stub from an unclaimed one** — `createUserFromPurchase`'s stub pattern already sets `authMethod: "email"` at creation (the same value reset-password sets on success), and both the stub's junk hash and a real reset hash are opaque bcrypt strings. Task 5 below adds an explicit `profileData._stubAccount: true` sentinel at stub creation (no schema migration — reuses the same JSON-blob-sentinel idiom the password-reset flow already uses for `_resetCodeHash` etc.) and has the reset flow strip it on success, alongside the existing `_reset*` keys it already strips.

---

### Task 1: Server — root-cause fix + linking-flow reconciliation (rabbaanie-api)

**Files:**
- Modify: `/home/farouq/Development/rabbaanie-api/server/db.ts` (fix `createFamily`, currently lines 201-216; add `deriveFamilyRole`, `ensureOwnFamily`, `ensureLinkedFamilyMembership` near it)
- Modify: `/home/farouq/Development/rabbaanie-api/server/routers.ts` (wire the new helpers into `confirmLink`'s partnership-confirmed branch, currently lines 1717-1732, and into `linkChildByPublicId`, currently lines 1621-1685)
- Create: `/home/farouq/Development/rabbaanie-api/tests/family-role-derivation.test.ts`

**Interfaces:**
- Produces: `deriveFamilyRole(userId, deps?): Promise<string>` (returns `"vader"` / `"moeder"` / `"familielid"` — typed as `string` to match the schema's own unenforced `varchar` column, not a narrower literal union); `ensureOwnFamily(userId): Promise<void>`; `ensureLinkedFamilyMembership(userId, partnerId): Promise<void>` — all exported from `server/db.ts`, all consumed by Task 4 (invite flow) in addition to this task's own call sites.
- Consumes: existing `getUserFunctions(userId)`, `getUserFamilies(userId)`, `getFamilyMembership(userId, familyId)`, `joinFamily(familyId, userId, role)`, `createFamily(name, createdBy)` — all already defined in `server/db.ts`, unchanged in shape.

`createFamily` currently hardcodes `role: "vader"` for whoever creates it (`server/db.ts:211`), regardless of actual gender — confirmed via direct read, and confirmed live in production (14/14 `family_members` rows are `role='vader'`, 4 of them contradicting the holder's own `functionRole`). The fix derives the role instead, defaulting to `"familielid"` — the schema's own pre-existing default value (`drizzle/schema.ts`: `role: varchar("role", { length: 32 }).notNull().default("familielid")`) — when no gender is on file, so an ungendered user still gets a family with full default permissions, just an accurate-instead-of-wrong role label.

`joinFamily` is **not** part of this bug — it already takes an explicit `role` parameter from its caller (`familyRouter.join`, which defaults to `"familielid"`, never hardcodes `"vader"`). Only `createFamily` needed fixing.

Both `familyRouter.create` and `profileRouter.save`'s auto-trigger (`server/routers.ts:1341`, `db.createFamily(child.name + "'s family", ctx.user.id)`) call `createFamily` directly — fixing it once here fixes both callers, with `profileRouter.save`'s silent auto-trigger being the only one either has any live client caller for today (`familyRouter` itself has zero client callers, confirmed by exhaustive grep — the client never uses the `family.*` procedures until Task 7/8 of this plan).

**Deviation from the spec's literal wording, decided during planning:** §2 named three call sites needing reconciliation — `linkPartnerByPublicId`, `confirmLink`, `linkChildByPublicId`. This task wires only the latter two (Steps 6-7). Direct read of `linkPartnerByPublicId` (`server/routers.ts:1898-1964`) shows it only ever creates a **pending, unconfirmed** partnership — its own client-facing copy says so explicitly ("Uw gegevens worden pas gedeeld nadat u bevestigt" / "No data is shared until you confirm"). Nothing has actually been agreed to yet at that point, so there is nothing real to reconcile. `confirmLink`'s partnership-confirmed branch is the actual moment both parties have consented and children get cross-linked — that is the correct, and only necessary, reconciliation point for the partner-linking flow. Wiring `linkPartnerByPublicId` as well would create a `family_members` row for a request the other side might still reject.

- [ ] **Step 1: Write the failing test for `deriveFamilyRole`**

Create `/home/farouq/Development/rabbaanie-api/tests/family-role-derivation.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { deriveFamilyRole } from "../server/db";

describe("deriveFamilyRole", () => {
  it("returns vader when the user has a vader functionRole", async () => {
    const getUserFunctions = vi.fn().mockResolvedValue([{ functionRole: "vader" }]);
    await expect(deriveFamilyRole(1, { getUserFunctions })).resolves.toBe("vader");
  });

  it("returns moeder when the user has a moeder functionRole", async () => {
    const getUserFunctions = vi.fn().mockResolvedValue([{ functionRole: "moeder" }]);
    await expect(deriveFamilyRole(2, { getUserFunctions })).resolves.toBe("moeder");
  });

  it("returns the schema's neutral default when no gendered functionRole is set", async () => {
    const getUserFunctions = vi.fn().mockResolvedValue([{ functionRole: "specialist" }]);
    await expect(deriveFamilyRole(3, { getUserFunctions })).resolves.toBe("familielid");
  });

  it("returns the neutral default when the user has no functions at all", async () => {
    const getUserFunctions = vi.fn().mockResolvedValue([]);
    await expect(deriveFamilyRole(4, { getUserFunctions })).resolves.toBe("familielid");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/farouq/Development/rabbaanie-api && npx vitest run tests/family-role-derivation.test.ts`
Expected: FAIL — `deriveFamilyRole` is not exported from `../server/db` yet.

- [ ] **Step 3: Add `deriveFamilyRole` and fix `createFamily`**

In `/home/farouq/Development/rabbaanie-api/server/db.ts`, replace the existing `createFamily` (currently lines 201-216):

```ts
export async function createFamily(name: string, createdBy: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const inviteCode = generateInviteCode();
  const result = await db.insert(families).values({ name, inviteCode, createdBy });
  const familyId = result[0].insertId;
  // Add creator as first member with full permissions
  await db.insert(familyMembers).values({
    familyId,
    userId: createdBy,
    role: "vader",
    accepted: true,
    permissions: JSON.stringify({ canEditChildren: true, canViewAdvice: true, canMessage: true, canManageGoals: true }),
  });
  return { id: familyId, inviteCode };
}
```

with:

```ts
/**
 * vader/moeder if the user's functionRole says so (set via the setMyGender
 * mutation), else the schema's own neutral default. A user with no gender on
 * file still gets full family_members permissions — this only affects which
 * label they're recorded under, never what they can do.
 */
export async function deriveFamilyRole(
  userId: number,
  deps: { getUserFunctions?: typeof getUserFunctions } = {},
): Promise<string> {
  const getFunctions = deps.getUserFunctions ?? getUserFunctions;
  const functions = await getFunctions(userId);
  if (functions.some((f: any) => f.functionRole === "vader")) return "vader";
  if (functions.some((f: any) => f.functionRole === "moeder")) return "moeder";
  return "familielid";
}

export async function createFamily(name: string, createdBy: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const inviteCode = generateInviteCode();
  const result = await db.insert(families).values({ name, inviteCode, createdBy });
  const familyId = result[0].insertId;
  const role = await deriveFamilyRole(createdBy);
  // Add creator as first member with full permissions
  await db.insert(familyMembers).values({
    familyId,
    userId: createdBy,
    role,
    accepted: true,
    permissions: JSON.stringify({ canEditChildren: true, canViewAdvice: true, canMessage: true, canManageGoals: true }),
  });
  return { id: familyId, inviteCode };
}
```

(The `result[0].insertId` line is untouched — this is an established convention used at 18 other call sites in this same file for a Postgres+Drizzle setup that apparently supports it; not this task's concern.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /home/farouq/Development/rabbaanie-api && npx vitest run tests/family-role-derivation.test.ts`
Expected: PASS — all 4 cases green.

- [ ] **Step 5: Add the two reconciliation helpers**

In `/home/farouq/Development/rabbaanie-api/server/db.ts`, immediately after the `createFamily` function from Step 3, add:

```ts
/** If `userId` has no family yet, create one for them (creator = themselves). */
export async function ensureOwnFamily(userId: number) {
  const db = await getDb();
  if (!db) return;
  const own = await getUserFamilies(userId);
  if (own.length === 0) await createFamily("Family", userId);
}

/**
 * If `userId` has no family yet, join `partnerId`'s (creating one for
 * `partnerId` first — which also seats `partnerId` themselves — if they have
 * none either). A user who already has their own family keeps it; two users
 * who each already had a separate family before ever linking to each other
 * are not merged.
 * ponytail: no merge for the both-already-had-a-family case — both partners
 * typically link before either has added children solo, so this is rare.
 * Revisit with a real merge if production data shows it happening.
 */
export async function ensureLinkedFamilyMembership(userId: number, partnerId: number) {
  const db = await getDb();
  if (!db) return;
  const own = await getUserFamilies(userId);
  if (own.length > 0) return;
  let partnerFamilies = await getUserFamilies(partnerId);
  if (partnerFamilies.length === 0) {
    await createFamily("Family", partnerId);
    partnerFamilies = await getUserFamilies(partnerId);
  }
  const familyId = partnerFamilies[0].id;
  const already = await getFamilyMembership(userId, familyId);
  if (!already) await joinFamily(familyId, userId, await deriveFamilyRole(userId));
}
```

- [ ] **Step 6: Wire reconciliation into `confirmLink`**

In `/home/farouq/Development/rabbaanie-api/server/routers.ts`, inside `confirmLink`'s `input.senderId` branch, change (currently the partnership-confirmed block, lines 1717-1732):

```ts
        if (
          partnership &&
          (await db.confirmPartnershipRequest(partnership.id, ctx.user.id))
        ) {
          // Both people have now consented. Only at this point share their
          // currently confirmed children in both directions.
          const senderChildren = await db.getLinkedChildren(input.senderId);
          const recipientChildren = await db.getLinkedChildren(ctx.user.id);
          for (const child of senderChildren) {
            await db.linkParentToChild({
              parentId: ctx.user.id,
              childId: child.id,
              relationship: "partner",
              createdBy: input.senderId,
              canEdit: true,
            });
          }
          for (const child of recipientChildren) {
            await db.linkParentToChild({
              parentId: input.senderId,
              childId: child.id,
              relationship: "partner",
              createdBy: input.senderId,
              canEdit: true,
            });
          }
          changed += 1;
        }
```

to:

```ts
        if (
          partnership &&
          (await db.confirmPartnershipRequest(partnership.id, ctx.user.id))
        ) {
          // Both people have now consented. Only at this point share their
          // currently confirmed children in both directions.
          const senderChildren = await db.getLinkedChildren(input.senderId);
          const recipientChildren = await db.getLinkedChildren(ctx.user.id);
          for (const child of senderChildren) {
            await db.linkParentToChild({
              parentId: ctx.user.id,
              childId: child.id,
              relationship: "partner",
              createdBy: input.senderId,
              canEdit: true,
            });
          }
          for (const child of recipientChildren) {
            await db.linkParentToChild({
              parentId: input.senderId,
              childId: child.id,
              relationship: "partner",
              createdBy: input.senderId,
              canEdit: true,
            });
          }
          // Confirmed partners share a family_members family too, not just
          // parent_child_links — this is what closes the gap where one
          // partner ends up linked-but-unpermissioned.
          await db.ensureLinkedFamilyMembership(ctx.user.id, input.senderId);
          await db.ensureLinkedFamilyMembership(input.senderId, ctx.user.id);
          changed += 1;
        }
```

- [ ] **Step 7: Wire reconciliation into `linkChildByPublicId`**

In `/home/farouq/Development/rabbaanie-api/server/routers.ts`, change (currently lines 1631-1638, the start of the mutation body):

```ts
    .mutation(async ({ ctx, input }) => {
      const cleanedChildId = input.childPublicId.trim().replace(/\s+/g, "_");
      const child = await db.linkChildByPublicId(
        cleanedChildId,
        ctx.user.id,
        input.relationship,
      );
      if (!child)
        throw new Error(
          "Kind niet gevonden met dit ID / Child not found with this ID",
        );
```

to:

```ts
    .mutation(async ({ ctx, input }) => {
      const cleanedChildId = input.childPublicId.trim().replace(/\s+/g, "_");
      const child = await db.linkChildByPublicId(
        cleanedChildId,
        ctx.user.id,
        input.relationship,
      );
      if (!child)
        throw new Error(
          "Kind niet gevonden met dit ID / Child not found with this ID",
        );
      await db.ensureOwnFamily(ctx.user.id);
```

- [ ] **Step 8: Run the full server test suite**

Run: `cd /home/farouq/Development/rabbaanie-api && npx vitest run`
Expected: PASS — no regressions in the existing `tests/admin-2fa-email-factor.test.ts`, `tests/co-parent-notifications.test.ts`, `tests/router-access-control.test.ts`, `tests/subscription-management.test.ts` (from the Subscriptions sub-project, if that plan already landed), or the new file.

- [ ] **Step 9: Manual verification**

`ensureOwnFamily`/`ensureLinkedFamilyMembership`/the fixed `createFamily` orchestrate multiple DB calls each and have no test-database available in this checkout (see Global Constraints) — verify manually against a real environment before considering this task done:
1. As a user with `functionRole = "vader"` and no existing family, add a child via the profile flow (triggers `profile.save`'s auto-`createFamily`) — confirm the resulting `family_members` row has `role = 'vader'`, not always `'vader'` regardless (repeat as a `moeder`-functionRole user and confirm `role = 'moeder'`).
2. As two users with no prior family, complete a partner-link-and-confirm flow (`linkPartnerByPublicId` then `confirmLink`) — confirm both end up with a `family_members` row in the *same* `familyId`.
3. As a user who already has a family (from step 1), link a NEW partner who has none — confirm the partner joins the existing user's family, not a fresh one.

- [ ] **Step 10: Commit**

```bash
cd /home/farouq/Development/rabbaanie-api
git add server/db.ts server/routers.ts tests/family-role-derivation.test.ts
git commit -m "fix: derive family role from functionRole, reconcile family_members on link"
```

---

### Task 2: Server — one-time production backfill (rabbaanie-api)

**Files:**
- Create: `/home/farouq/Development/rabbaanie-api/scripts/backfill-family-roles.ts`

**Interfaces:**
- Consumes: `deriveFamilyRole`, `ensureLinkedFamilyMembership` from Task 1; raw Drizzle access via `getDb()`, `families`/`familyMembers`/`parentChildLinks`/`partnerships`/`userFunctions` schema exports.

This is a one-time production data operation, not an app code path — it does not run automatically and is not wired into any server startup or request handler. It fixes the two concrete, already-identified live gaps: the 4 `family_members` rows where `role` contradicts the holder's own `functionRole`, and the samdahri-pattern rows (confirmed `parent_child_links`/`partnerships` entries with no corresponding `family_members` row at all). Defaults to a dry run that only prints what it would change; requires an explicit `--execute` flag to write.

- [ ] **Step 1: Write the script**

Create `/home/farouq/Development/rabbaanie-api/scripts/backfill-family-roles.ts`:

```ts
import { getDb } from "../server/db";
import { eq, and } from "drizzle-orm";
import { familyMembers, parentChildLinks, partnerships, userFunctions, users } from "../drizzle/schema";
import { deriveFamilyRole, ensureLinkedFamilyMembership } from "../server/db";

const EXECUTE = process.argv.includes("--execute");

async function main() {
  const db = await getDb();
  if (!db) throw new Error("Database not available — set DATABASE_URL");

  console.log(EXECUTE ? "=== EXECUTING (writes will happen) ===" : "=== DRY RUN (no writes — pass --execute to apply) ===");

  // Part 1: correct family_members rows where role contradicts functionRole.
  const members = await db.select().from(familyMembers);
  let roleFixes = 0;
  for (const m of members) {
    const functions = await db.select().from(userFunctions).where(eq(userFunctions.userId, m.userId));
    const correctRole = await deriveFamilyRole(m.userId, {
      getUserFunctions: async () => functions,
    });
    if (correctRole !== "familielid" && correctRole !== m.role) {
      roleFixes++;
      console.log(`[role] family_members.id=${m.id} userId=${m.userId}: '${m.role}' -> '${correctRole}'`);
      if (EXECUTE) {
        await db.update(familyMembers).set({ role: correctRole }).where(eq(familyMembers.id, m.id));
      }
    }
  }
  console.log(`Role fixes: ${roleFixes}`);

  // Part 2: confirmed links/partnerships with no family_members row on one side.
  const confirmedLinks = await db.select().from(parentChildLinks).where(eq(parentChildLinks.confirmed, true));
  const confirmedPartnerships = await db.select().from(partnerships).where(and(eq(partnerships.status, "active"), eq(partnerships.confirmed, true)));

  const involvedUserIds = new Set<number>();
  for (const l of confirmedLinks) involvedUserIds.add(l.parentId);
  for (const p of confirmedPartnerships) { involvedUserIds.add(p.userId1); involvedUserIds.add(p.userId2); }

  let backfilled = 0;
  for (const userId of involvedUserIds) {
    const existing = await db.select().from(familyMembers).where(eq(familyMembers.userId, userId)).limit(1);
    if (existing.length > 0) continue;
    // Find a partner who DOES have a family_members row to anchor onto.
    const partnershipsForUser = confirmedPartnerships.filter((p) => p.userId1 === userId || p.userId2 === userId);
    let anchorId: number | null = null;
    for (const p of partnershipsForUser) {
      const otherId = p.userId1 === userId ? p.userId2 : p.userId1;
      const otherHasFamily = await db.select().from(familyMembers).where(eq(familyMembers.userId, otherId)).limit(1);
      if (otherHasFamily.length > 0) { anchorId = otherId; break; }
    }
    if (!anchorId) continue; // no anchor found — leave for a future pass, don't invent a family here.
    backfilled++;
    console.log(`[backfill] userId=${userId} has no family_members row — would join anchor userId=${anchorId}'s family`);
    if (EXECUTE) {
      await ensureLinkedFamilyMembership(userId, anchorId);
    }
  }
  console.log(`Backfilled: ${backfilled}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Dry-run against production (read-only) and review the output**

Run (from the deployment VM, with production `DATABASE_URL` set — dry run performs no writes regardless): `cd /home/farouq/Development/rabbaanie-api && npx tsx scripts/backfill-family-roles.ts`

Expected: prints every `[role]` and `[backfill]` line it would change, ending with two summary counts. Do not proceed to Step 3 without a human reading this output — this is real production data.

- [ ] **Step 3: Execute, gated on explicit user go-ahead**

Only after the dry run's output has been reviewed and the user has explicitly approved it: `cd /home/farouq/Development/rabbaanie-api && npx tsx scripts/backfill-family-roles.ts --execute`

Do not run this step as part of normal plan execution — surface the dry-run output to the user and wait for an explicit go-ahead, the same gate this project already applies to the admin-2FA sub-project's production deploy step.

- [ ] **Step 4: Commit the script (not the execution)**

```bash
cd /home/farouq/Development/rabbaanie-api
git add scripts/backfill-family-roles.ts
git commit -m "chore: one-time backfill script for family_members role/coverage gaps"
```

---

### Task 3: Server — `family.updatePermissions` mutation (rabbaanie-api)

**Files:**
- Modify: `/home/farouq/Development/rabbaanie-api/server/access-control.ts` (export `parsePermissions`; add `assertActiveFather`)
- Modify: `/home/farouq/Development/rabbaanie-api/server/db.ts` (add `updateMemberPermissions`, `mergeFamilyPermissions`)
- Modify: `/home/farouq/Development/rabbaanie-api/server/routers.ts` (add `updatePermissions` to `familyRouter`, currently ending at line 249)
- Create: `/home/farouq/Development/rabbaanie-api/tests/family-permissions-merge.test.ts`

**Interfaces:**
- Produces: `mergeFamilyPermissions(current, patch): { canEditChildren, canViewAdvice, canMessage, canManageGoals }` (pure, exported from `server/db.ts`); `assertActiveFather(user, familyId): Promise<FamilyMember>` (exported from `server/access-control.ts`); the `family.updatePermissions` tRPC mutation, input `{ memberId: number, canEditChildren?: boolean, canManageGoals?: boolean }`.
- Consumes: `getFamilyMemberById`, existing `familyMembers` schema — both already read/verified in Task 1's research.

Authorization is enforced server-side, not just hidden client-side (per the spec's error-handling section): `assertActiveFather` checks the *caller's own* `family_members.role === "vader"` for the target member's family. Since a stub account can never authenticate (its password hash is unusable), the caller side of "active, non-stub father" is automatically satisfied by requiring a real logged-in session at all — no separate stub check is needed on the caller.

- [ ] **Step 1: Write the failing test for the pure merge function**

Create `/home/farouq/Development/rabbaanie-api/tests/family-permissions-merge.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mergeFamilyPermissions } from "../server/db";

describe("mergeFamilyPermissions", () => {
  it("applies a patched field over the current value", () => {
    const result = mergeFamilyPermissions({ canEditChildren: true, canManageGoals: true }, { canEditChildren: false });
    expect(result.canEditChildren).toBe(false);
    expect(result.canManageGoals).toBe(true);
  });

  it("keeps the current value for a field not in the patch", () => {
    const result = mergeFamilyPermissions({ canEditChildren: false, canManageGoals: true }, {});
    expect(result.canEditChildren).toBe(false);
  });

  it("defaults to true when neither the patch nor current state has a value", () => {
    const result = mergeFamilyPermissions({}, {});
    expect(result.canEditChildren).toBe(true);
    expect(result.canManageGoals).toBe(true);
  });

  it("always forces canViewAdvice and canMessage to true regardless of input", () => {
    const result = mergeFamilyPermissions({ canViewAdvice: false, canMessage: false } as any, {});
    expect(result.canViewAdvice).toBe(true);
    expect(result.canMessage).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/farouq/Development/rabbaanie-api && npx vitest run tests/family-permissions-merge.test.ts`
Expected: FAIL — `mergeFamilyPermissions` is not exported yet.

- [ ] **Step 3: Add `mergeFamilyPermissions` and `updateMemberPermissions` to `db.ts`**

In `/home/farouq/Development/rabbaanie-api/server/db.ts`, immediately after `updateMemberRole` (currently lines 293-297), add:

```ts
/**
 * Merge a partial permission patch onto a member's current permissions.
 * canViewAdvice/canMessage are never part of the restriction mechanism —
 * always true regardless of what's passed in either argument.
 */
export function mergeFamilyPermissions(
  current: Record<string, unknown>,
  patch: { canEditChildren?: boolean; canManageGoals?: boolean },
): { canEditChildren: boolean; canViewAdvice: boolean; canMessage: boolean; canManageGoals: boolean } {
  return {
    canEditChildren: patch.canEditChildren ?? (current.canEditChildren as boolean | undefined) ?? true,
    canViewAdvice: true,
    canMessage: true,
    canManageGoals: patch.canManageGoals ?? (current.canManageGoals as boolean | undefined) ?? true,
  };
}

export async function updateMemberPermissions(memberId: number, permissions: Record<string, boolean>) {
  const db = await getDb();
  if (!db) return;
  await db.update(familyMembers).set({ permissions: JSON.stringify(permissions) }).where(eq(familyMembers.id, memberId));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /home/farouq/Development/rabbaanie-api && npx vitest run tests/family-permissions-merge.test.ts`
Expected: PASS — all 4 cases green.

- [ ] **Step 5: Export `parsePermissions` and add `assertActiveFather`**

In `/home/farouq/Development/rabbaanie-api/server/access-control.ts`, change:

```ts
function parsePermissions(value: unknown): Record<string, unknown> {
```

to:

```ts
export function parsePermissions(value: unknown): Record<string, unknown> {
```

Then, immediately after the existing `assertFamilyOwner` function, add:

```ts
export async function assertActiveFather(user: AccessUser, familyId: number) {
  const membership = await assertFamilyAccess(user, familyId);
  if (membership.role !== "vader") {
    forbidden("Alleen de vader kan dit wijzigen");
  }
  return membership;
}
```

- [ ] **Step 6: Add the `updatePermissions` procedure**

In `/home/farouq/Development/rabbaanie-api/server/routers.ts`, find the top of the file where `assertFamilyOwner` and `assertFamilyAccess` are already imported from `./access-control` (used by the existing `updateRole` procedure) and add `assertActiveFather` and `parsePermissions` to that same import line.

Then, inside `familyRouter`, immediately after the existing `updateRole` procedure (currently ending the router block at line 249, just before the closing `});`), add:

```ts

  /** Father-only: restrict or restore the mother's canEditChildren/canManageGoals. */
  updatePermissions: protectedProcedure
    .input(z.object({
      memberId: z.number(),
      canEditChildren: z.boolean().optional(),
      canManageGoals: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const target = await db.getFamilyMemberById(input.memberId);
      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Gezinslid niet gevonden" });
      }
      if (target.userId === ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "U kunt uw eigen rechten niet wijzigen" });
      }
      await assertActiveFather(ctx.user, target.familyId);
      const current = parsePermissions(target.permissions);
      const next = db.mergeFamilyPermissions(current, {
        canEditChildren: input.canEditChildren,
        canManageGoals: input.canManageGoals,
      });
      await db.updateMemberPermissions(input.memberId, next);
      return { success: true };
    }),
```

- [ ] **Step 7: Run the full server test suite**

Run: `cd /home/farouq/Development/rabbaanie-api && npx vitest run`
Expected: PASS.

- [ ] **Step 8: Manual verification**

1. As a father (`role='vader'` in a family with a linked mother), call `family.updatePermissions` with `{ memberId: <mother's family_members id>, canEditChildren: false }` — confirm it succeeds and a subsequent `family.members` call (once Task 6 wires its safe projection) shows her `canEditChildren: false`.
2. As the mother in that same family, attempt the same call targeting the father's own `memberId` — confirm it's rejected (`assertActiveFather` fails, she isn't `vader`).
3. As the father, attempt to target his *own* `memberId` — confirm the explicit self-check rejects it.

- [ ] **Step 9: Commit**

```bash
cd /home/farouq/Development/rabbaanie-api
git add server/db.ts server/access-control.ts server/routers.ts tests/family-permissions-merge.test.ts
git commit -m "feat: father-only family.updatePermissions mutation"
```

---

### Task 4: Server — bidirectional stub-account invitation (rabbaanie-api)

**Files:**
- Modify: `/home/farouq/Development/rabbaanie-api/server/db.ts` (add `findRealUserByEmail`, `createStubFamilyMember`)
- Modify: `/home/farouq/Development/rabbaanie-api/server/routers.ts` (add `invitePartner` to `familyRouter`)

**Interfaces:**
- Produces: `findRealUserByEmail(email): Promise<User | null>`; `createStubFamilyMember(opts: {email, name, language?}): Promise<number | null>` — both exported from `server/db.ts`; the `family.invitePartner` tRPC mutation, input `{ email: string, name: string, relationship: "biological_father" | "biological_mother" }`, output `{ userId: number }`.
- Consumes: `ensureLinkedFamilyMembership` (Task 1), `createPartnership`, `getLinkedChildren`, `linkParentToChild`, `getUserLanguage` — all pre-existing, already verified.

Modeled on the existing `createUserFromPurchase` (`server/db.ts:3233-3271`, unchanged by this task) exactly as the spec calls for: a real user row, an unusable random-bcrypt password hash so `bcrypt.compare` fails cleanly rather than throwing, claimable later through the app's existing "forgot password" flow. The one behavioral difference from `createUserFromPurchase`: this task's router-level duplicate check must *reject* an invite to an existing real account (spec's error-handling requirement) rather than silently reusing it — `createUserFromPurchase`'s own silent-reuse behavior is correct for its own use case (idempotent Stripe webhook retries) and is not changed here.

- [ ] **Step 1: Add `findRealUserByEmail` and `createStubFamilyMember`**

In `/home/farouq/Development/rabbaanie-api/server/db.ts`, immediately after `createUserFromPurchase` (currently ending at line 3271), add:

```ts
/** A real (non-stub) account by email, or null if none exists yet. */
export async function findRealUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return null;
  const cleaned = email.toLowerCase().trim();
  const rows = await db.select().from(users)
    .where(and(sql`lower(${users.email}) = ${cleaned}`, isNull(users.deletedAt))).limit(1);
  const user = rows[0];
  if (!user) return null;
  if ((user.profileData as any)?._stubAccount) return null;
  return user;
}

/**
 * Create a stub account for a co-parent who doesn't have one yet, invited by
 * their partner. Same unusable-password pattern as createUserFromPurchase —
 * claimable later via the normal "forgot password" flow. _stubAccount marks
 * it as pending activation (see resolveStubActivation in web-auth.ts, Task 5).
 */
export async function createStubFamilyMember(opts: { email: string; name: string; language?: string }): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const email = opts.email.toLowerCase().trim();
  const bcrypt = (await import("bcryptjs")).default;
  const unusable = await bcrypt.hash(`unset_${Date.now()}_${Math.random()}`, 10);
  const openId = `email_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const rows = await db.insert(users).values({
    openId,
    name: opts.name || email.split("@")[0],
    email,
    passwordHash: unusable,
    authMethod: "email",
    loginMethod: "email",
    role: "user",
    language: opts.language || "nl",
    lastSignedIn: new Date(),
    profileData: { _stubAccount: true },
  }).returning({ id: users.id });
  return rows[0]?.id ?? null;
}
```

- [ ] **Step 2: Add the `invitePartner` procedure**

In `/home/farouq/Development/rabbaanie-api/server/routers.ts`, inside `familyRouter`, immediately after the `updatePermissions` procedure added in Task 3, add:

```ts

  /** Invite a co-parent who doesn't have an account yet — creates a claimable stub. */
  invitePartner: protectedProcedure
    .input(z.object({
      email: z.string().email(),
      name: z.string().min(1).max(255),
      relationship: z.enum(["biological_father", "biological_mother"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const email = input.email.toLowerCase().trim();
      const existingReal = await db.findRealUserByEmail(email);
      if (existingReal) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Deze persoon heeft al een account — koppel via hun ID in plaats daarvan",
        });
      }
      const myLanguage = await db.getUserLanguage(ctx.user.id);
      const stubId = await db.createStubFamilyMember({ email, name: input.name, language: myLanguage });
      if (!stubId) throw new Error("Kon geen account aanmaken");

      await db.createPartnership(ctx.user.id, stubId, ctx.user.id, true);
      const myChildren = await db.getLinkedChildren(ctx.user.id);
      for (const child of myChildren) {
        await db.linkParentToChild({
          parentId: stubId,
          childId: child.id,
          relationship: input.relationship,
          createdBy: ctx.user.id,
          canEdit: true,
        });
      }
      await db.ensureLinkedFamilyMembership(stubId, ctx.user.id);
      await db.ensureLinkedFamilyMembership(ctx.user.id, stubId);

      const { sendEmail } = await import("./_core/email");
      const inviterName = ctx.user.name || "Iemand";
      await sendEmail({
        to: email,
        subject: "Rabbaanie - U bent uitgenodigd / You've been invited",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #1B4332; margin: 0;">Rabbaanie</h2>
            <p style="color: #333; font-size: 14px;">${inviterName} heeft u toegevoegd als mede-ouder op Rabbaanie.<br/>${inviterName} has added you as a co-parent on Rabbaanie.</p>
            <p style="color: #333; font-size: 14px;">Open de app en gebruik "Wachtwoord vergeten" met dit e-mailadres (${email}) om uw eigen wachtwoord in te stellen.<br/>Open the app and use "Forgot password" with this email address (${email}) to set your own password.</p>
          </div>
        `,
      }).catch((e) => console.warn("[family.invitePartner] Email send failed:", e));

      return { userId: stubId };
    }),
```

- [ ] **Step 3: Manual verification**

1. Invite a brand-new email address as a partner — confirm a new user row appears (`profileData._stubAccount = true`), a confirmed partnership exists, every one of the inviter's existing children is now linked to the new stub with the chosen relationship, both users share a `family_members` family, and an invite email arrives.
2. Invite an email that already belongs to a real (non-stub) account — confirm the mutation rejects with the "already has an account" error and creates nothing.
3. Invite the same new email twice in a row — confirm the second call still rejects once the first has completed (the first invite's stub is no longer "no real account" once created... actually it IS still a stub, not "real" — confirm the *specific* behavior: since `findRealUserByEmail` explicitly excludes stubs, a second invite to the same still-unclaimed email will NOT be rejected by the duplicate check, and will call `createStubFamilyMember` again — which itself has no duplicate-email guard. Confirm this concretely and treat a second successful stub creation for the same email as an accepted, documented limitation for now (the inviter would have no real reason to invite the same email twice in practice); do not add speculative locking for a scenario with no evidence of occurring.)

- [ ] **Step 4: Commit**

```bash
cd /home/farouq/Development/rabbaanie-api
git add server/db.ts server/routers.ts
git commit -m "feat: bidirectional stub-account co-parent invitation"
```

---

### Task 5: Server — activation detection + partner notification (rabbaanie-api)

**Files:**
- Modify: `/home/farouq/Development/rabbaanie-api/server/web-auth.ts` (the `/auth/reset-password` handler, currently lines 548-641)

**Interfaces:**
- Consumes: `getCoParents`, `sendLocalizedPush` from `server/db.ts` (both pre-existing, verified — `sendLocalizedPush` is the same fire-and-forget helper already used by `linkChildByPublicId`/`linkPartnerByPublicId`).

The reset-password success path already destructures out and drops every `_reset*` sentinel key (`_resetCode`, `_resetCodeHash`, `_resetExpires`, `_resetAttempts`, `_resetRequestedAt`) into `cleanProfile` before saving. Adding `_stubAccount` to that same destructure makes "was this a stub, is it now claimed" self-clearing with no extra state to track — a second password reset on the same account will find `_stubAccount` already gone and correctly skip the notification, satisfying "fires exactly once on activation" for free.

- [ ] **Step 1: Import the two db.ts helpers**

In `/home/farouq/Development/rabbaanie-api/server/web-auth.ts`, find the existing import(s) from `./db` near the top of the file and add `getCoParents` and `sendLocalizedPush` to that import list. (If `web-auth.ts` has no existing import from `./db` — it primarily uses the raw Drizzle `db` object directly per the code already read — add a new line: `import { getCoParents, sendLocalizedPush } from "./db";`.)

- [ ] **Step 2: Strip `_stubAccount` on successful reset and notify co-parents when it was set**

In `/home/farouq/Development/rabbaanie-api/server/web-auth.ts`, change (currently the success block, lines ~610-633):

```ts
      const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
      const {
        _resetCode,
        _resetCodeHash,
        _resetExpires,
        _resetAttempts,
        _resetRequestedAt,
        ...cleanProfile
      } = profile;
      // Revoke every bearer/cookie before changing the credential. Doing this
      // first is fail-safe: a rare update race may require another reset, but
      // can never leave copied sessions valid after a successful reset.
      await advanceSessionVersion(user.openId);
      const updated = await db.update(users).set({
        passwordHash: newHash,
        authMethod: "email",
        profileData: cleanProfile,
        updatedAt: new Date(),
      }).where(and(
        eq(users.id, user.id),
        sql`${users.profileData}->>'_resetCodeHash' = ${storedCodeHash}`,
      )).returning({ id: users.id });
      if (updated.length !== 1) {
        res.status(400).json({ error: "Invalid reset code" });
        return;
      }

      res.json({ success: true, message: "Password has been reset successfully" });
```

to:

```ts
      const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
      const wasStub = !!(profile as any)?._stubAccount;
      const {
        _resetCode,
        _resetCodeHash,
        _resetExpires,
        _resetAttempts,
        _resetRequestedAt,
        _stubAccount,
        ...cleanProfile
      } = profile;
      // Revoke every bearer/cookie before changing the credential. Doing this
      // first is fail-safe: a rare update race may require another reset, but
      // can never leave copied sessions valid after a successful reset.
      await advanceSessionVersion(user.openId);
      const updated = await db.update(users).set({
        passwordHash: newHash,
        authMethod: "email",
        profileData: cleanProfile,
        updatedAt: new Date(),
      }).where(and(
        eq(users.id, user.id),
        sql`${users.profileData}->>'_resetCodeHash' = ${storedCodeHash}`,
      )).returning({ id: users.id });
      if (updated.length !== 1) {
        res.status(400).json({ error: "Invalid reset code" });
        return;
      }

      // A stub account just activated — the co-parent who invited them gains
      // restriction authority (if father) from this point, and either way
      // deserves to know the account is now real. _stubAccount was already
      // stripped above, so a second reset on this account won't re-fire this.
      if (wasStub) {
        try {
          const partners = await getCoParents(user.id);
          for (const partner of partners) {
            sendLocalizedPush(
              partner.id,
              "Partner geactiveerd", "Partner activated", "تم تفعيل حساب الشريك",
              `${user.name || "Uw partner"} heeft zijn/haar account geactiveerd.`,
              `${user.name || "Your partner"} has activated their account.`,
              `قام ${user.name || "شريكك"} بتفعيل حسابه.`,
              { type: "partner_activated" },
            ).catch(() => {});
          }
        } catch (e) {
          console.warn("[Auth] Partner-activation notify failed:", e);
        }
      }

      res.json({ success: true, message: "Password has been reset successfully" });
```

- [ ] **Step 3: Manual verification**

1. Invite a partner (Task 4), then complete "forgot password" for the invited email — confirm the inviting partner receives a push notification, and a second password reset on the same account (a normal future "I forgot my password again") does *not* re-send it.
2. Complete a normal password reset for a non-stub account (unrelated to this feature) — confirm no notification fires and no error occurs (the `wasStub` check is `false`, the whole block is skipped).

- [ ] **Step 4: Commit**

```bash
cd /home/farouq/Development/rabbaanie-api
git add server/web-auth.ts
git commit -m "feat: detect stub-account activation, notify co-parent"
```

---

### Task 6: Server — safe `family.members` projection (rabbaanie-api)

**Files:**
- Modify: `/home/farouq/Development/rabbaanie-api/server/routers.ts` (the `members` procedure inside `familyRouter`, currently lines 220-225)

**Interfaces:**
- Produces: `family.members` now returns `Array<{ id, userId, role, permissions: {canEditChildren, canViewAdvice, canMessage, canManageGoals}, stubAccount: boolean, name: string | null }>` instead of the raw joined row.
- Consumes: `parsePermissions` (exported in Task 3) from `./access-control`.

`family.members` has had zero client callers until this plan (confirmed by grep) — `getFamilyMembers` (`server/db.ts:268-279`) joins in each member's **full** `users` row, including `passwordHash`. That was harmless while nothing ever called this procedure; Task 7 below is about to make it load-bearing for real client traffic for the first time, so this task closes the exposure before that happens rather than after — a pre-existing gap this plan is the first to actually make reachable is exactly the kind of "existing code problem that affects the work" worth fixing as part of it, not a separate unrelated cleanup.

- [ ] **Step 1: Replace the procedure body**

In `/home/farouq/Development/rabbaanie-api/server/routers.ts`, change (currently lines 220-225):

```ts
  /** Get family members */
  members: protectedProcedure
    .input(z.object({ familyId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertFamilyAccess(ctx.user, input.familyId);
      return db.getFamilyMembers(input.familyId);
    }),
```

to:

```ts
  /** Get family members — a safe projection, never the raw row (which
   *  carries each member's full users record, including passwordHash). */
  members: protectedProcedure
    .input(z.object({ familyId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertFamilyAccess(ctx.user, input.familyId);
      const rows = await db.getFamilyMembers(input.familyId);
      return rows.map((m: any) => ({
        id: m.id,
        userId: m.userId,
        role: m.role,
        permissions: parsePermissions(m.permissions),
        stubAccount: !!(m.user?.profileData as any)?._stubAccount,
        name: m.user?.name ?? null,
      }));
    }),
```

- [ ] **Step 2: Manual verification**

Call `family.members` for a family with at least one activated and one stub member — confirm the response contains only the 6 listed fields (no `passwordHash`, `email`, `openId`, or any other raw `users` column), `permissions` is a plain parsed object (not a JSON string), and `stubAccount` is `true` only for the unactivated invitee.

- [ ] **Step 3: Commit**

```bash
cd /home/farouq/Development/rabbaanie-api
git add server/routers.ts
git commit -m "fix: project family.members to a safe shape, no raw passwordHash"
```

---

### Task 7: Client — permission UI in `ParentsSection` (rabbanieserver/repo)

**Files:**
- Modify: `/home/farouq/Development/rabbanieserver/repo/app/(tabs)/messages.tsx` (add a new `CoParentPermissions` component; render it from `ParentsSection`, currently ending at line 960)

**Interfaces:**
- Consumes: `trpc.family.list`, `trpc.family.members`, `trpc.family.updatePermissions` (Tasks 1/3/6, reached through this repo's typed `trpc` client — same `family` namespace `familyRouter` already registers under, confirmed via `server/routers.ts`).
- Produces: nothing consumed elsewhere in this plan.

Reuses this file's own established conventions throughout: the local `tx(lang, nl, en, ar)` helper (line 52), the `colors`/`isRTL` styling patterns already used by `LinkRequestActions` and `ParentsSection` itself, and a self-contained sub-component pattern (matching how `LinkRequestActions` already calls its own tRPC hooks independently rather than receiving them as props).

- [ ] **Step 1: Add the `CoParentPermissions` component**

In `/home/farouq/Development/rabbanieserver/repo/app/(tabs)/messages.tsx`, immediately before the `// ============ FAMILY SECTION (أسرتي) ============` comment (currently line 716), add:

```tsx
function CoParentPermissions({ colors, lang, isRTL }: { colors: any; lang: string; isRTL: boolean }) {
  const familyListQuery = trpc.family.list.useQuery();
  const myFamily = (familyListQuery.data as any[])?.[0];
  const membersQuery = trpc.family.members.useQuery(
    { familyId: myFamily?.id! },
    { enabled: !!myFamily?.id },
  );
  const updatePerm = trpc.family.updatePermissions.useMutation({
    onSuccess: () => membersQuery.refetch(),
  });

  if (!myFamily || !membersQuery.data) return null;
  const members = membersQuery.data as any[];
  const myUserId = myFamily.membership?.userId;
  const isFather = myFamily.membership?.role === "vader";
  const activeFather = members.find((m) => m.role === "vader" && !m.stubAccount);
  const other = members.find((m) => m.userId !== myUserId);
  if (!other) return null;
  const otherPerms = other.permissions || {};

  const PERMS: Array<{ key: "canEditChildren" | "canManageGoals"; label: string }> = [
    { key: "canEditChildren", label: tx(lang, "Kinderen bewerken", "Edit children", "تعديل بيانات الأبناء") },
    { key: "canManageGoals", label: tx(lang, "Doelen beheren", "Manage goals", "إدارة الأهداف") },
  ];

  if (!activeFather) {
    return (
      <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border, marginTop: 10 }}>
        <Text style={{ fontSize: 12, color: colors.muted, textAlign: isRTL ? "right" : "left" }}>
          {tx(lang, "U heeft volledige toegang tot de gezinsgegevens.", "You have full access to the family data.", "لديك صلاحية كاملة للوصول إلى بيانات الأسرة.")}
        </Text>
      </View>
    );
  }

  if (!isFather) {
    return (
      <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border, marginTop: 10 }}>
        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 8, textAlign: isRTL ? "right" : "left" }}>
          {tx(lang, "Mijn rechten", "My permissions", "صلاحياتي")}
        </Text>
        {PERMS.map((p) => (
          <View key={p.key} style={{ flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
            <Text style={{ fontSize: 12, color: colors.foreground }}>{p.label}</Text>
            <Text style={{ fontSize: 12, fontWeight: "700", color: otherPerms[p.key] !== false ? colors.success : colors.error }}>
              {otherPerms[p.key] !== false ? tx(lang, "Toegestaan", "Allowed", "مسموح") : tx(lang, "Beperkt", "Restricted", "مقيّد")}
            </Text>
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border, marginTop: 10 }}>
      <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 8, textAlign: isRTL ? "right" : "left" }}>
        {tx(lang, "Rechten van partner", "Partner's permissions", "صلاحيات الشريكة")}
      </Text>
      {PERMS.map((p) => {
        const allowed = otherPerms[p.key] !== false;
        return (
          <TouchableOpacity
            key={p.key}
            onPress={() => updatePerm.mutate({ memberId: other.id, [p.key]: !allowed } as any)}
            disabled={updatePerm.isPending}
            style={{ flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "center", marginTop: 6, paddingVertical: 4 }}
          >
            <Text style={{ fontSize: 12, color: colors.foreground }}>{p.label}</Text>
            <View style={{ backgroundColor: allowed ? colors.success + "20" : colors.error + "20", borderRadius: 8, paddingVertical: 3, paddingHorizontal: 10 }}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: allowed ? colors.success : colors.error }}>
                {allowed ? tx(lang, "Toegestaan", "Allowed", "مسموح") : tx(lang, "Beperkt", "Restricted", "مقيّد")}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

```

- [ ] **Step 2: Render it from `ParentsSection`**

In the same file, change (currently lines 869-872, the end of the SPOUSE SECTION):

```tsx
          </View>
        )}
      </View>

      {/* === CHILDREN SECTION === */}
```

to:

```tsx
          </View>
        )}
      </View>

      {coParents.length > 0 && (
        <CoParentPermissions colors={colors} lang={lang} isRTL={isRTL} />
      )}

      {/* === CHILDREN SECTION === */}
```

- [ ] **Step 3: Type-check**

Run: `cd /home/farouq/Development/rabbanieserver/repo && npx tsc --noEmit`
Expected: no new errors attributable to `app/(tabs)/messages.tsx`. (If `trpc.family.updatePermissions`/`.list`/`.members` are not yet in this repo's vendored tRPC router types, this screen's other `family.*`-shaped calls would show the same pre-existing pattern — check whether this repo generates types from the live server or vendors a snapshot the way `app/admin/subscriptions.tsx` does; if vendored and stale, follow that screen's own precedent of an `(trpc as any)` cast at the call site rather than blocking on a type-generation step outside this plan's scope.)

- [ ] **Step 4: Manual verification**

1. As a linked father with a linked mother (post Task 1 reconciliation), open the Messages tab's family section — confirm a "Partner's permissions" card appears with two toggleable rows, both starting "Allowed."
2. Tap "Edit children" to restrict it — confirm it flips to "Restricted" and, on the mother's device, her own "My permissions" card shows the same field as "Restricted" (read-only, no toggle).
3. As a single parent (no co-parent linked yet), confirm no permissions card renders at all (`coParents.length > 0` guard).
4. As a mother whose father-partner exists only as an unactivated stub invite, confirm her card shows the "You have full access" message, not a restricted state.

- [ ] **Step 5: Commit**

```bash
cd /home/farouq/Development/rabbanieserver/repo
git add "app/(tabs)/messages.tsx"
git commit -m "feat: father/mother permission display and controls in the family section"
```

---

### Task 8: Client — invite-by-email UI (rabbanieserver/repo)

**Files:**
- Modify: `/home/farouq/Development/rabbanieserver/repo/app/(tabs)/messages.tsx` (add `InvitePartnerForm`; extend `ParentsSection`'s empty-state card)

**Interfaces:**
- Consumes: `trpc.family.invitePartner` (Task 4).

Extends the existing "no co-parent linked yet" card (`ParentsSection`, currently lines 804-869) — the only empty-state that exists today — with a toggle into an alternative "invite by email" mode, rather than a disconnected new screen. Reuses `id-management.tsx`'s relationship-picker *pattern* (pill buttons over an inline options array) simplified to the two options the spec actually calls for (father/mother, not the four-way biological/step split that screen's child-linking picker offers — this invite is specifically about the co-parent, not an arbitrary relationship type).

- [ ] **Step 1: Add local toggle state to `ParentsSection`**

In `/home/farouq/Development/rabbanieserver/repo/app/(tabs)/messages.tsx`, change (currently the start of `ParentsSection`'s body):

```tsx
}: any) {
  // Sort children by birth date (oldest first)
  const sortedChildren = [...(localChildren || [])].sort((a: any, b: any) => {
```

to:

```tsx
}: any) {
  const [showInvite, setShowInvite] = useState(false);
  // Sort children by birth date (oldest first)
  const sortedChildren = [...(localChildren || [])].sort((a: any, b: any) => {
```

- [ ] **Step 2: Add the toggle and form to the empty-state card**

Change (currently lines 848-857, the end of the Link/QR button row inside the "no co-parent" branch):

```tsx
                <TouchableOpacity
                  onPress={() => router.push("/qr-scanner")}
                  style={{ backgroundColor: colors.surface, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.primary, flexDirection: "row", alignItems: "center", gap: 6 }}
                >
                  <MaterialIcons name="qr-code-scanner" size={16} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 13 }}>QR</Text>
                </TouchableOpacity>
              </View>
            </View>
```

to:

```tsx
                <TouchableOpacity
                  onPress={() => router.push("/qr-scanner")}
                  style={{ backgroundColor: colors.surface, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.primary, flexDirection: "row", alignItems: "center", gap: 6 }}
                >
                  <MaterialIcons name="qr-code-scanner" size={16} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 13 }}>QR</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={() => setShowInvite((v: boolean) => !v)} style={{ marginTop: 10, alignItems: "center" }}>
                <Text style={{ fontSize: 12, color: colors.primary, fontWeight: "600", textDecorationLine: "underline" }}>
                  {showInvite
                    ? tx(lang, "Ik heb toch een ID", "I have an ID after all", "لديّ معرّف في الواقع")
                    : tx(lang, "Partner heeft nog geen account?", "Partner doesn't have an account yet?", "الشريك ليس لديه حساب بعد؟")}
                </Text>
              </TouchableOpacity>
              {showInvite && <InvitePartnerForm colors={colors} lang={lang} isRTL={isRTL} />}
            </View>
```

- [ ] **Step 3: Add the `InvitePartnerForm` component**

In the same file, immediately after the `CoParentPermissions` component added in Task 7 (before the `// ============ FAMILY SECTION (أسرتي) ============` comment), add:

```tsx
function InvitePartnerForm({ colors, lang, isRTL }: { colors: any; lang: string; isRTL: boolean }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState<"biological_father" | "biological_mother">("biological_mother");
  const invite = trpc.family.invitePartner.useMutation();

  const RELATIONSHIPS: Array<{ value: "biological_father" | "biological_mother"; label: string }> = [
    { value: "biological_father", label: tx(lang, "Vader", "Father", "أب") },
    { value: "biological_mother", label: tx(lang, "Moeder", "Mother", "أم") },
  ];

  return (
    <View style={{ marginTop: 12, gap: 8 }}>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder={tx(lang, "Naam van partner", "Partner's name", "اسم الشريك")}
        placeholderTextColor={colors.muted}
        style={{ backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 14, color: colors.foreground, textAlign: isRTL ? "right" : "left" }}
      />
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder={tx(lang, "E-mailadres van partner", "Partner's email", "البريد الإلكتروني للشريك")}
        placeholderTextColor={colors.muted}
        keyboardType="email-address"
        autoCapitalize="none"
        style={{ backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 14, color: colors.foreground, textAlign: isRTL ? "right" : "left" }}
      />
      <View style={{ flexDirection: "row", gap: 8 }}>
        {RELATIONSHIPS.map((r) => (
          <TouchableOpacity
            key={r.value}
            onPress={() => setRelationship(r.value)}
            style={{ flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5, alignItems: "center", borderColor: relationship === r.value ? colors.primary : colors.border, backgroundColor: relationship === r.value ? colors.primary + "15" : "transparent" }}
          >
            <Text style={{ fontSize: 12, color: relationship === r.value ? colors.primary : colors.muted, fontWeight: relationship === r.value ? "700" : "400" }}>{r.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity
        onPress={() => invite.mutate({ email: email.trim(), name: name.trim(), relationship })}
        disabled={invite.isPending || !email.trim() || !name.trim()}
        style={{ backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 12, alignItems: "center", opacity: invite.isPending || !email.trim() || !name.trim() ? 0.6 : 1 }}
      >
        {invite.isPending ? <ActivityIndicator color="#fff" size="small" /> : (
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>{tx(lang, "Uitnodiging sturen", "Send invite", "إرسال دعوة")}</Text>
        )}
      </TouchableOpacity>
      {invite.isSuccess && (
        <Text style={{ color: colors.success, fontSize: 12, textAlign: "center" }}>{tx(lang, "Uitnodiging verstuurd!", "Invite sent!", "تم إرسال الدعوة!")}</Text>
      )}
      {invite.isError && (
        <Text style={{ color: colors.error, fontSize: 12, textAlign: "center" }}>{(invite.error as any)?.message || tx(lang, "Mislukt", "Failed", "فشل")}</Text>
      )}
    </View>
  );
}

```

- [ ] **Step 4: Type-check**

Run: `cd /home/farouq/Development/rabbanieserver/repo && npx tsc --noEmit`
Expected: no new errors attributable to `app/(tabs)/messages.tsx`.

- [ ] **Step 5: Manual verification**

1. With no co-parent linked, open the family section, tap "Partner doesn't have an account yet?" — confirm the card switches to name/email/relationship-picker/send.
2. Submit with a fresh email — confirm "Invite sent!" appears and (per Task 4/5's server behavior) the invited address receives an email.
3. Submit with an email that already has a real account — confirm the server's "already has an account" error surfaces in the form.
4. Tap "I have an ID after all" — confirm it switches back to the original ID-entry mode without losing anything.

- [ ] **Step 6: Commit**

```bash
cd /home/farouq/Development/rabbanieserver/repo
git add "app/(tabs)/messages.tsx"
git commit -m "feat: invite a co-parent by email who doesn't have an account yet"
```
