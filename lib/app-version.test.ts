import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  evaluateLatest,
  isNewerVersion,
  isTrustedApkUrl,
  parseTag,
} from "./app-version";

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
    expect(evaluateLatest({ version: "1.3.0", apkUrl }, "1.2.0")).toEqual({
      version: "1.3.0",
      apkUrl,
    });
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
  it("returns null when apkUrl is not a trusted download URL", () => {
    // Wrong host, http, and a filename/version mismatch must all be rejected,
    // even though the version string itself is well-formed and newer.
    expect(
      evaluateLatest(
        { version: "1.3.0", apkUrl: "https://evil.com/rabbaanie-v1.3.0.apk" },
        "1.2.0",
      ),
    ).toBeNull();
    expect(
      evaluateLatest(
        {
          version: "1.3.0",
          apkUrl: "http://api.rabbaanie.com/downloads/rabbaanie-v1.3.0.apk",
        },
        "1.2.0",
      ),
    ).toBeNull();
    expect(
      evaluateLatest(
        {
          version: "1.3.0",
          apkUrl: "https://api.rabbaanie.com/downloads/rabbaanie-v9.9.9.apk",
        },
        "1.2.0",
      ),
    ).toBeNull();
  });
});

describe("isTrustedApkUrl", () => {
  it("accepts our https host with the matching versioned filename", () => {
    expect(
      isTrustedApkUrl(
        "https://api.rabbaanie.com/downloads/rabbaanie-v1.2.2.apk",
        "1.2.2",
      ),
    ).toBe(true);
  });
  it("rejects non-https, foreign hosts, look-alike hosts, and userinfo tricks", () => {
    expect(
      isTrustedApkUrl(
        "http://api.rabbaanie.com/downloads/rabbaanie-v1.2.2.apk",
        "1.2.2",
      ),
    ).toBe(false);
    expect(
      isTrustedApkUrl("https://evil.com/rabbaanie-v1.2.2.apk", "1.2.2"),
    ).toBe(false);
    expect(
      isTrustedApkUrl(
        "https://api.rabbaanie.com.evil.com/rabbaanie-v1.2.2.apk",
        "1.2.2",
      ),
    ).toBe(false);
    expect(
      isTrustedApkUrl(
        "https://api.rabbaanie.com@evil.com/rabbaanie-v1.2.2.apk",
        "1.2.2",
      ),
    ).toBe(false);
  });
  it("rejects a filename whose version does not match the manifest version", () => {
    expect(
      isTrustedApkUrl(
        "https://api.rabbaanie.com/downloads/rabbaanie-v1.2.3.apk",
        "1.2.2",
      ),
    ).toBe(false);
  });
  it("rejects wrong filenames and query strings", () => {
    expect(
      isTrustedApkUrl("https://api.rabbaanie.com/downloads/evil.apk", "1.2.2"),
    ).toBe(false);
    expect(
      isTrustedApkUrl(
        "https://api.rabbaanie.com/downloads/rabbaanie-v1.2.2.apk?x=1",
        "1.2.2",
      ),
    ).toBe(false);
  });
});

/**
 * The version identity every API request carries, and why the platform half
 * matters as much as the version half.
 *
 * isVersionRefused above compares X-App-Version against ONE global minVersion.
 * With no platform on the request the server cannot scope that minimum to
 * Android — so raising minVersion to retire an old Android build also
 * hard-blocks every older iOS install, on app/_layout.tsx's undismissable
 * VersionBlockScreen, whose single iOS button opens a site carrying no iOS
 * download. X-App-Platform is what makes a per-platform minimum possible.
 *
 * Six call sites send these headers. A seventh that writes "X-App-Version" by
 * hand would send the version without the platform and silently reopen the
 * hole, so this asserts the absence of that shape as well as the presence of
 * the shared constant — an absence-only check would pass just as happily if
 * every header disappeared.
 */
