/**
 * Sends one of the four templated category broadcasts to whoever currently
 * matches it. Extracted out of server/routers.ts's sendBroadcast mutation
 * verbatim (same db calls, same order, same push payload shape) so the
 * manual "send now" admin button and the recurring cron runner
 * (scripts/send-recurring-broadcasts.ts) share one implementation instead of
 * two copies that can drift. tests/broadcast-send-category.test.ts already
 * covers this logic end-to-end through admin.sendBroadcast — that suite is
 * the regression check for this extraction.
 */
import * as db from "./db";
import {
  selectAudience,
  attachLinkedSpouse,
  incompleteChildNames,
  recipientGender,
  type AudienceFilter,
  type BroadcastCategory,
} from "./broadcast-audience";
import {
  analyticalProfileTemplate,
  personalProfileTemplate,
  childProfileTemplate,
  spouseNotLinkedTemplate,
} from "./broadcast-templates";

export async function sendCategoryBroadcast(
  category: BroadcastCategory,
  extraFilter: AudienceFilter = {},
): Promise<{ sent: number }> {
  const allUsers = await db.getAllUsers();
  const linkedIds = await db.getLinkedSpouseUserIds();
  const withSpouseInfo = attachLinkedSpouse(allUsers, linkedIds);
  const matched = selectAudience(withSpouseInfo, { ...extraFilter, [category]: true });
  const data = { type: "admin_broadcast", category };
  let sent = 0;

  if (category === "incompleteChildren") {
    for (const u of matched) {
      const t = childProfileTemplate(incompleteChildNames(u));
      const r = await db.broadcastLocalizedPush(
        t.title.nl, t.title.en, t.title.ar,
        t.body.nl, t.body.en, t.body.ar,
        data, [u.id],
      );
      sent += r.sent;
    }
  } else if (category === "notLinkedSpouse") {
    const byGender: Record<"man" | "vrouw", number[]> = { man: [], vrouw: [] };
    for (const u of matched) {
      const g = recipientGender(u);
      if (g) byGender[g].push(u.id); // never null here — see broadcast-audience.ts
    }
    for (const gender of ["man", "vrouw"] as const) {
      if (byGender[gender].length === 0) continue;
      const t = spouseNotLinkedTemplate(gender);
      const r = await db.broadcastLocalizedPush(
        t.title.nl, t.title.en, t.title.ar,
        t.body.nl, t.body.en, t.body.ar,
        data, byGender[gender],
      );
      sent += r.sent;
    }
  } else {
    const t = category === "incompleteAnalytical" ? analyticalProfileTemplate() : personalProfileTemplate();
    const r = await db.broadcastLocalizedPush(
      t.title.nl, t.title.en, t.title.ar,
      t.body.nl, t.body.en, t.body.ar,
      data, matched.map((u) => u.id),
    );
    sent += r.sent;
  }
  return { sent };
}
