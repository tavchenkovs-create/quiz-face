import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/quizzes':  { target: 'http://localhost:8000', changeOrigin: true },
      '/stats':    { target: 'http://localhost:8000', changeOrigin: true },
      '/database': { target: 'http://localhost:8000', changeOrigin: true },
      '/games':    { target: 'http://localhost:8000', changeOrigin: true },
      '/upload':         { target: 'http://localhost:8000', changeOrigin: true },
      '/upload-from-vk': { target: 'http://localhost:8000', changeOrigin: true },
      '/upload-batch':   { target: 'http://localhost:8000', changeOrigin: true },
      '/check':    { target: 'http://localhost:8000', changeOrigin: true },
      '/progress': { target: 'http://localhost:8000', changeOrigin: true },
      '/faces':   { target: 'http://localhost:8000', changeOrigin: true },
      '/health':  { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
})
