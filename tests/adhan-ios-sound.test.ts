import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { ADHAN_SOUND_IDS } from "../lib/adhan-sound-ids.js";

/**
 * iOS delivered prayer notifications SILENTLY, because the scheduled content
 * carried no `sound` field at all. Android was fine — it gets its sound from
 * the notification channel named by `trigger.channelId`, which is an
 * Android-only concept iOS ignores. expo-notifications' iOS layer only assigns
 * `content.sound` inside an `if let sound = sound` guard, so an absent field
 * leaves UNNotificationContent.sound nil, and nil means no sound whatsoever.
 *
 * Nothing threw, nothing logged, and the Android-only suite in
 * tests/notifications.test.ts stayed green throughout — which is exactly how
 * this survived to the eve of the first App Store submission.
 *
 * Platform.OS is read at call time inside lib/notifications.ts (never captured
 * at module scope), so one mutable mock lets this file drive both branches.
 * vi.mock is per-file, and tests/notifications.test.ts pins itself to Android.
 */
const mockPlatform = vi.hoisted(() => ({
  OS: "ios" as "ios" | "android" | "web",
}));
vi.mock("react-native", () => ({ Platform: mockPlatform }));

vi.mock("expo-notifications", () => ({
  setNotificationChannelAsync: vi.fn().mockResolvedValue(null),
  getPermissionsAsync: vi.fn().mockResolvedValue({ status: "granted" }),
  requestPermissionsAsync: vi.fn().mockResolvedValue({ status: "granted" }),
  scheduleNotificationAsync: vi.fn().mockResolvedValue("notif-id-123"),
  cancelAllScheduledNotificationsAsync: vi.fn().mockResolvedValue(undefined),
  cancelScheduledNotificationAsync: vi.fn().mockResolvedValue(undefined),
  getAllScheduledNotificationsAsync: vi.fn().mockResolvedValue([]),
  AndroidImportance: { HIGH: 4, DEFAULT: 3, MAX: 5, LOW: 2, MIN: 1, NONE: 0 },
  AndroidNotificationPriority: {
    MAX: "max",
    HIGH: "high",
    DEFAULT: "default",
    LOW: "low",
    MIN: "min",
  },
  AndroidNotificationVisibility: { PUBLIC: 1, PRIVATE: 0, SECRET: -1 },
  SchedulableTriggerInputTypes: {
    DATE: "date",
    TIME_INTERVAL: "timeInterval",
    WEEKLY: "weekly",
    DAILY: "daily",
  },
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
  },
}));

// The Android alarm path lib/iqamah-silence.ts calls into, stubbed at the same
// JS boundary tests/iqamah-silence-native.test.ts uses. Nothing here asserts on
// it; it only has to not reach for a native module that does not exist in node.
vi.mock("../modules/iqamah-alarm/src", () => ({
  isAvailable: () => false,
  scheduleSilenceAlarms: vi.fn().mockResolvedValue(0),
  cancelSilenceAlarms: vi.fn().mockResolvedValue(undefined),
  captureRingerModeIfNeeded: vi.fn().mockResolvedValue(undefined),
}));

import {
  prayerChannelId,
  scheduleAllNotifications,
  sendTestNotification,
  DEFAULT_NOTIFICATION_PREFS,
  type AdhanSoundOption,
  ADHAN_SOUND_OPTIONS,
} from "../lib/notifications";
import { scheduleIqamahSilence } from "../lib/iqamah-silence";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";

const SOUNDS_DIR = path.resolve(__dirname, "../assets/sounds");

/**
 * Duration straight out of the CAF header, so this needs no macOS binary and
 * runs anywhere. `desc` holds the sample rate, `pakt` the valid frame count —
 * the same two numbers `afinfo` divides to print "estimated duration".
 */
function cafDurationSeconds(file: string): number {
  const buf = fs.readFileSync(file);
  expect(buf.toString("ascii", 0, 4)).toBe("caff");
  let off = 8;
  let sampleRate = 0;
  let validFrames = 0;
  while (off + 12 <= buf.length) {
    const type = buf.toString("ascii", off, off + 4);
    const size = Number(buf.readBigInt64BE(off + 4));
    const body = off + 12;
    if (type === "desc") sampleRate = buf.readDoubleBE(body);
    if (type === "pakt") validFrames = Number(buf.readBigInt64BE(body + 8));
    if (size < 0) break;
    off = body + size;
  }
  expect(sampleRate).toBeGreaterThan(0);
  expect(validFrames).toBeGreaterThan(0);
  return validFrames / sampleRate;
}

