import { defineConfig } from "vitest/config";
import path from "node:path";

// Mirrors the tsconfig "paths" so tests can import client modules, which use the
// @/ alias throughout. Without this, vitest cannot resolve them at all.
export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "./shared"),
      "@": path.resolve(__dirname, "."),
    },
  },
});
