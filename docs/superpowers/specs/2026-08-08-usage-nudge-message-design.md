# "What you're not using" message — design

**Date:** 2026-08-08
**Status:** approved autonomously (no interactive reviewer available in this execution — same constraint and same resolution as the sibling `2026-08-08-usage-tracking-design.md`, see its own process note)

## The ask

The scholar: «أريد أن يتفاعل رباني عن طريق التطبيق مع المستخدم فيما لا يستخدم من إمكانية، فيطلعه على الأمور التي لا يستخدمها وكيفية استخدامها وأهمية استخدامها. يريد حساب برسالة كاملة شاملة موجزة، وذلك عبر التطبيق وعبر الإيميل» — one message per account, complete/comprehensive/concise at once, in-app and by email, showing unused capabilities, how to use them, why they matter.

The data foundation (`server/capability-usage.ts`, `getUnusedCapabilities`/`getLastActiveCapability`) shipped earlier today — this task builds the message on top of it. It was NOT modified.

## The شاملة/موجزة tension — resolved by ranking, not by compression

A wall of every unused feature fails the "concise" half. Compressing real content into fragments fails the "comprehensive" half. Resolution: rank a user's unused capabilities by a fixed, hand-authored priority order, show the top 3 in full (name + how + why), and fold anything beyond that into one summary line ("+N more"). At the catalog size this ships with (below), the fold rarely even triggers — most users see everything relevant to them, in full, and it's still short.

## Named blind spot, found by reachability audit — the catalog had to shrink from 20 to 4

