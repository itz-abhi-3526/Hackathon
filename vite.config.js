import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  /* Fixed dev/preview ports so the leaderboard site's HOME link
     (VITE_MAIN_SITE_URL=http://localhost:5173) always lands here. */
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  optimizeDeps: {
    /* xlsx (SheetJS) ships a hybrid CJS/ESM file that Vite's dev bundler
       does not pre-bundle automatically — it must be force-included. */
    include: ['xlsx'],
  },
})
