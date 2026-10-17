/**
 * Creates a dashboard `owner` account; there is no public sign-up (P0-07a).
 * Usage: `pnpm owner:create --email <email> --name <name>`, then type the password (12 characters minimum).
 * The password is read from the terminal, never from an argument, so it stays out of the shell history.
 */
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';

import { createOwner } from '../auth';
import { createApp } from '../composition-root';
import { loadConfig } from '../config';
import { createLogger } from '../logger';

const { values } = parseArgs({ options: { email: { type: 'string' }, name: { type: 'string' } } });
if (values.email === undefined || values.name === undefined) {
  console.error('Usage: pnpm owner:create --email <email> --name <name>');
  process.exit(1);
}

const terminal = createInterface({ input: process.stdin, output: process.stdout });
const password = await terminal.question('Mot de passe (12 caractères minimum) : ');
terminal.close();

const config = loadConfig();
const app = await createApp(config, createLogger(config));
try {
  const { userId } = await createOwner(app.auth, app.db.db, {
    email: values.email,
    name: values.name,
    password,
  });
  console.log(`Compte owner créé (${userId}).`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await app.shutdown();
}
