import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// `base: '/restaurant/' on production builds lets you drop the built files
// into a /restaurant subfolder alongside the main Yana Buy site and admin
// portal on the same domain (e.g. yanabuy.com/restaurant/). Dev server still
// runs at the root of its own port for convenience.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/restaurant/' : '/',
  plugins: [react()],
  server: {
    port: 5175,
  },
}))