`getUnusedCapabilities` returns candidates from 20 tRPC top-level routers (26 known minus 6 already-`UNRELIABLE_CAPABILITIES`). Before writing a single line of "how to use it" copy, every one of the 20 was checked against the **actual shipped client** (this repo's `app/`, which is what real installs run) for two independent failure modes a coarse tRPC-path tag cannot see:

1. **Build-time-disabled.** `CHILD_MONITORING_ENABLED` (`lib/distribution.ts`) is `isGithubBuild` — **false on every Play Store install**, which is effectively all 50 users (github/sideload builds are the rare exception). It gates all navigation into `child-account/*` (verified in `app/(tabs)/index.tsx`, `family.tsx`, `weekly.tsx`, `messages.tsx`). That build-time flag is not visible server-side per user, so a capability behind it can never be safely recommended to an arbitrary user without risking "go try a button that isn't in your app." Removes: `childAccount`, `customTasks`, `familyChat`, `childSummary`, `childAiChat`, `childAppUsage`.
2. **No UI entry point at all**, verified by grepping every `trpc.<router>.` call site in `app/`: `neighborhood`, `peerGroups`, `familyActivities` live only under `app/community/*`, and `app/_layout.tsx` registers `community` as a bare `<Stack.Screen>` with **zero** `router.push`/`Link` anywhere in the app pointing at it — dead screens, reachable by nobody. `environment` and `parentAiConsult` have no client call site whatsoever. `sharedUpdates` is both child-monitoring-gated and narrow (divorced co-parents only) — excluded rather than built for an audience of ~0 verifiable users. `translate` auto-fires when viewing shared content in another language; it is not a self-directed action, so "go use Translate" has no coherent instruction. `messages` (the `messagesRouter`, family-broadcast messaging) is real code but the client only ever calls its `totalUnread`/`markDirectRead` procedures — `send`/`list` have no caller anywhere in `app/`; the actual co-parent chat UI in `app/(tabs)/messages.tsx` runs entirely through `links.sendDirectMessage`, a different top-level capability.

**A second, subtler failure mode, found the same way and just as important:** two of the remaining candidates looked safe by (1) and (2) but aren't, for the opposite reason — `children` and `goals` are tracked via their normalized-table tRPC procedures (`children.add`/`goals.update`), but the app is local-first (confirmed in `lib/app-context.tsx`): children/goals data lives in `users.profileData` (a JSON blob) synced through `profile.save`/`profile.get` via a **raw `fetch()` with a proper `Authorization: Bearer` header** — a different endpoint than the one the capability tag is watching. A user who has added five children and tracked goals for months would still show `children`/`goals` as "never used," because the granular table those procedures write to is a mostly-dead parallel path (`children.deleteByNameBirth` is the one exception — fires only on deletion). Recommending "add your children!" to a parent who obviously has some, verifiably wrong in the exact direction the scholar ruled out first ("a half-instrumented feature... is worse than none"), was avoided by excluding both.

**What survived, verified reachable in the current Play Store build, with a real client entry point:** `profile`, `links`, `family`, `specialist`.

**Residual, accepted risk (documented, not hidden):** `links` (`syncWithPartner`) and `specialist` (`registerPushToken`, reused for the app's generic push-token registration) both have a background call site that fires automatically — `autoSyncWithPartner()` on every app open (`app-context.tsx`) and the app-wide push hook (`hooks/use-push-notifications.ts`, mounted in root `_layout.tsx`) respectively. Their "unused" signal is therefore biased toward **false negatives** (looks used when it wasn't a deliberate action) — the safe direction of error, since it only makes the system quieter, never wrong. Copy for these two is phrased as an invitation ("have you tried...") rather than an assertion ("you haven't..."), so even a mistaken trigger reads as a suggestion, never an inaccurate claim.

No relevance gating by marital status / child count was needed — all four surviving capabilities are relevant to every parent account, so that machinery (considered mid-design) was dropped as unneeded complexity.

## Reachability copy accuracy

Each capability's "how to use it" line names the real screen/button, verified by reading the actual call site, not guessed from a router file comment:
- `profile` → Settings screen, save profile (`app-context.tsx` `syncToServer`).
- `links` → the "Berichten"/Messages tab, share/enter partner ID (`app/(tabs)/messages.tsx`, `ParentsSection`).
- `family` → same tab's "Rechten"/Permissions section, visible once a partner is linked (`CoParentPermissions` in `messages.tsx`).
- `specialist` → the AI-advisor chat's "📖 Contact a specialist / scholar" option (`app/ai-chat.tsx:1424`, also `personal-advice.tsx`), which pushes `/find-specialist`.

## One message per account, ever — not a recurring cadence

The scholar's own words are singular ("رسالة" — a message, not "messages every week"). Building a recurring cron is unrequested scope (YAGNI) and reopens exactly the spam risk the constraints warn about. Design: a new table records that the message was sent; the send script only ever considers accounts with no row yet. Re-running the script is always safe — already-sent accounts are a no-op, never-sent or previously-failed accounts get (re)tried. If the scholar wants a later periodic nudge, that's a small follow-up (relax the skip condition to a cooldown window) — not built now.

### Table (additive, one new table, same convention as `capability_usage_events`/`article_reads`/`feedback`)

```sql
CREATE TABLE IF NOT EXISTS capability_nudge_sends (
  id serial PRIMARY KEY,
  "userId" integer NOT NULL UNIQUE,
  capabilities varchar(255) NOT NULL,
  "appSentAt" timestamptz,
  "emailSentAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
```

No FK, matching this codebase's established convention for `userId` columns. `capabilities` stores the comma-separated capability keys actually shown (e.g. `"links,specialist"`) — non-content metadata, the same class of information `capability_usage_events.capability` already stores; no message text, no free-form field, matching the sibling design's binding privacy rule.

**Row lifecycle, decided to make "never send twice" a DB-level guarantee, not an application-level promise:** a row is inserted **only after the email send succeeds** (email is the channel every one of the 50 users can receive — confirmed live, `users.email` is 100% populated). `appSentAt` is set only if the push notification actually succeeded (has a token, FCM accepted it) — 6 of 50 users currently have a push token; the other 44 get the email half only, which is correct, not a bug, given no token exists to push to. If the email send fails (Brevo error/timeout), no row is written and that user is retried automatically on the next run. The unique constraint on `userId` makes a double-send impossible even under a concurrent/accidental double-run.

A user with zero (surviving-catalog) unused capabilities is skipped with no row written — nothing was sent, so nothing needs to be remembered; if a future catalog addition gives them something new to hear about, they remain eligible.

## Content — deterministic, human-authored, no LLM call

Per the hard constraint, every string is hand-written and stored in a plain object, keyed `capability -> language -> {name, how, why}` for the 4 surviving capabilities in `ar`/`nl`/`en`. Rendering is pure string interpolation — no template engine, no generation, nothing that could hallucinate a feature that doesn't exist. `users.language` (`ar`/`nl`/`en`, default `nl`) selects the language; unrecognized/null falls back to `nl`, matching the existing `tx()` convention used everywhere else in this codebase.

**Priority order** (fixed array, not a scored algorithm — 4 items doesn't justify a scoring system): `profile`, `links`, `specialist`, `family`. Reasoning: `profile` and `specialist` need nothing else to act on immediately; `links` is high-value and a prerequisite for `family`, so it's surfaced first when both are unused.

## Delivery — reusing exactly what exists, nothing new

**Email:** `sendEmail({to, subject, html})` from `server/_core/email.ts` (Brevo, already configured and verified live — `BREVO_API_KEY` set). HTML matches the existing minimal inline-style convention seen in `family.invitePartner`'s email (`#1B4332` brand green heading, Arial, 480px max-width, `escapeHtml()` from `server/admin-2fa-challenge.ts` for any interpolated name) — one language per email (the recipient's), not the bilingual stacking that one example used, matching `sendLocalizedPush`'s per-user single-language pattern instead.

**In-app:** push notification via `sendPushNotification(userId, title, body, data)` from `server/db.ts` — the same FCM path every other automated/system notification in this codebase already uses (co-parent activity notices, admin broadcasts). **The `messages` table was deliberately NOT used** — proven above to have no reachable "inbox" UI for anything but real co-parent chat threads (`links`-scoped), so a system-authored row would be silent, unreachable dead storage, which is worse than not persisting it at all. Push title is a short hook; body names the #1 ranked capability + "+N more" if applicable — full detail lives in the email, which has no length constraint. `data: { type: "usage_tips" }` carried for future deep-linking, consistent with how other notifications already carry an unconsumed `data.type` before client support exists.

## Error handling

- Missing push token → `sendPushNotification` already returns `false` without throwing (existing behavior, unchanged); `appSentAt` stays null.
- Brevo failure/timeout → `sendEmail` already returns `false`/warns, non-throwing; the send script does not write the row, user retried next run.
- A user with an unparseable/unexpected `language` value → falls back to `nl` (never throws, never blocks the batch).
- One user's failure must never abort the batch — the script loops per-user with its own try/catch per iteration (mirrors `broadcastLocalizedPush`'s existing per-item resilience).