function storageWith(adhanSound: AdhanSoundOption) {
  (AsyncStorage.getItem as any).mockImplementation((key: string) => {
    if (key === "@notification_prefs")
      return JSON.stringify({ ...DEFAULT_NOTIFICATION_PREFS, adhanSound });
    if (key === "@prayer_location")
      return JSON.stringify({
        country: "Nederland",
        city: "Amsterdam",
        lat: 52.37,
        lng: 4.89,
        tz: "Europe/Amsterdam",
      });
    if (key === "@prayer_method") return "uoif";
    return null;
  });
}

const callsOfType = (type: string) =>
  (Notifications.scheduleNotificationAsync as any).mock.calls
    .map((c: any[]) => c[0])
    .filter((req: any) => req?.content?.data?.type === type);

// ============ REPO-WIDE SILENT-NOTIFICATION SCAN ============

const REPO_ROOT = path.resolve(__dirname, "..");
const SCHEDULING_DIRS = [
  "app",
  "lib",
  "components",
  "hooks",
  "widgets",
  "modules",
];
const SCHEDULE_CALL = "scheduleNotificationAsync";

/**
 * Notifications that are supposed to arrive without a sound, keyed by a
 * constant that appears inside their own scheduling call. Both mirror an
 * Android channel that is itself silent, so handing them a sound on iOS would
 * be the same bug pointed the other way.
 */
const DELIBERATELY_SILENT = [
  {
    marker: "NOTICE_ID",
    why:
      "lib/monitoring-notice.ts: showMonitoringNotice returns before scheduling on any " +
      "non-Android platform, and its channel is LOW importance on purpose — a standing " +
      "Play-policy disclosure the child cannot swipe away, not an alert.",
  },
  {
    marker: "WIDGET_CHANNEL_ID",
    why:
      "lib/daily-advice-notification.ts: showAdviceWidget returns before scheduling on any " +
      "non-Android platform. The whole construct is sticky + autoDismiss: false — Android-only " +
      "fields standing in for a home-screen widget Expo cannot build — and its channel is LOW " +
      "with sound: undefined. The exemption rests on the early return, not on the silence: " +
      "iOS has no sticky notification, so without it this degraded into an ordinary " +
      "Notification Center entry re-posted on every advice change.",
  },
];

/** `(((x)))` → `x`. A spread wraps its conditional in parentheses, and the AST keeps them. */
const unwrap = (node: ts.Expression): ts.Expression =>
  ts.isParenthesizedExpression(node) ? unwrap(node.expression) : node;

/**
 * A `sound` that is written but silent. `sound: undefined` leaves nil exactly as
 * an absent field does.
 *
 * ponytail: bare literals only. `sound: undefined as any` still reads as a
 * sound, because unwrap() strips parentheses and nothing else. Teach unwrap()
 * about `as` if that shape ever lands — no call site writes it today.
 */
const isSilentValue = (node: ts.Expression): boolean =>
  node.kind === ts.SyntaxKind.NullKeyword ||
  (ts.isIdentifier(node) && node.text === "undefined") ||
  // `sound: false` is not a near-miss, it is the IDIOMATIC expo spelling for
  // "mute": expo-notifications maps false to `content.sound = .none`
  // (Records.swift). Recognising only null/undefined caught the shape nobody
  // writes and missed the one a developer silencing an iOS notification would
  // actually reach for — so the sweep certified as covered the single most
  // likely way to reintroduce the bug it exists to catch.
  node.kind === ts.SyntaxKind.FalseKeyword;

/**
 * Does this object literal assign a `sound` of its own, with a value that is
 * not visibly nothing?
 *
 * Asking only whether a property NAMED `sound` exists is not enough: iOS reads
 * `sound: undefined` and `sound: null` the same way it reads no field at all —
 * UNNotificationContent.sound stays nil and the notification is mute — and
 * lib/daily-advice-notification.ts already writes `sound: undefined` on the
 * channel it wants silent, so the shape is one keystroke from a content object.
 *
 * The test is deliberately "not visibly nothing" rather than "visibly
 * something". Real sounds here are call results (`adhanSoundFile(prefs…)`), and
 * demanding a literal would fail every one of them. So this rejects what it can
 * see is silent and accepts the rest — a value that only turns out nullish at
 * runtime is past what source alone can decide.
 */
const namesSound = (node: ts.Expression): boolean => {
  const inner = unwrap(node);
  return (
    ts.isObjectLiteralExpression(inner) &&
    inner.properties.some(
      (p) =>
        p.name?.getText() === "sound" &&
        !(ts.isPropertyAssignment(p) && isSilentValue(unwrap(p.initializer))),
    )
  );
};

