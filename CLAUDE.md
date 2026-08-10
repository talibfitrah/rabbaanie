# Rabbaanie — Claude Developer Guide

Rabbaanie (ربّانيّ) — an ad-free, family-oriented Islamic app. **Expo / React Native** client (`app/`, `components/`) + a **Node / Drizzle** backend under `server/`. Repo: `git@github.com:talibfitrah/rabbaanie.git` (branch `main`). Working checkout lives on the VM at `~/Development/rabbaanie`.

> Internal reference docs live in `local-docs/` (gitignored — not versioned).

---

## Anti-sycophancy (MANDATORY)

These rules apply to every session, including compacted, resumed, and handed-off sessions. Treat them as a session-level invariant, not optional style guidance.

**Banned openers**: "You're absolutely right!", "Great point!", "Excellent!", "Brilliant!", "Love this!", "I understand your concern, however…", "That's a valid approach, but…".

**On pushback**: don't capitulate by reflex. If the user is right, say what you got wrong and own it. If the user is wrong, defend the answer with evidence, not politeness. If uncertain, say so and lay out both sides without hedging.

**Output shapes**:
- "Review this" → 3 worst issues first, then minor issues, then what works.
- "Is this a good idea?" → lead with failure modes, then strengths, then a verdict with confidence %.
- "What do you think of my plan?" → name the weakest link first.
- "Should I do X or Y?" → pick one with reasoning. No "both have merit" cop-outs.

**Anchoring bias**: answer the question in isolation first, ignoring how the user framed it. Then compare to what the user seems to want and surface any gap.

**Self-correction**: if you catch yourself being sycophantic mid-response, stop and restart. If the user calls it out, acknowledge it, fix the response, and ask whether this rule should be strengthened here.

---

## Coding rules (MANDATORY)

Also injected on every prompt from `~/.claude/coding-rules.txt` (UserPromptSubmit hook), which
is the canonical copy — edit there, not here, and keep this section a summary. Ponytail is
enforced separately by its own SessionStart hook and governs solution SIZE; these govern
assumptions, blast radius and verification, which ponytail does not cover.

1. **Before coding** — state assumptions; present both readings rather than silently picking one;
   say so when a simpler approach exists. Reversing a commitment already made to the user is a
   decision to surface, not to explain afterwards.
2. **Simplicity** — minimum code, nothing speculative, no abstraction for single-use code.
   **This applies to tests**: an assertion coupled to source formatting breaks on a reformat and
   the tempting fix is to loosen it, which silently removes the guard. Assert the invariant.
3. **Surgical changes** — every changed line traces to the request. Remove orphans your change
   created; mention pre-existing dead code, do not delete it (this is the same rule the Bloat
   Audit in stages 1 and 8 already follows).
4. **Verify, never assert** — turn the task into a checkable goal first; never claim done without
   running the check in the same turn and reading the output; a guard you have not watched fail
   is not verified. Prefer a live probe or the real artifact over reasoning about what the code
   should do. **A gate that only checks what must be ABSENT lets a capability vanish silently —
   assert presence too.**

Route to the deeper skill when it fits: `superpowers:systematic-debugging` before proposing any
bug fix, `superpowers:test-driven-development` before writing implementation code,
`superpowers:verification-before-completion` before claiming anything passes.

---

## Mandatory 9-stage review pipeline

After **any coding work that changes repository files** (client, server, scripts, or config that affects implementation), run the 9-stage review pipeline before treating the work as complete.

Stages 1 and 8 use the **Bloat Audit** from the user-level **`code-upgrade`** skill (`~/.claude/skills/code-upgrade/bloat-audit.md`). It hunts what AI coders over-produce: dead code, helpers used once, safety checks for impossible problems, re-validation of already-validated data, middleman functions, "just in case" leftovers, and settings nobody changes. Its rules apply as written: plain language, investigate before flagging (watch for dynamic calls), and **never delete pre-existing code without an explicit yes from the user** — bloat introduced by the current change may be removed directly.

1. **Bloat audit (pre)** — run the `code-upgrade` Bloat Audit scoped to the diff and the files just touched, before any other review. Strip self-introduced bloat now; queue pre-existing findings as questions for the user.
2. **Baseline** — inspect `git status`, identify the changed files, and run the relevant unit / build checks for the touched area.
3. **Code reviewer** — a cold code-review pass over the diff against the base branch, prioritizing bugs / security / correctness (gstack `/review` or a code-review subagent).
4. **Security review** — run `/cso` (security-focused) when the change touches auth, permissions, network input, storage, admin paths, parsers, external URLs, secrets, or billing.
5. **Adversarial challenge** — a second-opinion challenge pass, preferably **`codex`** (`/codex` challenge) or the closest available agent fallback.
6. **Consolidate findings** — merge findings, remove duplicates, classify severity, and decide what must be fixed before completion.
7. **Patch + re-review** — fix all Critical / Important / actionable findings and re-run targeted checks/review until they are closed.
8. **Bloat audit (post)** — re-run the `code-upgrade` Bloat Audit over the final cumulative diff. Fix rounds breed bloat too (orphaned helpers, dead branches from reworked fixes); clean it here so the final gate reviews lean code. Same rules as stage 1.
9. **gstack `/review` + Cubic** — run gstack `/review`, then **`cubic review --base <base-sha> --json`** (`cubic review -b <base-sha> -j`) from the repo root. Cubic is stochastic — re-run after each fix batch until **two consecutive rounds show no new P0/P1 findings**. P0/P1 findings block completion unless fixed or documented as a pre-existing / architectural deferral with a concrete follow-up.

