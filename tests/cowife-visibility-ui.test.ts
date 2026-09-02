import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("co-wife visibility UI", () => {
  const src = readFileSync("app/(tabs)/messages.tsx", "utf8");

  it("husband has the switch; wife has a names-only list with the co-wife badge", () => {
    expect(src).toContain("trpc.links.coWivesVisibility");
    expect(src).toContain("trpc.links.setCoWivesVisible");
    expect(src).toContain("trpc.links.coWives");
    expect(src).toContain("الأخت الشريكة");
    expect(src).toContain("السماح لزوجاتي بمعرفة بعضهن");
  });
});
