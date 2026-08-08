import { describe, expect, it, vi } from "vitest";
import { attachSpecialistUser } from "../server/db";

function fakeDb(userRows: any[]) {
  return {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(userRows),
      }),
    }),
  } as any;
}

describe("attachSpecialistUser", () => {
  it("attaches functionRoles from getUserFunctions to the specialist", async () => {
    const getUserFunctions = vi.fn().mockResolvedValue([{ functionRole: "imam" }, { functionRole: "specialist" }]);
    const db = fakeDb([{ id: 1, name: "Dr. Test", email: "t@test.com" }]);

    const result = await attachSpecialistUser(db, { userId: 1, city: "Rotterdam" }, { getUserFunctions });

    expect(result?.functionRoles).toEqual(["imam", "specialist"]);
    expect(result?.user).toEqual({ id: 1, name: "Dr. Test", email: "t@test.com" });
    expect(result?.city).toBe("Rotterdam");
  });

  it("gives an empty functionRoles array when the specialist has none on file", async () => {
    const getUserFunctions = vi.fn().mockResolvedValue([]);
    const db = fakeDb([{ id: 2, name: "No Roles", email: "n@test.com" }]);

    const result = await attachSpecialistUser(db, { userId: 2 }, { getUserFunctions });

    expect(result?.functionRoles).toEqual([]);
  });

  it("returns null when the profile's user row is missing", async () => {
    const getUserFunctions = vi.fn().mockResolvedValue([{ functionRole: "vader" }]);
    const db = fakeDb([]);

    const result = await attachSpecialistUser(db, { userId: 3 }, { getUserFunctions });

    expect(result).toBeNull();
    expect(getUserFunctions).not.toHaveBeenCalled();
  });
});
