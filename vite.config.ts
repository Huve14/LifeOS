import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Suveda · Moving to Abu Dhabi',
        short_name: 'Suveda',
        description: 'Moving to Abu Dhabi — packing, budget, documents, timeline & more',
        theme_color: '#FAF7F2',
        background_color: '#FAF7F2',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'icons/icon-192.png',
            type: 'image/png',
            sizes: '192x192',
            purpose: 'any maskable',
          },
          {
            src: 'icons/icon-512.png',
            type: 'image/png',
            sizes: '512x512',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/[a-z]+\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
            },
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        shared: 'shared.html',
      },
    },
  },
  server: {
    proxy: {
      '/api/huve': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        proxyTimeout: 180000,
        timeout: 180000,
      },
    },
  },
})
