import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so the built client works from any folder.
  base: './',
  build: {
    // Three.js alone is about 600 kB minified.
    chunkSizeWarningLimit: 800,
    // The fight viewer and the play page.
    rollupOptions: { input: { viewer: 'index.html', play: 'play.html' } },
  },
});
