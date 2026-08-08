# Usage tracking — design

**Date:** 2026-08-08
**Status:** approved autonomously (no interactive reviewer available in this execution — see note at end)

## The ask

The scholar: «ما هي الإمكانيات التي يمكننا أن نستفيد فيها من وراء الكواليس… لنتفاعل معها في تسيير وتحسين شؤون كل مستخدم على حدة وكجماعات» then, choosing scope: «ابدأ بهما معًا وأتقنهما» — do both, and perfect them. He wants, per user: which capabilities they've never touched, and where they stopped — to drive an in-app + email "here's what you're not using" message. Bar stated explicitly: a half-instrumented feature that silently misses events is worse than none.

## What exists (verified live, not assumed)

- `users` has `lastActive`, `lastSignedIn`, `onboardingCompleted` — account-level only, no per-feature signal.
- `audit_log` (`server/audit.ts`) logs **admin** actions (who changed what) — a different concern; left untouched.
- Production source of truth is `/home/murabbie/rabbaanie-api`, read directly over SSH for every claim below (`server/routers.ts`, `server/_core/trpc.ts`, `server/_core/index.ts`, `server/_core/context.ts`, `server/advice.ts`, `server/child-monitoring-router.ts`, `server/community-router.ts`, `server/admin-panel.ts`, client call sites under `app/`).

## Chokepoint hunt

Three separate auth surfaces exist, not one:

1. **`server/_core/trpc.ts`** — `requireUser`, a `t.middleware` behind `protectedProcedure`. `adminProcedure` / `ownerAdminProcedure` / `ownerProcedure` are three *separate* inline middlewares (not chained on `requireUser`), each independently role-gating staff actions (moderation, subscription/coupon grants, user deletion). Every family-facing capability I could find — all 6 sub-routers in `child-monitoring-router.ts` (28 procedures) and all 6 in `community-router.ts` (31 procedures), plus the bulk of `routers.ts` itself — is `protectedProcedure`, never the role-gated ones. The role-gated procedures are back-office, already covered by `audit_log`. **Decision: hook only `requireUser`.** Scoping in the role-gated procedures would mix staff activity into "what a family hasn't tried yet," which is a different question the scholar already has an answer for.
2. **`requireSessionUser`**, a plain Express middleware in `_core/index.ts`, guards 3 of 6 `/api/subscription/*` REST routes. Not hooked — subscription status isn't a discoverable "try this" capability, and the two unguarded routes (checkout, redeem-coupon) don't reliably carry identity either.
3. **`requireAdminAuth`**, guarding `admin-panel.ts`'s 47 raw `/admin-api/*` routes. Out of scope — same reasoning as (1).

**Web dashboard is covered for free.** `web-dashboard.ts` has exactly 2 Express routes (serving the SPA shell); its embedded client JS funnels every data call through one helper hitting `/api/trpc/...` with `credentials: 'same-origin'`. Same chokepoint, same middleware, no separate hook needed.

## Named blind spot — the AI-advice REST endpoints

`/api/advice/{weekplan,quicktips,general,treatment}` are almost certainly the app's most-used feature, and are unreachable from this chokepoint:

- Their tRPC procedures are `publicProcedure` (verified in `advice.ts`), so `requireUser` never runs for them.
- The Express wrappers in `_core/index.ts` call `adviceRouter.createCaller({} as any)` — a deliberately empty context.
- Their Zod input schemas carry no `userId`/`childId` at all (just client-supplied profile data).
- The mobile client (`app/child/weekplan.tsx`, `app/(tabs)/personal-advice.tsx`, `app/child/[id].tsx`) sends only `Content-Type: application/json` — no `Authorization` header, unlike every other authenticated call site in the app (which do carry `Authorization: Bearer <token>`, e.g. `lib/_core/api.ts`, `lib/trpc.ts`).

There is **no user identity available server-side today** for these four calls, short of a client change shipped in a new APK — out of scope for a backend-only, additive task. `getSpouseAdvice` is the one advice procedure on `protectedProcedure` with a real `createContext()` call, so it *is* covered — if the native fetch's cookie jar carries the session cookie set at login (plausible; RN's native networking auto-attaches cookies, unlike a bare JS `fetch`). `/api/advice/translate` (raw handler, no tRPC, no identity) is the same class of gap. `/api/support/chat` resolves no identity today either.

**Consequence for correctness, not just coverage:** all 5 of these share the tRPC top-level capability tag `advice` (see below). Because `getSpouseAdvice` alone is tracked, an `advice` event *can* exist — so its absence for a given user is not a reliable "never used advice" signal; they may have used weekplan/quicktips/general/treatment heavily and it would look identical to never having touched any of it. Silently shipping this as a trustworthy "never used" entry is exactly the failure mode the scholar ruled out. Handled below, not hidden.

