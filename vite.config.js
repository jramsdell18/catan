import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom', 'three'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom/client', 'three', 'three/examples/jsm/controls/OrbitControls.js'],
  },
  test: {
    // Vitest unit suites only — keep board-rules (node:test) and Playwright specs out
    include: ['tests/rules/**/*.test.js', 'tests/game/**/*.test.js'],
  },
});