/**
 * Which side of `cond ? … : …` iOS actually runs.
 *
 * The sense of the guard has to be evaluated, not pattern-matched. Asking
 * whether the condition TEXT mentions `"ios"` says yes to
 * `Platform.OS !== "ios" ? { sound } : {}`, which hands the sound to everything
 * EXCEPT iOS — the exact bug this file exists to catch, reported as covered.
 * That is not a hypothetical shape: lib/iqamah-silence.ts writes
 * `Platform.OS !== "android"` in four places already.
 *
 * Only a `Platform.OS` comparison against a string literal is decidable here;
 * anything else returns undefined and is treated as giving iOS no sound, the
 * same safe direction the rest of this scanner takes.
 */
const iosBranch = (
  cond: ts.Expression,
): "whenTrue" | "whenFalse" | undefined => {
  const c = unwrap(cond);
  if (!ts.isBinaryExpression(c)) return undefined;
  const negated =
    c.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken;
  if (
    !negated &&
    c.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken
  )
    return undefined;
  const sides = [unwrap(c.left), unwrap(c.right)];
  const literal = sides.find(ts.isStringLiteral);
  if (!literal || !sides.some((s) => s.getText() === "Platform.OS"))
    return undefined;
  return (literal.text === "ios") !== negated ? "whenTrue" : "whenFalse";
};

/**
 * Whether iOS is actually handed a sound: either the content assigns one
 * outright, or a `...(Platform.OS … ? … : …)` spread supplies one on the side
 * iOS takes. Nothing else can — iOS has no notification channels, so an Android
 * channel's sound never reaches it.
 */
const iosGetsSound = (content: ts.ObjectLiteralExpression): boolean =>
  namesSound(content) ||
  content.properties.some((p) => {
    if (!ts.isSpreadAssignment(p)) return false;
    const branch = unwrap(p.expression);
    if (!ts.isConditionalExpression(branch)) return false;
    const taken = iosBranch(branch.condition);
    return taken !== undefined && namesSound(branch[taken]);
  });

/** The literal `content: { … }` of a scheduling call, if it has one. */
function contentOf(
  call: ts.CallExpression,
): ts.ObjectLiteralExpression | undefined {
  const [request] = call.arguments;
  if (!request || !ts.isObjectLiteralExpression(request)) return undefined;
  const prop = request.properties.find((p) => p.name?.getText() === "content");
  return prop &&
    ts.isPropertyAssignment(prop) &&
    ts.isObjectLiteralExpression(prop.initializer)
    ? prop.initializer
    : undefined;
}

/**
 * A reference to the scheduler that is not the callee of a call — an alias.
 *
 * `const later = Notifications.scheduleNotificationAsync` and
 * `import { scheduleNotificationAsync as later }` both reach the scheduler
 * through a name this scanner cannot follow, so the notification they send is
 * invisible to it while the floors below still count the untouched sites and
 * pass. Recorded as a site with no proven sound, which makes the sweep name the
 * alias instead of quietly certifying a file it could not read.
 *
 * Following the alias to its call would need a type checker and a program, not
 * a standalone parse. Refusing to certify the file is the cheap half, and it is
 * the half that matters: the sweep fails either way.
 */
const aliases = (id: ts.Identifier): boolean => {
  const parent = id.parent;
  if (ts.isCallExpression(parent)) return parent.expression !== id;
  if (ts.isPropertyAccessExpression(parent) && parent.name === id)
    return !(
      ts.isCallExpression(parent.parent) && parent.parent.expression === parent
    );
  // `import { scheduleNotificationAsync }` keeps the name, so calls through it
  // are still visible; `import { scheduleNotificationAsync as x }` is not.
  if (ts.isImportSpecifier(parent)) return parent.propertyName === id;
  return true;
};

/**
 * Every scheduleNotificationAsync call in one module, read off the TypeScript AST.
 *
 * Parsed rather than brace-matched. The scanner that shipped here first counted
 * raw `{` and `}`, which meant it had to be taught about string literals,
 * template substitutions and comments — and it knew about none of them. A
 * single `{` inside an Arabic or Dutch notification body slid the slice one
 * object to the right, and the borrowed object's `sound` then read as the
 * notification's own: a mute notification reporting as covered, which is
 * precisely the vacuous pass this file exists to prevent. The repo already
 * ships the parser that `pnpm check` runs, so it does the slicing now.
 *
 * A call whose `content` is not a literal object cannot be read this way and is
 * reported as having no iOS sound. That is the safe direction — the guard says
 * so out loud rather than waving through what it could not check.
 */
