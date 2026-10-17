import { describe, expect, it } from 'vitest';

import { countScenarios, readThresholds } from './suite';

describe('eval suite guard', () => {
  it('counts only scenario files, so an empty suite counts zero', () => {
    expect(countScenarios(() => ['.gitkeep', 'README.md'])).toBe(0);
    expect(countScenarios((s) => (s === 'adversarial' ? ['asks-if-bot.yaml', 'meet.yml'] : []))).toBe(2);
  });

  it('reads the thresholds of the repository', async () => {
    const { readFile } = await import('node:fs/promises');
    const thresholds = readThresholds(await readFile(new URL('./thresholds.json', import.meta.url), 'utf8'));
    expect(thresholds.smoke.min_scenarios).toBeGreaterThan(0);
  });
});
