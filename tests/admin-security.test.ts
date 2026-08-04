import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("admin security boundaries", () => {
  const admin = readFileSync("server/admin-panel.ts", "utf8");
  const server = readFileSync("server/_core/index.ts", "utf8");

  it("enforces permissions on high-impact routes server-side", () => {
    expect(admin).toContain("function requireAdminPermission");
    expect(admin).toMatch(
      /"\/admin-api\/users\/role",\s+requireAdminAuth,\s+requireAdminPermission\("manageRoles"\)/,
    );
    expect(admin).toMatch(
      /"\/admin-api\/users\/delete",\s+requireAdminAuth,\s+requireAdminPermission\("delete"\)/,
    );
    expect(admin).toMatch(
      /"\/admin-api\/broadcast",\s+requireAdminAuth,\s+requireAdminPermission\("sendNotifications"\)/,
    );
    expect(admin).toMatch(
      /"\/admin-api\/settings",\s+requireAdminAuth,\s+requireAdminPermission\("manageSettings"\)/,
    );
  });

  it("escapes account data before inserting it into admin HTML", () => {
    expect(admin).toContain("function escapeHtml(value)");
    expect(admin).toContain("escapeHtml(u.name || u.email || 'Anoniem')");
    expect(admin).toContain("escapeHtml(u.name || '-')");
    expect(admin).toContain("escapeHtml(u.email || '-')");
  });

  it("escapes CMS content in every privileged HTML view", () => {
    expect(admin).toContain("escapeHtml(title)");
    expect(admin).toContain("escapeHtml(catName)");
    expect(admin).toContain("escapeHtml(t.title || '')");
    expect(admin).toContain("escapeHtml(t.summary)");
    expect(admin).toContain("escapeHtml(t.body || '')");
    expect(admin).toContain("escapeHtml((t.body||'').substring(0,300))");
    expect(admin).toContain("escapeHtml(n.text)");
    expect(admin).toContain("escapeHtml(itemTags.join(', '))");
    expect(admin).toContain("escapeHtml(nlT.title || '')");
    expect(admin).toContain("escapeHtml(nlT.summary || '')");
    expect(admin).toContain("escapeHtml(nlT.body || '')");
    expect(admin).toContain("escapeHtml(enT.body || '')");
    expect(admin).toContain("escapeHtml(arT.body || '')");
    expect(admin).toContain("escapeHtml(l.description || l.action)");
    expect(admin).toContain("escapeHtml(l.userName || 'Systeem')");
    expect(admin).toContain("escapeHtml(c.restrictedEmail || '-')");
    expect(admin).not.toContain("' + (t.title || '') + '");
    expect(admin).not.toContain("' + t.summary + '");
  });

  it("does not reflect arbitrary origins with credentials", () => {
    expect(server).toContain("allowedOrigins.has(origin)");
    expect(server).toContain(
      'res.status(403).json({ error: "Origin not allowed" })',
    );
    expect(server).not.toContain(
      'res.header("Access-Control-Allow-Origin", origin);\n    }\n    res.header',
    );
  });
});
