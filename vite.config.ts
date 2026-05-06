import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { vitePluginEditframe } from "@editframe/vite-plugin";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
// @ts-nocheck
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    vitePluginEditframe({
      root: "./src",
      cacheRoot: "./node_modules/.cache/editframe",
    }) as any,
    mode === 'editframe' &&
    viteSingleFile(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "react-dnd": path.resolve(__dirname, "./src/lib/react-dnd.tsx"),
    },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "framer-motion",
    ],
  },
  optimizeDeps: {
    exclude: ['@sparkjsdev/spark'],
  },
  build: mode === 'editframe'
    ? undefined
    : undefined,
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./vitest.setup.ts",
    css: false,
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "tests/e2e/**",
      "tests/performance.spec.ts",
      "playwright.config.test.ts",
      "supabase/functions/**/*.test.ts",
    ],
  },
}));
