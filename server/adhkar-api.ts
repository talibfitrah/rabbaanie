import type { Express } from "express";
import { sql } from "drizzle-orm";
import { getDb } from "./db";

/**
 * Extract rows from drizzle db.execute() result.
 * - mysql2 returns [rows, fields] (Array where first element is the rows array)
 * - node-postgres returns { rows: [...], ... } (QueryResult object)
 * - drizzle may also return rows directly as an array
 */
function extractRows(results: any): any[] {
  // PostgreSQL (node-postgres): results has a .rows property
  if (results && typeof results === "object" && "rows" in results && Array.isArray(results.rows)) {
    return results.rows;
  }
  // MySQL (mysql2): returns [rows, fields] - first element is array of rows
  if (Array.isArray(results) && results.length >= 1 && Array.isArray(results[0])) {
    return results[0];
  }
  // Direct array of rows
  if (Array.isArray(results)) {
    return results;
  }
  return [];
}

/**
 * Register REST API endpoints for adhkar and misconceptions.
 * These are simple GET endpoints used by the Dhikri tab.
 */
export function registerAdhkarRoutes(app: Express) {
  // GET /api/adhkar?context=morning&lang=nl
  app.get("/api/adhkar", async (req, res) => {
    try {
      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "Database not available" });
      }

      const context = req.query.context as string;
      if (!context) {
        return res.status(400).json({ error: "context query parameter is required" });
      }

      const results = await db.execute(
        sql.raw(`SELECT id, context_code, category, text_ar, text_nl, text_en, how_to_apply_ar, how_to_apply_nl, how_to_apply_en, reward_ar, reward_nl, reward_en, repetitions, sort_order FROM adhkar WHERE context_code = '${context.replace(/'/g, "''")}' ORDER BY sort_order ASC`)
      );

      const rows = extractRows(results);
      res.json(rows);
    } catch (error: any) {
      console.error("[adhkar-api] Error:", error.message);
      res.status(500).json({ error: "Failed to fetch adhkar" });
    }
  });

  // GET /api/adhkar/contexts - list all available contexts with counts
  app.get("/api/adhkar/contexts", async (req, res) => {
    try {
      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "Database not available" });
      }

      const results = await db.execute(
        sql.raw(`SELECT context_code, category, COUNT(*) as count FROM adhkar GROUP BY context_code, category ORDER BY category, context_code`)
      );

      const rows = extractRows(results);
      res.json(rows);
    } catch (error: any) {
      console.error("[adhkar-api] Error:", error.message);
      res.status(500).json({ error: "Failed to fetch contexts" });
    }
  });

  // GET /api/misconceptions?age_group=xxx
  app.get("/api/misconceptions", async (req, res) => {
    try {
      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "Database not available" });
      }

      const ageGroup = (req.query.age_group || req.query.group) as string;
      let query = "SELECT * FROM misconceptions";
      if (ageGroup) {
        query += ` WHERE age_group = '${ageGroup.replace(/'/g, "''")}'`;
      }
      query += " ORDER BY sort_order ASC";

      const results = await db.execute(sql.raw(query));
      const rows = extractRows(results);
      res.json(rows);
    } catch (error: any) {
      console.error("[misconceptions-api] Error:", error.message);
      res.status(500).json({ error: "Failed to fetch misconceptions" });
    }
  });

  // GET /api/misconceptions/groups - list age groups
  app.get("/api/misconceptions/groups", async (req, res) => {
    try {
      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "Database not available" });
      }

      const results = await db.execute(
        sql.raw(`SELECT age_group, COUNT(*) as count FROM misconceptions GROUP BY age_group ORDER BY MIN(sort_order) ASC`)
      );

      const rows = extractRows(results);
      res.json(rows);
    } catch (error: any) {
      console.error("[misconceptions-api] Error:", error.message);
      res.status(500).json({ error: "Failed to fetch groups" });
    }
  });
}
