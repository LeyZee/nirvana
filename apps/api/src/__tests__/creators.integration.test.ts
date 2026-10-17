import { eq, schema } from '@nirvana/db';
import { createTestDb, type TestDb } from '@nirvana/db/testing';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { createOwner } from '../auth';
import { createApp, type App } from '../composition-root';
import { createLogger } from '../logger';
import { buildServer, type Server } from '../server';

import { testConfig } from './support/config';
import { signIn } from './support/sign-in';

const OWNER = { email: 'owner@example.test', name: 'Owner', password: 'correct horse battery' };
const OPERATOR = { email: 'operator@example.test', name: 'Operator', password: 'staple battery horse' };

describe('creators (GET /v1/creators, pnpm creator:create)', () => {
  let test: TestDb;
  let app: App;
  let server: Server;

  beforeAll(async () => {
    test = await createTestDb(inject('pgSuperuserUrl'));
    const config = testConfig({ DATABASE_URL: test.appUrl, DATABASE_ADMIN_URL: test.adminUrl });
    app = await createApp(config, createLogger(config));
    server = await buildServer({
      config,
      logger: createLogger(config),
      routes: app.routes,
      readiness: app.readiness,
    });
    await createOwner(app.auth, app.db.db, OWNER);
  });

  afterAll(async () => {
    await server.close();
    await app.shutdown();
    await test.close();
  });

  it('creates a creator with an audit line, Paris time by default, and refuses a made-up zone', async () => {
    const creator = await app.modules.persona.creators.create({ displayName: '  Zoé  ' });
    expect(creator).toMatchObject({ displayName: 'Zoé', timezone: 'Europe/Paris' });
    const audit = await test.admin.db
      .select({ action: schema.auditLog.action })
      .from(schema.auditLog)
      .where(eq(schema.auditLog.entityId, creator.id));
    expect(audit).toEqual([{ action: 'creator.create' }]);
    await expect(
      app.modules.persona.creators.create({ displayName: 'X', timezone: 'Europe/Atlantis' }),
    ).rejects.toThrow();
  });

  it('lists every creator to the owner and only their own to an operator', async () => {
    const anna = await app.modules.persona.creators.create({ displayName: 'Anna' });
    await app.modules.persona.creators.create({ displayName: 'Bea', timezone: 'Europe/Brussels' });
    const { userId } = await createOwner(app.auth, app.db.db, OPERATOR);
    await test.admin.db
      .update(schema.user)
      .set({ role: 'operator', creatorIds: [anna.id] })
      .where(eq(schema.user.id, userId));

    expect((await server.inject({ method: 'GET', url: '/v1/creators' })).statusCode).toBe(401);
    const owner = await server.inject({
      method: 'GET',
      url: '/v1/creators',
      headers: { cookie: await signIn(server, OWNER.email, OWNER.password) },
    });
    expect(owner.json<{ creators: { displayName: string }[] }>().creators.map((c) => c.displayName)).toEqual([
      'Anna',
      'Bea',
      'Zoé',
    ]);
    const operator = await server.inject({
      method: 'GET',
      url: '/v1/creators',
      headers: { cookie: await signIn(server, OPERATOR.email, OPERATOR.password) },
    });
    expect(operator.json()).toEqual({
      creators: [{ id: anna.id, displayName: 'Anna', timezone: 'Europe/Paris' }],
    });
  });
});
