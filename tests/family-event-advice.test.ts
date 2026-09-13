import { describe, it, expect } from "vitest";
import rawData from "@/data/family-event-advice.json";

// Guards data/family-event-advice.json (consumed via a double-cast in
// lib/family-event-advice.ts, which erases compile-time shape checks). A content
// edit that drops a required field, or a `when` clause that points at a
// non-existent question/option, fails here instead of silently at runtime.
const data = rawData as Record<string, any>;

const TYPES = ["marriage", "pregnancy", "birth", "divorce"];
const LANGS = ["nl", "en", "ar"];
const tri = (o: any) => !!o && LANGS.every((l) => typeof o[l] === "string" && o[l].trim().length > 0);

describe("family-event-advice content", () => {
  it("covers exactly the four event types", () => {
    expect(Object.keys(data).sort()).toEqual([...TYPES].sort());
  });

  for (const t of TYPES) {
    it(`${t}: config shape is valid`, () => {
      const cfg = data[t];
      expect(cfg, `${t} config`).toBeTruthy();
      expect(cfg.type).toBe(t);
      expect(tri(cfg.intro), `${t} intro trilingual`).toBe(true);

      expect(Array.isArray(cfg.questions)).toBe(true);
      const qids = new Set<string>();
      const qGender: Record<string, string | undefined> = {};
      const optVals: Record<string, Set<string>> = {};
      for (const q of cfg.questions) {
        expect(typeof q.id).toBe("string");
        qids.add(q.id);
        qGender[q.id] = q.gender;
        if (q.gender !== undefined) expect(["man", "woman"], `${t} question ${q.id} gender`).toContain(q.gender);
        expect(tri(q.text), `${t} question ${q.id} text`).toBe(true);
        expect(Array.isArray(q.options) && q.options.length > 0).toBe(true);
        optVals[q.id] = new Set();
        for (const o of q.options) {
          expect(typeof o.value).toBe("string");
          expect(tri(o.label), `${t} option ${q.id}/${o.value} label`).toBe(true);
          optVals[q.id].add(o.value);
        }
      }

      // question `when` clauses (asked only after an earlier answer) must also
      // reference a real question/option (validated after all ids are known).
      for (const q of cfg.questions) {
        for (const c of q.when ?? []) {
          expect(qids.has(c.q), `${t} question ${q.id} when references ${c.q}`).toBe(true);
          expect(optVals[c.q]?.has(c.value), `${t} question ${q.id} when references option ${c.q}/${c.value}`).toBe(true);
        }
      }

      expect(Array.isArray(cfg.advice) && cfg.advice.length > 0).toBe(true);
      for (const a of cfg.advice) {
        expect(tri(a.body), `${t} advice body`).toBe(true);
        if (a.gender !== undefined) expect(["man", "woman"], `${t} advice gender`).toContain(a.gender);
        if (a.daleel !== undefined) expect(tri(a.daleel), `${t} advice daleel`).toBe(true);
        if (a.when !== undefined) {
          expect(Array.isArray(a.when)).toBe(true);
          for (const c of a.when) {
            expect(qids.has(c.q), `${t} when references question ${c.q}`).toBe(true);
            expect(optVals[c.q]?.has(c.value), `${t} when references option ${c.q}/${c.value}`).toBe(true);
            // a gendered advice item must not depend on a question its viewer
            // never sees (that would make it dead), so the referenced question's
            // gender must be neutral or match the item's gender.
            if (a.gender && qGender[c.q]) {
              expect(qGender[c.q], `${t} advice(${a.gender}) when references ${qGender[c.q]}-only question ${c.q}`).toBe(a.gender);
            }
          }
        }
      }
    });
  }
});
