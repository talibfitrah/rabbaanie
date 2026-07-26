import { describe, expect, it } from "vitest";
import { evaluateLatest, isNewerVersion, parseTag } from "./app-version";

describe("parseTag", () => {
  it("strips the v prefix from a release tag", () => {
    expect(parseTag("v1.2.0")).toBe("1.2.0");
  });
  it("rejects malformed tags", () => {
    expect(parseTag("1.2.0")).toBeNull();
    expect(parseTag("v1.2")).toBeNull();
    expect(parseTag("v1.2.0-beta")).toBeNull();
    expect(parseTag("")).toBeNull();
  });
});

describe("isNewerVersion", () => {
  it("detects newer patch, minor, and major versions", () => {
    expect(isNewerVersion("1.2.1", "1.2.0")).toBe(true);
    expect(isNewerVersion("1.3.0", "1.2.9")).toBe(true);
    expect(isNewerVersion("2.0.0", "1.99.99")).toBe(true);
  });
  it("compares numerically, not as strings", () => {
    expect(isNewerVersion("1.2.10", "1.2.9")).toBe(true); // string compare would say false
    expect(isNewerVersion("1.10.0", "1.9.0")).toBe(true);
  });
  it("is false for equal or older versions", () => {
    expect(isNewerVersion("1.2.0", "1.2.0")).toBe(false);
    expect(isNewerVersion("1.1.29", "1.2.0")).toBe(false);
  });
  it("is false when either side is malformed", () => {
    expect(isNewerVersion("abc", "1.2.0")).toBe(false);
    expect(isNewerVersion("1.2.0", "")).toBe(false);
  });
});

describe("evaluateLatest", () => {
  const apkUrl = "https://api.rabbaanie.com/downloads/rabbaanie-v1.3.0.apk";

  it("returns the pending update when the manifest names a newer version with a url", () => {
    expect(evaluateLatest({ version: "1.3.0", apkUrl }, "1.2.0")).toEqual({ version: "1.3.0", apkUrl });
  });
  it("returns null when the manifest version equals or is older than installed", () => {
    expect(evaluateLatest({ version: "1.2.0", apkUrl }, "1.2.0")).toBeNull();
    expect(evaluateLatest({ version: "1.1.9", apkUrl }, "1.2.0")).toBeNull();
  });
  it("returns null when version or apkUrl is missing", () => {
    expect(evaluateLatest({ apkUrl }, "1.2.0")).toBeNull();
    expect(evaluateLatest({ version: "1.3.0" }, "1.2.0")).toBeNull();
    expect(evaluateLatest({}, "1.2.0")).toBeNull();
    expect(evaluateLatest(null, "1.2.0")).toBeNull();
  });
  it("returns null for a malformed version", () => {
    expect(evaluateLatest({ version: "nightly", apkUrl }, "1.2.0")).toBeNull();
    expect(evaluateLatest({ version: "1.3", apkUrl }, "1.2.0")).toBeNull();
  });
});
