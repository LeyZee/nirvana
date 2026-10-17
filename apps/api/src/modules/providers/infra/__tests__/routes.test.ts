import type { onRequestHookHandler } from 'fastify';
import { describe, expect, it } from 'vitest';

import { createMemoryCredentialStore, createProvidersModule } from '../..';
import { testConfig } from '../../../../__tests__/support/config';
import { createLogger } from '../../../../logger';
import { buildServer } from '../../../../server';
import type { FetchLike } from '../http';

const XAI_KEY = 'xai-FAKEFAKEFAKEFAKEFAKEFAKE0000';

/** xAI accepts XAI_KEY and nothing else. */
const fakeXai: FetchLike = (_url, init) => {
  const status = init.headers['authorization'] === `Bearer ${XAI_KEY}` ? 200 : 401;
  return Promise.resolve({ status, text: () => Promise.resolve(JSON.stringify({ name: 'nirvana' })) });
};

/** Stands in for `requireRole('owner')` (P0-07a): the header says who asks. */
const ownerOnly: onRequestHookHandler = (request, reply, done) => {
  if (request.headers['x-test-role'] === 'owner') {
    done();
    return;
  }
  void reply.code(403).send({ error: 'forbidden' });
};

async function server() {
  const providers = createProvidersModule({
    store: createMemoryCredentialStore(),
    fetch: fakeXai,
    environmentKeys: null,
  });
  const config = testConfig();
  const app = await buildServer({
    config,
    logger: createLogger(config),
    routes: [providers.routes({ guard: ownerOnly })],
    readiness: () =>
      Promise.resolve({ isReady: true, checks: { database: true, migrations: true, worker: true } }),
  });
  const headers = { 'x-test-role': 'owner', origin: config.WEB_ORIGIN };
  return { app, headers, providers };
}

describe('/v1/settings/providers', () => {
  it('is closed to anyone but the owner', async () => {
    const { app } = await server();
    const response = await app.inject({ method: 'GET', url: '/v1/settings/providers' });
    expect(response.statusCode).toBe(403);
  });

  it('lists the three services, Grok first, and says what to do next', async () => {
    const { app, headers } = await server();
    const response = await app.inject({ method: 'GET', url: '/v1/settings/providers', headers });
    expect(response.statusCode).toBe(200);
    const body: unknown = response.json();
    expect(body).toMatchObject({
      services: [{ provider: 'xai' }, { provider: 'google' }, { provider: 'elevenlabs' }],
      next: { kind: 'connect', provider: 'xai' },
    });
  });

  it('connects a good key without ever sending it back', async () => {
    const { app, headers, providers } = await server();
    const response = await app.inject({
      method: 'PUT',
      url: '/v1/settings/providers/xai/key',
      headers,
      payload: { key: `  ${XAI_KEY}  ` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ provider: 'xai', state: 'connected', keyLabel: 'nirvana' });
    expect(response.body).not.toContain(XAI_KEY);
    expect(providers.apiKeySource('xai')).toBe(XAI_KEY);
  });

  it('answers a refused key with the French reason, and keeps nothing', async () => {
    const { app, headers, providers } = await server();
    const response = await app.inject({
      method: 'PUT',
      url: '/v1/settings/providers/xai/key',
      headers,
      payload: { key: 'xai-WRONGWRONGWRONGWRONGWRONG00' },
    });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ kind: 'unauthorized' });
    expect(providers.apiKeySource('xai')).toBeUndefined();
  });

  it('refuses settings for a service without a key, and an unknown service', async () => {
    const { app, headers } = await server();
    const settings = await app.inject({
      method: 'PUT',
      url: '/v1/settings/providers/google/settings',
      headers,
      payload: { visionModel: 'gemini-3.8-flash' },
    });
    expect(settings.statusCode).toBe(404);
    const unknown = await app.inject({
      method: 'POST',
      url: '/v1/settings/providers/openai/verify',
      headers,
    });
    expect(unknown.statusCode).toBe(400);
  });

  it('disconnects a key', async () => {
    const { app, headers, providers } = await server();
    await providers.connect('xai', XAI_KEY);
    const response = await app.inject({ method: 'DELETE', url: '/v1/settings/providers/xai', headers });
    expect(response.json()).toMatchObject({ provider: 'xai', state: 'not_connected' });
    expect(providers.apiKeySource('xai')).toBeUndefined();
  });
});
