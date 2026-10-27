import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const api = process.env.ALDETES_API ?? 'http://127.0.0.1:3001';

// Strict CSP only for production builds (dev needs inline scripts for HMR).
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; " +
  "img-src 'self' data: blob: http: https:; media-src 'self' blob: http: https:; connect-src 'self' http: https: ws: wss:; " +
  "frame-src 'none'; object-src 'none'; base-uri 'none'";

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    {
      name: 'aldetes-csp',
      transformIndexHtml: (html) =>
        command === 'build' ? html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`) : html,
    },
  ],
  base: './', // relative paths so the build also loads from Electron (file://)
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': { target: api, changeOrigin: false },
      '/cdn': { target: api },
      '/socket.io': { target: api, ws: true },
    },
  },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 1500 },
}));
