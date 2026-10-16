import { describe, expect, it } from 'vitest';

import { createCompositionRoot } from '../composition-root.js';
import { loadConfig } from '../config.js';
import { buildServer } from '../server.js';

describe('GET /health', () => {
  it('answers 200 with status ok', async () => {
    const server = buildServer(createCompositionRoot(loadConfig({ NODE_ENV: 'test' })));
    const response = await server.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    await server.close();
  });
});
