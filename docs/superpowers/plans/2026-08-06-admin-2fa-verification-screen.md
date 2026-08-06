# Admin 2FA Verification Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the inline, appended 2FA card in the admin/owner sign-in flow with a dedicated verification screen that explains why, supports resend, and fixes the root cause that let multiple valid codes coexist.

**Architecture:** A small server-side fix in rabbaanie-api makes "at most one live challenge per user" actually true, plus one new resend endpoint that reuses the existing challenge-creation logic. The client (`app/login.tsx`) swaps its entire render to a new `TwoFactorVerifyScreen` component whenever a challenge is outstanding, instead of appending a card below the still-visible sign-in form.

**Tech Stack:** Express + Drizzle + jose (JWT) on the backend (rabbaanie-api, vitest); Expo/React Native on the client (rabbanieserver/repo).

## Global Constraints

- Two separate git repos, no shared imports possible: server tasks (1–3) go in `/home/farouq/Development/rabbaanie-api` (branch `master`, remote `talibfitrah/rabbaanie-api`). Client tasks (4–5) go in `/home/farouq/Development/rabbanieserver/repo` (this repo). Never touch this repo's own `server/` directory — it is dead code, never deployed.
- No new Expo route. The verification view replaces the existing form's render within `app/login.tsx`, reached from both the password path and the Google sign-in path (both already funnel into the same `twoFactorChallenge` client state).
- 2FA in this app is email+code in practice — no admin has an authenticator enrolled. Copy targets that reality. The existing `factor: "app"` branch is left functionally intact but is not a design target for new copy.
- Full copy table (nl / en / ar), used verbatim in Task 4:

| Purpose | NL | EN | AR |
|---|---|---|---|
| Heading | Extra verificatie vereist | Extra verification required | التحقّق الإضافي مطلوب |
| Explanation | Omdat uw account beheerdersrechten heeft, vragen we een extra controle om de gezinnen die u beheert te beschermen. | Because your account has admin/owner access, we require an extra check to protect the families you manage. | لأنّ حسابك يملك صلاحيات إدارية، نطلب تحقّقًا إضافيًّا لحماية العائلات التي تديرها. |
| Sent-to line | We hebben een code gestuurd naar | We sent a code to | أرسلنا رمزًا إلى |
| Newest-email note | Gebruik de nieuwste e-mail als u er meerdere heeft ontvangen. | Use the most recent email if you received more than one. | استخدم أحدث رسالة إذا تلقّيت أكثر من واحدة. |
| Resend (cooling) | Opnieuw versturen ({n}s) | Resend code ({n}s) | إعادة الإرسال ({n}ث) |
| Resend (ready) | Code opnieuw versturen | Resend code | إعادة إرسال الرمز |
| Resend (in flight) | Bezig... | Sending... | جارٍ الإرسال... |
| Cancel | Annuleren | Cancel | إلغاء |
| Resend failed | Opnieuw versturen mislukt. Probeer het later nog eens. | Could not resend the code. Please try again shortly. | تعذّر إعادة إرسال الرمز. حاول مرة أخرى لاحقًا. |
| Connection error (existing, reused) | Verbindingsfout. Controleer uw internetverbinding. | Connection error. Check your internet connection. | خطأ في الاتصال. تحقق من اتصالك بالإنترنت. |

- Existing test conventions: `rabbaanie-api/tests/admin-2fa-email-factor.test.ts` unit-tests the challenge module's exported functions directly (no Express/HTTP test harness exists anywhere in that repo, and none should be introduced here). This client repo has no test target for `login.tsx` or any screen component — verification for client tasks is `tsc --noEmit` plus manual device testing, matching how prior 2FA work in this project was proven.
- Rollout order: rabbaanie-api must be deployed and `/auth/2fa/resend` verified live on production *before* any client build that calls it ships. Task 6 is a deploy step — **do not run it without the user's explicit go-ahead at the time**, regardless of what earlier tasks completed.

---

### Task 1: Server — invalidate a superseded challenge instead of leaving two live

**Files:**
- Modify: `server/admin-2fa-challenge.ts:161-178` (rabbaanie-api)
- Test: `tests/admin-2fa-email-factor.test.ts` (rabbaanie-api)

**Interfaces:**
- Consumes: nothing new — this is internal to `buildAdmin2FAChallenge`, called via the existing exported `createAdmin2FAChallenge`.
- Produces: no interface change. Behavioral guarantee later tasks rely on: at most one entry per `userId` exists in `activeChallenges` at any time.

- [ ] **Step 1: Write the failing test**

Add to `tests/admin-2fa-email-factor.test.ts`, inside the existing `describe("admin second factor by email", ...)` block (after the "reuses the live challenge" test):

