import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import process from 'node:process'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        // Native dev runs frontend and backend both on the host, so
        // 127.0.0.1 reaches the backend. Inside Docker Compose, the frontend
        // container's 127.0.0.1 is itself, not the backend container - the
        // compose file overrides this via VITE_BACKEND_PROXY_TARGET to the
        // backend service's DNS name instead.
        target: process.env.VITE_BACKEND_PROXY_TARGET || 'http://127.0.0.1:8081',
        changeOrigin: true,
      },
    },
  },
})
