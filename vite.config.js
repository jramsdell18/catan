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
    include: ['tests/rules/**/*.test.js'],
  },
});
