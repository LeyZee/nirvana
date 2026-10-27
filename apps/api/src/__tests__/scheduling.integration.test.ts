import {
  ApiErrorSchema,
  MyShiftsSchema,
  newId,
  OnDutyListSchema,
  PlanningSchema,
  PlatformAccountIdSchema,
  SchedulingSettingsSchema,
  ShiftSchema,
  ShiftTemplateListSchema,
  ShiftTemplateSchema,
  TeamMemberSchema,
  type CreatorId,
  type PlatformAccountId,
  type Shift,
  type TeamMember,
} from '@nirvana/contracts';
import { eq, schema } from '@nirvana/db';
import { createTestDb, type TestDb } from '@nirvana/db/testing';
import type { LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { createOwner } from '../auth';
import { createApp, type App } from '../composition-root';
import { createLogger } from '../logger';
import { buildServer, type Server } from '../server';

import { testConfig } from './support/config';
import { DASHBOARD_ORIGIN, signIn } from './support/sign-in';

/** Invented people, creators and accounts only (ADR 0010). */
const OWNER = { email: 'owner@example.test', name: 'Owner', password: 'correct horse battery' };
const CREATOR = { email: 'creator@example.test', name: 'Creator', password: 'battery staple horse' };
const PASSWORD = 'staple battery horse';
const PARIS = 'Europe/Paris';
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** The grid's day (Paris), shifted by `days`. */
function parisDay(days = 0): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: PARIS }).format(new Date());
  const day = new Date(`${today}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

/** ISO weekday of a calendar day: Monday 1 … Sunday 7. */
const weekdayOf = (day: string): number => ((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;

/** The instant of a wall-clock minute in Paris on that day (never a change-of-time hour here). */
function parisInstant(day: string, minute: number): Date {
  const guess = new Date(`${day}T00:00:00Z`).getTime() + minute * MINUTE;
  const wall = new Intl.DateTimeFormat('en-CA', {
    timeZone: PARIS,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(guess);
  const [date = '', time = ''] = wall.split(', ');
  const offset = new Date(`${date}T${time}:00Z`).getTime() - guess;
  return new Date(guess - offset);
}

/** Now, on the minute, moved by `minutes`. */
const minutesFromNow = (minutes: number): Date =>
  new Date(Math.floor(Date.now() / MINUTE) * MINUTE + minutes * MINUTE);

const iso = (at: Date): string => at.toISOString().replace('.000Z', 'Z');
const codeOf = (response: LightMyRequestResponse): string => ApiErrorSchema.parse(response.json()).error.code;
const detailsOf = (response: LightMyRequestResponse) => ApiErrorSchema.parse(response.json()).error.details;

describe('Équipe › Planning (/v1/scheduling, EQ-02)', () => {
  let test: TestDb;
  let app: App;
  let server: Server;
  let owner: string;
  let creator: string;
  let anna: CreatorId;
  let ines: CreatorId;
  let annaAccount: PlatformAccountId;
  let inesAccount: PlatformAccountId;
  let theo: TeamMember;
  let basile: TeamMember;
  let nora: TeamMember;
  let theoCookie: string;
  let basileCookie: string;
  let noraCookie: string;
  let theoTomorrow: Shift;
  let basileUnderWay: Shift;

  const call = (
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    url: string,
    cookie: string,
    payload?: object,
  ) =>
    server.inject({
      method,
      url: `/v1${url}`,
      headers: { cookie, origin: DASHBOARD_ORIGIN },
      ...(payload !== undefined && { payload }),
    });

  const addMember = async (body: {
    email: string;
    displayName: string;
    teamRole: 'chatter' | 'manager';
    creatorIds: CreatorId[];
  }): Promise<{ member: TeamMember; cookie: string }> => {
    const response = await call('POST', '/team/members', owner, {
      ...body,
      firstName: body.displayName,
      lastName: 'Inventé',
      country: 'BJ',
      timeZone: 'Africa/Porto-Novo',
      joinedOn: parisDay(-30),
      commission: { rateBps: 1000 },
      teamShareBps: body.teamRole === 'manager' ? 500 : null,
    });
    expect(response.statusCode).toBe(201);
    const member = TeamMemberSchema.parse(response.json());
    const context = await app.auth.$context;
    await context.internalAdapter.linkAccount({
      userId: member.userId,
      providerId: 'credential',
      accountId: member.userId,
      password: await context.password.hash(PASSWORD),
    });
    return { member, cookie: await signIn(server, body.email, PASSWORD) };
  };

  const planning = async (cookie: string, from: Date, to: Date, creatorId?: string) => {
    const query = new URLSearchParams({ from: iso(from), to: iso(to), ...(creatorId && { creatorId }) });
    const response = await call('GET', `/scheduling/planning?${query.toString()}`, cookie);
    expect(response.statusCode).toBe(200);
    return PlanningSchema.parse(response.json());
  };

  const shiftBody = (
    memberId: string,
    creatorId: string,
    accountId: string,
    startsAt: Date,
    endsAt: Date,
  ) => ({
    memberId,
    creatorId,
    platformAccountId: accountId,
    startsAt: iso(startsAt),
    endsAt: iso(endsAt),
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
    ines = (await app.modules.persona.creators.create({ displayName: 'Inès' })).id;
    annaAccount = newId(PlatformAccountIdSchema);
    inesAccount = newId(PlatformAccountIdSchema);
    await test.admin.db.insert(schema.platformAccounts).values([
      { id: annaAccount, creatorId: anna, platform: 'reveal', handle: 'anna-invente' },
      { id: inesAccount, creatorId: ines, platform: 'reveal', handle: 'ines-inventee' },
    ]);
    const { userId: creatorUserId } = await createOwner(app.auth, app.db.db, CREATOR);
    await test.admin.db
      .update(schema.user)
      .set({ role: 'creator', creatorIds: [anna] })
      .where(eq(schema.user.id, creatorUserId));
    owner = await signIn(server, OWNER.email, OWNER.password);
    creator = await signIn(server, CREATOR.email, CREATOR.password);
    ({ member: theo, cookie: theoCookie } = await addMember({
      email: 'theo@example.test',
      displayName: 'Théo',
      teamRole: 'chatter',
      creatorIds: [anna],
    }));
    ({ member: basile, cookie: basileCookie } = await addMember({
      email: 'basile@example.test',
      displayName: 'Basile',
      teamRole: 'chatter',
      creatorIds: [anna, ines],
    }));
    ({ member: nora, cookie: noraCookie } = await addMember({
      email: 'nora@example.test',
      displayName: 'Nora',
      teamRole: 'manager',
      creatorIds: [anna, ines],
    }));
  });

  afterAll(async () => {
    await server.close();
    await app.shutdown();
    await test.close();
  });

  it('gives every member the settings, Imperium’s grid until the owner saves theirs', async () => {
    const defaults = { timeZone: PARIS, slotStartMinute: 0, slotLengthMinutes: 360, accessMarginMinutes: 15 };
    const read = await call('GET', '/scheduling/settings', theoCookie);
    expect(read.statusCode).toBe(200);
    expect(SchedulingSettingsSchema.parse(read.json())).toEqual(defaults);

    expect((await call('PUT', '/scheduling/settings', noraCookie, defaults)).statusCode).toBe(403);
    const saved = await call('PUT', '/scheduling/settings', owner, { ...defaults, accessMarginMinutes: 20 });
    expect(saved.statusCode).toBe(200);
    const again = SchedulingSettingsSchema.parse(
      (await call('GET', '/scheduling/settings', basileCookie)).json(),
    );
    expect(again.accessMarginMinutes).toBe(20);
    await call('PUT', '/scheduling/settings', owner, defaults);
  });

  it('never lets a creator into the planning', async () => {
    expect((await call('GET', '/scheduling/settings', creator)).statusCode).toBe(403);
  });

  it('lets the owner and an active manager plan a shift, never a chatter', async () => {
    const tomorrow = parisDay(1);
    const startsAt = parisInstant(tomorrow, 18 * 60);
    const byChatter = await call(
      'POST',
      '/scheduling/shifts',
      theoCookie,
      shiftBody(theo.id, anna, annaAccount, startsAt, new Date(startsAt.getTime() + 6 * HOUR)),
    );
    expect(byChatter.statusCode).toBe(403);
    expect(codeOf(byChatter)).toBe('role_forbidden');

    const byManager = await call(
      'POST',
      '/scheduling/shifts',
      noraCookie,
      shiftBody(theo.id, anna, annaAccount, startsAt, new Date(startsAt.getTime() + 6 * HOUR)),
    );
    expect(byManager.statusCode).toBe(201);
    theoTomorrow = ShiftSchema.parse(byManager.json());
    expect(theoTomorrow).toMatchObject({ memberId: theo.id, templateId: null, stoppedAt: null });
  });

  it('refuses a creator, an account, a member and times that do not fit', async () => {
    const startsAt = parisInstant(parisDay(2), 6 * 60);
    const endsAt = new Date(startsAt.getTime() + 6 * HOUR);
    const expectations: [object, number, string][] = [
      [
        shiftBody(theo.id, '0199f2a0-0000-7000-8000-0000000000c9', annaAccount, startsAt, endsAt),
        404,
        'creator_not_found',
      ],
      [shiftBody(theo.id, anna, inesAccount, startsAt, endsAt), 404, 'platform_account_not_found'],
      [shiftBody(theo.id, ines, inesAccount, startsAt, endsAt), 409, 'member_creator_conflict'],
      [
        shiftBody('0199f2a0-0000-7000-8000-0000000000e9', anna, annaAccount, startsAt, endsAt),
        404,
        'member_not_found',
      ],
      [
        shiftBody(theo.id, anna, annaAccount, minutesFromNow(-120), minutesFromNow(-60)),
        409,
        'shift_ended_conflict',
      ],
      [
        shiftBody(theo.id, anna, annaAccount, startsAt, new Date(endsAt.getTime() + 30_000)),
        400,
        'shift_range_invalid',
      ],
      [
        shiftBody(theo.id, anna, annaAccount, startsAt, new Date(startsAt.getTime() + 25 * HOUR)),
        400,
        'shift_range_invalid',
      ],
    ];
    for (const [body, status, code] of expectations) {
      const response = await call('POST', '/scheduling/shifts', owner, body);
      expect([response.statusCode, codeOf(response)]).toEqual([status, code]);
    }
  });

  it('keeps an account off two members and a member off two shifts, naming the shift in the way', async () => {
    const startsAt = new Date(theoTomorrow.startsAt);
    const sameAccount = await call(
      'POST',
      '/scheduling/shifts',
      owner,
      shiftBody(
        basile.id,
        anna,
        annaAccount,
        new Date(startsAt.getTime() + 2 * HOUR),
        new Date(startsAt.getTime() + 8 * HOUR),
      ),
    );
    expect([sameAccount.statusCode, codeOf(sameAccount)]).toEqual([409, 'shift_account_conflict']);
    expect(detailsOf(sameAccount)).toEqual({ shiftId: theoTomorrow.id });

    // Basile on Inès, then on Anna at the same time: the member is busy, on another creator.
    const onInes = await call(
      'POST',
      '/scheduling/shifts',
      owner,
      shiftBody(basile.id, ines, inesAccount, new Date(startsAt.getTime() - 6 * HOUR), startsAt),
    );
    expect(onInes.statusCode).toBe(201);
    const busy = await call(
      'POST',
      '/scheduling/shifts',
      owner,
      shiftBody(basile.id, anna, annaAccount, new Date(startsAt.getTime() - 3 * HOUR), startsAt),
    );
    expect([busy.statusCode, codeOf(busy)]).toEqual([409, 'shift_member_conflict']);
    expect(detailsOf(busy)).toEqual({ shiftId: ShiftSchema.parse(onInes.json()).id });

    // End to end: Théo's shift ends when the next one starts on his account.
    const following = await call(
      'POST',
      '/scheduling/shifts',
      owner,
      shiftBody(
        basile.id,
        anna,
        annaAccount,
        new Date(theoTomorrow.endsAt),
        new Date(new Date(theoTomorrow.endsAt).getTime() + HOUR),
      ),
    );
    expect(following.statusCode).toBe(201);
  });

  it('shows a planner every shift and account, and a chatter their own shifts, accounts and name only', async () => {
    const from = parisInstant(parisDay(0), 0);
    const to = parisInstant(parisDay(3), 0);
    const all = await planning(owner, from, to);
    expect(new Set(all.shifts.map((shift) => shift.memberId))).toEqual(new Set([theo.id, basile.id]));
    expect(all.accounts.map((account) => account.creatorName).toSorted()).toEqual(['Anna', 'Inès']);
    expect(all.members.map((member) => member.displayName).toSorted()).toEqual(['Basile', 'Théo']);
    expect(all.conflicts).toEqual([]);

    const onlyInes = await planning(noraCookie, from, to, ines);
    expect(onlyInes.shifts.every((shift) => shift.creatorId === ines)).toBe(true);
    expect(onlyInes.accounts.map((account) => account.id)).toEqual([inesAccount]);

    const mine = await planning(theoCookie, from, to);
    expect(mine.shifts.map((shift) => shift.id)).toEqual([theoTomorrow.id]);
    expect(mine.members).toEqual([{ id: theo.id, displayName: 'Théo', color: null }]);
    expect(mine.accounts).toEqual([
      { id: annaAccount, creatorId: anna, creatorName: 'Anna', platform: 'reveal', handle: 'anna-invente' },
    ]);

    const tooLong = await call(
      'GET',
      `/scheduling/planning?${new URLSearchParams({ from: iso(from), to: iso(new Date(from.getTime() + 43 * 24 * HOUR)) }).toString()}`,
      owner,
    );
    expect([tooLong.statusCode, codeOf(tooLong)]).toEqual([400, 'planning_range_invalid']);
  });

  it('moves a shift before it starts, and cancels it once', async () => {
    const later = new Date(new Date(theoTomorrow.startsAt).getTime() - HOUR);
    const moved = await call('PATCH', `/scheduling/shifts/${theoTomorrow.id}`, owner, {
      startsAt: iso(later),
    });
    expect(moved.statusCode).toBe(200);
    expect(ShiftSchema.parse(moved.json()).startsAt).toBe(later.toISOString());

    const off = await call('PATCH', `/scheduling/shifts/${theoTomorrow.id}`, owner, { memberId: basile.id });
    expect([off.statusCode, codeOf(off)]).toEqual([409, 'shift_member_conflict']);

    expect((await call('DELETE', `/scheduling/shifts/${theoTomorrow.id}`, theoCookie)).statusCode).toBe(403);
    expect((await call('DELETE', `/scheduling/shifts/${theoTomorrow.id}`, owner)).statusCode).toBe(204);
    const twice = await call('DELETE', `/scheduling/shifts/${theoTomorrow.id}`, owner);
    expect([twice.statusCode, codeOf(twice)]).toEqual([404, 'shift_not_found']);
    const mine = await planning(theoCookie, parisInstant(parisDay(0), 0), parisInstant(parisDay(3), 0));
    expect(mine.shifts).toEqual([]);
  });

  it('a shift under way keeps its member and start, ends earlier, then stops; Aujourd’hui follows it', async () => {
    const created = await call(
      'POST',
      '/scheduling/shifts',
      owner,
      shiftBody(basile.id, ines, inesAccount, minutesFromNow(-60), minutesFromNow(180)),
    );
    expect(created.statusCode).toBe(201);
    basileUnderWay = ShiftSchema.parse(created.json());

    const today = MyShiftsSchema.parse((await call('GET', '/scheduling/my-shifts', basileCookie)).json());
    expect(today.current).toMatchObject({
      id: basileUnderWay.id,
      creatorName: 'Inès',
      platform: 'reveal',
      handle: 'ines-inventee',
      accessStartsAt: new Date(new Date(basileUnderWay.startsAt).getTime() - 15 * MINUTE).toISOString(),
      accessEndsAt: new Date(new Date(basileUnderWay.endsAt).getTime() + 15 * MINUTE).toISOString(),
    });
    expect(today.next?.memberId).toBe(basile.id);
    const onDuty = OnDutyListSchema.parse((await call('GET', '/scheduling/on-duty', noraCookie)).json());
    expect(onDuty.onDuty.map((row) => [row.shiftId, row.member.displayName])).toEqual([
      [basileUnderWay.id, 'Basile'],
    ]);
    expect((await call('GET', '/scheduling/on-duty', basileCookie)).statusCode).toBe(403);
    expect(await app.modules.scheduling.onShift(ines, new Date())).toEqual([
      {
        memberId: basile.id,
        platformAccountId: inesAccount,
        shiftId: basileUnderWay.id,
        endsAt: new Date(basileUnderWay.endsAt),
      },
    ]);
    expect(await app.modules.scheduling.onShift(ines, minutesFromNow(-61))).toEqual([]);

    const url = `/scheduling/shifts/${basileUnderWay.id}`;
    const otherMember = await call('PATCH', url, owner, { memberId: nora.id });
    expect([otherMember.statusCode, codeOf(otherMember)]).toEqual([409, 'shift_started_conflict']);
    const longer = await call('PATCH', url, owner, { endsAt: iso(minutesFromNow(240)) });
    expect([longer.statusCode, codeOf(longer)]).toEqual([409, 'shift_started_conflict']);

    const shorter = await call('PATCH', url, owner, { endsAt: iso(minutesFromNow(120)) });
    expect(shorter.statusCode).toBe(200);
    const stopped = ShiftSchema.parse(
      (await call('PATCH', url, owner, { endsAt: iso(minutesFromNow(-30)) })).json(),
    );
    expect(stopped.stoppedAt).not.toBeNull();
    expect(new Date(stopped.endsAt).getTime()).toBe(
      Math.floor(Date.parse(stopped.stoppedAt ?? '') / MINUTE) * MINUTE,
    );

    // Stopped, its window closed with it: not current, and never `ended`.
    const after = MyShiftsSchema.parse((await call('GET', '/scheduling/my-shifts', basileCookie)).json());
    expect(after.current).toBeNull();
    expect(after.ended).toBeNull();
    const ended = await call('PATCH', url, owner, { endsAt: iso(minutesFromNow(-10)) });
    expect([ended.statusCode, codeOf(ended)]).toEqual([409, 'shift_ended_conflict']);
  });

  it('a template makes its shifts four weeks ahead, once, and shows the occurrence kept out', async () => {
    const day = parisDay(1);
    const weekday = weekdayOf(day);
    // Basile already holds Anna's account the second week, at the template's hours.
    const blocking = await call(
      'POST',
      '/scheduling/shifts',
      owner,
      shiftBody(
        basile.id,
        anna,
        annaAccount,
        parisInstant(parisDay(8), 7 * 60),
        parisInstant(parisDay(8), 9 * 60),
      ),
    );
    expect(blocking.statusCode).toBe(201);
    const template = {
      creatorId: anna,
      platformAccountId: annaAccount,
      memberId: theo.id,
      weekday,
      startMinute: 360,
      endMinute: 720,
    };

    const yesterday = await call('POST', '/scheduling/shift-templates', owner, {
      ...template,
      validFrom: parisDay(-1),
    });
    expect([yesterday.statusCode, codeOf(yesterday)]).toEqual([400, 'shift_template_date_invalid']);
    const created = await call('POST', '/scheduling/shift-templates', noraCookie, {
      ...template,
      validFrom: parisDay(0),
    });
    expect(created.statusCode).toBe(201);
    const made = ShiftTemplateSchema.parse(created.json());

    const from = parisInstant(parisDay(0), 0);
    const to = parisInstant(parisDay(28), 0);
    const read = await planning(owner, from, to, anna);
    const fromTemplate = read.shifts.filter((shift) => shift.templateId === made.id);
    expect(fromTemplate.map((shift) => shift.startsAt)).toEqual(
      [1, 15, 22].map((days) => parisInstant(parisDay(days), 360).toISOString()),
    );
    expect(read.conflicts).toEqual([
      {
        templateId: made.id,
        startsAt: parisInstant(parisDay(8), 360).toISOString(),
        endsAt: parisInstant(parisDay(8), 720).toISOString(),
        reason: 'account_taken',
        shiftId: ShiftSchema.parse(blocking.json()).id,
      },
    ]);
    expect((await planning(theoCookie, from, to)).conflicts).toEqual([]);

    // The job makes nothing twice; a shift moved by hand stays its occurrence.
    const first = fromTemplate[0];
    if (first === undefined) throw new Error('no shift from the template');
    const moved = await call('PATCH', `/scheduling/shifts/${first.id}`, owner, {
      startsAt: iso(new Date(new Date(first.startsAt).getTime() + HOUR)),
    });
    expect(moved.statusCode).toBe(200);
    expect(await app.modules.scheduling.jobs.makeShifts()).toBe(0);

    const templates = ShiftTemplateListSchema.parse(
      (await call('GET', '/scheduling/shift-templates', owner)).json(),
    );
    expect(templates.templates.map((one) => one.id)).toEqual([made.id]);
    expect((await call('GET', '/scheduling/shift-templates', theoCookie)).statusCode).toBe(403);

    // Ended today: its shifts not yet started go with it, and it is not ended twice.
    expect((await call('DELETE', `/scheduling/shift-templates/${made.id}`, owner)).statusCode).toBe(204);
    const afterEnd = await planning(owner, from, to, anna);
    expect(afterEnd.shifts.filter((shift) => shift.templateId === made.id)).toEqual([]);
    expect(afterEnd.conflicts).toEqual([]);
    const twice = await call('DELETE', `/scheduling/shift-templates/${made.id}`, owner);
    expect([twice.statusCode, codeOf(twice)]).toEqual([404, 'shift_template_not_found']);
    expect(await app.modules.scheduling.jobs.makeShifts()).toBe(0);
  });

  it('writes who planned what in the audit trail, never a name', async () => {
    const rows = await test.admin.db
      .select({
        action: schema.auditLog.action,
        entity: schema.auditLog.entity,
        details: schema.auditLog.details,
      })
      .from(schema.auditLog)
      .where(eq(schema.auditLog.entity, 'shift_template'));
    expect(rows.map((row) => row.action).toSorted()).toEqual(['shift_template.create', 'shift_template.end']);
    expect(JSON.stringify(rows)).not.toMatch(/Théo|Basile|Anna/u);
  });
});
