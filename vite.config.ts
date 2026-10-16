import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    strictPort: true,
    proxy: {
      '/api/chart': {
        target: 'https://manusbot.up.railway.app',
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
