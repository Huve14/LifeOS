import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.ts'],
  },
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registration is handled by src/pwa.ts so the installed app can check
      // again when it is reopened, focused, or comes back online.
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Life OS',
        short_name: 'Life OS',
        description: 'Your private everyday companion for life in Abu Dhabi',
        theme_color: '#81CEEB',
        background_color: '#E6F2F4',
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
        // Activate each deployed release immediately and take control of open
        // PWA windows. The client waits for controllerchange before refreshing.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // Keep the offline shell dependable without forcing a phone to
        // download Maps, LiveKit, games, 3D art and every feature at install.
        // Optional feature chunks are cached the first time they are opened.
        globPatterns: [
          '**/*.{html,svg,png,ico,woff2,css}',
          'assets/{main,supabase,native,web,base,jsx-runtime,ios-frame,tweaks-panel,components,loading-globe,animated-icon,settings,screens-home,auth,app}-*.js',
        ],
        navigateFallback: '/',
        navigateFallbackDenylist: [/^\/s\//],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/.*\.js$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'feature-bundles',
              expiration: { maxEntries: 24, maxAgeSeconds: 2592000 },
            },
          },
          {
            urlPattern: /^https:\/\/[a-z]+\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
              networkTimeoutSeconds: 10,
            },
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images',
              expiration: { maxEntries: 60, maxAgeSeconds: 86400 },
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
      '/api/deepseek': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        proxyTimeout: 180000,
        timeout: 180000,
      },
    },
  },
})
