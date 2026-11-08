import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// The public voice invitation is built as its own HTML entrypoint. This avoids
// depending on the authenticated dashboard SPA to render /voice/join.
export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), 'index.html'),
        voiceJoin: resolve(process.cwd(), 'voice-join.html'),
      },
    },
  },
})
