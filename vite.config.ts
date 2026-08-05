import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// Server host 0.0.0.0 so a physical iOS device on the same LAN can hit the dev
// server during Capacitor live-reload development.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { host: true, port: 5173 },
  build: { outDir: 'dist', sourcemap: true },
})
