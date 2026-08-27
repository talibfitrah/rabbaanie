# Account Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop admin lists showing deleted users, close the unvalidated public registration endpoint, add email verification, and make deletion actually erase — without breaking the 574 passing tests.

**Architecture:** Nearly all work lands in the **production API repo**, which has a local checkout at `/Users/farouqabouumar/Development/rabbaanie-api-account-integrity` (`master`, Postgres). Develop and test there locally, then push and deploy. Guards go at the single shared chokepoint each behaviour already routes through (`getAllUsers`, `deleteUser`), never per-caller. New validation mirrors the shape `server/name-validation.ts` established: pure sync function → discriminated union → separate localiser → route maps to 400.

**Tech Stack:** Node, TypeScript, drizzle-orm (`pg-core`), Express, vitest, Brevo (via `server/_core/email.ts`), bcryptjs.

**Spec:** `docs/superpowers/specs/2026-08-27-account-integrity-design.md` (in the CLIENT repo, `/Users/farouqabouumar/Development/rabbaanie`)

## Global Constraints

- **Repo:** all tasks operate in the git worktree `/Users/farouqabouumar/Development/rabbaanie-api-account-integrity`, on branch `feat/account-integrity`. This is a worktree of the PRODUCTION API repo, not the client repo, and NOT its `master` checkout. Never edit `/Users/farouqabouumar/Development/rabbaanie-api` (that is `master`) and never edit the client repo.
- **Baseline that must not regress:** `npm test` → **47 files, 574 tests passing** (~7s local). Verified 2026-08-27. Re-run after every task.
- **Never touch the VM.** No ssh, no pm2, no deploy, no `git push`. Deployment is Task 11, main session only.
- **Never run anything against the production database.** All tests mock `drizzle-orm/node-postgres` and set `process.env.DATABASE_URL` to a stub.
- **Pushing needs the alias** `git@github-fitrah:talibfitrah/rabbaanie-api.git` — the default SSH key is rejected by GitHub. Task 11 only.
- **Assert presence, not just absence.** A filter that hid every user would pass an absence-only test. Every guard test must also assert the capability still works.
- **Accept by default.** Follow `name-validation.ts`: reject only on positive evidence. Never write a "recogniser" that rejects unfamiliar-but-valid input.
- `OWNER_USER_ID = 1`; Play review account is `id=22710015`.
- Do not reformat, refactor, or "improve" adjacent code. Every changed line traces to a task.

---

### Task 1: Protect the Play Console review account from deletion

The account `play-review@albunyaan.tv` (`id=22710015`) is `role='user'` with `roles` NULL, so neither existing guard in `deleteUser` covers it. Its database note says "do not delete". It carries a Stripe subscription to 2037. Deleting it breaks Play review.

**Files:**
- Modify: `server/db.ts` (near `OWNER_USER_ID`, ~line 1064; and `deleteUser`, ~line 2222)
- Test: `tests/delete-user-guards.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `PROTECTED_USER_IDS: readonly number[]` exported from `server/db.ts`. Task 9 relies on this name.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("../server/fcm", () => ({ sendFcmToOne: vi.fn(), sendFcmToMany: vi.fn() }));
vi.mock("../server/stripe", () => ({ cancelSubscriptionForUser: vi.fn() }));

const USER_ROWS: any[] = [
  { id: 22710015, email: "play-review@albunyaan.tv", role: "user", roles: null, deletedAt: null },
];

vi.mock("drizzle-orm/node-postgres", async () => {
  const schema: any = await import("../drizzle/schema");
  const chainOf = (rows: any[]): any => {
    const p: any = Promise.resolve(rows);
    p.orderBy = () => chainOf(rows);
    p.where = () => chainOf(rows);
    p.limit = () => chainOf(rows);
    return p;
  };
  return {
    drizzle: () => ({
      select: () => ({ from: (t: any) => chainOf(t === schema.users ? USER_ROWS : []) }),
      update: () => ({ set: () => ({ where: () => Promise.resolve([]) }) }),
    }),
  };
});

process.env.DATABASE_URL = "postgres://stub/stub";

const { deleteUser, RoleWriteRefused, PROTECTED_USER_IDS } = await import("../server/db");

describe("deleteUser refuses protected accounts", () => {
  it("refuses the Play Console review account", async () => {
    await expect(deleteUser(22710015)).rejects.toBeInstanceOf(RoleWriteRefused);
  });

  it("lists the Play review account as protected", () => {
    expect(PROTECTED_USER_IDS).toContain(22710015);
  });

  // Presence check: the guard must not have become "refuse everything".
  it("still allows deleting an ordinary user", async () => {
    USER_ROWS[0] = { id: 555, email: "a@b.com", role: "user", roles: null, deletedAt: null };
    await expect(deleteUser(555)).resolves.toBeUndefined();
    USER_ROWS[0] = { id: 22710015, email: "play-review@albunyaan.tv", role: "user", roles: null, deletedAt: null };
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd /Users/farouqabouumar/Development/rabbaanie-api-account-integrity && npx vitest run tests/delete-user-guards.test.ts`
Expected: FAIL — `PROTECTED_USER_IDS` is not exported, and `deleteUser(22710015)` resolves instead of rejecting.

- [ ] **Step 3: Implement**

In `server/db.ts`, beside `OWNER_USER_ID`:

```ts
/**
 * Accounts that no delete may touch, whatever role they hold.
 *
 * 22710015 is the Google Play Console review account. It is role='user' with no
 * roles array, so the OWNER_USER_ID and super_admin guards below both miss it —
 * yet deleting it breaks store review and cancels a Stripe subscription that
 * runs to 2037. Its own DB note says "do not delete"; this is that note, enforced.
 */
export const PROTECTED_USER_IDS: readonly number[] = [OWNER_USER_ID, 22710015];
```

In `deleteUser`, replace the `userId === OWNER_USER_ID` line with:

```ts
  if (PROTECTED_USER_IDS.includes(userId)) throw new RoleWriteRefused("لا يمكن حذف هذا الحساب");
```

- [ ] **Step 4: Run the test, then the whole suite**

Run: `npx vitest run tests/delete-user-guards.test.ts` → Expected: PASS
Run: `npm test` → Expected: **47 files, 574+3 tests passing**. Any pre-existing test that fails is a regression — stop and report.

- [ ] **Step 5: Commit**

```bash
cd /Users/farouqabouumar/Development/rabbaanie-api-account-integrity
git add server/db.ts tests/delete-user-guards.test.ts
git commit -m "fix(delete): protect the Play review account, which no existing guard covered"
```