function callSitesIn(file: string, src: string) {
  const sites: { at: string; source: string; hasIosSound: boolean }[] = [];
  const sourceFile = ts.createSourceFile(
    file,
    src,
    ts.ScriptTarget.Latest,
    true,
  );
  const record = (node: ts.Node, hasIosSound: boolean) => {
    const { line } = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(sourceFile),
    );
    sites.push({
      at: `${file}:${line + 1}`,
      source: node.getText(),
      hasIosSound,
    });
  };
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const name = ts.isPropertyAccessExpression(callee)
        ? callee.name.text
        : ts.isIdentifier(callee)
          ? callee.text
          : "";
      if (name === SCHEDULE_CALL) {
        const content = contentOf(node);
        record(node, content !== undefined && iosGetsSound(content));
      }
    }
    if (ts.isIdentifier(node) && node.text === SCHEDULE_CALL && aliases(node)) {
      record(node, false);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return sites;
}

/** Every scheduleNotificationAsync call in the app's own source. */
function scheduleCallSites() {
  const sites: ReturnType<typeof callSitesIn> = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name)) continue;
      const src = fs.readFileSync(full, "utf8");
      if (!src.includes(SCHEDULE_CALL)) continue;
      sites.push(...callSitesIn(path.relative(REPO_ROOT, full), src));
    }
  };
  for (const dir of SCHEDULING_DIRS) walk(path.join(REPO_ROOT, dir));
  return sites;
}

