# Women's حيض / استحاضة / نفاس tracker — design

**Date:** 2026-09-02 · **Requested by:** Daa3iyah (Telegram msgs 2505, 2530, 2532, 2537, 2539) · **Rulings source:** `local-docs/haid/HAID-RULINGS-DRAFT-ar.md` (his book كتاب التأسيس + Qur'an/Sunnah citations), approved with the 16 decisions below.

## 0. Two-repo reminder

Client = this repo (`main`, MySQL-flavoured `server/` that runs nowhere). Production server = `rabbaanie-api` (`master`, Postgres, pm2 on the VM). Server work is written in the mirror `/home/msa/Development/rabbaanie-api`, tested there, hand-applied to the VM (migration first, then code), then pushed to `master`. Nothing here reads server behaviour from this repo's `server/`.

## 1. Scope (v1)

For women only (`parentProfile.gender === "vrouw"`, never `!== "man"`):

- Log per day: **blood** (optional colour black/red), **spotting** (صفرة/كدرة), **dry** (انقطاع), and **ghusl done**.
- Settings: habit length (auto-learned, editable), cycle length (auto-learned, editable), pregnant since, birth date, miscarriage date + gestation days, contraception flag.
- A pure rules engine classifies every day as `haid | nifas | istihada | tuhr_pending_ghusl | tuhr` and derives: today's rulings (prayer, fasting, intercourse, ghusl), predictions (next period, ovulation, fertile window), Ramadan qadaa count.
- Surfaces: her tracker screen; a «أنا حائض» button on the prayer reminder popup; an «معذورة اليوم» answer on the daily review's prayer question; prayer reminders paused while excused with a daily «هل طهرتِ؟» prompt and a ghusl reminder at expected purity; the husband's read-only view inside each wife's panel.
- Sharing: the linked husband sees everything, automatically (decision 15). Activation shows the consent notice; disabling deletes her rows.

Out of scope: statistics beyond the current data, export, doctor sharing, fertility notifications, any Hijri feature beyond the Ramadan count, iOS-specific work.

## 2. Fiqh contract — the 16 decisions (binding; each has ≥1 presence AND ≥1 absence test)

| # | Decision (Daa3iyah) | Engine rule |
|---|---|---|
| 1 | ب — no numeric min/max for حيض or طهر; habit + description govern | Never cap or reject input by day count. A blood run > 15 days raises `advisory: "see_doctor"` only. |
| 2 | أ — habit beats colour discrimination when both exist | In a blood run: days 1..habit = haid, rest = istihada. Colour used only when no habit exists. |
| 3 | ب — صفرة/كدرة never counted as حيض | `spotting` days are never haid/nifas. A spotting day after a blood run ends the run (purity pending ghusl). |
| 4 | ب — a clean gap shorter than a day is ignored | One non-blood day (dry/spotting/missing) that sits **between two blood days** is absorbed into the run; a non-blood day not followed by blood the next day ends the run (so decision 3's spotting day ends a run unless blood returns the day after). Same tolerance for nifas. |
| 5 | الكل مباح — Qur'an recitation, touching the mushaf, staying in the mosque all permitted | Haid/nifas rulings list them under *permitted*. |
| 6 | ب — kaffarah shown as information on request, never enforced | Haid/nifas rulings carry `kaffarahInfo` text behind a "more" affordance; no counter, no prompt. |
| 7 | ب — only the prayer of the time in which حيض/طهر began is affected; no combining with the previous | On logging purity: "the current prayer time's prayer is due after ghusl". On logging blood: "if you had not yet prayed this time's prayer, make it up after purity". Message only, no tracking. |
| 8 | wudu per obligatory prayer; two prayers may be combined with one wudu; no ghusl per prayer | Istihada rulings text. |
| 9 | ب — intercourse with the مستحاضة permitted, with a caution note | Istihada rulings: `intercourse: "permitted_with_note"`. |
| 10 | أ + 120 days — labour blood before delivery is نفاس; miscarriage counts as نفاس only at ≥120 days gestation | Blood days within the 3 days before `birthDate` are nifas. `miscarriageDate` with `gestationDays >= 120` behaves as a birth; below 120 the bleeding is istihada. |
| 11 | أ — a pregnant woman does not menstruate | While `pregnantSince` is set and no birth: every blood day = istihada + `advisory: "bleeding_in_pregnancy"`. |
| 12 | contraception rule adopted | With `contraception: true` and a known cycle length: a blood run starting within ±3 days of the expected start is haid (habit-capped); any other bleeding is istihada. Without cycle history: normal rules. |
| 13 | ب — «حائض» option in BOTH the prayer popup and the daily review card | Popup button is client-only. Daily review option is a server change (women only); choosing it logs today as blood if no entry exists. |
| 14 | أ — prayer reminders paused during logged حيض/نفاس, with a daily «هل طهرتِ؟» | Prayer-time notifications are not scheduled for excused days; one local morning notification per excused day asks about purity; answering "yes" logs `dry` + shows the ghusl card and re-schedules prayers. |
| 15 | the husband sees everything, consent is implicit in marriage | `cycle.getPartner` returns her full data to a confirmed active husband with no per-field grant. Activation screen states this plainly; enabling = consent (stored `consentAt`); disabling deletes her rows. |
| 16 | أ — optional ghusl reminder at expected purity | Local notification at (run start + habit) morning: "if you see purity, perform ghusl and pray"; can be switched off in settings. |

Fixed defaults: no habit and no colour → first **7** days of a run are haid (غالب النساء), remainder istihada. Nifas maximum **40** days from birth; day 41+ blood: haid if it falls within the expected period window (cycle length known) else istihada. Habit = median of the last three **uncapped** blood-run lengths (so a habit that genuinely lengthens is learned); manual override wins. Cycle length = median of the last 3–6 start-to-start intervals, default 28. Ovulation = next start − 14; fertile window = ovulation − 5 … ovulation + 1, always shown with the non-reliance warning. Purity pending ghusl: prayer due after ghusl, fasting allowed, intercourse not until ghusl (his book).

## 3. Architecture

Chosen: **server stores raw days + settings; both apps run the same pure engine.** Alternatives rejected: (b) her device uploads a computed summary — the husband must see everything, so the summary becomes everything, and it goes stale when she is offline; (c) inside the `profileData` blob — that blob's merge/replace sync has caused data-loss incidents and cannot be gated per field.

```
her app ──upsertDay/saveSettings──▶ rabbaanie-api (cycle_days, cycle_settings)
her app ◀──getMine───────────────┘        ▲
husband app ◀──getPartner(wifeId)─────────┘  gate: caller male, target female,
                                             active confirmed partnership (INV-1/INV-4)
lib/haid.ts (pure) runs in BOTH apps on the raw rows
```

### 3.1 Engine — `lib/haid.ts` (pure, no I/O)

```ts
export type Flow = "blood" | "spotting" | "dry";
export interface CycleDay { date: string /* YYYY-MM-DD */; flow: Flow; color?: "black" | "red"; ghusl?: boolean; note?: string }
export interface CycleSettings {
  enabled: boolean; habitLength?: number; cycleLength?: number; pregnantSince?: string;
  birthDate?: string; miscarriageDate?: string; gestationDays?: number; contraception: boolean; ghuslReminder: boolean;
}
export type DayStatus = "haid" | "nifas" | "istihada" | "tuhr_pending_ghusl" | "tuhr";
export interface ClassifiedDay { date: string; status: DayStatus; runDay?: number; advisories: Advisory[] }
export type Advisory = "see_doctor" | "bleeding_in_pregnancy";
export interface Rulings { prayer: "excused" | "due_after_ghusl" | "obligatory"; fasting: "forbidden_qadaa" | "allowed"; intercourse: "forbidden" | "after_ghusl" | "permitted" | "permitted_with_note"; ghusl: "due" | "none"; permitted: string[]; notes: string[] }

export function classify(days: CycleDay[], settings: CycleSettings, from: string, to: string): ClassifiedDay[];
export function rulingsFor(status: DayStatus): Rulings;
export function learnHabit(days: CycleDay[]): number | undefined;      // median of last 3 uncapped runs
export function learnCycleLength(days: CycleDay[]): number | undefined; // median of last 3–6 start intervals
export function predict(days: CycleDay[], settings: CycleSettings, today: string): { nextStart?: string; ovulation?: string; fertile?: [string, string]; expectedPurity?: string };
export function ramadanQadaaDays(classified: ClassifiedDay[], hijriOf: (date: string) => { month: number; year: number }): { year: number; days: number } | null;
export function isExcusedToday(classified: ClassifiedDay[], today: string): boolean;
```

All date maths in plain `YYYY-MM-DD` strings (UTC-free), like `lib/qasm.ts`. Hijri conversion is injected (`getIslamicDate` from `lib/prayer-data.ts`, month 9 = Ramadan) so the engine stays pure.

### 3.2 Server — `rabbaanie-api`

Tables (pg-core in `drizzle/schema.ts`; hand-applied SQL `drizzle/postgres-cycle.sql`):

- `cycle_days(user_id int, date date, flow text check in ('blood','spotting','dry'), color text null, ghusl boolean not null default false, note text null, updated_at timestamptz, primary key (user_id, date))`
- `cycle_settings(user_id int primary key, enabled boolean not null default false, consent_at timestamptz null, habit_length int null, cycle_length int null, pregnant_since date null, birth_date date null, miscarriage_date date null, gestation_days int null, contraception boolean not null default false, ghusl_reminder boolean not null default true, updated_at timestamptz)`

Router `cycle` (all `protectedProcedure`; every write refuses callers whose resolved gender is not `vrouw`):

- `getMine()` → `{ settings, days }` (days = last 400 days).
- `upsertDay({ date, flow, color?, ghusl?, note? })`, `deleteDay({ date })`.
- `saveSettings(partial)` — first `enabled: true` stamps `consent_at`.
- `disable()` — sets `enabled=false`, deletes all her `cycle_days`.
- `getPartner({ partnerId })` → same shape, or `{ enabled: false }` when she has not enabled. Gate: caller's resolved gender is `man`, target's is `vrouw`, and `getPartnersOfUser(callerId)` contains `partnerId` with `partnershipConfirmed` (active; dissolved partnerships drop out, INV-4). It must NOT depend on `hasFullPartnerAccess` (decision 15) and must never be callable wife→wife or wife→husband (INV-1 co-wife blindness). No admin/owner endpoint exists.

Daily review (`server/daily-diagnostic.ts`): for gender `vrouw`, every prayer-question variant gets a fourth option `{ label: «معذورة اليوم (حائض أو نفساء)» (nl/en equivalents), tone: "neutral", kind: "excused" }`. Validation is unchanged (it compares the issued label/tone). Old clients render the extra option harmlessly.

### 3.3 Client surfaces

- `app/haid.tsx` — her screen: month grid coloured by status, today card (status + rulings + the prayer-time note from decision 7), quick-log row (نزل الدم / صفرة أو كدرة / انقطع / اغتسلتُ), settings sheet, predictions card with the non-reliance warning, Ramadan qadaa line, link to the «الحائض والنفساء» adhkar category, disable button. First open shows the activation/consent notice: "زوجكِ المرتبط بحسابكِ يرى هذه البيانات كلها؛ بتفعيل الميزة تأذنين بذلك، وإيقافها يحذفها" — enabling calls `saveSettings({ enabled: true })`.
- Entry: `app/(tabs)/family.tsx` — for `vrouw`, a card «متابعة الحيض والطهر» mirroring the men's قسم card.
- Husband view: inside `WifePermissionsPanel` (`app/(tabs)/messages.tsx`) a section «حالها اليوم» fed by `cycle.getPartner(wife.id)` + the engine: status, intercourse permitted?, expected purity, next period, fertile window; hidden until she enables. Per wife; co-wives never see each other's.
- Prayer popup (`components/prayer-popup-modal.tsx`): third button «أنا حائض» for `vrouw` → `upsertDay(today, blood)` (optimistic) + dismiss. `resolveShouldShowPopup` gains an `excused` input read from a small account-keyed AsyncStorage flag `@haid_excused_${userId}` (mirrors `qasmStorageKey`; wiped on logout in `lib/auth-context.tsx`), kept in sync from the engine after every `getMine`.
- Notifications (`lib/notifications.ts`): `scheduleAllNotifications` skips prayer notifications from today through `predict().expectedPurity` (or through today only when no habit is known) while today is excused, and re-runs on every data change and app open so a logged purity restores them the same day; a daily 08:00 local notification «هل طهرتِ؟» on excused days (tap → tracker with a one-tap "نعم، طهرتُ" that logs `dry`); the decision-16 ghusl reminder at `expectedPurity` 08:00 when `ghuslReminder` is on. Re-schedule whenever her data changes.
- Daily review card: when the chosen prayer option has `kind === "excused"`, call `upsertDay(today, blood)` if no entry exists for today.
- i18n: inline `tx(lang, nl, en, ar)` like the sibling cards; Arabic فصحى; nl/en use the transliteration table (Qur'aan, Soennah).

### 3.4 Privacy and consent

Health data leaves the device only to `rabbaanie-api`, readable by her and her confirmed husband(s); no owner/admin/specialist path. Consent notice at activation (Art. 9 GDPR explicit consent; decision 15 keeps it implicit-by-activation with no separate toggle); disabling deletes. Server logs must not print row contents.

## 4. Testing

- `lib/haid.test.ts`: one presence + one absence test per decision (16 × 2 minimum), plus habit learning, cycle learning, nifas 40/41, 120-day threshold, labour blood, the 1-day gap, spotting ending a run, predictions, Ramadan count with an injected Hijri stub.
- Server: router access-control tests (husband→wife allowed; wife→wife, wife→husband, ex-husband, male→male all refused; writes refused for men), settings consent stamping, disable deletes rows; daily-review option present for `vrouw` and absent for `man`.
- Client: `resolveShouldShowPopup` excused branch; popup renders the button only for `vrouw`.
- `tsc` clean in both repos; the 9-stage pipeline; on-device check by Daa3iyah.

## 5. Rollout

1. Server: apply `postgres-cycle.sql` on the VM, deploy code (backward compatible: new router; extra option for women only), verify health.
2. Client APK **1.10.0** from `feat/haid-tracker`; publish to the updater.
3. Merge `feat/haid-tracker` → `main`, mirror branch → `master`, push both (owner's standing instruction 2026-09-02), keep the VM checkout on `origin/master` per `vm-git-reconcile-recipe`.
