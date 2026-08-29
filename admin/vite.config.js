import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // In production Vercel serves /api/* from the same origin as the app.
    // Locally, dev-server.mjs plays that role — this proxy keeps the frontend
    // code identical in both environments (it always fetches a relative /api).
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.API_PORT || 3001}`,
        changeOrigin: true,
      },
    },
  },
})
