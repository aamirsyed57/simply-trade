import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const apiHost = process.env.API_HOST ?? 'localhost'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': `http://${apiHost}:8000`,
      '/docs': `http://${apiHost}:8000`,
      '/ops': `http://${apiHost}:8000`,
    },
  },
})