describe("iOS adhan notification sound", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPlatform.OS = "ios";
  });

  /**
   * The per-id cases below are `it.each(ADHAN_SOUND_IDS)`, and vitest 2.1.9
   * registers those with a plain `cases.forEach`
   * (@vitest/runner/dist/index.js:580). An empty array therefore registers ZERO
   * tests: the CAF, MP3 and 30-second assertions all disappear and the file
   * still reports green, which is the same vacuous pass this whole file exists
   * to prevent, arrived at from the other end.
   *
   * Nothing else is standing there. lib/notifications.ts hardcodes its own
   * AdhanSoundOption union instead of importing this list, so emptying the
   * array still passes `pnpm exec tsc --noEmit`. Until those two are wired
   * together, this floor is the only thing that notices.
   */
  it("keeps enough adhan ids for the per-id cases below to exist at all", () => {
    expect(ADHAN_SOUND_IDS.length).toBeGreaterThanOrEqual(3);
  });

  /**
   * The Android side already fails loudly on a missing MP3 — withAdhanSoundResources
   * throws during prebuild. This is the iOS half of that protection: the
   * expo-notifications plugin builds its `sounds` array by mapping over these
   * same ids, and a missing CAF would only show up as the wrong sound on a
   * device. iOS also refuses anything over 30 seconds, falling back to the
   * default sound with no error, so the length is asserted too — a file that
   * merely exists is not proof the adhan plays.
   */
  it.each(ADHAN_SOUND_IDS)(
    "ships a bundled CAF under the iOS 30s cap for %s",
    (id) => {
      const file = path.join(SOUNDS_DIR, `adhan_${id}.caf`);
      expect(
        fs.existsSync(file),
        `missing ${file} — iOS would silently play the default sound`,
      ).toBe(true);
      expect(cafDurationSeconds(file)).toBeLessThan(30);
    },
  );

  it("keeps the MP3 masters that the Android res/raw copy still reads", () => {
    for (const id of ADHAN_SOUND_IDS) {
      expect(fs.existsSync(path.join(SOUNDS_DIR, `adhan_${id}.mp3`))).toBe(
        true,
      );
    }
  });

  it("carries the selected adhan as the sound on a scheduled prayer notification", async () => {
    storageWith("takbeer_2");
    await scheduleAllNotifications("nl");
    const prayers = callsOfType("prayer");
    expect(prayers.length).toBeGreaterThan(0);
    for (const req of prayers) {
      expect(req.content.sound).toBe("adhan_takbeer_2.caf");
    }
  });

  it("follows the stored preference rather than a hardcoded default", async () => {
    storageWith("takbeer_3");
    await scheduleAllNotifications("nl");
    expect(callsOfType("prayer")[0].content.sound).toBe("adhan_takbeer_3.caf");
  });

  /**
   * A test button that previews a different sound from the real notification is
   * how the original bug stayed invisible: the preview sounded right, so nobody
   * suspected the scheduled one was mute.
   */
  it("previews the exact sound the real scheduled notification will play", async () => {
    storageWith("takbeer_3");
    await scheduleAllNotifications("nl");
    const scheduled = callsOfType("prayer")[0].content.sound;

    vi.clearAllMocks();
    await sendTestNotification("en", "takbeer_3");
    const preview = callsOfType("test_reminder")[0].content.sound;

    // Pinned to the concrete basename as well: asserting only preview === scheduled
    // passes when BOTH are silent, which is the bug this file exists to catch.
    expect(scheduled).toBe("adhan_takbeer_3.caf");
    expect(preview).toBe(scheduled);
  });

  it("gives adhkaar reminders an audible default instead of silence", async () => {
    storageWith("takbeer_1");
    await scheduleAllNotifications("nl");
    const adhkaar = callsOfType("adhkaar");
    expect(adhkaar.length).toBeGreaterThan(0);
    for (const req of adhkaar) {
      expect(req.content.sound).toBe("default");
    }
  });

  /**
   * The Android mechanism is correct and must stay untouched: the sound comes
   * from the channel named on the trigger. Setting content.sound there would
   * override the channel the user's preference selected.
   */
  it("leaves the Android channel mechanism carrying the sound", async () => {
    mockPlatform.OS = "android";
    storageWith("takbeer_2");
    await scheduleAllNotifications("nl");
    const prayers = callsOfType("prayer");
    expect(prayers.length).toBeGreaterThan(0);
    for (const req of prayers) {
      expect(req.trigger.channelId).toBe(prayerChannelId("takbeer_2"));
      expect(req.content.sound).toBeUndefined();
    }
  });

  /**
   * Five call sites the previous hand-rolled brace matcher could not read, all
   * of them shapes this codebase already writes: Arabic and Dutch bodies, a
   * template literal, an explanatory comment. Counting raw braces, it either
   * threw or sliced `content` at the wrong delimiter on every one.
   *
   * The fourth is why this is a correctness test and not a tidiness one. It is
   * silent, but a `sound` sits in the very next object, and a slice that
   * overshoots `content` borrows it — a mute notification reporting as covered,
   * which is this file's own failure mode turned back on itself. Whether the
   * old matcher threw there or answered wrongly depended on how many braces
   * happened to follow, which is not a property anyone should have to reason
   * about; the parser removes the question.
   *
   * The fifth is the positive control. Without a site that genuinely HAS a
   * sound, a scanner that simply answered "no sound, ever" would satisfy every
   * other assertion here.
   */
  it("reads content correctly through braces in strings, templates and comments", () => {
    const fixture = [
      // 1 — a closing brace inside an Arabic body string
      `await Notifications.scheduleNotificationAsync({
        content: {
          body: "استخدم القوس } هنا",
          ...(Platform.OS === "android" ? { channelId: CH } : {}),
        },
        trigger: null,
      });`,
      // 2 — a template literal whose substitutions contain both delimiters
      `await Notifications.scheduleNotificationAsync({
        content: {
          title: \`\${count} over\`,
          body: \`accolade \${"{"} en haakje \${"("} erin\`,
          ...(Platform.OS === "android" ? { channelId: CH } : {}),
        },
        trigger: null,
      });`,
      // 3 — comments carrying unbalanced delimiters
      `await Notifications.scheduleNotificationAsync({
        content: {
          // a brace } and a paren ( that are not delimiters
          title: "C",
          /* nor is this one: } */
          ...(Platform.OS === "android" ? { channelId: CH } : {}),
        },
        trigger: null,
      });`,
      // 4 — silent, but a sound sits in the very next object
      `await Notifications.scheduleNotificationAsync({
        content: {
          body: "let op de accolade { hierin",
          ...(Platform.OS === "android" ? { channelId: CH } : {}),
        },
        trigger: { channelId: CH, sound: "default" },
      });`,
      // 5 — positive control: a real iOS sound, behind the same hazards
      `await Notifications.scheduleNotificationAsync({
        content: {
          body: "accolade { en } samen",
          ...(Platform.OS === "ios" ? { sound: "default" } : {}),
        },
        trigger: null,
      });`,
    ].join("\n");

    const sites = callSitesIn("fixture.ts", fixture);
    // Every call found, none merged into its neighbour and none skipped.
    expect(sites).toHaveLength(5);
    // The first four are mute; only the control carries a sound of its own.
    expect(sites.map((s) => s.hasIosSound)).toEqual([
      false,
      false,
      false,
      false,
      true,
    ]);
  });

  /**
   * The shapes that read as covered while the phone stays silent. Every one of
   * them satisfied the scanner as first written, which asked only whether the
   * condition TEXT contained `"ios"` and whether a property NAMED `sound`
   * existed — two questions neither of which is the one that matters.
   *
   * The inverted guard is the dangerous one, because it is not a typo anyone
   * would notice in review: `!== "ios"` reads almost the same as `=== "ios"`,
   * gives the sound to every platform except the one that needs it, and
   * lib/iqamah-silence.ts already writes `Platform.OS !== "android"` four times
   * over, so the shape is native to this codebase rather than imported into it.
   *
   * The fourth case is the control that keeps the fix honest. A scanner
   * hardened by answering "no sound, ever" would satisfy the three above and
   * every other assertion in this file; only a site that genuinely hands iOS a
   * sound — here through the FALSE branch, which is just as real — proves the
   * guard still recognises one.
   *
   * The last three are the alias check and its own control, in both directions:
   * a renamed reference is unreadable and must be reported, while a plain named
   * import keeps the name and must not be, or the sweep would fail on ordinary
   * code and get relaxed until it meant nothing.
   */
  it("rejects an inverted guard, a muted sound, and an alias it cannot follow", () => {
    const fixture = [
      // 1 — inverted: every platform BUT iOS gets the sound
      `await Notifications.scheduleNotificationAsync({
        content: {
          title: "A",
          ...(Platform.OS !== "ios" ? { sound: "default" } : {}),
        },
        trigger: null,
      });`,
      // 2 — the property is there, the sound is not
      `await Notifications.scheduleNotificationAsync({
        content: {
          title: "B",
          ...(Platform.OS === "ios" ? { interruptionLevel: "timeSensitive" as const, sound: undefined } : {}),
        },
        trigger: null,
      });`,
      // 3 — same, spelled null, and assigned directly on the content
      `await Notifications.scheduleNotificationAsync({
        content: { title: "C", sound: null },
        trigger: null,
      });`,
      // 4 — control: the sound is real and sits on the branch iOS takes
      `await Notifications.scheduleNotificationAsync({
        content: {
          title: "D",
          ...(Platform.OS === "android" ? { channelId: CH } : { sound: "default" }),
        },
        trigger: null,
      });`,
      // 5 — an alias: the call below is unreadable, so the alias itself is the site
      `const later = Notifications.scheduleNotificationAsync;
      await later({ content: { title: "E" }, trigger: null });`,
      // 6 — a plain named import keeps the name, so its call is read normally
      `import { scheduleNotificationAsync } from "expo-notifications";
      await scheduleNotificationAsync({
        content: {
          title: "F",
          ...(Platform.OS === "ios" ? { sound: "default" } : {}),
        },
        trigger: null,
      });`,
      // 7 — renaming it at the import does not
      `import { scheduleNotificationAsync as alsoLater } from "expo-notifications";
      await alsoLater({ content: { title: "G" }, trigger: null });`,
      // 8 — `sound: false`, which is how you actually mute an expo notification
      // (expo-notifications maps false to content.sound = .none). Recognising
      // only null/undefined caught the shape nobody writes and waved through
      // the one a developer silencing iOS would reach for first.
      `await Notifications.scheduleNotificationAsync({
        content: {
          title: "H",
          ...(Platform.OS === "ios" ? { sound: false } : {}),
        },
        trigger: null,
      });`,
    ].join("\n");

    const sites = callSitesIn("fixture.ts", fixture);
    expect(sites).toHaveLength(8);
    expect(sites.map((s) => s.hasIosSound)).toEqual([
      false,
      false,
      false,
      true,
      false,
      true,
      false,
      false,
    ]);
  });

  /**
   * The cases above pin the notification kinds that exist TODAY. This one pins
   * the rule, so a kind added tomorrow cannot repeat the bug.
   *
   * That matters here more than usual. Every silent notification in this file
   * arrived the same way: someone added a call site, gave it a channelId (which
   * is all Android needs), and shipped. Nothing threw, nothing logged, and the
   * behavioural tests above stayed green because they only ever asked about the
   * kinds that already had coverage. Weekly, inactivity and goals-incomplete
   * were each found this way, one at a time, after prayer and adhkaar were
   * already fixed.
   *
   * Read as source rather than by invocation on purpose: driving every kind
   * behaviourally would need each one's schedule preconditions, and a new kind
   * with no test would simply be absent from the loop — passing vacuously,
   * which is the failure this exists to stop. Reading the file means a new
   * call site is in scope the moment it is written.
   *
   * This scan used to read lib/notifications.ts and nothing else, and that
   * scoping was itself the defect. The bug is a property of the CALL, not of
   * the file it happens to sit in, so a guard tied to one file could only ever
   * certify one file — and eighteen call sites across seven sibling modules
   * stayed silent behind a green test. Anything under the app's own source
   * directories is in scope now, so a new module is covered on the day it is
   * created rather than on the day someone remembers to widen this list.
   *
   * Scoped by call rather than by iOS branch for the same reason: five of those
   * eighteen had no iOS branch at all, only a channelId, so a scan that walked
   * the `Platform.OS === "ios"` spreads would have walked straight past them.
   */
  it("gives every iOS notification a sound, in every module that schedules one", () => {
    const sites = scheduleCallSites();

    // Guard the guard, at both ends: a file walk that reaches nothing, or an
    // extractor that recognises nothing, leaves `silent` empty and passes
    // having checked nothing at all. Pinned to what the repo actually holds.
    expect(
      new Set(sites.map((s) => s.at.split(":")[0])).size,
    ).toBeGreaterThanOrEqual(8);
    expect(sites.length).toBeGreaterThanOrEqual(27);

    const silent = sites.filter(
      (s) =>
        !DELIBERATELY_SILENT.some((e) => s.source.includes(e.marker)) &&
        !s.hasIosSound,
    );
    expect(silent.map((s) => s.at)).toEqual([]);

    // And guard the exemptions: one that matches nothing has silently stopped
    // excusing the call it was written for, while one that matches several has
    // spread to cover calls nobody ever justified. Either way it is no longer
    // the narrow, argued exception it is written here as.
    for (const exemption of DELIBERATELY_SILENT) {
      const covered = sites.filter((s) => s.source.includes(exemption.marker));
      expect(
        covered.map((s) => s.at),
        exemption.why,
      ).toHaveLength(1);
    }
  });
});

