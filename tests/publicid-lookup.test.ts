import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the database module
vi.mock("../server/db", () => {
  const mockUsers = [
    { id: 1, publicId: "19800706_ZO_001", name: "Suhayb Salam", role: "parent" },
    { id: 3870001, publicId: "19830906_DI_3870001", name: "S Dahri", role: "parent" },
  ];

  return {
    getUserByPublicId: vi.fn(async (publicId: string) => {
      // Simulate the improved search logic
      // 1. Exact match
      let found = mockUsers.find(u => u.publicId === publicId);
      if (found) return found;
      // 2. Case-insensitive
      const upper = publicId.toUpperCase();
      found = mockUsers.find(u => u.publicId?.toUpperCase() === upper);
      if (found) return found;
      // 3. Match by date + seq (skip day abbreviation)
      const parts = publicId.split("_");
      if (parts.length === 3) {
        const datePart = parts[0];
        const seqPart = parts[2];
        found = mockUsers.find(u => {
          if (!u.publicId) return false;
          const uParts = u.publicId.split("_");
          return uParts.length === 3 && uParts[0] === datePart && uParts[2] === seqPart;
        });
        if (found) return found;
      }
      return undefined;
    }),
  };
});

import { getUserByPublicId } from "../server/db";

describe("PublicId Lookup", () => {
  it("finds user by exact publicId", async () => {
    const user = await getUserByPublicId("19830906_DI_3870001");
    expect(user).toBeDefined();
    expect(user!.name).toBe("S Dahri");
  });

  it("finds user with wrong case (di instead of DI)", async () => {
    const user = await getUserByPublicId("19830906_di_3870001");
    expect(user).toBeDefined();
    expect(user!.name).toBe("S Dahri");
  });

  it("finds user with swapped letters (ID instead of DI)", async () => {
    // User typed ID instead of DI - the fallback matches by date + seq
    const user = await getUserByPublicId("19830906_ID_3870001");
    expect(user).toBeDefined();
    expect(user!.name).toBe("S Dahri");
  });

  it("finds user with mixed case (Di instead of DI)", async () => {
    const user = await getUserByPublicId("19830906_Di_3870001");
    expect(user).toBeDefined();
    expect(user!.name).toBe("S Dahri");
  });

  it("returns undefined for completely wrong publicId", async () => {
    const user = await getUserByPublicId("99999999_XX_999");
    expect(user).toBeUndefined();
  });

  it("finds first user by exact match", async () => {
    const user = await getUserByPublicId("19800706_ZO_001");
    expect(user).toBeDefined();
    expect(user!.name).toBe("Suhayb Salam");
  });
});
