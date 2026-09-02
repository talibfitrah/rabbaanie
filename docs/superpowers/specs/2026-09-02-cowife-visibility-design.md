# Co-wife visibility, husband-gated — design (amends INV-1)

**Date:** 2026-09-02 · **Decided by:** Daa3iyah (Telegram msg 2549: «ب ولكن بعد الاستئذان من الزوج») after the live leak in msgs 2544-2547.

## 1. Rule (replaces the absolute form of INV-1 in `2026-08-31-polygamy-suite-design.md` §0)

- By default a wife still sees nothing of any co-wife (INV-1 unchanged).
- The husband may enable **one switch** «السماح لزوجاتي بمعرفة بعضهن». While it is on, each of his active confirmed wives sees the other active confirmed wives **by name only**, labelled «الأخت الشريكة» / "Mede-echtgenote" / "Co-wife". Nothing else: no children, no profile, no daily answers, no chat, no ids beyond what the list needs.
- Children are never shared through this: a wife sees a co-wife's child only through an explicit per-child link the husband confirms (زوجة الأب).
- The defect that produced the leak (acceptance crosslinking a man's children to a new wife) is fixed independently (`hotfix/no-child-crosslink-to-cowife`), and the nine wrong production links are deleted.

## 2. Server (rabbaanie-api)

- Column on `partnerships`: `"coWivesVisible" boolean NOT NULL DEFAULT false` (migration `drizzle/postgres-partnerships-cowives-visible.sql`, `ADD COLUMN IF NOT EXISTS`).
- `links.setCoWivesVisible({ visible })` — caller must resolve to `man`; sets the flag on ALL his `status='active' AND confirmed` partnership rows; returns `{ visible }`. A partnership created later starts `false` until he toggles again (no inheritance — YAGNI).
- `links.coWivesVisibility` — husband reads `{ visible }` = he has ≥1 active confirmed partnership and every one of them has the flag on.
- `links.coWives` — for a woman: her active confirmed partnership row R (husband H). If `R.coWivesVisible` is false → `[]`. Else H's OTHER active confirmed wives whose own row has the flag on → `[{ id, name }]` (name = `users.name`, same source as `listPartners`). A man, an unlinked woman, or a dissolved partnership → `[]`.
- Tests, presence AND absence: enabled → wife A sees B's name and B sees A's; disabled → `[]`; husband toggling off hides immediately; a man calling `coWives` → `[]`; a dissolved partnership is never listed; the payload has exactly `id` and `name`.

## 3. Client

- Husband (`app/(tabs)/messages.tsx`, أسرتي, shown when `knownToBeMan`): a Switch row «السماح لزوجاتي بمعرفة بعضهن (بالاسم فقط)» / "Mijn echtgenotes mogen elkaars naam zien" / "Let my wives see each other's names", state from `links.coWivesVisibility`, writes `links.setCoWivesVisible`, invalidates both queries.
- Wife (same tab): a section «الأخوات الشريكات» / "Mede-echtgenotes" / "Co-wives" rendered only when `links.coWives` returns ≥1 row: name + badge «الأخت الشريكة», no buttons, no navigation.
- `getRelationshipLabel` is untouched: co-wives no longer arrive through `coParents` once the wrong links are gone.

## 4. Rollout

Server (migration → code → pm2) with the haid server release; client in APK 1.10.0.
