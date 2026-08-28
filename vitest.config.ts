import { defineConfig } from "vitest/config";
import path from "node:path";

// Mirrors the tsconfig "paths" so tests can import client modules, which use the
// @/ alias throughout. Without this, vitest cannot resolve them at all.
export default defineConfig({
  // Required, and NOT inherited from the repo's tsconfig: expo/tsconfig.base
  // sets `"jsx": "react-native"` (preserve — type-check only, Metro does the
  // real transform). Left to itself vitest's esbuild pass falls back to the
  // classic runtime and fails on `React is not defined`, because none of the
  // components import React. Metro uses the automatic runtime, so match it.
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "./shared"),
      "@": path.resolve(__dirname, "."),
    },
  },
});
