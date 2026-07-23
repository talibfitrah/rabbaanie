import "dotenv/config";
import express from "express";
import { createServer } from "http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerQuranRoutes } from "../quran-api";
import { registerAdhkarRoutes } from "../adhkar-api";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { mountPublicSite } from "../public-site";
import { mountWebDashboard } from "../web-dashboard";
import { mountAdminPanel } from "../admin-panel";
import { registerWebAuthRoutes } from "../web-auth";
import { ENV } from "./env";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) res.header("Access-Control-Allow-Origin", origin);
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    res.header("Access-Control-Allow-Credentials", "true");
    if (req.method === "OPTIONS") { res.sendStatus(200); return; }
    next();
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerWebAuthRoutes(app);
  registerQuranRoutes(app);
  registerAdhkarRoutes(app);

  app.get("/api/health", (_req, res) => { res.json({ ok: true, timestamp: Date.now(), version: "1.0.0" }); });
  app.get("/health", (_req, res) => { res.json({ ok: true, timestamp: Date.now() }); });

  app.post("/api/advice/weekplan", async (req, res) => {
    try { const { adviceRouter } = await import("../advice"); const caller = adviceRouter.createCaller({} as any); const result = await caller.getWeekPlan(req.body); res.json(result); }
    catch (error: any) { console.error("Weekplan error:", error); res.status(500).json({ plan: "Er is een fout opgetreden.", error: error.message }); }
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
      const tip = lang === "ar" ? "\u0627\u0628\u062f\u0623 \u064a\u0648\u0645\u0643 \u0628\u0630\u0643\u0631 \u0627\u0644\u0644\u0647." : lang === "en" ? "Start your day by remembering Allaah." : "Begin uw dag met het gedenken van Allaah.";
      res.status(500).json({ tips: [tip], error: error.message });
    }
  });

app.post("/api/advice/general", async (req, res) => {
    try { const { adviceRouter } = await import("../advice"); const caller = adviceRouter.createCaller({} as any); const result = await caller.getGeneralAdvice(req.body); res.json(result); }
    catch (error: any) { console.error("General advice error:", error); res.status(500).json({ advice: "Begin elke dag met het versterken van uw eigen band met Allaah.", error: error.message }); }
  });
  app.post("/api/advice/treatment", async (req, res) => {
    try { const { adviceRouter } = await import("../advice"); const caller = adviceRouter.createCaller({} as any); const result = await caller.generateTreatmentPlan(req.body); res.json(result); }
    catch (error: any) { console.error("Treatment error:", error); res.status(500).json({ plan: "Er is een fout opgetreden.", error: error.message }); }
  });
  app.post("/api/advice/getSpouseAdvice", async (req, res) => {
    try { const { adviceRouter } = await import("../advice"); const ctx = await createContext({ req, res } as any); const caller = adviceRouter.createCaller(ctx); const result = await caller.getSpouseAdvice({ language: req.body?.language || "nl" }); res.json({ result: { data: { advice: result.advice || "", tips: [], partnerName: result.partnerName || "" } } }); }
    catch (error: any) { console.error("Spouse advice error:", error); res.json({ result: { data: { advice: "Blijf uw partner steunen.", tips: [], partnerName: "" } } }); }
  });

  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
  mountPublicSite(app);
  mountAdminPanel(app);
  mountWebDashboard(app);

  if (ENV.isProduction) {
    const webBuildDir = path.resolve(__dirname, "../../dist-web");
    if (fs.existsSync(webBuildDir)) {
      app.use(express.static(webBuildDir));
      app.get("*", (_req, res) => { res.sendFile(path.join(webBuildDir, "index.html")); });
    }
  }

  server.listen(ENV.port, ENV.host, () => {
    console.log(`[Rabbaanie API] Server listening on ${ENV.host}:${ENV.port}`);
    console.log(`[Rabbaanie API] Environment: ${ENV.isProduction ? "production" : "development"}`);
  });
}

startServer().catch(console.error);
