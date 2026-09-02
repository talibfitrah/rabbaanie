import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { syncRefusedMessage, REFUSAL_MESSAGES } from "@/lib/sync-refusal";

/**
 * syncWithPartner used to fail only one way ("no partner linked"). The partner
 * access gate added three more — an ungranted wife, an unconfirmed
 * partnership, an unresolvable gender — and every client call site answered
 * success:false with silence, so the sync button did nothing at all. One site
 * even fired the success haptic on refusal.
 *
 * Reviewers found two of the four sites; the other two turned up only by
 * enumerating callers. That is what this guards: a NEW call site added without
 * a refusal branch must fail here rather than ship as another dead button.
 *
 * Anchored on the syncRefusedMessage identifier and on each call's own
 * enclosing block, NOT on the user-facing copy or on a per-file count.
 * Rewording the message, extracting it into i18n, or routing several buttons
 * through one shared helper all leave the invariant intact and must not fail
 * this test — an earlier version broke on all three, and the tempting fix for
 * that is to loosen the assertion, which removes the guard.
 *
 * WHAT THIS DOES NOT CHECK, stated because it already missed one: reachability.
 * It asserts the refusal is PRESENT somewhere in the call's enclosing block,
 * not that it sits on the paths that can actually fail. A refusal put in the
 * wrong catch passed this test while the throw path stayed silent and a
 * successful sync reported failure — cubic found that, this did not. Verifying
 * placement lexically needs heuristics brittle enough to cry wolf, and a test
 * that cries wolf gets loosened. Read the handler when you touch one.
 */
const APP = join(__dirname, "..", "app");
const CALL = /sync\w*\.mutate(?:Async)?\(/g;

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    return statSync(p).isDirectory()
      ? tsxFiles(p)
      : p.endsWith(".tsx")
        ? [p]
        : [];
  });
}

/** The rest of the block enclosing `from` — where a refusal branch must live. */
function enclosingBlock(src: string, from: number): string {
  let depth = 0;
  for (let i = from; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      if (depth === 0) return src.slice(from, i);
      depth--;
    }
  }
  return src.slice(from);
}

describe("every sync call site answers a refused sync", () => {
  const callers = tsxFiles(APP).filter((p) =>
    readFileSync(p, "utf8").includes("trpc.links.syncWithPartner"),
  );

  it("finds the known call sites", () => {
    // Presence check: at zero, every assertion below passes having examined
    // nothing at all.
    expect(callers.length).toBeGreaterThanOrEqual(3);
  });

  it.each(callers)("%s answers a refusal at each call", (path) => {
    const src = readFileSync(path, "utf8");
    const starts = [...src.matchAll(CALL)].map((m) => m.index!);
    expect(starts.length, "file matched but no sync call found").toBeGreaterThan(
      0,
    );
    for (const start of starts) {
      expect(
        enclosingBlock(src, start),
        `a sync call at index ${start} has no reachable refusal — a refused sync is silent there`,
      ).toContain("syncRefusedMessage");
    }
  });
});

/**
 * The server refuses a sync for four designed reasons and names each in
 * `message`. Rendering them all as "could not sync" told a parent with no
 * confirmed partner, or a wife awaiting her husband's grant, that something
 * had failed. The invariant: a known refusal gets its own wording; anything
 * else (or nothing) keeps the generic one.
 */
describe("syncRefusedMessage names the server's refusal", () => {
  const GENERIC = {
    nl: "Synchroniseren is niet gelukt",
    en: "Could not sync",
    ar: "تعذّرت المزامنة",
  } as const;
  const LANGS = ["nl", "en", "ar"] as const;

  it("renders 'No partner linked' in each language", () => {
    expect(syncRefusedMessage("nl", "No partner linked")).toBe("Geen partner gekoppeld");
    expect(syncRefusedMessage("en", "No partner linked")).toBe("No partner linked");
    expect(syncRefusedMessage("ar", "No partner linked")).toBe("لا يوجد شريك مرتبط");
  });

  it("renders the permission refusal without naming the partner as its cause", () => {
    // The server sends it for three causes — unconfirmed partnership,
    // unresolved gender, ungranted wife — so "your partner hasn't granted
    // access" is wrong for two of them.
    const m = "No permission to sync partner data yet";
    expect(syncRefusedMessage("nl", m)).toBe("Nog geen toegang tot partnergegevens");
    expect(syncRefusedMessage("en", m)).toBe("No access to partner data yet");
    expect(syncRefusedMessage("ar", m)).toBe("لا صلاحية لمزامنة بيانات الشريك بعد");
  });

  it.each([
    "Multiple partners linked, specify which one",
    "No permission to sync partner data yet",
    "No data to sync",
  ])("gives %j its own wording, not the generic one", (message) => {
    for (const lang of LANGS) {
      const out = syncRefusedMessage(lang, message);
      expect(out, lang).not.toBe(GENERIC[lang]);
      expect(out, lang).not.toBe("");
    }
  });

  it("keeps the generic wording for an unknown or missing message", () => {
    for (const lang of LANGS) {
      expect(syncRefusedMessage(lang)).toBe(GENERIC[lang]);
      expect(syncRefusedMessage(lang, "Some new refusal")).toBe(GENERIC[lang]);
      expect(syncRefusedMessage(lang, "constructor")).toBe(GENERIC[lang]);
    }
  });

  it("every refusal key is a message the server actually sends", () => {
    // server/routers.ts is this repo's parity copy; production is rabbaanie-api,
    // where the four strings were verified on 2026-09-02 (VM tree b2a02fa and its running bundle).
    const server = readFileSync(join(__dirname, "..", "server", "routers.ts"), "utf8");
    expect(REFUSAL_MESSAGES.length).toBeGreaterThanOrEqual(4);
    for (const key of REFUSAL_MESSAGES) expect(server, key).toContain(`message: "${key}"`);
  });
});
