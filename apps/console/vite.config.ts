import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The Console ships as a static Walrus Site, so the build must be fully static with no
// server runtime. Relative base keeps assets resolvable when served from a Walrus Site path.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
});
