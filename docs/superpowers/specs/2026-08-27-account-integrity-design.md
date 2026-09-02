# Account integrity: registration hardening, deletion semantics, admin visibility

**Date:** 2026-08-27
**Status:** awaiting review
**Repos touched:** `talibfitrah/rabbaanie` (client, this repo) and `talibfitrah/rabbaanie-api`
(`master`, Postgres, the VM). They share no git history; server changes are hand-ported.

---

## 1. What was reported vs. what is true

Reported: many fake accounts; admin cannot delete them in the app; the web dashboard does not
show them.

Measured against production:

| Claim | Finding |
|---|---|
| Many fake accounts | **No.** 95 rows: 83 live humans (gmail 59, hotmail 16, yahoo 2, …), 12 test rows. Zero spam signups. |
| The 12 are attackers | **No.** `gate-/conflict-/final-/r2-/r3-probe-*@example.invalid`, dated 2026-08-17. Our own probe suite, run against production. |
| Admin cannot delete | **Delete works.** It is a soft delete; the admin lists never filter `deletedAt`, so the row reappears. All 12 are *already* soft-deleted. |
| Dashboard is broken | **Dashboard is correct.** `web-dashboard.ts:2229` filters `!u.deletedAt`. The app does not. Web 83, app 95. |

Root cause of both symptoms: **soft delete plus unfiltered reads.**

The genuine defect is not the accounts. It is that `POST /auth/register` is public and validates
nothing meaningful: presence, `length > 320`, `password.length >= 6`, and a duplicate check.
No email-format check at all (`"probe"` with no `@` is accepted), no MX check, no rate limit,
no captcha. It then issues a one-year session.

---

## 2. Decisions taken

| # | Decision | Owner |
|---|---|---|
| D1 | Anonymise real users on delete; hard-purge the 12 probes as a bounded one-off | user |
| D2 | Admin-created accounts bypass the new registration checks | user |
| D3 | Hardcoded DSN in `drizzle.config.ts`: record as follow-up, do not fix this round | user |
| D4 | `emailVerifiedAt` is a **column**, not a `profileData` key | author, on security grounds |

**D4 rationale.** `profileRouter.save` accepts `z.any()` and rewrites `profileData` wholesale,
so a client could clear its own verification flag. Transient `_verify*` keys may live in
`profileData` (the `_reset*` keys set that precedent); the durable trust flag may not.

---

## 3. Design

### 3.1 Stop showing deleted users (fixes the report)

- `db.getAllUsers()` — add `where(isNull(users.deletedAt))`. One guard at the shared function
  covers every production caller rather than one guard per caller.
- `db.getDashboardStats()` — the user `count(*)` is unfiltered; same filter. (Its family/child/
  message counts have the same flaw; out of scope, noted in §6.)
- `exportUsersCSV` is fixed transitively — it currently exports all 12 deleted users' name and
  email via `getAllUsers(true)`.
- Leave `web-dashboard.ts`'s client-side `!u.deletedAt` in place: redundant afterwards, harmless,
  and not an orphan this change created.

### 3.2 Close the registration hole

New `server/email-validation.ts`, following the shape `server/name-validation.ts` established:
a pure sync function returning a discriminated union, with localisation in a separate function
and the route mapping the reason to a 400.

```ts
export type EmailRejection = "format" | "unreachable_tld";
export type EmailCheck = { ok: true } | { ok: false; reason: EmailRejection };
export function checkEmail(email: string): EmailCheck;
export function emailRejectionMessage(reason: EmailRejection, lang?: string): string;
```

`unreachable_tld` covers the reserved TLDs (`.invalid`, `.test`, `.example`, `.localhost`) and
`example.com/net/org`. That set alone rejects 100% of the observed junk. MX lookup via
`node:dns/promises` is **deferred** — it is async, every existing export in this area is sync,
and it introduces a DNS-outage failure mode for a class of address we have never actually seen.

Rate limit: a ~15-line IP-keyed limiter local to `web-auth.ts`. The existing `isRateLimited`
is not reusable — it requires a `userId` an anonymous signup has not got, and its increment is
not exported. Generalising it would put this change inside the admin-2FA guard, which is worse.
`req.ip` is trustworthy (`app.set("trust proxy", 1)`). Carry a `ponytail:` comment: in-memory,
single fork, lost on restart.

### 3.3 Email verification

Mirrors `POST /auth/forgot-password` exactly, because that flow is already correct:
6-digit `randomInt(100_000, 1_000_000)`; `HMAC-SHA256` under `getStateSecret()`; 15-minute TTL;
5 attempts; 60-second cooldown; constant response to prevent enumeration; and its **atomic
`jsonb_set` update with the counter bound in the `WHERE` clause** rather than a racy
read-modify-write.

- Transient state: `_verifyCodeHash`, `_verifyExpires`, `_verifyAttempts`, `_verifyRequestedAt`.
- Durable state: new column `email_verified_at timestamp NULL` (D4).
- Google signups arrive verified — `/auth/google/native` already requires
  `payload.email_verified === true`; stamp the column at creation and never send a code.
- **Gate capability, not login.** An unverified account signs in normally but cannot link a
  partner, send messages, or enter a broadcast audience. This avoids creating a lockout failure
  mode where none exists today.