/**
 * Lives beside the sound sweep because it is the same defect with the volume
 * turned up. That sweep gave the iqamah notifications interruptionLevel
 * timeSensitive and a sound — correct for a prayer reminder the user opted
 * into — but their text still said "Phone silenced" and "Phone ringer
 * restored", and on iOS neither ever happens: Apple exposes no programmatic
 * ringer control, so lib/iqamah-silence.ts early-returns and the notification
 * is the entire feature. The sweep therefore made a false statement pierce
 * Focus and Do Not Disturb to announce itself.
 *
 * Driven through the scheduler rather than read as source, and matched on
 * claims of a COMPLETED action rather than on sentences. Rewording the iOS copy
 * freely is fine; saying the phone was silenced or the ringer restored is not.
 */
describe("iOS iqamah copy tells the truth about what iOS can do", () => {
  /**
   * Pinned clock and zone. scheduleIqamahSilence skips trigger times already in
   * the past, and lib/notification-horizons cut the iOS horizon to the rest of
   * the current day — so a run late in the evening schedules nothing at all on
   * iOS and leaves every assertion below reading no copy, which is the vacuous
   * green this describe block exists to avoid. Just after local midnight in the
   * fixture's own zone gives both platforms a full day of pairs.
   */
  const previousTZ = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "Europe/Amsterdam";
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-01T00:05:00+02:00"));
  });
  afterAll(() => {
    vi.useRealTimers();
    process.env.TZ = previousTZ;
  });

  /**
   * Wording that asserts the app already did something to the ringer. Each
   * entry carries its own completion marker on purpose: Arabic `تم إعادة`
   * ("has been restored") is a claim, while `يمكنك إعادة` ("you can restore")
   * is the invitation the iOS copy legitimately makes, and a list matching the
   * bare verb could not tell them apart.
   */
  const CLAIMS_THE_ACTION = [
    "تم إسكات",
    "تم إعادة",
    "silenced",
    "restored",
    "gedempt",
    "hersteld",
  ];

  const iqamahCopy = async (
    os: "ios" | "android",
    language: "ar" | "en" | "nl",
  ): Promise<string[]> => {
    mockPlatform.OS = os;
    (Notifications.scheduleNotificationAsync as any).mockClear();
    await scheduleIqamahSilence(language);
    return (Notifications.scheduleNotificationAsync as any).mock.calls
      .map((c: any[]) => c[0])
      .filter((r: any) =>
        ["iqamah_silence", "iqamah_restore"].includes(r?.content?.data?.type),
      )
      .map((r: any) => `${r.content.title} ${r.content.body}`);
  };

  it.each(["ar", "en", "nl"] as const)(
    "reports the silencing on Android and asks for it on iOS (%s)",
    async (language) => {
      storageWith("takbeer_1");
      const android = await iqamahCopy("android", language);
      const ios = await iqamahCopy("ios", language);

      // Presence first: with nothing scheduled, every assertion below passes
      // having read no copy at all. The two counts deliberately no longer
      // match — iOS schedules a shorter horizon under its 64-request pending
      // cap (lib/notification-horizons) — so each platform is asserted present
      // on its own. Horizon lengths belong to tests/ios-notification-budget.
      expect(android.length).toBeGreaterThan(0);
      expect(ios.length).toBeGreaterThan(0);

      // And presence for the vocabulary itself. Android genuinely does silence
      // and restore the ringer, so its copy MUST contain a claim — that is what
      // proves this list is real wording in this language rather than terms
      // that happen to match nothing on either side.
      expect(
        android.filter((t) => CLAIMS_THE_ACTION.some((c) => t.includes(c)))
          .length,
      ).toBeGreaterThan(0);

      // The iOS half of the same list: no claim of an action iOS cannot perform.
      expect(
        ios.filter((t) => CLAIMS_THE_ACTION.some((c) => t.includes(c))),
      ).toEqual([]);
    },
  );
});

