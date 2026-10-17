import { describe, expect, it } from 'vitest';

import { createAppLlm } from '../llm';
import { createLogger } from '../logger';

import { testConfig } from './support/config';

describe('createAppLlm', () => {
  it('tells the providers module which key a provider refused, and never throws into the call', async () => {
    const reported: string[] = [];
    const llm = createAppLlm({
      credentials: () => undefined,
      reportRefusedKey: (provider, kind) => {
        reported.push(`${provider}:${kind}`);
        return Promise.reject(new Error('database down'));
      },
      logger: createLogger(testConfig()),
    });
    expect(() => {
      llm.deps.onKeyRefused?.({ provider: 'xai', status: 401 });
      llm.deps.onKeyRefused?.({ provider: 'google', status: 403 });
    }).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));
    expect(reported).toEqual(['xai:unauthorized', 'google:missing_permission']);
  });

  it('reports no voice key when none is connected', () => {
    const llm = createAppLlm({
      credentials: () => undefined,
      reportRefusedKey: () => Promise.resolve(),
      logger: createLogger(testConfig()),
    });
    expect(llm.gateway.health().roles.find((r) => r.role === 'voice')?.hasKey).toBe(false);
  });
});
