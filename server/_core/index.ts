import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { registerQuranRoutes } from "../quran-api";
import { registerAdhkarRoutes } from "../adhkar-api";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { mountPublicSite } from "../public-site";
import { mountWebDashboard } from "../web-dashboard";
import { mountAdminPanel } from "../admin-panel";
import { registerWebAuthRoutes } from "../web-auth";
import { registerLegalRoutes } from "../legal";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  const allowedOrigins = new Set([
    "https://rabbaanie.com",
    "https://www.rabbaanie.com",
    "https://api.rabbaanie.com",
  ]);
  for (const candidate of [
    process.env.EXPO_WEB_PREVIEW_URL,
    process.env.EXPO_PACKAGER_PROXY_URL,
  ]) {
    if (!candidate) continue;
    try {
      allowedOrigins.add(new URL(candidate).origin);
    } catch {
      console.warn("[CORS] Ignoring invalid configured origin");
    }
  }
  if (process.env.NODE_ENV !== "production") {
    allowedOrigins.add("http://localhost:3000");
    allowedOrigins.add("http://localhost:8081");
  }

  // Credentialed CORS must never reflect arbitrary attacker-controlled origins.
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.has(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Vary", "Origin");
      res.header("Access-Control-Allow-Credentials", "true");
    } else if (origin) {
      res.status(403).json({ error: "Origin not allowed" });
      return;
    }
    res.header(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS",
    );
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    );
    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerWebAuthRoutes(app);
  registerLegalRoutes(app);
  registerQuranRoutes(app);
  registerAdhkarRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  // REST API endpoints for advice
  app.post("/api/advice/weekplan", async (req, res) => {
    try {
      const { adviceRouter } = await import("../advice");
      const caller = adviceRouter.createCaller({} as any);
      const result = await caller.getWeekPlan(req.body);
      res.json(result);
    } catch (error: any) {
      console.error("Weekplan error:", error);
      const lang = req.body?.language || "nl";
      const msg =
        lang === "ar"
          ? "حدث خطأ. يرجى المحاولة لاحقًا."
          : lang === "en"
            ? "An error occurred. Please try again later."
            : "Er is een fout opgetreden. Probeer het later opnieuw.";
      res.status(500).json({ plan: msg, error: error.message });
    }
  });

  app.post("/api/advice/quicktips", async (req, res) => {
    try {
      const { adviceRouter } = await import("../advice");
      const caller = adviceRouter.createCaller({} as any);
      const result = await caller.getQuickTips(req.body);
      res.json(result);
    } catch (error: any) {
      console.error("Quick tips error:", error);
      const lang = req.body?.language || "nl";
      const tip =
        lang === "ar"
          ? "ابدأ يومك بذكر الله والدعاء لأولادك بالهداية والصلاح."
          : lang === "en"
            ? "Start your day by remembering Allaah and making du'aa for your children's guidance."
            : "Begin uw dag met het gedenken van Allaah en maak du'aa voor de leiding van uw kinderen.";
      res.status(500).json({ tips: [tip], error: error.message });
    }
  });

  app.post("/api/advice/general", async (req, res) => {
    try {
      const { adviceRouter } = await import("../advice");
      const caller = adviceRouter.createCaller({} as any);
      const result = await caller.getGeneralAdvice(req.body);
      res.json(result);
    } catch (error: any) {
      console.error("General advice error:", error);
      const lang = req.body?.language || "nl";
      const msg =
        lang === "ar"
          ? "ابدأ كل يوم بتقوية صلتك بالله. التربية تبدأ بنفسك."
          : lang === "en"
            ? "Start each day by strengthening your own bond with Allaah. Parenting begins with yourself."
            : "Begin elke dag met het versterken van uw eigen band met Allaah. De opvoeding begint bij uzelf.";
      res.status(500).json({ advice: msg, error: error.message });
    }
  });

  app.post("/api/advice/treatment", async (req, res) => {
    try {
      const { adviceRouter } = await import("../advice");
      const caller = adviceRouter.createCaller({} as any);
      const result = await caller.generateTreatmentPlan(req.body);
      res.json(result);
    } catch (error: any) {
      console.error("Treatment error:", error);
      const lang = req.body?.language || "nl";
      const msg =
        lang === "ar"
          ? "حدث خطأ. يرجى المحاولة لاحقًا."
          : lang === "en"
            ? "An error occurred. Please try again later."
            : "Er is een fout opgetreden. Probeer het later opnieuw.";
      res.status(500).json({ plan: msg, error: error.message });
    }
  });

  app.post("/api/advice/getSpouseAdvice", async (req, res) => {
    try {
      const { adviceRouter } = await import("../advice");
      // Build context from the Express request using the same createContext used by tRPC
      const ctx = await createContext({ req, res } as any);
      const caller = adviceRouter.createCaller(ctx);
      const result = await caller.getSpouseAdvice({
        language: req.body?.language || "nl",
      });
      // Wrap in tRPC-like shape that the client expects: { result: { data: ... } }
      res.json({
        result: {
          data: {
            advice: result.advice || "",
            tips: [],
            partnerName: result.partnerName || "",
          },
        },
      });
    } catch (error: any) {
      console.error("Spouse advice error:", error);
      const lang = req.body?.language || "nl";
      const msg =
        lang === "ar"
          ? "استمر في دعم شريكك. التربية مسؤولية مشتركة."
          : lang === "en"
            ? "Continue supporting your partner. Parenting is a shared responsibility."
            : "Blijf uw partner steunen. Opvoeding is een gedeelde verantwoordelijkheid.";
      res.json({
        result: { data: { advice: msg, tips: [], partnerName: "" } },
      });
    }
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  // Mount public website (landing page)
  mountPublicSite(app);

  // Mount admin control panel (before dashboard so /admin-panel is matched first)
  mountAdminPanel(app);

  // Mount logged-in web dashboard
  mountWebDashboard(app);

  // Serve Expo web build in production
  if (process.env.NODE_ENV === "production") {
    const webBuildDir = path.resolve(__dirname, "../dist-web");
    if (fs.existsSync(webBuildDir)) {
      app.use(express.static(webBuildDir));
      // SPA fallback: serve index.html for all non-API routes
      app.get("*", (_req, res) => {
        res.sendFile(path.join(webBuildDir, "index.html"));
      });
    }
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`[api] server listening on port ${port}`);
  });
}

startServer().catch(console.error);
