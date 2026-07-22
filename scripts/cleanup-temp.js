/**
 * cleanup-temp.js
 * 
 * Runs before Metro bundler starts to clean up stale temporary directories
 * that can cause ENOENT watcher crashes.
 * 
 * Problem: Package managers (pnpm, npm) sometimes create temporary directories
 * like `expo-localization_tmp_26762` during installs/updates. If Metro's file
 * watcher tries to watch these directories after they're partially deleted,
 * it crashes with ENOENT errors.
 * 
 * Solution: This script removes any *_tmp_* directories in node_modules
 * before Metro starts, preventing the watcher from ever seeing them.
 */

const fs = require("fs");
const path = require("path");

const nodeModulesDir = path.join(__dirname, "..", "node_modules");

function cleanupTempDirs() {
  try {
    const entries = fs.readdirSync(nodeModulesDir, { withFileTypes: true });
    let cleaned = 0;

    for (const entry of entries) {
      // Match patterns like: expo-localization_tmp_26762, @scope_tmp_12345
      if (entry.isDirectory() && /_tmp_\d+/.test(entry.name)) {
        const fullPath = path.join(nodeModulesDir, entry.name);
        try {
          fs.rmSync(fullPath, { recursive: true, force: true });
          cleaned++;
          console.log(`[cleanup] Removed stale temp dir: ${entry.name}`);
        } catch (e) {
          // Ignore if already gone
        }
      }
    }

    // Also clean inside scoped packages (@expo/, @react-native/, etc.)
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith("@")) {
        const scopeDir = path.join(nodeModulesDir, entry.name);
        try {
          const scopeEntries = fs.readdirSync(scopeDir, { withFileTypes: true });
          for (const scopeEntry of scopeEntries) {
            if (scopeEntry.isDirectory() && /_tmp_\d+/.test(scopeEntry.name)) {
              const fullPath = path.join(scopeDir, scopeEntry.name);
              try {
                fs.rmSync(fullPath, { recursive: true, force: true });
                cleaned++;
                console.log(`[cleanup] Removed stale temp dir: ${entry.name}/${scopeEntry.name}`);
              } catch (e) {
                // Ignore
              }
            }
          }
        } catch (e) {
          // Ignore unreadable scope dirs
        }
      }
    }

    if (cleaned > 0) {
      console.log(`[cleanup] Cleaned ${cleaned} stale temp director${cleaned === 1 ? "y" : "ies"}`);
    }
  } catch (e) {
    // Don't crash if node_modules doesn't exist yet
    if (e.code !== "ENOENT") {
      console.warn("[cleanup] Warning:", e.message);
    }
  }
}

// Also clean .expo/web/cache if it's corrupted
function cleanupExpoCache() {
  const expoCacheDir = path.join(__dirname, "..", ".expo", "web", "cache");
  try {
    if (fs.existsSync(expoCacheDir)) {
      const stats = fs.statSync(expoCacheDir);
      // If cache is older than 7 days, clean it
      const ageMs = Date.now() - stats.mtimeMs;
      if (ageMs > 7 * 24 * 60 * 60 * 1000) {
        fs.rmSync(expoCacheDir, { recursive: true, force: true });
        console.log("[cleanup] Cleared stale .expo/web/cache");
      }
    }
  } catch (e) {
    // Ignore
  }
}

cleanupTempDirs();
cleanupExpoCache();
