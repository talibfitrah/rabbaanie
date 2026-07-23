import type { Express, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { COOKIE_NAME, ONE_YEAR_MS } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import { getDb } from "./db";
import { users, userFunctions } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const SALT_ROUNDS = 12;

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
      if (!db) { res.status(500).json({ error: "Database unavailable" }); return; }
      const { name, email, password, language } = req.body;

      if (!email || !password || !name) {
        res.status(400).json({ error: "name, email, and password are required" });
        return;
      }

      if (password.length < 6) {
        res.status(400).json({ error: "Password must be at least 6 characters" });
        return;
      }

      // Check if email already exists
      const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
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
      const [user] = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

      // Auto-assign vader/moeder function based on gender from onboarding
      // The gender field comes from the registration form or will be set during onboarding
      // For now, we check if gender was provided in the registration body
      const gender = req.body.gender; // 'man' or 'vrouw'
      if (gender && user) {
        const autoFunc = gender === 'man' ? 'vader' : 'moeder';
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
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.json({
        success: true,
        sessionToken,
        user: { id: user.id, name: user.name, email: user.email, role: user.role, openId: user.openId },
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
      if (!db) { res.status(500).json({ error: "Database unavailable" }); return; }
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({ error: "Email and password are required" });
        return;
      }

      // Find user by email
      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (!user) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }

      // Check password
      if (!user.passwordHash) {
        res.status(401).json({ error: "This account uses OAuth login. Please use the app to sign in." });
        return;
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }

      // Update last signed in
      await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));

      // Create session token
      const sessionToken = await sdk.createSessionToken(user.openId, {
        id: user.id,
        name: user.name || "",
        email: user.email,
        role: user.role,
        expiresInMs: ONE_YEAR_MS,
      });

      // Set cookie
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      // Role-based redirect: admins go to control panel
      const isAdmin = ["admin", "super_admin", "moderator"].includes(user.role);
      const redirect = isAdmin ? "/admin-panel" : "/dashboard";

      res.json({
        success: true,
        sessionToken,
        user: { id: user.id, name: user.name, email: user.email, role: user.role, openId: user.openId },
        redirect,
      });
    } catch (error: any) {
      console.error("[WebAuth] Login error:", error);
      res.status(500).json({ error: "Login failed. Please try again." });
    }
  });

  // ─── Logout (web redirect) ────────────────────────────────────────
  app.get("/auth/logout", (req: Request, res: Response) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    res.redirect("/auth/login");
  });
  // ─── Google OAuth for Mobile App ──────────────────────────────────

  // ─── Password Reset (Forgot Password) ─────────────────────────────
  // POST /auth/forgot-password - Send reset code via email
  app.post("/auth/forgot-password", async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      if (!email) {
        res.status(400).json({ error: "Email is required" });
        return;
      }

      const db = await getDb();
      const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim())).limit(1);
      
      // Always return success (don't reveal if email exists)
      if (!user) {
        res.json({ success: true, message: "If the email exists, a reset code has been sent" });
        return;
      }

      // Generate 6-digit reset code
      const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      // Store reset code in user record (using profileData temporarily)
      const existingProfile = (user.profileData as any) || {};
      await db.update(users).set({
        profileData: { ...existingProfile, _resetCode: resetCode, _resetExpires: expiresAt.toISOString() },
        updatedAt: new Date(),
      }).where(eq(users.id, user.id));

      // Send email via Brevo
      const { sendEmail } = await import("./_core/email");
      const emailSent = await sendEmail({
        to: email.toLowerCase().trim(),
        subject: "Rabbaanie - Password Reset Code",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <h2 style="color: #1B4332; margin: 0;">Rabbaanie</h2>
              <p style="color: #687076; font-size: 14px;">Password Reset</p>
            </div>
            <div style="background: #f5f5f5; border-radius: 12px; padding: 24px; text-align: center;">
              <p style="color: #333; font-size: 14px; margin-bottom: 16px;">Your password reset code is:</p>
              <div style="background: #1B4332; color: white; font-size: 32px; font-weight: bold; letter-spacing: 8px; padding: 16px 24px; border-radius: 8px; display: inline-block;">
                ${resetCode}
              </div>
              <p style="color: #687076; font-size: 12px; margin-top: 16px;">This code expires in 15 minutes.</p>
            </div>
            <p style="color: #687076; font-size: 12px; text-align: center; margin-top: 24px;">
              If you did not request this, please ignore this email.
            </p>
          </div>
        `,
      });

      if (!emailSent) {
        console.error("[Auth] Failed to send reset email to:", email);
      }

      res.json({ success: true, message: "If the email exists, a reset code has been sent" });
    } catch (error: any) {
      console.error("[Auth] Forgot password error:", error);
      res.status(500).json({ error: "Failed to process request" });
    }
  });

  // POST /auth/reset-password - Verify code and set new password
  app.post("/auth/reset-password", async (req: Request, res: Response) => {
    try {
      const { email, code, newPassword } = req.body;
      if (!email || !code || !newPassword) {
        res.status(400).json({ error: "Email, code, and new password are required" });
        return;
      }

      if (newPassword.length < 6) {
        res.status(400).json({ error: "Password must be at least 6 characters" });
        return;
      }

      const db = await getDb();
      const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim())).limit(1);
      
      if (!user) {
        res.status(400).json({ error: "Invalid code or email" });
        return;
      }

      const profile = (user.profileData as any) || {};
      const storedCode = profile._resetCode;
      const expiresStr = profile._resetExpires;

      if (!storedCode || !expiresStr) {
        res.status(400).json({ error: "No reset code found. Please request a new one." });
        return;
      }

      if (new Date(expiresStr) < new Date()) {
        res.status(400).json({ error: "Reset code has expired. Please request a new one." });
        return;
      }

      if (storedCode !== code.trim()) {
        res.status(400).json({ error: "Invalid reset code" });
        return;
      }

      // Hash new password and update
      const newHash = await bcrypt.hash(newPassword, 10);
      const { _resetCode, _resetExpires, ...cleanProfile } = profile;
      
      await db.update(users).set({
        passwordHash: newHash,
        authMethod: "email",
        profileData: cleanProfile,
        updatedAt: new Date(),
      }).where(eq(users.id, user.id));

      res.json({ success: true, message: "Password has been reset successfully" });
    } catch (error: any) {
      console.error("[Auth] Reset password error:", error);
      res.status(500).json({ error: "Failed to reset password" });
    }
  });
  // GET /auth/google/redirect - Redirects to Google OAuth consent screen
  app.get("/auth/google/redirect", (req: Request, res: Response) => {
    const redirectUri = req.query.redirect_uri as string;
    const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
    
    if (!GOOGLE_CLIENT_ID) {
      res.status(500).json({ error: "Google OAuth not configured" });
      return;
    }
    
    // Store the app's redirect URI in state so we can redirect back after auth
    const state = Buffer.from(JSON.stringify({ redirect_uri: redirectUri })).toString("base64url");
    
    const googleAuthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    googleAuthUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
    googleAuthUrl.searchParams.set("redirect_uri", `${process.env.APP_URL || "https://api.rabbaanie.com"}/auth/google/callback`);
    googleAuthUrl.searchParams.set("response_type", "code");
    googleAuthUrl.searchParams.set("scope", "openid email profile");
    googleAuthUrl.searchParams.set("state", state);
    googleAuthUrl.searchParams.set("access_type", "offline");
    googleAuthUrl.searchParams.set("prompt", "select_account");
    
    res.redirect(googleAuthUrl.toString());
  });

  // GET /auth/google/callback - Handles Google OAuth callback
  app.get("/auth/google/callback", async (req: Request, res: Response) => {
    try {
      const { code, state } = req.query;
      const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
      const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
      
      if (!code || !state) {
        res.status(400).json({ error: "Missing code or state" });
        return;
      }
      
      // Decode state to get the app's redirect URI
      let appRedirectUri = "";
      try {
        const stateData = JSON.parse(Buffer.from(state as string, "base64url").toString());
        appRedirectUri = stateData.redirect_uri || "";
      } catch { /* ignore */ }
      
      // Exchange code for tokens
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: code as string,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: `${process.env.APP_URL || "https://api.rabbaanie.com"}/auth/google/callback`,
          grant_type: "authorization_code",
        }),
      });
      
      const tokenData = await tokenResponse.json() as any;
      if (!tokenData.access_token) {
        console.error("[GoogleAuth] Token exchange failed:", tokenData);
        res.status(400).json({ error: "Failed to exchange code for token" });
        return;
      }
      
      // Get user info from Google
      const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const googleUser = await userInfoResponse.json() as any;
      
      if (!googleUser.email) {
        res.status(400).json({ error: "Failed to get user info from Google" });
        return;
      }
      
      const db = await getDb();
      if (!db) { res.status(500).json({ error: "Database unavailable" }); return; }
      
      // Check if user exists
      let [user] = await db.select().from(users).where(eq(users.email, googleUser.email)).limit(1);
      
      if (!user) {
        // Create new user
        const openId = `google_${googleUser.id}`;
        await db.insert(users).values({
          openId,
          name: googleUser.name || googleUser.email.split("@")[0],
          email: googleUser.email,
          authMethod: "google",
          loginMethod: "google",
          role: "user",
          lastSignedIn: new Date(),
        });
        [user] = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
      } else {
        // Update last signed in
        await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));
      }
      
      // Create session token
      const sessionToken = await sdk.createSessionToken(user.openId, {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        expiresInMs: ONE_YEAR_MS,
      });
      
      // Redirect back to the mobile app with token and user info
      const userInfo = encodeURIComponent(JSON.stringify({
        id: user.id,
        name: user.name,
        email: user.email,
        openId: user.openId,
        role: user.role,
      }));
      
      if (appRedirectUri) {
        const separator = appRedirectUri.includes("?") ? "&" : "?";
        res.redirect(`${appRedirectUri}${separator}token=${sessionToken}&user=${userInfo}`);
      } else {
        // Fallback: set cookie and redirect to dashboard
        const cookieOptions = getSessionCookieOptions(req);
        res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
        res.redirect("/dashboard");
      }
    } catch (error: any) {
      console.error("[GoogleAuth] Callback error:", error);
      res.status(500).json({ error: "Google authentication failed" });
    }
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
  <title>${isLogin ? text.loginTitle : text.registerTitle} — Opvoedadvies</title>
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
      <p>Opvoedadvies</p>
    </div>

    <div class="auth-form">
      <div class="error-msg" id="error-msg"></div>
      <div class="success-msg" id="success-msg"></div>

      <form id="auth-form" onsubmit="handleSubmit(event)">
        ${!isLogin ? `
        <div class="form-group">
          <label for="name">${text.name}</label>
          <input type="text" id="name" name="name" placeholder="${text.namePlaceholder}" required>
        </div>
        ` : ""}

        <div class="form-group">
          <label for="email">${text.email}</label>
          <input type="email" id="email" name="email" placeholder="${text.emailPlaceholder}" required>
        </div>

        <div class="form-group">
          <label for="password">${text.password}</label>
          <input type="password" id="password" name="password" placeholder="${text.passwordPlaceholder}" required minlength="6">
        </div>

        ${!isLogin ? `
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
        ` : ""}

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

      const body = { email, password };

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
        const endpoint = isRegister ? '/auth/register' : '/auth/login';
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          credentials: 'include'
        });

        const data = await res.json();

        if (res.ok && data.success) {
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
