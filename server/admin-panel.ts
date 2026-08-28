import type { Express, Request, Response, NextFunction } from "express";
import { sdk } from "./_core/sdk";
import { COOKIE_NAME } from "../shared/const.js";
import { getDb } from "./db";
import { users } from "../drizzle/schema";
import { eq, isNull } from "drizzle-orm";

// ═══════════════════════════════════════════════════════════════════════
// ROLE HIERARCHY & PERMISSIONS
// ═══════════════════════════════════════════════════════════════════════
const ADMIN_ROLES = ["super_admin", "admin", "moderator"] as const;
type AdminRole = (typeof ADMIN_ROLES)[number];

interface Permission {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  manageRoles: boolean;
  manageSettings: boolean;
  viewLogs: boolean;
  sendNotifications: boolean;
}

const ROLE_PERMISSIONS: Record<AdminRole, Permission> = {
  super_admin: {
    view: true,
    create: true,
    edit: true,
    delete: true,
    manageRoles: true,
    manageSettings: true,
    viewLogs: true,
    sendNotifications: true,
  },
  admin: {
    view: true,
    create: true,
    edit: true,
    delete: true,
    manageRoles: false,
    manageSettings: true,
    viewLogs: true,
    sendNotifications: true,
  },
  moderator: {
    view: true,
    create: true,
    edit: true,
    delete: false,
    manageRoles: false,
    manageSettings: false,
    viewLogs: false,
    sendNotifications: false,
  },
};

function getRoleLabel(role: string): string {
  switch (role) {
    case "super_admin":
      return "Super Admin";
    case "admin":
      return "Admin";
    case "moderator":
      return "Moderator";
    case "specialist":
      return "Specialist";
    case "teacher":
      return "Leraar";
    case "kennisdrager":
      return "Kennisdrager";
    case "doctor":
      return "Arts";
    default:
      return "Gebruiker";
  }
}
function getRoleBadgeColor(role: string): string {
  switch (role) {
    case "super_admin":
      return "#7B1FA2";
    case "admin":
      return "#1565C0";
    case "moderator":
      return "#2E7D32";
    case "specialist":
      return "#E65100";
    case "teacher":
      return "#00695C";
    case "kennisdrager":
      return "#4527A0";
    case "doctor":
      return "#C62828";
    default:
      return "#546E7A";
  }
}

// ═══════════════════════════════════════════════════════════════════════
// MIDDLEWARE: Admin-only auth
// ═══════════════════════════════════════════════════════════════════════
async function requireAdminAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authResult = await sdk.authenticateRequest(req);
    const db = await getDb();
    if (!db) {
      res.redirect("/auth/login");
      return;
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.openId, (authResult as any).openId || ""))
      .limit(1);
    if (!user || !(ADMIN_ROLES as readonly string[]).includes(user.role)) {
      res.redirect("/auth/login?error=unauthorized");
      return;
    }
    const { has2FA } = await import("./totp");
    const enrolled = await has2FA(user.id);
    const enrollmentOnlyPath =
      req.path === "/admin-panel/2fa-setup" ||
      req.path === "/admin-api/2fa/setup" ||
      req.path === "/admin-api/2fa/verify";
    if (!enrolled) {
      if (enrollmentOnlyPath) {
        (req as any).adminUser = user;
        next();
      } else if (req.originalUrl.startsWith("/admin-api/")) {
        res.status(403).json({
          error: "Administrator two-factor enrollment required",
          setupUrl: "/admin-panel/2fa-setup",
        });
      } else {
        res.redirect("/admin-panel/2fa-setup");
      }
      return;
    }
    const verifiedAt = (authResult as any)?.twoFactorVerifiedAt;
    const hasRecentFactor =
      typeof verifiedAt === "number" &&
      verifiedAt <= Date.now() &&
      Date.now() - verifiedAt <= 10 * 60 * 1000;
    if (!hasRecentFactor) {
      if (req.originalUrl.startsWith("/admin-api/")) {
        res.status(401).json({ error: "Two-factor verification required" });
      } else {
        res.redirect("/auth/login?two_factor_required=1");
      }
      return;
    }
    (req as any).adminUser = user;
    next();
  } catch {
    res.redirect("/auth/login");
  }
}

function requireAdminPermission(permission: keyof Permission) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).adminUser;
    const role = user?.role as AdminRole | undefined;
    if (!role || !ROLE_PERMISSIONS[role]?.[permission]) {
      res.status(403).json({ error: "Insufficient admin permission" });
      return;
    }
    next();
  };
}

// ═══════════════════════════════════════════════════════════════════════
// MOUNT ADMIN PANEL
// ═══════════════════════════════════════════════════════════════════════
export function mountAdminPanel(app: Express) {
  // ─── Audit Log API ─────────────────────────────────────────────────
  app.get(
    "/admin-api/audit-log",
    requireAdminAuth,
    requireAdminPermission("viewLogs"),
    async (req, res) => {
      const { getAuditLog } = await import("./audit");
      const limit = parseInt(req.query.limit as string) || 50;
      const logs = await getAuditLog(limit);
      res.json({ logs });
    },
  );

  // ─── 2FA Setup API ─────────────────────────────────────────────────
  app.post("/admin-api/2fa/setup", requireAdminAuth, async (req, res) => {
    const user = (req as any).adminUser;
    const { has2FA, setup2FA } = await import("./totp");
    if (await has2FA(user.id)) {
      res.status(409).json({
        error: "Two-factor authentication is already enabled",
      });
      return;
    }
    const result = await setup2FA(user.id, user.email || user.name || "admin");
    // Log audit
    const { logAudit } = await import("./audit");
    await logAudit({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: "enable_2fa",
      description: "2FA setup gestart",
      ipAddress: req.ip,
    });
    res.json(result);
  });

  app.post("/admin-api/2fa/verify", requireAdminAuth, async (req, res) => {
    const user = (req as any).adminUser;
    const { token } = req.body || {};
    const { verify2FASetup } = await import("./totp");
    const success = await verify2FASetup(user.id, token);
    if (success) {
      const { logAudit } = await import("./audit");
      await logAudit({
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        action: "verify_2fa",
        description: "2FA succesvol geactiveerd",
        ipAddress: req.ip,
      });
    }
    res.json({ success });
  });

  app.post("/admin-api/2fa/disable", requireAdminAuth, async (req, res) => {
    const user = (req as any).adminUser;
    const token =
      typeof req.body?.token === "string" ? req.body.token.trim() : "";
    const { disable2FA, verify2FALogin } = await import("./totp");
    if (!(await verify2FALogin(user.id, token))) {
      res.status(401).json({ error: "Current two-factor code required" });
      return;
    }
    await disable2FA(user.id);
    const { logAudit } = await import("./audit");
    await logAudit({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: "disable_2fa",
      description: "2FA uitgeschakeld",
      ipAddress: req.ip,
    });
    res.json({ success: true });
  });

  app.get("/admin-api/2fa/status", requireAdminAuth, async (req, res) => {
    const user = (req as any).adminUser;
    const { get2FAStatus } = await import("./totp");
    const status = await get2FAStatus(user.id);
    res.json(status);
  });

  // ─── CSV Export API ────────────────────────────────────────────────
  app.get("/admin-api/export/:type", requireAdminAuth, async (req, res) => {
    const user = (req as any).adminUser;
    const { logAudit } = await import("./audit");
    const {
      exportUsersCSV,
      exportChildrenCSV,
      exportFamiliesCSV,
      exportAuditLogCSV,
    } = await import("./csv-export");

    let csv = "";
    let filename = "export.csv";
    switch (req.params.type) {
      case "users":
        csv = await exportUsersCSV();
        filename = "gebruikers_export.csv";
        break;
      case "children":
        csv = await exportChildrenCSV();
        filename = "kinderen_export.csv";
        break;
      case "families":
        csv = await exportFamiliesCSV();
        filename = "gezinnen_export.csv";
        break;
      case "audit":
        csv = await exportAuditLogCSV();
        filename = "audit_log_export.csv";
        break;
      default:
        res.status(400).json({ error: "Ongeldig export type" });
        return;
    }

    await logAudit({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: "export_data",
      entityType: req.params.type,
      description: `Data export: ${req.params.type}`,
      ipAddress: req.ip,
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send("\uFEFF" + csv); // BOM for Excel compatibility
  });

  // ─── Search API ────────────────────────────────────────────────────
  app.get("/admin-panel/api/search", requireAdminAuth, async (req, res) => {
    try {
      const q = ((req.query.q as string) || "").toLowerCase().trim();
      if (!q || q.length < 2) {
        res.json({ results: [] });
        return;
      }
      const db = await getDb();
      if (!db) {
        res.json({ results: [] });
        return;
      }
      const allUsers = await db.select().from(users);
      const results: Array<{
        type: string;
        id: number;
        name: string;
        detail: string;
      }> = [];
      for (const u of allUsers) {
        if (
          (u.name || "").toLowerCase().includes(q) ||
          (u.email || "").toLowerCase().includes(q)
        ) {
          results.push({
            type: "user",
            id: u.id,
            name: u.name || u.email || "Onbekend",
            detail: u.email || u.role || "",
          });
        }
      }
      try {
        const { families } = await import("../drizzle/schema");
        const allFamilies = await db.select().from(families);
        for (const f of allFamilies) {
          const children = (f as any).children || [];
          if (Array.isArray(children)) {
            for (const child of children) {
              if (child && (child.name || "").toLowerCase().includes(q)) {
                results.push({
                  type: "child",
                  id: f.id,
                  name: child.name,
                  detail: "Gezin #" + f.id,
                });
              }
            }
          }
        }
      } catch (_e) {
        /* ignore */
      }
      res.json({ results: results.slice(0, 10) });
    } catch (_e) {
      res.json({ results: [] });
    }
  });

  // ─── Push Test API ────────────────────────────────────────────────────
  app.post(
    "/admin-panel/api/push-test",
    requireAdminAuth,
    requireAdminPermission("sendNotifications"),
    async (req, res) => {
      try {
        const user = (req as any).adminUser;
        const db = await getDb();
        if (!db) {
          res.json({ success: false, error: "Database niet beschikbaar" });
          return;
        }
        // Same deletedAt guard as broadcastLocalizedPush: accounts deleted
        // before deleteUser started clearing pushToken still hold one, and
        // this selector reaches them the same way the broadcast did.
        const allUsers = await db
          .select()
          .from(users)
          .where(isNull(users.deletedAt));
        const tokens = allUsers
          .filter((u) => u.pushToken)
          .map((u) => u.pushToken!);
        if (tokens.length === 0) {
          res.json({
            success: true,
            count: 0,
            message: "Geen apparaten met push-token gevonden",
          });
          return;
        }
        try {
          const { notifyOwner } = await import("./_core/notification");
          await notifyOwner({
            title: "Test-Notificatie",
            content:
              "Dit is een test vanuit het admin panel. Push-meldingen werken correct!",
          });
        } catch (_e) {
          /* best effort */
        }
        const { logAudit } = await import("./audit");
        await logAudit({
          userId: user.id,
          userName: user.name,
          userRole: user.role,
          action: "push_test",
          description: `Push test verzonden naar ${tokens.length} apparaten`,
          ipAddress: req.ip,
        });
        res.json({ success: true, count: tokens.length });
      } catch (_e) {
        res.json({ success: false, error: "Fout bij verzenden" });
      }
    },
  );

  // ─── Data API (panel-authenticated) ─────────────────────────────────
  app.get("/admin-api/dashboard", requireAdminAuth, async (req, res) => {
    const db = await import("./db");
    const stats = await db.getDashboardStats();
    res.json(stats);
  });

  app.get("/admin-api/users", requireAdminAuth, async (req, res) => {
    const db = await import("./db");
    const users = await db.getAllUsers();
    res.json(users);
  });

  app.get("/admin-api/families", requireAdminAuth, async (req, res) => {
    const db = await import("./db");
    const families = await db.getAllFamiliesDetailed();
    res.json(families);
  });

  app.get("/admin-api/children", requireAdminAuth, async (req, res) => {
    const db = await import("./db");
    const children = await db.getAllChildrenDetailed();
    res.json(children);
  });

  app.get("/admin-api/specialists", requireAdminAuth, async (req, res) => {
    const db = await import("./db");
    const specialists = await db.getAllSpecialists();
    res.json(specialists);
  });

  app.get("/admin-api/teachers", requireAdminAuth, async (req, res) => {
    const db = await import("./db");
    const teachers = await db.getAllTeachers();
    res.json(teachers);
  });

  // ─── Network Contacts CRUD ────────────────────────────────────
  app.get("/admin-api/network-contacts", requireAdminAuth, async (req, res) => {
    const db = await import("./db");
    const category = req.query.category as string | undefined;
    const contacts = await db.getNetworkContacts(category);
    res.json(contacts);
  });

  app.post(
    "/admin-api/network-contacts",
    requireAdminAuth,
    requireAdminPermission("create"),
    async (req, res) => {
      const {
        name,
        category,
        email,
        phone,
        specialization,
        city,
        country,
        bio,
        languages,
      } = req.body || {};
      if (!name || !category) {
        res.status(400).json({ error: "Naam en categorie zijn vereist" });
        return;
      }
      const db = await import("./db");
      const adminUser = (req as any).adminUser;
      const id = await db.addNetworkContact({
        name,
        category,
        email: email || null,
        phone: phone || null,
        specialization: specialization || null,
        city: city || null,
        country: country || null,
        bio: bio || null,
        languages: languages ? JSON.parse(languages) : null,
        addedBy: adminUser?.id || null,
      });
      const { logAudit } = await import("./audit");
      await logAudit({
        userId: adminUser?.id || 0,
        userName: adminUser?.name || "Admin",
        action: "add_network_contact",
        description: `${category}: ${name} toegevoegd`,
      });
      res.json({ success: true, id });
    },
  );

  app.delete(
    "/admin-api/network-contacts/:id",
    requireAdminAuth,
    requireAdminPermission("delete"),
    async (req, res) => {
      const id = parseInt(req.params.id);
      if (!id) {
        res.status(400).json({ error: "Ongeldig ID" });
        return;
      }
      const db = await import("./db");
      await db.deleteNetworkContact(id);
      const adminUser = (req as any).adminUser;
      const { logAudit } = await import("./audit");
      await logAudit({
        userId: adminUser?.id || 0,
        userName: adminUser?.name || "Admin",
        action: "delete_network_contact",
        description: `Contact #${id} verwijderd`,
      });
      res.json({ success: true });
    },
  );

  // ========== CMS API ENDPOINTS ==========
  app.get("/admin-api/cms/categories", requireAdminAuth, async (req, res) => {
    const db = await import("./db");
    const cats = await db.getAllContentCategories();
    res.json(cats);
  });

  app.post(
    "/admin-api/cms/categories",
    requireAdminAuth,
    requireAdminPermission("create"),
    async (req, res) => {
      const { slug, nameNl, nameEn, nameAr, appSection, ageGroup, sortOrder } =
        req.body || {};
      if (!slug || !nameNl) {
        res.status(400).json({ error: "slug en nameNl vereist" });
        return;
      }
      const db = await import("./db");
      const id = await db.createContentCategory({
        slug,
        nameNl,
        nameEn: nameEn || nameNl,
        nameAr: nameAr || nameNl,
        appSection: appSection || "general",
        ageGroup,
        sortOrder,
      });
      res.json({ success: true, id });
    },
  );

  app.get("/admin-api/cms/content", requireAdminAuth, async (req, res) => {
    const db = await import("./db");
    const { status, categoryId, contentType } = req.query as any;
    const items = await db.getAllContentItems({
      status,
      categoryId: categoryId ? parseInt(categoryId) : undefined,
      contentType,
    });
    // Get translations for each item
    const results: any[] = [];
    for (const item of items) {
      const translations = await db.getContentTranslations(item.id);
      const files = await db.getContentFiles(item.id);
      results.push({ ...item, translations, files });
    }
    res.json(results);
  });

  app.post(
    "/admin-api/cms/content",
    requireAdminAuth,
    requireAdminPermission("create"),
    async (req, res) => {
      const {
        contentType,
        categoryId,
        originalLanguage,
        tags,
        mediaUrl,
        titleNl,
        titleEn,
        titleAr,
        bodyNl,
        bodyEn,
        bodyAr,
        summaryNl,
        summaryEn,
        summaryAr,
      } = req.body || {};
      if (!contentType) {
        res.status(400).json({ error: "contentType vereist" });
        return;
      }
      const db = await import("./db");
      const adminUser = (req as any).adminUser;
      const id = await db.createContentItem({
        contentType,
        categoryId: categoryId ? parseInt(categoryId) : undefined,
        originalLanguage: originalLanguage || "nl",
        tags: tags
          ? JSON.stringify(tags.split(",").map((t: string) => t.trim()))
          : undefined,
        authorId: adminUser?.id,
        mediaUrl,
      });
      // Save translations
      if (titleNl)
        await db.upsertContentTranslation(id, "nl", {
          title: titleNl,
          summary: summaryNl,
          body: bodyNl,
        });
      if (titleEn)
        await db.upsertContentTranslation(id, "en", {
          title: titleEn,
          summary: summaryEn,
          body: bodyEn,
        });
      if (titleAr)
        await db.upsertContentTranslation(id, "ar", {
          title: titleAr,
          summary: summaryAr,
          body: bodyAr,
        });
      const { logAudit } = await import("./audit");
      await logAudit({
        userId: adminUser?.id || 0,
        userName: adminUser?.name || "Admin",
        action: "create_content" as any,
        description: `Content #${id} aangemaakt (${contentType})`,
      });
      res.json({ success: true, id });
    },
  );

  app.put(
    "/admin-api/cms/content/:id",
    requireAdminAuth,
    requireAdminPermission("edit"),
    async (req, res) => {
      const id = parseInt(req.params.id);
      const {
        contentType,
        categoryId,
        status,
        tags,
        mediaUrl,
        titleNl,
        titleEn,
        titleAr,
        bodyNl,
        bodyEn,
        bodyAr,
        summaryNl,
        summaryEn,
        summaryAr,
      } = req.body || {};
      const db = await import("./db");
      const updateData: any = {};
      if (contentType) updateData.contentType = contentType;
      if (categoryId) updateData.categoryId = parseInt(categoryId);
      if (status) {
        updateData.status = status;
        if (status === "published") updateData.publishedAt = new Date();
      }
      if (tags)
        updateData.tags = JSON.stringify(
          tags.split(",").map((t: string) => t.trim()),
        );
      if (mediaUrl) updateData.mediaUrl = mediaUrl;
      if (Object.keys(updateData).length > 0)
        await db.updateContentItem(id, updateData);
      // Update translations
      if (titleNl)
        await db.upsertContentTranslation(id, "nl", {
          title: titleNl,
          summary: summaryNl,
          body: bodyNl,
        });
      if (titleEn)
        await db.upsertContentTranslation(id, "en", {
          title: titleEn,
          summary: summaryEn,
          body: bodyEn,
        });
      if (titleAr)
        await db.upsertContentTranslation(id, "ar", {
          title: titleAr,
          summary: summaryAr,
          body: bodyAr,
        });
      res.json({ success: true });
    },
  );

  app.put(
    "/admin-api/cms/content/:id/publish",
    requireAdminAuth,
    requireAdminPermission("edit"),
    async (req, res) => {
      const id = parseInt(req.params.id);
      const db = await import("./db");
      await db.updateContentItem(id, {
        status: "published",
        publishedAt: new Date(),
      });
      res.json({ success: true });
    },
  );

  app.delete(
    "/admin-api/cms/content/:id",
    requireAdminAuth,
    requireAdminPermission("delete"),
    async (req, res) => {
      const id = parseInt(req.params.id);
      const db = await import("./db");
      await db.deleteContentItem(id);
      res.json({ success: true });
    },
  );

  app.post(
    "/admin-api/cms/content/:id/translate",
    requireAdminAuth,
    requireAdminPermission("edit"),
    async (req, res) => {
      const id = parseInt(req.params.id);
      const { targetLanguage } = req.body || {};
      if (!targetLanguage) {
        res.status(400).json({ error: "targetLanguage vereist" });
        return;
      }
      const db = await import("./db");
      const translations = await db.getContentTranslations(id);
      // Find source translation (prefer original language)
      const item = await db.getContentItemById(id);
      const sourceLang = item?.originalLanguage || "nl";
      const source =
        translations.find((t: any) => t.language === sourceLang) ||
        translations[0];
      if (!source) {
        res
          .status(400)
          .json({ error: "Geen brontekst gevonden om te vertalen" });
        return;
      }
      // Use built-in LLM for translation
      try {
        const { invokeLLM } = await import("./_core/llm");
        const langNames: Record<string, string> = {
          nl: "Nederlands",
          en: "English",
          ar: "Arabic",
        };
        const prompt = `Translate the following content from ${langNames[source.language]} to ${langNames[targetLanguage]}. Keep the same formatting and structure. Return ONLY the translation, nothing else.\n\nTitle: ${source.title}\n\nSummary: ${source.summary || ""}\n\nBody: ${source.body || ""}`;
        const result = await invokeLLM({
          messages: [{ role: "user", content: prompt }],
        });
        const text =
          typeof result === "string" ? result : (result as any)?.content || "";
        // Parse the translated parts
        const titleMatch = text.match(/Title:\s*(.+?)(?:\n|$)/i);
        const summaryMatch = text.match(/Summary:\s*(.+?)(?:\n\n|Body:|$)/is);
        const bodyMatch = text.match(/Body:\s*(.+)/is);
        const translatedTitle = titleMatch
          ? titleMatch[1].trim()
          : text.split("\n")[0] || source.title;
        const translatedSummary = summaryMatch ? summaryMatch[1].trim() : "";
        const translatedBody = bodyMatch ? bodyMatch[1].trim() : text;
        await db.upsertContentTranslation(id, targetLanguage, {
          title: translatedTitle,
          summary: translatedSummary,
          body: translatedBody,
          isAutoTranslated: true,
        });
        res.json({
          success: true,
          title: translatedTitle,
          summary: translatedSummary,
          body: translatedBody,
        });
      } catch (e: any) {
        res.status(500).json({
          error: "Vertaling mislukt: " + (e.message || "onbekende fout"),
        });
      }
    },
  );

  app.post(
    "/admin-api/cms/content/:id/files",
    requireAdminAuth,
    requireAdminPermission("edit"),
    async (req, res) => {
      const id = parseInt(req.params.id);
      const { fileName, fileType, fileData, fileSize, language } =
        req.body || {};
      if (!fileName || !fileType || !fileData) {
        res
          .status(400)
          .json({ error: "fileName, fileType en fileData (base64) vereist" });
        return;
      }
      try {
        const { storagePut } = await import("./storage");
        const buffer = Buffer.from(fileData, "base64");
        const mimeTypes: Record<string, string> = {
          pdf: "application/pdf",
          docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          doc: "application/msword",
          xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          xls: "application/vnd.ms-excel",
        };
        const ext = fileName.split(".").pop()?.toLowerCase() || "";
        const mime = mimeTypes[ext] || "application/octet-stream";
        const { key, url } = await storagePut(
          `cms-files/${id}/${fileName}`,
          buffer,
          mime,
        );
        const db = await import("./db");
        const fileId = await db.addContentFile({
          contentId: id,
          fileName,
          fileType: ext,
          filePath: url,
          fileSize: fileSize || buffer.length,
          language: language || "nl",
        });
        res.json({ success: true, id: fileId, url });
      } catch (e: any) {
        console.error("[CMS File Upload]", e);
        res
          .status(500)
          .json({ error: "Upload mislukt: " + (e.message || "onbekend") });
      }
    },
  );

  // Translate to ALL missing languages at once
  app.post(
    "/admin-api/cms/content/:id/translate-all",
    requireAdminAuth,
    requireAdminPermission("edit"),
    async (req, res) => {
      const id = parseInt(req.params.id);
      const db = await import("./db");
      const translations = await db.getContentTranslations(id);
      const item = await db.getContentItemById(id);
      const sourceLang = item?.originalLanguage || "nl";
      const source =
        translations.find((t: any) => t.language === sourceLang) ||
        translations[0];
      if (!source) {
        res.status(400).json({ error: "Geen brontekst gevonden" });
        return;
      }
      const allLangs = ["nl", "en", "ar"];
      const existingLangs = translations.map((t: any) => t.language);
      const missingLangs = allLangs.filter((l) => !existingLangs.includes(l));
      if (missingLangs.length === 0) {
        res.json({
          success: true,
          translated: [],
          message: "Alle vertalingen bestaan al",
        });
        return;
      }
      try {
        const { invokeLLM } = await import("./_core/llm");
        const langNames: Record<string, string> = {
          nl: "Nederlands",
          en: "English",
          ar: "Arabic",
        };
        const results: string[] = [];
        for (const targetLang of missingLangs) {
          const prompt = `Translate the following content from ${langNames[source.language]} to ${langNames[targetLang]}. Keep the same formatting and structure. Return ONLY the translation in this exact format:\nTitle: ...\nSummary: ...\nBody: ...\n\nTitle: ${source.title}\n\nSummary: ${source.summary || ""}\n\nBody: ${source.body || ""}`;
          const result = await invokeLLM({
            messages: [{ role: "user", content: prompt }],
          });
          const text =
            typeof result === "string"
              ? result
              : (result as any)?.content || "";
          const titleMatch = text.match(/Title:\s*(.+?)(?:\n|$)/i);
          const summaryMatch = text.match(/Summary:\s*(.+?)(?:\n\n|Body:|$)/is);
          const bodyMatch = text.match(/Body:\s*(.+)/is);
          const translatedTitle = titleMatch
            ? titleMatch[1].trim()
            : text.split("\n")[0] || source.title;
          const translatedSummary = summaryMatch ? summaryMatch[1].trim() : "";
          const translatedBody = bodyMatch ? bodyMatch[1].trim() : text;
          await db.upsertContentTranslation(id, targetLang, {
            title: translatedTitle,
            summary: translatedSummary,
            body: translatedBody,
            isAutoTranslated: true,
          });
          results.push(targetLang);
        }
        res.json({
          success: true,
          translated: results,
          message: `Vertaald naar: ${results.join(", ")}`,
        });
      } catch (e: any) {
        res
          .status(500)
          .json({ error: "Vertaling mislukt: " + (e.message || "onbekend") });
      }
    },
  );

  app.delete(
    "/admin-api/cms/files/:id",
    requireAdminAuth,
    requireAdminPermission("delete"),
    async (req, res) => {
      const id = parseInt(req.params.id);
      const db = await import("./db");
      await db.deleteContentFile(id);
      res.json({ success: true });
    },
  );

  // ========== INVITATION CODES API ==========
  app.get("/admin-api/invitation-codes", requireAdminAuth, async (req, res) => {
    const db = await import("./db");
    const codes = await db.getAllInvitationCodes();
    res.json(codes);
  });

  app.post(
    "/admin-api/invitation-codes",
    requireAdminAuth,
    requireAdminPermission("manageRoles"),
    async (req, res) => {
      const { functionRole, restrictedEmail, maxUses, expiresAt } =
        req.body || {};
      if (!functionRole) {
        res.status(400).json({ error: "functionRole vereist" });
        return;
      }
      const db = await import("./db");
      const adminUser = (req as any).adminUser;
      const code = `${functionRole.substring(0, 3).toUpperCase()}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const id = await db.createInvitationCode({
        code,
        functionRole,
        restrictedEmail,
        maxUses: maxUses ? parseInt(maxUses) : undefined,
        createdBy: adminUser?.id,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      });
      res.json({ success: true, id, code });
    },
  );

  app.put(
    "/admin-api/invitation-codes/:id/deactivate",
    requireAdminAuth,
    requireAdminPermission("manageRoles"),
    async (req, res) => {
      const id = parseInt(req.params.id);
      const db = await import("./db");
      await db.deactivateInvitationCode(id);
      res.json({ success: true });
    },
  );

  app.get("/admin-api/messages", requireAdminAuth, async (req, res) => {
    const db = await import("./db");
    const limit = parseInt(req.query.limit as string) || 100;
    const msgs = await db.getRecentMessages(limit);
    res.json(msgs);
  });

  app.post(
    "/admin-api/users/role",
    requireAdminAuth,
    requireAdminPermission("manageRoles"),
    async (req, res) => {
      const { userId, role } = req.body || {};
      if (
        !Number.isInteger(userId) ||
        userId <= 0 ||
        !["user", ...ADMIN_ROLES].includes(role)
      ) {
        res.status(400).json({ error: "Ongeldige userId of rol" });
        return;
      }
      const db = await import("./db");
      await db.updateUserRole(userId, role);
      const { logAudit } = await import("./audit");
      const user = (req as any).adminUser;
      await logAudit({
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        action: "role_change",
        entityType: "user",
        entityId: userId,
        description: `Rol gewijzigd naar ${role}`,
        ipAddress: req.ip,
      });
      res.json({ success: true });
    },
  );

  // ─── Authorization Roles API ─────────────────────────────────────
  app.get("/admin-api/users/auth-roles", requireAdminAuth, async (req, res) => {
    const db = await import("./db");
    const roles = await db.getAllUserAuthRoles();
    res.json(roles);
  });

  app.post(
    "/admin-api/users/auth-roles/add",
    requireAdminAuth,
    requireAdminPermission("manageRoles"),
    async (req, res) => {
      const { userId, role } = req.body || {};
      if (!userId || !role) {
        res.status(400).json({ error: "userId en role vereist" });
        return;
      }
      const db = await import("./db");
      await db.addUserAuthRole(userId, role, (req as any).adminUser.id);
      const { logAudit } = await import("./audit");
      const user = (req as any).adminUser;
      await logAudit({
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        action: "role_change",
        entityType: "user",
        entityId: userId,
        description: `Autorisatierol '${role}' toegevoegd`,
        ipAddress: req.ip,
      });
      res.json({ success: true });
    },
  );

  app.post(
    "/admin-api/users/auth-roles/remove",
    requireAdminAuth,
    requireAdminPermission("manageRoles"),
    async (req, res) => {
      const { userId, role } = req.body || {};
      if (!userId || !role) {
        res.status(400).json({ error: "userId en role vereist" });
        return;
      }
      const db = await import("./db");
      await db.removeUserAuthRole(userId, role);
      const { logAudit } = await import("./audit");
      const user = (req as any).adminUser;
      await logAudit({
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        action: "role_change",
        entityType: "user",
        entityId: userId,
        description: `Autorisatierol '${role}' verwijderd`,
        ipAddress: req.ip,
      });
      res.json({ success: true });
    },
  );

  // ─── User Functions API ─────────────────────────────────────
  app.get("/admin-api/users/functions", requireAdminAuth, async (req, res) => {
    const db = await import("./db");
    const functions = await db.getAllUserFunctions();
    res.json(functions);
  });

  app.post(
    "/admin-api/users/functions/add",
    requireAdminAuth,
    requireAdminPermission("manageRoles"),
    async (req, res) => {
      const { userId, functionRole, specialization, city } = req.body || {};
      if (!userId || !functionRole) {
        res.status(400).json({ error: "userId en functionRole vereist" });
        return;
      }
      const db = await import("./db");
      await db.addUserFunction(
        userId,
        functionRole,
        specialization,
        city,
        (req as any).adminUser.id,
      );
      const { logAudit } = await import("./audit");
      const user = (req as any).adminUser;
      await logAudit({
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        action: "function_change",
        entityType: "user",
        entityId: userId,
        description: `Functie '${functionRole}' toegevoegd`,
        ipAddress: req.ip,
      });
      res.json({ success: true });
    },
  );

  app.post(
    "/admin-api/users/functions/remove",
    requireAdminAuth,
    requireAdminPermission("manageRoles"),
    async (req, res) => {
      const { userId, functionRole } = req.body || {};
      if (!userId || !functionRole) {
        res.status(400).json({ error: "userId en functionRole vereist" });
        return;
      }
      const db = await import("./db");
      await db.removeUserFunction(userId, functionRole);
      const { logAudit } = await import("./audit");
      const user = (req as any).adminUser;
      await logAudit({
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        action: "function_change",
        entityType: "user",
        entityId: userId,
        description: `Functie '${functionRole}' verwijderd`,
        ipAddress: req.ip,
      });
      res.json({ success: true });
    },
  );

  app.post(
    "/admin-api/users/delete",
    requireAdminAuth,
    requireAdminPermission("delete"),
    async (req, res) => {
      const { userId } = req.body || {};
      if (!userId) {
        res.status(400).json({ error: "userId vereist" });
        return;
      }
      const db = await import("./db");
      await db.deleteUser(userId);
      const { logAudit } = await import("./audit");
      const user = (req as any).adminUser;
      await logAudit({
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        action: "delete_user",
        entityType: "user",
        entityId: userId,
        description: `Gebruiker #${userId} verwijderd`,
        ipAddress: req.ip,
      });
      res.json({ success: true });
    },
  );

  app.post(
    "/admin-api/families/delete",
    requireAdminAuth,
    requireAdminPermission("delete"),
    async (req, res) => {
      const { familyId } = req.body || {};
      if (!familyId) {
        res.status(400).json({ error: "familyId vereist" });
        return;
      }
      const db = await import("./db");
      await db.deleteFamily(familyId);
      const { logAudit } = await import("./audit");
      const user = (req as any).adminUser;
      await logAudit({
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        action: "delete_family",
        entityType: "family",
        entityId: familyId,
        description: `Gezin #${familyId} verwijderd`,
        ipAddress: req.ip,
      });
      res.json({ success: true });
    },
  );

  app.post(
    "/admin-api/children/delete",
    requireAdminAuth,
    requireAdminPermission("delete"),
    async (req, res) => {
      const { childId } = req.body || {};
      if (!childId) {
        res.status(400).json({ error: "childId vereist" });
        return;
      }
      const db = await import("./db");
      await db.deleteChild(childId);
      const { logAudit } = await import("./audit");
      const user = (req as any).adminUser;
      await logAudit({
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        action: "delete_child",
        entityType: "child",
        entityId: childId,
        description: `Kind #${childId} verwijderd`,
        ipAddress: req.ip,
      });
      res.json({ success: true });
    },
  );

  app.post(
    "/admin-api/broadcast",
    requireAdminAuth,
    requireAdminPermission("sendNotifications"),
    async (req, res) => {
      const { subject, message, target } = req.body || {};
      if (!subject || !message) {
        res.status(400).json({ error: "subject en message vereist" });
        return;
      }
      // Send broadcast notification
      try {
        const { notifyOwner } = await import("./_core/notification");
        await notifyOwner({ title: subject, content: message });
      } catch (_e) {
        /* best effort */
      }
      const { logAudit } = await import("./audit");
      const user = (req as any).adminUser;
      await logAudit({
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        action: "send_broadcast",
        description: `Broadcast: ${subject} (doelgroep: ${target || "all"})`,
        ipAddress: req.ip,
      });
      res.json({ success: true, sent: 1, target: target || "all" });
    },
  );

  app.post(
    "/admin-api/settings",
    requireAdminAuth,
    requireAdminPermission("manageSettings"),
    async (req, res) => {
      const settings = req.body || {};
      // Persist settings (in production this would save to DB)
      const { logAudit } = await import("./audit");
      const user = (req as any).adminUser;
      await logAudit({
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        action: "update_settings",
        description: `Instellingen bijgewerkt: ${Object.keys(settings).join(", ")}`,
        ipAddress: req.ip,
      });
      res.json({ success: true, settings });
    },
  );

  // ─── Admin Panel Pages ─────────────────────────────────────────────
  app.get("/admin-panel/2fa-setup", requireAdminAuth, (_req, res) => {
    res.send(generate2FAEnrollmentPage());
  });

  app.get("/admin-panel", requireAdminAuth, (req, res) => {
    res.send(generateAdminPanel((req as any).adminUser));
  });

  app.get("/admin-panel/*", requireAdminAuth, (req, res) => {
    res.send(generateAdminPanel((req as any).adminUser));
  });
}

