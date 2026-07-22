/**
 * Postinstall script to ensure NativeWind's CSS cache file exists.
 * The production build (Metro bundler) expects this file to exist
 * at react-native-css-interop/.cache/web.css
 */
const fs = require("fs");
const path = require("path");

function findAndFixCache(baseDir) {
  const targets = [];
  
  // Direct node_modules path
  targets.push(path.join(baseDir, "node_modules", "react-native-css-interop", ".cache"));
  
  // Also check pnpm .pnpm directory
  const pnpmDir = path.join(baseDir, "node_modules", ".pnpm");
  if (fs.existsSync(pnpmDir)) {
    try {
      const entries = fs.readdirSync(pnpmDir);
      for (const entry of entries) {
        if (entry.startsWith("react-native-css-interop@")) {
          const cachePath = path.join(pnpmDir, entry, "node_modules", "react-native-css-interop", ".cache");
          targets.push(cachePath);
        }
      }
    } catch (e) {
      // Ignore read errors
    }
  }

  for (const cachePath of targets) {
    try {
      if (!fs.existsSync(cachePath)) {
        fs.mkdirSync(cachePath, { recursive: true });
      }
      const webCssPath = path.join(cachePath, "web.css");
      if (!fs.existsSync(webCssPath)) {
        fs.writeFileSync(webCssPath, "/* nativewind cache */\n");
        console.log(`[fix-nativewind-cache] Created ${webCssPath}`);
      }
    } catch (e) {
      // Ignore errors for paths that don't exist
    }
  }
}

findAndFixCache(process.cwd());
findAndFixCache(__dirname.replace(/\/scripts$/, ""));