```ts
  // Without this, an admin who logs in twice more than 60s apart (e.g. their
  // session lapsed, they retry) ends up holding two valid-looking challenges:
  // the old one, still live until its own 10-minute expiresAt, and the new
  // one below. A code copied from the older email then fails as "invalid or
  // expired" indistinguishably from an actually wrong code.
  it("supersedes a stale challenge instead of leaving two valid at once", async () => {
    mocks.has2FA.mockResolvedValue(false);
    const who = makeAdmin();
    vi.useFakeTimers();
    try {
      const first = await createAdmin2FAChallenge(who);
      const firstCode = emailedCode();

      vi.advanceTimersByTime(61_000);
      const second = await createAdmin2FAChallenge(who);
      const secondCode = emailedCode();

      expect(second?.challengeToken).not.toBe(first!.challengeToken);
      expect(secondCode).not.toBe(firstCode);

      await expect(
        completeAdmin2FAChallenge(first!.challengeToken, firstCode, "1.2.3.4"),
      ).resolves.toMatchObject({ ok: false, reason: "invalid" });
      await expect(
        completeAdmin2FAChallenge(second!.challengeToken, secondCode, "1.2.3.4"),
      ).resolves.toMatchObject({ ok: true });
    } finally {
      vi.useRealTimers();
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/farouq/Development/rabbaanie-api && npx vitest run tests/admin-2fa-email-factor.test.ts -t "supersedes a stale challenge"`
Expected: FAIL — the first challenge is still accepted (`ok: true` instead of the expected `ok: false`), because nothing deletes it today.

- [ ] **Step 3: Write minimal implementation**

In `server/admin-2fa-challenge.ts`, between the existing `if (live) { ... }` block and the `if (activeChallenges.size >= MAX_ACTIVE_CHALLENGES) { ... }` block (i.e. right after line 172's closing `}`), insert:

```ts
  // Past the cooldown, this call is about to mint a fresh code below. Drop any
  // challenge this user already has first — otherwise the old one stays valid
  // until its own expiresAt, so the admin ends up holding two live challenges
  // and a code copied from the wrong email fails as "invalid or expired"
  // indistinguishably from an actually wrong code.
  for (const [existingJti, state] of activeChallenges) {
    if (state.userId === user.id) activeChallenges.delete(existingJti);
  }

```

So the full sequence reads (unchanged lines shown for anchoring, only the new block is added):

```ts
  const live = Array.from(activeChallenges.values()).find(
    (s) =>
      s.userId === user.id && Date.now() - s.createdAt < CREATE_COOLDOWN_MS,
  );
  if (live) {
    return {
      challengeToken: live.challengeToken,
      factor: live.emailCode ? "email" : "app",
    };
  }

  // Past the cooldown, this call is about to mint a fresh code below. Drop any
  // challenge this user already has first — otherwise the old one stays valid
  // until its own expiresAt, so the admin ends up holding two live challenges
  // and a code copied from the wrong email fails as "invalid or expired"
  // indistinguishably from an actually wrong code.
  for (const [existingJti, state] of activeChallenges) {
    if (state.userId === user.id) activeChallenges.delete(existingJti);
  }

  if (activeChallenges.size >= MAX_ACTIVE_CHALLENGES) {
    const oldest = activeChallenges.keys().next().value;
    if (oldest) activeChallenges.delete(oldest);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/farouq/Development/rabbaanie-api && npx vitest run tests/admin-2fa-email-factor.test.ts`
Expected: PASS, all tests in the file (this checks the new test plus every pre-existing one — the loop only ever touches entries for the same `userId`, and every existing test uses a fresh `makeAdmin()` id, so no existing test's challenge can be collaterally deleted).

- [ ] **Step 5: Commit**

```bash
cd /home/farouq/Development/rabbaanie-api
git add server/admin-2fa-challenge.ts tests/admin-2fa-email-factor.test.ts
git commit -m "fix(auth): supersede a user's stale 2FA challenge instead of stacking a second one"
```

---

### Task 2: Server — resolve a challenge token back to its user, without spending an attempt

**Files:**
- Modify: `server/admin-2fa-challenge.ts` (rabbaanie-api) — add a new exported function
- Test: `tests/admin-2fa-email-factor.test.ts` (rabbaanie-api)

**Interfaces:**
- Consumes: the module's existing `secretKey()`, `activeChallenges`, `prune()` (all already private to this file).
- Produces: `export async function resolveAdmin2FAChallengeUser(challengeToken: string): Promise<number | null>` — Task 3's resend route depends on this exact name and signature.

- [ ] **Step 1: Write the failing test**

Add to `tests/admin-2fa-email-factor.test.ts`. First, update the import at the top of the file to include the new function:

```ts
import {
  completeAdmin2FAChallenge,
  createAdmin2FAChallenge,
  resolveAdmin2FAChallengeUser,
} from "../server/admin-2fa-challenge";
```

Then add these two tests (after the "supersedes a stale challenge" test from Task 1):

```ts
  it("resolving a challenge repeatedly does not burn failed-attempt budget", async () => {
    mocks.has2FA.mockResolvedValue(false);
    const who = makeAdmin();
    const challenge = await createAdmin2FAChallenge(who);

    for (let i = 0; i < 6; i++) {
      await expect(
        resolveAdmin2FAChallengeUser(challenge!.challengeToken),
      ).resolves.toBe(who.id);
    }

    // If resolving had shared the attempts counter, this would now be
    // rate_limited (MAX_FAILURES is 5) instead of succeeding on the real code.
    const code = emailedCode();
    await expect(
      completeAdmin2FAChallenge(challenge!.challengeToken, code, "1.2.3.4"),
    ).resolves.toMatchObject({ ok: true });
  });

  it("refuses to resolve an invalid, empty, or unrecognized challenge token", async () => {
    await expect(resolveAdmin2FAChallengeUser("")).resolves.toBeNull();
    await expect(resolveAdmin2FAChallengeUser("not-a-real-token")).resolves.toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/farouq/Development/rabbaanie-api && npx vitest run tests/admin-2fa-email-factor.test.ts`
Expected: FAIL to even run — `resolveAdmin2FAChallengeUser` is not exported yet, so the import throws.

- [ ] **Step 3: Write minimal implementation**

In `server/admin-2fa-challenge.ts`, add this new exported function directly after `createAdmin2FAChallenge` (i.e. after its closing `}` around line 150, before `async function buildAdmin2FAChallenge`):

```ts
/**
 * Resolves a still-live challenge back to the user it was issued for, without
 * spending an attempt or requiring a code. Used by the resend endpoint, which
 * only needs to know who to re-challenge — completeAdmin2FAChallenge is for
 * checking the code itself and must stay the only path that burns an attempt.
 */
export async function resolveAdmin2FAChallengeUser(
  challengeToken: string,
): Promise<number | null> {
  prune();
  if (!challengeToken || challengeToken.length > 4_096) return null;
  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(challengeToken, secretKey(), {
      algorithms: ["HS256"],
      issuer: "rabbaanie-auth",
      audience: "rabbaanie-admin-2fa",
    }));
  } catch {
    return null;
  }
  const jti = typeof payload.jti === "string" ? payload.jti : "";
  const userId = typeof payload.userId === "number" ? payload.userId : 0;
  const state = activeChallenges.get(jti);
  if (!state || state.userId !== userId || state.expiresAt <= Date.now()) {
    return null;
  }
  return userId;
}

```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/farouq/Development/rabbaanie-api && npx vitest run tests/admin-2fa-email-factor.test.ts`
Expected: PASS, all tests in the file.

- [ ] **Step 5: Commit**

```bash
cd /home/farouq/Development/rabbaanie-api
git add server/admin-2fa-challenge.ts tests/admin-2fa-email-factor.test.ts
git commit -m "feat(auth): add resolveAdmin2FAChallengeUser for the upcoming resend endpoint"
```

---

### Task 3: Server — `POST /auth/2fa/resend`

**Files:**
- Modify: `server/web-auth.ts:17-21` (import), `server/web-auth.ts:444-446` (new route, inserted between the end of `/auth/2fa/verify` and the `Logout` comment) — rabbaanie-api

**Interfaces:**
- Consumes: `resolveAdmin2FAChallengeUser` (Task 2), existing `createAdmin2FAChallenge`, `ADMIN_ROLES`, `getDb`, `readCookie`, `setAdmin2FAChallengeCookie`, `ADMIN_2FA_COOKIE` — all already used identically by the neighboring `/auth/2fa/verify` and `/auth/login` handlers in this same file.
- Produces: `POST /auth/2fa/resend` — request `{ challengeToken?: string }` (falls back to the `ADMIN_2FA_COOKIE` cookie exactly like `/auth/2fa/verify` does), response `{ challengeToken: string, factor: "app" | "email" }` on success. Task 5's client `handleResend` depends on this exact request/response shape.

No new automated test for this task: this repo has no Express/HTTP test harness anywhere (confirmed — every existing auth test in `tests/admin-2fa-email-factor.test.ts` calls the challenge module's functions directly, never the routes), and introducing one for a single route would be a new pattern this codebase doesn't otherwise use. Task 2 already covers the only new logic (`resolveAdmin2FAChallengeUser`); this task is a thin route wrapper around already-tested pieces, verified manually below.

- [ ] **Step 1: Add the import**

In `server/web-auth.ts`, change:

```ts
import {
  CHALLENGE_TTL_MS as ADMIN_2FA_CHALLENGE_TTL_MS,
  completeAdmin2FAChallenge,
  createAdmin2FAChallenge,
} from "./admin-2fa-challenge";
```

to:

```ts
import {
  CHALLENGE_TTL_MS as ADMIN_2FA_CHALLENGE_TTL_MS,
  completeAdmin2FAChallenge,
  createAdmin2FAChallenge,
  resolveAdmin2FAChallengeUser,
} from "./admin-2fa-challenge";
```

- [ ] **Step 2: Add the route**

In `server/web-auth.ts`, immediately after the closing `});` of the `/auth/2fa/verify` handler (line 444) and before the `// ─── Logout (web redirect) ───` comment (line 446), insert:

