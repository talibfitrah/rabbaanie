# 1.5.7 — review findings NOT fixed, with follow-ups

Release `1.5.7` (versionCode 1005007), main `88ba7aa`, 2026-08-17.
Reviewers: cubic (rounds 11 + final) and codex (adversarial, xhigh).

Everything below was **verified as real** or is **already documented in-code**. Nothing here is a
guess left un-triaged. Fixed findings are in the commit messages; this file is only the residue.

---

## Deferred: concurrency / TOCTOU

These need a transaction or a DB constraint, not a bigger `if`. None is reachable without two
requests landing in the same instant, and the app has no concurrent-marriage load today.

1. **Gender-change vs grant race** — a wife flips to `man`, starts a grant request that authorises
   from her male snapshot; a concurrent save back to `vrouw` clears grants, and the
   already-authorised grant then stamps `profileAccessGrantedAt`. Final state: female, with a
   self-issued grant. `grantPartnerProfileAccess` checks partnership membership and status but
   never the caller's *current* gender.
   **Follow-up:** put the gender predicate inside the grant's own SQL `WHERE`, so the check and
   the write are one statement.

2. **Revocation and gender persistence are not atomic** — revocation commits, then
   `updateUserProfile` fails (or its own `getDb()` returns null and it silently returns). Grants
   are gone, gender unchanged. Fails *safe* (access removed, not granted) but is a false permanent
   revocation the user cannot see.
   **Follow-up:** wrap both in one transaction.

3. **Concurrent confirmations defeat the one-husband check** — two pending invites confirmed at the
   same instant both observe "no active husband". Already documented in-code with a `ponytail:`
   comment and its upgrade path.
   **Follow-up:** a partial unique index on (woman, active+confirmed).

## Deferred: polygyny edges

4. **Dissolving a partnership leaves the child links it created.** Confirming a partner writes
   `parent_child_links` with `canEdit: true`; `dissolvePartner` only flips the partnership row, so
   an ex-spouse keeps read/update/delete on those children indefinitely.
   **This one is a product decision, not just a bug:** should separation remove access to children
   the other parent brought? Needs the owner's ruling before code.

5. **Sequential gender change can still bypass the one-husband invariant** — save `man`, confirm a
   second husband (the guard now reads you as male), save `vrouw`. The revocation fires, but the
   second partnership is neither rejected nor dissolved.
   **Follow-up:** on a change to `vrouw`, dissolve or refuse the surplus active partnerships.

6. **Legacy JSON-only women bypass the one-husband constraint** — the guard reads `users.gender`
   only, so a row with the column NULL and the JSON set is treated as non-female. Already
   documented in-code as a known ceiling.
   **Follow-up:** resolve through `resolveGender`, as the revocation path now does.

7. ~~**Background/global sync still merges an arbitrary wife's data.**~~ **FIXED** in the final
   round. Only `family.tsx` can pass a partner id; `lib/app-context.tsx`, `app/(tabs)/index.tsx`
   and `app/(tabs)/messages.tsx` have no selector. Rather than add three selectors, the server now
   **refuses** an unqualified sync when the caller has 2+ confirmed partners, returning
   `success:false` — which all four call sites already surface as the refusal toast. Users with 0
   or 1 partners are unaffected.
   **Residual:** a polygynous husband therefore cannot sync from the Home or Messages tabs at all,
   only from the family tab where he can choose. That is deliberate (refusing beats merging the
   wrong household) but it is a UX gap to close with a selector on those screens.
   **Still open, and the deeper issue:** partner data is *copied into the husband's own profile
   blob* by sync at all. That copy is what lets wife #2 read wife #1's data once granted. The
   real fix is to stop merging households into one blob.

8. **`getSpouseAdvice` cannot be scoped per-wife** — its input has no partner field. Declared by
   the feature author as a deliberate deferral; an API change, not a review-pass side effect.

## Open UX gap created by a security fix

7b. **Nothing prompts either party to confirm an auto-created pending partnership.** The
    shared-children fallback now creates the partnership as `confirmed: false` (it used to
    auto-confirm, which let a read manufacture the consent the access gate checks). Correct, but
    the ~13 co-parent pairs on that path now read as `restricted` with no in-app nudge explaining
    that one of them must accept a partnership invite. They must go through the invite flow
    themselves.
    **Follow-up:** surface a pending auto-created partnership on the family / spouse-profile
    screen as "confirm you are partners", so the path out is visible.

## Deferred: reads that write

9. **`listPartners` is a `.query` that can INSERT.** The legacy shared-children fallback calls
   `createPartnership`. Partly mitigated in 1.5.7 — an explicitly dissolved partnership is no
   longer resurrected by a read — but a *first-ever* co-parent detection still creates a
   partnership as a side effect of opening the family tab.
   **Follow-up:** give the fallback a write-free variant, as `hasConfirmedPartner` already is for
   the daily check-in.

## Deferred: pre-existing, not introduced here

10. **`profile.get` stamps the arbitrary first partner's name and publicId** into the caller's own
    profileData, which the client then persists back on the next debounced save. Wrong partner
    under polygyny.
11. **`lib/plan-blocks.ts` `isNumberedOutline`** is a five-clause document classifier tuned
    entirely by counterexample across cubic rounds 3, 5 and 7. No invariant is asserted, so the
    next unseen plan phrasing needs a sixth clause. **Follow-up:** have the two generators emit an
    explicit structural marker instead of re-deriving family from prose.
12. **`hasConfirmedPartner` takes `.limit(1)` before the soft-delete check**, so a user whose
    first-returned partner is deleted reads as partnerless and loses the spouse check-in variants.
13. **The "partner hasn't filled their profile yet" empty state is unreachable** in
    `app/spouse-profile.tsx` — an earlier return covers it. Dead branch, harmless.
14. **`createPartnership`'s natural-key re-select race** is app-repo/MySQL only. Production uses
    `.returning()`, so it is not live there.

## Process

15. **`drizzle/postgres-partner-profile-access.sql` is outside the documented migration path.**
    It was applied by hand to production on 2026-08-17 and verified. `npm run db:push` /
    `drizzle-kit migrate` would not have applied it.
    **Follow-up:** add it to the deploy doc, or fold it into the migration set.

---

## Reviewed and deliberately NOT changed (final rounds)

16. **`(ctx.user as any).gender` at six authorization sites in `server/routers.ts`.** The cast
    hides, at compile time, whether the context actually carries the field — and that is exactly
    the class that produced the worst porting bug of this release (see
    memory `rabbaanie-api-ctx-user-has-no-gender`: the API's context does NOT carry it, and only
    a type mismatch on `profileData` surfaced it). Not changed here because the pattern is
    pre-existing, widening the shared `AuthenticatedUser` type touches every auth path, and the
    server that actually runs in production is the API's — whose stricter type is what caught
    the bug. **Follow-up:** give the app repo a `callerGender(ctx.user)` helper mirroring the
    API's, so the two stay structurally parallel and no future port re-derives the cast.

17. **The unreachable one-husband guard inside `createPartnership`.** Since the shared-children
    fallback stopped writing, the only remaining caller passes `confirmed: false`, so the guard
    never executes. Kept rather than deleted as dead code: it is a backstop on an invariant, the
    cost is one unexecuted branch, and removing it would let a future `confirmed: true` caller
    activate a second husband unchecked. Now says so in a comment.

18. **`hasConfirmedPartner` still takes `.limit(1)` before the soft-delete check** (item 12
    above, re-reported). Unchanged for the same reason.
