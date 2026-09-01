# Polygamy / Multi-Wife Suite — Design Spec

Date: 2026-08-31
Status: **Approved by Daa3iyah** (Telegram msg 2469 «أضف كل هذه الأمور بدقة وإحكام»). Implementation phased, not started.
Requirements source (verbatim + interpretation): `local-docs/POLYGAMY-SUITE-REQUIREMENTS.md` (R1–R6, P1–P4).

## Two-repo reality (MANDATORY)
- Client: `rabbaanie` / `main` / Expo-RN / MySQL schema (`drizzle/schema.ts`) — **not production**.
- Server: `rabbaanie-api` / `master` / Postgres — **production**, serves api.rabbaanie.com, deployed to the VM.
- No shared git history; work is hand-ported. **Server anchors below are verified against `/home/msa/Development/rabbaanie-api`.** Subagents do NOT deploy, restart pm2, rsync source files to the VM, or build APKs — the main session gates all of that.

---

## 0. Invariants — the security + shar'i core (every phase MUST preserve these; each is a test)

- **INV-1 Co-wife blindness.** A wife can never see, infer, or receive data about any co-wife or a co-wife's children — via any endpoint, list, notification, or sync. **Server-enforced, never client-hiding.**
- **INV-2 Husband sees all.** The husband sees all his wives and all their children, including ربائب (stepchildren).
- **INV-3 Nasab truth.** A child's biological father is recorded truthfully; the current husband is recorded as **stepfather (رابّ)** for a wife's child by another man — never misattributed as biological father.
- **INV-4 Ex-boundary.** A divorced co-parent (طليق/مطلّقة) sees only the shared children and messages only about them — never the ex's new household, co-wives, remarriage, or profile. (Daa3iyah confirmed, msg 2463.)
- **INV-5 قَسْم privacy.** Night-rotation / قرعة / نفقة tools are **husband-only**; no wife sees the rotation or the existence of co-wives through them.
- **INV-6 Male-only polygamy.** Only a male (`vrouw` ≠ gender) links multiple wives, capped at **4**. A female keeps the existing ≤1-husband cap.

---

## 1. Current model (verified anchors)

- **`partnerships`** (`db.ts:3306`): two-adult link, queried symmetrically. **No UNIQUE constraint; only cap is one-husband-per-woman** (`womanAlreadyHasConfirmedHusband`, `db.ts:3284-3303`) — **men are uncapped**.
- **`parentChildLinks`** (`schema.ts:511-526`): per-parent attribution, `relationship` ∈ {biological_father, biological_mother, stepfather, stepmother, guardian}, `confirmed`, `canEdit`. "Support blended families." This is where father/stepfather/nasab live — NOT on the `children` row.
- **`children`** (`schema.ts:123`): scoped by `familyId`; **no fatherId/motherId**.
- **Isolation status:** partner *list/profile* path already per-viewer isolated (`getPartnersOfUser`, `getPartnerProfile` gate `hasFullPartnerAccess` `routers.ts:2117`, `notSynced` filter `routers.ts:2776`). **LEAK:** `ensureLinkedFamilyMembership` (`db.ts:405-443`) seats co-wives into ONE `familyId`; `getFamilyMembers` (`db.ts:495-506`) + `getFamilyChildren` (`db.ts:560-564`) return everyone/all-children unscoped; `assertChildAccess` grants child access by **family membership OR** parentChildLink — the family-membership branch has no per-mother filter.
- **Messaging:** co-parent 1:1 (`links.sendDirectMessage`/`directMessages`) gated by `areConfirmedCoParents` (`db.ts:4863-4883`) — **path 2 already allows two adults sharing a confirmed `parentChildLink` to message, independent of marriage**. `shared_child_updates` table = "Updates between divorced parents". Gap: partnership-only couples with no per-child links lose messaging after divorce.
- **Advice:** `getSpouseAdvice` uses singular `getPartnerOfUser = partners[0]` (`db.ts:3213`) → can't target a specific wife.
- **Gender landmine:** gates key on Dutch **`man`/`vrouw`** via `resolveGender` (`routers.ts:2141`), not `male`/`female`.
- **Client:** add-partner form hidden once one co-parent exists (`messages.tsx:1008`); `add-child` captures no parent identity; children rendered flat, never per-mother; primary surface for the suite = **`app/(tabs)/family.tsx`** (the العائلة tab in the screenshot).

