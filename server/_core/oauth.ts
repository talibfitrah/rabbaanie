import { COOKIE_NAME, ONE_YEAR_MS } from "../../shared/const.js";
import type { Express, Request, Response } from "express";
import { getUserByEmail, getUserByOpenId, upsertUser } from "../db";
import { getSessionCookieOptions } from "./cookies";

/**
 * Raised when an OAuth identity authenticates successfully but has no Rabbaanie
 * account. `reason` reaches the client as an `error` query param so the sign-in
 * screen can state which case it is.
 */
export class NoAccountError extends Error {
  constructor(readonly reason: "no_account" | "email_account") {
    super(reason);
    this.name = "NoAccountError";
  }
}
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export async function syncUser(userInfo: {
  openId?: string | null;
  name?: string | null;
  email?: string | null;
  loginMethod?: string | null;
  platform?: string | null;
}) {
  if (!userInfo.openId) {
    throw new Error("openId missing from user info");
  }

  // Sign-in only: accounts are created on rabbaanie.com, never here. This used to
  // be an unconditional upsert, so a first-time OAuth identity silently minted a
  // full account and walked straight past the subscription.
  const existing = await getUserByOpenId(userInfo.openId);
  if (!existing) {
    // Distinguish "no account" from "account exists but was created with a
    // password on the website" so the app can say which. Deliberately NOT a
    // login path: the OAuth userinfo has no email-verified flag, so granting a
    // session on an email match would let anyone claim an account by signing up
    // to the identity provider with someone else's address.
    const byEmail = userInfo.email ? await getUserByEmail(userInfo.email) : undefined;
    throw new NoAccountError(byEmail ? "email_account" : "no_account");
  }

  const lastSignedIn = new Date();
  await upsertUser({
    openId: userInfo.openId,
    name: userInfo.name || null,
    email: userInfo.email ?? null,
    loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
    lastSignedIn,
  });
  const saved = await getUserByOpenId(userInfo.openId);
  return (
    saved ?? {
      openId: userInfo.openId,
      name: userInfo.name,
      email: userInfo.email,
      loginMethod: userInfo.loginMethod ?? null,
      lastSignedIn,
    }
  );
}

function buildUserResponse(
  user:
    | Awaited<ReturnType<typeof getUserByOpenId>>
    | {
        openId: string;
        name?: string | null;
        email?: string | null;
        loginMethod?: string | null;
        lastSignedIn?: Date | null;
      },
) {
  return {
    id: (user as any)?.id ?? null,
    openId: user?.openId ?? null,
    name: user?.name ?? null,
    email: user?.email ?? null,
    loginMethod: user?.loginMethod ?? null,
    lastSignedIn: (user?.lastSignedIn ?? new Date()).toISOString(),
  };
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      await syncUser(userInfo);
      const sessionToken = await sdk.createSessionToken(userInfo.openId!, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      // Redirect to the frontend URL (Expo web on port 8081)
      // Cookie is set with parent domain so it works across both 3000 and 8081 subdomains
      const frontendUrl =
        process.env.EXPO_WEB_PREVIEW_URL ||
        process.env.EXPO_PACKAGER_PROXY_URL ||
        "http://localhost:8081";
      res.redirect(302, frontendUrl);
    } catch (error) {
      if (error instanceof NoAccountError) {
        res.status(403).json({ error: error.reason });
        return;
      }
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });

  // Native OAuth callback - server-side redirect flow
  // Flow:
  // 1. OAuth portal redirects here with code + state
  // 2. Server exchanges code for access token (via OAuth server)
  // 3. Server creates session token
  // 4. Server redirects to app's deep link with sessionToken + user data
  //
  // The deep link scheme is hardcoded (derived from bundle ID: manusapk)
  // because the OAuth portal may not preserve query parameters in the redirect URI.
  // This avoids the native app needing to call the API server after receiving the deep link.
  app.get("/api/oauth/native-callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    // The app's deep link URI is hardcoded based on the bundle ID scheme
    // Bundle ID: com.app.opvoedadvies.apk -> scheme: manusapk
    const APP_DEEP_LINK = "manusapk:///oauth/callback";

    console.log("[OAuth] Native callback received:", {
      hasCode: !!code,
      hasState: !!state,
      query: JSON.stringify(req.query),
    });

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      const user = await syncUser(userInfo);

      const sessionToken = await sdk.createSessionToken(userInfo.openId!, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      // Build user data as base64-encoded JSON
      const userJson = JSON.stringify(buildUserResponse(user));
      const userBase64 = Buffer.from(userJson).toString("base64");

      // Redirect to the app's deep link with session token and user data
      const redirectUrl = `${APP_DEEP_LINK}?sessionToken=${encodeURIComponent(sessionToken)}&user=${encodeURIComponent(userBase64)}`;

      console.log("[OAuth] Native callback: redirecting to app deep link");
      res.redirect(302, redirectUrl);
    } catch (error) {
      console.error("[OAuth] Native callback failed", error);
      // On error, redirect to the app with an error message
      const errorMsg = error instanceof Error ? error.message : "OAuth native callback failed";
      const redirectUrl = `${APP_DEEP_LINK}?error=${encodeURIComponent(errorMsg)}`;
      res.redirect(302, redirectUrl);
    }
  });

  app.get("/api/oauth/mobile", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      const user = await syncUser(userInfo);

      const sessionToken = await sdk.createSessionToken(userInfo.openId!, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.json({
        app_session_id: sessionToken,
        user: buildUserResponse(user),
      });
    } catch (error) {
      if (error instanceof NoAccountError) {
        res.status(403).json({ error: error.reason });
        return;
      }
      console.error("[OAuth] Mobile exchange failed", error);
      res.status(500).json({ error: "OAuth mobile exchange failed" });
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    res.json({ success: true });
  });

  // Get current authenticated user - works with both cookie (web) and Bearer token (mobile)
  app.get("/api/auth/me", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      res.json({ user: buildUserResponse(user) });
    } catch (error) {
      console.error("[Auth] /api/auth/me failed:", error);
      res.status(401).json({ error: "Not authenticated", user: null });
    }
  });

  // Establish session cookie from Bearer token
  // Used by iframe preview: frontend receives token via postMessage, then calls this endpoint
  // to get a proper Set-Cookie response from the backend (3000-xxx domain)
  app.post("/api/auth/session", async (req: Request, res: Response) => {
    try {
      // Authenticate using Bearer token from Authorization header
      const user = await sdk.authenticateRequest(req);

      // Get the token from the Authorization header to set as cookie
      const authHeader = req.headers.authorization || req.headers.Authorization;
      if (typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
        res.status(400).json({ error: "Bearer token required" });
        return;
      }
      const token = authHeader.slice("Bearer ".length).trim();

      // Set cookie for this domain (3000-xxx)
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.json({ success: true, user: buildUserResponse(user) });
    } catch (error) {
      console.error("[Auth] /api/auth/session failed:", error);
      res.status(401).json({ error: "Invalid token" });
    }
  });
}
