/** The names, without `.glb`, of the model files in `public/models` (from the plugin in vite.config.ts). */
declare module 'virtual:models' {
  const files: readonly string[];
  export default files;
}

/** The names, without `.webp`, of the unit portraits in `public/portraits`, which are unit ids (from the plugin in vite.config.ts). */
declare module 'virtual:portraits' {
  const files: readonly string[];
  export default files;
}

/** The names, without `.mp3`, of the music tracks in `public/music` (from the plugin in vite.config.ts). */
declare module 'virtual:music' {
  const files: readonly string[];
  export default files;
}
