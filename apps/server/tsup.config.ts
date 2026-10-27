import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  outDir: 'dist',
  clean: true,
  splitting: false,
  // bundle the workspace package (TS source); keep real npm deps external
  noExternal: ['@aldetes/shared'],
});
