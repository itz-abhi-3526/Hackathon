import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    /* xlsx (SheetJS) ships a hybrid CJS/ESM file that Vite's dev bundler
       does not pre-bundle automatically — it must be force-included. */
    include: ['xlsx'],
  },
})
