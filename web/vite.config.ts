import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const backendUrl = process.env.DECYPHARR_BACKEND_URL ?? 'http://localhost:8282';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // Go supplies the deployment base at runtime so one build supports any URLBase.
  base: './',
  build: { outDir: 'dist', assetsDir: 'gui-assets' },
  server: {
    proxy: {
      '/api': backendUrl,
      '/images': backendUrl,
      '/version': backendUrl,
      '/login': {
        target: backendUrl,
        bypass: (request) => (request.method === 'GET' ? '/index.html' : undefined),
      },
      '/register': {
        target: backendUrl,
        bypass: (request) => (request.method === 'GET' ? '/index.html' : undefined),
      },
      '/skip-auth': backendUrl,
      '/debug': backendUrl,
      '/logs': backendUrl,
    },
  },
});
