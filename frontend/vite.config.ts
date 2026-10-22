import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
// Ports come from the central registry (slot 01). Browser tests run the API on 3201 so a local dev server can keep 3101.
const api = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3101';
export default defineConfig({
  plugins: [tailwindcss()],
  server: { port: 5201, strictPort: true, proxy: { '/api': api } },
});
