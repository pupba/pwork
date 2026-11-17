import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  build: { outDir: process.env.PW_OUT_DIR ?? 'dist' },
  plugins: [
    react(),
    ...(process.env.TAURI_ENV_PLATFORM ? [] : [VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,ico,woff2,webmanifest}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
      manifest: {
        id: './',
        name: 'PRESTIQUE Workspace',
        short_name: 'Workspace',
        lang: 'ko',
        description: '로컬 Markdown 문서와 프로젝트 관리',
        display: 'standalone',
        start_url: './', scope: './',
        background_color: '#fafaf8', theme_color: '#fafaf8',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    })]),
  ],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
})
