/**
 * Guards the module boundaries (ADR 0002, docs/architecture/modules.md). ESLint lints the fixture tree in
 * fixtures/boundaries/modules/ with the real config, its elements redeclared on that tree; each file must break
 * exactly the rules listed below. If someone removes or weakens a rule, this test fails.
 */
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

import { boundaryElements } from '../../../../eslint.config.js';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const fixturesModules = 'apps/api/src/__tests__/fixtures/boundaries/modules';

const eslint = new ESLint({
  cwd: repoRoot,
  // The fixtures are in the config's ignores for the normal lint; here they are the subject.
  ignore: false,
  overrideConfig: [
    {
      languageOptions: { parserOptions: { projectService: false } },
      settings: { 'boundaries/elements': boundaryElements(fixturesModules) },
    },
  ],
  ruleFilter: ({ ruleId }) => ruleId.startsWith('boundaries/') || ruleId === 'import-x/no-cycle',
});

const cases: readonly { readonly file: string; readonly breaks: readonly string[] }[] = [
  { file: 'conversations/application/reaches-into-fans-infra.ts', breaks: ['boundaries/dependencies'] },
  { file: 'persona/application/outside-module-graph.ts', breaks: ['boundaries/dependencies'] },
  { file: 'fans/domain/imports-infra.ts', breaks: ['boundaries/dependencies'] },
  { file: 'fans/domain/does-io.ts', breaks: ['boundaries/dependencies'] },
  { file: 'conversations/application/cycle-a.ts', breaks: ['import-x/no-cycle'] },
  { file: 'conversations/application/uses-fans-index.ts', breaks: [] },
];

describe('module boundaries', () => {
  it.each(cases)(
    '$file breaks exactly $breaks',
    async ({ file, breaks }) => {
      const [result] = await eslint.lintFiles([join(repoRoot, fixturesModules, file)]);
      const broken = new Set((result?.messages ?? []).map((message) => message.ruleId ?? message.message));
      expect([...broken].sort()).toEqual([...breaks].sort());
    },
    60_000,
  );
});
