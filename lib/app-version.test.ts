import { describe, expect, it } from "vitest";
import { isNewerVersion, parseTag, pickApkAsset } from "./app-version";

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

describe("pickApkAsset", () => {
  it("returns the download URL of the first .apk asset", () => {
    expect(
      pickApkAsset([
        { name: "checksums.txt", browser_download_url: "https://x/checksums.txt" },
        { name: "rabbaanie-v1.2.0.apk", browser_download_url: "https://x/rabbaanie-v1.2.0.apk" },
      ])
    ).toBe("https://x/rabbaanie-v1.2.0.apk");
  });
  it("returns null when no .apk asset exists", () => {
    expect(pickApkAsset([])).toBeNull();
    expect(pickApkAsset([{ name: "notes.md", browser_download_url: "https://x/notes.md" }])).toBeNull();
  });
});