```ts

  app.post("/auth/2fa/resend", async (req: Request, res: Response) => {
    const bodyChallenge =
      typeof req.body?.challengeToken === "string"
        ? req.body.challengeToken
        : "";
    const challengeToken =
      bodyChallenge || readCookie(req, ADMIN_2FA_COOKIE) || "";

    const userId = await resolveAdmin2FAChallengeUser(challengeToken);
    if (!userId) {
      res.status(401).json({ error: "Invalid or expired verification challenge" });
      return;
    }

    const db = await getDb();
    if (!db) {
      res.status(503).json({ error: "Database unavailable" });
      return;
    }
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);
    if (!user || !ADMIN_ROLES.has(user.role)) {
      res.status(401).json({ error: "Invalid verification challenge" });
      return;
    }

    const challenge = await createAdmin2FAChallenge(user);
    if (!challenge) {
      res.status(503).json({ error: "Could not send a verification code" });
      return;
    }
    setAdmin2FAChallengeCookie(req, res, challenge.challengeToken);
    res.json({ challengeToken: challenge.challengeToken, factor: challenge.factor });
  });
```

- [ ] **Step 3: Verify manually against a local dev server**

Run: `cd /home/farouq/Development/rabbaanie-api && npm run dev` (or this repo's documented dev-start script — check `package.json`'s `scripts` if the name differs), then in another shell:

```bash
# 1. Log in as a privileged test account to get a real challengeToken:
curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<a real admin/super_admin test account email>","password":"<its password>"}'
# Copy the "challengeToken" from the response, then:
curl -s -X POST http://localhost:3000/auth/2fa/resend \
  -H "Content-Type: application/json" \
  -d '{"challengeToken":"<paste it here>"}'
```

Expected: first call within 60s of the login returns the *same* `challengeToken` (no new email sent — check server logs / Brevo dashboard for only one send); waiting past 60s and calling resend again returns a *new* `challengeToken` and a second email. An invalid token (e.g. `"garbage"`) returns 401.

- [ ] **Step 4: Run the existing test suite to confirm nothing broke**

Run: `cd /home/farouq/Development/rabbaanie-api && npx vitest run`
Expected: PASS, same count as before this task (this task adds no new automated tests, per the note above).

- [ ] **Step 5: Commit**

```bash
cd /home/farouq/Development/rabbaanie-api
git add server/web-auth.ts
git commit -m "feat(auth): add POST /auth/2fa/resend for the admin verification screen"
```

---

### Task 4: Client — `TwoFactorVerifyScreen` component

**Files:**
- Create: `components/two-factor-verify-screen.tsx` (rabbanieserver/repo)

**Interfaces:**
- Consumes: `useColors()` (`@/hooks/use-colors`), `useI18n()` (`@/lib/i18n`) — called directly inside this component, not passed as props, matching how every other standalone screen in this codebase does it (e.g. `app/register.tsx`, `app/admin/user.tsx`).
- Produces: `export function TwoFactorVerifyScreen(props: TwoFactorVerifyScreenProps)` with:
  ```ts
  type TwoFactorVerifyScreenProps = {
    email: string;
    code: string;
    onChangeCode: (value: string) => void;
    method: "app" | "email";
    issuedAt: number;
    error: string;
    verifying: boolean;
    onVerify: () => void;
    onCancel: () => void;
    resending: boolean;
    onResend: () => void;
  };
  ```
  Task 5 imports and renders this with exactly these prop names and types.

No automated test: no test target exists for any screen component in this codebase (confirmed by search — `login.tsx`, `register.tsx`, and every `app/admin/*.tsx` have none). Verified via `tsc --noEmit` and, once wired in Task 5, manual device testing.

- [ ] **Step 1: Create the component**

