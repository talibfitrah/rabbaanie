# Specialist impact measurement — design

**Date:** 2026-08-08
**Status:** approved autonomously (no interactive reviewer available in this execution — see note at end)

## The question

The scholar: «أثر عمل المتخصص: هل تحسّنت حال الأسرة بعد متابعته أم لا. اليوم نعرف أنه تابع، ولا نعرف النتيجة»
— we know the specialist followed up; we don't know the result.

## Data reality (verified live, not assumed)

- 36 families, 48 children — real.
- `specialist_profiles`: **exactly one row** (id=1). Its `userId` is **user 1, "Suhayb Salam" (daa3iyah@gmail.com), role `super_admin`**, with `specialist` as one of several roles. `rating`/`ratingCount` are both empty (`null` / `0`) — nothing in the codebase writes to them, confirmed by grep across `server/`.
- `specialist_assignments`: **0 rows.** `treatment_plans`: **0 rows.** `specialist_notes`: **0 rows.**
- `messages`: 148 rows total, and **all 148** are between user 1 (the specialist) and one parent (user 3870001) — 122 specialist→parent, 26 parent→specialist. This is the real "follow-up" the scholar means. It happened entirely over free-form direct messaging, **not** through the assignment/treatment-plan feature, because `specialist.sendMessage` only requires the target to be an available specialist (`assertAvailableSpecialist`) — no assignment needed.

This changes the brief's framing from "one specialist with data" to "one specialist with a real relationship that the structured tables don't see at all." Any measure anchored purely to `specialist_assignments` / `treatment_plans` would be silent for the one case that exists today. `specialist_assignments` is still the right long-term anchor (it is the only table that models "this specialist is responsible for this family," and every other specialist feature already gates on it via `hasActiveSpecialistAssignment` / `assertActiveSpecialistFamily`) — so the fix is a one-time data step: back-fill an assignment row for the real 1↔3870001 relationship via the existing `adminAssignFamilyToSpecialist` admin function, not new "did they ever message" detection code.

## Mid-task constraint from the scholar (addressed below)

Owner/admin may not read a user's private content (analysis body, question text, treatment/problem detail) without the user's own consent. Aggregate numbers are fine. Consequence: the outcome record must be **score/status/date only** — no free text, no summary of the family's situation. This directly ruled out a `comment` field the design initially included; it was cut.

## Options considered

1. **Before/after self-assessment**, two separate timestamped surveys (at assignment, and again later). Most rigorous *if* both are answered, but needs two touchpoints and the second is exactly the one families skip — the brief calls this out explicitly.
2. **Plan follow-through** — % of a treatment plan's `goals` (`{text, completed}[]`, already a column) marked done. Free — the field already exists and the update mutation already accepts it. But completion is compliance, not benefit: a specialist can set trivial goals, or a family can tick every box and still be no better off. Also: today it is not just sparse, it is **empty** (0 treatment plans exist), so it cannot carry the primary signal.
3. **Parent's own judgement.** `rating`/`ratingCount` exist on `specialist_profiles`, documented as "cached average," and are already rendered read-only in the specialist dashboard client (`app/specialist/dashboard.tsx:427`, shows "—" today) — so there is a read path waiting for data that nothing produces.

## Decision: parent-reported outcome, asked once per visit, repeatable over time

Primary measure: a single structured question, answerable any time by a family member with access to the family, about a specialist with an active or completed assignment to them —

> *Compared to when this specialist started following up with your family, how are things now?*
> 1 = much worse, 2 = somewhat worse, 3 = about the same, 4 = somewhat better, 5 = much better.

Stored as an **append-only** row (`specialistId`, `familyId`, `respondentId`, `outcome` 1–5, `createdAt`) — no upsert, no free text. Multiple submissions over time are allowed on purpose:

- The **latest** submission per respondent is the "current" reading (one vote per person, resubmitting doesn't let one person dominate the average).
- The **first vs. latest** across a family's history gives a genuine before/after trend without ever requiring a mandatory two-step survey — the same question asked once early and once later *is* a before/after, without forcing it.

This directly answers the scholar's question in the respondent's own words, is structured by construction (satisfies the mid-task privacy ruling with no extra gating needed), and required zero new consent machinery.

`specialist_profiles.rating` / `ratingCount` become a **cache** of this table (average and count of each respondent's latest rating, per specialist) — populated on every submission. This is not a parallel mechanism; it is the single existing "cached average" column finally being fed by its one source of truth, which also make the dashboard's dead "—" start showing something.

Secondary, clearly-labeled-separate measure: **goal completion %**, computed live from `treatment_plans.goals` (already-existing data, zero new capture). Surfaced only as a number (e.g. "12/15 goals completed"), never the goal text — this is deliberate, both because completion ≠ benefit and because goal text falls under "treatment/problem detail" in the scholar's privacy ruling.

## What this does NOT prove

Stated explicitly in the query's own response, not just in this doc, so no consumer can miss it:

- It is the parent's *perception*, not an independent clinical measure — courtesy bias is real, and a parent may rate generously out of politeness.
- It cannot separate the specialist's effect from everything else happening in the family's life in the same period.
- Goal completion measures follow-through on what was prescribed, not whether it helped.
- At small sample sizes (today: one specialist, a handful of families at most), an average is not a signal — the query refuses to present one below a minimum count and says so, rather than shipping a confident-looking number.

## Schema (additive only)

New table `specialist_outcome_ratings`:

```
id            serial PK
specialistId  integer not null
familyId      integer not null
respondentId  integer not null
outcome       integer not null   -- 1..5
createdAt     timestamp default now() not null
```

No changes to any existing table's columns. Applied via `drizzle-kit push` (this schema's actual mechanism in production — the migration journal is already stale relative to `schema.ts`; several live tables, e.g. `feedback`, `subscriptions`, have no matching migration file, confirming push-based, not generate+migrate-based, workflow).

## API surface (server only — no client screens in this task's scope)

- `specialist.submitOutcome({ specialistId, outcome })` — mutation. Caller must be a family member (not the specialist being rated) with an active-or-completed assignment to that specialist. Writes one row, recomputes the specialist's cached `rating`/`ratingCount`.
- `specialist.impact()` — query, specialist-facing (`ctx.user.id` as the specialist). Per-family latest score + trend, specialist-wide average with a sample-size gate, goal-completion %, and the caveats above as literal strings in the payload.
- `admin.specialistImpact({ specialistId })` — same shape, admin-gated, for the scholar's own visibility. Numbers only, per the privacy ruling — no plan text, no goal text, no messages.

## Explicitly out of scope

- No app/client UI. This is API + schema + tests; the natural trigger point (e.g. shown when a parent opens a specialist's chat after some time has passed) is a client concern for a later task.
- No specialist-authored free-text assessment. The brief allowed for one; the mid-task privacy ruling requires such text stay unreadable to owner/admin, and nothing in the brief needed it once the parent-reported score exists — building it now would be exactly the speculative addition ponytail exists to cut.
- Backfilling the one real 1↔3870001 relationship into `specialist_assignments` is a data step performed once via the existing admin function, called out plainly in the completion report, not hidden as a side effect.

## Process note

This spec was produced by an autonomous subagent with no interactive reviewer in the loop (the task explicitly delegates the design decision: "pick a primary measure, justify it"). It is written and committed per the brainstorming skill's process so the reasoning is inspectable, but implementation proceeds without a synchronous approval gate — consistent with how this project runs delegated work. The person reading the final report is the approval point.
