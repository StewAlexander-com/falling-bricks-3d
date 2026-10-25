import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/falling-bricks-3d/',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 800,
  },
  plugins: [
    VitePWA({
      // Registered in main.ts so installed copies check for updates on resume
      // and only reload when it can't interrupt a game.
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icons/*.png', 'img/wall.webp'],
      manifest: {
        name: 'Falling Bricks 3D',
        short_name: 'Bricks 3D',
        description: 'Dodge waves of falling 3D bricks for as long as you can.',
        theme_color: '#05060d',
        background_color: '#05060d',
        display: 'fullscreen',
        orientation: 'portrait',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,webp,png}'],
        // Music streams with HTTP range requests, which precaching breaks on Safari.
        globIgnores: ['**/audio/**', 'og.jpg'],
        navigateFallback: null,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
});
