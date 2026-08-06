# Admin 2FA Verification Screen — Design

Date: 2026-08-06
Status: Approved, not yet implemented
Repos touched: **both** — `rabbanieserver/repo` (Expo client, this repo) and `~/Development/rabbaanie-api` (production backend, separate git history, deployed to api.rabbaanie.com)

## Problem

Two related bugs, both in the admin login flow:

1. **UX**: when a privileged account (owner/admin/super_admin) passes the first factor, `app/login.tsx` appends a 6-digit code field *below* the still-visible email/password form and swaps the submit button from "Sign in" to "Verify." The screen still reads as a sign-in form, so the natural move is to resubmit it — which mints a brand-new challenge rather than helping with the one already sent.
2. **Root cause**: `buildAdmin2FAChallenge` (`server/admin-2fa-challenge.ts`, rabbaanie-api) never invalidates a user's previous challenge when it mints a new one past the 60s cooldown. On 2026-08-06 the owner ended up with four valid-looking codes in nine minutes; only the newest matched the `challengeToken` the client held, so a code read off a real, recently-received email failed as "invalid or expired." There is no resend button today — the only way out is a "Start over" link that discards the challenge entirely.

This also needs to satisfy a new, explicit requirement: the same dedicated, explained verification experience for **both** the email/password path and the Google sign-in path (native Android), since both already funnel privileged sign-ins through the identical `createAdmin2FAChallenge` gate server-side (`server/web-auth.ts:287,704,864` all call it under `ADMIN_ROLES.has(user.role)`).

## Goals

- One live challenge per privileged user at a time — never two valid codes.
- A dedicated verification screen (not an appended card) that explains *why* extra verification is required.
- A working resend, with a visible cooldown, for both password and Google-originated challenges.
- A clear cancel path back to plain sign-in (already exists, gets restyled).
- 2FA in this app is email+code only in practice (no admin has an authenticator enrolled) — copy is written for that reality. The underlying `factor: "app"` branch is left in place (harmless, already correct) but is not a design target.

## Non-goals

