import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// One origin for the whole platform:
//   /api       -> Netra FIR service (portal/backend, port 8001)
//   /hotspots  -> Hotspots module (the Next.js app in ../frontend, port 3000, basePath /hotspots)
const FIR_API = process.env.NETRA_FIR_API ?? 'http://127.0.0.1:8001'
const HOTSPOTS_APP = process.env.NETRA_HOTSPOTS_APP ?? 'http://127.0.0.1:3000'

const api = {
  '/api': { target: FIR_API, changeOrigin: true, rewrite: (p: string) => p.replace(/^\/api/, '') },
  '/hotspots': { target: HOTSPOTS_APP, changeOrigin: true, ws: true },
}

// https://vite.dev/config/
export default defineConfig({
  server: { port: 5173, strictPort: true, proxy: api },
  preview: { port: 4173, strictPort: true, proxy: api },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Netra — Unified Crime Intelligence Platform',
        short_name: 'Netra',
        description: 'FIR intelligence, repeat-offender detection, crime hotspots and station crime trends.',
        theme_color: '#1B3A6B',
        background_color: '#F2F4F7',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/hotspots(\/|$)/],
      },
    }),
  ],
})
