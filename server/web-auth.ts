import type { Express, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { COOKIE_NAME, ONE_YEAR_MS } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import { getDb } from "./db";
import { users, userFunctions } from "../drizzle/schema";
import { and, eq, isNull } from "drizzle-orm";
import {
  completeAdmin2FAChallenge,
  createAdmin2FAChallenge,
} from "./admin-2fa-challenge";
import { has2FA } from "./totp";

const SALT_ROUNDS = 12;
const ADMIN_ROLES = new Set(["admin", "super_admin", "moderator"]);
const googleTokenVerifier = new OAuth2Client();
// Native Sign in with Apple: the audience Apple stamps into the identity token
// is the app's bundle id (native flow — no Services ID). createRemoteJWKSet does
// no network at construction, so this is safe at module load; jose fetches and
// rotates Apple's keys on first verify.
const APPLE_BUNDLE_ID = "com.rabbaanie.app";
const APPLE_ISSUER = "https://appleid.apple.com";
const appleJwks = createRemoteJWKSet(
  new URL("https://appleid.apple.com/auth/keys"),
);

/**
 * Web Authentication System
 * Provides email/password registration and login for the web interface.
 * Issues the same session JWT as OAuth so all existing auth middleware works.
 */
export function registerWebAuthRoutes(app: Express) {
  // ─── Registration Page ─────────────────────────────────────────────
  app.get("/auth/register", (_req: Request, res: Response) => {
    const lang = (_req.query.lang as string) || "nl";
    res.send(generateAuthPage("register", lang));
  });

  // ─── Login Page ────────────────────────────────────────────────────
  app.get("/auth/login", (_req: Request, res: Response) => {
    const lang = (_req.query.lang as string) || "nl";
    res.send(generateAuthPage("login", lang));
  });

  // ─── Register API ──────────────────────────────────────────────────
  app.post("/auth/register", async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      if (!db) {
        res.status(500).json({ error: "Database unavailable" });
        return;
      }
      const { name, email, password, language } = req.body;

      if (!email || !password || !name) {
        res
          .status(400)
          .json({ error: "name, email, and password are required" });
        return;
      }

      if (password.length < 6) {
        res
          .status(400)
          .json({ error: "Password must be at least 6 characters" });
        return;
      }

      // Check if email already exists
      const existing = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      if (existing.length > 0) {
        res.status(409).json({ error: "Email already registered" });
        return;
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

      // Create user with email-based openId
      const openId = `email_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      await db.insert(users).values({
        openId,
        name,
        email,
        passwordHash,
        authMethod: "email",
        loginMethod: "email",
        role: "user",
        language: language || "nl",
        lastSignedIn: new Date(),
      });

      // Get the created user
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.openId, openId))
        .limit(1);

      // Auto-assign vader/moeder function based on gender from onboarding
      // The gender field comes from the registration form or will be set during onboarding
      // For now, we check if gender was provided in the registration body
      const gender = req.body.gender; // 'man' or 'vrouw'
      if (gender && user) {
        const autoFunc = gender === "man" ? "vader" : "moeder";
        await db.insert(userFunctions).values({
          userId: user.id,
          functionRole: autoFunc as any,
        });
      }

      // Create session token
      const sessionToken = await sdk.createSessionToken(openId, {
        name: name,
        expiresInMs: ONE_YEAR_MS,
      });

      // Set cookie
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });

      res.json({
        success: true,
        sessionToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          openId: user.openId,
        },
        redirect: "/dashboard",
      });
    } catch (error: any) {
      console.error("[WebAuth] Register error:", error);
      res.status(500).json({ error: "Registration failed. Please try again." });
    }
  });

  // ─── Login API ─────────────────────────────────────────────────────
  app.post("/auth/login", async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      if (!db) {
        res.status(500).json({ error: "Database unavailable" });
        return;
      }
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({ error: "Email and password are required" });
        return;
      }

      // Find user by email, excluding soft-deleted accounts so a deleted user
      // cannot log back in with their old password.
      const [user] = await db
        .select()
        .from(users)
        .where(and(eq(users.email, email), isNull(users.deletedAt)))
        .limit(1);
      if (!user) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }

      // Check password
      if (!user.passwordHash) {
        res.status(401).json({
          error:
            "This account uses OAuth login. Please use the app to sign in.",
        });
        return;
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }

      if (ADMIN_ROLES.has(user.role) && (await has2FA(user.id))) {
        const challengeToken = await createAdmin2FAChallenge(user);
        res.status(202).json({
          success: false,
          requires2FA: true,
          challengeToken,
        });
        return;
      }

      // Update last signed in
      await db
        .update(users)
        .set({ lastSignedIn: new Date() })
        .where(eq(users.id, user.id));

      // Create session token
      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      // Set cookie
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });

      // Role-based redirect: admins go to control panel
      const isAdmin = ["admin", "super_admin", "moderator"].includes(user.role);
      const redirect = isAdmin ? "/admin-panel" : "/dashboard";

      res.json({
        success: true,
        sessionToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          openId: user.openId,
        },
        redirect,
      });
    } catch (error: any) {
      console.error("[WebAuth] Login error:", error);
      res.status(500).json({ error: "Login failed. Please try again." });
    }
  });

  app.post("/auth/2fa/verify", async (req: Request, res: Response) => {
    const challengeToken =
      typeof req.body?.challengeToken === "string"
        ? req.body.challengeToken
        : "";
    const factorCode =
      typeof req.body?.factorCode === "string"
        ? req.body.factorCode.trim()
        : "";
    const result = await completeAdmin2FAChallenge(
      challengeToken,
      factorCode,
      req.ip || "unknown",
    );
    if (!result.ok) {
      res.status(result.reason === "rate_limited" ? 429 : 401).json({
        error:
          result.reason === "rate_limited"
            ? "Too many verification attempts"
            : "Invalid or expired verification code",
      });
      return;
    }

    const db = await getDb();
    if (!db) {
      res.status(503).json({ error: "Database unavailable" });
      return;
    }
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, result.claims.userId), isNull(users.deletedAt)))
      .limit(1);
    if (!user || !ADMIN_ROLES.has(user.role)) {
      res.status(401).json({ error: "Invalid verification challenge" });
      return;
    }

    const sessionToken = await sdk.createSessionToken(user.openId, {
      name: user.name || "Admin",
      expiresInMs: ONE_YEAR_MS,
      twoFactorVerifiedAt: Date.now(),
    });
    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, {
      ...cookieOptions,
      maxAge: ONE_YEAR_MS,
    });
    res.json({
      success: true,
      sessionToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        openId: user.openId,
      },
      redirect: "/admin-panel",
    });
  });

  // Android Google sign-in. The native SDK obtains an ID token only for an
  // OAuth client registered to this package and signing certificate. Verify the
  // Google signature and audience here before issuing a Rabbaanie session.
  app.post("/auth/google/native", async (req: Request, res: Response) => {
    try {
      const idToken =
        typeof req.body?.idToken === "string" ? req.body.idToken : "";
      const audience = process.env.GOOGLE_CLIENT_ID || "";
      if (!idToken || idToken.length > 8_192) {
        res.status(400).json({ error: "invalid_google_token" });
        return;
      }
      if (!audience) {
        res.status(503).json({ error: "google_signin_unavailable" });
        return;
      }

      const ticket = await googleTokenVerifier.verifyIdToken({
        idToken,
        audience,
      });
      const payload = ticket.getPayload();
      if (
        !payload?.sub ||
        !payload.email ||
        payload.email_verified !== true
      ) {
        res.status(401).json({ error: "invalid_google_token" });
        return;
      }

      const db = await getDb();
      if (!db) {
        res.status(503).json({ error: "database_unavailable" });
        return;
      }
      const [user] = await db
        .select()
        .from(users)
        .where(and(eq(users.email, payload.email), isNull(users.deletedAt)))
        .limit(1);
      if (!user) {
        res.status(403).json({ error: "no_account" });
        return;
      }
      if (ADMIN_ROLES.has(user.role) && (await has2FA(user.id))) {
        res.status(403).json({ error: "admin_2fa_required" });
        return;
      }

      await db
        .update(users)
        .set({ lastSignedIn: new Date() })
        .where(eq(users.id, user.id));
      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name || "",
        expiresInMs: ONE_YEAR_MS,
      });
      res.json({ success: true, sessionToken });
    } catch (error) {
      console.warn("[GoogleAuth] Native token rejected", String(error));
      res.status(401).json({ error: "invalid_google_token" });
    }
  });

  // iOS-native Sign in with Apple. The device hands us Apple's identity token (a
  // JWS); verify Apple's signature via Apple's JWKS, the issuer, expiry and our
  // exact bundle id as audience before trusting the email. Sign-in only, like
  // the Google native route: a missing user gets 403 no_account, never an
  // account minted from an externally supplied identity.
  app.post("/auth/apple/native", async (req: Request, res: Response) => {
    try {
      const identityToken =
        typeof req.body?.identityToken === "string"
          ? req.body.identityToken
          : "";
      if (!identityToken || identityToken.length > 8_192) {
        res.status(400).json({ error: "invalid_apple_token" });
        return;
      }

      const { payload } = await jwtVerify(identityToken, appleJwks, {
        issuer: APPLE_ISSUER,
        audience: APPLE_BUNDLE_ID,
        algorithms: ["RS256"],
      });
      // Apple sends email_verified as the boolean true or the string "true"
      // depending on the flow — accept only those.
      const emailVerified =
        payload.email_verified === true || payload.email_verified === "true";
      const email = typeof payload.email === "string" ? payload.email : "";
      if (!email || !emailVerified) {
        res.status(401).json({ error: "invalid_apple_token" });
        return;
      }

      const db = await getDb();
      if (!db) {
        res.status(503).json({ error: "database_unavailable" });
        return;
      }
      const [user] = await db
        .select()
        .from(users)
        .where(and(eq(users.email, email), isNull(users.deletedAt)))
        .limit(1);
      if (!user) {
        res.status(403).json({ error: "no_account" });
        return;
      }
      if (ADMIN_ROLES.has(user.role) && (await has2FA(user.id))) {
        res.status(403).json({ error: "admin_2fa_required" });
        return;
      }

      await db
        .update(users)
        .set({ lastSignedIn: new Date() })
        .where(eq(users.id, user.id));
      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name || "",
        expiresInMs: ONE_YEAR_MS,
      });
      res.json({ success: true, sessionToken });
    } catch (error) {
      console.warn("[AppleAuth] Native token rejected", String(error));
      res.status(401).json({ error: "invalid_apple_token" });
    }
  });

  // ─── Logout (web redirect) ────────────────────────────────────────
  app.get("/auth/logout", async (req: Request, res: Response) => {
    await sdk.revokeRequestSession(req);
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    res.redirect("/auth/login");
  });
}

// ═══════════════════════════════════════════════════════════════════════
// HTML Page Generator
// ═══════════════════════════════════════════════════════════════════════

function generateAuthPage(mode: "login" | "register", lang: string): string {
  const isRTL = lang === "ar";
  const dir = isRTL ? "rtl" : "ltr";

  const t = {
    nl: {
      loginTitle: "Inloggen",
      registerTitle: "Account aanmaken",
      name: "Naam",
      email: "E-mailadres",
      password: "Wachtwoord",
      confirmPassword: "Wachtwoord bevestigen",
      loginBtn: "Inloggen",
      registerBtn: "Registreren",
      noAccount: "Nog geen account?",
      hasAccount: "Al een account?",
      createAccount: "Maak een account aan",
      loginHere: "Log hier in",
      namePlaceholder: "Uw volledige naam",
      emailPlaceholder: "uw@email.nl",
      passwordPlaceholder: "Minimaal 6 tekens",
      language: "Taal",
      forgotPassword: "Wachtwoord vergeten?",
      orLoginWith: "Of inloggen met",
      appLogin: "Inloggen via de App",
      backToSite: "Terug naar website",
      passwordMismatch: "Wachtwoorden komen niet overeen",
      twoFactor: "2FA-code of back-upcode",
      twoFactorPrompt: "Voer uw verificatiecode in om door te gaan.",
      success: "Succesvol! U wordt doorgestuurd...",
    },
    en: {
      loginTitle: "Sign In",
      registerTitle: "Create Account",
      name: "Name",
      email: "Email address",
      password: "Password",
      confirmPassword: "Confirm password",
      loginBtn: "Sign In",
      registerBtn: "Sign Up",
      noAccount: "Don't have an account?",
      hasAccount: "Already have an account?",
      createAccount: "Create one",
      loginHere: "Sign in here",
      namePlaceholder: "Your full name",
      emailPlaceholder: "you@email.com",
      passwordPlaceholder: "At least 6 characters",
      language: "Language",
      forgotPassword: "Forgot password?",
      orLoginWith: "Or sign in with",
      appLogin: "Sign in via App",
      backToSite: "Back to website",
      passwordMismatch: "Passwords do not match",
      twoFactor: "2FA or backup code",
      twoFactorPrompt: "Enter your verification code to continue.",
      success: "Success! Redirecting...",
    },
    ar: {
      loginTitle: "تسجيل الدخول",
      registerTitle: "إنشاء حساب",
      name: "الاسم",
      email: "البريد الإلكتروني",
      password: "كلمة المرور",
      confirmPassword: "تأكيد كلمة المرور",
      loginBtn: "دخول",
      registerBtn: "تسجيل",
      noAccount: "ليس لديك حساب؟",
      hasAccount: "لديك حساب بالفعل؟",
      createAccount: "أنشئ حساباً",
      loginHere: "سجل دخولك هنا",
      namePlaceholder: "اسمك الكامل",
      emailPlaceholder: "بريدك@مثال.com",
      passwordPlaceholder: "6 أحرف على الأقل",
      language: "اللغة",
      forgotPassword: "نسيت كلمة المرور؟",
      orLoginWith: "أو سجل الدخول عبر",
      appLogin: "الدخول عبر التطبيق",
      backToSite: "العودة للموقع",
      passwordMismatch: "كلمتا المرور غير متطابقتين",
      twoFactor: "رمز التحقق أو الرمز الاحتياطي",
      twoFactorPrompt: "أدخل رمز التحقق للمتابعة.",
      success: "تم بنجاح! جاري التحويل...",
    },
  };

  const text = t[lang as keyof typeof t] || t.nl;
  const isLogin = mode === "login";

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${isLogin ? text.loginTitle : text.registerTitle} — Rabbaanie</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #F8FAF9 0%, #E8F5E9 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      direction: ${dir};
    }
    .auth-container {
      background: white;
      border-radius: 24px;
      box-shadow: 0 20px 60px rgba(27, 67, 50, 0.1);
      width: 100%;
      max-width: 440px;
      overflow: hidden;
    }
    .auth-header {
      background: linear-gradient(135deg, #1B4332 0%, #2D6A4F 100%);
      color: white;
      padding: 40px 32px 32px;
      text-align: center;
    }
    .auth-header h1 {
      font-size: 1.8rem;
      font-weight: 800;
      margin-bottom: 8px;
    }
    .auth-header p {
      opacity: 0.8;
      font-size: 0.9rem;
    }
    .auth-logo {
      width: 60px;
      height: 60px;
      background: rgba(255,255,255,0.15);
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 16px;
      font-size: 1.8rem;
    }
    .auth-form {
      padding: 32px;
    }
    .form-group {
      margin-bottom: 20px;
    }
    .form-group label {
      display: block;
      font-size: 0.85rem;
      font-weight: 600;
      color: #1B4332;
      margin-bottom: 6px;
    }
    .form-group input, .form-group select {
      width: 100%;
      padding: 14px 16px;
      border: 2px solid #E2E8E5;
      border-radius: 12px;
      font-size: 1rem;
      outline: none;
      transition: border-color 0.2s;
      direction: ${dir};
    }
    .form-group input:focus, .form-group select:focus {
      border-color: #2D6A4F;
    }
    .form-group input::placeholder {
      color: #9CA3AF;
    }
    .submit-btn {
      width: 100%;
      padding: 16px;
      background: linear-gradient(135deg, #1B4332 0%, #2D6A4F 100%);
      color: white;
      border: none;
      border-radius: 12px;
      font-size: 1rem;
      font-weight: 700;
      cursor: pointer;
      transition: transform 0.1s, opacity 0.2s;
      margin-top: 8px;
    }
    .submit-btn:hover {
      opacity: 0.9;
    }
    .submit-btn:active {
      transform: scale(0.98);
    }
    .submit-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .auth-footer {
      text-align: center;
      padding: 0 32px 32px;
    }
    .auth-footer p {
      font-size: 0.85rem;
      color: #4A6B5D;
    }
    .auth-footer a {
      color: #2D6A4F;
      font-weight: 600;
      text-decoration: none;
    }
    .auth-footer a:hover {
      text-decoration: underline;
    }
    .divider {
      display: flex;
      align-items: center;
      margin: 24px 0;
      color: #9CA3AF;
      font-size: 0.8rem;
    }
    .divider::before, .divider::after {
      content: '';
      flex: 1;
      border-bottom: 1px solid #E2E8E5;
    }
    .divider span {
      padding: 0 12px;
    }
    .alt-login-btn {
      width: 100%;
      padding: 12px;
      background: #F8FAF9;
      border: 2px solid #E2E8E5;
      border-radius: 12px;
      font-size: 0.9rem;
      font-weight: 600;
      color: #1B4332;
      cursor: pointer;
      transition: background 0.2s;
      text-decoration: none;
      display: block;
      text-align: center;
    }
    .alt-login-btn:hover {
      background: #E8F5E9;
    }
    .error-msg {
      background: #FEF2F2;
      border: 1px solid #FECACA;
      color: #DC2626;
      padding: 12px 16px;
      border-radius: 10px;
      font-size: 0.85rem;
      margin-bottom: 16px;
      display: none;
    }
    .success-msg {
      background: #F0FDF4;
      border: 1px solid #BBF7D0;
      color: #16A34A;
      padding: 12px 16px;
      border-radius: 10px;
      font-size: 0.85rem;
      margin-bottom: 16px;
      display: none;
    }
    .lang-switch {
      display: flex;
      justify-content: center;
      gap: 8px;
      margin-top: 16px;
    }
    .lang-switch a {
      font-size: 0.75rem;
      color: #4A6B5D;
      text-decoration: none;
      padding: 4px 10px;
      border-radius: 6px;
      border: 1px solid #E2E8E5;
    }
    .lang-switch a:hover, .lang-switch a.active {
      background: #E8F5E9;
      border-color: #2D6A4F;
    }
    .back-link {
      display: block;
      text-align: center;
      margin-top: 16px;
      font-size: 0.8rem;
      color: #4A6B5D;
      text-decoration: none;
    }
    .back-link:hover {
      color: #2D6A4F;
    }
  </style>
</head>
<body>
  <div class="auth-container">
    <div class="auth-header">
      <div class="auth-logo">🌿</div>
      <h1>${isLogin ? text.loginTitle : text.registerTitle}</h1>
      <p>Rabbaanie</p>
    </div>

    <div class="auth-form">
      <div class="error-msg" id="error-msg"></div>
      <div class="success-msg" id="success-msg"></div>

      <form id="auth-form" onsubmit="handleSubmit(event)">
        ${
          !isLogin
            ? `
        <div class="form-group">
          <label for="name">${text.name}</label>
          <input type="text" id="name" name="name" placeholder="${text.namePlaceholder}" required>
        </div>
        `
            : ""
        }

        <div class="form-group" id="credential-email-group">
          <label for="email">${text.email}</label>
          <input type="email" id="email" name="email" placeholder="${text.emailPlaceholder}" required>
        </div>

        ${
          isLogin
            ? `
        <div class="form-group" id="two-factor-group" style="display:none;">
          <label for="factor-code">${text.twoFactor}</label>
          <input type="text" id="factor-code" inputmode="numeric" autocomplete="one-time-code" maxlength="9">
        </div>
        `
            : ""
        }

        <div class="form-group" id="credential-password-group">
          <label for="password">${text.password}</label>
          <input type="password" id="password" name="password" placeholder="${text.passwordPlaceholder}" required minlength="6">
        </div>

        ${
          !isLogin
            ? `
        <div class="form-group">
          <label for="confirm-password">${text.confirmPassword}</label>
          <input type="password" id="confirm-password" name="confirmPassword" placeholder="${text.passwordPlaceholder}" required minlength="6">
        </div>

        <div class="form-group">
          <label for="language">${text.language}</label>
          <select id="language" name="language">
            <option value="nl" ${lang === "nl" ? "selected" : ""}>Nederlands</option>
            <option value="en" ${lang === "en" ? "selected" : ""}>English</option>
            <option value="ar" ${lang === "ar" ? "selected" : ""}>العربية</option>
          </select>
        </div>
        `
            : ""
        }

        <button type="submit" class="submit-btn" id="submit-btn">
          ${isLogin ? text.loginBtn : text.registerBtn}
        </button>
      </form>

      <div class="divider"><span>${text.orLoginWith}</span></div>
      <a href="/api/auth/login?redirect=/dashboard" class="alt-login-btn" onclick="event.preventDefault(); alert('OAuth login is alleen beschikbaar via de mobiele app.')">${text.appLogin}</a>
    </div>

    <div class="auth-footer">
      <p>
        ${isLogin ? text.noAccount : text.hasAccount}
        <a href="${isLogin ? "/auth/register" : "/auth/login"}?lang=${lang}">
          ${isLogin ? text.createAccount : text.loginHere}
        </a>
      </p>
      <div class="lang-switch">
        <a href="?lang=nl" class="${lang === "nl" ? "active" : ""}">NL</a>
        <a href="?lang=en" class="${lang === "en" ? "active" : ""}">EN</a>
        <a href="?lang=ar" class="${lang === "ar" ? "active" : ""}">عربي</a>
      </div>
      <a href="/site" class="back-link">${text.backToSite}</a>
    </div>
  </div>

  <script>
    let twoFactorMode = false;
    let twoFactorChallenge = '';

    function activateTwoFactorMode() {
      twoFactorMode = true;
      document.getElementById('credential-email-group').style.display = 'none';
      document.getElementById('credential-password-group').style.display = 'none';
      document.getElementById('email').required = false;
      document.getElementById('password').required = false;
      const factor = document.getElementById('factor-code');
      factor.required = true;
      document.getElementById('two-factor-group').style.display = 'block';
      const errorEl = document.getElementById('error-msg');
      errorEl.textContent = '${text.twoFactorPrompt}';
      errorEl.style.display = 'block';
      factor.focus();
    }

    async function handleSubmit(e) {
      e.preventDefault();
      const errorEl = document.getElementById('error-msg');
      const successEl = document.getElementById('success-msg');
      const submitBtn = document.getElementById('submit-btn');
      errorEl.style.display = 'none';
      successEl.style.display = 'none';

      const isRegister = ${!isLogin};
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;

      const body = twoFactorMode
        ? {
            challengeToken: twoFactorChallenge,
            factorCode: document.getElementById('factor-code').value.trim(),
          }
        : { email, password };

      if (isRegister) {
        const name = document.getElementById('name').value;
        const confirmPassword = document.getElementById('confirm-password').value;
        const language = document.getElementById('language').value;

        if (password !== confirmPassword) {
          errorEl.textContent = '${text.passwordMismatch}';
          errorEl.style.display = 'block';
          return;
        }

        body.name = name;
        body.language = language;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = '...';

      try {
        const endpoint = twoFactorMode
          ? '/auth/2fa/verify'
          : (isRegister ? '/auth/register' : '/auth/login');
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          credentials: 'include'
        });

        const data = await res.json();

        if (data.requires2FA) {
          twoFactorChallenge = data.challengeToken || '';
          activateTwoFactorMode();
          submitBtn.disabled = false;
          submitBtn.textContent = '${isLogin ? text.loginBtn : text.registerBtn}';
        } else if (res.ok && data.success) {
          successEl.textContent = '${text.success}';
          successEl.style.display = 'block';
          setTimeout(() => {
            window.location.href = data.redirect || '/dashboard';
          }, 800);
        } else {
          errorEl.textContent = data.error || 'An error occurred';
          errorEl.style.display = 'block';
          submitBtn.disabled = false;
          submitBtn.textContent = '${isLogin ? text.loginBtn : text.registerBtn}';
        }
      } catch (err) {
        errorEl.textContent = 'Network error. Please try again.';
        errorEl.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = '${isLogin ? text.loginBtn : text.registerBtn}';
      }
    }
  </script>
</body>
</html>`;
}
