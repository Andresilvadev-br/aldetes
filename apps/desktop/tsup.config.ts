import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts', 'src/preload.ts'],
  format: ['cjs'],
  target: 'node20',
  outDir: 'dist-electron',
  clean: true,
  external: ['electron', 'uiohook-napi'],
  noExternal: ['electron-updater'],
  outExtension: () => ({ js: '.cjs' }),
  define: { 'process.env.ALDETES_DEFAULT_SERVER': JSON.stringify(process.env.ALDETES_DEFAULT_SERVER ?? '') },
});
