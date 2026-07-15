import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Dev-only proxy: forward /api/* to the local Express server (port 1234).
    // In production the same routing is done by client/vercel.json's rewrite, so
    // the client always calls the relative path /api/execute in both environments.
    proxy: {
      '/api': {
        target: 'http://localhost:1234',
        changeOrigin: true,
      },
    },
  },
  test: {
    // Vitest configuration for property-based tests
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/tests/setup.js'],
  },
})