```tsx
import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";

// Mirrors CREATE_COOLDOWN_MS in rabbaanie-api/server/admin-2fa-challenge.ts.
// Duplicated, not imported: client and server are separate deployed repos.
const RESEND_COOLDOWN_MS = 60_000;

function useCountdown(issuedAt: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return Math.max(0, RESEND_COOLDOWN_MS - (now - issuedAt));
}

type TwoFactorVerifyScreenProps = {
  email: string;
  code: string;
  onChangeCode: (value: string) => void;
  method: "app" | "email";
  issuedAt: number;
  error: string;
  verifying: boolean;
  onVerify: () => void;
  onCancel: () => void;
  resending: boolean;
  onResend: () => void;
};

/**
 * Replaces the entire sign-in form while an admin/owner second factor is
 * outstanding. Reached from both the password and Google sign-in paths in
 * app/login.tsx, which hand off to the same challenge state either way.
 */
export function TwoFactorVerifyScreen({
  email,
  code,
  onChangeCode,
  method,
  issuedAt,
  error,
  verifying,
  onVerify,
  onCancel,
  resending,
  onResend,
}: TwoFactorVerifyScreenProps) {
  const colors = useColors();
  const { language } = useI18n();
  const isRTL = language === "ar";
  const tx = (nl: string, en: string, ar: string) =>
    language === "ar" ? ar : language === "en" ? en : nl;

  const remainingMs = useCountdown(issuedAt);
  const remainingSec = Math.ceil(remainingMs / 1000);
  const canResend = remainingMs <= 0 && !resending;

  const inputStyle = {
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.foreground,
    borderWidth: 1,
    borderColor: colors.border,
  };

  return (
    <View style={{ width: "100%", maxWidth: 340, gap: 14 }}>
      <View style={{ gap: 6 }}>
        <Text
          style={{
            fontSize: 19,
            fontWeight: "700",
            color: colors.foreground,
            textAlign: "center",
            writingDirection: isRTL ? "rtl" : "ltr",
          }}
        >
          {tx(
            "Extra verificatie vereist",
            "Extra verification required",
            "التحقّق الإضافي مطلوب",
          )}
        </Text>
        <Text
          style={{
            fontSize: 13,
            color: colors.muted,
            textAlign: "center",
            lineHeight: 19,
            writingDirection: isRTL ? "rtl" : "ltr",
          }}
        >
          {tx(
            "Omdat uw account beheerdersrechten heeft, vragen we een extra controle om de gezinnen die u beheert te beschermen.",
            "Because your account has admin/owner access, we require an extra check to protect the families you manage.",
            "لأنّ حسابك يملك صلاحيات إدارية، نطلب تحقّقًا إضافيًّا لحماية العائلات التي تديرها.",
          )}
        </Text>
      </View>

      {method === "email" ? (
        <View style={{ gap: 2 }}>
          <Text
            style={{
              fontSize: 13,
              color: colors.foreground,
              textAlign: "center",
              writingDirection: isRTL ? "rtl" : "ltr",
            }}
          >
            {tx("We hebben een code gestuurd naar", "We sent a code to", "أرسلنا رمزًا إلى")}{" "}
            <Text style={{ fontWeight: "700" }}>{email}</Text>
          </Text>
          <Text
            style={{
              fontSize: 12,
              color: colors.muted,
              textAlign: "center",
              writingDirection: isRTL ? "rtl" : "ltr",
            }}
          >
            {tx(
              "Gebruik de nieuwste e-mail als u er meerdere heeft ontvangen.",
              "Use the most recent email if you received more than one.",
              "استخدم أحدث رسالة إذا تلقّيت أكثر من واحدة.",
            )}
          </Text>
        </View>
      ) : (
        <Text
          style={{
            fontSize: 13,
            color: colors.foreground,
            textAlign: "center",
            writingDirection: isRTL ? "rtl" : "ltr",
          }}
        >
          {tx(
            "Voer uw 2FA-code of back-upcode in",
            "Enter your 2FA or backup code",
            "أدخل رمز التحقق أو الرمز الاحتياطي",
          )}
        </Text>
      )}

      <TextInput
        value={code}
        onChangeText={onChangeCode}
        placeholder="000000"
        placeholderTextColor={colors.muted}
        autoCapitalize="characters"
        autoCorrect={false}
        textContentType="oneTimeCode"
        keyboardType="default"
        maxLength={9}
        textAlign="center"
        returnKeyType="done"
        onSubmitEditing={onVerify}
        autoFocus
        style={{ ...inputStyle, fontSize: 22, letterSpacing: 4, fontWeight: "700" }}
      />

      {error ? (
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={{ color: colors.error, fontSize: 13, textAlign: "center" }}
        >
          {error}
        </Text>
      ) : null}

      <TouchableOpacity
        onPress={onVerify}
        disabled={verifying}
        activeOpacity={0.8}
        style={{
          backgroundColor: colors.primary,
          borderRadius: 10,
          paddingVertical: 14,
          alignItems: "center",
          opacity: verifying ? 0.7 : 1,
        }}
      >
        {verifying ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <Text style={{ fontSize: 15, fontWeight: "600", color: "#ffffff" }}>
            {tx("Verifiëren", "Verify", "تحقق")}
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={onResend}
        disabled={!canResend}
        activeOpacity={0.7}
        style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}
      >
        <Text style={{ fontSize: 13, color: canResend ? colors.primary : colors.muted }}>
          {remainingMs > 0
            ? tx(
                `Opnieuw versturen (${remainingSec}s)`,
                `Resend code (${remainingSec}s)`,
                `إعادة الإرسال (${remainingSec}ث)`,
              )
            : resending
              ? tx("Bezig...", "Sending...", "جارٍ الإرسال...")
              : tx("Code opnieuw versturen", "Resend code", "إعادة إرسال الرمز")}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={onCancel}
        activeOpacity={0.7}
        style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}
      >
        <Text style={{ fontSize: 13, color: colors.muted }}>
          {tx("Annuleren", "Cancel", "إلغاء")}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd /home/farouq/Development/rabbanieserver/repo && npx tsc --noEmit`
Expected: no new errors attributable to `components/two-factor-verify-screen.tsx` (Task 5 wires it in — until then it's an unused-but-valid export, which this codebase's `tsc` config does not flag as an error elsewhere, e.g. exported helpers in `lib/`).

- [ ] **Step 3: Commit**

```bash
git add components/two-factor-verify-screen.tsx
git commit -m "feat(auth): add the dedicated admin 2FA verification screen component"
```

---

### Task 5: Client — wire the verification screen into `app/login.tsx`

**Files:**
- Modify: `app/login.tsx` (rabbanieserver/repo)

**Interfaces:**
- Consumes: `TwoFactorVerifyScreen` from Task 4 (exact prop names above), `POST /auth/2fa/resend` from Task 3 (exact request/response shape above).
- Produces: nothing new consumed elsewhere — `LoginScreen` remains the default export of this route.

- [ ] **Step 1: Add the import**

In `app/login.tsx`, add alongside the other `@/` imports (after the `google-oauth` import):

```tsx
import { TwoFactorVerifyScreen } from "@/components/two-factor-verify-screen";
```

- [ ] **Step 2: Add new state, remove the now-dead `twoFactorPrompt` helper**

Replace:

```tsx
  const [twoFactorChallenge, setTwoFactorChallenge] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  // Where the code came from, so the prompt matches reality. The server says
  // which; this initial value is only ever replaced before the field renders.
  const [twoFactorMethod, setTwoFactorMethod] = useState<"app" | "email">(
    "email",
  );
```

with:

```tsx
  const [twoFactorChallenge, setTwoFactorChallenge] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  // Where the code came from, so the prompt matches reality. The server says
  // which; this initial value is only ever replaced before the field renders.
  const [twoFactorMethod, setTwoFactorMethod] = useState<"app" | "email">(
    "email",
  );
  // When the current challenge was (re)issued — drives the resend cooldown
  // countdown in TwoFactorVerifyScreen.
  const [twoFactorIssuedAt, setTwoFactorIssuedAt] = useState(0);
  const [resending, setResending] = useState(false);
```

