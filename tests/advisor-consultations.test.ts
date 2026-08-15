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
