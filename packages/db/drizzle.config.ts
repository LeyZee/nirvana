import { defineConfig } from 'drizzle-kit';

// `pnpm db:generate` writes a migration from the schema; it is read and completed by hand before commit
// (FORCE ROW LEVEL SECURITY, grants, triggers), see README.md.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  casing: 'snake_case',
  strict: true,
});