Then delete the `twoFactorPrompt` function entirely (it becomes unused by Step 3 below):

```tsx
  // Takes the method rather than reading state: both callers set it in the same
  // tick, where the state value is still the previous one.
  const twoFactorPrompt = (method: "app" | "email") =>
    method === "email"
      ? tx(
          "We hebben een verificatiecode naar uw e-mailadres gestuurd.",
          "We sent a verification code to your email address.",
          "أرسلنا رمز تحقّق إلى بريدك الإلكتروني.",
        )
      : tx(
          "Voer uw 2FA-code of back-upcode in",
          "Enter your 2FA or backup code",
          "أدخل رمز التحقق أو الرمز الاحتياطي",
        );

```
→ delete this whole block. (The explanatory copy it produced now lives directly in `TwoFactorVerifyScreen`, driven by `method` and `email` props instead of a stored string.)

- [ ] **Step 3: Update the two places a challenge is received**

In `handleEmailLogin`, replace:

```tsx
      if (data.requires2FA && typeof data.challengeToken === "string" && data.challengeToken) {
        // See lib/google-oauth.ts: an omitted `factor` means an older server,
        // which only challenges admins that have an authenticator.
        const method = data.factor === "email" ? "email" : "app";
        setTwoFactorChallenge(data.challengeToken);
        setTwoFactorMethod(method);
        setTwoFactorCode("");
        setPassword("");
        setError(twoFactorPrompt(method));
        return;
      }
```

with:

```tsx
      if (data.requires2FA && typeof data.challengeToken === "string" && data.challengeToken) {
        // See lib/google-oauth.ts: an omitted `factor` means an older server,
        // which only challenges admins that have an authenticator.
        const method = data.factor === "email" ? "email" : "app";
        setTwoFactorChallenge(data.challengeToken);
        setTwoFactorMethod(method);
        setTwoFactorCode("");
        setPassword("");
        setTwoFactorIssuedAt(Date.now());
        setError("");
        return;
      }
```

In `handleGoogleLogin`, replace:

```tsx
      if (result.kind === "twoFactor") {
        // Hand off to the same code field the email flow uses; submitting it
        // posts to /auth/2fa/verify, which is what mints an admin session.
        setTwoFactorChallenge(result.challengeToken);
        setTwoFactorMethod(result.factor);
        setTwoFactorCode("");
        setError(twoFactorPrompt(result.factor));
        return;
      }
```

with:

```tsx
      if (result.kind === "twoFactor") {
        // Hand off to the same code field the email flow uses; submitting it
        // posts to /auth/2fa/verify, which is what mints an admin session.
        setTwoFactorChallenge(result.challengeToken);
        setTwoFactorMethod(result.factor);
        setTwoFactorCode("");
        setTwoFactorIssuedAt(Date.now());
        setError("");
        return;
      }
```

- [ ] **Step 4: Add `handleResend`**

Add this new function directly after `handleGoogleLogin`'s closing `};` (before the `return (` that starts the JSX):

```tsx
  const handleResend = async () => {
    setResending(true);
    setError("");
    try {
      const apiBase = getApiBaseUrl();
      const response = await fetch(`${apiBase}/auth/2fa/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeToken: twoFactorChallenge }),
      });
      const data = await response.json();
      if (!response.ok || typeof data.challengeToken !== "string" || !data.challengeToken) {
        setError(
          tx(
            "Opnieuw versturen mislukt. Probeer het later nog eens.",
            "Could not resend the code. Please try again shortly.",
            "تعذّر إعادة إرسال الرمز. حاول مرة أخرى لاحقًا.",
          ),
        );
        return;
      }
      // Functional update: if the user tapped Cancel while this request was in
      // flight, twoFactorChallenge is already "" and must stay that way rather
      // than being silently reopened by a stale response.
      setTwoFactorChallenge((current) => (current ? data.challengeToken : current));
      setTwoFactorMethod(data.factor === "email" ? "email" : "app");
      setTwoFactorCode("");
      setTwoFactorIssuedAt(Date.now());
    } catch {
      setError(
        tx(
          "Verbindingsfout. Controleer uw internetverbinding.",
          "Connection error. Check your internet connection.",
          "خطأ في الاتصال. تحقق من اتصالك بالإنترنت.",
        ),
      );
    } finally {
      setResending(false);
    }
  };
