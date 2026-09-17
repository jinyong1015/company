import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { adminApiPlugin } from './server/admin/vitePlugin.ts'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  for (const [key, value] of Object.entries(env)) {
    if (!(key in process.env)) process.env[key] = value
  }

  return {
    plugins: [react(), tailwindcss(), adminApiPlugin()],
  }
})
