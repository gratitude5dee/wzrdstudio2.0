import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { vitePluginEditframe } from "@editframe/vite-plugin";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
// @ts-ignore -- plugin type mismatch with Vite 6
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
    }),
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
    : {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('@editframe/')) return 'editor-editframe';
            if (id.includes('@react-three/') || id.includes('/three/')) return 'visual-3d';
            if (id.includes('/src/components/worldview/')) return 'kanvas-worldview';
            if (id.includes('/src/components/character-creation/')) return 'kanvas-character';
            if (id.includes('/src/components/kanvas/EditStudioSection') || id.includes('/src/components/kanvas/EditCanvas')) return 'kanvas-edit';
            return undefined;
          },
        },
      },
    },
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
