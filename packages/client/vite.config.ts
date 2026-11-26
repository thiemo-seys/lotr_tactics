import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

/** The game's version, set by hand in the root `package.json` and shown on the play page's menu. */
const VERSION = (JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string }).version;

/**
 * A virtual module that lists the files in a folder of `public`, by name without their extension, so
 * the client asks only for files that exist: `virtual:models` for the models in `public/models`, so a
 * unit without one is drawn as a pawn without a failed request (docs/viewer-spec.md section 4), and
 * `virtual:portraits` for the unit cards' portraits in `public/portraits`. In the dev server, the list
 * is read again on the next page load after a file is added or removed.
 */
function fileList(id: string, folder: string, extension: string): Plugin {
  const resolved = `\0${id}`;
  const dir = fileURLToPath(new URL(`public/${folder}`, import.meta.url));
  return {
    name: `file-list:${folder}`,
    resolveId: (source) => (source === id ? resolved : undefined),
    load(source) {
      if (source !== resolved) return undefined;
      const files = readdirSync(dir)
        .filter((file) => file.endsWith(extension))
        .map((file) => file.slice(0, -extension.length))
        .sort();
      return `export default ${JSON.stringify(files)};`;
    },
    configureServer(server) {
      const changed = (file: string) => {
        if (!file.startsWith(dir)) return;
        const module = server.moduleGraph.getModuleById(resolved);
        if (module !== undefined) server.moduleGraph.invalidateModule(module);
      };
      server.watcher.add(dir);
      server.watcher.on('add', changed);
      server.watcher.on('unlink', changed);
    },
  };
}

export default defineConfig({
  // Relative asset paths, so the built client works from any folder.
  base: './',
  plugins: [fileList('virtual:models', 'models', '.glb'), fileList('virtual:portraits', 'portraits', '.webp')],
  define: { __APP_VERSION__: JSON.stringify(VERSION) },
  // pnpm dev runs the game server next to Vite (docs/server-spec.md section 3).
  server: { proxy: { '/ws': { target: 'ws://localhost:8080', ws: true } } },
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