- The web admin panel (server-rendered HTML pages in rabbaanie-api, not this app) has its own unrelated `two_factor_required` vs `two_factor` query-param mismatch on session-lapse redirect. Different UI surface, one-line fix, deferred.
- No change to the 12-hour `ADMIN_FACTOR_MAX_AGE_MS` window or the mid-session-lapse re-prompt (handoff's "related, not yet decided" item) — out of scope for this design.
- No TOTP/authenticator-app UX work.

## Design

### 1. Server root-cause fix — `rabbaanie-api/server/admin-2fa-challenge.ts`

Inside `buildAdmin2FAChallenge`, at the point that currently mints a fresh code because no live (<60s old) challenge was found for the user: before inserting the new `activeChallenges` entry, delete any existing entry for that `userId` (there can be at most one, since this same invalidation keeps it that way). This makes "at most one live challenge per user" true everywhere a challenge is created — login retry, Google retry, and the new resend endpoint below — from one shared code path.

### 2. New server endpoint — `POST /auth/2fa/resend`

Express route alongside the existing `/auth/2fa/verify` (`server/web-auth.ts`), REST-style to match (no tRPC login procedures exist in this codebase — auth is exclusively REST).

Request: `{ challengeToken: string }`
Response: `{ challengeToken: string, factor: "app" | "email" }` — same shape the login/Google endpoints already return.

Behavior: verify the JWT (issuer `rabbaanie-auth`, audience `rabbaanie-admin-2fa` — same check `/auth/2fa/verify` already performs), resolve the `userId` it carries, look up the user, and call the existing `createAdmin2FAChallenge(user)`. No new rate-limiting logic is needed: that function already silently returns the same challenge if one is <60s old, and mints-and-invalidates-the-old-one (per fix #1) otherwise. Possessing a valid `challengeToken` already proves the caller passed the first factor for that account — same trust boundary `/auth/2fa/verify` relies on today.

### 3. Client — dedicated screen — `app/login.tsx`

No new route. When `twoFactorChallenge` is truthy, the component's render swaps entirely to a verification view — keep only the logo/brand header for continuity; the email/password inputs, Google button, register link, and support link are not rendered while a challenge is active.

Content, top to bottom:
- Heading: explains *why* ("your account requires extra verification because of admin/owner access")
- Info line (neutral styling — **not** the `error` color/state currently misused for this): "We sent a code to **{email}**" — `email` is the already-held state value, not server-echoed
- Note: use the newest email if more than one arrived
- Code input (unchanged: `maxLength=9`, `textContentType="oneTimeCode"`)
- **Verify** button (unchanged handler — posts to `/auth/2fa/verify`)
- **Resend** button — local 60s countdown, **starting the moment the screen first appears** (the initial challenge already started the server's cooldown clock, so Resend must not be tappable-and-silently-ineffective right away). Since the client and server are separate deployed repos, `60_000` is a duplicated client-side constant with a comment pointing at `CREATE_COOLDOWN_MS` in rabbaanie-api — not an import. On press (once enabled), calls `POST /auth/2fa/resend` and restarts the countdown; the response's `challengeToken` replaces the client's stored one (a post-cooldown resend mints a new token, so the client must always submit against the *current* one, not the original).
- **Cancel** button — the existing "Start over" logic (clear `twoFactorChallenge`/`twoFactorCode`/error, return to plain sign-in), relabeled "Cancel" and styled as a real button rather than a text link, satisfying "cancel in case he wants to sign in with a different account."

### 4. Copy (nl / en / ar, matching the existing `tx()` pattern in this file)

| Purpose | NL | EN | AR |
|---|---|---|---|
| Heading | Extra verificatie vereist | Extra verification required | التحقّق الإضافي مطلوب |
| Explanation | Omdat uw account beheerdersrechten heeft, vragen we een extra controle om de gezinnen die u beheert te beschermen. | Because your account has admin/owner access, we require an extra check to protect the families you manage. | لأنّ حسابك يملك صلاحيات إدارية، نطلب تحقّقًا إضافيًّا لحماية العائلات التي تديرها. |
| Sent-to line | We hebben een code gestuurd naar | We sent a code to | أرسلنا رمزًا إلى |
| Newest-email note | Gebruik de nieuwste e-mail als u er meerdere heeft ontvangen. | Use the most recent email if you received more than one. | استخدم أحدث رسالة إذا تلقّيت أكثر من واحدة. |
| Resend (cooling down) | Opnieuw versturen ({n}s) | Resend code ({n}s) | إعادة الإرسال ({n}ث) |
| Resend (ready) | Code opnieuw versturen | Resend code | إعادة إرسال الرمز |
| Cancel | Annuleren | Cancel | إلغاء |

### 5. Error handling

- Invalid/expired code: unchanged existing behavior (clear code field only, keep the challenge, show error — already correct per the existing inline comment explaining why the challenge itself must survive a typo).
- Resend failure (network error, or a 503 from `sendEmail` failing closed): inline error text, challenge state untouched, button re-enables so the user can retry.

### 6. Testing

- `rabbaanie-api/tests/admin-2fa-email-factor.test.ts`: add cases for (a) a second `createAdmin2FAChallenge` call past the 60s cooldown invalidates the first challenge (old token/code rejected by `completeAdmin2FAChallenge`), (b) the new resend endpoint end-to-end (valid token → challenge reissued or reused per cooldown; invalid/expired token → rejected).
- Client: no existing test target for `login.tsx`; verify manually on the physical HONOR device, consistent with how prior 2FA changes in this project were proven (not just unit-tested).

## Rollout

Backend-first: the resend endpoint must be live on production before any client build that calls it ships. Deploy rabbaanie-api, verify `/auth/2fa/resend` live, then cut the app release.
