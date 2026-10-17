import { createDbClient } from '../client';
import { runMigrations } from '../migrate';

// `pnpm db:migrate`: applies the migrations with DATABASE_ADMIN_URL (the owner role, never the app role).
const url = process.env['DATABASE_ADMIN_URL'];
if (url === undefined || url === '') {
  console.error('DATABASE_ADMIN_URL is missing (see .env.example).');
  process.exit(1);
}
const client = createDbClient(url, { max: 1 });
try {
  await runMigrations(client.db);
  console.log('Migrations applied.');
} finally {
  await client.close();
}