- **Grandfather the 83 live users:** backfill `email_verified_at = createdAt` in the migration.
  They are real; re-verifying them is a support event with no security gain.
- Localisation is the caller's job (`sendEmail` has no `language` parameter). Follow
  `article-email.ts` and read `users.language`, defaulting to `nl`. nl/en/ar.

### 3.4 Deletion (D1)

`db.deleteUser` becomes soft-delete **plus anonymise**, in the one place all three callers reach:

```
email = NULL, name = NULL, profileData = '{}', pushToken = NULL, deletedAt = now()
```

`id`, `openId`, `role` and `createdAt` are kept so the ~28 tables holding user ids stay
referentially sane. This is what `registration-validation.ts:118-120` already *claims* happens.

Why not a general hard purge: the database has **zero foreign keys** (`contype='f'` → 0 rows).
Nothing cascades, nothing blocks. A purge must sweep ~28 populated tables, ~22 empty ones,
second-order fan-out through `children`/`child_accounts`, and `user_session_versions` — while
`revoked_sessions` is hash-keyed and cannot be purged per-user at all. Orphans already exist
(7 `families.createdBy`, 6 `parent_ai_consultations`, 8 `user_session_versions`). Every future
`userId` column would become a silent purge gap.

Clearing `pushToken` also closes a latent hole: freeform `sendBroadcast` (no audience, no
category) falls through to `broadcastToRoles`, which does not filter `deletedAt`. It is
harmless today only because no soft-deleted user happens to hold a token.

**Guards.** Keep `OWNER_USER_ID` and the `super_admin` refusal. **Add an explicit refusal for
the Play Console review account** (`id=22710015`, `play-review@albunyaan.tv`): it is `role='user'`
with `roles` NULL, so nothing currently protects it, and its own note says *"do not delete"*.

**One-off probe purge.** A separate `scripts/purge-probe-accounts.ts` targeting the 12 ids
explicitly — never a pattern match — with a row-count assertion before and after, run once
against a fresh backup. Not a general capability.

### 3.5 Admin bypass (D2)

Already true: `createSpecialistUser`, `createUserFromPurchase` and `createStubFamilyMember`
never touch `/auth/register`, so §3.2 cannot reach them. The work is stamping
`email_verified_at = now()` in the first two. `createStubFamilyMember` stays unverified — it is
a stub awaiting activation.

### 3.6 Migration

`drizzle-kit migrate` has never run against production (no `__drizzle_migrations` table). The
real pattern is a one-off `tsx` script in `scripts/`; nine exist. Follow
`scripts/create-feedback-table.ts`: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, idempotent,
with an `information_schema` pre-check, plus the matching field in `drizzle/schema.ts`.

---

## 4. Verification

Baseline that must not regress: **`npm test` → 47 files, 574 tests passing, ~18s (vitest).**

Every check below must be watched failing before it is trusted.

| Change | Check |
|---|---|
| §3.1 | `getAllUsers` excludes soft-deleted **and still returns live users** — a filter that hid everyone would otherwise pass |
| §3.1 | `getDashboardStats().totalUsers` equals the live count, not 95 |
| §3.2 | `checkEmail` rejects `probe`, `x@example.invalid`, `x@example.com`; accepts `x@gmail.com` |
| §3.2 | Nth request from one IP inside the window is refused |
| §3.3 | Wrong code increments attempts; 6th attempt refused; expired code refused; correct code stamps the column |
| §3.3 | Unverified account is refused a gated capability; verified account is allowed it |
| §3.4 | Delete nulls email/name/pushToken and sets `deletedAt`; row still exists |
| §3.4 | Delete of `OWNER_USER_ID`, of a `super_admin`, and of id `22710015` each raise `RoleWriteRefused` |
| §3.5 | Admin-created account is verified on creation; stub is not |

Then the 9-stage pipeline from `CLAUDE.md`, including `cubic review` to two consecutive clean
rounds.

---

## 5. Non-goals

Rate limiting the whole API; captcha; disposable-domain blocklists; MX lookup (§3.2); replacing
soft delete for self-service (Play Data-safety depends on it); the second invitation-code system.

---

## 6. Follow-ups (not this round)

1. **`drizzle.config.ts` contains a hardcoded fallback Postgres DSN with a literal password,
   committed to `master`.** Rotate; replace with a fail-closed throw as `requireJwtSecret()`
   does. Liveness not tested. (D3)
2. `profileRouter.deleteAccount` is `protectedProcedure` only — no re-auth before deletion.
3. `useInvitationCode` ignores `restrictedEmail` entirely; the older system's check is
   case-sensitive, unlike every other email comparison.
4. `/auth/reset-password` returns four distinguishable 400s while `/auth/forgot-password` is
   carefully constant-response, partly undoing the anti-enumeration.
5. `getDashboardStats` family/child/message counts are unfiltered too.
6. `generateInvitationCode` uses `Math.random()` and a guessable timestamp; no unique index on
   either `code` column.
7. Stale comment in `createUserFromPurchase`: `users_email_active_unique` **does** exist now.
8. Probe suites must never target production. Process fix, not a code fix — the root cause of
   all 12 rows.
9. pm2 restart counter at 309; unexplained.