describe("client version headers", () => {
  const repoRoot = path.resolve(__dirname, "..");
  const HEADER_FILES = [
    "lib/authed-fetch.ts",
    "lib/trpc.ts",
    "lib/_core/api.ts",
  ];

  // A hard-coded list of files is precisely what cannot see a seventh call
  // site: a new fetch helper anywhere else passes unexamined, and invisible
  // means silently unguarded rather than failing. So the absence check walks
  // the app's own source, over the same roots as the sibling scanners in
  // tests/modal-orientation.test.ts and tests/adhan-ios-sound.test.ts.
  // node_modules lies outside every one of them.
  const SOURCE_ROOTS = [
    "app",
    "lib",
    "components",
    "hooks",
    "widgets",
    "modules",
    // constants/ is where getApiBaseUrl already lives, so a future fetch helper
    // plausibly sits there too. Omitting it made this scanner exactly the
    // hard-coded-blind-spot its own docstring argues against.
    "constants",
  ];

  // The one file allowed to write the header: CLIENT_VERSION_HEADERS defines
  // both halves together there, which is the whole point of the constant.
  const DEFINES_THE_HEADERS = "hooks/use-updates.ts";

  // Quoted, in any of the three quote styles. A headers object cannot avoid
  // quoting the key, while prose naming it does not quote it — lib/app-version.ts
  // discusses X-App-Version in a comment and must not be flagged for it.
  //
  // ponytail: a computed or concatenated key is past what a source scan can
  // see. Reach for the TypeScript AST, as tests/adhan-ios-sound.test.ts does,
  // if that shape ever lands; no call site writes it today.
  const HAND_WRITES_IT = /["'`]X-App-Version["'`]/;

  // Whitespace normalised, for the reason spelled out in
  // tests/subscription-auth.test.ts: a multi-token source match goes red on
  // correct code the day prettier breaks the line differently, and the
  // tempting fix for THAT is to loosen the pattern, which deletes the guard.
  // Collapsing whitespace keeps the match exact and formatter-independent.
  const flat = (rel: string) =>
    fs.readFileSync(path.join(repoRoot, rel), "utf8").replace(/\s+/g, " ");

  /** Every .ts/.tsx file of the app's own source, repo-relative. */
  const sourceFiles = () =>
    SOURCE_ROOTS.flatMap((root) =>
      fs
        .readdirSync(path.join(repoRoot, root), {
          recursive: true,
          encoding: "utf8",
        })
        // Colocated tests quote the header to talk ABOUT it, and ship nowhere.
        .filter((rel) => /\.tsx?$/.test(rel) && !/\.test\.tsx?$/.test(rel))
        .map((rel) => `${root}/${rel}`),
    );

  // Read as source, not imported. hooks/use-updates pulls in expo-application,
  // expo-file-system and react-native; importing it here to read one constant
  // would make this file — the first entry in test:release — depend on mocking
  // the whole native surface. The names matched below are identifiers and
  // string literals, so they survive a reformat; only a real rename or deletion
  // moves them.
  it("declares both halves of the identity in one shared place", () => {
    const src = flat(DEFINES_THE_HEADERS);
    expect(src).toContain("export const CLIENT_VERSION_HEADERS");
    expect(src).toContain('"X-App-Version": INSTALLED_VERSION');
    expect(src).toContain('"X-App-Platform": Platform.OS');
    // ...and NOT on web. A custom header must be named individually in the
    // API's Access-Control-Allow-Headers, and if the live allowlist enumerates
    // headers rather than using "*", adding one breaks EVERY browser call.
    // React Native's fetch has no CORS so native is free; web is not a store
    // platform, so a per-store minVersion has nothing to scope there anyway.
    expect(
      src,
      "the web exclusion was dropped — X-App-Platform would then ride every " +
        "browser request and can fail the CORS preflight against the API",
    ).toContain('Platform.OS === "web" ? {} : { "X-App-Platform"');
  });

  it("spreads the shared constant at every known call site", () => {
    for (const rel of HEADER_FILES) {
      expect(
        flat(rel).includes("...CLIENT_VERSION_HEADERS"),
        `${rel} no longer sends the shared version headers at all`,
      ).toBe(true);
    }
  });

  it("lets no file outside the shared constant write the header by hand", () => {
    const files = sourceFiles();
    // Guard the guard, and pinned to the real total rather than > 0 for the
    // same reason tests/modal-orientation.test.ts pins its count: a root
    // deleted from SOURCE_ROOTS takes its files out of scope in SILENCE, which
    // is the same invisible-means-unguarded failure the hard-coded file list
    // had, moved one level up. A root that is renamed or moved on disk throws
    // ENOENT from readdirSync instead, so this floor covers the quiet half.
    //
    // Honest about its reach: at 236 files today it catches losing app (113),
    // lib (71) or components (29); losing widgets (11) or modules (2) stays
    // under the noise. Raise it as the app grows — a drop is worth a look.
    expect(files.length).toBeGreaterThanOrEqual(225);

    const writers = files.filter((rel) => HAND_WRITES_IT.test(flat(rel)));
    // One assertion, both directions. The exempt file being REQUIRED in the
    // result is the positive control: it proves the pattern still recognises a
    // real header write and that the walk actually reaches hooks/, so an
    // absence-only pass cannot come from a scan that matches nothing anywhere.
    expect(
      writers,
      "a file outside hooks/use-updates.ts hand-writes X-App-Version — it " +
        "would send the version without the platform, so the server cannot " +
        "scope minVersion and every older iOS install is blocked by an " +
        "Android release. Spread CLIENT_VERSION_HEADERS instead",
    ).toEqual([DEFINES_THE_HEADERS]);
  });
});
