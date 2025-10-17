// vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === "production" ? "/swing-sync-web/" : "/",
  assetsInclude: ["**/*.wasm"],

  // 👇 Force ffmpeg to be pre-bundled so Vite stops complaining
  optimizeDeps: {
    include: ["@ffmpeg/ffmpeg"],
  },

  // 👇 Ensure Vite serves .wasm correctly
  build: {
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
}));
