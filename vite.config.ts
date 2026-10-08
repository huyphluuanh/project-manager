import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const isTauri = Boolean(process.env.TAURI_ENV_PLATFORM);

export default defineConfig(({ command }) => ({
  // GitHub Pages phục vụ dưới /project-manager/; Tauri và dev server dùng /
  base: isTauri || command === 'serve' ? '/' : (process.env.VITE_BASE ?? '/project-manager/'),
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    tailwindcss(),
    !isTauri && VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Project Manager',
        short_name: 'Projects',
        description: 'Quản lý dự án cá nhân đa thiết bị',
        lang: 'vi',
        theme_color: '#4f46e5',
        background_color: '#f6f7f9',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'My Day', url: './#/my-day' },
          { name: 'Tasks', url: './#/tasks' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
        // Dữ liệu nằm trong IndexedDB; không cache API Supabase
        navigateFallbackDenylist: [/^\/auth/, /^\/rest/],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ].filter(Boolean),
  server: { port: 5173, strictPort: true },
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    target: isTauri ? 'chrome110' : 'es2022',
    chunkSizeWarningLimit: 1500,
  },
}));
