import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The attachment bounds live in two repos with no shared types, which is the
 * exact shape of the three contract breaks this project has already had —
 * /auth/register, the subscriber-info payload, and the subscribe screen. Each
 * was found only after users hit it.
 *
 * The client checks these bounds so a breach is refused at pick time with a
 * message the parent can act on; the server checks them because a client is not
 * a trust boundary. If the two disagree, one of two failures follows: the client
 * refuses a photo the server would have taken, or it sends one the server drops
 * and the parent gets confident advice about an image the model never saw.
 *
 * Read from the API source rather than duplicated as a literal here, so this
 * cannot pass by being updated in lockstep with only one side.
 */
/**
 * Resolved relative to this repo, and SKIPPED rather than failed when the API
 * checkout is not beside it. An absolute path pinned this to one machine — it
 * would have failed in CI and on any other developer's box, and a test that
 * cannot run anywhere else gets deleted rather than fixed.
 */
const API = join(__dirname, "..", "..", "..", "rabbaanie-api", "server", "chat-attachments.ts");
const haveApi = existsSync(API);
if (!haveApi) {
  // Loud, not silent. A skipped test reads as a passing one in CI output, and
  // this is the only thing standing between the two repos' bounds and the
  // drift that has already bitten /auth/register, the subscriber payload and
  // the subscribe screen. If this line appears, the guard did NOT run.
  console.warn(
    `[attachment-contract] SKIPPED: ${API} not found. ` +
      "The cross-repo bound check did not run — clone rabbaanie-api beside this repo to enable it.",
  );
}

function apiConstant(name: string): number {
  const src = readFileSync(API, "utf8");
  const m = new RegExp(`export const ${name} = ([0-9_]+);`).exec(src);
  if (!m) throw new Error(`${name} not found in ${API} — the server contract moved`);
  return Number(m[1].replace(/_/g, ""));
}

function clientConstant(name: string): number {
  const src = readFileSync(join(__dirname, "..", "app", "ai-chat.tsx"), "utf8");
  const m = new RegExp(`const ${name} = ([0-9_]+);`).exec(src);
  if (!m) throw new Error(`${name} not found in app/ai-chat.tsx`);
  return Number(m[1].replace(/_/g, ""));
}

describe.skipIf(!haveApi)("attachment bounds agree across the two repos", () => {
  it("is reading the API source it claims to", () => {
    // Guards the skip: if the path resolves but to the wrong file, every
    // comparison below would throw rather than pass vacuously — but this says
    // so directly.
    expect(readFileSync(API, "utf8")).toContain("export const MAX_IMAGES");
  });

  it("finds both sides at all", () => {
    // Self-check: if either lookup silently returned NaN, every comparison
    // below would be vacuous.
    expect(Number.isFinite(apiConstant("MAX_IMAGES"))).toBe(true);
    expect(Number.isFinite(clientConstant("MAX_IMAGE_ATTACHMENTS"))).toBe(true);
  });

  it("caps the image count at the same number", () => {
    // Like for like: the client constant counts IMAGES, matching the server's
    // MAX_IMAGES. It previously capped all attachments — images plus documents
    // — so the two sides bounded different quantities while this assertion made
    // them look identical.
    expect(clientConstant("MAX_IMAGE_ATTACHMENTS")).toBe(apiConstant("MAX_IMAGES"));
  });

  it("caps the image size at the same number", () => {
    expect(clientConstant("MAX_ATTACHMENT_DATA_URL_LENGTH")).toBe(
      apiConstant("MAX_IMAGE_DATA_URL_LENGTH"),
    );
  });
});
