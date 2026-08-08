import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Allow previewing the dev server through a Cloudflare quick tunnel
    allowedHosts: ['.trycloudflare.com'],
  },
})
