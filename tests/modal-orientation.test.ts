import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Every react-native <Modal> must declare supportedOrientations, and that list
 * must include landscape.
 *
 * app.config.ts sets `orientation: "default"`, which makes Expo write all four
 * UISupportedInterfaceOrientations into the iOS Info.plist. A <Modal> does not
 * inherit them. Under the New Architecture — `newArchEnabled: true` — codegen
 * gives the prop a non-zero default: the generated
 * ModalHostViewProps has
 *
 *   supportedOrientations{static_cast<...>(ModalHostViewSupportedOrientations::Portrait)}
 *
 * so an omitted prop is a portrait-only mask, and the `mask == 0` iPad carve-out
 * in React/Fabric/.../RCTModalHostViewComponentView.mm never fires. Opening such
 * a modal on an iPad (or an iPhone) held in landscape force-rotates the whole
 * app, then rotates it back on dismiss.
 *
 * This asserts PRESENCE and content, not absence: a gate that only checked that
 * nothing bad appeared would let the prop be dropped again in silence. The
 * opening tag is parsed brace- and quote-aware rather than matched line by line,
 * so reformatting the JSX cannot break the assertion.
 */

// All fourteen Modals live in app/ and components/ today, but a Modal added
// under modules/ or widgets/ would be invisible to a scanner that only walks
// those two — and invisible means silently unguarded, not failing. Walk every
// directory that can hold a screen.
const ROOTS = ["app", "components", "modules", "widgets"];

/** Index of the `>` that closes the opening tag starting at `start`. */
function findTagEnd(src: string, start: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      // A backslash escapes the next character, so `\`` inside a template
      // literal does not close it.
      if (c === "\\") {
        i++;
        continue;
      }
      if (c === quote) quote = null;
      continue;
    }
    // Comments are skipped BEFORE the quote check, because an apostrophe in
    // prose is not a string delimiter. `onRequestClose={() => { // the user's
    // choice ... }}` is idiomatic and valid, and treating that apostrophe as an
    // opening quote made the scan run past the tag's `>` to the end of the file
    // and throw — failing a test:release gate on correct code, in a
    // comment-dense codebase. The tempting repair for that failure is to loosen
    // the parser, which is exactly what this guard exists to prevent.
    //
    // `/>` is unaffected: a self-closing slash is followed by `>`, not by `*`
    // or `/`, so it falls through to the depth check below.
    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      if (end === -1) break;
      i = end + 1;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      const nl = src.indexOf("\n", i);
      if (nl === -1) break;
      i = nl;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return i;
  }
  throw new Error(`unterminated <Modal> opening tag at offset ${start}`);
}

/** Every `<Modal …>` opening tag under app/ and components/, as `file:line` → tag. */
function modalTags(): Array<{ where: string; tag: string }> {
  const found: Array<{ where: string; tag: string }> = [];
  for (const root of ROOTS) {
    const dir = path.resolve(__dirname, "..", root);
    for (const rel of readdirSync(dir, { recursive: true, encoding: "utf8" })) {
      if (!rel.endsWith(".tsx")) continue;
      const file = path.join(dir, rel);
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/<Modal(?=[\s>/])/g)) {
        const line = src.slice(0, m.index).split("\n").length;
        found.push({
          where: `${root}/${rel}:${line}`,
          tag: src.slice(m.index, findTagEnd(src, m.index)),
        });
      }
    }
  }
  return found;
}

const TAGS = modalTags();

describe("react-native Modal orientation", () => {
  it("finds the Modal call sites", () => {
    // Presence check on the scanner itself: a walk that silently matched
    // nothing would make the assertion below vacuously pass.
    //
    // Pinned to the real count, not > 0. A scanner that regressed to finding
    // one tag out of fourteen would still pass a > 0 check while thirteen
    // Modals went unguarded — the same vacuous-pass shape this assertion
    // exists to prevent, just further along. Raise the floor when a Modal is
    // added; a failure here means the scanner broke or the count moved, and
    // both are worth a human look.
    expect(TAGS.length).toBeGreaterThanOrEqual(14);
  });

  it("declares supportedOrientations on every Modal, including landscape", () => {
    // ponytail: reads the orientations out of the tag text, so hoisting the
    // array into a shared constant would trip this. Swap the check for the
    // constant's name on the day that extraction happens.
    const bad = TAGS.filter(
      ({ tag }) =>
        !tag.includes("supportedOrientations") || !tag.includes("landscape"),
    );
    expect(bad.map((b) => b.where)).toEqual([]);
  });
});