function generate2FAEnrollmentPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rabbaanie — Secure administrator account</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #f0f2f5; color: #1a1a2e; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    main { width: min(560px, 100%); padding: 32px; border-radius: 16px; background: #fff; box-shadow: 0 12px 40px rgba(0,0,0,.12); }
    h1 { margin: 0 0 12px; color: #1b4332; font-size: 1.6rem; }
    p { line-height: 1.55; }
    button { border: 0; border-radius: 8px; padding: 12px 18px; background: #1b4332; color: #fff; font-weight: 700; cursor: pointer; }
    input { width: 100%; margin: 14px 0; padding: 12px; border: 1px solid #bcc5c0; border-radius: 8px; font-size: 1.1rem; }
    code { display: block; overflow-wrap: anywhere; padding: 10px; border-radius: 6px; background: #eef5f1; }
    #setup, #message { display: none; }
    #codes { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; margin: 12px 0; font-family: monospace; }
    .warning { color: #8a3b00; }
  </style>
</head>
<body>
  <main>
    <h1>Two-factor authentication required</h1>
    <p>Your administrator account cannot access privileged data until you secure it with an authenticator app.</p>
    <button id="start" type="button">Start secure setup</button>
    <section id="setup">
      <p>Add this secret to your authenticator app:</p>
      <code id="secret"></code>
      <p class="warning">Save these one-use backup codes now. They are shown only once:</p>
      <div id="codes"></div>
      <label for="token">Enter the current six-digit code</label>
      <input id="token" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}">
      <button id="verify" type="button">Verify and activate</button>
    </section>
    <p id="message" role="alert"></p>
  </main>
  <script>
    const start = document.getElementById('start');
    const setup = document.getElementById('setup');
    const message = document.getElementById('message');
    function showMessage(text, isError) {
      message.textContent = text;
      message.style.display = 'block';
      message.style.color = isError ? '#b71c1c' : '#1b5e20';
    }
    start.addEventListener('click', async () => {
      start.disabled = true;
      try {
        const response = await fetch('/admin-api/2fa/setup', { method: 'POST' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Setup failed');
        document.getElementById('secret').textContent = data.secret;
        const codes = document.getElementById('codes');
        codes.replaceChildren(...data.backupCodes.map((value) => {
          const item = document.createElement('span');
          item.textContent = value;
          return item;
        }));
        setup.style.display = 'block';
        start.style.display = 'none';
      } catch (error) {
        start.disabled = false;
        showMessage(error instanceof Error ? error.message : 'Setup failed', true);
      }
    });
    document.getElementById('verify').addEventListener('click', async () => {
      const token = document.getElementById('token').value.trim();
      if (!/^\\d{6}$/.test(token)) {
        showMessage('Enter a valid six-digit code.', true);
        return;
      }
      const response = await fetch('/admin-api/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        showMessage(data.error || 'Invalid code. Try again.', true);
        return;
      }
      showMessage('Two-factor authentication is active. Sign in again to continue.', false);
      setTimeout(() => { window.location.href = '/auth/logout'; }, 900);
    });
  </script>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════════════
// ADMIN PANEL HTML
// ═══════════════════════════════════════════════════════════════════════
function generateAdminPanel(adminUser: any): string {
  const role = adminUser.role as AdminRole;
  const perms = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.moderator;

  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Opvoedadvies — Controlepaneel</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --primary: #1B4332;
      --primary-light: #2D6A4F;
      --accent: #0D47A1;
      --bg: #F0F2F5;
      --surface: #FFFFFF;
      --text: #1A1A2E;
      --muted: #5F6368;
      --border: #DADCE0;
      --success: #1B5E20;
      --warning: #E65100;
      --error: #B71C1C;
      --info: #01579B;
    }
    html, body { overflow-x: hidden; max-width: 100vw; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }
    .app { display: flex; min-height: 100vh; }
    .sidebar {
      width: 280px; background: linear-gradient(180deg, #1B4332 0%, #0D2818 100%);
      color: white; position: fixed; top: 0; left: 0; bottom: 0; overflow-y: auto;
      display: flex; flex-direction: column;
    }
    .sidebar-header { padding: 24px; border-bottom: 1px solid rgba(255,255,255,0.08); }
    .sidebar-header h1 { font-size: 1.1rem; font-weight: 800; letter-spacing: -0.5px; }
    .sidebar-header .role-badge {
      display: inline-block; margin-top: 8px; padding: 3px 10px;
      border-radius: 12px; font-size: 0.7rem; font-weight: 700;
      background: ${getRoleBadgeColor(role)}; color: white;
    }
    .nav-group { padding: 16px 0; }
    .nav-group-title { padding: 4px 24px 8px; font-size: 0.65rem; text-transform: uppercase; letter-spacing: 1px; opacity: 0.4; font-weight: 700; }
    .nav-item {
      display: flex; align-items: center; gap: 12px;
      padding: 11px 24px; cursor: pointer; font-size: 0.85rem;
      color: rgba(255,255,255,0.7); text-decoration: none; transition: all 0.15s;
      border-left: 3px solid transparent;
    }
    .nav-item:hover { background: rgba(255,255,255,0.06); color: white; }
    .nav-item.active { background: rgba(255,255,255,0.1); color: white; border-left-color: #4CAF50; }
    .nav-item .icon { width: 20px; text-align: center; font-size: 1rem; }
    .sidebar-footer { margin-top: auto; padding: 16px 24px; border-top: 1px solid rgba(255,255,255,0.08); }
    .main { margin-left: 280px; flex: 1; padding: 32px; min-height: 100vh; }
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 28px; }
    .page-header h2 { font-size: 1.6rem; font-weight: 800; letter-spacing: -0.5px; }
    .page-header .subtitle { font-size: 0.85rem; color: var(--muted); margin-top: 4px; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 28px; }
    .stat-card {
      background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
      padding: 20px; position: relative; overflow: hidden;
    }
    .stat-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; }
    .stat-card.blue::before { background: #1565C0; }
    .stat-card.green::before { background: #2E7D32; }
    .stat-card.orange::before { background: #E65100; }
    .stat-card.purple::before { background: #6A1B9A; }
    .stat-card .value { font-size: 2.2rem; font-weight: 800; color: var(--text); }
    .stat-card .label { font-size: 0.8rem; color: var(--muted); margin-top: 4px; }
    .stat-card .trend { font-size: 0.75rem; margin-top: 8px; }
    .stat-card .trend.up { color: var(--success); }
    .stat-card .trend.down { color: var(--error); }
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 24px; margin-bottom: 20px; }
    .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .card-header h3 { font-size: 1rem; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th { text-align: left; padding: 12px 16px; background: var(--bg); font-weight: 600; color: var(--muted); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; }
    td { padding: 12px 16px; border-bottom: 1px solid var(--border); }
    tr:hover td { background: #F8F9FA; }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 0.7rem; font-weight: 700; }
    .btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 8px 16px; border-radius: 8px; font-size: 0.8rem;
      font-weight: 600; cursor: pointer; border: none; transition: all 0.15s;
    }
    .btn-sm { padding: 5px 10px; font-size: 0.75rem; }
    .btn-primary { background: var(--primary); color: white; }
    .btn-primary:hover { background: var(--primary-light); }
    .btn-danger { background: var(--error); color: white; }
    .btn-danger:hover { opacity: 0.9; }
    .btn-outline { background: transparent; border: 1px solid var(--border); color: var(--text); }
    .btn-outline:hover { background: var(--bg); }
    .btn-success { background: var(--success); color: white; }
    .btn-warning { background: var(--warning); color: white; }
    select, input[type="text"], input[type="email"], input[type="search"], textarea {
      padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px;
      font-size: 0.85rem; width: 100%; background: var(--surface);
    }
    select:focus, input:focus, textarea:focus { outline: none; border-color: var(--primary); }
    .modal-overlay {
      display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.5); z-index: 1000; align-items: center; justify-content: center;
    }
    .modal-overlay.active { display: flex; }
    .modal { background: var(--surface); border-radius: 16px; padding: 32px; max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto; }
    .modal h3 { font-size: 1.2rem; margin-bottom: 20px; }
    .form-group { margin-bottom: 16px; }
    .form-group label { display: block; font-size: 0.8rem; font-weight: 600; color: var(--muted); margin-bottom: 6px; }
    .empty-state { text-align: center; padding: 40px; color: var(--muted); }
    .empty-state .icon { font-size: 2.5rem; margin-bottom: 12px; }
    .toast { position: fixed; bottom: 24px; right: 24px; padding: 14px 24px; border-radius: 10px; color: white; font-size: 0.85rem; font-weight: 600; z-index: 2000; animation: slideIn 0.3s; }
    .toast.success { background: var(--success); }
    .toast.error { background: var(--error); }
    @keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    .search-bar { position: relative; max-width: 300px; }
    .search-bar input { padding-left: 36px; }
    .search-bar::before { content: '🔍'; position: absolute; left: 12px; top: 50%; transform: translateY(-50%); font-size: 0.8rem; }
    .activity-item { display: flex; align-items: flex-start; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--border); }
    .activity-item:last-child { border-bottom: none; }
    .activity-dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 6px; flex-shrink: 0; }
    .activity-text { font-size: 0.85rem; }
    .activity-time { font-size: 0.75rem; color: var(--muted); margin-top: 2px; }
    .permission-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; }
    .permission-item { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--bg); border-radius: 8px; font-size: 0.8rem; }
    .permission-item .check { color: var(--success); font-weight: 700; }
    .permission-item .cross { color: var(--error); font-weight: 700; }
    .mobile-header {
      display: none; position: fixed; top: 0; left: 0; right: 0; z-index: 999;
      background: linear-gradient(135deg, #1B4332 0%, #0D2818 100%);
      padding: 12px 16px; color: white;
      align-items: center; justify-content: space-between;
    }
    .mobile-header h1 { font-size: 1rem; font-weight: 700; }
    .hamburger {
      width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;
      border-radius: 8px; background: rgba(255,255,255,0.1); cursor: pointer; font-size: 1.4rem;
    }
    .mobile-nav {
      display: none; position: fixed; top: 56px; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.5); z-index: 998;
    }
    .mobile-nav.active { display: block; }
    .mobile-nav-content {
      background: linear-gradient(180deg, #1B4332 0%, #0D2818 100%);
      width: 280px; height: 100%; overflow-y: auto; padding: 16px 0;
      animation: slideRight 0.2s ease;
    }
    @keyframes slideRight { from { transform: translateX(-100%); } to { transform: translateX(0); } }
    .mobile-nav-item {
      display: flex; align-items: center; gap: 12px;
      padding: 14px 24px; color: rgba(255,255,255,0.8); text-decoration: none;
      font-size: 0.9rem; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    .mobile-nav-item:hover, .mobile-nav-item.active { background: rgba(255,255,255,0.1); color: white; }
    .mobile-nav-section { padding: 8px 24px 4px; font-size: 0.65rem; text-transform: uppercase; letter-spacing: 1px; color: rgba(255,255,255,0.35); font-weight: 700; margin-top: 8px; }
    .mobile-search { padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.1); }
    .mobile-search input {
      width: 100%; padding: 10px 14px; border-radius: 8px; border: none;
      background: rgba(255,255,255,0.12); color: white; font-size: 0.85rem;
      outline: none;
    }
    .mobile-search input::placeholder { color: rgba(255,255,255,0.4); }
    .mobile-search-results { padding: 0 16px; max-height: 200px; overflow-y: auto; }
    .mobile-search-result {
      display: flex; align-items: center; gap: 10px; padding: 10px 12px;
      border-radius: 8px; color: white; cursor: pointer; font-size: 0.8rem;
    }
    .mobile-search-result:hover { background: rgba(255,255,255,0.1); }
    .mobile-search-result .type-badge {
      font-size: 0.6rem; padding: 2px 6px; border-radius: 4px;
      background: rgba(255,255,255,0.15); color: rgba(255,255,255,0.7);
    }
    .quick-bar {
      display: none; position: fixed; bottom: 0; left: 0; right: 0; z-index: 997;
      background: white; border-top: 1px solid #e5e7eb;
      padding: 8px 0; padding-bottom: env(safe-area-inset-bottom, 8px);
    }
    .quick-bar-inner {
      display: flex; justify-content: space-around; align-items: center;
    }
    .quick-bar-item {
      display: flex; flex-direction: column; align-items: center; gap: 2px;
      padding: 6px 12px; border-radius: 8px; cursor: pointer;
      font-size: 0.65rem; color: #687076; text-decoration: none;
    }
    .quick-bar-item.active { color: #1B4332; font-weight: 600; }
    .quick-bar-item span { font-size: 1.3rem; }
    .push-test-card {
      background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
      border: 1px solid #86efac; border-radius: 12px; padding: 16px;
      margin-bottom: 16px;
    }
    .push-test-card h4 { margin: 0 0 8px; color: #166534; font-size: 0.9rem; }
    .push-test-card p { margin: 0 0 12px; color: #15803d; font-size: 0.8rem; }
    .push-test-btn {
      background: #166534; color: white; border: none; padding: 10px 20px;
      border-radius: 8px; cursor: pointer; font-size: 0.85rem; font-weight: 600;
    }
    .push-test-btn:hover { background: #14532d; }
    .push-test-result { margin-top: 10px; padding: 8px 12px; border-radius: 6px; font-size: 0.8rem; }
    @media (max-width: 768px) {
      .sidebar { display: none; }
      .mobile-header { display: flex; }
      .quick-bar { display: block; }
      .main { margin-left: 0; padding: 16px; padding-top: 72px; padding-bottom: 80px; max-width: 100vw; overflow-x: hidden; }
      .card { overflow-x: auto; }
      .stats-grid { grid-template-columns: 1fr 1fr; }
      .page-header { flex-direction: column; align-items: flex-start; gap: 12px; }
      table { font-size: 0.75rem; display: block; overflow-x: auto; white-space: nowrap; }
      th, td { padding: 8px; }
    }
  </style>
</head>
<body>
  <!-- Mobile Header -->
  <div class="mobile-header">
    <h1>\u2699\ufe0f Controlepaneel</h1>
    <div class="hamburger" onclick="toggleMobileNav()">\u2630</div>
  </div>

  <!-- Mobile Navigation Overlay -->
  <div class="mobile-nav" id="mobile-nav" onclick="closeMobileNav(event)">
    <div class="mobile-nav-content">
      <div class="mobile-search">
        <input type="text" id="mobile-search-input" placeholder="Zoek gebruikers, kinderen..." oninput="handleMobileSearch(this.value)" />
      </div>
      <div class="mobile-search-results" id="mobile-search-results"></div>
      <div class="mobile-nav-section">Overzicht</div>
      <a class="mobile-nav-item active" data-mpage="dashboard"><span>\ud83d\udcca</span> Dashboard</a>
      <a class="mobile-nav-item" data-mpage="activity"><span>\ud83d\udccb</span> Activiteitenlog</a>
      <div class="mobile-nav-section">Gebruikers & Gezinnen</div>
      <a class="mobile-nav-item" data-mpage="users"><span>\ud83d\udc64</span> Gebruikers</a>
      <a class="mobile-nav-item" data-mpage="families"><span>\ud83d\udc68\u200d\ud83d\udc69\u200d\ud83d\udc67</span> Gezinnen</a>
      <a class="mobile-nav-item" data-mpage="children"><span>\ud83d\udc76</span> Kinderen</a>
      <a class="mobile-nav-item" data-mpage="network"><span>\ud83c\udf10</span> Netwerk</a>
      <div class="mobile-nav-section">Content & Communicatie</div>
      <a class="mobile-nav-item" data-mpage="content"><span>\ud83d\udcdd</span> Content</a>
      <a class="mobile-nav-item" data-mpage="messages"><span>\ud83d\udcac</span> Berichten</a>
      <a class="mobile-nav-item" data-mpage="notifications"><span>\ud83d\udd14</span> Notificaties</a>
      <a class="mobile-nav-item" data-mpage="newsletters"><span>\ud83d\udcf0</span> Nieuwsbrieven</a>
      <div class="mobile-nav-section">Systeem</div>
      ${perms.manageRoles ? '<a class="mobile-nav-item" data-mpage="roles"><span>\ud83d\udd10</span> Rollen & Rechten</a>' : ""}
      ${perms.manageRoles ? '<a class="mobile-nav-item" data-mpage="invitations"><span>\ud83c\udf9f\ufe0f</span> Uitnodigingscodes</a>' : ""}
      ${perms.manageSettings ? '<a class="mobile-nav-item" data-mpage="settings"><span>\u2699\ufe0f</span> Instellingen</a>' : ""}
      <a class="mobile-nav-item" data-mpage="2fa"><span>\ud83d\udee1\ufe0f</span> 2FA Beveiliging</a>
      <a class="mobile-nav-item" data-mpage="export"><span>\u2b07\ufe0f</span> Data Export</a>
      ${perms.viewLogs ? '<a class="mobile-nav-item" data-mpage="logs"><span>\ud83d\udcc4</span> Systeemlog</a>' : ""}
      <div style="border-top:1px solid rgba(255,255,255,0.1); margin-top:16px; padding:16px 24px;">
        <div style="font-size:0.8rem; color:rgba(255,255,255,0.6); margin-bottom:8px;">Ingelogd als: <strong style="color:white;">${adminUser.name || adminUser.email || "Admin"}</strong></div>
        <a class="mobile-nav-item" onclick="handleLogout()" style="padding-left:0;"><span>\ud83d\udeaa</span> Uitloggen</a>
      </div>
    </div>
  </div>

  <div class="app">
    <aside class="sidebar">
      <div class="sidebar-header">
        <h1>⚙️ Controlepaneel</h1>
        <p style="font-size:0.75rem; opacity:0.6; margin-top:4px;">Opvoedadvies Admin</p>
        <span class="role-badge">${getRoleLabel(role)}</span>
      </div>

      <div class="nav-group">
        <div class="nav-group-title">Overzicht</div>
        <a class="nav-item active" data-page="dashboard"><span class="icon">📊</span> Dashboard</a>
        <a class="nav-item" data-page="activity"><span class="icon">📋</span> Activiteitenlog</a>
      </div>

      <div class="nav-group">
        <div class="nav-group-title">Gebruikers & Gezinnen</div>
        <a class="nav-item" data-page="users"><span class="icon">👤</span> Gebruikers</a>
        <a class="nav-item" data-page="families"><span class="icon">👨‍👩‍👧</span> Gezinnen</a>
        <a class="nav-item" data-page="children"><span class="icon">👶</span> Kinderen</a>
        <a class="nav-item" data-page="network"><span class="icon">🌐</span> Netwerk</a>
      </div>

      <div class="nav-group">
        <div class="nav-group-title">Content & Communicatie</div>
        <a class="nav-item" data-page="content"><span class="icon">📝</span> Content</a>
        <a class="nav-item" data-page="messages"><span class="icon">💬</span> Berichten</a>
        <a class="nav-item" data-page="notifications"><span class="icon">🔔</span> Notificaties</a>
        <a class="nav-item" data-page="newsletters"><span class="icon">📰</span> Nieuwsbrieven</a>
      </div>

      ${
        perms.manageRoles || perms.manageSettings
          ? `
      <div class="nav-group">
        <div class="nav-group-title">Systeem</div>
        ${perms.manageRoles ? '<a class="nav-item" data-page="roles"><span class="icon">🔐</span> Rollen & Rechten</a>' : ""}
        ${perms.manageRoles ? '<a class="nav-item" data-page="invitations"><span class="icon">🎟️</span> Uitnodigingscodes</a>' : ""}
        ${perms.manageSettings ? '<a class="nav-item" data-page="settings"><span class="icon">⚙️</span> Instellingen</a>' : ""}
        <a class="nav-item" data-page="2fa"><span class="icon">🛡️</span> 2FA Beveiliging</a>
        <a class="nav-item" data-page="export"><span class="icon">⬇️</span> Data Export</a>
        ${perms.viewLogs ? '<a class="nav-item" data-page="logs"><span class="icon">📄</span> Systeemlog</a>' : ""}
      </div>`
          : ""
      }

      <div class="sidebar-footer">
        <div style="font-size:0.8rem; opacity:0.7; margin-bottom:8px;">
          Ingelogd als: <strong>${adminUser.name || adminUser.email || "Admin"}</strong>
        </div>
        <a class="nav-item" onclick="handleLogout()" style="padding-left:0; opacity:0.6;"><span class="icon">🚪</span> Uitloggen</a>
      </div>
    </aside>

    <main class="main">
      <!-- Dashboard Page -->
      <div id="page-dashboard" class="page">
        <div class="page-header">
          <div>
            <h2>Dashboard</h2>
            <p class="subtitle">Overzicht van het platform</p>
          </div>
          <button class="btn btn-outline" onclick="refreshDashboard()">↻ Vernieuwen</button>
        </div>
        <div class="stats-grid">
          <div class="stat-card blue"><div class="value" id="stat-users">-</div><div class="label">Gebruikers</div><div class="trend up" id="trend-users"></div></div>
          <div class="stat-card green"><div class="value" id="stat-families">-</div><div class="label">Gezinnen</div></div>
          <div class="stat-card orange"><div class="value" id="stat-children">-</div><div class="label">Kinderen</div></div>
          <div class="stat-card purple"><div class="value" id="stat-messages">-</div><div class="label">Berichten</div></div>
        </div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
          <div class="card">
            <div class="card-header"><h3>Recente registraties</h3></div>
            <div id="recent-users"><p style="color:var(--muted);">Laden...</p></div>
          </div>
          <div class="card">
            <div class="card-header"><h3>Systeemstatus</h3></div>
            <div class="permission-grid">
              <div class="permission-item"><span class="check">●</span> Database actief</div>
              <div class="permission-item"><span class="check">●</span> API server online</div>
              <div class="permission-item"><span class="check">●</span> Push service actief</div>
              <div class="permission-item"><span class="check">●</span> Auth service actief</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Users Page -->
      <div id="page-users" class="page" style="display:none;">
        <div class="page-header">
          <div><h2>Gebruikers</h2><p class="subtitle">Beheer alle geregistreerde gebruikers</p></div>
          <div style="display:flex; gap:8px;">
            <div class="search-bar"><input type="search" id="user-search" placeholder="Zoek gebruiker..." oninput="filterUsers()"></div>
            ${perms.create ? '<button class="btn btn-primary" onclick="showCreateUserModal()">+ Nieuwe gebruiker</button>' : ""}
          </div>
        </div>
        <div class="card" style="padding:0; overflow:hidden;">
          <table>
            <thead><tr><th>ID</th><th>Naam</th><th>Email</th><th>Autorisatie</th><th>Functies</th><th>Laatste login</th><th>Acties</th></tr></thead>
            <tbody id="users-table"><tr><td colspan="7" style="text-align:center; padding:24px; color:var(--muted);">Laden...</td></tr></tbody>
          </table>
        </div>
      </div>

      <!-- Families Page -->
      <div id="page-families" class="page" style="display:none;">
        <div class="page-header">
          <div><h2>Gezinnen</h2><p class="subtitle">Overzicht van alle gezinnen</p></div>
        </div>
        <div class="card" style="padding:0; overflow:hidden;">
          <table>
            <thead><tr><th>ID</th><th>Naam</th><th>Leden</th><th>Kinderen</th><th>Aangemaakt</th><th>Acties</th></tr></thead>
            <tbody id="families-table"><tr><td colspan="6" style="text-align:center; padding:24px; color:var(--muted);">Laden...</td></tr></tbody>
          </table>
        </div>
      </div>

      <!-- Children Page -->
      <div id="page-children" class="page" style="display:none;">
        <div class="page-header">
          <div><h2>Kinderen</h2><p class="subtitle">Alle geregistreerde kinderen</p></div>
        </div>
        <div class="card" style="padding:0; overflow:hidden;">
          <table>
            <thead><tr><th>ID</th><th>Naam</th><th>Leeftijd</th><th>Geslacht</th><th>Gezin</th><th>Acties</th></tr></thead>
            <tbody id="children-table"><tr><td colspan="6" style="text-align:center; padding:24px; color:var(--muted);">Laden...</td></tr></tbody>
          </table>
        </div>
      </div>

      <!-- Network Page -->
      <div id="page-network" class="page" style="display:none;">
        <div class="page-header">
          <div><h2>Netwerk</h2><p class="subtitle">Specialisten, leraren, kennisdragers en artsen</p></div>
          ${perms.create ? "<button class=\"btn btn-primary\" onclick=\"document.getElementById('modal-add-network').classList.add('active');\">+ Toevoegen</button>" : ""}
        </div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
          <div class="card">
            <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;"><h3>\ud83d\udc68\u200d\u2695\ufe0f Specialisten</h3><span class="badge" id="specialist-count">0</span></div>
            <div id="specialists-list"><p style="color:var(--muted);">Laden...</p></div>
          </div>
          <div class="card">
            <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;"><h3>\ud83d\udc68\u200d\ud83c\udfeb Leraren</h3><span class="badge" id="teacher-count">0</span></div>
            <div id="teachers-list"><p style="color:var(--muted);">Laden...</p></div>
          </div>
          <div class="card">
            <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;"><h3>\ud83d\udcda Kennisdragers</h3><span class="badge" id="kennisdrager-count">0</span></div>
            <div id="kennisdragers-list"><p style="color:var(--muted);">Laden...</p></div>
          </div>
          <div class="card">
            <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;"><h3>\ud83c\udfe5 Artsen</h3><span class="badge" id="doctor-count">0</span></div>
            <div id="doctors-list"><p style="color:var(--muted);">Laden...</p></div>
          </div>
        </div>
      </div>

      <!-- Add Network Contact Modal -->
      <div class="modal-overlay" id="modal-add-network">
        <div class="modal">
          <div class="modal-header"><h3>Nieuw netwerkcontact toevoegen</h3><button class="modal-close" onclick="document.getElementById('modal-add-network').classList.remove('active');">&times;</button></div>
          <div class="modal-body">
            <div class="form-group"><label>Categorie *</label><select id="nc-category" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;"><option value="specialist">Specialist</option><option value="teacher">Leraar</option><option value="kennisdrager">Kennisdrager</option><option value="doctor">Arts</option></select></div>
            <div class="form-group"><label>Naam *</label><input id="nc-name" type="text" placeholder="Volledige naam" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;"/></div>
            <div class="form-group"><label>E-mail</label><input id="nc-email" type="email" placeholder="E-mailadres" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;"/></div>
            <div class="form-group"><label>Telefoon</label><input id="nc-phone" type="tel" placeholder="Telefoonnummer" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;"/></div>
            <div class="form-group"><label>Specialisatie / Expertise</label><input id="nc-specialization" type="text" placeholder="Bijv: Gedragstherapie, Islamitische opvoeding" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;"/></div>
            <div class="form-group"><label>Stad</label><input id="nc-city" type="text" placeholder="Stad" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;"/></div>
            <div class="form-group"><label>Land</label><input id="nc-country" type="text" placeholder="Land" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;"/></div>
            <div class="form-group"><label>Bio / Omschrijving</label><textarea id="nc-bio" rows="3" placeholder="Korte beschrijving" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;"></textarea></div>
          </div>
          <div class="modal-footer"><button class="btn btn-secondary" onclick="document.getElementById('modal-add-network').classList.remove('active');">Annuleren</button><button class="btn btn-primary" onclick="submitNetworkContact();">Toevoegen</button></div>
        </div>
      </div>

      <!-- Content Page -->
      <div id="page-content" class="page" style="display:none;">
        <div class="page-header">
          <div><h2>Content Management</h2><p class="subtitle">Artikelen, adviezen en bronnen in 3 talen (NL/EN/AR)</p></div>
          ${perms.create ? `<button class="btn btn-primary" onclick="showCreateContentModal()">+ Nieuwe content</button>` : ""}
        </div>
        <!-- Filter bar -->
        <div class="card" style="margin-bottom:16px; display:flex; gap:12px; flex-wrap:wrap; align-items:center;">
          <div style="position:relative; flex:1; min-width:200px;">
            <input id="cms-filter-search" type="text" placeholder="Zoeken op titel of inhoud..." oninput="debounceCmsSearch()" style="width:100%; padding:8px 12px 8px 36px; border-radius:8px; border:1px solid var(--border); font-size:0.9rem;">
            <span style="position:absolute; left:10px; top:50%; transform:translateY(-50%); color:var(--muted); font-size:1rem;">\uD83D\uDD0D</span>
          </div>
          <select id="cms-filter-type" onchange="loadCmsContent()" style="padding:8px 12px; border-radius:8px; border:1px solid var(--border);">
            <option value="">Alle types</option>
            <option value="article">Artikelen</option>
            <option value="video">Video</option>
            <option value="audio">Audio</option>
            <option value="tip">Tips</option>
            <option value="fatwa">Fatwa</option>
          </select>
          <select id="cms-filter-status" onchange="loadCmsContent()" style="padding:8px 12px; border-radius:8px; border:1px solid var(--border);">
            <option value="">Alle statussen</option>
            <option value="draft">Concept</option>
            <option value="published">Gepubliceerd</option>
          </select>
          <select id="cms-filter-language" onchange="loadCmsContent()" style="padding:8px 12px; border-radius:8px; border:1px solid var(--border);">
            <option value="">Alle talen</option>
            <option value="nl">Nederlands (NL)</option>
            <option value="en">Engels (EN)</option>
            <option value="ar">Arabisch (AR)</option>
            <option value="missing">Ontbrekende vertalingen</option>
          </select>
          <select id="cms-filter-category" onchange="loadCmsContent()" style="padding:8px 12px; border-radius:8px; border:1px solid var(--border);">
            <option value="">Alle categorie\u00ebn</option>
          </select>
          <button class="btn btn-sm btn-outline" onclick="clearCmsFilters()" style="padding:8px 12px;">Wis filters</button>
        </div>
        <!-- Stats Dashboard -->
        <div id="cms-stats" style="display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:12px; margin-bottom:16px;"></div>
        <!-- Bulk actions toolbar -->
        <div id="bulk-toolbar" style="display:none; margin-bottom:12px; padding:10px 16px; background:#E3F2FD; border-radius:8px; align-items:center; gap:12px; flex-wrap:wrap;">
          <span id="bulk-count" style="font-weight:600; color:#1565C0;">0 geselecteerd</span>
          <button class="btn btn-sm" style="background:#2E7D32;color:#fff;" onclick="bulkPublish()">Publiceren</button>
          <button class="btn btn-sm" style="background:#1565C0;color:#fff;" onclick="bulkTranslate()">Vertaal alle</button>
          <button class="btn btn-sm" style="background:#F57C00;color:#fff;" onclick="bulkArchive()">Archiveren</button>
          <button class="btn btn-sm" style="background:#C62828;color:#fff;" onclick="bulkDelete()">Verwijderen</button>
          <button class="btn btn-sm btn-outline" onclick="deselectAll()">Deselecteer</button>
        </div>
        <!-- Sort & pagination controls -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:8px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span id="cms-result-count" style="font-size:0.85rem; color:var(--muted);"></span>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <select id="cms-sort" onchange="loadCmsContent()" style="padding:6px 10px; border-radius:6px; border:1px solid var(--border); font-size:0.85rem;">
              <option value="date-desc">Nieuwste eerst</option>
              <option value="date-asc">Oudste eerst</option>
              <option value="title-asc">Titel A-Z</option>
              <option value="title-desc">Titel Z-A</option>
            </select>
            <select id="cms-per-page" onchange="cmsPagination.page=1;loadCmsContent()" style="padding:6px 10px; border-radius:6px; border:1px solid var(--border); font-size:0.85rem;">
              <option value="10">10 per pagina</option>
              <option value="25" selected>25 per pagina</option>
              <option value="50">50 per pagina</option>
            </select>
          </div>
        </div>
        <!-- Content table -->
        <div class="card" style="padding:0; overflow:hidden;">
          <table>
            <thead><tr><th style="width:30px;"><input type="checkbox" id="select-all-cb" onchange="toggleSelectAll(this)"></th><th>Titel</th><th>Type</th><th>Categorie</th><th>Tags</th><th>Talen</th><th>Status</th><th>Datum</th><th>Acties</th></tr></thead>
            <tbody id="content-table"><tr><td colspan="9" style="text-align:center; padding:24px; color:var(--muted);">Laden...</td></tr></tbody>
          </table>
        </div>
        <!-- Pagination -->
        <div id="cms-pagination" style="display:flex; justify-content:center; align-items:center; gap:8px; margin-top:12px;"></div>
        <!-- Import/Export buttons -->
        <div style="display:flex; gap:8px; margin-top:16px; flex-wrap:wrap;">
          <button class="btn btn-outline" onclick="exportCsv()">CSV Export</button>
          <button class="btn btn-outline" onclick="exportJson()">JSON Backup</button>
          <button class="btn btn-outline" onclick="document.getElementById('csv-import-input').click()">CSV Import</button>
          <input type="file" id="csv-import-input" accept=".csv" style="display:none;" onchange="importCsv(this)">
        </div>
        <!-- Preview Modal -->
        <div id="preview-modal" style="display:none; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.6); z-index:10000; justify-content:center; align-items:center;">
          <div style="background:#fff; border-radius:16px; width:90%; max-width:420px; max-height:85vh; overflow-y:auto; box-shadow:0 20px 60px rgba(0,0,0,0.3);">
            <div style="padding:16px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center;">
              <h3 style="margin:0;">App Preview</h3>
              <div style="display:flex; gap:6px; align-items:center;">
                <button class="btn btn-sm" id="preview-nl-btn" onclick="switchPreviewLang('nl')" style="background:#E3F2FD;color:#1565C0;">NL</button>
                <button class="btn btn-sm" id="preview-en-btn" onclick="switchPreviewLang('en')">EN</button>
                <button class="btn btn-sm" id="preview-ar-btn" onclick="switchPreviewLang('ar')">AR</button>
                <button onclick="closePreviewModal()" style="background:none; border:none; font-size:1.5rem; cursor:pointer;">&times;</button>
              </div>
            </div>
            <div id="preview-content" style="padding:20px;"></div>
          </div>
        </div>
        <!-- Side-by-side translation compare modal -->
        <div id="compare-modal" style="display:none; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.6); z-index:10000; justify-content:center; align-items:center;">
          <div style="background:#fff; border-radius:16px; width:95%; max-width:900px; max-height:85vh; overflow-y:auto; box-shadow:0 20px 60px rgba(0,0,0,0.3);">
            <div style="padding:16px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center;">
              <h3 style="margin:0;">Vertalingen vergelijken</h3>
              <button onclick="closeCompareModal()" style="background:none; border:none; font-size:1.5rem; cursor:pointer;">&times;</button>
            </div>
            <div id="compare-content" style="padding:20px; display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px;"></div>
          </div>
        </div>
        <!-- Notes modal -->
        <div id="notes-modal" style="display:none; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.6); z-index:10000; justify-content:center; align-items:center;">
          <div style="background:#fff; border-radius:16px; width:90%; max-width:500px; max-height:85vh; overflow-y:auto; box-shadow:0 20px 60px rgba(0,0,0,0.3);">
            <div style="padding:16px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center;">
              <h3 style="margin:0;">Notities</h3>
              <button onclick="closeNotesModal()" style="background:none; border:none; font-size:1.5rem; cursor:pointer;">&times;</button>
            </div>
            <div id="notes-content" style="padding:20px;"></div>
          </div>
        </div>
        <!-- Activity log modal -->
        <div id="activity-modal" style="display:none; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.6); z-index:10000; justify-content:center; align-items:center;">
          <div style="background:#fff; border-radius:16px; width:90%; max-width:600px; max-height:85vh; overflow-y:auto; box-shadow:0 20px 60px rgba(0,0,0,0.3);">
            <div style="padding:16px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center;">
              <h3 style="margin:0;">Activiteitenlog</h3>
              <button onclick="closeActivityModal()" style="background:none; border:none; font-size:1.5rem; cursor:pointer;">&times;</button>
            </div>
            <div id="activity-content" style="padding:20px;"></div>
          </div>
        </div>
        <!-- Schedule publish modal -->
        <div id="schedule-modal" style="display:none; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.6); z-index:10000; justify-content:center; align-items:center;">
          <div style="background:#fff; border-radius:16px; width:90%; max-width:400px; box-shadow:0 20px 60px rgba(0,0,0,0.3);">
            <div style="padding:16px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center;">
              <h3 style="margin:0;">Geplande publicatie</h3>
              <button onclick="closeScheduleModal()" style="background:none; border:none; font-size:1.5rem; cursor:pointer;">&times;</button>
            </div>
            <div style="padding:20px;">
              <label style="display:block; margin-bottom:8px; font-weight:500;">Publicatiedatum en -tijd:</label>
              <input type="datetime-local" id="schedule-datetime" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--border); margin-bottom:16px;">
              <button class="btn btn-primary" onclick="confirmSchedule()" style="width:100%;">Inplannen</button>
            </div>
          </div>
        </div>
        <!-- Categories management -->
        <div style="margin-top:24px;">
          <div class="page-header">
            <div><h3>Categorie\u00ebn</h3><p class="subtitle">Beheer content-categorie\u00ebn per app-sectie</p></div>
            ${perms.create ? `<button class="btn" onclick="showCreateCategoryModal()">+ Nieuwe categorie</button>` : ""}
          </div>
          <div class="card" style="padding:0; overflow:hidden;">
            <table>
              <thead><tr><th>Naam (NL)</th><th>Naam (EN)</th><th>Naam (AR)</th><th>App-sectie</th><th>Volgorde</th></tr></thead>
              <tbody id="categories-table"><tr><td colspan="5">Laden...</td></tr></tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Messages Page -->
      <div id="page-messages" class="page" style="display:none;">
        <div class="page-header">
          <div><h2>Berichten</h2><p class="subtitle">Alle berichten in het systeem</p></div>
          ${perms.sendNotifications ? '<button class="btn btn-primary" onclick="showBroadcastModal()">📢 Broadcast bericht</button>' : ""}
        </div>
        <div class="card">
          <div style="overflow-x:auto;">
            <table class="data-table">
              <thead><tr><th>ID</th><th>Afzender</th><th>Bericht</th><th>Status</th><th>Datum</th></tr></thead>
              <tbody id="messages-table"><tr><td colspan="5">Laden...</td></tr></tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Notifications Page -->
      <div id="page-notifications" class="page" style="display:none;">
        <div class="page-header">
          <div><h2>Notificaties</h2><p class="subtitle">Push-notificaties beheren</p></div>
          ${perms.sendNotifications ? '<button class="btn btn-primary" onclick="showNotificationModal()">+ Nieuwe notificatie</button>' : ""}
        </div>
        <!-- Push Test Card -->
        <div class="push-test-card">
          <h4>\ud83d\udce4 Push-Notificatie Testen</h4>
          <p>Verstuur een test-notificatie naar alle geregistreerde apparaten om te controleren of push-meldingen correct werken.</p>
          <button class="push-test-btn" id="push-test-btn" onclick="sendPushTest()">\ud83d\udce4 Verstuur Test-Notificatie</button>
          <div class="push-test-result" id="push-test-result" style="display:none;"></div>
        </div>
        <div class="card">
          <h3 style="margin-bottom:12px;">Notificatie-instellingen</h3>
          <div class="permission-grid">
            <div class="permission-item"><span class="check">\u2713</span> Dagelijks advies</div>
            <div class="permission-item"><span class="check">\u2713</span> Weekplan herinnering</div>
            <div class="permission-item"><span class="check">\u2713</span> Chat berichten</div>
            <div class="permission-item"><span class="check">\u2713</span> Koppelingsverzoeken</div>
          </div>
        </div>
        <div class="card" style="margin-top:16px;">
          <h3 style="margin-bottom:12px;">Verzonden notificaties</h3>
          <div id="sent-notifications-list" style="color:var(--muted); font-size:0.85rem;">Laden...</div>
        </div>
      </div>

      <!-- Newsletters Page -->
      <div id="page-newsletters" class="page" style="display:none;">
        <div class="page-header">
          <div><h2>Nieuwsbrieven</h2><p class="subtitle">E-mail campagnes beheren</p></div>
          ${perms.create ? `<button class="btn btn-primary" onclick="document.getElementById('modal-create-newsletter').classList.add('active')">+ Nieuwe nieuwsbrief</button>` : ""}
        </div>
        <div class="card" style="padding:0; overflow:hidden;">
          <table>
            <thead><tr><th>Onderwerp</th><th>Status</th><th>Ontvangers</th><th>Verzonden</th><th>Acties</th></tr></thead>
            <tbody id="newsletters-table"><tr><td colspan="5" style="text-align:center; padding:24px; color:var(--muted);">Laden...</td></tr></tbody>
          </table>
        </div>
      </div>

      <!-- Roles & Permissions Page -->
      ${
        perms.manageRoles
          ? `
      <div id="page-roles" class="page" style="display:none;">
        <div class="page-header">
          <div><h2>Rollen & Rechten</h2><p class="subtitle">Autorisatierollen en uitvoerende functies beheren</p></div>
        </div>

        <!-- Explanation card -->
        <div class="card" style="background:linear-gradient(135deg, #f0f7ff 0%, #e8f5e9 100%); border-left:4px solid var(--primary);">
          <h3 style="margin-bottom:8px;">Verschil tussen Autorisatierollen en Functies</h3>
          <p style="margin:0 0 8px; color:var(--text);"><strong>Autorisatierollen</strong> bepalen wat iemand <em>mag doen</em> in het systeem (bijv. admin panel toegang, gebruikers beheren).</p>
          <p style="margin:0; color:var(--text);"><strong>Uitvoerende functies</strong> bepalen wat iemand <em>is</em> in de praktijk (bijv. specialist, leraar, arts). Een gebruiker kan meerdere rollen én functies tegelijk hebben.</p>
        </div>

        <!-- Authorization Roles Section -->
        <div class="card">
          <h3 style="margin-bottom:16px;">Autorisatierollen (systeemtoegang)</h3>
          <table>
            <thead><tr><th>Rol</th><th>Bekijken</th><th>Aanmaken</th><th>Bewerken</th><th>Verwijderen</th><th>Rollen beheren</th><th>Instellingen</th><th>Logs</th><th>Notificaties</th></tr></thead>
            <tbody>
              <tr><td><span class="badge" style="background:#7B1FA2; color:white;">Super Admin</span></td><td>✓</td><td>✓</td><td>✓</td><td>✓</td><td>✓</td><td>✓</td><td>✓</td><td>✓</td></tr>
              <tr><td><span class="badge" style="background:#1565C0; color:white;">Admin</span></td><td>✓</td><td>✓</td><td>✓</td><td>✓</td><td>✗</td><td>✓</td><td>✓</td><td>✓</td></tr>
              <tr><td><span class="badge" style="background:#2E7D32; color:white;">Moderator</span></td><td>✓</td><td>✓</td><td>✓</td><td>✗</td><td>✗</td><td>✗</td><td>✗</td><td>✗</td></tr>
              <tr><td><span class="badge" style="background:#546E7A; color:white;">Gebruiker</span></td><td>Eigen data</td><td>Eigen data</td><td>Eigen data</td><td>✗</td><td>✗</td><td>✗</td><td>✗</td><td>✗</td></tr>
            </tbody>
          </table>
        </div>

        <!-- Assign Auth Role -->
        <div class="card">
          <div class="card-header"><h3>Autorisatierol toewijzen</h3></div>
          <div style="display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap;">
            <div class="form-group" style="flex:1; min-width:200px; margin-bottom:0;">
              <label>Gebruiker (email)</label>
              <input type="email" id="auth-role-email" placeholder="email@voorbeeld.nl">
            </div>
            <div class="form-group" style="width:180px; margin-bottom:0;">
              <label>Autorisatierol</label>
              <select id="auth-role-select">
                <option value="user">Gebruiker</option>
                <option value="moderator">Moderator</option>
                <option value="admin">Admin</option>
                <option value="super_admin">Super Admin</option>
              </select>
            </div>
            <button class="btn btn-primary" onclick="addAuthRole()">Toevoegen</button>
          </div>
          <div id="auth-roles-list" style="margin-top:16px;"></div>
        </div>

        <!-- Functional Roles Section -->
        <div class="card">
          <h3 style="margin-bottom:16px;">Uitvoerende Functies (praktijkrol)</h3>
          <table>
            <thead><tr><th>Functie</th><th>Beschrijving</th></tr></thead>
            <tbody>
              <tr><td><span class="badge" style="background:#E65100; color:white;">Specialist</span></td><td>Opvoedspecialist, pedagoog, psycholoog</td></tr>
              <tr><td><span class="badge" style="background:#00695C; color:white;">Leraar</span></td><td>Onderwijzer, docent, mentor</td></tr>
              <tr><td><span class="badge" style="background:#4527A0; color:white;">Kennisdrager</span></td><td>Islamitisch geleerde, imam, sjeikh</td></tr>
              <tr><td><span class="badge" style="background:#C62828; color:white;">Arts</span></td><td>Huisarts, kinderarts, specialist</td></tr>
              <tr><td><span class="badge" style="background:#1565C0; color:white;">Imam</span></td><td>Moskee-imam, geestelijk verzorger</td></tr>
              <tr><td><span class="badge" style="background:#2E7D32; color:white;">Therapeut</span></td><td>Gezinstherapeut, kindertherapeut</td></tr>
              <tr><td><span class="badge" style="background:#F57C00; color:white;">Maatschappelijk werker</span></td><td>Sociaal werker, jeugdzorg</td></tr>
              <tr><td><span class="badge" style="background:#6A1B9A; color:white;">Opvoedkundige begeleider</span></td><td>Opvoedkundige coach, pedagogisch adviseur</td></tr>
              <tr><td><span class="badge" style="background:#0277BD; color:white;">Vader</span></td><td>Vader/mannelijke verzorger van een kind</td></tr>
              <tr><td><span class="badge" style="background:#AD1457; color:white;">Moeder</span></td><td>Moeder/vrouwelijke verzorger van een kind</td></tr>
            </tbody>
          </table>
        </div>

        <!-- Assign Function -->
        <div class="card">
          <div class="card-header"><h3>Functie toewijzen</h3></div>
          <div style="display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap;">
            <div class="form-group" style="flex:1; min-width:200px; margin-bottom:0;">
              <label>Gebruiker (email)</label>
              <input type="email" id="func-role-email" placeholder="email@voorbeeld.nl">
            </div>
            <div class="form-group" style="width:200px; margin-bottom:0;">
              <label>Functie</label>
              <select id="func-role-select">
                <option value="vader">Vader</option>
                <option value="moeder">Moeder</option>
                <option value="opvoedkundige_begeleider">Opvoedkundige begeleider</option>
                <option value="specialist">Specialist</option>
                <option value="leraar">Leraar</option>
                <option value="kennisdrager">Kennisdrager</option>
                <option value="arts">Arts</option>
                <option value="imam">Imam</option>
                <option value="therapeut">Therapeut</option>
                <option value="maatschappelijk_werker">Maatschappelijk werker</option>
              </select>
            </div>
            <div class="form-group" style="width:180px; margin-bottom:0;">
              <label>Specialisatie (optioneel)</label>
              <input type="text" id="func-specialization" placeholder="bijv. Pedagoog">
            </div>
            <div class="form-group" style="width:150px; margin-bottom:0;">
              <label>Stad (optioneel)</label>
              <input type="text" id="func-city" placeholder="bijv. Amsterdam">
            </div>
            <button class="btn btn-primary" onclick="addUserFunction()">Toevoegen</button>
          </div>
          <div id="user-functions-list" style="margin-top:16px;"></div>
        </div>

        <!-- User Overview with Roles & Functions -->
        <div class="card">
          <div class="card-header"><h3>Overzicht: Gebruikers met rollen & functies</h3></div>
          <div id="roles-functions-overview" style="margin-top:12px;"><p style="color:var(--muted);">Laden...</p></div>
        </div>
      </div>`
          : ""
      }

      <!-- Settings Page -->
      ${
        perms.manageSettings
          ? `
      <div id="page-settings" class="page" style="display:none;">
        <div class="page-header">
          <div><h2>Instellingen</h2><p class="subtitle">Systeemconfiguratie</p></div>
        </div>
        <div class="card">
          <h3 style="margin-bottom:16px;">Algemene instellingen</h3>
          <div class="form-group">
            <label>App naam</label>
            <input type="text" value="Opvoedadvies" id="setting-app-name">
          </div>
          <div class="form-group">
            <label>Standaard taal</label>
            <select id="setting-default-lang">
              <option value="nl" selected>Nederlands</option>
              <option value="en">English</option>
              <option value="ar">العربية</option>
            </select>
          </div>
          <div class="form-group">
            <label>Registratie open</label>
            <select id="setting-registration">
              <option value="open" selected>Open (iedereen kan registreren)</option>
              <option value="invite">Alleen op uitnodiging</option>
              <option value="closed">Gesloten</option>
            </select>
          </div>
          <div class="form-group">
            <label>Dagelijks advies notificatie (standaard tijd)</label>
            <input type="text" value="07:00" id="setting-notification-time">
          </div>
          <button class="btn btn-primary" onclick="saveSettings()">Instellingen opslaan</button>
        </div>
        <div class="card">
          <h3 style="margin-bottom:16px;">Beveiliging</h3>
          <div class="form-group">
            <label>Sessie duur (uren)</label>
            <input type="text" value="8760" id="setting-session-hours">
          </div>
          <div class="form-group">
            <label>Maximale login pogingen</label>
            <input type="text" value="5" id="setting-max-attempts">
          </div>
          <button class="btn btn-primary" onclick="saveSecuritySettings()">Beveiligingsinstellingen opslaan</button>
        </div>
      </div>`
          : ""
      }

      <!-- Invitation Codes Page -->
      ${
        perms.manageRoles
          ? `
      <div id="page-invitations" class="page" style="display:none;">
        <div class="page-header">
          <div><h2>Uitnodigingscodes</h2><p class="subtitle">Codes per functie voor registratie (specialist, leraar, arts, etc.)</p></div>
          <button class="btn btn-primary" onclick="showCreateInvitationModal()">+ Nieuwe code</button>
        </div>
        <div class="card" style="padding:0; overflow:hidden;">
          <table>
            <thead><tr><th>Code</th><th>Functie</th><th>Beperkt tot e-mail</th><th>Max gebruik</th><th>Gebruikt</th><th>Status</th><th>Acties</th></tr></thead>
            <tbody id="invitations-table"><tr><td colspan="7" style="text-align:center; padding:24px; color:var(--muted);">Laden...</td></tr></tbody>
          </table>
        </div>
      </div>`
          : ""
      }

      <!-- Logs Page -->
      ${
        perms.viewLogs
          ? `
      <div id="page-logs" class="page" style="display:none;">
        <div class="page-header">
          <div><h2>Systeemlog</h2><p class="subtitle">Audit trail en systeemgebeurtenissen</p></div>
          <button class="btn btn-outline" onclick="refreshLogs()">↻ Vernieuwen</button>
        </div>
        <div class="card" id="logs-container">
          <div class="activity-item"><div class="activity-dot" style="background:var(--success);"></div><div><div class="activity-text">Systeem gestart</div><div class="activity-time">Nu</div></div></div>
        </div>
      </div>`
          : ""
      }

      <!-- Activity Page -->
      <div id="page-activity" class="page" style="display:none;">
        <div class="page-header">
          <div><h2>Activiteitenlog</h2><p class="subtitle">Recente acties op het platform</p></div>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-outline" onclick="loadActivity()">↻ Vernieuwen</button>
            <a class="btn btn-success" href="/admin-api/export/audit" download>⬇ Export CSV</a>
          </div>
        </div>
        <div class="card" id="activity-container">
          <div class="empty-state"><div class="icon">📋</div><p>Activiteiten worden geladen...</p></div>
        </div>
      </div>

      <!-- 2FA Page -->
      <div id="page-2fa" class="page" style="display:none;">
        <div class="page-header">
          <div><h2>Twee-Factor Authenticatie</h2><p class="subtitle">Extra beveiliging voor uw account</p></div>
        </div>
        <div class="card" id="2fa-container">
          <div id="2fa-status"><p style="color:var(--muted);">Status laden...</p></div>
          <div id="2fa-setup" style="display:none; margin-top:20px;">
            <h3 style="margin-bottom:12px;">2FA Instellen</h3>
            <p style="font-size:0.85rem; color:var(--muted); margin-bottom:16px;">Scan de QR-code met een authenticator app (Google Authenticator, Authy, etc.) of voer de geheime sleutel handmatig in.</p>
            <div style="background:var(--bg); padding:16px; border-radius:8px; margin-bottom:16px;">
              <p style="font-size:0.8rem; color:var(--muted); margin-bottom:8px;">Geheime sleutel (handmatig invoeren):</p>
              <code id="2fa-secret" style="font-size:1rem; font-weight:700; letter-spacing:2px;"></code>
            </div>
            <div style="background:var(--bg); padding:16px; border-radius:8px; margin-bottom:16px;">
              <p style="font-size:0.8rem; color:var(--muted); margin-bottom:8px;">OTPAuth URI (voor QR-code):</p>
              <code id="2fa-uri" style="font-size:0.7rem; word-break:break-all;"></code>
            </div>
            <div style="background:#FFF3E0; padding:12px 16px; border-radius:8px; margin-bottom:16px;">
              <p style="font-size:0.8rem; font-weight:600; color:#E65100;">⚠️ Bewaar deze backup codes veilig:</p>
              <div id="2fa-backup-codes" style="font-family:monospace; font-size:0.85rem; margin-top:8px;"></div>
            </div>
            <div style="display:flex; gap:8px; align-items:flex-end;">
              <div class="form-group" style="flex:1; margin-bottom:0;">
                <label>Verificatiecode (6 cijfers)</label>
                <input type="text" id="2fa-token" placeholder="000000" maxlength="6" style="font-size:1.2rem; letter-spacing:4px; text-align:center;">
              </div>
              <button class="btn btn-primary" onclick="verify2FA()">Verifiëren & Activeren</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Export Page -->
      <div id="page-export" class="page" style="display:none;">
        <div class="page-header">
          <div><h2>Data Export</h2><p class="subtitle">Download gegevens als CSV-bestand (Excel-compatibel)</p></div>
        </div>
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:16px;">
          <div class="card" style="text-align:center;">
            <div style="font-size:2.5rem; margin-bottom:12px;">👤</div>
            <h3 style="margin-bottom:8px;">Gebruikers</h3>
            <p style="font-size:0.8rem; color:var(--muted); margin-bottom:16px;">Alle geregistreerde gebruikers met rollen, taal en activiteit</p>
            <a class="btn btn-primary" href="/admin-api/export/users" download>⬇ Download CSV</a>
          </div>
          <div class="card" style="text-align:center;">
            <div style="font-size:2.5rem; margin-bottom:12px;">👶</div>
            <h3 style="margin-bottom:8px;">Kinderen</h3>
            <p style="font-size:0.8rem; color:var(--muted); margin-bottom:16px;">Alle kinderen met leeftijd, geslacht en gezin</p>
            <a class="btn btn-primary" href="/admin-api/export/children" download>⬇ Download CSV</a>
          </div>
          <div class="card" style="text-align:center;">
            <div style="font-size:2.5rem; margin-bottom:12px;">👨‍👩‍👧</div>
            <h3 style="margin-bottom:8px;">Gezinnen</h3>
            <p style="font-size:0.8rem; color:var(--muted); margin-bottom:16px;">Alle gezinnen met leden- en kinderaantal</p>
            <a class="btn btn-primary" href="/admin-api/export/families" download>⬇ Download CSV</a>
          </div>
          <div class="card" style="text-align:center;">
            <div style="font-size:2.5rem; margin-bottom:12px;">📋</div>
            <h3 style="margin-bottom:8px;">Audit Log</h3>
            <p style="font-size:0.8rem; color:var(--muted); margin-bottom:16px;">Alle admin-acties en systeemgebeurtenissen</p>
            <a class="btn btn-primary" href="/admin-api/export/audit" download>⬇ Download CSV</a>
          </div>
        </div>
      </div>
    </main>
  </div>

  <!-- Modals -->
  <div class="modal-overlay" id="modal-create-user">
    <div class="modal">
      <h3>Nieuwe gebruiker aanmaken</h3>
      <div class="form-group"><label>Naam</label><input type="text" id="new-user-name"></div>
      <div class="form-group"><label>Email</label><input type="email" id="new-user-email"></div>
      <div class="form-group"><label>Wachtwoord</label><input type="text" id="new-user-password"></div>
      <div class="form-group"><label>Rol</label>
        <select id="new-user-role">
          <option value="user">Gebruiker</option>
          <option value="moderator">Moderator</option>
          <option value="admin">Admin</option>
          <option value="specialist">Specialist</option>
          <option value="teacher">Leraar</option>
        </select>
      </div>
      <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:20px;">
        <button class="btn btn-outline" onclick="closeModal('modal-create-user')">Annuleren</button>
        <button class="btn btn-primary" onclick="createUser()">Aanmaken</button>
      </div>
    </div>
  </div>

  <div class="modal-overlay" id="modal-broadcast">
    <div class="modal">
      <h3>Broadcast bericht</h3>
      <div class="form-group"><label>Onderwerp</label><input type="text" id="broadcast-subject"></div>
      <div class="form-group"><label>Bericht</label><textarea id="broadcast-message" rows="4"></textarea></div>
      <div class="form-group"><label>Doelgroep</label>
        <select id="broadcast-target">
          <option value="all">Alle gebruikers</option>
          <option value="parents">Alleen ouders</option>
          <option value="admins">Alleen admins</option>
        </select>
      </div>
      <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:20px;">
        <button class="btn btn-outline" onclick="closeModal('modal-broadcast')">Annuleren</button>
        <button class="btn btn-primary" onclick="sendBroadcast()">Verzenden</button>
      </div>
    </div>
    </div>
  <div class="modal-overlay" id="modal-create-content">
    <div class="modal">
      <h3>Nieuwe content aanmaken</h3>
      <div class="form-group"><label>Titel</label><input type="text" id="new-content-title"></div>
      <div class="form-group"><label>Type</label>
        <select id="new-content-type">
          <option value="artikel">Artikel</option>
          <option value="advies">Advies</option>
          <option value="bron">Bron/Referentie</option>
          <option value="video">Video</option>
        </select>
      </div>
      <div class="form-group"><label>Categorie</label>
        <select id="new-content-category">
          <option value="opvoeding">Opvoeding</option>
          <option value="islamitisch">Islamitisch</option>
          <option value="gezondheid">Gezondheid</option>
          <option value="ontwikkeling">Ontwikkeling</option>
          <option value="gedrag">Gedrag</option>
        </select>
      </div>
      <div class="form-group"><label>Inhoud</label><textarea id="new-content-body" rows="5" placeholder="Schrijf hier de inhoud..."></textarea></div>
      <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:20px;">
        <button class="btn btn-outline" onclick="closeModal('modal-create-content')">Annuleren</button>
        <button class="btn btn-primary" onclick="createContent()">Opslaan</button>
      </div>
    </div>
  </div>
  <div class="modal-overlay" id="modal-create-notification">
    <div class="modal">
      <h3>Nieuwe notificatie versturen</h3>
      <div class="form-group"><label>Titel</label><input type="text" id="new-notif-title" placeholder="Notificatie titel"></div>
      <div class="form-group"><label>Bericht</label><textarea id="new-notif-message" rows="3" placeholder="Notificatie inhoud..."></textarea></div>
      <div class="form-group"><label>Doelgroep</label>
        <select id="new-notif-target">
          <option value="all">Alle gebruikers</option>
          <option value="parents">Alleen ouders</option>
          <option value="admins">Alleen admins</option>
        </select>
      </div>
      <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:20px;">
        <button class="btn btn-outline" onclick="closeModal('modal-create-notification')">Annuleren</button>
        <button class="btn btn-primary" onclick="sendNotification()">Versturen</button>
      </div>
    </div>
  </div>
  <div class="modal-overlay" id="modal-create-newsletter">
    <div class="modal">
      <h3>Nieuwe nieuwsbrief</h3>
      <div class="form-group"><label>Onderwerp</label><input type="text" id="new-newsletter-subject" placeholder="Nieuwsbrief onderwerp"></div>
      <div class="form-group"><label>Inhoud</label><textarea id="new-newsletter-body" rows="6" placeholder="Schrijf hier de nieuwsbrief..."></textarea></div>
      <div class="form-group"><label>Ontvangers</label>
        <select id="new-newsletter-recipients">
          <option value="all">Alle abonnees</option>
          <option value="active">Actieve gebruikers</option>
          <option value="new">Nieuwe gebruikers (< 30 dagen)</option>
        </select>
      </div>
      <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:20px;">
        <button class="btn btn-outline" onclick="closeModal('modal-create-newsletter')">Annuleren</button>
        <button class="btn btn-primary" onclick="sendNewsletter()">Verzenden</button>
      </div>
    </div>
  </div>
  <script>
    const CURRENT_ROLE = '${role}';
    const PERMS = ${JSON.stringify(perms)};
    let allUsers = [];
    let allFamilies = [];
    let allChildren = [];

    function escapeHtml(value) {
      return String(value == null ? '' : value).replace(/[&<>"']/g, function(char) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
      });
    }

    // Navigation
    document.querySelectorAll('.nav-item[data-page]').forEach(item => {
      item.addEventListener('click', () => {
        const page = item.dataset.page;
        document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
        const el = document.getElementById('page-' + page);
        if (el) el.style.display = 'block';
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        item.classList.add('active');
        loadPageData(page);
      });
    });

    function handleLogout() {
      window.location.href = '/auth/logout';
    }

    function showToast(msg, type = 'success') {
      const toast = document.createElement('div');
      toast.className = 'toast ' + type;
      toast.textContent = msg;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 3000);
    }

    function closeModal(id) {
      var el = document.getElementById(id);
      if (el) {
        el.classList.remove('active');
        if (el.getAttribute('data-dynamic') === 'true') { el.remove(); }
      }
    }

    function showCreateUserModal() {
      document.getElementById('modal-create-user').classList.add('active');
    }

    function showBroadcastModal() {
      document.getElementById('modal-broadcast').classList.add('active');
    }

    function showNotificationModal() {
      document.getElementById('modal-create-notification').classList.add('active');
    }
    async function sendNotification() {
      var title = document.getElementById('new-notif-title').value;
      var message = document.getElementById('new-notif-message').value;
      var target = document.getElementById('new-notif-target').value;
      if (!title || !message) { showToast('Vul alle velden in', 'error'); return; }
      var result = await apiPost('broadcast', { subject: title, message: message, target: target });
      if (result && result.success) {
        showToast('Notificatie verzonden');
        closeModal('modal-create-notification');
        document.getElementById('new-notif-title').value = '';
        document.getElementById('new-notif-message').value = '';
        loadNotifications();
      } else {
        showToast('Fout bij verzenden', 'error');
      }
    }
    // ─── CMS Functions ─────────────────────────────────────────────
    var cmsCategories = [];
    var cmsSearchTimeout = null;
    function debounceCmsSearch() {
      if (cmsSearchTimeout) clearTimeout(cmsSearchTimeout);
      cmsSearchTimeout = setTimeout(loadCmsContent, 300);
    }
    function clearCmsFilters() {
      var searchEl = document.getElementById('cms-filter-search');
      var typeEl = document.getElementById('cms-filter-type');
      var statusEl = document.getElementById('cms-filter-status');
      var langEl = document.getElementById('cms-filter-language');
      var catEl = document.getElementById('cms-filter-category');
      if (searchEl) searchEl.value = '';
      if (typeEl) typeEl.value = '';
      if (statusEl) statusEl.value = '';
      if (langEl) langEl.value = '';
      if (catEl) catEl.value = '';
      loadCmsContent();
    }
    var cmsPagination = { page: 1, total: 0 };
    var cmsSelectedIds = [];
    var cmsAllData = [];
    var currentPreviewItem = null;
    var currentPreviewLang = 'nl';
    var scheduleItemId = null;

    async function loadCmsContent() {
      var searchQuery = (document.getElementById('cms-filter-search')?.value || '').trim().toLowerCase();
      var typeFilter = document.getElementById('cms-filter-type')?.value || '';
      var statusFilter = document.getElementById('cms-filter-status')?.value || '';
      var langFilter = document.getElementById('cms-filter-language')?.value || '';
      var catFilter = document.getElementById('cms-filter-category')?.value || '';
      var sortBy = document.getElementById('cms-sort')?.value || 'date-desc';
      var perPage = parseInt(document.getElementById('cms-per-page')?.value || '25');
      var table = document.getElementById('content-table');
      if (!table) return;
      table.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:24px;">Laden...</td></tr>';
      try {
        var params = [];
        if (typeFilter) params.push('contentType=' + typeFilter);
        if (statusFilter) params.push('status=' + statusFilter);
        if (catFilter) params.push('categoryId=' + catFilter);
        var data = await apiGet('cms/content' + (params.length ? '?' + params.join('&') : ''));
        if (!data) data = [];
        // Client-side search filter
        if (searchQuery) {
          data = data.filter(function(item) {
            var texts = (item.translations || []).map(function(t) {
              return ((t.title || '') + ' ' + (t.summary || '') + ' ' + (t.body || '')).toLowerCase();
            }).join(' ');
            return texts.indexOf(searchQuery) !== -1;
          });
        }
        // Client-side language filter
        if (langFilter === 'missing') {
          data = data.filter(function(item) {
            var tLangs = (item.translations || []).map(function(t) { return t.language; });
            return tLangs.indexOf('nl') === -1 || tLangs.indexOf('en') === -1 || tLangs.indexOf('ar') === -1;
          });
        } else if (langFilter) {
          data = data.filter(function(item) {
            return (item.translations || []).some(function(t) { return t.language === langFilter; });
          });
        }
        // Sorting
        data.sort(function(a, b) {
          if (sortBy === 'date-desc') return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
          if (sortBy === 'date-asc') return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
          var tA = (a.translations || [])[0]?.title || '';
          var tB = (b.translations || [])[0]?.title || '';
          if (sortBy === 'title-asc') return tA.localeCompare(tB);
          if (sortBy === 'title-desc') return tB.localeCompare(tA);
          return 0;
        });
        cmsAllData = data;
        // Stats dashboard
        renderCmsStats(data);
        // Result count
        var totalFiltered = data.length;
        cmsPagination.total = totalFiltered;
        var totalPages = Math.ceil(totalFiltered / perPage);
        if (cmsPagination.page > totalPages) cmsPagination.page = 1;
        var startIdx = (cmsPagination.page - 1) * perPage;
        var pageData = data.slice(startIdx, startIdx + perPage);
        document.getElementById('cms-result-count').textContent = totalFiltered + ' items' + (totalFiltered !== data.length ? ' (gefilterd)' : '') + ' — pagina ' + cmsPagination.page + ' van ' + Math.max(totalPages, 1);
        if (pageData.length === 0) {
          table.innerHTML = '<tr><td colspan="9" class="empty-state">Geen content gevonden' + (searchQuery ? ' voor "' + escapeHtml(searchQuery) + '"' : '') + '.</td></tr>';
          renderPagination(totalPages);
          return;
        }
        var typeLabels = { article: 'Artikel', video: 'Video', audio: 'Audio', tip: 'Tip', fatwa: 'Fatwa' };
        var statusLabels = { draft: 'Concept', published: 'Gepubliceerd', archived: 'Gearchiveerd', scheduled: 'Ingepland' };
        table.innerHTML = pageData.map(function(item) {
          var nlT = item.translations?.find(function(t) { return t.language === 'nl'; });
          var enT = item.translations?.find(function(t) { return t.language === 'en'; });
          var arT = item.translations?.find(function(t) { return t.language === 'ar'; });
          var title = nlT?.title || enT?.title || arT?.title || '(geen titel)';
          var langs = [];
          if (nlT) langs.push('NL');
          if (enT) langs.push('EN');
          if (arT) langs.push('AR');
          var cat = cmsCategories.find(function(c) { return c.id === item.categoryId; });
          var catName = cat ? cat.nameNl : '-';
          var tags = (item.tags || []).map(function(t) { return '<span style="background:#F3E5F5;color:#7B1FA2;padding:1px 5px;border-radius:3px;font-size:0.7rem;margin-right:2px;">' + escapeHtml(t) + '</span>'; }).join('') || '<span style="color:var(--muted);font-size:0.8rem;">-</span>';
          var statusColor = item.status === 'published' ? '#E8F5E9' : item.status === 'archived' ? '#ECEFF1' : item.status === 'scheduled' ? '#E8EAF6' : '#FFF3E0';
          var statusTextColor = item.status === 'published' ? '#2E7D32' : item.status === 'archived' ? '#546E7A' : item.status === 'scheduled' ? '#283593' : '#E65100';
          var date = item.createdAt ? new Date(item.createdAt).toLocaleDateString('nl-NL') : '-';
          var isChecked = cmsSelectedIds.indexOf(item.id) !== -1;
          return '<tr style="' + (isChecked ? 'background:#E3F2FD;' : '') + '">' +
            '<td><input type="checkbox" class="cms-item-cb" data-id="' + item.id + '" ' + (isChecked ? 'checked' : '') + ' onchange="toggleItemSelect(' + item.id + ', this.checked)"></td>' +
            '<td><strong>' + escapeHtml(title) + '</strong></td>' +
            '<td>' + escapeHtml(typeLabels[item.contentType] || item.contentType) + '</td>' +
            '<td>' + escapeHtml(catName) + '</td>' +
            '<td>' + tags + '</td>' +
            '<td>' + langs.map(function(l) { return '<span style="background:#E3F2FD;color:#1565C0;padding:1px 6px;border-radius:3px;font-size:0.75rem;margin-right:2px;">' + l + '</span>'; }).join('') + '</td>' +
            '<td><span style="background:' + statusColor + ';color:' + statusTextColor + ';padding:2px 8px;border-radius:4px;font-size:0.8rem;">' + escapeHtml(statusLabels[item.status] || item.status) + '</span></td>' +
            '<td>' + date + '</td>' +
            '<td style="white-space:nowrap;"><div style="display:flex;flex-wrap:wrap;gap:3px;">' +
            '<button class="btn btn-sm btn-outline" onclick="previewContent(' + item.id + ')" title="Preview">\uD83D\uDC41</button>' +
            '<button class="btn btn-sm btn-outline" onclick="editContentItem(' + item.id + ')" title="Bewerken">\u270F\uFE0F</button>' +
            '<button class="btn btn-sm btn-outline" onclick="duplicateContent(' + item.id + ')" title="Dupliceren">\uD83D\uDCCB</button>' +
            '<button class="btn btn-sm btn-outline" onclick="compareTranslations(' + item.id + ')" title="Vergelijk">\u2194\uFE0F</button>' +
            '<button class="btn btn-sm" style="background:#E8F5E9;color:#2E7D32;" onclick="publishContent(' + item.id + ')">Pub</button>' +
            '<button class="btn btn-sm" style="background:#E8EAF6;color:#283593;" onclick="scheduleContent(' + item.id + ')" title="Inplannen">\uD83D\uDCC5</button>' +
            '<button class="btn btn-sm" style="background:#E3F2FD;color:#1565C0;" onclick="translateAllContent(' + item.id + ')">Vert</button>' +
            '<button class="btn btn-sm btn-outline" onclick="uploadFileForContent(' + item.id + ')" title="Bestand">\uD83D\uDCC2</button>' +
            '<button class="btn btn-sm btn-outline" onclick="showNotes(' + item.id + ')" title="Notities">\uD83D\uDCDD</button>' +
            '<button class="btn btn-sm btn-outline" onclick="showActivity(' + item.id + ')" title="Log">\uD83D\uDCCA</button>' +
            '<button class="btn btn-sm" style="background:#FFF3E0;color:#E65100;" onclick="archiveContent(' + item.id + ')">Arch</button>' +
            '<button class="btn btn-sm" style="background:#FCE4EC;color:#C62828;" onclick="deleteContent(' + item.id + ')">\u2716</button>' +
            '</div></td></tr>';
        }).join('');
        renderPagination(totalPages);
        updateBulkToolbar();
      } catch(e) {
        table.innerHTML = '<tr><td colspan="9" class="empty-state">Fout bij laden: ' + escapeHtml(e.message) + '</td></tr>';
      }
    }

    function renderCmsStats(data) {
      var statsEl = document.getElementById('cms-stats');
      if (!statsEl) return;
      var total = data.length;
      var published = data.filter(function(i) { return i.status === 'published'; }).length;
      var draft = data.filter(function(i) { return i.status === 'draft'; }).length;
      var archived = data.filter(function(i) { return i.status === 'archived'; }).length;
      var withNl = data.filter(function(i) { return (i.translations||[]).some(function(t){return t.language==='nl';}); }).length;
      var withEn = data.filter(function(i) { return (i.translations||[]).some(function(t){return t.language==='en';}); }).length;
      var withAr = data.filter(function(i) { return (i.translations||[]).some(function(t){return t.language==='ar';}); }).length;
      var incomplete = data.filter(function(i) { var ls=(i.translations||[]).map(function(t){return t.language;}); return ls.indexOf('nl')===-1||ls.indexOf('en')===-1||ls.indexOf('ar')===-1; }).length;
      statsEl.innerHTML = [
        {label:'Totaal',value:total,color:'#1565C0',bg:'#E3F2FD'},
        {label:'Gepubliceerd',value:published,color:'#2E7D32',bg:'#E8F5E9'},
        {label:'Concept',value:draft,color:'#E65100',bg:'#FFF3E0'},
        {label:'Gearchiveerd',value:archived,color:'#546E7A',bg:'#ECEFF1'},
        {label:'NL',value:withNl,color:'#1565C0',bg:'#E3F2FD'},
        {label:'EN',value:withEn,color:'#1565C0',bg:'#E3F2FD'},
        {label:'AR',value:withAr,color:'#1565C0',bg:'#E3F2FD'},
        {label:'Onvolledig',value:incomplete,color:'#C62828',bg:'#FCE4EC'}
      ].map(function(s) {
        return '<div style="background:'+s.bg+';padding:12px 16px;border-radius:10px;text-align:center;"><div style="font-size:1.5rem;font-weight:700;color:'+s.color+';">'+s.value+'</div><div style="font-size:0.75rem;color:'+s.color+';margin-top:2px;">'+s.label+'</div></div>';
      }).join('');
    }

    function renderPagination(totalPages) {
      var pagEl = document.getElementById('cms-pagination');
      if (!pagEl) return;
      if (totalPages <= 1) { pagEl.innerHTML = ''; return; }
      var html = '';
      html += '<button class="btn btn-sm btn-outline" ' + (cmsPagination.page <= 1 ? 'disabled' : '') + ' onclick="cmsPagination.page--;loadCmsContent()">&laquo; Vorige</button>';
      for (var i = 1; i <= totalPages; i++) {
        if (i === cmsPagination.page) html += '<button class="btn btn-sm" style="background:var(--primary);color:#fff;">' + i + '</button>';
        else if (i <= 3 || i >= totalPages - 2 || Math.abs(i - cmsPagination.page) <= 1) html += '<button class="btn btn-sm btn-outline" onclick="cmsPagination.page=' + i + ';loadCmsContent()">' + i + '</button>';
        else if (i === 4 || i === totalPages - 3) html += '<span style="padding:0 4px;">...</span>';
      }
      html += '<button class="btn btn-sm btn-outline" ' + (cmsPagination.page >= totalPages ? 'disabled' : '') + ' onclick="cmsPagination.page++;loadCmsContent()">Volgende &raquo;</button>';
      pagEl.innerHTML = html;
    }

    // Bulk selection
    function toggleSelectAll(cb) {
      var checkboxes = document.querySelectorAll('.cms-item-cb');
      checkboxes.forEach(function(c) { c.checked = cb.checked; toggleItemSelect(parseInt(c.dataset.id), cb.checked, true); });
      updateBulkToolbar();
    }
    function toggleItemSelect(id, checked, skipUpdate) {
      if (checked && cmsSelectedIds.indexOf(id) === -1) cmsSelectedIds.push(id);
      if (!checked) cmsSelectedIds = cmsSelectedIds.filter(function(x) { return x !== id; });
      if (!skipUpdate) updateBulkToolbar();
    }
    function deselectAll() {
      cmsSelectedIds = [];
      document.querySelectorAll('.cms-item-cb').forEach(function(c) { c.checked = false; });
      var selectAll = document.getElementById('select-all-cb');
      if (selectAll) selectAll.checked = false;
      updateBulkToolbar();
    }
    function updateBulkToolbar() {
      var toolbar = document.getElementById('bulk-toolbar');
      var countEl = document.getElementById('bulk-count');
      if (cmsSelectedIds.length > 0) {
        toolbar.style.display = 'flex';
        countEl.textContent = cmsSelectedIds.length + ' geselecteerd';
      } else {
        toolbar.style.display = 'none';
      }
    }
    async function bulkPublish() {
      if (!confirm('Weet je zeker dat je ' + cmsSelectedIds.length + ' items wilt publiceren?')) return;
      for (var i = 0; i < cmsSelectedIds.length; i++) {
        await apiPost('cms/content/' + cmsSelectedIds[i] + '/publish', {});
      }
      showToast(cmsSelectedIds.length + ' items gepubliceerd');
      cmsSelectedIds = []; loadCmsContent();
    }
    async function bulkTranslate() {
      if (!confirm('Weet je zeker dat je ' + cmsSelectedIds.length + ' items wilt vertalen naar alle talen?')) return;
      showToast('Vertaling gestart voor ' + cmsSelectedIds.length + ' items...');
      for (var i = 0; i < cmsSelectedIds.length; i++) {
        await apiPost('cms/content/' + cmsSelectedIds[i] + '/translate-all', {});
      }
      showToast('Alle vertalingen voltooid');
      cmsSelectedIds = []; loadCmsContent();
    }
    async function bulkArchive() {
      if (!confirm('Weet je zeker dat je ' + cmsSelectedIds.length + ' items wilt archiveren?')) return;
      for (var i = 0; i < cmsSelectedIds.length; i++) {
        await apiPost('cms/content/' + cmsSelectedIds[i], { status: 'archived' });
      }
      showToast(cmsSelectedIds.length + ' items gearchiveerd');
      cmsSelectedIds = []; loadCmsContent();
    }
    async function bulkDelete() {
      if (!confirm('WAARSCHUWING: Weet je zeker dat je ' + cmsSelectedIds.length + ' items permanent wilt verwijderen?')) return;
      for (var i = 0; i < cmsSelectedIds.length; i++) {
        await apiDelete('cms/content/' + cmsSelectedIds[i]);
      }
      showToast(cmsSelectedIds.length + ' items verwijderd');
      cmsSelectedIds = []; loadCmsContent();
    }

    // Preview
    function previewContent(id) {
      var item = cmsAllData.find(function(i) { return i.id === id; });
      if (!item) return;
      currentPreviewItem = item;
      currentPreviewLang = 'nl';
      renderPreview();
      document.getElementById('preview-modal').style.display = 'flex';
    }
    function switchPreviewLang(lang) {
      currentPreviewLang = lang;
      renderPreview();
    }
    function renderPreview() {
      var item = currentPreviewItem;
      if (!item) return;
      var t = (item.translations || []).find(function(tr) { return tr.language === currentPreviewLang; });
      var dir = currentPreviewLang === 'ar' ? 'rtl' : 'ltr';
      var content = document.getElementById('preview-content');
      ['nl','en','ar'].forEach(function(l) {
        var btn = document.getElementById('preview-'+l+'-btn');
        if (btn) btn.style.background = l === currentPreviewLang ? '#E3F2FD' : '#f5f5f5';
      });
      if (!t) { content.innerHTML = '<p style="color:var(--muted);text-align:center;">Geen vertaling beschikbaar voor ' + currentPreviewLang.toUpperCase() + '</p>'; return; }
      content.innerHTML = '<div style="direction:'+dir+';text-align:'+( dir==='rtl'?'right':'left')+';">' +
        '<div style="background:#1B4332;color:#fff;padding:12px 16px;border-radius:10px;margin-bottom:12px;"><h3 style="margin:0;font-size:1.1rem;">' + escapeHtml(t.title || '') + '</h3></div>' +
        (t.summary ? '<p style="color:#666;font-size:0.9rem;margin-bottom:12px;">' + escapeHtml(t.summary) + '</p>' : '') +
        '<div style="font-size:0.9rem;line-height:1.6;">' + escapeHtml(t.body || '').split(String.fromCharCode(10)).join('<br>') + '</div>' +
        ((item.files || []).length ? '<div style="margin-top:16px;border-top:1px solid #eee;padding-top:12px;"><strong>Bestanden:</strong><ul>' + item.files.map(function(f){return '<li><a href="'+escapeHtml(f.fileUrl)+'" target="_blank" rel="noopener noreferrer">'+escapeHtml(f.fileName)+'</a></li>';}).join('') + '</ul></div>' : '') +
        '</div>';
    }
    function closePreviewModal() { document.getElementById('preview-modal').style.display = 'none'; }

    // Compare translations side-by-side
    function compareTranslations(id) {
      var item = cmsAllData.find(function(i) { return i.id === id; });
      if (!item) return;
      var langs = ['nl','en','ar'];
      var content = document.getElementById('compare-content');
      content.innerHTML = langs.map(function(lang) {
        var t = (item.translations || []).find(function(tr) { return tr.language === lang; });
        var dir = lang === 'ar' ? 'rtl' : 'ltr';
        return '<div style="border:1px solid #eee;border-radius:10px;padding:12px;direction:'+dir+';">' +
          '<h4 style="margin:0 0 8px;color:#1565C0;">' + lang.toUpperCase() + '</h4>' +
          (t ? '<h5 style="margin:0 0 6px;">' + escapeHtml(t.title||'') + '</h5><p style="font-size:0.85rem;color:#666;">' + escapeHtml(t.summary||'') + '</p><div style="font-size:0.8rem;margin-top:8px;">' + escapeHtml((t.body||'').substring(0,300)) + (t.body && t.body.length > 300 ? '...' : '') + '</div>' : '<p style="color:var(--muted);">Geen vertaling</p>') +
          '</div>';
      }).join('');
      document.getElementById('compare-modal').style.display = 'flex';
    }
    function closeCompareModal() { document.getElementById('compare-modal').style.display = 'none'; }

    // Duplicate
    async function duplicateContent(id) {
      if (!confirm('Wil je dit item dupliceren?')) return;
      var item = cmsAllData.find(function(i) { return i.id === id; });
      if (!item) return;
      var result = await apiPost('cms/content', {
        contentType: item.contentType,
        categoryId: item.categoryId,
        appSection: item.appSection,
        status: 'draft',
        translations: (item.translations || []).map(function(t) { return { language: t.language, title: t.title + ' (kopie)', summary: t.summary, body: t.body }; })
      });
      if (result) { showToast('Item gedupliceerd als concept'); loadCmsContent(); }
    }

    // Archive
    async function archiveContent(id) {
      if (!confirm('Wil je dit item archiveren?')) return;
      await apiPost('cms/content/' + id, { status: 'archived' });
      showToast('Item gearchiveerd');
      loadCmsContent();
    }

    // Schedule
    function scheduleContent(id) {
      scheduleItemId = id;
      document.getElementById('schedule-datetime').value = '';
      document.getElementById('schedule-modal').style.display = 'flex';
    }
    function closeScheduleModal() { document.getElementById('schedule-modal').style.display = 'none'; }
    async function confirmSchedule() {
      var dt = document.getElementById('schedule-datetime').value;
      if (!dt) { showToast('Kies een datum en tijd', 'error'); return; }
      await apiPost('cms/content/' + scheduleItemId, { status: 'scheduled', scheduledAt: new Date(dt).toISOString() });
      showToast('Publicatie ingepland op ' + new Date(dt).toLocaleString('nl-NL'));
      closeScheduleModal();
      loadCmsContent();
    }

    // Notes
    function showNotes(id) {
      var item = cmsAllData.find(function(i) { return i.id === id; });
      var notes = item?.notes || [];
      var content = document.getElementById('notes-content');
      content.innerHTML = '<div style="margin-bottom:12px;">' +
        (notes.length ? notes.map(function(n) { return '<div style="border-bottom:1px solid #eee;padding:8px 0;"><p style="margin:0;">' + escapeHtml(n.text) + '</p><small style="color:var(--muted);">' + escapeHtml(n.author||'Admin') + ' - ' + (n.date ? new Date(n.date).toLocaleString('nl-NL') : '') + '</small></div>'; }).join('') : '<p style="color:var(--muted);">Nog geen notities.</p>') +
        '</div><textarea id="new-note-text" rows="3" placeholder="Nieuwe notitie..." style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--border);margin-bottom:8px;"></textarea>' +
        '<button class="btn btn-primary" onclick="addNote(' + id + ')">Toevoegen</button>';
      document.getElementById('notes-modal').style.display = 'flex';
    }
    function closeNotesModal() { document.getElementById('notes-modal').style.display = 'none'; }
    async function addNote(id) {
      var text = document.getElementById('new-note-text')?.value;
      if (!text) return;
      await apiPost('cms/content/' + id + '/note', { text: text });
      showToast('Notitie toegevoegd');
      showNotes(id);
      loadCmsContent();
    }

    // Activity log
    function showActivity(id) {
      var item = cmsAllData.find(function(i) { return i.id === id; });
      var log = item?.activityLog || [];
      var content = document.getElementById('activity-content');
      content.innerHTML = log.length ? '<table style="width:100%;font-size:0.85rem;"><thead><tr><th>Actie</th><th>Gebruiker</th><th>Datum</th></tr></thead><tbody>' +
        log.map(function(entry) { return '<tr><td>' + escapeHtml(entry.action) + '</td><td>' + escapeHtml(entry.user||'Systeem') + '</td><td>' + new Date(entry.date).toLocaleString('nl-NL') + '</td></tr>'; }).join('') +
        '</tbody></table>' : '<p style="color:var(--muted);text-align:center;">Geen activiteit geregistreerd.</p>';
      document.getElementById('activity-modal').style.display = 'flex';
    }
    function closeActivityModal() { document.getElementById('activity-modal').style.display = 'none'; }

    // Export CSV
    function exportCsv() {
      var rows = [['ID','Type','Status','Categorie','Titel (NL)','Titel (EN)','Titel (AR)','Samenvatting (NL)','Aangemaakt']];
      cmsAllData.forEach(function(item) {
        var nlT = (item.translations||[]).find(function(t){return t.language==='nl';});
        var enT = (item.translations||[]).find(function(t){return t.language==='en';});
        var arT = (item.translations||[]).find(function(t){return t.language==='ar';});
        var cat = cmsCategories.find(function(c){return c.id===item.categoryId;});
        rows.push([item.id, item.contentType, item.status, cat?cat.nameNl:'-', nlT?.title||'', enT?.title||'', arT?.title||'', nlT?.summary||'', item.createdAt||'']);
      });
      var csv = rows.map(function(r){return r.map(function(c){return '"'+(c+'').replace(/"/g,'""')+'"';}).join(',');}).join(String.fromCharCode(10));
      var blob = new Blob([csv], {type:'text/csv'});
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'content_export_' + new Date().toISOString().slice(0,10) + '.csv'; a.click();
      showToast('CSV gedownload');
    }

    // Export JSON
    function exportJson() {
      var blob = new Blob([JSON.stringify(cmsAllData, null, 2)], {type:'application/json'});
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'content_backup_' + new Date().toISOString().slice(0,10) + '.json'; a.click();
      showToast('JSON backup gedownload');
    }

    // Import CSV
    async function importCsv(input) {
      var file = input.files[0];
      if (!file) return;
      var text = await file.text();
      var lines = text.split(String.fromCharCode(10)).filter(function(l){return l.trim();});
      if (lines.length < 2) { showToast('CSV bevat geen data', 'error'); return; }
      var imported = 0;
      for (var i = 1; i < lines.length; i++) {
        var cols = lines[i].match(/("[^"]*"|[^,]+)/g) || [];
        cols = cols.map(function(c){return c.replace(/^"|"$/g,'').replace(/""/g,'"');});
        if (cols.length < 5) continue;
        var contentType = cols[1] || 'article';
        var titleNl = cols[4] || '';
        var titleEn = cols[5] || '';
        var titleAr = cols[6] || '';
        var summary = cols[7] || '';
        var translations = [];
        if (titleNl) translations.push({language:'nl',title:titleNl,summary:summary,body:''});
        if (titleEn) translations.push({language:'en',title:titleEn,summary:'',body:''});
        if (titleAr) translations.push({language:'ar',title:titleAr,summary:'',body:''});
        if (translations.length) {
          await apiPost('cms/content', { contentType:contentType, status:'draft', translations:translations });
          imported++;
        }
      }
      showToast(imported + ' items ge\u00efmporteerd');
      input.value = '';
      loadCmsContent();
    }
    async function loadCmsCategories() {
      try {
        cmsCategories = await apiGet('cms/categories');
        var catTable = document.getElementById('categories-table');
        var catFilter = document.getElementById('cms-filter-category');
        if (catFilter && cmsCategories.length > 0) {
          var opts = '<option value="">Alle categorieen</option>';
          cmsCategories.forEach(function(c) { opts += '<option value="' + c.id + '">' + escapeHtml(c.nameNl) + '</option>'; });
          catFilter.innerHTML = opts;
        }
        if (catTable) {
          if (cmsCategories.length === 0) {
            catTable.innerHTML = '<tr><td colspan="5" class="empty-state">Geen categorieen gevonden.</td></tr>';
          } else {
            var sectionLabels = { fitrah: 'Fitrah', weekly: 'Weekprogramma', treatments: 'Behandelingen', concepts: 'Begrippen', general: 'Algemeen' };
            catTable.innerHTML = cmsCategories.map(function(c) {
              return '<tr><td>' + escapeHtml(c.nameNl) + '</td><td>' + escapeHtml(c.nameEn || '-') + '</td><td>' + escapeHtml(c.nameAr || '-') + '</td><td>' + escapeHtml(sectionLabels[c.appSection] || c.appSection) + '</td><td>' + Number(c.sortOrder || 0) + '</td></tr>';
            }).join('');
          }
        }
      } catch(e) { console.error('loadCmsCategories error:', e); }
    }
    function showCreateContentModal() {
      var catOpts = '<option value="">Geen categorie</option>';
      cmsCategories.forEach(function(c) { catOpts += '<option value="' + c.id + '">' + escapeHtml(c.nameNl) + ' (' + escapeHtml(c.appSection) + ')</option>'; });
      var html = '<div class="modal-overlay active" id="modal-cms-create" data-dynamic="true" style="display:flex;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:1000;align-items:center;justify-content:center;">' +
        '<div class="modal" style="max-width:700px;width:90%;max-height:90vh;overflow-y:auto;background:var(--surface);border-radius:16px;padding:32px;">' +
        '<div class="modal-header"><h3>Nieuwe content aanmaken</h3><button class="modal-close" onclick="closeModal(\\'modal-cms-create\\')">&times;</button></div>' +
        '<div class="modal-body">' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">' +
        '<div><label>Type</label><select id="cms-new-type" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;"><option value="article">Artikel</option><option value="video">Video</option><option value="audio">Audio</option><option value="tip">Tip</option><option value="fatwa">Fatwa</option></select></div>' +
        '<div><label>Categorie</label><select id="cms-new-category" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;">' + catOpts + '</select></div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">' +
        '<div><label>Oorspronkelijke taal</label><select id="cms-new-lang" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;"><option value="nl">Nederlands</option><option value="en">Engels</option><option value="ar">Arabisch</option></select></div>' +
        '<div><label>Tags (komma-gescheiden)</label><input id="cms-new-tags" placeholder="opvoeding, islam, kinderen" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;"></div>' +
        '</div>' +
        '<div style="margin-bottom:12px;"><label>Media URL (optioneel, voor video/audio)</label><input id="cms-new-media" placeholder="https://..." style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;"></div>' +
        '<h4 style="margin:16px 0 8px;">Nederlands</h4>' +
        '<input id="cms-new-title-nl" placeholder="Titel (NL)" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;">' +
        '<input id="cms-new-summary-nl" placeholder="Samenvatting (NL)" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;">' +
        '<textarea id="cms-new-body-nl" rows="5" placeholder="Inhoud (NL)" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;"></textarea>' +
        '<h4 style="margin:16px 0 8px;">English</h4>' +
        '<input id="cms-new-title-en" placeholder="Title (EN)" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;">' +
        '<input id="cms-new-summary-en" placeholder="Summary (EN)" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;">' +
        '<textarea id="cms-new-body-en" rows="5" placeholder="Content (EN)" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;"></textarea>' +
        '<h4 style="margin:16px 0 8px;">\u0639\u0631\u0628\u064A</h4>' +
        '<input id="cms-new-title-ar" placeholder="\u0627\u0644\u0639\u0646\u0648\u0627\u0646" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;direction:rtl;">' +
        '<input id="cms-new-summary-ar" placeholder="\u0627\u0644\u0645\u0644\u062E\u0635" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;direction:rtl;">' +
        '<textarea id="cms-new-body-ar" rows="5" placeholder="\u0627\u0644\u0645\u062D\u062A\u0648\u0649" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;direction:rtl;"></textarea>' +
        '<div style="margin-top:16px;display:flex;gap:8px;">' +
        '<button class="btn btn-primary" onclick="submitNewContent()">Opslaan als concept</button>' +
        '<button class="btn" onclick="submitNewContent(true)">Opslaan & Publiceren</button>' +
        '</div></div></div></div>';
      document.body.insertAdjacentHTML('beforeend', html);
    }
    async function submitNewContent(publish) {
      var data = {
        contentType: document.getElementById('cms-new-type').value,
        categoryId: document.getElementById('cms-new-category').value,
        originalLanguage: document.getElementById('cms-new-lang').value,
        tags: document.getElementById('cms-new-tags').value,
        mediaUrl: document.getElementById('cms-new-media').value,
        titleNl: document.getElementById('cms-new-title-nl').value,
        summaryNl: document.getElementById('cms-new-summary-nl').value,
        bodyNl: document.getElementById('cms-new-body-nl').value,
        titleEn: document.getElementById('cms-new-title-en').value,
        summaryEn: document.getElementById('cms-new-summary-en').value,
        bodyEn: document.getElementById('cms-new-body-en').value,
        titleAr: document.getElementById('cms-new-title-ar').value,
        summaryAr: document.getElementById('cms-new-summary-ar').value,
        bodyAr: document.getElementById('cms-new-body-ar').value,
      };
      if (!data.titleNl && !data.titleEn && !data.titleAr) { showToast('Vul minimaal een titel in', 'error'); return; }
      try {
        var result = await apiPost('cms/content', data);
        if (result.success) {
          if (publish) await apiPut('cms/content/' + result.id + '/publish', {});
          showToast('Content opgeslagen!');
          closeModal('modal-cms-create');
          document.getElementById('modal-cms-create')?.remove();
          loadCmsContent();
        }
      } catch(e) { showToast('Fout: ' + e.message, 'error'); }
    }
    function showCreateCategoryModal() {
      var sectionOpts = '<option value="fitrah">Fitrah</option><option value="weekly">Weekprogramma</option><option value="treatments">Behandelingen</option><option value="concepts">Begrippen</option><option value="general">Algemeen</option>';
      var html = '<div class="modal active" id="modal-cms-category">' +
        '<div class="modal-overlay" onclick="closeModal(\\'modal-cms-category\\')"></div>' +
        '<div class="modal-content">' +
        '<div class="modal-header"><h3>Nieuwe categorie</h3><button class="modal-close" onclick="closeModal(\\'modal-cms-category\\')">&times;</button></div>' +
        '<div class="modal-body">' +
        '<input id="cat-new-slug" placeholder="slug (bijv. fitrah-0-2)" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;">' +
        '<input id="cat-new-name-nl" placeholder="Naam (NL)" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;">' +
        '<input id="cat-new-name-en" placeholder="Name (EN)" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;">' +
        '<input id="cat-new-name-ar" placeholder="\u0627\u0644\u0627\u0633\u0645" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;direction:rtl;">' +
        '<select id="cat-new-section" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;">' + sectionOpts + '</select>' +
        '<input id="cat-new-order" type="number" placeholder="Volgorde (0-99)" value="0" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;margin-bottom:12px;">' +
        '<button class="btn btn-primary" onclick="submitNewCategory()">Opslaan</button>' +
        '</div></div></div>';
      document.body.insertAdjacentHTML('beforeend', html);
    }
    async function submitNewCategory() {
      var data = {
        slug: document.getElementById('cat-new-slug').value,
        nameNl: document.getElementById('cat-new-name-nl').value,
        nameEn: document.getElementById('cat-new-name-en').value,
        nameAr: document.getElementById('cat-new-name-ar').value,
        appSection: document.getElementById('cat-new-section').value,
        sortOrder: parseInt(document.getElementById('cat-new-order').value) || 0,
      };
      if (!data.slug || !data.nameNl) { showToast('Slug en naam (NL) zijn verplicht', 'error'); return; }
      try {
        var result = await apiPost('cms/categories', data);
        if (result.success) {
          showToast('Categorie opgeslagen!');
          closeModal('modal-cms-category');
          document.getElementById('modal-cms-category')?.remove();
          loadCmsCategories();
        }
      } catch(e) { showToast('Fout: ' + e.message, 'error'); }
    }
    async function publishContent(id) {
      if (!confirm('Content publiceren?')) return;
      try {
        await apiPut('cms/content/' + id + '/publish', {});
        showToast('Content gepubliceerd!');
        loadCmsContent();
      } catch(e) { showToast('Fout: ' + e.message, 'error'); }
    }
    async function deleteContent(id) {
      if (!confirm('Weet je zeker dat je deze content wilt verwijderen?')) return;
      try {
        await apiDelete('cms/content/' + id);
        showToast('Content verwijderd');
        loadCmsContent();
      } catch(e) { showToast('Fout: ' + e.message, 'error'); }
    }
    async function translateContent(id) {
      var lang = prompt('Naar welke taal vertalen? (nl, en, ar)');
      if (!lang || !['nl','en','ar'].includes(lang)) { showToast('Ongeldige taal', 'error'); return; }
      showToast('Bezig met vertalen naar ' + lang + '...');
      try {
        var result = await apiPost('cms/content/' + id + '/translate', { targetLanguage: lang });
        if (result.success) {
          showToast('Vertaling opgeslagen! Titel: ' + result.title);
          loadCmsContent();
        } else {
          showToast('Vertaling mislukt: ' + (result.error || 'onbekend'), 'error');
        }
      } catch(e) { showToast('Vertaling mislukt: ' + e.message, 'error'); }
    }
    async function translateAllContent(id) {
      if (!confirm('Vertalen naar alle ontbrekende talen (NL/EN/AR)?')) return;
      showToast('Bezig met vertalen naar alle talen... Dit kan even duren.');
      try {
        var result = await apiPost('cms/content/' + id + '/translate-all', {});
        if (result.success) {
          if (result.translated && result.translated.length > 0) {
            showToast('Vertaald naar: ' + result.translated.join(', '));
          } else {
            showToast(result.message || 'Alle vertalingen bestaan al');
          }
          loadCmsContent();
        } else {
          showToast('Vertaling mislukt: ' + (result.error || 'onbekend'), 'error');
        }
      } catch(e) { showToast('Vertaling mislukt: ' + e.message, 'error'); }
    }
    function uploadFileForContent(contentId) {
      var html = '<div class="modal active" id="modal-file-upload">' +
        '<div class="modal-overlay" onclick="closeModal(\\'modal-file-upload\\')"></div>' +
        '<div class="modal-content" style="max-width:500px;">' +
        '<div class="modal-header"><h3>Bestand uploaden</h3><button class="modal-close" onclick="closeModal(\\'modal-file-upload\\')">&times;</button></div>' +
        '<div class="modal-body">' +
        '<p style="margin-bottom:12px;color:var(--muted);">Upload een Word (.docx), PDF (.pdf) of Excel (.xlsx) bestand.</p>' +
        '<div style="margin-bottom:12px;"><label>Taal van het bestand</label><select id="file-upload-lang" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;"><option value="nl">Nederlands</option><option value="en">Engels</option><option value="ar">Arabisch</option></select></div>' +
        '<div style="border:2px dashed var(--border);border-radius:12px;padding:24px;text-align:center;cursor:pointer;" onclick="document.getElementById(\\'file-input-hidden\\').click()">' +
        '<p style="font-size:2rem;">📄</p>' +
        '<p>Klik om een bestand te selecteren</p>' +
        '<p style="font-size:0.8rem;color:var(--muted);">Word, PDF of Excel (max 50MB)</p>' +
        '<input type="file" id="file-input-hidden" accept=".doc,.docx,.pdf,.xlsx,.xls" style="display:none;" onchange="handleFileSelect(this, ' + contentId + ')">' +
        '</div>' +
        '<div id="file-upload-status" style="margin-top:12px;"></div>' +
        '</div></div></div>';
      document.body.insertAdjacentHTML('beforeend', html);
    }
    async function handleFileSelect(input, contentId) {
      var file = input.files[0];
      if (!file) return;
      var maxSize = 50 * 1024 * 1024;
      if (file.size > maxSize) { showToast('Bestand te groot (max 50MB)', 'error'); return; }
      var statusEl = document.getElementById('file-upload-status');
      statusEl.innerHTML = '<p style="color:var(--primary);">Uploaden: ' + escapeHtml(file.name) + ' (' + (file.size / 1024 / 1024).toFixed(1) + ' MB)...</p>';
      try {
        var reader = new FileReader();
        reader.onload = async function(e) {
          var base64 = e.target.result.split(',')[1];
          var lang = document.getElementById('file-upload-lang').value;
          var ext = file.name.split('.').pop().toLowerCase();
          var result = await apiPost('cms/content/' + contentId + '/files', {
            fileName: file.name,
            fileType: ext,
            fileData: base64,
            fileSize: file.size,
            language: lang
          });
          if (result.success) {
            statusEl.innerHTML = '<p style="color:#2E7D32;">\u2713 Bestand geupload: ' + escapeHtml(file.name) + '</p>';
            showToast('Bestand geupload!');
            setTimeout(function() { closeModal('modal-file-upload'); document.getElementById('modal-file-upload')?.remove(); loadCmsContent(); }, 1500);
          } else {
            statusEl.innerHTML = '<p style="color:#C62828;">Fout: ' + escapeHtml(result.error || 'onbekend') + '</p>';
          }
        };
        reader.readAsDataURL(file);
      } catch(e) {
        statusEl.innerHTML = '<p style="color:#C62828;">Upload mislukt: ' + escapeHtml(e.message) + '</p>';
      }
    }
    async function editContentItem(id) {
      showToast('Content editor wordt geladen...');
      try {
        var items = await apiGet('cms/content');
        var item = items.find(function(i) { return i.id === id; });
        if (!item) { showToast('Content niet gevonden', 'error'); return; }
        var nlT = item.translations?.find(function(t) { return t.language === 'nl'; }) || {};
        var enT = item.translations?.find(function(t) { return t.language === 'en'; }) || {};
        var arT = item.translations?.find(function(t) { return t.language === 'ar'; }) || {};
        var itemTags = Array.isArray(item.tags) ? item.tags : (item.tags ? JSON.parse(item.tags) : []);
        var catOpts = '<option value="">Geen categorie</option>';
        cmsCategories.forEach(function(c) { catOpts += '<option value="' + c.id + '"' + (c.id === item.categoryId ? ' selected' : '') + '>' + escapeHtml(c.nameNl) + '</option>'; });
        var html = '<div class="modal-overlay active" id="modal-cms-edit" data-dynamic="true" style="display:flex;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:1000;align-items:center;justify-content:center;">' +
          '<div class="modal" style="max-width:700px;width:90%;max-height:90vh;overflow-y:auto;background:var(--surface);border-radius:16px;padding:32px;">' +
          '<div class="modal-header"><h3>Content bewerken #' + id + '</h3><button class="modal-close" onclick="closeModal(\\'modal-cms-edit\\')">&times;</button></div>' +
          '<div class="modal-body">' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">' +
          '<div><label>Categorie</label><select id="cms-edit-category" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;">' + catOpts + '</select></div>' +
          '<div><label>Tags</label><input id="cms-edit-tags" value="' + escapeHtml(itemTags.join(', ')) + '" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;"></div>' +
          '</div>' +
          '<h4 style="margin:12px 0 8px;">Nederlands</h4>' +
          '<input id="cms-edit-title-nl" value="' + escapeHtml(nlT.title || '') + '" placeholder="Titel (NL)" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;">' +
          '<input id="cms-edit-summary-nl" value="' + escapeHtml(nlT.summary || '') + '" placeholder="Samenvatting (NL)" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;">' +
          '<textarea id="cms-edit-body-nl" rows="4" placeholder="Inhoud (NL)" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;">' + escapeHtml(nlT.body || '') + '</textarea>' +
          '<h4 style="margin:12px 0 8px;">English</h4>' +
          '<input id="cms-edit-title-en" value="' + escapeHtml(enT.title || '') + '" placeholder="Title (EN)" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;">' +
          '<input id="cms-edit-summary-en" value="' + escapeHtml(enT.summary || '') + '" placeholder="Summary (EN)" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;">' +
          '<textarea id="cms-edit-body-en" rows="4" placeholder="Content (EN)" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;">' + escapeHtml(enT.body || '') + '</textarea>' +
          '<h4 style="margin:12px 0 8px;">\u0639\u0631\u0628\u064A</h4>' +
          '<input id="cms-edit-title-ar" value="' + escapeHtml(arT.title || '') + '" placeholder="\u0627\u0644\u0639\u0646\u0648\u0627\u0646" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;direction:rtl;">' +
          '<input id="cms-edit-summary-ar" value="' + escapeHtml(arT.summary || '') + '" placeholder="\u0627\u0644\u0645\u0644\u062E\u0635" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;direction:rtl;">' +
          '<textarea id="cms-edit-body-ar" rows="4" placeholder="\u0627\u0644\u0645\u062D\u062A\u0648\u0649" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;direction:rtl;">' + escapeHtml(arT.body || '') + '</textarea>' +
          '<div style="margin-top:16px;display:flex;gap:8px;">' +
          '<button class="btn btn-primary" onclick="submitEditContent(' + id + ')">Opslaan</button>' +
          '<button class="btn" onclick="submitEditContent(' + id + ', true)">Opslaan & Publiceren</button>' +
          '</div></div></div></div>';
        document.body.insertAdjacentHTML('beforeend', html);
      } catch(e) { showToast('Fout: ' + e.message, 'error'); }
    }
    async function submitEditContent(id, publish) {
      var data = {
        categoryId: document.getElementById('cms-edit-category').value,
        tags: document.getElementById('cms-edit-tags').value,
        status: publish ? 'published' : undefined,
        titleNl: document.getElementById('cms-edit-title-nl').value,
        summaryNl: document.getElementById('cms-edit-summary-nl').value,
        bodyNl: document.getElementById('cms-edit-body-nl').value,
        titleEn: document.getElementById('cms-edit-title-en').value,
        summaryEn: document.getElementById('cms-edit-summary-en').value,
        bodyEn: document.getElementById('cms-edit-body-en').value,
        titleAr: document.getElementById('cms-edit-title-ar').value,
        summaryAr: document.getElementById('cms-edit-summary-ar').value,
        bodyAr: document.getElementById('cms-edit-body-ar').value,
      };
      try {
        await apiPut('cms/content/' + id, data);
        showToast('Content bijgewerkt!');
        closeModal('modal-cms-edit');
        document.getElementById('modal-cms-edit')?.remove();
        loadCmsContent();
      } catch(e) { showToast('Fout: ' + e.message, 'error'); }
    }
    async function createContent() {
      showCreateContentModal();
    }
    async function sendNewsletter() {
      var subject = document.getElementById('new-newsletter-subject').value;
      var body = document.getElementById('new-newsletter-body').value;
      var recipients = document.getElementById('new-newsletter-recipients').value;
      if (!subject || !body) { showToast('Vul alle velden in', 'error'); return; }
      showToast('Nieuwsbrief "' + subject + '" wordt verzonden...');
      closeModal('modal-create-newsletter');
      document.getElementById('new-newsletter-subject').value = '';
      document.getElementById('new-newsletter-body').value = '';
      var table = document.getElementById('newsletters-table');
      var now = new Date().toLocaleString('nl-NL');
      var emptyRow2 = table.querySelector('td[colspan]');
      if (emptyRow2) emptyRow2.parentElement.remove();
      table.insertAdjacentHTML('afterbegin', '<tr><td>' + subject + '</td><td><span style="background:#E8F5E9;color:#2E7D32;padding:2px 8px;border-radius:4px;font-size:0.8rem;">Verzonden</span></td><td>' + recipients + '</td><td>' + now + '</td><td><button class="btn btn-sm btn-outline">Bekijken</button></td></tr>');
    }

    // ─── API Calls ───────────────────────────────────────────────────
    async function apiGet(path) {
      try {
        const res = await fetch('/admin-api/' + path);
        if (!res.ok) return null;
        const data = await res.json();
        return data;
      } catch { return null; }
    }

    async function apiPost(path, input) {
      try {
        const res = await fetch('/admin-api/' + path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input || {}),
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data;
      } catch { return null; }
    }
    async function apiPut(path, input) {
      try {
        const res = await fetch('/admin-api/' + path, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input || {}),
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data;
      } catch { return null; }
    }
    async function apiDelete(path) {
      try {
        const res = await fetch('/admin-api/' + path, { method: 'DELETE' });
        if (!res.ok) return null;
        const data = await res.json();
        return data;
      } catch { return null; }
    }

    // ─── Dashboard ───────────────────────────────────────────────────
    async function refreshDashboard() {
      const stats = await apiGet('dashboard');
      if (stats) {
        document.getElementById('stat-users').textContent = stats.totalUsers || '0';
        document.getElementById('stat-families').textContent = stats.totalFamilies || '0';
        document.getElementById('stat-children').textContent = stats.totalChildren || '0';
        document.getElementById('stat-messages').textContent = stats.totalMessages || '0';
      }

      const users = await apiGet('users');
      if (users && users.length > 0) {
        allUsers = users;
        const recent = users.slice(0, 5);
        document.getElementById('recent-users').innerHTML = recent.map(u =>
          '<div class="activity-item"><div class="activity-dot" style="background:var(--info);"></div><div><div class="activity-text">' + escapeHtml(u.name || u.email || 'Anoniem') + '</div><div class="activity-time">' + escapeHtml(u.role || 'user') + '</div></div></div>'
        ).join('');
      }
    }

    // ─── Users ───────────────────────────────────────────────────────
    async function loadUsers() {
      const users = await apiGet('users');
      if (!users) return;
      allUsers = users;
      // Also load auth roles and functions for display
      allAuthRoles = await apiGet('users/auth-roles') || [];
      allFuncs = await apiGet('users/functions') || [];
      renderUsersTable(users);
    }

    function renderUsersTable(users) {
      document.getElementById('users-table').innerHTML = users.map(function(u) {
        // Show auth roles from the new table
        var userAuthRoles = allAuthRoles.filter(function(r) { return r.userId === u.id; });
        var userFuncs = allFuncs.filter(function(f) { return f.userId === u.id; });
        var authBadges = userAuthRoles.length > 0
          ? userAuthRoles.map(function(r) { return '<span class="badge" style="background:' + getAuthRoleColor(r.role) + ';color:white;margin:1px;font-size:10px;">' + getAuthRoleLabel(r.role) + '</span>'; }).join(' ')
          : '<span class="badge" style="background:' + getRoleBadgeColorJS(u.role) + ';color:white;font-size:10px;">' + getRoleLabelJS(u.role) + '</span>';
        var funcBadges = userFuncs.length > 0
          ? userFuncs.map(function(f) { return '<span class="badge" style="background:' + getFuncColor(f.functionRole) + ';color:white;margin:1px;font-size:10px;">' + getFuncLabel(f.functionRole) + '</span>'; }).join(' ')
          : '<span style="font-size:10px;color:var(--muted);">-</span>';
        var lastLogin = u.lastSignedIn ? new Date(u.lastSignedIn).toLocaleDateString('nl-NL') : '-';
        var actions = PERMS.manageRoles
          ? '<select onchange="changeUserRole(' + u.id + ', this.value)" style="padding:4px 8px; border-radius:4px; border:1px solid var(--border); font-size:0.75rem;"><option value="user"' + (u.role==='user'?' selected':'') + '>Gebruiker</option><option value="moderator"' + (u.role==='moderator'?' selected':'') + '>Moderator</option><option value="admin"' + (u.role==='admin'?' selected':'') + '>Admin</option><option value="super_admin"' + (u.role==='super_admin'?' selected':'') + '>Super Admin</option></select>'
          : '<span style="font-size:0.75rem; color:var(--muted);">Alleen lezen</span>';
        return '<tr><td>' + u.id + '</td><td>' + escapeHtml(u.name || '-') + '</td><td>' + escapeHtml(u.email || '-') + '</td><td>' + authBadges + '</td><td>' + funcBadges + '</td><td>' + lastLogin + '</td><td>' + actions + '</td></tr>';
      }).join('');
    }

    function filterUsers() {
      const q = document.getElementById('user-search').value.toLowerCase();
      const filtered = allUsers.filter(u => (u.name||'').toLowerCase().includes(q) || (u.email||'').toLowerCase().includes(q));
      renderUsersTable(filtered);
    }

    async function changeUserRole(userId, newRole) {
      const result = await apiPost('users/role', { userId, role: newRole });
      if (result) showToast('Rol bijgewerkt');
      else showToast('Fout bij bijwerken', 'error');
    }

    async function assignRole() {
      const email = document.getElementById('role-email').value;
      const role = document.getElementById('role-select').value;
      if (!email) { showToast('Vul een email in', 'error'); return; }
      const user = allUsers.find(u => u.email === email);
      if (!user) { showToast('Gebruiker niet gevonden', 'error'); return; }
      await changeUserRole(user.id, role);
      document.getElementById('role-email').value = '';
    }

    // ─── Authorization Roles & Functions Management ─────────────────
    var allAuthRoles = [];
    var allFuncs = [];

    async function loadRolesAndFunctions() {
      allAuthRoles = await apiGet('users/auth-roles') || [];
      allFuncs = await apiGet('users/functions') || [];
      renderRolesOverview();
    }

    async function addAuthRole() {
      var email = document.getElementById('auth-role-email').value;
      var role = document.getElementById('auth-role-select').value;
      if (!email) { showToast('Vul een email in', 'error'); return; }
      var user = allUsers.find(function(u) { return u.email === email; });
      if (!user) { showToast('Gebruiker niet gevonden', 'error'); return; }
      var result = await apiPost('users/auth-roles/add', { userId: user.id, role: role });
      if (result) { showToast('Autorisatierol toegevoegd'); document.getElementById('auth-role-email').value = ''; loadRolesAndFunctions(); }
      else showToast('Fout bij toevoegen', 'error');
    }

    async function removeAuthRole(userId, role) {
      if (!confirm('Weet u zeker dat u deze autorisatierol wilt verwijderen?')) return;
      var result = await apiPost('users/auth-roles/remove', { userId: userId, role: role });
      if (result) { showToast('Autorisatierol verwijderd'); loadRolesAndFunctions(); }
      else showToast('Fout bij verwijderen', 'error');
    }

    async function addUserFunction() {
      var email = document.getElementById('func-role-email').value;
      var functionRole = document.getElementById('func-role-select').value;
      var specialization = document.getElementById('func-specialization').value;
      var city = document.getElementById('func-city').value;
      if (!email) { showToast('Vul een email in', 'error'); return; }
      var user = allUsers.find(function(u) { return u.email === email; });
      if (!user) { showToast('Gebruiker niet gevonden', 'error'); return; }
      var result = await apiPost('users/functions/add', { userId: user.id, functionRole: functionRole, specialization: specialization, city: city });
      if (result) { showToast('Functie toegevoegd'); document.getElementById('func-role-email').value = ''; document.getElementById('func-specialization').value = ''; document.getElementById('func-city').value = ''; loadRolesAndFunctions(); }
      else showToast('Fout bij toevoegen', 'error');
    }

    async function removeUserFunctionById(userId, functionRole) {
      if (!confirm('Weet u zeker dat u deze functie wilt verwijderen?')) return;
      var result = await apiPost('users/functions/remove', { userId: userId, functionRole: functionRole });
      if (result) { showToast('Functie verwijderd'); loadRolesAndFunctions(); }
      else showToast('Fout bij verwijderen', 'error');
    }

    // ============ INVITATION CODES ============
    async function loadInvitationCodes() {
      var codes = await apiGet('invitation-codes') || [];
      var tbody = document.getElementById('invitations-table');
      if (!tbody) return;
      if (codes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:24px; color:var(--muted);">Geen uitnodigingscodes gevonden.</td></tr>';
        return;
      }
      tbody.innerHTML = codes.map(function(c) {
        var statusBadge = c.isActive ? '<span style="background:#E8F5E9; color:#2E7D32; padding:2px 8px; border-radius:12px; font-size:12px;">Actief</span>' : '<span style="background:#FFEBEE; color:#C62828; padding:2px 8px; border-radius:12px; font-size:12px;">Inactief</span>';
        return '<tr><td><code style="background:#f5f5f5; padding:4px 8px; border-radius:4px; font-size:13px;">' + escapeHtml(c.code) + '</code></td><td><span style="background:' + getFuncColor(c.functionRole) + '; color:white; padding:2px 8px; border-radius:12px; font-size:12px;">' + escapeHtml(getFuncLabel(c.functionRole)) + '</span></td><td>' + escapeHtml(c.restrictedEmail || '-') + '</td><td>' + (c.maxUses == null ? 'Onbeperkt' : Number(c.maxUses)) + '</td><td>' + Number(c.usedCount || 0) + '</td><td>' + statusBadge + '</td><td>' + (c.isActive ? '<button class="btn btn-outline" style="padding:4px 8px; font-size:12px;" onclick="deactivateInvCode(' + Number(c.id) + ')">Deactiveren</button>' : '-') + '</td></tr>';
      }).join('');
    }

    function showCreateInvitationModal() {
      var html = '<div class="modal-overlay" id="modal-invitation" onclick="if(event.target===this)closeModal(this.id)">';
      html += '<div class="modal"><h3>Nieuwe uitnodigingscode</h3>';
      html += '<div class="form-group"><label>Functie</label><select id="inv-function"><option value="specialist">Specialist</option><option value="leraar">Leraar</option><option value="kennisdrager">Kennisdrager</option><option value="arts">Arts</option><option value="imam">Imam</option><option value="therapeut">Therapeut</option><option value="maatschappelijk_werker">Maatsch. werker</option><option value="opvoedkundige_begeleider">Opv. begeleider</option></select></div>';
      html += '<div class="form-group"><label>Beperkt tot e-mail (optioneel)</label><input type="email" id="inv-email" placeholder="email@voorbeeld.nl"></div>';
      html += '<div class="form-group"><label>Max. gebruik (leeg = onbeperkt)</label><input type="number" id="inv-max-uses" placeholder="1"></div>';
      html += '<div style="display:flex; gap:8px; margin-top:16px;"><button class="btn btn-primary" onclick="createInvCode()">Aanmaken</button><button class="btn btn-outline" onclick="closeModal(this.closest(\\'[id]\\').id)">Annuleren</button></div>';
      html += '</div></div>';
      document.body.insertAdjacentHTML('beforeend', html);
    }

    async function createInvCode() {
      var functionRole = document.getElementById('inv-function').value;
      var restrictedEmail = document.getElementById('inv-email').value || undefined;
      var maxUses = parseInt(document.getElementById('inv-max-uses').value) || undefined;
      var result = await apiPost('invitation-codes', { functionRole: functionRole, restrictedEmail: restrictedEmail, maxUses: maxUses });
      if (result && result.code) { showToast('Code aangemaakt: ' + result.code); closeModal('modal-invitation'); loadInvitationCodes(); }
      else showToast('Fout bij aanmaken', 'error');
    }

    async function deactivateInvCode(id) {
      if (!confirm('Weet u zeker dat u deze code wilt deactiveren?')) return;
      var result = await apiPut('invitation-codes/' + id + '/deactivate', {});
      if (result) { showToast('Code gedeactiveerd'); loadInvitationCodes(); }
      else showToast('Fout bij deactiveren', 'error');
    }

    function getFuncLabel(f) {
      var labels = { vader: 'Vader', moeder: 'Moeder', specialist: 'Specialist', leraar: 'Leraar', kennisdrager: 'Kennisdrager', arts: 'Arts', imam: 'Imam', therapeut: 'Therapeut', maatschappelijk_werker: 'Maatsch. werker', opvoedkundige_begeleider: 'Opv. begeleider' };
      return labels[f] || f;
    }
    function getFuncColor(f) {
      var colors = { vader: '#0277BD', moeder: '#AD1457', specialist: '#E65100', leraar: '#00695C', kennisdrager: '#4527A0', arts: '#C62828', imam: '#1565C0', therapeut: '#2E7D32', maatschappelijk_werker: '#F57C00', opvoedkundige_begeleider: '#6A1B9A' };
      return colors[f] || '#546E7A';
    }
    function getAuthRoleLabel(r) {
      var labels = { super_admin: 'Super Admin', admin: 'Admin', moderator: 'Moderator', user: 'Gebruiker' };
      return labels[r] || r;
    }
    function getAuthRoleColor(r) {
      var colors = { super_admin: '#7B1FA2', admin: '#1565C0', moderator: '#2E7D32', user: '#546E7A' };
      return colors[r] || '#546E7A';
    }

    function renderRolesOverview() {
      var container = document.getElementById('roles-functions-overview');
      if (!container) return;
      // Group by user
      var userMap = {};
      allUsers.forEach(function(u) { userMap[u.id] = { name: u.name || u.email || 'Onbekend', email: u.email || '-', authRoles: [], functions: [] }; });
      allAuthRoles.forEach(function(r) { if (userMap[r.userId]) userMap[r.userId].authRoles.push(r.role); });
      allFuncs.forEach(function(f) { if (userMap[f.userId]) userMap[f.userId].functions.push(f); });
      // Only show users with at least one role or function
      var entries = Object.keys(userMap).filter(function(id) { return userMap[id].authRoles.length > 0 || userMap[id].functions.length > 0; });
      if (entries.length === 0) { container.innerHTML = '<p style="color:var(--muted);">Geen gebruikers met speciale rollen of functies.</p>'; return; }
      var html = '<table><thead><tr><th>Gebruiker</th><th>Autorisatierollen</th><th>Uitvoerende Functies</th><th>Acties</th></tr></thead><tbody>';
      entries.forEach(function(id) {
        var u = userMap[id];
        var rolesHtml = u.authRoles.map(function(r) { return '<span class="badge" style="background:' + getAuthRoleColor(r) + ';color:white;margin:2px;">' + getAuthRoleLabel(r) + ' <span onclick="removeAuthRole(' + id + ', \\'' + r + '\\')" style="cursor:pointer;margin-left:4px;">&times;</span></span>'; }).join(' ') || '<span style="color:var(--muted); font-size:12px;">Geen</span>';
        var funcsHtml = u.functions.map(function(f) { return '<span class="badge" style="background:' + getFuncColor(f.functionRole) + ';color:white;margin:2px;">' + getFuncLabel(f.functionRole) + (f.specialization ? ' (' + escapeHtml(f.specialization) + ')' : '') + ' <span onclick="removeUserFunctionById(' + id + ', \\'' + f.functionRole + '\\')" style="cursor:pointer;margin-left:4px;">&times;</span></span>'; }).join(' ') || '<span style="color:var(--muted); font-size:12px;">Geen</span>';
        html += '<tr><td><strong>' + escapeHtml(u.name) + '</strong><br><span style="font-size:11px;color:var(--muted);">' + escapeHtml(u.email) + '</span></td><td>' + rolesHtml + '</td><td>' + funcsHtml + '</td><td><span style="font-size:11px;color:var(--muted);">ID: ' + id + '</span></td></tr>';
      });
      html += '</tbody></table>';
      container.innerHTML = html;
    }

    async function createUser() {
      const name = document.getElementById('new-user-name').value;
      const email = document.getElementById('new-user-email').value;
      const password = document.getElementById('new-user-password').value;
      const role = document.getElementById('new-user-role').value;
      if (!name || !email || !password) { showToast('Vul alle velden in', 'error'); return; }

      const res = await fetch('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, language: 'nl' }),
      });
      if (res.ok) {
        showToast('Gebruiker aangemaakt');
        closeModal('modal-create-user');
        if (role !== 'user') {
          // Update role after creation
          setTimeout(async () => {
            await loadUsers();
            const newUser = allUsers.find(u => u.email === email);
            if (newUser) await changeUserRole(newUser.id, role);
          }, 500);
        }
        loadUsers();
      } else {
        const data = await res.json();
        showToast(data.error || 'Fout', 'error');
      }
    }

    // ─── Families ────────────────────────────────────────────────────
    async function loadFamilies() {
      const families = await apiGet('families');
      if (!families) return;
      allFamilies = families;
      document.getElementById('families-table').innerHTML = families.map(f => {
        const deleteBtn = PERMS.delete ? '<button class="btn btn-sm btn-danger" onclick="deleteFamily(' + f.id + ')">Verwijderen</button>' : '';
        return '<tr><td>' + f.id + '</td><td>' + escapeHtml(f.name || '-') + '</td><td>' + (f.memberCount || 0) + '</td><td>' + (f.childrenCount || f.childCount || 0) + '</td><td>' + new Date(f.createdAt).toLocaleDateString('nl-NL') + '</td><td>' + deleteBtn + '</td></tr>';
      }).join('');
    }

    async function deleteFamily(id) {
      if (!confirm('Weet u zeker dat u dit gezin wilt verwijderen?')) return;
      await apiPost('families/delete', { familyId: id });
      showToast('Gezin verwijderd');
      loadFamilies();
    }

    // ─── Children ────────────────────────────────────────────────────
    async function loadChildren() {
      const children = await apiGet('children');
      if (!children) return;
      allChildren = children;
      document.getElementById('children-table').innerHTML = children.map(c => {
        const age = c.birthDate ? Math.floor((Date.now() - new Date(c.birthDate).getTime()) / 31557600000) : '-';
        const deleteBtn = PERMS.delete ? '<button class="btn btn-sm btn-danger" onclick="deleteChild(' + c.id + ')">Verwijderen</button>' : '';
        var famName = c.familyName || (c.family && c.family.name) || '-';
        return '<tr><td>' + c.id + '</td><td>' + escapeHtml(c.name || '-') + '</td><td>' + age + '</td><td>' + escapeHtml(c.gender || '-') + '</td><td>' + escapeHtml(famName) + '</td><td>' + deleteBtn + '</td></tr>';
      }).join('');
    }

    async function deleteChild(id) {
      if (!confirm('Weet u zeker dat u dit kind wilt verwijderen?')) return;
      await apiPost('children/delete', { childId: id });
      showToast('Kind verwijderd');
      loadChildren();
    }

    // ─── Network ─────────────────────────────────────────────────────
    async function loadNetwork() {
      var contacts = await apiGet('network-contacts');
      if (!contacts) contacts = [];
      var cats = { specialist: [], teacher: [], kennisdrager: [], doctor: [] };
      contacts.forEach(function(c) { if (cats[c.category]) cats[c.category].push(c); });
      function renderList(items, emptyMsg) {
        if (items.length === 0) return '<p style="color:var(--muted);">' + emptyMsg + '</p>';
        return items.map(function(c) {
          return '<div class="activity-item" style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);">' +
            '<div style="width:40px;height:40px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:bold;font-size:16px;">' + escapeHtml(c.name ? c.name.charAt(0).toUpperCase() : '?') + '</div>' +
            '<div style="flex:1;"><div style="font-weight:600;color:var(--text);">' + escapeHtml(c.name || '-') + '</div>' +
            '<div style="font-size:12px;color:var(--muted);">' + escapeHtml(c.specialization || '') + (c.city ? ' \u2014 ' + escapeHtml(c.city) : '') + '</div>' +
            (c.phone ? '<div style="font-size:11px;color:var(--muted);">' + escapeHtml(c.phone) + '</div>' : '') +
            '</div>' +
            '<button onclick="deleteNetworkContact(' + c.id + ')" style="background:none;border:none;color:var(--error);cursor:pointer;font-size:18px;" title="Verwijderen">\u00d7</button>' +
            '</div>';
        }).join('');
      }
      document.getElementById('specialists-list').innerHTML = renderList(cats.specialist, 'Geen specialisten gevonden.');
      document.getElementById('teachers-list').innerHTML = renderList(cats.teacher, 'Geen leraren gevonden.');
      document.getElementById('kennisdragers-list').innerHTML = renderList(cats.kennisdrager, 'Geen kennisdragers gevonden.');
      document.getElementById('doctors-list').innerHTML = renderList(cats.doctor, 'Geen artsen gevonden.');
      document.getElementById('specialist-count').textContent = cats.specialist.length;
      document.getElementById('teacher-count').textContent = cats.teacher.length;
      document.getElementById('kennisdrager-count').textContent = cats.kennisdrager.length;
      document.getElementById('doctor-count').textContent = cats.doctor.length;
    }

    async function submitNetworkContact() {
      var name = document.getElementById('nc-name').value.trim();
      var category = document.getElementById('nc-category').value;
      if (!name) { showToast('Naam is verplicht', 'error'); return; }
      var data = {
        name: name,
        category: category,
        email: document.getElementById('nc-email').value.trim() || '',
        phone: document.getElementById('nc-phone').value.trim() || '',
        specialization: document.getElementById('nc-specialization').value.trim() || '',
        city: document.getElementById('nc-city').value.trim() || '',
        country: document.getElementById('nc-country').value.trim() || '',
        bio: document.getElementById('nc-bio').value.trim() || '',
      };
      var result = await apiPost('network-contacts', data);
      if (result && result.success) {
        showToast('Contact toegevoegd!', 'success');
        document.getElementById('modal-add-network').classList.remove('active');
        document.getElementById('nc-name').value = '';
        document.getElementById('nc-email').value = '';
        document.getElementById('nc-phone').value = '';
        document.getElementById('nc-specialization').value = '';
        document.getElementById('nc-city').value = '';
        document.getElementById('nc-country').value = '';
        document.getElementById('nc-bio').value = '';
        loadNetwork();
      } else {
        showToast('Fout bij toevoegen', 'error');
      }
    }

    async function deleteNetworkContact(id) {
      if (!confirm('Weet u zeker dat u dit contact wilt verwijderen?')) return;
      var resp = await fetch(API_BASE + '/network-contacts/' + id, { method: 'DELETE', credentials: 'include' });
      if (resp.ok) {
        showToast('Contact verwijderd', 'success');
        loadNetwork();
      } else {
        showToast('Fout bij verwijderen', 'error');
      }
    }

    // ─── Content ─────────────────────────────────────────────────────
    async function loadContent() {
      await loadCmsCategories();
      await loadCmsContent();
    }
    // ─── Notifications ───────────────────────────────────────────────
    async function loadNotifications() {
      var container = document.getElementById('sent-notifications-list');
      if (!container) return;
      try {
        var data = await apiGet('audit-log?limit=20');
        if (data && data.logs) {
          var notifLogs = data.logs.filter(function(l) { return l.action === 'send_broadcast' || l.action === 'send_notification' || l.action === 'push_test'; });
          if (notifLogs.length === 0) {
            container.innerHTML = '<p>Geen verzonden notificaties gevonden.</p>';
          } else {
            container.innerHTML = notifLogs.map(function(l) {
              var date = l.createdAt ? new Date(l.createdAt).toLocaleString('nl-NL') : '-';
              return '<div class="activity-item"><div class="activity-dot" style="background:var(--info);"></div><div><div class="activity-text">' + escapeHtml(l.description || l.action) + '</div><div class="activity-time">' + date + ' — door ' + escapeHtml(l.userName || 'Systeem') + '</div></div></div>';
            }).join('');
          }
        } else {
          container.innerHTML = '<p>Geen verzonden notificaties gevonden.</p>';
        }
      } catch(e) {
        container.innerHTML = '<p>Geen verzonden notificaties gevonden.</p>';
      }
    }
    // ─── Newsletters ─────────────────────────────────────────────────
    async function loadNewsletters() {
      var container = document.getElementById('newsletters-table');
      if (!container) return;
      container.innerHTML = '<tr><td colspan="5" class="empty-state">Geen nieuwsbrieven gevonden. Klik op "+ Nieuwe nieuwsbrief" om te beginnen.</td></tr>';
    }

    // ─── Helpers ─────────────────────────────────────────────────────
    function getRoleBadgeColorJS(role) {
      switch(role) {
        case 'super_admin': return '#7B1FA2';
        case 'admin': return '#1565C0';
        case 'moderator': return '#2E7D32';
        case 'specialist': return '#E65100';
        case 'teacher': return '#00695C';
        case 'kennisdrager': return '#4527A0';
        case 'doctor': return '#C62828';
        default: return '#546E7A';
      }
    }

    function getRoleLabelJS(role) {
      switch(role) {
        case 'super_admin': return 'Super Admin';
        case 'admin': return 'Admin';
        case 'moderator': return 'Moderator';
        case 'specialist': return 'Specialist';
        case 'teacher': return 'Leraar';
        case 'kennisdrager': return 'Kennisdrager';
        case 'doctor': return 'Arts';
        default: return 'Gebruiker';
      }
    }

    function loadPageData(page) {
      switch(page) {
        case 'dashboard': refreshDashboard(); break;
        case 'users': loadUsers(); break;
        case 'families': loadFamilies(); break;
        case 'children': loadChildren(); break;
        case 'network': loadNetwork(); break;
        case 'content': loadContent(); break;
        case 'activity': loadActivity(); break;
        case 'logs': loadActivity(); break;
        case '2fa': load2FAStatus(); break;
        case 'messages': loadMessages(); break;
        case 'notifications': loadNotifications(); break;
        case 'newsletters': loadNewsletters(); break;
        case 'roles': loadUsers().then(function() { loadRolesAndFunctions(); }); break;
        case 'invitations': loadInvitationCodes(); break;
        case 'settings': break;
        case 'export': break;
      }
    }

    async function sendBroadcast() {
      const subject = document.getElementById('broadcast-subject').value;
      const message = document.getElementById('broadcast-message').value;
      const target = document.getElementById('broadcast-target').value;
      if (!subject || !message) { showToast('Vul alle velden in', 'error'); return; }
      const result = await apiPost('broadcast', { subject, message, target });
      if (result && result.success) showToast('Broadcast verzonden');
      else showToast('Fout bij verzenden', 'error');
      closeModal('modal-broadcast');
    }

    function saveSettings() {
      const appName = document.getElementById('setting-app-name').value;
      const defaultLanguage = document.getElementById('setting-default-lang').value;
      const registrationMode = document.getElementById('setting-registration').value;
      const notificationTime = document.getElementById('setting-notification-time').value;
      apiPost('settings', { appName, defaultLanguage, registrationMode, notificationTime });
      showToast('Instellingen opgeslagen');
    }

    function saveSecuritySettings() {
      const sessionHours = parseInt(document.getElementById('setting-session-hours').value);
      const maxLoginAttempts = parseInt(document.getElementById('setting-max-attempts').value);
      apiPost('settings', { sessionHours, maxLoginAttempts });
      showToast('Beveiligingsinstellingen opgeslagen');
    }

    function refreshLogs() { loadActivity(); }

    // ─── Activity Feed ───────────────────────────────────────────────
    async function loadActivity() {
      try {
        const res = await fetch('/admin-api/audit-log?limit=50');
        const data = await res.json();
        const logs = data.logs || [];
        const container = document.getElementById('activity-container') || document.getElementById('logs-container');
        if (!container) return;
        if (logs.length === 0) {
          container.innerHTML = '<div class="empty-state"><div class="icon">\ud83d\udccb</div><p>Nog geen activiteiten geregistreerd.</p></div>';
          return;
        }
        container.innerHTML = logs.map(log => {
          const dotColor = getActionColor(log.action);
          const time = log.createdAt ? new Date(log.createdAt).toLocaleString('nl-NL') : 'Nu';
          return '<div class="activity-item"><div class="activity-dot" style="background:' + dotColor + ';"></div><div><div class="activity-text"><strong>' + escapeHtml(log.userName || 'Systeem') + '</strong> (' + escapeHtml(log.userRole || '-') + ') — ' + escapeHtml(log.description || log.action) + '</div><div class="activity-time">' + time + '</div></div></div>';
        }).join('');
      } catch {
        showToast('Fout bij laden activiteiten', 'error');
      }
    }

    async function loadMessages() {
      try {
        const msgs = await apiGet('messages');
        const container = document.getElementById('messages-table');
        if (!container) return;
        if (!msgs || msgs.length === 0) {
          container.innerHTML = '<tr><td colspan="5" class="empty-state">Geen berichten gevonden.</td></tr>';
          return;
        }
        container.innerHTML = msgs.slice(0, 50).map(m => {
          const date = m.createdAt ? new Date(m.createdAt).toLocaleString('nl-NL') : '-';
          const read = m.isRead ? '<span style="color:#2E7D32;">Gelezen</span>' : '<span style="color:#E65100;">Ongelezen</span>';
          return '<tr><td>' + (m.id || '-') + '</td><td>' + (m.senderId || '-') + '</td><td>' + escapeHtml((m.content || '').substring(0, 60) + (m.content && m.content.length > 60 ? '...' : '')) + '</td><td>' + read + '</td><td>' + date + '</td></tr>';
        }).join('');
      } catch {
        showToast('Fout bij laden berichten', 'error');
      }
    }

    function getActionColor(action) {
      switch(action) {
        case 'login': return '#1565C0';
        case 'role_change': return '#7B1FA2';
        case 'delete_user': case 'delete_family': case 'delete_child': return '#B71C1C';
        case 'export_data': return '#00695C';
        case 'enable_2fa': case 'verify_2fa': return '#2E7D32';
        case 'disable_2fa': return '#E65100';
        case 'send_broadcast': return '#01579B';
        default: return '#546E7A';
      }
    }

    // ─── 2FA Management ─────────────────────────────────────────────
    async function load2FAStatus() {
      try {
        const res = await fetch('/admin-api/2fa/status');
        const status = await res.json();
        const statusEl = document.getElementById('2fa-status');
        const setupEl = document.getElementById('2fa-setup');
        if (status.enabled) {
          statusEl.innerHTML = '<div style="display:flex; align-items:center; gap:12px;"><div style="width:12px; height:12px; border-radius:50%; background:#2E7D32;"></div><div><strong style="color:#2E7D32;">2FA is actief</strong><p style="font-size:0.8rem; color:var(--muted); margin-top:4px;">Uw account is beveiligd met twee-factor authenticatie.' + (status.hasBackupCodes ? ' Backup codes beschikbaar.' : '') + '</p></div></div><button class="btn btn-danger" style="margin-top:16px;" onclick="disable2FA()">2FA Uitschakelen</button>';
          setupEl.style.display = 'none';
        } else {
          statusEl.innerHTML = '<div style="display:flex; align-items:center; gap:12px;"><div style="width:12px; height:12px; border-radius:50%; background:#E65100;"></div><div><strong style="color:#E65100;">2FA is niet actief</strong><p style="font-size:0.8rem; color:var(--muted); margin-top:4px;">Beveilig uw account met een authenticator app.</p></div></div><button class="btn btn-primary" style="margin-top:16px;" onclick="setup2FA()">2FA Instellen</button>';
          setupEl.style.display = 'none';
        }
      } catch {
        showToast('Fout bij laden 2FA status', 'error');
      }
    }

    async function setup2FA() {
      try {
        const res = await fetch('/admin-api/2fa/setup', { method: 'POST' });
        const data = await res.json();
        document.getElementById('2fa-secret').textContent = data.secret;
        document.getElementById('2fa-uri').textContent = data.uri;
        document.getElementById('2fa-backup-codes').innerHTML = data.backupCodes.map(c => '<span style="display:inline-block; margin:4px 8px 4px 0; padding:4px 8px; background:white; border:1px solid var(--border); border-radius:4px;">' + c + '</span>').join('');
        document.getElementById('2fa-setup').style.display = 'block';
        document.getElementById('2fa-status').innerHTML = '<p style="color:var(--info); font-weight:600;">\u2139\ufe0f Voltooi de setup door een code in te voeren uit uw authenticator app.</p>';
      } catch {
        showToast('Fout bij 2FA setup', 'error');
      }
    }

    async function verify2FA() {
      const token = document.getElementById('2fa-token').value;
      if (!token || token.length !== 6) { showToast('Voer een 6-cijferige code in', 'error'); return; }
      try {
        const res = await fetch('/admin-api/2fa/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (data.success) {
          showToast('2FA succesvol geactiveerd!');
          setTimeout(function() { window.location.href = '/auth/logout'; }, 800);
        } else {
          showToast('Ongeldige code, probeer opnieuw', 'error');
        }
      } catch {
        showToast('Fout bij verificatie', 'error');
      }
    }

    async function disable2FA() {
      if (!confirm('Weet u zeker dat u 2FA wilt uitschakelen?')) return;
      const token = prompt('Voer uw huidige 2FA-code of back-upcode in:');
      if (!token) return;
      try {
        const res = await fetch('/admin-api/2fa/disable', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: token.trim() }),
        });
        if (!res.ok) { showToast('Ongeldige 2FA-code', 'error'); return; }
        showToast('2FA uitgeschakeld');
        load2FAStatus();
      } catch {
        showToast('Fout bij uitschakelen', 'error');
      }
    }

    // ─── Mobile Navigation ─────────────────────────────────────────────
    function toggleMobileNav() {
      document.getElementById('mobile-nav').classList.toggle('active');
    }

    function closeMobileNav(event) {
      if (event.target === document.getElementById('mobile-nav')) {
        document.getElementById('mobile-nav').classList.remove('active');
      }
    }

    // Mobile nav page switching
    document.querySelectorAll('.mobile-nav-item[data-mpage]').forEach(item => {
      item.addEventListener('click', () => {
        const page = item.dataset.mpage;
        document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
        const el = document.getElementById('page-' + page);
        if (el) el.style.display = 'block';
        // Update active state
        document.querySelectorAll('.mobile-nav-item').forEach(n => n.classList.remove('active'));
        item.classList.add('active');
        // Also update desktop sidebar
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        const desktopItem = document.querySelector('.nav-item[data-page="' + page + '"]');
        if (desktopItem) desktopItem.classList.add('active');
        // Close mobile nav
        document.getElementById('mobile-nav').classList.remove('active');
        // Load page data
        loadPageData(page);
      });
    });

    // Initial load
    refreshDashboard();

    // ─── Mobile Search ─────────────────────────────────────────────────
    let searchTimeout = null;
    async function handleMobileSearch(query) {
      const container = document.getElementById('mobile-search-results');
      if (!query || query.length < 2) { container.innerHTML = ''; return; }
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(async () => {
        try {
          const res = await fetch('/admin-panel/api/search?q=' + encodeURIComponent(query));
          const data = await res.json();
          if (data.results && data.results.length > 0) {
            container.innerHTML = data.results.map(function(r) {
              var icon = r.type === 'user' ? '\ud83d\udc64' : '\ud83d\udc76';
              var badge = r.type === 'user' ? 'Gebruiker' : 'Kind';
              var q = String.fromCharCode(39);
              return '<div class="mobile-search-result" onclick="navigateToSearchResult(' + q + r.type + q + ',' + q + r.id + q + ')">' +
                '<span>' + icon + '</span>' +
                '<div style="flex:1;"><div style="font-weight:600;">' + escapeHtml(r.name) + '</div>' +
                '<div style="font-size:0.7rem; opacity:0.6;">' + escapeHtml(r.detail || '') + '</div></div>' +
                '<span class="type-badge">' + badge + '</span></div>';
            }).join('');
          } else {
            container.innerHTML = '<div style="padding:12px 16px; color:rgba(255,255,255,0.5); font-size:0.8rem;">Geen resultaten gevonden</div>';
          }
        } catch(e) {
          container.innerHTML = '<div style="padding:12px 16px; color:rgba(255,255,255,0.5); font-size:0.8rem;">Zoeken mislukt</div>';
        }
      }, 300);
    }

    function navigateToSearchResult(type, id) {
      document.getElementById('mobile-nav').classList.remove('active');
      document.getElementById('mobile-search-input').value = '';
      document.getElementById('mobile-search-results').innerHTML = '';
      const page = type === 'user' ? 'users' : 'children';
      document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
      const el = document.getElementById('page-' + page);
      if (el) el.style.display = 'block';
      loadPageData(page);
      showToast('Navigatie naar ' + (type === 'user' ? 'Gebruikers' : 'Kinderen'), 'success');
    }

    // ─── Push Test ──────────────────────────────────────────────────────
    async function sendPushTest() {
      const btn = document.getElementById('push-test-btn');
      const result = document.getElementById('push-test-result');
      btn.disabled = true;
      btn.textContent = 'Verzenden...';
      try {
        const res = await fetch('/admin-panel/api/push-test', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          result.style.display = 'block';
          result.style.background = '#dcfce7';
          result.style.color = '#166534';
          result.textContent = '\u2705 Test-notificatie verzonden naar ' + (data.count || 0) + ' apparaten';
        } else {
          result.style.display = 'block';
          result.style.background = '#fef2f2';
          result.style.color = '#991b1b';
          result.textContent = '\u274c ' + (data.error || 'Verzenden mislukt');
        }
      } catch(e) {
        result.style.display = 'block';
        result.style.background = '#fef2f2';
        result.style.color = '#991b1b';
        result.textContent = '\u274c Netwerkfout bij verzenden';
      }
      btn.disabled = false;
      btn.textContent = '\ud83d\udce4 Verstuur Test-Notificatie';
    }


    // ─── Quick Bar Init (deferred) ─────────────────────────────────────
    setTimeout(function() {
      document.querySelectorAll('.quick-bar-item[data-qpage]').forEach(function(item) {
        item.addEventListener('click', function() {
          var page = item.getAttribute('data-qpage');
          document.querySelectorAll('.page').forEach(function(p) { p.style.display = 'none'; });
          var el = document.getElementById('page-' + page);
          if (el) el.style.display = 'block';
          document.querySelectorAll('.quick-bar-item').forEach(function(q) { q.classList.remove('active'); });
          item.classList.add('active');
          loadPageData(page);
        });
      });
    }, 100);
  </script>

  <!-- Quick Access Bar (Mobile) -->
  <div class="quick-bar">
    <div class="quick-bar-inner">
      <a class="quick-bar-item active" data-qpage="dashboard">
        <span>📊</span>
        Dashboard
      </a>
      <a class="quick-bar-item" data-qpage="users">
        <span>👤</span>
        Gebruikers
      </a>
      <a class="quick-bar-item" data-qpage="messages">
        <span>💬</span>
        Berichten
      </a>
      <a class="quick-bar-item" data-qpage="export">
        <span>⬇️</span>
        Export
      </a>
    </div>
  </div>
</body>
</html>`;
}
