import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registered manually in main.jsx so we can pass
      // updateViaCache: 'none' — iOS Safari otherwise happily serves the
      // OLD service worker script from cache, which keeps the stale app
      // shell alive forever (white screen after deploys).
      injectRegister: false,
      // Custom worker (injectManifest): src/sw.js is bundled into dist/sw.js
      // and carries BOTH the PWA precache/runtime caching AND the push
      // notification handlers. Push and PWA share one service worker — a
      // separate push-sw.js at the same scope would replace this one.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectManifest: {
        swSrc: 'src/sw.js',
        swDest: 'dist/sw.js',
        globPatterns: ['**/*.{js,css,html,woff2,ttf,png,jpg,gif}'],
        // The 3.4 MB loading animation is too big for the offline precache
        // (2 MiB cap) and only plays on first visit — serve it via HTTP cache.
        globIgnores: ['**/assets/loading.gif'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      manifest: {
        name: 'CODEX · CODEBYTERS Community',
        short_name: 'CODEX',
        description: 'The community platform of CODEBYTERS, the BSIT student organization of Davao Oriental State University.',
        theme_color: '#0B2B3A',
        background_color: '#0B2B3A',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
