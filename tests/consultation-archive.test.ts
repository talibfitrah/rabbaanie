import { describe, it, expect } from "vitest";

import {
  consultationArchiveKey,
  consultationMessages,
  consultationTitle,
  findArchivedRow,
} from "@/lib/consultation-archive";

/**
 * Daa3iyah (2026-08-15): «اريد ان أرى كل ما كان من استشارات قبل التحديث».
 * Consultations produced by the per-child advisor before v1.4.88 were never
 * recorded — the screen stored the plan as a local issue and stopped there.
 * They are recoverable because the issue still holds the plan and the Q&A, so
 * they are archived retroactively from the same material.
 */
describe("consultationArchiveKey", () => {
  // v1.4.88 already shipped this key. If it changes, every consultation that
  // version archived is archived a second time and the owner's consultation
  // count double-counts it.
  it("is the key v1.4.88 already wrote, so nothing is archived twice", () => {
    expect(consultationArchiveKey("1755264000000abc")).toBe(
      "@issue_consultation_1755264000000abc",
    );
  });
});

describe("findArchivedRow", () => {
  // The archive key is written only after the server answers. If that answer is
  // lost, the row exists but the device does not know its id — and the next open
  // would archive the same consultation a second time. Recognising the row that
  // is already there is what keeps the backfill from duplicating history.
  const rows = [
    { dbId: 7, title: "ابني لا يصلي الفجر", childName: "عبد الله", messageCount: 4 },
    { dbId: 9, title: "ابني لا يصلي الفجر", childName: "زيد", messageCount: 4 },
  ];

  it("finds this child's existing row so it is updated, not duplicated", () => {
    expect(findArchivedRow(rows, "عبد الله", "ابني لا يصلي الفجر", 4)).toBe(7);
  });

  it("does not borrow a row belonging to a sibling", () => {
    expect(findArchivedRow(rows, "سلمى", "ابني لا يصلي الفجر", 4)).toBeNull();
  });

  it("returns null when the consultation was never archived", () => {
    expect(findArchivedRow(rows, "عبد الله", "مشكلة أخرى", 4)).toBeNull();
  });

  // A title is only the first 50 characters of what the parent wrote, and a
  // general advisor chat about the same child is stored the same way. Adopting a
  // row on the title alone would let a re-diagnosis overwrite a different
  // consultation's transcript.
  it("does not adopt a different consultation that merely shares a title", () => {
    expect(findArchivedRow(rows, "عبد الله", "ابني لا يصلي الفجر", 12)).toBeNull();
  });
});

describe("consultationTitle", () => {
  it("is the same title the archive row was created with", () => {
    const long = "أ".repeat(80);
    expect(consultationTitle(long)).toBe("أ".repeat(50));
  });
});

describe("consultationMessages", () => {
  const issue = {
    id: "i1",
    description: "ابني لا يصلي الفجر",
    treatmentPlan: "علاج في التصفية:\n1. اغرس في عقله محبة الصلاة",
    analyticalQA: [
      { question: "كم عمره؟", answer: "عشر سنوات" },
      { question: "هل يستيقظ وحده؟", answer: "لا" },
    ],
  };

  it("opens with the problem the parent reported", () => {
    expect(consultationMessages(issue)[0]).toEqual({
      role: "user",
      content: "ابني لا يصلي الفجر",
    });
  });

  it("replays the diagnosis as advisor question then parent answer", () => {
    expect(consultationMessages(issue).slice(1, 5)).toEqual([
      { role: "assistant", content: "كم عمره؟" },
      { role: "user", content: "عشر سنوات" },
      { role: "assistant", content: "هل يستيقظ وحده؟" },
      { role: "user", content: "لا" },
    ]);
  });

  it("closes with the plan, so the archive shows what the advisor concluded", () => {
    const messages = consultationMessages(issue);
    expect(messages[messages.length - 1]).toEqual({
      role: "assistant",
      content: issue.treatmentPlan,
    });
  });

  it("still archives an older issue that kept no question history", () => {
    expect(
      consultationMessages({
        id: "i2",
        description: "مشكلة قديمة",
        treatmentPlan: "خطة",
      }),
    ).toEqual([
      { role: "user", content: "مشكلة قديمة" },
      { role: "assistant", content: "خطة" },
    ]);
  });
});
