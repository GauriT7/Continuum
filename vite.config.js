import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// Absolute asset paths are required because the public /voice/join route
// rewrites to the SPA while the browser URL remains nested.
export default defineConfig({ plugins:[react()], base:'/' })
