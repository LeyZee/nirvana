/**
 * `pnpm check` (revue à froid B4): the schema and the migrations carry the same tables, columns and constraints. A
 * table, a column or a CHECK built from a contract (`EVENT_TYPES`, for instance) that changed without its migration
 * fails here with the statements `pnpm db:generate` would write. Hand-written SQL (RLS, triggers, grants) is not
 * compared. Outside `src/`: drizzle-kit's API is a dev tool, not part of the package; JavaScript, run by tsx,
 * because drizzle-kit's types do not resolve under the type-aware lint.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api';

import * as schema from '../src/schema';

const META = fileURLToPath(new URL('../migrations/meta/', import.meta.url));
const [latest] = readdirSync(META)
  .filter((name) => name.endsWith('_snapshot.json'))
  .sort()
  .reverse();
if (latest === undefined) throw new Error('no migration snapshot');
const snapshot = JSON.parse(readFileSync(`${META}${latest}`, 'utf8'));
const current = generateDrizzleJson(schema, snapshot.id, undefined, 'snake_case');
const missing = await generateMigration(snapshot, current);
if (missing.length > 0) {
  console.error(`Le schéma a changé sans migration (dernière : ${latest}). Lancer pnpm db:generate :`);
  for (const statement of missing) console.error(`  ${statement}`);
  process.exit(1);
}
console.log(`db drift: schéma et migrations alignés (${latest}).`);
