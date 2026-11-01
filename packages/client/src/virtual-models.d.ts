/** The names, without `.glb`, of the model files in `public/models` (from the plugin in vite.config.ts). */
declare module 'virtual:models' {
  const files: readonly string[];
  export default files;
}
