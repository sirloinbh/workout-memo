import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
// Browser tests run the API on another port so a local dev server can keep 3001.
const api = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3001';
export default defineConfig({
  plugins: [tailwindcss()],
  server: { proxy: { '/api': api } },
});
