import { describe, it, expect } from "vitest";
import fs from "fs";

import { consultationMessages } from "@/lib/consultation-archive";

// Daa3iyah (2026-08-15): after a consultation the owner report in لوحة الإدارة
// still showed 0 محادثات المستشار, and the plan was missing from both the general
// archive and the child's archive.

const db = fs.readFileSync("server/db.ts", "utf-8");

function getDashboardStatsBody(): string {
  const start = db.indexOf("export async function getDashboardStats()");
  expect(start).toBeGreaterThan(-1);
  const end = db.indexOf("\nexport ", start + 1);
  return db.slice(start, end === -1 ? undefined : end);
}

describe("owner dashboard consultation count", () => {
  it("counts the table the advisor actually writes to", () => {
    const body = getDashboardStatsBody();
    expect(body).toContain("parentAiConsultations");
  });

  it("does not count ai_conversations, which nothing ever inserts into", () => {
    const body = getDashboardStatsBody();
    expect(body).not.toContain("aiConversations");
  });
});

describe("child advisor records its consultation", () => {
  const childScreen = fs.readFileSync("app/child/[id].tsx", "utf-8");

  it("saves the consultation after generating a plan", () => {
    expect(childScreen).toContain("aiChat.saveConversationToDb");
  });

  it("passes childName so the per-child archive filter matches it", () => {
    // ai-chat.tsx filters the archive with h.childName === historyFilter
    expect(childScreen).toContain("childName: child.name");
  });

  // The transcript is built in lib/consultation-archive.ts now, so that both the
  // live diagnosis and the backfill of older consultations produce the same entry.
  it("includes the generated plan in the saved messages", () => {
    const messages = consultationMessages({
      id: "i1",
      description: "المشكلة",
      treatmentPlan: "الخطة",
    });
    expect(messages.at(-1)).toEqual({ role: "assistant", content: "الخطة" });
  });
});

describe("device id is shared, not duplicated", () => {
  it("both advisor screens resolve it through the same helper", () => {
    for (const f of ["app/ai-chat.tsx", "app/child/[id].tsx"]) {
      expect(fs.readFileSync(f, "utf-8")).toContain("getDeviceId");
    }
  });

  it("no screen regenerates a device id inline", () => {
    for (const f of ["app/ai-chat.tsx", "app/child/[id].tsx"]) {
      expect(fs.readFileSync(f, "utf-8")).not.toContain('setItem("@device_id"');
    }
  });
});

describe("ai_conversations is a dead source", () => {
  it("has no insert anywhere in the server", () => {
    const serverFiles = fs
      .readdirSync("server", { recursive: true, encoding: "utf-8" })
      .filter((f) => typeof f === "string" && f.endsWith(".ts"))
      .map((f) => fs.readFileSync(`server/${f}`, "utf-8"));
    const inserts = serverFiles.filter((c) =>
      c.includes(".insert(aiConversations"),
    );
    expect(inserts).toHaveLength(0);
  });
});

// Back inside the advisor no longer unmounts the screen (it routes through
// startNewChat), so an in-flight reply can outlive the consultation that asked
// for it. Every write the late reply performs is gated on a generation counter.
// Source-level because mounting app/ai-chat.tsx needs native modules — the same
// reason tests/play-store-compliance.test.ts reads source.
describe("an abandoned consultation cannot write into the next one", () => {
  const chat = fs.readFileSync("app/ai-chat.tsx", "utf-8");

  it("captures the generation before awaiting", () => {
    expect(chat).toMatch(/const generation = chatGeneration\.current/);
  });

  it("routes every thread-replacing path through abandonInFlightReply", () => {
    // startNewChat, resumeConversation, deleting the open conversation, and
    // changing the child.
    const calls = chat.match(/abandonInFlightReply\(\)/g) || [];
    expect(calls.length).toBeGreaterThanOrEqual(4);
  });

  it("keeps the generation bump and the send-lock release together", () => {
    // These have come apart twice. Bump without release deadlocks the new
    // thread — the abandoned reply's finally is generation-guarded so it will
    // not clear isLoading, and sendMessageWithText refuses to start while it is
    // true. Release without bump lets the stale reply land. So the only raw
    // bump in the file must be the one inside the helper.
    const bumps = chat.match(/chatGeneration\.current \+= 1/g) || [];
    expect(bumps.length).toBe(1);
    const at = chat.indexOf("const abandonInFlightReply");
    expect(at).toBeGreaterThan(-1);
    const helper = chat.slice(at, chat.indexOf("};", at));
    expect(helper).toMatch(/chatGeneration\.current \+= 1/);
    expect(helper).toMatch(/setIsLoading\(false\)/);
  });

  it("abandons before resumeConversation's first write, not after", () => {
    // It loads from the DB or falls back to local storage; the call has to sit
    // above both branches, so assert it precedes the first setMessages.
    const start = chat.indexOf("const resumeConversation");
    expect(start).toBeGreaterThan(-1);
    const firstWrite = chat.indexOf("setMessages(", start);
    expect(firstWrite).toBeGreaterThan(start);
    expect(chat.slice(start, firstWrite)).toMatch(/abandonInFlightReply\(\)/);
  });

  it("re-checks after resumeConversation's own awaits", () => {
    // Pre-existing race, not from this merge: it awaits the DB fetch (or
    // AsyncStorage) and then writes. Two quick taps in the history panel start
    // two loads and the slower one used to win, painting its conversation over
    // the one the user opened last. Both branches must re-check.
    const start = chat.indexOf("const resumeConversation");
    const end = chat.indexOf("const loadConversationHistory", start) > start
      ? chat.indexOf("const loadConversationHistory", start)
      : start + 4000;
    const body = chat.slice(start, end);
    expect(body).toMatch(/const generation = chatGeneration\.current/);
    const rechecks = body.match(/chatGeneration\.current === generation/g) || [];
    expect(rechecks.length).toBeGreaterThanOrEqual(2);
  });

  it("guards every write a late reply performs", () => {
    // One per await boundary: the conversation id lands as soon as the fetch
    // resolves, the plan auto-save awaits withPlanStore, and setMessages runs
    // after it. A guard before the first does not cover the last.
    const guards = chat.match(/chatGeneration\.current (===|!==) generation/g) || [];
    expect(guards.length).toBeGreaterThanOrEqual(4);
  });

  it("lets only the owning send clear the spinner", () => {
    // startNewChat clears isLoading so the fresh chat is usable at once. An
    // abandoned request reaching finally must therefore NOT clear it, or it
    // turns off a LIVE send's spinner and makes that send repeatable.
    expect(chat).toMatch(
      /if \(chatGeneration\.current === generation\) setIsLoading\(false\)/,
    );
  });
});