---

## 2. Requirement → design map

| Req | Behaviour | Core change |
|---|---|---|
| R1 | ≤4 wives; wives blind to each other + each other's children; per-mother children; "who is the father?" on add-child | max-4 cap for men; **close family-path leak** (§3); add-child → parentChildLinks |
| R2 | Husband sees stepchildren; nasab preserved | husband linked `stepfather` to a wife's other-father children; biological father recorded truthfully |
| R3 | Divorced أب/أم co-parent shared children + message | "add طليق as co-parent" creates confirmed parentChildLinks (messaging already works via path 2); INV-4 |
| R4 | القَسْم (المبيت) + قرعة for travel; husband-only | **new module**; 7/3 initial nights + night-gifting; INV-5 |
| R5 | Per-wife distinct spouse advice | replace `getPartnerOfUser` singular with per-wife generation + per-wife UI |
| R6 | "Add wife by public ID" in the Family tab | `family.tsx` الزوجة→الزوجات multi-card + add-by-ID (`linkPartnerByPublicId`) |
| P1 | In-app divorce of a current wife → مطلّقة | dissolve partnership, keep parentChildLinks + messaging, end spouse-profile access |
| P2 | قَسْم shar'i accuracy | 7 bikr / 3 thayyib initial; هبة الليلة |
| P3 | قَسْم/قرعة private to husband | INV-5 |
| P4 | نفقة fairness log (optional, approved) | light per-wife spend/gift log, husband-only |

---

## 3. Isolation fix (the crux — INV-1)

**Approach: keep the husband-centric single family; make child/member/message reads require a real parent-link or the `vader` role — not bare family membership.** (Splitting into per-pair families is avoided.)

**Correction to an earlier draft:** do NOT key "sees all" on `families.createdBy` — that is whoever *sent the invite* (a wife can invite a husband), not the husband. Key on **`family_members.role === "vader"`** (gender-derived via `deriveFamilyRole`). Run `scripts/backfill-family-roles.ts --execute` (Part 1) FIRST — that role can go stale relative to `userFunctions`.

**Verified (spike):** every child-creation path already writes a `confirmed` `parentChildLink` for the creator (`childrenRouter.add`→`linkParentToChild` `db.ts:1706`; `profile.save` sync also links the partner). So link-scoping does NOT cut the husband's access to children he/his wife created — only historical gaps need backfill. The `family.join` invite-code flow that could add a *non-parent* relative is **NOT called by the client** (only community peer-group/neighborhood invite codes exist client-side), so hard-removing the membership branch breaks no real relative access.