```

- [ ] **Step 5: Swap the form for the verification screen when a challenge is active**

Replace the entire block starting at `{/* Email/Password Form */}` and ending at that block's closing `</View>` (immediately before the closing `</ScrollView>`) — i.e. everything between the logo block and `</ScrollView>` — with:

```tsx
            {twoFactorChallenge ? (
              <TwoFactorVerifyScreen
                email={email}
                code={twoFactorCode}
                onChangeCode={setTwoFactorCode}
                method={twoFactorMethod}
                issuedAt={twoFactorIssuedAt}
                error={error}
                verifying={loading}
                onVerify={handleEmailLogin}
                onCancel={() => {
                  setTwoFactorChallenge("");
                  setTwoFactorCode("");
                  setTwoFactorIssuedAt(0);
                  setError("");
                }}
                resending={resending}
                onResend={handleResend}
              />
            ) : (
              <View style={{ width: "100%", maxWidth: 340, gap: 12 }}>
                {/* Email Input */}
                <View style={{ gap: 4 }}>
                  <Text
                    style={{
                      fontSize: 13,
                      color: colors.muted,
                      writingDirection: isRTL ? "rtl" : "ltr",
                    }}
                  >
                    {tx("E-mailadres", "Email address", "البريد الإلكتروني")}
                  </Text>
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder={tx(
                      "uw@email.nl",
                      "your@email.com",
                      "بريدك@مثال.com",
                    )}
                    placeholderTextColor={colors.muted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    textAlign={isRTL ? "right" : "left"}
                    returnKeyType="next"
                    style={{
                      backgroundColor: colors.surface,
                      borderRadius: 10,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      fontSize: 15,
                      color: colors.foreground,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  />
                </View>

                {/* Password Input */}
                <View style={{ gap: 4 }}>
                  <Text
                    style={{
                      fontSize: 13,
                      color: colors.muted,
                      writingDirection: isRTL ? "rtl" : "ltr",
                    }}
                  >
                    {tx("Wachtwoord", "Password", "كلمة المرور")}
                  </Text>
                  <View style={{ position: "relative" }}>
                    <TextInput
                      value={password}
                      onChangeText={setPassword}
                      placeholder="••••••••"
                      placeholderTextColor={colors.muted}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      textAlign={isRTL ? "right" : "left"}
                      returnKeyType="done"
                      onSubmitEditing={handleEmailLogin}
                      style={{
                        backgroundColor: colors.surface,
                        borderRadius: 10,
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                        paddingRight: 48,
                        fontSize: 15,
                        color: colors.foreground,
                        borderWidth: 1,
                        borderColor: colors.border,
                      }}
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword(!showPassword)}
                      accessibilityRole="button"
                      accessibilityLabel={
                        showPassword
                          ? tx(
                              "Wachtwoord verbergen",
                              "Hide password",
                              "إخفاء كلمة المرور",
                            )
                          : tx(
                              "Wachtwoord tonen",
                              "Show password",
                              "إظهار كلمة المرور",
                            )
                      }
                      hitSlop={8}
                      style={{
                        position: "absolute",
                        right: 4,
                        top: 0,
                        minWidth: 44,
                        minHeight: 44,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                      activeOpacity={0.6}
                    >
                      <Text style={{ fontSize: 13, color: colors.primary }}>
                        {showPassword
                          ? tx("Verberg", "Hide", "إخفاء")
                          : tx("Toon", "Show", "إظهار")}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Forgot password link */}
                <TouchableOpacity
                  onPress={() => router.push("/forgot-password" as any)}
                  activeOpacity={0.6}
                  style={{
                    alignSelf: isRTL ? "flex-start" : "flex-end",
                    minHeight: 44,
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ fontSize: 13, color: colors.primary }}>
                    {tx(
                      "Wachtwoord vergeten?",
                      "Forgot password?",
                      "نسيت كلمة المرور؟",
                    )}
                  </Text>
                </TouchableOpacity>

                {/* Error message */}
                {error ? (
                  <Text
                    accessibilityRole="alert"
                    accessibilityLiveRegion="polite"
                    style={{
                      color: colors.error,
                      fontSize: 13,
                      textAlign: "center",
                      marginTop: 4,
                    }}
                  >
                    {error}
                  </Text>
                ) : null}

                {/* Login Button */}
                <TouchableOpacity
                  onPress={handleEmailLogin}
                  disabled={loading}
                  activeOpacity={0.8}
                  style={{
                    backgroundColor: colors.primary,
                    borderRadius: 10,
                    paddingVertical: 14,
                    alignItems: "center",
                    marginTop: 8,
                    opacity: loading ? 0.7 : 1,
                  }}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: "600",
                        color: "#ffffff",
                      }}
                    >
                      {tx("Inloggen", "Sign in", "تسجيل الدخول")}
                    </Text>
                  )}
                </TouchableOpacity>

                {Platform.OS === "android" && (
                  <>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        marginVertical: 12,
                      }}
                    >
                      <View
                        style={{
                          flex: 1,
                          height: 1,
                          backgroundColor: colors.border,
                        }}
                      />
                      <Text
                        style={{
                          marginHorizontal: 12,
                          fontSize: 12,
                          color: colors.muted,
                        }}
                      >
                        {tx("of", "or", "أو")}
                      </Text>
                      <View
                        style={{
                          flex: 1,
                          height: 1,
                          backgroundColor: colors.border,
                        }}
                      />
                    </View>

                    <TouchableOpacity
                      onPress={handleGoogleLogin}
                      disabled={loading}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 10,
                        backgroundColor: "#ffffff",
                        borderRadius: 10,
                        paddingVertical: 13,
                        paddingHorizontal: 20,
                        borderWidth: 1,
                        borderColor: "#dadce0",
                        shadowColor: "#000",
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: 0.08,
                        shadowRadius: 2,
                        elevation: 1,
                        opacity: loading ? 0.7 : 1,
                      }}
                      activeOpacity={0.8}
                    >
                      <GoogleGIcon />
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "500",
                          color: "#3c4043",
                        }}
                      >
                        {tx(
                          "Inloggen met Google",
                          "Sign in with Google",
                          "تسجيل الدخول بـ Google",
                        )}
                      </Text>
                    </TouchableOpacity>
                  </>
                )}

                {/* Sideload build points at the website; the Play build must not,
                    because rabbaanie.com sells the subscription outside Play
                    billing (anti-steering). Play users get a support contact —
                    allowed app furniture — so a stranded user still has a path. */}
                {/* Both channels now create the account in-app. That is the only
                    route the Play build may offer, and it is also better for the
                    sideload build: a purchase started on rabbaanie.com provisions
                    nothing for a brand-new customer, so pointing them there took
                    money and left them without an account. */}
                <TouchableOpacity
                  onPress={() => router.push("/register" as any)}
                  accessibilityRole="link"
                  activeOpacity={0.6}
                  style={{
                    minHeight: 44,
                    marginTop: 8,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      color: colors.muted,
                      textAlign: "center",
                    }}
                  >
                    {tx(
                      "Nog geen account? ",
                      "No account yet? ",
                      "ليس لديك حساب؟ ",
                    )}
                    <Text
                      style={{
                        color: colors.primary,
                        textDecorationLine: "underline",
                      }}
                    >
                      {tx("Account aanmaken", "Create account", "إنشاء حساب")}
                    </Text>
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() =>
                    Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {})
                  }
                  accessibilityRole="link"
                  activeOpacity={0.6}
                  style={{
                    minHeight: 44,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      color: colors.muted,
                      textAlign: "center",
                    }}
                  >
                    {tx(
                      "Hulp nodig bij het inloggen? Mail ",
                      "Need help signing in? Contact ",
                      "تحتاج مساعدة في تسجيل الدخول؟ راسل ",
                    )}
                    <Text style={{ textDecorationLine: "underline" }}>
                      {SUPPORT_EMAIL}
                    </Text>
                  </Text>
                </TouchableOpacity>
              </View>
            )}
