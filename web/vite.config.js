import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// dev: npm run dev (proxies the API to uvicorn on :8000). prod: npm run build, FastAPI serves dist/.
const api = 'http://127.0.0.1:8000'
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { '/query': api, '/health': api, '/samples': api } },
})
