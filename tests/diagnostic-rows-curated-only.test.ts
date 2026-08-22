import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";

/**
 * Adversarial-review finding (codex, item 1/3 follow-up): getRecentDiagnosticRows
 * exposes the raw answer `label` (unlike getRecentDiagnosticSignals, which only
 * ever emits category+tone from a fixed, runtime-validated enum). A row's
 * `source` can be "curated" (today's fixed, developer-authored question bank —
 * see daily-diagnostic.ts's own PRIVACY note) or, on a historical row written
 * before that system existed, "generated"/"fallback" (old, LLM-authored
 * questions AND option labels — the exact system this module's own file header
 * documents as having produced real bugs: wrong-gender phrasing, a forbidden
 * topic). submitAnswers only proves an answer's label matches SOME option
 * already stored on that row — it says nothing about whether that stored
 * option was itself curated or LLM-authored. Restricting the full-answer read
 * to source="curated" closes that gap at the one function that carries labels,
 * without touching getRecentDiagnosticSignals (its category+tone output is
 * already enum-bounded regardless of source, so it needs no such filter).
 */

const dialect = new MySqlDialect();

const captured: { table: unknown; where: unknown }[] = [];
const queues = new Map<unknown, unknown[][]>();
const counts = new Map<unknown, number>();
function setRows(table: unknown, ...responses: unknown[][]) {
  queues.set(table, responses);
  counts.set(table, 0);
}
function nextRows(table: unknown): unknown[] {
  const q = queues.get(table) ?? [];
  const i = counts.get(table) ?? 0;
  counts.set(table, i + 1);
  return (q[Math.min(i, q.length - 1)] as unknown[]) ?? [];
}

vi.mock("drizzle-orm/mysql2", () => ({
  drizzle: () => ({
    select: () => ({
      from: (table: unknown) => ({
        where: (where: unknown) => {
          captured.push({ table, where });
          const rows = nextRows(table);
          return {
            then: (resolve: any) => resolve(rows),
            orderBy: () => ({ then: (resolve: any) => resolve(rows) }),
          };
        },
      }),
    }),
  }),
}));

import { dailyDiagnosticCheckins } from "../drizzle/schema";
import { getRecentDiagnosticRows } from "../server/db";

process.env.DATABASE_URL = "mysql://diagnostic-rows-curated-only-test/db";

beforeEach(() => {
  captured.length = 0;
  queues.clear();
  counts.clear();
});

describe("getRecentDiagnosticRows only reads source='curated' rows (adversarial-review fix)", () => {
  it("sends a query that filters on source = 'curated'", async () => {
    setRows(dailyDiagnosticCheckins, []);

    await getRecentDiagnosticRows(1, 7);

    const call = captured.find((c) => c.table === dailyDiagnosticCheckins);
    expect(call, "getRecentDiagnosticRows never queried the table").toBeTruthy();
    const text = dialect.sqlToQuery(call!.where as any).sql;
    expect(text).toContain("source");
    const params = dialect.sqlToQuery(call!.where as any).params;
    expect(params).toContain("curated");
  });
});
