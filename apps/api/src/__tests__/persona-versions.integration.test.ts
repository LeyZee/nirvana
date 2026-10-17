import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  PersonaSchema,
  type Persona,
  type PersonaOverview,
  type PersonaVersionSummary,
} from '@nirvana/contracts';
import { eq, schema } from '@nirvana/db';
import { createTestDb, type TestDb } from '@nirvana/db/testing';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { parse } from 'yaml';

import { createOwner } from '../auth';
import { createApp, type App } from '../composition-root';
import { createLogger } from '../logger';
import { buildServer, type Server } from '../server';

import { testConfig } from './support/config';
import { DASHBOARD_ORIGIN, signIn } from './support/sign-in';

const OWNER = { email: 'owner@example.test', name: 'Owner', password: 'correct horse battery' };
const OPERATOR = { email: 'operator@example.test', name: 'Operator', password: 'staple battery horse' };

/** The fictional demo persona of the repository (ADR 0010: never a real one in a test). */
const demo = (): Persona =>
  PersonaSchema.parse(
    parse(
      readFileSync(fileURLToPath(new URL('../../../../personas/demo/v0.1.0.yaml', import.meta.url)), 'utf8'),
    ),
  );

const withVersion = (persona: Persona, version: string): Persona => ({
  ...persona,
  meta: { ...persona.meta, version },
});

describe('persona versions (GET /v1/creators/:id/persona, POST …/persona/versions)', () => {
  let test: TestDb;
  let app: App;
  let server: Server;
  let owner: string;
  let operator: string;
  let anna: string;
  let bea: string;

  const get = (creatorId: string, cookie: string) =>
    server.inject({ method: 'GET', url: `/v1/creators/${creatorId}/persona`, headers: { cookie } });
  const post = (creatorId: string, cookie: string, payload: object) =>
    server.inject({
      method: 'POST',
      url: `/v1/creators/${creatorId}/persona/versions`,
      headers: { cookie, origin: DASHBOARD_ORIGIN },
      payload,
    });

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
    anna = (await app.modules.persona.creators.create({ displayName: 'Anna' })).id;
    bea = (await app.modules.persona.creators.create({ displayName: 'Bea' })).id;
    const { userId } = await createOwner(app.auth, app.db.db, OPERATOR);
    await test.admin.db
      .update(schema.user)
      .set({ role: 'operator', creatorIds: [anna] })
      .where(eq(schema.user.id, userId));
    owner = await signIn(server, OWNER.email, OWNER.password);
    operator = await signIn(server, OPERATOR.email, OPERATOR.password);
  });

  afterAll(async () => {
    await server.close();
    await app.shutdown();
    await test.close();
  });

  it('stores versions that are never active, newest first, and audits each one', async () => {
    expect((await server.inject({ method: 'GET', url: `/v1/creators/${anna}/persona` })).statusCode).toBe(
      401,
    );
    expect((await get(anna, owner)).json()).toEqual({ creatorId: anna, latest: null, versions: [] });

    const first = await post(anna, owner, { persona: demo(), basedOn: null });
    expect(first.statusCode).toBe(201);
    const v1 = first.json<PersonaVersionSummary>();
    expect(v1).toMatchObject({ version: '0.1.0', isActive: false });

    const second = await post(anna, owner, {
      persona: withVersion(demo(), '0.1.1'),
      basedOn: v1.contentHash,
    });
    expect(second.statusCode).toBe(201);

    const overview = (await get(anna, owner)).json<PersonaOverview>();
    expect(overview.versions.map((v) => v.version)).toEqual(['0.1.1', '0.1.0']);
    expect(overview.latest?.summary.version).toBe('0.1.1');
    expect(overview.latest?.persona.details.first_name).toBe(demo().details.first_name);

    const audit = await test.admin.db
      .select({ action: schema.auditLog.action })
      .from(schema.auditLog)
      .where(eq(schema.auditLog.entityId, v1.id));
    expect(audit).toEqual([{ action: 'persona_version.create' }]);
  });

  it('refuses a stale edit or a taken number with 409, and stores nothing', async () => {
    const { latest } = (await get(anna, owner)).json<PersonaOverview>();
    const stale = await post(anna, owner, { persona: withVersion(demo(), '0.2.0'), basedOn: null });
    expect(stale.statusCode).toBe(409);
    expect(stale.json<{ error: { code: string } }>().error.code).toBe('persona_version_conflict');
    const taken = await post(anna, owner, {
      persona: withVersion(demo(), '0.1.0'),
      basedOn: latest?.summary.contentHash,
    });
    expect(taken.statusCode).toBe(409);
    expect((await get(anna, owner)).json<PersonaOverview>().versions).toHaveLength(2);
  });

  it('refuses a persona that fails the schema with 400', async () => {
    const minor = { ...demo(), details: { ...demo().details, date_of_birth: '2015-01-01' } };
    expect((await post(bea, owner, { persona: minor, basedOn: null })).statusCode).toBe(400);
  });

  it('lets a chatter read the persona of her creators only, and never change it', async () => {
    expect((await get(anna, operator)).statusCode).toBe(200);
    expect((await get(bea, operator)).statusCode).toBe(403);
    expect(
      (await post(anna, operator, { persona: withVersion(demo(), '0.3.0'), basedOn: null })).statusCode,
    ).toBe(403);
  });

  it('keeps each creator’s versions to herself', async () => {
    expect((await get(bea, owner)).json()).toEqual({ creatorId: bea, latest: null, versions: [] });
  });
});
