import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@ffmpeg/ffmpeg': path.resolve(
        __dirname,
        'node_modules/@ffmpeg/ffmpeg/dist/esm/index.js'
      ),
    },
  },
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg'], // 👈 force Vite NOT to prebundle it
  },
  server: {
    fs: {
      allow: ['.'],
    },
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    configureServer({ app }) {
      app.use((req, res, next) => {
        if (req.url.endsWith('.wasm')) {
          res.setHeader('Content-Type', 'application/wasm');
        }
        next();
      });
    },
  },
});