/**
 * The Time Sensitive entitlement is ONE claim for the whole app.
 *
 * `com.apple.developer.usernotifications.time-sensitive` is justified once, to
 * Apple, when the capability is enabled on the App ID — and review looks at how
 * the binary actually uses it. Apple's bar is information that requires
 * immediate attention. A sweep in this repo once set the level on all 17
 * scheduling sites, 12 of which were habit nudges with no time window: daily
 * advice, spouse advice, seven iman/tarbiya reminders, daily istighfar, the
 * weekly reminder and the weekly-goal reminder. "Take 15 minutes for your
 * children now" piercing Do Not Disturb is the pattern that gets the capability
 * questioned — and because the justification is app-wide, over-claiming on the
 * nudges puts the prayer case at risk with them.
 *
 * That scoping decision lives in a comment in lib/notifications.ts, and a
 * comment cannot fail a build. This is the part that can: the level may appear
 * only in the two prayer-anchored modules, and the count is pinned so that
 * widening it is a deliberate edit here rather than a quiet drift back.
 *
 * Presence is asserted as well as absence. An absence-only check would pass
 * just as happily if the scan itself broke and found nothing anywhere — the
 * failure mode that makes a guard worse than none, since it reports green while
 * the prayer notifications have silently lost the level too.
 */
