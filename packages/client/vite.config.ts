import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so the built client works from any folder.
  base: './',
  // pnpm dev runs the game server next to Vite (docs/server-spec.md section 3).
  server: { proxy: { '/ws': { target: 'ws://localhost:8080', ws: true } } },
  build: {
    // Three.js alone is about 600 kB minified.
    chunkSizeWarningLimit: 800,
    // The fight viewer and the play page.
    rollupOptions: { input: { viewer: 'index.html', play: 'play.html' } },
  },
});
