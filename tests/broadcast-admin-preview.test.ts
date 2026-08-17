import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { analyticalProfileTemplate, personalProfileTemplate } from "../server/broadcast-templates";

// app/admin/broadcast.tsx duplicates the Arabic title/body for exactly the
// two categories it can send today through the existing, unmodified
// sendBroadcast mutation (incompleteAnalytical, incompletePersonal) — it
// can't import server/broadcast-templates.ts itself (no app/ file ever
// imports server/ code; see server/broadcast-audience.ts's header for why).
// This test pins that duplication against drift by calling the real
// template functions, the same pattern this suite already uses for the
// lib/store.ts <-> broadcast-audience.ts personal-gate cross-check.
const ADMIN_SOURCE = readFileSync(
  join(__dirname, "..", "app", "admin", "broadcast.tsx"),
  "utf8",
);

// The client composes its preview body as `${BASMALA_AR}\n\n<core>\n\n${CLOSING_AR}`
// (template-literal interpolation), so the compiled source text never
// literally contains the fully-wrapped string — only the core sentence does.
// wrapBody() in server/broadcast-templates.ts always joins exactly
// [basmala, core, closing] on "\n\n", so splitting on it isolates the same
// core piece that was hand-transcribed into the client and could drift.
function coreOf(bodyAr: string): string {
  const parts = bodyAr.split("\n\n");
  expect(parts).toHaveLength(3); // fails loudly if wrapBody's shape ever changes
  return parts[1];
}

describe("app/admin/broadcast.tsx Arabic preview text", () => {
  it("matches analyticalProfileTemplate()'s real title and core message", () => {
    const t = analyticalProfileTemplate();
    expect(ADMIN_SOURCE).toContain(t.title.ar);
    expect(ADMIN_SOURCE).toContain(coreOf(t.body.ar));
  });

  it("matches personalProfileTemplate()'s real title and core message", () => {
    const t = personalProfileTemplate();
    expect(ADMIN_SOURCE).toContain(t.title.ar);
    expect(ADMIN_SOURCE).toContain(coreOf(t.body.ar));
  });
});
