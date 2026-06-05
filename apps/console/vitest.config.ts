import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Component tests run in jsdom with the React plugin for JSX. Kept separate from vite.config.ts
// so the Tailwind plugin (irrelevant to logic tests) stays out of the test pipeline.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
});
