import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { writeFileSync } from 'fs'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const rawSupabaseUrl = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL;
  const supabaseHost = rawSupabaseUrl
    ? new URL(rawSupabaseUrl).hostname
    : null;

  const buildTime = Date.now().toString();
  try { writeFileSync('public/version.json', JSON.stringify({ v: buildTime })); } catch(e) {}

  const supabaseRuntimeCache = supabaseHost ? [
    {
      urlPattern: new RegExp(`^https://${supabaseHost}/rest/v1/.*`, 'i'),
      handler: 'NetworkFirst',
      options: {
        cacheName: 'supabase-api',
        expiration: { maxEntries: 50, maxAgeSeconds: 5 * 60 },
      },
    },
  ] : [];

  return {
    define: {
      __BUILD_TIME__: JSON.stringify(buildTime),
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['logo.png', 'pwa-192.png', 'pwa-512.png'],
        manifest: {
          name: 'ENGEL Expert Academy',
          short_name: 'Expert Academy',
          description: 'Aplikacja szkoleń ENGEL Expert Academy',
          theme_color: '#2C2C2C',
          background_color: '#EFEFEF',
          display: 'standalone',
          orientation: 'portrait',
          scope: '/',
          start_url: '/',
          icons: [
            { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          ],
        },
        workbox: {
          skipWaiting: true,
          clientsClaim: true,
          globPatterns: ['**/*.{js,css,html,png,svg,ico,ttf,woff2,webp}'],
          globIgnores: ['version.json'],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          runtimeCaching: [
            {
              urlPattern: /\/firmowy\.webp$/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'static-assets',
                expiration: { maxEntries: 10, maxAgeSeconds: 30 * 24 * 60 * 60 },
              },
            },
            ...supabaseRuntimeCache,
          ],
        },
      }),
    ],
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor':   ['react', 'react-dom'],
            'react-pdf':      ['@react-pdf/renderer'],
          },
        },
      },
    },
  }
})