---

### Task 2: Stop returning soft-deleted users from admin reads

`getAllUsers` has no `deletedAt` filter, so all 12 soft-deleted rows appear in the app admin list, in `GET /admin-api/users`, and — with PII — in the admin CSV export. `getDashboardStats` counts them too (reports 95 over a list of 83).

**Implementation note that decides the approach:** the existing test mock's `.where()` **ignores its predicate and returns all rows** (see `tests/admin-lists-privacy.test.ts`). A SQL-level `WHERE` on `getAllUsers` would therefore be untestable — the test would fail even when the fix is correct. `getAllUsers` already maps over every row, and the table is ~95 rows, so filter in JS. `getDashboardStats` uses `count(*)` and cannot filter in JS, so it takes a SQL `where` and is tested by recording the call.

**Files:**
- Modify: `server/db.ts` — `getAllUsers` (~line 211), `getDashboardStats` (~line 770)
- Test: `tests/admin-lists-exclude-deleted.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: no new exports; `getAllUsers(includePii?: boolean)` keeps its signature.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("../server/fcm", () => ({ sendFcmToOne: vi.fn(), sendFcmToMany: vi.fn() }));

const LIVE = {
  id: 1, name: "Live User", email: "live@example.com", role: "user", roles: null,
  passwordHash: "$2b$10$secret", profileData: {}, deletedAt: null,
  createdAt: new Date("2026-01-01"), gender: "male", maritalStatus: null,
};
const DELETED = {
  id: 2, name: "Probe", email: "gate-probe-h-20260817@example.invalid", role: "user", roles: null,
  passwordHash: "$2b$10$secret", profileData: {}, deletedAt: new Date("2026-08-17"),
  createdAt: new Date("2026-08-17"), gender: null, maritalStatus: null,
};

const whereCalls: string[] = [];

vi.mock("drizzle-orm/node-postgres", async () => {
  const schema: any = await import("../drizzle/schema");
  const chainOf = (rows: any[], table?: any): any => {
    const p: any = Promise.resolve(rows);
    p.orderBy = () => chainOf(rows, table);
    p.where = () => { if (table === schema.users) whereCalls.push("users"); return chainOf(rows, table); };
    p.limit = () => chainOf(rows, table);
    return p;
  };
  return {
    drizzle: () => ({
      select: (sel?: any) => ({
        from: (t: any) => {
          if (sel && "count" in (sel || {})) return chainOf([{ count: 2 }], t);
          return chainOf(t === schema.users ? [LIVE, DELETED] : [], t);
        },
      }),
    }),
  };
});

process.env.DATABASE_URL = "postgres://stub/stub";

const { getAllUsers, getDashboardStats } = await import("../server/db");

describe("admin reads exclude soft-deleted users", () => {
  it("getAllUsers drops the deleted row", async () => {
    const rows = await getAllUsers();
    expect(rows.map((u: any) => u.id)).toEqual([1]);
  });

  // Presence: a filter that hid everyone would pass the assertion above.
  it("getAllUsers still returns live users, and still strips passwordHash", async () => {
    const rows = await getAllUsers();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 1, email: "live@example.com" });
    expect(rows[0]).not.toHaveProperty("passwordHash");
  });

  it("getAllUsers(true) still returns PII for the live user only", async () => {
    const rows = await getAllUsers(true);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveProperty("createdAt");
  });

  it("getDashboardStats applies a predicate to the users count", async () => {
    whereCalls.length = 0;
    await getDashboardStats();
    expect(whereCalls).toContain("users");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/admin-lists-exclude-deleted.test.ts`
Expected: FAIL — `getAllUsers` returns ids `[1, 2]`, and `whereCalls` is empty.

- [ ] **Step 3: Implement**

`getAllUsers` — add the filter and a comment saying why it is in JS:

```ts
export async function getAllUsers(includePii = false) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(users).orderBy(desc(users.createdAt));
  // Soft-deleted users must not reach ANY caller: the two admin lists, the CSV
  // export (which carries name + email), or the broadcast audience builder.
  // Filtered here rather than in SQL because this already maps every row, the
  // table is small, and the query mock in tests ignores `.where()` predicates —
  // a SQL filter would be silently untestable.
  return rows
    .filter((u) => !u.deletedAt)
    .map(({ passwordHash, ...user }) => {
      if (includePii) return user;
      const { createdAt, gender, maritalStatus, ...base } = user;
      return base;
    });
}
```

`getDashboardStats` — the user count only (its family/child/message counts have the same flaw; out of scope, recorded as spec follow-up 5):

```ts
  const [userCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(isNull(users.deletedAt));
```

Confirm `isNull` is already imported from `drizzle-orm` at the top of `db.ts`; it is used elsewhere in the file. Add it to the import only if missing.

- [ ] **Step 4: Run the test, then the whole suite**

Run: `npx vitest run tests/admin-lists-exclude-deleted.test.ts` → PASS
Run: `npm test` → 574+ passing, zero regressions.

- [ ] **Step 5: Commit**

```bash
git add server/db.ts tests/admin-lists-exclude-deleted.test.ts
git commit -m "fix(admin): stop admin lists, CSV export and the dashboard count returning deleted users"
```

---

### Task 3: `checkEmail` — reject addresses that cannot receive mail

`POST /auth/register` has no email validation whatsoever. The string `probe`, with no `@`, is accepted today.

**Files:**
- Create: `server/email-validation.ts`
- Test: `tests/email-validation.test.ts` (create)

**Interfaces:**
- Produces (Task 4 depends on these exact names):
  - `type EmailRejection = "format" | "unreachable_tld"`
  - `type EmailCheck = { ok: true } | { ok: false; reason: EmailRejection }`
  - `function checkEmail(email: string): EmailCheck`
  - `function emailRejectionMessage(reason: EmailRejection, lang?: string): string`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { checkEmail, emailRejectionMessage } from "../server/email-validation";

