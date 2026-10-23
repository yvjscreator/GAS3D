import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Oxipng WASM uses dynamic chunks inside the Worker. Vite's default IIFE
  // cannot bundle code-splitting workers, so output ES modules instead.
  worker: { format: 'es' },
  // WASM codecs are bundled as URL assets; Vite's dev optimizer must not prebundle them.
  optimizeDeps: { exclude: ['@jsquash/oxipng'] },
  server: {
    proxy: {
      '/api/mockups': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
      '/api/subtitles': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
})
