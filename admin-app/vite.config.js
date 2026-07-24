import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// `base: '/admin/'` on production builds lets you drop the built files into an
// /admin subfolder alongside the main Yana Buy site on the same domain (e.g.
// yanabuy.com/admin/). Same domain = same-origin localStorage, which is how this
// admin app shares the demo "database" with the main site. Dev server still
// runs at the root of its own port for convenience.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/admin/' : '/',
  plugins: [react()],
  server: {
    port: 5174,
  },
}))
