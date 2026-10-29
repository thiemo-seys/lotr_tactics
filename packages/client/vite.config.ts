import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so the built viewer works from any folder.
  base: './',
  // Three.js alone is about 600 kB minified.
  build: { chunkSizeWarningLimit: 800 },
});