describe("checkEmail", () => {
  it("accepts ordinary addresses", () => {
    for (const e of ["a@gmail.com", "ahmad.yusuf@hotmail.nl", "x+tag@sub.example.co.uk", "user@ik.me"]) {
      expect(checkEmail(e)).toEqual({ ok: true });
    }
  });

  it("accepts unfamiliar but structurally valid addresses (accept-by-default)", () => {
    for (const e of ["名前@例え.みんな", "a@mail.xn--fiqs8s", "q@a.b.c.d.museum"]) {
      expect(checkEmail(e).ok).toBe(true);
    }
  });

  it("rejects structurally impossible addresses", () => {
    for (const e of ["probe", "", "   ", "@example.org", "a@", "a b@c.com", "a@b", "a@@b.com"]) {
      expect(checkEmail(e)).toEqual({ ok: false, reason: "format" });
    }
  });

  it("rejects reserved TLDs and the reserved example domains", () => {
    for (const e of [
      "gate-probe-h-20260817@example.invalid",
      "x@foo.test",
      "x@thing.localhost",
      "x@a.example",
      "qa-org-test-verify@example.com",
      "x@example.net",
      "x@EXAMPLE.ORG",
      "claude-navfix-qa@rabbaanie-test.invalid",
    ]) {
      expect(checkEmail(e)).toEqual({ ok: false, reason: "unreachable_tld" });
    }
  });

  it("localises both reasons in ar, nl and en, and falls back for unknown languages", () => {
    for (const lang of ["ar", "nl", "en"]) {
      expect(emailRejectionMessage("format", lang)).toBeTruthy();
      expect(emailRejectionMessage("unreachable_tld", lang)).toBeTruthy();
    }
    expect(emailRejectionMessage("format", "__proto__")).toBe(emailRejectionMessage("format", "ar"));
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/email-validation.test.ts`
Expected: FAIL — `Cannot find module '../server/email-validation'`.

- [ ] **Step 3: Implement**

Create `server/email-validation.ts`:

```ts
/**
 * Can this address possibly receive mail?
 *
 * Same principle as name-validation.ts: ACCEPT BY DEFAULT, reject only on
 * positive evidence. There is no regex that recognises a valid email — every
 * attempt rejects real addresses, and the people it turns away are the ones
 * with unusual domains, who have no way around it. So this checks only two
 * things that are impossible rather than merely unfamiliar:
 *
 *   1. Structure: exactly one "@", something either side, no whitespace, and a
 *      dot in the domain.
 *   2. Reserved names: RFC 2606 / RFC 6761 set aside .invalid, .test, .example
 *      and .localhost, and the example.com/net/org domains, precisely so they
 *      can never resolve. An address there can never receive mail — ever, by
 *      standard, not by circumstance.
 *
 * Every junk account found on 2026-08-27 dies at rule 2. An MX lookup would add
 * typo-catching, but it is async, needs a fail-open path for DNS outages, and
 * addresses a class we have never actually seen. Deliberately not done here.
 */

export type EmailRejection = "format" | "unreachable_tld";
export type EmailCheck = { ok: true } | { ok: false; reason: EmailRejection };

/** Reserved by RFC 2606 / RFC 6761. These can never resolve, by standard. */
const RESERVED_TLDS = ["invalid", "test", "example", "localhost"];
const RESERVED_DOMAINS = ["example.com", "example.net", "example.org"];

export function checkEmail(email: string): EmailCheck {
  const value = (email || "").trim();
  if (!value || /\s/.test(value)) return { ok: false, reason: "format" };

  const parts = value.split("@");
  if (parts.length !== 2) return { ok: false, reason: "format" };
  const [local, domain] = parts;
  if (!local || !domain) return { ok: false, reason: "format" };
  if (!domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) {
    return { ok: false, reason: "format" };
  }

  const lower = domain.toLowerCase();
  const tld = lower.slice(lower.lastIndexOf(".") + 1);
  if (RESERVED_TLDS.includes(tld)) return { ok: false, reason: "unreachable_tld" };
  if (RESERVED_DOMAINS.includes(lower)) return { ok: false, reason: "unreachable_tld" };

  return { ok: true };
}

/** The message to show, in the user's own language. */
export function emailRejectionMessage(reason: EmailRejection, lang = "ar"): string {
  const M: Record<string, Record<EmailRejection, string>> = {
    ar: {
      format: "اكتب بريدًا إلكترونيًّا صحيحًا.",
      unreachable_tld: "هذا البريد لا يمكن أن يستقبل رسائل. اكتب بريدك الحقيقيّ.",
    },
    nl: {
      format: "Vul een geldig e-mailadres in.",
      unreachable_tld: "Dit e-mailadres kan geen post ontvangen. Vul uw echte e-mailadres in.",
    },
    en: {
      format: "Please enter a valid email address.",
      unreachable_tld: "This address cannot receive mail. Please enter your real email address.",
    },
  };
  // Own-property lookup, matching nameRejectionMessage: lang="__proto__" would
  // otherwise resolve to an inherited value instead of falling back to Arabic.
  return (Object.prototype.hasOwnProperty.call(M, lang) ? M[lang] : M.ar)[reason];
}
```

- [ ] **Step 4: Run the test, then the whole suite**

Run: `npx vitest run tests/email-validation.test.ts` → PASS
Run: `npm test` → 574+ passing.

- [ ] **Step 5: Commit**

```bash
git add server/email-validation.ts tests/email-validation.test.ts
git commit -m "feat(auth): add checkEmail, rejecting addresses that cannot receive mail"
```

---

### Task 4: Wire `checkEmail` and an IP rate limit into `POST /auth/register`

**Files:**
- Modify: `server/web-auth.ts` (the register handler, ~line 318)
- Test: `tests/register-email-gate.test.ts` (create)

**Interfaces:**
- Consumes: `checkEmail`, `emailRejectionMessage` from Task 3.
- Produces: nothing exported.

**Why a local limiter:** the existing `isRateLimited` in `admin-2fa-challenge.ts` keys on `` `${userId}:${ip}` `` — an anonymous signup has no userId — and its increment is not exported (it lives inline in `completeAdmin2FAChallenge`'s failure branch). Generalising it would put this change inside the admin-2FA brute-force guard. A local limiter has no blast radius.

- [ ] **Step 1: Write the failing test**

`server/web-auth.ts` already exports pure helpers for testing — `isValidMaritalStatus` and
`buildParentProfile` are exported and unit-tested in `tests/web-auth-register.test.ts`. Follow
that convention: export `registerRateLimited` and test its behaviour. Do NOT assert on source
text; a formatting change would break it and the tempting fix is to loosen the guard away.

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("registerRateLimited", () => {
  beforeEach(() => { vi.resetModules(); vi.useRealTimers(); });

  it("allows the first five attempts from one IP and refuses the sixth", async () => {
    const { registerRateLimited } = await import("../server/web-auth");
    for (let i = 1; i <= 5; i++) {
      expect(registerRateLimited("203.0.113.7")).toBe(false);
    }
    expect(registerRateLimited("203.0.113.7")).toBe(true);
  });

  // Presence: a limiter that refused everyone would pass the assertion above.
  it("does not penalise a different IP", async () => {
    const { registerRateLimited } = await import("../server/web-auth");
    for (let i = 1; i <= 6; i++) registerRateLimited("203.0.113.7");
    expect(registerRateLimited("198.51.100.4")).toBe(false);
  });

  it("forgets the bucket once the window has passed", async () => {
    vi.useFakeTimers();
    const { registerRateLimited } = await import("../server/web-auth");
    for (let i = 1; i <= 6; i++) registerRateLimited("203.0.113.9");
    expect(registerRateLimited("203.0.113.9")).toBe(true);
    vi.advanceTimersByTime(60 * 60 * 1000 + 1);
    expect(registerRateLimited("203.0.113.9")).toBe(false);
  });

  it("treats a missing IP as one shared bucket rather than crashing", async () => {
    const { registerRateLimited } = await import("../server/web-auth");
    expect(registerRateLimited("")).toBe(false);
  });
});
```

Plus ONE wiring canary — deliberately a source check, because whether the route *calls*
`checkEmail` has no seam without adding an HTTP test dependency. It asserts a capability is
PRESENT, which is the direction CLAUDE.md asks for; it is not a substitute for Task 3's tests.

```ts
import { readFileSync } from "node:fs";

it("the register route actually calls the email gate", () => {
  const src = readFileSync(new URL("../server/web-auth.ts", import.meta.url), "utf8");
  const route = src.slice(src.indexOf('app.post("/auth/register"'));
  expect(route).toContain("checkEmail(");
  expect(route).toContain("registerRateLimited(");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/register-email-gate.test.ts`
Expected: FAIL — neither `checkEmail(` nor `registerRateLimited(` appears in `web-auth.ts`.

- [ ] **Step 3: Implement the limiter**

At the top of `server/web-auth.ts`, beside the other module constants:

```ts
const REGISTER_WINDOW_MS = 60 * 60 * 1000;
const REGISTER_MAX_PER_IP = 5;
const registerAttempts = new Map<string, { count: number; resetsAt: number }>();

/**
 * Per-IP cap on account creation. `POST /auth/register` is public, unauthenticated
 * and creates a permanent account with a one-year session, so without this one
 * script can mint unlimited users — which is exactly how 12 probe accounts reached
 * production on 2026-08-17.
 *
 * ponytail: in-memory Map, single pm2 fork, so the counter resets on restart and
 * would not be shared if the API were ever clustered. Move to Postgres or Redis
 * if either changes.
 */
function registerRateLimited(ip: string): boolean {
  const key = ip || "unknown";
  const now = Date.now();
  const bucket = registerAttempts.get(key);
  if (!bucket || bucket.resetsAt < now) {
    registerAttempts.set(key, { count: 1, resetsAt: now + REGISTER_WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > REGISTER_MAX_PER_IP;
}
```

- [ ] **Step 4: Wire both into the handler**

In the `app.post("/auth/register", ...)` handler, immediately after the existing `missingRegistrationFields` / length checks and **before** the `checkPersonName` call:

```ts
      if (registerRateLimited(req.ip || "")) {
        res.status(429).json({ error: "Te veel registratiepogingen. Probeer het later opnieuw." });
        return;
      }

      const emailCheck = checkEmail(email);
      if (!emailCheck.ok) {
        res.status(400).json({ error: emailRejectionMessage(emailCheck.reason, language) });
        return;
      }
```

Add the import at the top of the file:

```ts
import { checkEmail, emailRejectionMessage } from "./email-validation";
```

`req.ip` is trustworthy — `server/_core/index.ts:35` sets `app.set("trust proxy", 1)`.

- [ ] **Step 5: Run the test**

Run: `npx vitest run tests/register-email-gate.test.ts` → PASS

- [ ] **Step 6: Export the limiter so Step 1's tests can reach it**

Change `function registerRateLimited` to `export function registerRateLimited`. It is exported
for testing, exactly as `isValidMaritalStatus` already is in this file.

- [ ] **Step 7: Run the whole suite and commit**

Run: `npm test` → 574+ passing.

```bash
git add server/web-auth.ts tests/register-email-gate.test.ts
git commit -m "feat(auth): validate the email and rate-limit POST /auth/register"
```

---

### Task 5: Add the `email_verified_at` column and grandfather existing users

**Files:**
- Modify: `drizzle/schema.ts` (the `users` table)
- Create: `scripts/add-email-verified-column.ts`
- Test: `tests/email-verified-column.test.ts` (create)

**Interfaces:**
- Produces: `users.emailVerifiedAt` (drizzle field name) → column `email_verified_at`. Tasks 6, 7 and 8 use this name.

**Why a column and not a `profileData` key:** `profileRouter.save` accepts `z.any()` and rewrites `profileData` wholesale, so a client could clear its own verification flag. Transient `_verify*` keys may live in `profileData` (the `_reset*` keys set that precedent); the durable trust flag may not.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { users } from "../drizzle/schema";

describe("users.emailVerifiedAt", () => {
  it("exists and maps to email_verified_at", () => {
    expect(users.emailVerifiedAt).toBeDefined();
    expect((users.emailVerifiedAt as any).name).toBe("email_verified_at");
  });

  it("is nullable — unverified accounts exist and must be representable", () => {
    expect((users.emailVerifiedAt as any).notNull).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/email-verified-column.test.ts`
Expected: FAIL — `users.emailVerifiedAt` is undefined.

- [ ] **Step 3: Add the schema field**

In `drizzle/schema.ts`, in the `users` table beside `deletedAt`:

```ts
  /** When the address was proven reachable. NULL = never verified. */
  emailVerifiedAt: timestamp("email_verified_at"),
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/email-verified-column.test.ts` → PASS

- [ ] **Step 5: Write the migration script**

`drizzle-kit migrate` has never run against this database (there is no `__drizzle_migrations` table). The established pattern is a one-off `tsx` script; nine exist in `scripts/`. Follow `scripts/create-feedback-table.ts`.

Create `scripts/add-email-verified-column.ts`:

```ts
import "dotenv/config";
import * as db from "../server/db";
import { sql } from "drizzle-orm";

/**
 * Adds users.email_verified_at and grandfathers every existing live account.
 *
 * The 83 real users signed up before verification existed. Forcing them to
 * re-verify is a support event with no security gain — they are already
 * using the app. Only accounts created AFTER this runs must prove themselves.
 *
 * Idempotent: ADD COLUMN IF NOT EXISTS, and the backfill is scoped to rows
 * that are still NULL, so a second run changes nothing.
 */
(async () => {
  const d = await db.getDb();
  if (!d) { console.log("no DB"); process.exit(1); }

  await d.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamp`);

  const before: any = await d.execute(
    sql`SELECT count(*)::int AS n FROM users WHERE email_verified_at IS NULL AND "deletedAt" IS NULL`,
  );
  console.log("live users still unverified before backfill:", before.rows?.[0]?.n ?? before[0]?.n);

  await d.execute(sql`
    UPDATE users SET email_verified_at = "createdAt"
    WHERE email_verified_at IS NULL AND "deletedAt" IS NULL
  `);

  const after: any = await d.execute(
    sql`SELECT count(*)::int AS n FROM users WHERE email_verified_at IS NOT NULL`,
  );
  console.log("users now verified:", after.rows?.[0]?.n ?? after[0]?.n);
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
```

- [ ] **Step 6: Run the whole suite and commit**

Run: `npm test` → 574+ passing.
Do **not** run the migration script — that is Task 11, against production, after a backup.

```bash
git add drizzle/schema.ts scripts/add-email-verified-column.ts tests/email-verified-column.test.ts
git commit -m "feat(auth): add users.email_verified_at with a grandfathering backfill"
```

---

### Task 6: Issue and verify email codes

Mirrors `POST /auth/forgot-password` exactly, because that flow is already correct — including its atomic `jsonb_set` attempt counter, which a read-modify-write would race.

**Files:**
- Modify: `server/web-auth.ts` (new routes beside the forgot-password pair, ~line 755)
- Test: `tests/email-verification.test.ts` (create)

**Interfaces:**
- Consumes: `users.emailVerifiedAt` (Task 5).
- Produces: `POST /auth/send-verification` and `POST /auth/verify-email`. Task 7 depends on `emailVerifiedAt` being stamped by the latter.

**Constants and mechanics — copy these values, they match the reset flow:**

| | |
|---|---|
| `profileData` keys | `_verifyCodeHash`, `_verifyExpires`, `_verifyAttempts`, `_verifyRequestedAt` |
| code | `randomInt(100_000, 1_000_000)` → 6 digits |
| hash | `createHmac("sha256", getStateSecret()).update(`${user.id}:${code}`).digest("base64url")` |
| TTL | 15 min (`VERIFY_CODE_TTL_MS`) |
| attempts | 5 (`MAX_VERIFY_ATTEMPTS`) |
| cooldown | 60 s (`VERIFY_REQUEST_COOLDOWN_MS`) |
| comparison | `timingSafeEqual` on equal-length buffers |
| response | constant on `/auth/send-verification`, to avoid enumeration |

- [ ] **Step 1: Write the failing test**

> **Prefer a real seam over these assertions.** The checks below pin structure, not behaviour,
> and structure-coupled tests rot on a reformat. As you implement Step 3, export the two pure
> helpers the way `web-auth.ts` already exports `isValidMaritalStatus`:
> `hashVerifyCode(userId: number, code: string): string` and
> `isVerifyCodeExpired(expiresIso: string, now?: Date): boolean`. Test THOSE behaviourally —
> the same input gives the same hash, a different user id gives a different hash, an expired
> timestamp returns true, a future one returns false. Keep the structural checks below only as
> a thin canary for what genuinely has no seam: that both routes exist and that the attempt
> counter uses `jsonb_set`.


```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";

const SRC = readFileSync(new URL("../server/web-auth.ts", import.meta.url), "utf8");

describe("email verification mirrors the reset flow's hardening", () => {
  it("exposes both routes", () => {
    expect(SRC).toContain('app.post("/auth/send-verification"');
    expect(SRC).toContain('app.post("/auth/verify-email"');
  });

  it("hashes the code rather than storing it", () => {
    expect(SRC).toContain("_verifyCodeHash");
    expect(SRC).not.toMatch(/_verifyCode\b(?!Hash)/);
  });

  it("uses the same TTL, attempt cap and cooldown as the reset flow", () => {
    expect(SRC).toContain("VERIFY_CODE_TTL_MS = 15 * 60 * 1000");
    expect(SRC).toContain("MAX_VERIFY_ATTEMPTS = 5");
    expect(SRC).toContain("VERIFY_REQUEST_COOLDOWN_MS = 60 * 1000");
  });

  it("compares in constant time and increments attempts atomically", () => {
    const verifyBlock = SRC.slice(SRC.indexOf('app.post("/auth/verify-email"'));
    expect(verifyBlock).toContain("timingSafeEqual");
    expect(verifyBlock).toContain("jsonb_set");
  });

  it("the HMAC construction is reproducible", () => {
    const a = createHmac("sha256", "k".repeat(32)).update("7:123456", "utf8").digest("base64url");
    const b = createHmac("sha256", "k".repeat(32)).update("7:123456", "utf8").digest("base64url");
    expect(a).toBe(b);
    expect(a).not.toContain("=");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/email-verification.test.ts`
Expected: FAIL — neither route exists.

- [ ] **Step 3: Implement `POST /auth/send-verification`**

Add beside the constants at the top of `web-auth.ts`:

```ts
const VERIFY_CODE_TTL_MS = 15 * 60 * 1000;
const VERIFY_REQUEST_COOLDOWN_MS = 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;
```

Then the route. Read the existing `POST /auth/forgot-password` handler in full first and follow it line for line, changing only the `_reset*` key names to `_verify*`, the email copy, and the success action. Keep: the `isNull(users.deletedAt)` clause in the lookup, the cooldown short-circuit, the constant success response on every path including Brevo failure, and the `console.error` on send failure.

Localise the mail body by `user.language` (`nl` | `en` | `ar`, defaulting to `nl`) the way `server/article-email.ts:365` does — `sendEmail` has no `language` parameter, so localisation is the caller's job.

- [ ] **Step 4: Implement `POST /auth/verify-email`**

Follow `POST /auth/reset-password` line for line. Keep the `/^\d{6}$/` input gate, the expiry check, the `timingSafeEqual` comparison, and the atomic attempt increment:

```ts
          profileData: sql`jsonb_set(coalesce(${users.profileData}::jsonb, '{}'::jsonb), '{_verifyAttempts}', to_jsonb(coalesce((${users.profileData}->>'_verifyAttempts')::int, 0) + 1), true)::json`,
```

On success, strip the four `_verify*` keys by destructure (as the reset flow strips `_reset*`) and stamp the column:

```ts
        .set({ emailVerifiedAt: new Date(), profileData: cleanProfile, updatedAt: new Date() })
```

guarding the UPDATE with the same `_verifyCodeHash` equality in the `WHERE` so a concurrent second request cannot double-apply, and checking `updated.length !== 1`.

- [ ] **Step 5: Mark Google sign-ups verified**

In `POST /auth/google/native`, where the account is created, set `emailVerifiedAt: new Date()`. Google already requires `payload.email_verified === true` (`web-auth.ts:321`), so these addresses are proven at creation and must never be sent a code.

- [ ] **Step 6: Run the test, then the whole suite, and commit**

Run: `npx vitest run tests/email-verification.test.ts` → PASS
Run: `npm test` → 574+ passing.

```bash
git add server/web-auth.ts tests/email-verification.test.ts
git commit -m "feat(auth): email verification, mirroring the reset flow's hardening"
```

---

### Task 7: Gate capability on verification, never login

An unverified account signs in normally. It cannot link a partner, send a message, or enter a broadcast audience. Blocking *login* would create a lockout failure mode that does not exist today — mail silently not arriving would lock a real user out.

**Files:**
- Modify: `server/_core/trpc.ts` (add the procedure guard beside `ownerProcedure`, ~line 210)
- Modify: `server/routers.ts` (apply it to `family.invitePartner` and the message-send procedure)
- Modify: `server/broadcast-audience.ts` (`matchesAudience`, ~line 147)
- Test: `tests/verified-gate.test.ts` (create)

**Interfaces:**
- Consumes: `users.emailVerifiedAt` (Task 5), stamped by Task 6.
- Produces: `verifiedProcedure` exported from `server/_core/trpc.ts`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { matchesAudience } from "../server/broadcast-audience";

describe("unverified accounts are excluded from broadcast audiences", () => {
  const base: any = { id: 1, deletedAt: null, role: "user", roles: ["user"] };

  it("excludes an unverified user", () => {
    expect(matchesAudience({ ...base, emailVerifiedAt: null }, {})).toBe(false);
  });

  // Presence: the guard must not have become "exclude everyone".
  it("still includes a verified user", () => {
    expect(matchesAudience({ ...base, emailVerifiedAt: new Date() }, {})).toBe(true);
  });

  it("still excludes deleted users", () => {
    expect(matchesAudience({ ...base, emailVerifiedAt: new Date(), deletedAt: new Date() }, {})).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/verified-gate.test.ts`
Expected: FAIL — the unverified user is included.

- [ ] **Step 3: Implement the audience guard**

In `server/broadcast-audience.ts`, in `matchesAudience`, immediately after the existing soft-delete line:

```ts
  if (u.deletedAt) return false;
  // Never message an address nobody has proven reachable: it is the fastest way
  // to damage sender reputation, which is what makes verification work at all.
  if (!u.emailVerifiedAt) return false;
```

Add `emailVerifiedAt?: Date | string | null` to the `AudienceUser` type in the same file.

- [ ] **Step 4: Add `verifiedProcedure`**

In `server/_core/trpc.ts`, beside `ownerProcedure`:

```ts
/**
 * For actions that reach another human — inviting a partner, sending a message.
 * Deliberately NOT applied to login: an unverified user must still be able to
 * sign in and request a new code, or a mail that never arrives locks them out.
 */
export const verifiedProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (!ctx.user.emailVerifiedAt) {
    throw new TRPCError({ code: "FORBIDDEN", code_: undefined as never, message: "email_not_verified" });
  }
  return next();
});
```

> **Implementer note:** match the exact shape of the neighbouring `ownerProcedure` middleware — it is the local convention for throwing and for how `ctx.user` is typed. The snippet above shows intent, not the final syntax; if `ownerProcedure` throws a plain `Error`, do the same, and drop the stray field.

Confirm `ctx.user` carries `emailVerifiedAt`; if the context selects specific columns, add it there.

- [ ] **Step 5: Apply it**

In `server/routers.ts`, change `family.invitePartner` and the message-send procedure from `protectedProcedure` to `verifiedProcedure`. Change nothing else.

- [ ] **Step 6: Run the test, then the whole suite, and commit**

Run: `npx vitest run tests/verified-gate.test.ts` → PASS
Run: `npm test` → 574+ passing. If an existing test breaks because its fixture user has no `emailVerifiedAt`, that is a real signal — add the field to the fixture, do not weaken the guard.

```bash
git add server/_core/trpc.ts server/routers.ts server/broadcast-audience.ts tests/verified-gate.test.ts
git commit -m "feat(auth): gate partner invites, messages and broadcasts on a verified address"
```

---

### Task 8: Admin- and purchase-created accounts are verified on creation

Admins create accounts "however they want", without the new checks. All three creators already bypass `/auth/register` entirely, so Task 4 cannot reach them. The remaining work is trusting them explicitly.

**Files:**
- Modify: `server/db.ts` — `createSpecialistUser` (~line 1124), `createUserFromPurchase` (~line 4086)
- Test: `tests/admin-created-verified.test.ts` (create)

**Interfaces:**
- Consumes: `users.emailVerifiedAt` (Task 5).

- [ ] **Step 1: Write the failing test**

Capture what each creator inserts, rather than grepping the source.

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("../server/fcm", () => ({ sendFcmToOne: vi.fn(), sendFcmToMany: vi.fn() }));
vi.mock("bcryptjs", () => ({ default: { hash: async () => "$2b$10$stub" } }));

const inserts: any[] = [];

vi.mock("drizzle-orm/node-postgres", async () => {
  const chainOf = (rows: any[]): any => {
    const p: any = Promise.resolve(rows);
    p.orderBy = () => chainOf(rows);
    p.where = () => chainOf(rows);
    p.limit = () => chainOf(rows);
    p.returning = () => Promise.resolve([{ id: 1 }]);
    return p;
  };
  return {
    drizzle: () => ({
      select: () => ({ from: () => chainOf([]) }),
      insert: () => ({ values: (v: any) => { inserts.push(v); return chainOf([]); } }),
    }),
  };
});

process.env.DATABASE_URL = "postgres://stub/stub";

const { createSpecialistUser, createUserFromPurchase, createStubFamilyMember } =
  await import("../server/db");

describe("accounts an admin or a purchase creates are trusted", () => {
  it("createSpecialistUser stamps emailVerifiedAt", async () => {
    inserts.length = 0;
    await createSpecialistUser("Spec", "spec@example.com", "hunter2min6");
    expect(inserts[0].emailVerifiedAt).toBeInstanceOf(Date);
  });

  it("createUserFromPurchase stamps emailVerifiedAt", async () => {
    inserts.length = 0;
    await createUserFromPurchase({ email: "buyer@example.com" } as any);
    expect(inserts[0].emailVerifiedAt).toBeInstanceOf(Date);
  });

  // A stub has proven nothing — it exists so a partner can be invited.
  it("createStubFamilyMember does NOT stamp it", async () => {
    inserts.length = 0;
    await createStubFamilyMember({ email: "stub@example.com" } as any);
    expect(inserts[0].emailVerifiedAt).toBeUndefined();
    expect(inserts[0].profileData).toEqual({ _stubAccount: true });
  });
});
```

> **Implementer note:** `createUserFromPurchase` and `createStubFamilyMember` take specific
> argument shapes — read their real signatures in `server/db.ts` and pass what they expect
> rather than the `as any` sketches above.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/admin-created-verified.test.ts`
Expected: FAIL on the first two.

- [ ] **Step 3: Implement**

In `createSpecialistUser`'s `db.insert(users).values({...})`, add:

```ts
    // An admin typed this address in deliberately; there is nobody to verify to.
    emailVerifiedAt: new Date(),
```

In `createUserFromPurchase`'s insert, add:

```ts
    // Stripe already delivered a receipt to this address, so it is proven.
    emailVerifiedAt: new Date(),
```

Leave `createStubFamilyMember` alone — it carries `profileData: { _stubAccount: true }` and is awaiting activation.

- [ ] **Step 4: Run the test, then the whole suite, and commit**

Run: `npx vitest run tests/admin-created-verified.test.ts` → PASS
Run: `npm test` → 574+ passing.

```bash
git add server/db.ts tests/admin-created-verified.test.ts
git commit -m "feat(auth): trust admin- and purchase-created accounts as verified"
```

---

### Task 9: Anonymise on delete

Deletion currently stamps `deletedAt` and keeps everything — name, email, push token. That is why deleted users still export to CSV with their address, and why the freeform `broadcastToRoles` path could still reach one who holds a live token.

**Files:**
- Modify: `server/db.ts` — `deleteUser` (~line 2222)
- Test: `tests/delete-user-guards.test.ts` (extend, from Task 1)

**Interfaces:**
- Consumes: `PROTECTED_USER_IDS` (Task 1).

**Why anonymise rather than purge:** the database has **zero foreign keys** (`SELECT count(*) FROM pg_constraint WHERE contype='f'` → 0). Nothing cascades and nothing blocks. A purge would have to sweep ~28 populated tables, ~22 empty ones, second-order fan-out through `children`/`child_accounts`, and `user_session_versions` — while `revoked_sessions` is hash-keyed and cannot be purged per-user at all. Every future `userId` column would become a silent purge gap. `registration-validation.ts:118-120` already documents anonymisation as the intended behaviour; it was simply never implemented.

- [ ] **Step 1: Write the failing test**

Append to `tests/delete-user-guards.test.ts`. Capture what the UPDATE sets by extending the mock's `update()`:

```ts
// Add near the top, alongside USER_ROWS:
export const updateSets: any[] = [];
// and in the drizzle mock, replace the update stub with:
//   update: () => ({ set: (v: any) => { updateSets.push(v); return { where: () => Promise.resolve([]) }; } }),

describe("deleteUser anonymises", () => {
  it("clears the identifying fields and the push token", async () => {
    updateSets.length = 0;
    USER_ROWS[0] = { id: 777, email: "real@example.com", name: "Real", role: "user", roles: null, deletedAt: null };
    await deleteUser(777);
    const set = updateSets.at(-1);
    expect(set.email).toBeNull();
    expect(set.name).toBeNull();
    expect(set.pushToken).toBeNull();
    expect(set.deletedAt).toBeInstanceOf(Date);
  });

  // Presence: the row must survive. Erasure here is anonymisation, not a purge.
  it("still stamps deletedAt rather than removing the row", async () => {
    expect(updateSets.at(-1)).toHaveProperty("deletedAt");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/delete-user-guards.test.ts`
Expected: FAIL — `set.email` is undefined; only `deletedAt` is written today.

- [ ] **Step 3: Implement**

Replace the final UPDATE in `deleteUser`:

```ts
  // Anonymise rather than purge. The database has no foreign keys at all, so a
  // real purge would have to sweep ~50 tables by hand and every future userId
  // column would become a silent gap. Keeping id/openId/role/createdAt holds the
  // ~28 referencing tables together; nulling the rest is the actual erasure.
  // Clearing pushToken also closes the freeform broadcastToRoles path, which does
  // not filter deletedAt and is harmless today only by luck.
  await db
    .update(users)
    .set({
      email: null,
      name: null,
      pushToken: null,
      profileData: {},
      deletedAt: new Date(),
    })
    .where(eq(users.id, userId));
```

- [ ] **Step 4: Run the test, then the whole suite, and commit**

Run: `npx vitest run tests/delete-user-guards.test.ts` → PASS
Run: `npm test` → 574+ passing.

```bash
git add server/db.ts tests/delete-user-guards.test.ts
git commit -m "feat(delete): anonymise on delete instead of retaining name, email and push token"
```

---

### Task 10: One-off purge script for the 12 probe accounts

Bounded and explicit: twelve ids, listed literally. **Never a pattern match** — a `LIKE '%probe%'` would one day match a real user named Probst.

**Files:**
- Create: `scripts/purge-probe-accounts.ts`
- Test: `tests/purge-probe-script.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const SRC = readFileSync(new URL("../scripts/purge-probe-accounts.ts", import.meta.url), "utf8");
const IDS = [22710024, 22710026, 22710044, 22710045, 22710046, 22710047,
             22710048, 22710049, 22710050, 22710051, 22710052, 22710053];

describe("probe purge script", () => {
  it("targets exactly the twelve known probe ids", () => {
    for (const id of IDS) expect(SRC).toContain(String(id));
  });

  it("never pattern-matches on email", () => {
    expect(SRC).not.toMatch(/LIKE|ILIKE|%probe%|invalid'/i);
  });

  it("refuses to touch protected or live accounts", () => {
    expect(SRC).toContain("PROTECTED_USER_IDS");
    expect(SRC).toContain('"deletedAt" IS NOT NULL');
  });

  it("does not name the Play review account", () => {
    expect(SRC).not.toContain("22710015");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/purge-probe-script.test.ts`
Expected: FAIL — the script does not exist.

- [ ] **Step 3: Implement**

```ts
import "dotenv/config";
import * as db from "../server/db";
import { PROTECTED_USER_IDS } from "../server/db";
import { sql } from "drizzle-orm";

/**
 * One-off removal of the twelve test rows a probe suite wrote to production on
 * 2026-08-08/09/17. All twelve are already soft-deleted; this drops the rows.
 *
 * Ids are listed literally and never matched by pattern: a LIKE '%probe%' would
 * one day match a real person. Every row is re-checked as soft-deleted and
 * unprotected before it goes, so a mistyped id cannot take a live account.
 *
 * NOT a general capability. Ordinary deletion anonymises (see db.deleteUser).
 * Run once, against a fresh backup.
 */
const PROBE_IDS = [
  22710024, 22710026, 22710044, 22710045, 22710046, 22710047,
  22710048, 22710049, 22710050, 22710051, 22710052, 22710053,
];

const CHILD_TABLES: Array<[string, string]> = [
  ["article_reads", "userId"],
  ["capability_usage_events", "userId"],
  ["user_functions", "userId"],
  ["user_authorization_roles", "userId"],
  ["family_members", "userId"],
];

(async () => {
  const d = await db.getDb();
  if (!d) { console.log("no DB"); process.exit(1); }

  for (const id of PROBE_IDS) {
    if (PROTECTED_USER_IDS.includes(id)) { console.error("REFUSING protected id", id); process.exit(1); }
  }

  const check: any = await d.execute(sql`
    SELECT id, email, "deletedAt" FROM users WHERE id = ANY(${PROBE_IDS})
  `);
  const rows = check.rows ?? check;
  console.log("matched rows:", rows.length, "of", PROBE_IDS.length);
  for (const r of rows) {
    if (!r.deletedAt) { console.error("REFUSING live account", r.id, r.email); process.exit(1); }
    console.log("  will purge", r.id, r.email);
  }
  if (rows.length !== PROBE_IDS.length) {
    console.error("id list does not match the database; refusing to guess");
    process.exit(1);
  }

  for (const [table, col] of CHILD_TABLES) {
    const res: any = await d.execute(
      sql`DELETE FROM ${sql.identifier(table)} WHERE ${sql.identifier(col)} = ANY(${PROBE_IDS})`,
    );
    console.log("  cleared", table, res.rowCount ?? 0);
  }

  const del: any = await d.execute(
    sql`DELETE FROM users WHERE id = ANY(${PROBE_IDS}) AND "deletedAt" IS NOT NULL`,
  );
  console.log("purged users:", del.rowCount ?? 0);

  const after: any = await d.execute(sql`SELECT count(*)::int AS n FROM users`);
  console.log("users remaining:", after.rows?.[0]?.n ?? after[0]?.n, "(expect 83)");
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
```

- [ ] **Step 4: Run the test, then the whole suite, and commit**

Run: `npx vitest run tests/purge-probe-script.test.ts` → PASS
Run: `npm test` → 574+ passing.
Do **not** execute the script. That is Task 11, after a backup.

```bash
git add scripts/purge-probe-accounts.ts tests/purge-probe-script.test.ts
git commit -m "chore(cleanup): one-off purge script for the twelve 2026-08 probe rows"
```

---

### Task 11: Deploy — MAIN SESSION ONLY

**Do not delegate this task to a subagent.** It touches production data and the running service.

- [ ] **Step 1: Full suite green locally**

Run: `cd /Users/farouqabouumar/Development/rabbaanie-api-account-integrity && npm test`
Expected: 47 files, 574 + new tests, zero failures.

- [ ] **Step 2: Run the 9-stage review pipeline from `CLAUDE.md`**

Including `cubic review --base <base-sha> --json` to **two consecutive rounds with no new P0/P1**. Cubic cannot converge while anything else writes to the tree.

- [ ] **Step 3: Push**

```bash
git push git@github-fitrah:talibfitrah/rabbaanie-api.git master
```

The default SSH key is rejected by GitHub; this alias is required.

- [ ] **Step 4: Back up the production database, and verify the backup is non-empty before continuing.**

- [ ] **Step 5: On the VM — pull, then run the migration BEFORE restarting**

```
git pull
npx tsx scripts/add-email-verified-column.ts
```

**Order is load-bearing (ledger ruling R1).** Once the new code is live, drizzle's
`select()` on `users` includes `email_verified_at` in the SELECT list. Restart before the
column exists and EVERY user query fails with "column does not exist" — a total outage, not
a degradation. The migration script uses raw `d.execute(sql...)` only, so it runs safely
against the old running code.

Read its output: it prints the unverified count before and the verified count after. All 83
live users must come back verified, or Task 7's guard drops everyone from every broadcast.

- [ ] **Step 6: Now build, restart, and purge**

```
npm run build && pm2 restart rabbaanie-api
npx tsx scripts/purge-probe-accounts.ts
```

The purge prints every row it will take and ends with `users remaining: 83`. If it prints
anything else, stop.

Read the output of each. The migration prints the unverified count before and the verified count after; the purge prints every row it will take and ends with `users remaining: 83`. If either prints something else, stop.

- [ ] **Step 7: Verify against the live API, not against the code**

- `curl -s -o /dev/null -w '%{http_code}' -X POST https://api.rabbaanie.com/auth/register -H 'content-type: application/json' -d '{"firstName":"A","lastName":"B","email":"x@example.invalid","password":"hunter2min6"}'` → expect **400**
- The app admin list and the web dashboard both show **83**, and agree with each other.
- The Play review account still exists and can still sign in.

---

## Self-Review

**Spec coverage:** §3.1 → Task 2. §3.2 → Tasks 3, 4. §3.3 → Tasks 5, 6, 7. §3.4 → Tasks 1, 9, 10. §3.5 → Task 8. §3.6 → Task 5. §4 verification → every task's test step plus Task 11. §6 follow-ups → not implemented by design.

**Known gap, stated rather than hidden:** the spec's §3.3 assumes somewhere for a user to enter the code. This plan ships the endpoints only. The in-app screen needs a client release and is **not** in this plan — the web page and the client screen should be a follow-on plan in the client repo. Until then verification is enforced but unreachable from the app, so **do not deploy Task 7's gating before that exists** — Tasks 1-6 and 8-10 are safe to ship without it.

**Type consistency:** `PROTECTED_USER_IDS` (Task 1 → 10), `emailVerifiedAt` (Task 5 → 6, 7, 8), `checkEmail`/`emailRejectionMessage` (Task 3 → 4), `verifiedProcedure` (Task 7). Names match across tasks.
