import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  record: null as Record<string, unknown> | null,
  deleted: 0,
}));

vi.mock("../server/db", () => ({
  getDb: vi.fn(async () => ({
    select: () => ({
      from: () => ({
        where: async () => (state.record ? [state.record] : []),
      }),
    }),
    delete: () => ({
      where: async () => {
        state.deleted += 1;
        state.record = null;
      },
    }),
    insert: () => ({
      values: async (value: Record<string, unknown>) => {
        state.record = { id: 1, ...value };
      },
    }),
    update: () => ({
      set: (value: Record<string, unknown>) => ({
        where: async () => {
          state.record = { ...state.record, ...value };
        },
      }),
    }),
  })),
}));

import {
  get2FAStatus,
  hashBackupCode,
  normalizeStoredBackupCodes,
  setup2FA,
  verify2FALogin,
} from "../server/totp";

describe("TOTP enrollment and backup-code security", () => {
  beforeEach(() => {
    state.record = null;
    state.deleted = 0;
  });

  it("stores new backup codes as a JSON array of one-way hashes", async () => {
    const result = await setup2FA(7, "admin@example.test");
    const stored = normalizeStoredBackupCodes(state.record?.backupCodes);

    expect(result.backupCodes).toHaveLength(8);
    expect(stored).toHaveLength(8);
    expect(stored).toEqual(result.backupCodes.map(hashBackupCode));
    expect(stored).not.toContain(result.backupCodes[0]);
  });

  it("refuses to reset an already verified factor", async () => {
    state.record = {
      id: 1,
      userId: 7,
      secret: "EXISTINGSECRET",
      verified: true,
      backupCodes: [],
    };

    await expect(setup2FA(7, "admin@example.test")).rejects.toThrow(
      "already enabled",
    );
    expect(state.deleted).toBe(0);
    expect(state.record.secret).toBe("EXISTINGSECRET");
  });

  it("consumes a legacy string-encoded backup code without throwing", async () => {
    state.record = {
      id: 1,
      userId: 7,
      secret: "EXISTINGSECRET",
      verified: true,
      backupCodes: JSON.stringify(["ABCD-1234"]),
    };

    await expect(verify2FALogin(7, "abcd-1234")).resolves.toBe(true);
    expect(state.record.backupCodes).toEqual([]);
    await expect(verify2FALogin(7, "abcd-1234")).resolves.toBe(false);
  });

  it("consumes a hashed backup code exactly once", async () => {
    state.record = {
      id: 1,
      userId: 7,
      secret: "EXISTINGSECRET",
      verified: true,
      backupCodes: [hashBackupCode("CDEF-5678")],
    };

    await expect(verify2FALogin(7, "CDEF-5678")).resolves.toBe(true);
    await expect(verify2FALogin(7, "CDEF-5678")).resolves.toBe(false);
    await expect(get2FAStatus(7)).resolves.toEqual({
      enabled: true,
      hasBackupCodes: false,
    });
  });
});
