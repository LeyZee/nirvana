import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // The API answers under /v1; proxied so that the session cookie stays first-party (same origin).
  server: { port: 5173, proxy: { '/v1': 'http://localhost:3000' } },
});
