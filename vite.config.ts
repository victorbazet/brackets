import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Bind to 0.0.0.0 so phones on the same wifi can open the dev server, and send
  // /api through to `npm run dev:api` (the Worker) so the front end has a backend.
  server: {
    host: true,
    proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true } },
  },
})
