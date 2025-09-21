import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Forward /api/* to the Express API
      '/api': 'http://localhost:4000',
      // Forward /auth/* if you use those routes
      '/auth': 'http://localhost:4000',
    },
  },
})