**Code changes (rabbaanie-api):**
1. **`assertChildAccess` (`access-control.ts:105-115`):** remove the family-membership branch → child access ⇔ confirmed `parentChildLink`. Fixes all ~20 callers at once; update the rule comment in `_core/trpc.ts` + the doc note in `tests/child-data-ownership.test.ts`. Verify no caller depends on the returned `membership` being non-null.
2. **`family.members` (`routers.ts:243`):** `role==="vader"` → all members (today); else → only the caller's own row + any `role==="vader"` row.
3. **`family.children.list` (`routers.ts:401`):** `vader` → `getFamilyChildren`; else → `getLinkedChildren(caller)` filtered to `familyId` (no new DB fn).
4. **`getUserMessages` (`db.ts:620`) — close the broadcast leak:** a non-`vader` caller sees only rows where `senderId`=self OR `recipientId`=self (exclude other members' `recipientId IS NULL` broadcasts). Reachable today only via the web dashboard, not mobile — closed anyway.
5. **max-4 cap (R1):** mirror `womanAlreadyHasConfirmedHusband` (`db.ts:3284`) with a men-capped-at-4 check at BOTH `createPartnership` and `confirmPartnershipRequest`.
6. **`getCoParents` source-2:** no code defect (follows only the caller's own links) — **assert with a test**, don't change.

**Backfill (gated — run by the main session after a prod audit, NOT by agents; dry-run first; mirror `scripts/backfill-family-roles.ts` idiom):**
- **Step 0 (read-only prod audit):** users with ≥2 active confirmed partnerships → check for cross-contaminated `parentChildLinks` from the old pre-fix forwarding. **Likely ZERO today** (no production man has 2 confirmed wives yet) — verify before assuming.
- **`backfill-family-roles.ts --execute` (Part 1)** to de-stale roles.
- **Pass 1 self-link repair:** children with no link for their `createdBy` → insert `relationship:"parent"`, confirmed, for the creator.
- **Pass 2 partner cross-link repair:** each active confirmed partnership → forward each partner's own children (`relationship!="partner"` && `createdBy==parentId`) to the other if missing.
- **Verify (presence+absence), then deploy backfill FIRST, code change SECOND** (else un-backfilled parents lose access).

- **Client:** `lib/app-context.tsx:455-473` child-merge + flat lists render only server-scoped children; single `partnerName`/`partnerId` (`store.ts:97-98`) gives way to list endpoints. `family.members` is called at `messages.tsx:755`, so the per-viewer fix matters in-app.

---

## 4. Workstreams & phasing (dependency order)

**Phase 1 — Foundation: isolation + cap [server rabbaanie-api].** max-4 cap for men; the §3 link-scoping + backfill migration; assert INV-1/INV-2 with tests. *Nothing else proceeds until co-wife blindness is proven.*

**Phase 2 — Children & attribution [server + client].** add-child "who is the mother/father?" → parentChildLinks (biological_*/stepfather); R2 nasab; per-mother grouping in `family.tsx`, dashboards, messages. Depends on P1.

**Phase 3 — Multi-wife UI [client].** `family.tsx` الزوجة→الزوجات multi-card + add-wife-by-ID (R6); unhide/relocate linking; male-only ≤4 affordance; fix `messages.tsx` single-`other` assumptions.

**Phase 4 — Divorced co-parenting + divorce lifecycle [server + client].** "add طليق as co-parent" (creates confirmed parentChildLinks); P1 divorce-a-current-wife transition; INV-4. Messaging backend already supports it.

**Phase 5 — Per-wife advice [server + client].** replace singular `getPartnerOfUser` in `getSpouseAdvice` (+ request/grant paths) with per-wife; per-wife advice UI (R5).

**Phase 6 — Fairness tools [new module, client + light server persistence].** المبيت rotation (7/3 initial, هبة الليلة), قرعة for travel, optional نفقة log; husband-only (INV-5).

Phases 1–2 are sequential (isolation is load-bearing). 3/5/6 can overlap once 2 lands (disjoint files, ≤7 agents). Each phase runs the **9-stage review pipeline** before it's called done; server changes are reviewed and deployed by the main session only.

---

## 5. Shar'i rules to encode
- القَسْم: equal night rotation among wives; **new wife initial stay = 7 nights if bikr, 3 if thayyib** (Muslim, from Anas) before the rotation resumes; a wife may **gift/waive her night** (هبة الليلة, كفعل سودة رضي الله عنها).
- السفر: **قرعة** (fair random draw) among wives when only one accompanies him (Sunnah — Bukhari/Muslim).
- Nasab: INV-3.

## 6. Out of scope / deferred
- عدة (iddah) modelling; mahram computation; splitting existing shared families into per-pair families (approach §3 avoids needing it).
- Anything beyond the man/vrouw binary the schema already assumes.

## 7. Verification focus
- **Privacy is presence-AND-absence tested:** assert the husband CAN see all wives+children (INV-2) *and* that a wife CANNOT see any co-wife or their children across every endpoint/notification/sync (INV-1). A gate that only checks absence lets INV-2 vanish silently.
- Live probe against a two-wife fixture before any production deploy of the isolation change.
