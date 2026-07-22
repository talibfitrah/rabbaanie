const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");
const fs = require("fs");

// Ensure the NativeWind CSS cache file exists for production builds
const cssInteropPaths = [
  path.join(__dirname, "node_modules", "react-native-css-interop", ".cache"),
  path.join(__dirname, "node_modules", ".pnpm", "react-native-css-interop@0.2.1*", "node_modules", "react-native-css-interop", ".cache"),
];
for (const cachePath of cssInteropPaths) {
  try {
    if (!fs.existsSync(cachePath)) {
      fs.mkdirSync(cachePath, { recursive: true });
    }
    const webCssPath = path.join(cachePath, "web.css");
    if (!fs.existsSync(webCssPath)) {
      fs.writeFileSync(webCssPath, "/* nativewind cache */\n");
    }
  } catch (e) {
    // Ignore errors for glob paths
  }
}

const config = getDefaultConfig(__dirname);

// Prevent Metro watcher from crashing on temp/transient directories
// This fixes ENOENT errors caused by package managers creating _tmp_ dirs
config.watcher = {
  ...config.watcher,
  additionalExts: config.watcher?.additionalExts || [],
};

// Exclude temp directories that cause watcher crashes (only _tmp_ pattern)
const existingBlockList = config.resolver?.blockList;
const blockListArray = existingBlockList
  ? Array.isArray(existingBlockList)
    ? existingBlockList
    : [existingBlockList]
  : [];
blockListArray.push(/node_modules\/[^/]*_tmp_\d+\/.*/);
config.resolver = {
  ...config.resolver,
  blockList: blockListArray,
};

module.exports = withNativeWind(config, {
  input: "./global.css",
});
