import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const MODELS = fileURLToPath(new URL('public/models', import.meta.url));

/**
 * `virtual:models` lists the model files in `public/models`, so the client asks only for files that
 * exist and a unit without one is drawn as a pawn without a failed request (docs/viewer-spec.md
 * section 4). In the dev server, the list is read again on the next page load after a file is added
 * or removed.
 */
function modelList(): Plugin {
  const id = 'virtual:models';
  const resolved = `\0${id}`;
  return {
    name: 'model-list',
    resolveId: (source) => (source === id ? resolved : undefined),
    load(source) {
      if (source !== resolved) return undefined;
      const files = readdirSync(MODELS)
        .filter((file) => file.endsWith('.glb'))
        .map((file) => file.slice(0, -'.glb'.length))
        .sort();
      return `export default ${JSON.stringify(files)};`;
    },
    configureServer(server) {
      const changed = (file: string) => {
        if (!file.startsWith(MODELS)) return;
        const module = server.moduleGraph.getModuleById(resolved);
        if (module !== undefined) server.moduleGraph.invalidateModule(module);
      };
      server.watcher.add(MODELS);
      server.watcher.on('add', changed);
      server.watcher.on('unlink', changed);
    },
  };
}

export default defineConfig({
  // Relative asset paths, so the built client works from any folder.
  base: './',
  plugins: [modelList()],
  // pnpm dev runs the game server next to Vite (docs/server-spec.md section 3), with its API and
  // sign-in (docs/accounts-spec.md section 3).
  server: {
    proxy: {
      '/ws': { target: 'ws://localhost:8080', ws: true },
      '/api': { target: 'http://localhost:8080' },
      '/auth': { target: 'http://localhost:8080' },
    },
  },
  build: {
    // Three.js with its addons is about 650 kB minified, and the rest of what both pages share about 140 kB.
    chunkSizeWarningLimit: 800,
    rolldownOptions: {
      // The fight viewer and the play page.
      input: { viewer: 'index.html', play: 'play.html' },
      // Three.js and its addons in a chunk of their own, apart from the sim and the client, so
      // neither grows towards the limit with the other, and Three.js stays cached between builds.
      output: { codeSplitting: { groups: [{ name: 'three', test: /[\\/]node_modules[\\/]three[\\/]/ }] } },
    },
  },
});
