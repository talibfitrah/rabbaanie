import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * C10: an already-open device never otherwise refetches cycle/co-wife data.
 * react-query's global defaults (app/_layout.tsx QueryClient: staleTime
 * 5min, refetchOnWindowFocus:false) mean a remote purity/disable (another
 * device) or a co-wife name-revoke (husband hides names elsewhere) can sit
 * stale on an open screen indefinitely. NotificationLifecycle already owns
 * the app's other foreground listener (rescheduleOnForeground — throttled to
 * once per calendar day, for iOS notification-horizon refill only). This
 * adds a second, UNTHROTTLED one scoped to these specific queries, since a
 * same-day remote change must not wait for a new calendar day.
 *
 * Source-guard, same style as tests/prayer-popup-haid.test.ts: no renderer
 * is installed in this project and the listener lives inside a component
 * this file owns end to end.
 */
const src = readFileSync(join(__dirname, "..", "app", "_layout.tsx"), "utf8");
const flat = src.replace(/\s+/g, " ");

function notificationLifecycleBody(): string {
  const start = flat.indexOf("function NotificationLifecycle(");
  const end = flat.indexOf("function redirectIfEmailUnverified");
  expect(start, "NotificationLifecycle not found").toBeGreaterThan(-1);
  expect(end, "NotificationLifecycle's end not found").toBeGreaterThan(start);
  return flat.slice(start, end);
}

describe("NotificationLifecycle refetches cycle/co-wife state on foreground (C10)", () => {
  it("imports AppState from react-native", () => {
    expect(flat).toMatch(/import \{[^}]*\bAppState\b[^}]*\} from "react-native"/);
  });

  it("adds an AppState listener that invalidates cycle + co-wife queries, gated on being signed in", () => {
    const body = notificationLifecycleBody();
    expect(body).toContain('AppState.addEventListener("change"');
    expect(body).toContain("utils.cycle.getMine.invalidate()");
    expect(body).toContain("utils.cycle.getPartner.invalidate()");
    expect(body).toContain("utils.links.coWives.invalidate()");
    expect(body).toContain("utils.links.coWivesVisibility.invalidate()");
    expect(body).toContain("if (!isAuthenticated) return;");
  });
});
