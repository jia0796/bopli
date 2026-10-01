import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative asset paths work on GitHub Pages project sites as well as localhost.
  base: './',
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
  },
});
