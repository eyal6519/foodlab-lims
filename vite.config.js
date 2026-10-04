import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), '')
  if (mode === 'production' && env.VITE_SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'SECURITY: VITE_SUPABASE_SERVICE_ROLE_KEY is set in the environment, but Vite ' +
      'inlines VITE_* variables into the public browser bundle. A service-role key ' +
      'there would be visible to every visitor. Remove it from .env/.env.production ' +
      'before building.'
    )
  }
  return {
    plugins: [react(), tailwindcss()],
    build: {
      chunkSizeWarningLimit: 1600,
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/setupTests.js',
    },
  }
})