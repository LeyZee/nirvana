import { describe, expect, it } from 'vitest';

import { loadConfig } from '../config';
import { buildServer } from '../server';

describe('GET /health', () => {
  it('answers 200 with status ok', async () => {
    const server = buildServer(loadConfig({ LOG_LEVEL: 'silent' }));
    const response = await server.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});

describe('loadConfig', () => {
  it('rejects an invalid port', () => {
    expect(() => loadConfig({ PORT: 'not-a-port' })).toThrow(/PORT/);
  });
});
