import { describe, it, expect } from "vitest";
import fs from "fs";

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

  it("refuses records belonging to another device", () => {
    expect(body).toContain("conv.deviceId !== input.deviceId");
  });
});

describe("deleting a consultation", () => {
  const body = procedureBody("deleteConversationFromDb");

  it("requires a deviceId", () => {
    expect(body).toContain("deviceId: z.string()");
  });

  it("checks ownership before deleting", () => {
    expect(body).toContain("conv.deviceId !== input.deviceId");
    const guard = body.indexOf("conv.deviceId !== input.deviceId");
    const del = body.indexOf("await deleteParentAiConsultation");
    expect(guard).toBeLessThan(del);
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