```

Note what changed relative to the original form content: the inline `{twoFactorChallenge ? (...) : null}` code-field block (previously nested between the email and password inputs) is gone — it's now the entire `TwoFactorVerifyScreen` branch above — and the Login button's label is no longer a `twoFactorChallenge ? "Verifiëren" : "Inloggen"` ternary, since this branch only ever renders when `twoFactorChallenge` is falsy.

- [ ] **Step 6: Type-check**

Run: `cd /home/farouq/Development/rabbanieserver/repo && npx tsc --noEmit`
Expected: exit 0, no errors.

- [ ] **Step 7: Run the release test suite**

Run: `cd /home/farouq/Development/rabbanieserver/repo && pnpm test:release`
Expected: same pass count as the pre-change baseline (190/19 per the last handoff) — this task doesn't touch anything those tests cover, so it should be a no-op on the results; if it isn't, investigate before continuing.

- [ ] **Step 8: Commit**

```bash
git add app/login.tsx
git commit -m "feat(auth): swap the inline 2FA card for a dedicated verification screen"
```

---

### Task 6: Deploy and verify — requires explicit go-ahead

**This task is a production deploy. Do not run it as a matter of course — confirm with the user first, at the time, regardless of how the earlier tasks went.**

- [ ] Deploy rabbaanie-api (Tasks 1–3) to the production VM, following whatever deploy process is already in use for that repo (check for a documented one before improvising — none was found during this plan's research, which itself is worth surfacing to the user rather than guessing at deploy steps).
- [ ] Verify `POST /auth/2fa/resend` live against `https://api.rabbaanie.com`, the same way as Task 3 Step 3 but against production instead of localhost.
- [ ] Only then: build and ship the client (Tasks 4–5) as the next sideload release, following this project's existing manual build+deploy recipe (see project memory: `apk-release-pipeline-broken-and-bypassed`).
- [ ] Manual device verification on the physical HONOR, covering: password login → challenge screen → resend (both under and over the 60s cooldown) → verify succeeds; Google sign-in on a privileged account → same challenge screen → verify succeeds; Cancel returns to a clean sign-in form; a stale/expired code shows the existing "invalid or expired" error without losing the challenge.

---

## Self-Review

**Spec coverage:** Root-cause fix → Task 1. New resend endpoint → Tasks 2–3. Dedicated screen replacing the inline card → Tasks 4–5. Copy table → Task 4 (component) and reused in Task 5's error strings. Error handling (invalid code unchanged, resend failure inline) → Task 5 Step 4 and the component's `error` prop. Testing → Tasks 1–2 (automated), Task 3 (manual, matching existing repo convention), Task 6 (device). Rollout ordering → Task 6, explicitly gated on user go-ahead. Out-of-scope web-admin-panel param mismatch → correctly not present in any task.

**Placeholder scan:** No TBD/TODO. Task 6's deploy steps intentionally don't invent a deploy process that wasn't found — that's flagged as a thing to surface to the user, not a placeholder standing in for real content.

**Type consistency:** `TwoFactorVerifyScreenProps` in Task 4 and the JSX call site in Task 5 Step 5 use identical prop names (`email`, `code`, `onChangeCode`, `method`, `issuedAt`, `error`, `verifying`, `onVerify`, `onCancel`, `resending`, `onResend`). The resend response shape (`{ challengeToken, factor }`) matches between Task 3's route and Task 5 Step 4's `handleResend`. `resolveAdmin2FAChallengeUser(challengeToken: string): Promise<number | null>` matches between Task 2's implementation and Task 3's call site.
