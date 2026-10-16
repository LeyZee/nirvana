#!/usr/bin/env node
// Repository consistency checks, part of `pnpm check` (and of the pre-commit hook with --staged).
//  1. Every file path cited in a Markdown file exists. Paths under apps/ and packages/ only warn
//     until the code exists (--strict turns them into errors).
//  2. Every task card docs/sessions/tasks/<ID>-*.md is listed in docs/sessions/tasks/README.md, and vice versa.
//     Same for ADRs and docs/adr/README.md.
//  3. No tracked file above 500 KB (media and exports do not belong in the repository).
//  4. No forbidden file names (*.bak, *.orig, *.copy, *-v2.*, *_final*, tmp/, old/): docs/conventions/hygiene.md.
//  5. Every TODO/FIXME in code carries a task card id: `TODO(P2-03): ...` (docs/conventions/coding.md).
//  6. Every `pnpm <script>` cited in the docs exists in the root package.json.
// No dependency: Node 22 only.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const strict = process.argv.includes('--strict');
const stagedOnly = process.argv.includes('--staged');
const SKIP_DIRS = new Set(['node_modules', '.git', '.scratch', 'dist', '.output', '.turbo', 'coverage', 'brainstorm']);
const PLANNED_PREFIXES = ['apps/', 'packages/'];
const MAX_BYTES = 500 * 1024;
const FORBIDDEN_NAMES = [/\.(bak|orig|copy|tmp)$/i, /-v\d+\.[a-z]+$/i, /_final/i, /(^|\/)(tmp|old|backup)\//i];
const TODO_WITHOUT_ID = /\b(TODO|FIXME|XXX)\b(?!\((P\d-\d\d|H-\d\d|D-\d\d)\))/;
const PNPM_BUILTINS = new Set(['install', 'add', 'remove', 'up', 'update', 'dlx', 'exec', 'run', 'audit', 'why', 'ls', 'list', 'outdated', 'eslint', 'prettier', 'vitest', 'tsc', 'knip', 'drizzle-kit', 'turbo', 'playwright', 'promptfoo', 'lefthook', 'x', 'create']);

const errors = [];
const warnings = [];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = stagedOnly
  ? execSync('git diff --cached --name-only --diff-filter=ACMR', { cwd: root, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
      .map((f) => join(root, f))
      .filter((f) => existsSync(f))
  : walk(root);
const rel = (f) => relative(root, f);

// 3. Size, 4. Forbidden names, 5. TODO without id
for (const f of files) {
  const r = rel(f);
  if (statSync(f).size > MAX_BYTES) errors.push(`${r}: larger than 500 KB`);
  if (FORBIDDEN_NAMES.some((re) => re.test(r))) errors.push(`${r}: forbidden file name (hygiene.md)`);
  if (/\.(ts|tsx|mjs|js)$/.test(r) && !r.startsWith('scripts/check-repo')) {
    const lines = readFileSync(f, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (TODO_WITHOUT_ID.test(line)) errors.push(`${r}:${i + 1}: TODO without a task card id, e.g. TODO(P2-03)`);
    });
  }
}

if (!stagedOnly) {
  const mdFiles = files.filter((f) => f.endsWith('.md'));
  const scripts = Object.keys(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts ?? {});

  // 1. Cited paths, 6. Cited pnpm scripts
  const pathLike = /^(?:docs|apps|packages|personas|evals|brand|scripts|\.github|CLAUDE\.md|README\.md|docker-compose\.yml)(?:\/[^\s`)]*)?$/;
  for (const md of mdFiles) {
    const text = readFileSync(md, 'utf8');
    const r = rel(md);
    const candidates = new Set();
    for (const m of text.matchAll(/`([^`\n]+)`/g)) candidates.add(m[1]);
    for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) candidates.add(m[1]);
    for (let c of candidates) {
      c = c.split('#')[0];
      if (!c || c.startsWith('http') || c.includes('*') || c.includes('<') || c.includes('{') || c.includes(' ')) continue;
      if (!pathLike.test(c)) continue;
      const target = c.endsWith('/') ? c.slice(0, -1) : c;
      if (existsSync(join(root, target))) continue;
      const planned = PLANNED_PREFIXES.some((p) => target.startsWith(p));
      (planned && !strict ? warnings : errors).push(`${r}: path not found \`${c}\``);
    }
    for (const m of text.matchAll(/`pnpm ([a-z][a-z0-9:-]*)/g)) {
      const name = m[1];
      if (PNPM_BUILTINS.has(name) || scripts.includes(name)) continue;
      errors.push(`${r}: \`pnpm ${name}\` is not a script of the root package.json`);
    }
  }

  // 2. Task cards and ADRs vs their index
  function checkIndex(dir, indexFile, idPattern, label) {
    const indexText = readFileSync(join(root, indexFile), 'utf8');
    const onDisk = readdirSync(join(root, dir)).filter((f) => idPattern.test(f)).map((f) => f.match(idPattern)[1]);
    const inIndex = [...indexText.matchAll(/^\|\s*([A-Z]+-\d+|\d{4})\s*\|/gm)].map((m) => m[1]);
    for (const id of onDisk) if (!inIndex.includes(id)) errors.push(`${indexFile}: ${label} ${id} exists on disk but is missing from the index`);
    for (const id of inIndex) if (!onDisk.includes(id)) errors.push(`${indexFile}: ${label} ${id} is in the index but no file matches in ${dir}`);
  }
  checkIndex('docs/sessions/tasks', 'docs/sessions/tasks/README.md', /^([A-Z]+-\d+)-.*\.md$/, 'task card');
  checkIndex('docs/adr', 'docs/adr/README.md', /^(\d{4})-.*\.md$/, 'ADR');
}

for (const w of warnings) console.warn(`warning: ${w}`);
for (const e of errors) console.error(`error: ${e}`);
console.log(`check-repo: ${errors.length} error(s), ${warnings.length} warning(s)${stagedOnly ? ' (staged files only)' : ''}`);
process.exit(errors.length > 0 ? 1 : 0);