If a stage cannot run (tool, credential, PR, network, or reviewer unavailable), **do not silently skip it** — state the blocked stage, the reason, and the best local substitute you ran.

---

## gstack

Use the gstack **`/browse`** skill for all web browsing; never use `mcp__claude-in-chrome__*` tools. For browser automation on this headless VM, the **`playwright`** and **`chrome-devtools`** MCPs are configured against headless Chromium.

Available gstack skills: `/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/design-consultation`, `/design-shotgun`, `/design-html`, `/review`, `/ship`, `/land-and-deploy`, `/canary`, `/benchmark`, `/browse`, `/connect-chrome`, `/qa`, `/qa-only`, `/design-review`, `/setup-browser-cookies`, `/setup-deploy`, `/setup-gbrain`, `/retro`, `/investigate`, `/document-release`, `/document-generate`, `/codex`, `/cso`, `/autoplan`, `/plan-devex-review`, `/devex-review`, `/careful`, `/freeze`, `/guard`, `/unfreeze`, `/gstack-upgrade`, `/learn`.

## Skill routing
- Product ideas / brainstorming → `/office-hours`
- Strategy / scope → `/plan-ceo-review`
- Architecture → `/plan-eng-review`
- Design system / plan review → `/design-consultation` or `/plan-design-review`
- Full review pipeline → `/autoplan` (or the 9-stage pipeline above)
- Bloat / dead code / simplify / dedupe → `code-upgrade` skill (Bloat Audit also runs as pipeline stages 1 and 8)
- Bugs / errors → `/investigate`
- QA / testing site behavior → `/qa` or `/qa-only`
- Code review / diff check → `/review`
- Ship / deploy / PR → `/ship` or `/land-and-deploy`

## graphify

`graphify-out/` holds an **AST-derived** graph of this repo — ~3.5k nodes and ~6.8k links
(imports, calls, definitions), rebuilt by `graphify update .`.

**No API key is involved, and none is missing.** graphify extracts code structurally with no
LLM at all; semantic extraction exists only for docs, PDFs and images, which this corpus has
none of. So AST-only is the finished product here, not a degraded mode — and it matches node
*names*, not concepts. That is what decides its use:

- **`graphify path "<A>" "<B>"` — use it.** Real relationships between two named symbols or
  files. Reach for it to find blast radius before changing something shared.
- **`graphify update .` — after code changes.** Cheap, no API cost.
- `graphify query "<question>"` — only when the question already names symbols you know. Given a
  natural-language question it returns a BFS neighbourhood truncated to a token budget, and says
  so: *"showing 67 of 461 nodes… the answer may be among the 394 cut nodes."*
- `graphify explain "<concept>"` — needs a node whose **name** matches. `explain "play billing
  purchase flow"` returns *"No node matching"*. Pass a real symbol.

**Grep is the correct tool for locating a known symbol, string or file. Do not route that
through graphify first.** Measured 2026-08-09: two such queries returned truncated noise and a
grep answered both in one line immediately after. The PreToolUse hook that used to demand
otherwise fired ~30 times in one session and produced nothing; it has been removed, because a
mandate that is usually wrong teaches the agent to ignore hooks in general.

Read `graphify-out/GRAPH_REPORT.md` only for broad architecture review.

**Keep graphify — the reason is context, not disk.** `path` answers a relationship question in
one line where grepping and reading the two files costs hundreds; that saving is why the 37 MB
and the rebuild-per-commit are worth it. The inverse is also measured: a natural-language
`query` returned ~2000 tokens of truncated noise and still needed a grep afterwards, so it costs
more than it saves. Use the cheap commands, skip the expensive one — do not re-litigate removing
the tool.

An earlier revision of this section claimed a missing `GEMINI_API_KEY` was degrading `query`
and `explain`. That was wrong — inferred from a tip line in the `update` output without reading
graphify's docs, which say plainly: *"graphify needs no API key. Never ask the user for one, and
never block on one."* A key would only matter if this repo were graphified with docs or images
in the corpus. On code it is a call graph by design, and that is the ceiling.
