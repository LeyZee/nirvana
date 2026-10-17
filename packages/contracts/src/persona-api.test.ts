import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { CreatePersonaVersionBodySchema, PersonaOverviewSchema } from './persona-api';

const demo = (): unknown =>
  parse(readFileSync(fileURLToPath(new URL('../../../personas/demo/v0.1.0.yaml', import.meta.url)), 'utf8'));

const HASH = 'a'.repeat(64);
const summary = {
  id: '0192a0e4-7b1c-7cc0-8a4e-3f5d9b2c1a00',
  version: '0.1.0',
  contentHash: HASH,
  isActive: false,
  createdAt: '2026-10-17T20:00:00.000Z',
};

describe('persona API contract', () => {
  it('takes a persona and the hash it started from, nothing else', () => {
    expect(CreatePersonaVersionBodySchema.safeParse({ persona: demo(), basedOn: null }).success).toBe(true);
    expect(CreatePersonaVersionBodySchema.safeParse({ persona: demo(), basedOn: HASH }).success).toBe(true);
    expect(CreatePersonaVersionBodySchema.safeParse({ persona: demo(), basedOn: 'abc' }).success).toBe(false);
    expect(
      CreatePersonaVersionBodySchema.safeParse({ persona: demo(), basedOn: null, isActive: true }).success,
    ).toBe(false);
  });

  it('describes a creator without any version, and one with her newest', () => {
    const creatorId = '0192a0e4-7b1c-7cc0-8a4e-3f5d9b2c1a01';
    expect(PersonaOverviewSchema.safeParse({ creatorId, latest: null, versions: [] }).success).toBe(true);
    const overview = { creatorId, latest: { summary, persona: demo() }, versions: [summary] };
    expect(PersonaOverviewSchema.safeParse(overview).success).toBe(true);
    expect(
      PersonaOverviewSchema.safeParse({ ...overview, versions: [{ ...summary, version: 'v1' }] }).success,
    ).toBe(false);
  });
});
