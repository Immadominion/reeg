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
    // The Sui + dapp-kit clients are inherently large; split them into a long-lived vendor chunk
    // so app code can change without re-downloading them. The dev-only sandbox is already a lazy
    // chunk (see App.tsx), so the initial app payload stays lean.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined;
          }
          if (id.includes('@mysten')) {
            return 'sui';
          }
          if (id.includes('/react') || id.includes('/react-dom') || id.includes('/scheduler')) {
            return 'react';
          }
          return undefined;
        },
      },
    },
  },
});