**`/api/feedback`** already resolves `getSessionUser(req)` itself (opportunistic attribution, existing code). Free, in-pattern, one line: hooked directly. **`/api/support/chat`** resolves no identity today and is not touched — adding identity resolution there is new auth logic in a handler that has none, a different and larger change than "add a tracking call."

## Mid-task constraint from the scholar (addressed)

No message bodies, question text, analysis excerpts, or problem descriptions in any event row. No free-text/metadata/JSON column at all — not "empty for now," structurally absent, so there is no field for content to drift into later. The "never used" answer is capability name + timestamp, nothing richer. Concretely: the new table has exactly 4 non-identity columns (`capability`, `surface`, `createdAt`, `id`); the query functions return capability/timestamp shapes only.

## Schema (additive only, one new table)

Naming avoids collision with the **pre-existing, unrelated** `childAppUsageRouter` / `db.logChildAppUsage` (parental screen-time monitoring of a child's own device — a different feature entirely).

```sql
CREATE TABLE IF NOT EXISTS capability_usage_events (
  id serial PRIMARY KEY,
  "userId" integer NOT NULL,
  capability varchar(64) NOT NULL,
  surface varchar(16) NOT NULL DEFAULT 'app',
  "createdAt" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_capability_usage_user_cap
  ON capability_usage_events ("userId", capability, "createdAt");
```

No FK constraint on `userId`, matching this codebase's existing convention (`feedback`, `subscriptions` — see `scripts/create-feedback-table.ts`, `scripts/create-sub-tables.ts`); ownership enforced at the application layer like every other table here.

**Applied via the same one-off `scripts/create-<thing>-table.ts` + matching hand-written `pgTable` in `drizzle/schema.ts` convention** used for `feedback` and `subscriptions` — verified by reading both scripts directly. (A sibling design doc from earlier today claims `drizzle-kit push` is the live mechanism; I did not verify that path and it diffs the *entire* schema file against the live DB in one shot, which is a bigger blast radius than this task's "additive and safe" constraint tolerates. The narrower, directly-verified `CREATE TABLE IF NOT EXISTS` script touches exactly one new table and nothing else — used deliberately instead.)

No rollup/aggregate table, no retention job, no cron. At ~50 users this is a few thousand rows a month; a raw append-only log answers both required questions directly by query. Revisit only if row count actually becomes a problem — not before.

## Capability naming: derived, not hand-tagged

`capability = path.split(".")[0]` — the top-level key of whichever router the call belongs to (`childAiChat`, `customTasks`, `neighborhood`, `children`, …), read from tRPC's own middleware `opts.path`. Zero maintenance: any procedure added to an existing or new sub-router under `protectedProcedure` is captured automatically, by construction — this is what "covered by default" means in practice, not a lookup table someone has to remember to update. Friendly display names for the eventual message feature are that feature's concern, not this one's.

**The catalog problem this creates:** "never used" needs to know the full set of capabilities that *could* be used, not just what's been observed — a brand-new feature nobody has tried yet must still be diffable, which rules out deriving the catalog from `DISTINCT capability` in the events table (it would never contain an untried feature, so it could never be reported as unused — a bootstrapping contradiction for exactly the case that matters most).

Fix: derive the catalog from `appRouter`'s own definition (the same object `_core/index.ts` mounts), same top-level-segment rule as above, **minus** a short explicit exclude list seeded from what I directly confirmed is not an end-user capability: `auth` (both its procedures are `publicProcedure` — would show as "never used" for literally every user, always, meaningless), `admin` (staff), `system` (infra). Opt-out, not opt-in — a new top-level router is included by default the moment it exists; someone has to deliberately exclude it, not deliberately remember to add it. Exact runtime shape of `appRouter`'s internals gets nailed down with a real assertion in the test, not assumed.

## The two required questions, one building block

- `getUserCapabilityUsage(userId)` → `{ capability, firstUsed, lastUsed }[]`, one row per capability the user has actually touched (`GROUP BY capability`).
- `getUnusedCapabilities(userId)` → known catalog minus the above → `string[]`. Direct input to "what you're not using." Excludes `advice` by default (see blind-spot section) via a small `UNRELIABLE_CAPABILITIES` constant with a comment explaining exactly why, not a silent filter.
- `getLastActiveCapability(userId)` → the single capability with the max `createdAt` — a direct, named answer to "where did you stop," not left for a caller to infer from the timeline.

## Instrumentation

One call inside `requireUser`, after `ctx.user` is confirmed present, before `next()`. Fire-and-forget (not awaited on the request's critical path — this runs on every authenticated call in production, and a synchronous extra DB round trip on 140+ procedures is not free), errors caught and warned exactly like `logAudit` already does, so a tracking failure can never fail or slow down a real request. Surface tag (`'app' | 'web'`) read from a header the two clients already differ on, defaulting to `'app'` — not exposed in the "never used" answer shape, kept only so I can prove both surfaces actually fire (verification step), matching the scholar's "don't build surveillance" instruction to the letter: it says how, never what.

## Addendum: article reads (scope extension, mid-task)

The scholar extended the brief mid-task: which public-site article was read, when, and from what country/city, for **registered and anonymous** readers alike. Absorbed into this design rather than built as a second, parallel system — same privacy posture (record that + when + coarse where, never content, never an IP), different storage shape, because the two are genuinely different data:

- **Actor model, decided now because it's cheap now:** `capability_usage_events.userId` stays `NOT NULL` — it was never meant to cover anonymous traffic; every consumer in the original brief is about a known, registered user's own capability usage. The new `article_reads.userId` is **nullable** — null means an anonymous website visitor — because that table's whole reason for existing is to also count the visitors `capability_usage_events` structurally cannot. No synthetic visitor id: the ask needs article + when + coarse geo, not visitor-level dedup.
- **Storage shape:** `capability_usage_events` upserts (one row per user×capability, because repeat touches add nothing new). `article_reads` is a raw event log, one row per read — the value here is specifically the individual read's time and place, not just "did they ever read an article."
- **Geography, verified live (not assumed):** the site sits behind Cloudflare → a Synology NAS reverse proxy (TLS termination) → this VM's nginx → Express. `cf-ipcountry` and `cf-connecting-ip` both survive that full chain (confirmed via a temporary header-echo route, hit externally, then removed). Cloudflare's tier in use does **not** provide a city header, so city comes from a local, offline lookup (`geoip-lite`, no network call, no new external dependency at request time) keyed on `cf-connecting-ip` — never on the NAS's own IP. The raw IP is read into a local variable inside `deriveGeoFromRequest` and never returned, logged, or stored.
- **Privacy-safe aggregation, the hard part:** the scholar's ruling ("suppress cells below ~5, roll up to country") is about **readers**, not **reads** — this table stores one row per read on purpose, so counting rows per city would let one person re-reading the same article repeatedly cross a raw-count threshold and get named, which is exactly the single-reader disclosure the rule exists to prevent (caught by cubic review, fixed before ship). `getArticleReadGeoBreakdown` counts **distinct `userId`** per city for registered reads, and only breaks a city out at ≥5 distinct readers; anonymous reads have no verifiable distinct-reader signal in this design and are **always** rolled up to country-only, regardless of count. Country alone is never suppressed (the scholar's ruling treats country as safe).
- **The AI advisor exception:** confirmed to need no design change — this table doesn't gate or restrict any read path, including the advisor's; it only records that a *public-site* article was read, a different surface entirely.
- **Chokepoint:** the site is static HTML with no per-request backend involvement (nginx serves it directly), so there is no tRPC-style single choke point to hook. Instead: the one client-side function that opens an article (`openArt(id)` in `site/index.html`) fires a single `fetch` beacon to a new `POST /api/article-read`, matching the file's own existing `fetch(API+"/api/...")` convention. That endpoint validates the article actually exists and is published (reusing the same `getContentById` lookup `/api/public/article/:id` already uses) before recording anything, both to keep `articleId` unambiguous (two tables in this schema model "articles") and to raise the bar on trivial abuse of a necessarily-public, unauthenticated endpoint.
- **Not implemented:** full rate-limiting on `/api/article-read` (judged disproportionate infrastructure at this site's real traffic scale; the existence check is the proportionate mitigation) and any admin-facing view of `getArticleReadGeoBreakdown` (no caller yet — same "data foundation, not the feature" scoping as the rest of this brief).
- **Deploy note:** `site/index.html` is the source; publishing it to the live `www.rabbaanie.com` requires `scripts/deploy-www.sh`, which needs sudo — a human step, not something this task could complete unattended. The change is verified against the API-served preview path (`/site`) via a real browser click-through, with a confirmed correct live database row (country + city, no IP), but is **not live on the public domain** until that script is run.

## Explicitly out of scope

- Fixing the advice-endpoint identity gap (needs a client change + new APK release — a different, larger task).
- `/api/support/chat` identity resolution (no existing hook to reuse; would be new auth logic, not a tracking call).
- The actual "what you're not using" message (in-app + email) — this task is the data foundation it reads from, not the message itself.
- Any admin/moderator action — already served by `audit_log`.
- Rollups, retention, dashboards — not justified at 50 users.

## Process note

Ran via `superpowers:brainstorming` as instructed, but this execution has no live interactive reviewer to volley questions with one at a time — I'm an autonomous subagent working from a written brief plus one mid-task steering message. Worked through the 5 open decisions the brief itself posed using the evidence gathered above rather than stalling on unanswerable clarifying questions, picked one option for each with reasons (not a hedge), and I am presenting the result here for the coordinator/scholar to correct if any call is wrong, rather than blocking on a review gate no one is available to clear.
