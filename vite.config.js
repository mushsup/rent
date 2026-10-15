import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Domain root: routing is HashRouter-based, no base subpath, no redirects.
  base: '/',
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    // Keep the Supabase client in a stable vendor chunk: check-bundle.mjs
    // grants it a higher budget by the `supabase-` filename prefix.
    chunkSizeWarningLimit: 220,
    rollupOptions: {
      output: {
        // Rolldown accepts only the function form here.
        manualChunks: (id) => {
          if (id.includes('node_modules/@supabase/')) return 'supabase-vendor';
          return undefined;
        },
      },
    },
  },
})
