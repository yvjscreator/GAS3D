import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // WASM codecs are bundled as URL assets; Vite's dev optimizer must not prebundle them.
  optimizeDeps: { exclude: ['@jsquash/oxipng'] },
  server: {
    proxy: {
      '/api/subtitles': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
})
