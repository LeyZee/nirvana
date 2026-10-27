#!/usr/bin/env node
// `pnpm sessions:log [n | --all]`: the session journal, newest first, read from docs/sessions/log/ (one file per
// session, named <date>-<slug>.md). The folder is the index: no session edits a shared file, so two pull requests
// never conflict on the journal. Default: the last 10 entries. No dependency: Node 22 only.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'docs/sessions/log');
const arg = process.argv[2];
const count = arg === '--all' ? Infinity : Number(arg ?? 10);
if (!Number.isInteger(count) && count !== Infinity) {
  console.error('usage: pnpm sessions:log [n | --all]');
  process.exit(1);
}

const files = readdirSync(dir)
  .filter((name) => name.endsWith('.md'))
  .sort()
  .reverse()
  .slice(0, count);
for (const name of files) {
  const title = readFileSync(join(dir, name), 'utf8').split('\n', 1)[0].replace(/^#\s*/, '');
  console.log(`${title}\n  docs/sessions/log/${name}`);
}