describe("timeSensitive stays scoped to what a prayer app can justify", () => {
  const PRAYER_ANCHORED = ["lib/notifications.ts", "lib/iqamah-silence.ts"];
  // prayer reminder, adhan test, morning adhkaar, evening adhkaar, iqamah.
  const EXPECTED = 5;

  const timeSensitiveSites = () =>
    scheduleCallSites().filter((site) =>
      site.source.includes('"timeSensitive"'),
    );

  it("still sets the level where the adhan needs it", () => {
    expect(
      timeSensitiveSites().length,
      "no timeSensitive site found at all — either the level was stripped from " +
        "the prayer notifications, or this scan is broken and every assertion " +
        "below is vacuous",
    ).toBe(EXPECTED);
  });

  it("sets it in no module outside the prayer-anchored two", () => {
    const stray = timeSensitiveSites()
      .map((site) => site.at)
      .filter((at) => !PRAYER_ANCHORED.some((f) => at.startsWith(`${f}:`)));
    expect(
      stray,
      "a habit-nudge notification claimed Time Sensitive. The entitlement is " +
        "justified to Apple once for the whole app; widening it here weakens " +
        "the prayer justification. Keep the sound, drop interruptionLevel",
    ).toEqual([]);
  });
});

/**
 * The two adhan lists must agree, because nothing else makes them.
 *
 * `ADHAN_SOUND_IDS` (lib/adhan-sound-ids.js) drives what gets BUNDLED —
 * withAdhanSoundResources and withIosAdhanSounds both map over it, and
 * assert-ios-artifact.sh reads it. `ADHAN_SOUND_OPTIONS` (lib/notifications.ts)
 * drives what the user can PICK. They are separate literals in separate files
 * and `tsc --noEmit` passes with them out of sync, so a 4th sound added to the
 * picker but not to the ids list yields a preference that resolves to a
 * filename nothing ships — and UNNotificationSound answers an unresolvable name
 * with silence, not an error.
 *
 * adhanSoundFile() validates against IDS precisely so that drift degrades to
 * the default sound instead of to silence. This is the guard that stops the
 * drift happening in the first place.
 */
describe("the pickable adhan sounds and the bundled adhan sounds are the same set", () => {
  it("matches ADHAN_SOUND_OPTIONS ids to ADHAN_SOUND_IDS exactly", () => {
    expect(
      ADHAN_SOUND_OPTIONS.map((option) => option.id).sort(),
      "a sound is pickable but not bundled (or bundled but not pickable) — " +
        "add it to BOTH lib/adhan-sound-ids.js and ADHAN_SOUND_OPTIONS",
    ).toEqual([...ADHAN_SOUND_IDS].sort());
  });
});