## Testing

Pure functions (`selectCapabilitiesForUser`, `renderPushMessage`, `renderEmailHtml`/`renderEmailSubject`) get direct unit tests — no DB, no network, matching TDD. The DB-touching parts (row-exists check, insert-after-email-success) follow the proven seam already used in `tests/capability-usage-db.test.ts` (mock `drizzle-orm/node-postgres`'s `drizzle()` call, not `../server/db`). `getUnusedCapabilities` itself is not retested — it's the existing, already-tested foundation this task consumes as-is.

## Explicitly out of scope

- Any relevance/marital-status gating (dropped — unneeded once the catalog narrowed to 4 universally-relevant capabilities).
- A recurring/periodic re-send cadence (one message per account, per the scholar's own singular framing; trivial follow-up if wanted later).
- Retrying a previously-failed push for a user who *later* registers a token (documented as a clean, small follow-up — not built now).
- Fixing the `children`/`goals`/`links`/`specialist` tracking blind spots inside `capability-usage.ts` itself (this task consumes that module as-is; the findings above are worth relaying back to whoever owns it next, but changing its instrumentation is a different task).
- An unsubscribe/preference mechanism for the email (disproportionate for a single one-time message, not a recurring campaign).

## Process note

Ran via `superpowers:brainstorming` as instructed. Same as the sibling design earlier today: no live interactive reviewer exists in this execution to volley clarifying questions with one at a time. Spent the exploration budget instead on verifying every claim against the real, shipped client and the live database rather than trusting the router file's own naming/comments — which is what caught the build-flag gate, the two dead-UI groups, and the local-first blind spot before any copy got written. Presenting the result here for the coordinator/scholar to correct if a call is wrong, rather than blocking on a review gate no one is available to clear. Nothing is sent to a real user until an explicit go-ahead — the dry-run and single-account (`userId=1`, the scholar's own) live test described in the report satisfy "prove it" without that gate.
