import { defineConfig } from 'tsup';

// One bundle per process. Workspace packages export TypeScript sources, so they are bundled in.
export default defineConfig({
  entry: ['src/index.ts', 'src/worker.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node22',
  noExternal: [/^@nirvana\//],
  sourcemap: true,
  clean: true,
});
