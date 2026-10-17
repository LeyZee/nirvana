// Tests of scripts/protect-main.mjs. Run: pnpm test:scripts
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { refusals } from './protect-main.mjs';

const SHA = 'a'.repeat(40);
const ZERO = '0'.repeat(40);

test('lets a push to any other branch through, force push included', () => {
  assert.deepEqual(refusals(`refs/heads/task/x ${SHA} refs/heads/task/x ${ZERO}\n`), []);
  assert.deepEqual(refusals(`refs/heads/main ${SHA} refs/heads/claude/thread ${SHA}\n`), []);
});

test('refuses a push to main, whatever the local branch', () => {
  assert.equal(refusals(`refs/heads/feature ${SHA} refs/heads/main ${SHA}\n`).length, 1);
  assert.equal(refusals(`refs/heads/main ${SHA} refs/heads/main ${ZERO}`).length, 1);
});

test('refuses deleting main', () => {
  assert.match(refusals(`(delete) ${ZERO} refs/heads/main ${SHA}\n`)[0] ?? '', /Suppression/);
});
