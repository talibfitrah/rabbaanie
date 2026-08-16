import { describe, expect, it } from "vitest";
import { DrizzleQueryError } from "drizzle-orm";
// Deliberately NOT mocked (unlike tests/daily-diagnostic.test.ts) — this
// proves the real error-unwrapping logic against the real drizzle-orm error
// shape, not a hand-written mock of it. See server/db.ts driverErrorCode.
import { affectedRows, driverErrorCode } from "../server/db";

describe("driverErrorCode", () => {
  it("reads .code directly off a plain driver error", () => {
    expect(driverErrorCode({ code: "ER_DUP_ENTRY" })).toBe("ER_DUP_ENTRY");
  });

  it("falls through to .cause.code for an ACTUAL DrizzleQueryError instance, not a hand-shaped mock of one", () => {
    const driverError = Object.assign(new Error("Duplicate entry"), { code: "ER_DUP_ENTRY" });
    const wrapped = new DrizzleQueryError("insert into daily_diagnostic_checkins ...", [], driverError);
    expect((wrapped as any).code).toBeUndefined(); // the exact behavior driverErrorCode exists to work around
    expect(driverErrorCode(wrapped)).toBe("ER_DUP_ENTRY");
  });

  it("finds the Postgres unique-violation code the same way (pg-core wraps errors identically)", () => {
    const driverError = Object.assign(new Error("duplicate key value"), { code: "23505" });
    const wrapped = new DrizzleQueryError("insert ...", [], driverError);
    expect(driverErrorCode(wrapped)).toBe("23505");
  });

  it("returns undefined for an error with no code anywhere (not silently matched as a duplicate)", () => {
    expect(driverErrorCode(new Error("connection refused"))).toBeUndefined();
    expect(driverErrorCode(new DrizzleQueryError("select ...", [], new Error("timeout")))).toBeUndefined();
    expect(driverErrorCode(undefined)).toBeUndefined();
  });
});

describe("affectedRows", () => {
  // The conditional writes in server/db.ts treat 0 as "my update matched
  // nothing", so a driver shape this doesn't understand doesn't fail loudly —
  // it reports that every answer submission failed and that no stale claim is
  // reclaimable. Production runs Postgres; the repo's dev schema is MySQL.
  it("reads mysql2's [ResultSetHeader] shape", () => {
    expect(affectedRows([{ affectedRows: 3 }])).toBe(3);
  });

  it("reads node-postgres's QueryResult shape", () => {
    expect(affectedRows({ rowCount: 2, rows: [] })).toBe(2);
  });

  it("keeps a genuine zero as zero rather than falling through to another shape", () => {
    expect(affectedRows([{ affectedRows: 0 }])).toBe(0);
    expect(affectedRows({ rowCount: 0, rows: [] })).toBe(0);
  });

  it("returns 0 for a shape it does not recognise", () => {
    expect(affectedRows(undefined)).toBe(0);
    expect(affectedRows({})).toBe(0);
  });
});
