import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    strictPort: true,
    proxy: {
      '/api/session': { target: 'https://manusbot.up.railway.app', changeOrigin: true, secure: true },
      '/api/auth': { target: 'https://manusbot.up.railway.app', changeOrigin: true, secure: true },
      '/api/sdk': { target: 'https://manusbot.up.railway.app', changeOrigin: true, secure: true },
      '/api/chart': { target: 'https://manusbot.up.railway.app', changeOrigin: true, secure: true },
      '/api/user': { target: 'https://manusbot.up.railway.app', changeOrigin: true, secure: true },
      '/api/embed-origin': { target: 'https://manusbot.up.railway.app', changeOrigin: true, secure: true },
      '/api/version': { target: 'https://manusbot.up.railway.app', changeOrigin: true, secure: true },
      '/auth': { target: 'https://manusbot.up.railway.app', changeOrigin: true, secure: true },
    },
  },
})
