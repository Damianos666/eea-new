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
            // ── Vendor ──────────────────────────────────────────────────────
            // React core — wspólne dla wszystkich ról, cache'owane długoterminowo.
            'react-vendor': ['react', 'react-dom'],

            // @react-pdf/renderer (~350 KB gzip) — osobny chunk, ładowany
            // tylko gdy trener/admin generuje PDF. Bez tego trafiałby
            // do każdego bundla i blokował start aplikacji.
            'react-pdf': ['@react-pdf/renderer'],

            // ── Trener ──────────────────────────────────────────────────────
            // Formularze raportów i delegacji + ich generatory PDF
            // (~190 KB). Pobierane dopiero przy pierwszym otwarciu formularza
            // (lazy import w TrainerScheduleTab.jsx).
            'trainer-forms': [
              './src/components/ServiceReportForm',
              './src/components/DelegationForm',
              './src/lib/serviceReportPdfGenerator',
              './src/lib/delegationPdfGenerator',
              './src/config/serviceReportConfig',
            ],

            // ── Admin ────────────────────────────────────────────────────────
            // Panel admina — shell + lżejsze zakładki (~130 KB).
            // Klient i trener nigdy tego nie pobierają.
            'admin-core': [
              './src/components/admin/AdminPanel',
              './src/components/admin/AdminMessages',
              './src/components/admin/AdminTrainings',
              './src/components/admin/AdminCodeGen',
              './src/components/admin/AdminQuiz',
            ],

            // Ciężkie zakładki admina (~150 KB) — wydzielone osobno,
            // bo są ładowane lazy (mount-on-first-visit) i nie są potrzebne
            // przy pierwszym wejściu w panel.
            'admin-heavy': [
              './src/components/admin/AdminBatchComplete',
              './src/components/admin/AdminUsers',
              './src/components/admin/AdminSchedule',
              './src/components/admin/AdminInterested',
              './src/components/admin/AdminRegistrations',
              './src/components/admin/AdminSettlements',
            ],

            // ── Klient ───────────────────────────────────────────────────────
            // Zakładki klienta — ładowane od razu po logowaniu.
            // Wydzielone by nie mieszały się z kodem admina/trenera.
            'client-tabs': [
              './src/components/TrainingTab',
              './src/components/CatalogTab',
              './src/components/ScheduleTab',
              './src/components/MessagesTab',
              './src/components/ProfileTab',
              './src/components/TabBar',
            ],
          },
        },
      },
    },
  }
})
