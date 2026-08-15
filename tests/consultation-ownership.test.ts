import { describe, it, expect } from "vitest";
import fs from "fs";
import { ownsConsultation } from "../server/consultation-ownership";

// dbId is a sequential primary key on parentAiConsultations. Both endpoints are
// publicProcedure and nothing gates /api/trpc, so before this an unauthenticated
// caller could walk dbId and read — or delete — every family's consultation,
// including the child's name, the parent's answers and the generated plan.

const src = fs.readFileSync("server/ai-chat.ts", "utf-8");

function procedureBody(name: string): string {
  const marker = `${name}: publicProcedure`;
  const start = src.indexOf(marker);
  expect(start).toBeGreaterThan(-1);
  // Start looking past this procedure's own `publicProcedure` token, or we would
  // immediately re-find it and return an empty body.
  const next = src.indexOf("publicProcedure", start + marker.length);
  return src.slice(start, next === -1 ? undefined : next);
}

describe("reading a consultation", () => {
  const body = procedureBody("getConversationFromDb");

  it("requires a deviceId", () => {
    expect(body).toContain("deviceId: z.string()");
  });

  it("refuses records belonging to someone else", () => {
    expect(body).toContain("ownsConsultation(conv");
  });

  it("takes it in the body, not the URL, since it authorises access", () => {
    expect(body).toContain(".mutation(");
    expect(body).not.toContain(".query(");
    const client = fs.readFileSync("app/ai-chat.tsx", "utf-8");
    expect(client).not.toMatch(/getConversationFromDb\?input=/);
  });
});

describe("the device id is unguessable", () => {
  it("is generated with a CSPRNG, not Math.random", () => {
    const src = fs.readFileSync("lib/device-id.ts", "utf-8");
    expect(src).toContain("expo-crypto");
    expect(src).toContain("getRandomBytes");
    // Strip comments first: the file explains *why* Math.random was rejected,
    // and that prose must not read as a failure.
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(code).not.toContain("Math.random");
  });
});

describe("deleting a consultation", () => {
  const body = procedureBody("deleteConversationFromDb");

  it("requires a deviceId", () => {
    expect(body).toContain("deviceId: z.string()");
  });

  it("checks ownership before deleting", () => {
    expect(body).toContain("ownsConsultation(conv");
    const guard = body.indexOf("ownsConsultation(conv");
    const del = body.indexOf("await deleteParentAiConsultation");
    expect(guard).toBeLessThan(del);
  });
});

describe("updating a consultation", () => {
  // The read and delete paths were guarded, but the save path takes the same
  // sequential dbId and overwrites that row. Unguarded, any caller could walk
  // dbId and overwrite every family's consultation with content of their own.
  const body = procedureBody("saveConversationToDb");

  it("checks ownership before overwriting an existing record", () => {
    expect(body).toContain("ownsConsultation(existing");
    const guard = body.indexOf("ownsConsultation(existing");
    const update = body.indexOf("await updateParentAiConsultation");
    expect(guard).toBeGreaterThan(-1);
    expect(update).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(update);
  });

  // The name also appears in this procedure's `await import("./db")` line, so
  // match the call itself — otherwise deleting the whole create branch still
  // passes and the guard protects nothing.
  it("still creates a new record when no dbId is supplied", () => {
    expect(body).toContain("await createParentAiConsultation({");
  });
});

describe("callers send the device id", () => {
  it("every conversation read/delete call passes one", () => {
    const client = fs.readFileSync("app/ai-chat.tsx", "utf-8");
    const calls = client
      .split("\n")
      .filter(
        (l) =>
          l.includes("getConversationFromDb") ||
          l.includes("deleteConversationFromDb"),
      );
    expect(calls.length).toBeGreaterThan(0);
    // The dbId and deviceId travel together in the same JSON.stringify payload,
    // so check the payload lines rather than the URL line alone.
    const payloads = client
      .split("\n")
      .filter((l) => l.includes("dbId") && l.includes("JSON.stringify"));
    for (const p of payloads) {
      expect(p).toContain("deviceId");
    }
  });
});

describe("the ownership rule itself", () => {
  // Tested as behaviour, not by grepping ai-chat.ts for an expression: the
  // previous version of this file pinned the literal `deviceId !== input.deviceId`,
  // so replacing that guard with a STRONGER one failed the test — the exact way
  // a source-coupled assertion pushes you to loosen it and lose the guard.
  const MINE = 42;
  const THEIRS = 43;

  it("lets the account through on any device", () => {
    // The whole point: a reinstall rotates the device id, and the parent must
    // still reach their own consultation.
    expect(ownsConsultation({ parentId: MINE, deviceId: "old" }, MINE, "new")).toBe(true);
  });

  it("refuses another account even from the row's own device", () => {
    // deviceId is client-asserted, so learning one must not be enough.
    expect(ownsConsultation({ parentId: THEIRS, deviceId: "d1" }, MINE, "d1")).toBe(false);
  });

  it("falls back to the device only for rows nobody owns", () => {
    expect(ownsConsultation({ parentId: 0, deviceId: "d1" }, 0, "d1")).toBe(true);
    expect(ownsConsultation({ parentId: 0, deviceId: "d1" }, 0, "d2")).toBe(false);
  });

  it("does not treat two missing device ids as a match", () => {
    // parentAiConsultRouter.create stores deviceId NULL; null === null would
    // hand every such row to any caller sending nothing.
    expect(ownsConsultation({ parentId: 0, deviceId: null }, 0, "")).toBe(false);
  });

  it("refuses a missing row", () => {
    expect(ownsConsultation(null, MINE, "d1")).toBe(false);
  });
});
