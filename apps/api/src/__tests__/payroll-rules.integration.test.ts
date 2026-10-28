import {
  BonusTierSetIdSchema,
  BonusTierSetSchema,
  CollectiveGoalIdSchema,
  CollectiveGoalSchema,
  ExchangeRatesSchema,
  newId,
  nextPayPeriod,
  payPeriodAt,
  PayPeriodSchema,
  PayrollPeriodSchema,
  PayrollSettingsSchema,
  type PayPeriod,
  type TeamMember,
} from '@nirvana/contracts';
import { eq, schema } from '@nirvana/db';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { startPayrollTeam, type PayrollTeam } from './support/payroll-team';

/** Periods of 2025: they have ended. */
const R0 = PayPeriodSchema.parse('2025-08-16');
const R1 = PayPeriodSchema.parse('2025-09-01');
const R2 = PayPeriodSchema.parse('2025-09-16');
const R3 = PayPeriodSchema.parse('2025-10-01');
const R4 = PayPeriodSchema.parse('2025-10-16');

const BRONZE = { thresholdMinor: 5_000, bonusMinor: 3_000, label: 'Bronze' };

describe('Équipe › Paie : paliers, objectif collectif, minimum de versement et taux (EQ-04, ADR 0032)', () => {
  let team: PayrollTeam;
  let theo: TeamMember;
  let lea: TeamMember;
  let mona: TeamMember;
  let theoCookie: string;
  let monaCookie: string;

  const post = (url: string, cookie: string, payload: object) => team.call('POST', url, cookie, payload);
  const tiers = (fromPeriod: PayPeriod, list: readonly object[] = [BRONZE]) => ({
    id: newId(BonusTierSetIdSchema),
    fromPeriod,
    tiers: list,
  });
  const goal = (period: PayPeriod) => ({
    id: newId(CollectiveGoalIdSchema),
    period,
    targetMinor: 10_000,
    tiers: [{ reachedBps: 5_000, bonusMinor: 1_000 }],
  });
  const refused = async (response: Promise<{ json: () => unknown }>) => team.refusal(await response);
  const today = () => payPeriodAt(new Date(), 'Europe/Paris');
  const minimum = async (cookie: string) =>
    PayrollSettingsSchema.parse((await team.call('GET', '/payroll/settings', cookie)).json())
      .minimumPayoutMinor;

  beforeAll(async () => {
    team = await startPayrollTeam(inject('pgSuperuserUrl'));
    ({ member: theo, cookie: theoCookie } = await team.addMember('theo@example.test', 'Théo'));
    ({ member: lea } = await team.addMember('lea@example.test', 'Léa'));
    ({ member: mona, cookie: monaCookie } = await team.addMember('mona@example.test', 'Mona', 'manager'));
  });

  afterAll(() => team.close());

  it('lets the owner alone set the team’s rules, anyone in the team read the minimum, the agency the rate', async () => {
    expect(await minimum(theoCookie)).toBe(1_500);
    const none = await team.call('GET', '/payroll/exchange-rates', team.owner);
    expect([none.statusCode, none.json()]).toEqual([200, { usd: null }]);
    await team.test.admin.db.insert(schema.exchangeRates).values(
      ['2025-09-30', '2025-10-01'].map((day, index) => ({
        currency: 'USD',
        day,
        rateMicros: 920_000 + index,
        source: 'Banque centrale européenne',
        fetchedAt: new Date(`${day}T15:00:00Z`),
      })),
    );
    const latest = ExchangeRatesSchema.parse(
      (await team.call('GET', '/payroll/exchange-rates', monaCookie)).json(),
    );
    expect(latest.usd).toMatchObject({ currency: 'USD', day: '2025-10-01', rateMicros: 920_001 });
    // A chatter reads the rate of their own statement's lines, never the latest one; nor does a manager on leave.
    const { member: nina, cookie: ninaCookie } = await team.addMember('nina@example.test', 'Nina', 'manager');
    await team.test.admin.db
      .update(schema.teamMembers)
      .set({ status: 'on_leave' })
      .where(eq(schema.teamMembers.id, nina.id));
    for (const cookie of [theoCookie, ninaCookie]) {
      const refusal = await team.call('GET', '/payroll/exchange-rates', cookie);
      expect([refusal.statusCode, team.refusal(refusal).code]).toEqual([403, 'payroll_forbidden']);
    }

    for (const cookie of [monaCookie, theoCookie]) {
      expect(await refused(post('/payroll/bonus-tiers', cookie, tiers(R1)))).toMatchObject({
        code: 'payroll_forbidden',
      });
      expect(await refused(post('/payroll/collective-goals', cookie, goal(R1)))).toMatchObject({
        code: 'payroll_forbidden',
      });
      const put = await team.call('PUT', '/payroll/settings', cookie, { minimumPayoutMinor: 0 });
      expect(team.refusal(put).code).toBe('payroll_forbidden');
    }
    expect(await team.test.admin.db.select().from(schema.bonusTierSets)).toEqual([]);
    expect(await team.test.admin.db.select().from(schema.collectiveGoals)).toEqual([]);
    expect(await team.test.admin.db.select().from(schema.payrollSettings)).toEqual([]);
  });

  it('sets tiers from an open period, gives a retry back, and refuses the same id with other tiers', async () => {
    await team.report(theo, R1, 10_000);
    await team.report(lea, R1, 1_000);
    await team.recalculate(R1);
    expect((await team.statementOf(theo, R1)).tierBonus).toBeNull();
    await team.forgetJobs(R1);

    const sent = tiers(R1);
    const created = await post('/payroll/bonus-tiers', team.owner, sent);
    expect(created.statusCode, created.body).toBe(201);
    const set = BonusTierSetSchema.parse(created.json());
    expect(set).toMatchObject({ id: sent.id, fromPeriod: R1, tiers: [BRONZE], createdBy: team.ownerId });
    expect(await team.jobsFor(R1)).toEqual([{ period: R1 }]);
    expect(await team.audited('bonus_tier_set.create')).toBe(1);

    // The same tiers, their keys in another order: a retry, given back as recorded.
    const retried = await post('/payroll/bonus-tiers', team.owner, {
      tiers: [{ label: 'Bronze', bonusMinor: 3_000, thresholdMinor: 5_000 }],
      fromPeriod: R1,
      id: sent.id,
    });
    expect([retried.statusCode, retried.json()]).toEqual([200, created.json()]);
    for (const other of [
      { ...sent, tiers: [{ ...BRONZE, bonusMinor: 3_001 }] },
      { ...sent, tiers: [] },
      { ...sent, fromPeriod: R2 },
    ]) {
      expect(await refused(post('/payroll/bonus-tiers', team.owner, other))).toMatchObject({
        code: 'bonus_tier_set_conflict',
      });
    }
    expect(await team.audited('bonus_tier_set.create')).toBe(1);

    await team.recalculate(R1);
    const statement = await team.statementOf(theo, R1);
    expect(statement.tierBonus).toEqual(BRONZE);
    expect(statement.totalMinor).toBe(1_600 + 3_000);
    const view = PayrollPeriodSchema.parse(
      (await team.call('GET', `/payroll/periods/${R1}`, theoCookie)).json(),
    );
    expect(view.bonusTiers?.id).toBe(sent.id);
  });

  it('refuses tiers and a goal for a period some statement is validated for, or an earlier one', async () => {
    expect((await team.validate(team.owner, theo, R1)).statusCode).toBe(200);
    for (const period of [R1, R0]) {
      expect(await refused(post('/payroll/bonus-tiers', team.owner, tiers(period)))).toEqual(
        expect.objectContaining({ code: 'pay_period_closed_conflict', details: { period } }),
      );
      expect(await refused(post('/payroll/collective-goals', team.owner, goal(period)))).toEqual(
        expect.objectContaining({ code: 'pay_period_closed_conflict', details: { period } }),
      );
    }
    // Léa's statement of the period is still a draft: the team's rules of the period are settled all the same.
    expect((await team.statementOf(lea, R1)).status).toBe('draft');
    expect(await team.test.admin.db.select().from(schema.collectiveGoals)).toEqual([]);

    expect((await post('/payroll/bonus-tiers', team.owner, tiers(R2))).statusCode).toBe(201);
  });

  it('pays the goal to each chatter once its period has begun, sales or not, and waits for a goal ahead', async () => {
    await team.report(theo, R2, 10_000);
    await team.recalculate(R2);
    await team.forgetJobs(R2);
    const sent = goal(R2);
    const created = await post('/payroll/collective-goals', team.owner, sent);
    expect(created.statusCode, created.body).toBe(201);
    expect(CollectiveGoalSchema.parse(created.json())).toMatchObject({ period: R2, targetMinor: 10_000 });
    expect(await team.jobsFor(R2)).toEqual([{ period: R2 }]);
    expect(await team.audited('collective_goal.create')).toBe(1);
    const retried = await post('/payroll/collective-goals', team.owner, sent);
    expect([retried.statusCode, retried.json()]).toEqual([200, created.json()]);
    expect(
      await refused(post('/payroll/collective-goals', team.owner, { ...sent, targetMinor: 10_001 })),
    ).toMatchObject({ code: 'collective_goal_conflict' });

    await team.recalculate(R2);
    // The team made 8 000 of 10 000: the 50 % tier, for Théo and for Léa who sold nothing; never for Mona.
    expect((await team.statementOf(theo, R2)).collectiveBonusMinor).toBe(1_000);
    expect((await team.statementOf(lea, R2)).collectiveBonusMinor).toBe(1_000);
    await expect(team.statementOf(mona, R2)).rejects.toThrow('no statement');

    const ahead = nextPayPeriod(today());
    expect((await post('/payroll/collective-goals', team.owner, goal(ahead))).statusCode).toBe(201);
    expect(await team.jobsFor(ahead)).toEqual([]);
  });

  it('changes the minimum for every draft, a period closed for the team included, and writes nothing for the same', async () => {
    for (const period of [R1, R2]) await team.forgetJobs(period);
    // The minimum waits for a validation: the period's drafts are computed with one minimum, never half of each.
    const lock = await team.holding(['payroll.close']);
    let sent: ReturnType<typeof team.call> | undefined;
    try {
      sent = team.call('PUT', '/payroll/settings', team.owner, { minimumPayoutMinor: 50_000 });
      await team.until(async () => (await team.waiting()) === 1);
    } finally {
      await lock.release();
    }
    const put = await sent;
    expect([put.statusCode, put.json()]).toEqual([200, { minimumPayoutMinor: 50_000 }]);
    expect(await minimum(theoCookie)).toBe(50_000);
    expect(await team.audited('payroll_settings.update')).toBe(1);
    // Léa's draft of the first half of September counts the minimum too.
    expect(await team.jobsFor(R1)).toEqual([{ period: R1 }]);
    expect(await team.jobsFor(R2)).toEqual([{ period: R2 }]);

    await team.recalculate(R2);
    const statement = await team.statementOf(theo, R2);
    expect(statement.carryOverOutMinor).toBe(statement.totalMinor);
    expect(statement.payableMinor).toBe(0);

    for (const period of [R1, R2]) await team.forgetJobs(period);
    const same = await team.call('PUT', '/payroll/settings', team.owner, { minimumPayoutMinor: 50_000 });
    expect([same.statusCode, same.json()]).toEqual([200, { minimumPayoutMinor: 50_000 }]);
    expect(await team.audited('payroll_settings.update')).toBe(1);
    expect(await team.jobsFor(R2)).toEqual([]);
    const negative = await team.call('PUT', '/payroll/settings', team.owner, { minimumPayoutMinor: -1 });
    expect(negative.statusCode).toBe(400);

    const back = await team.call('PUT', '/payroll/settings', team.owner, { minimumPayoutMinor: 1_500 });
    expect(back.statusCode).toBe(200);
    expect(await team.audited('payroll_settings.update')).toBe(2);
    await team.recalculate(R2);
  });

  it('refuses the validation of a statement computed before new tiers, then validates it computed again', async () => {
    const stale = await team.statementOf(theo, R2);
    const raised = { ...BRONZE, bonusMinor: 4_000, label: 'Bronze renforcé' };
    expect((await post('/payroll/bonus-tiers', team.owner, tiers(R2, [raised]))).statusCode).toBe(201);
    expect(team.refusal(await team.validate(team.owner, theo, R2)).code).toBe(
      'commission_statement_changed_conflict',
    );
    expect((await team.statementOf(theo, R2)).revision).toBe(stale.revision);

    await team.recalculate(R2);
    expect((await team.validate(team.owner, theo, R2)).statusCode).toBe(200);
    expect((await team.statementOf(theo, R2)).tierBonus).toEqual(raised);
  });

  it('makes tiers wait for a validation, then refuses them', async () => {
    await team.report(theo, R3, 10_000);
    await team.recalculate(R3);
    const lock = await team.holding(['payroll.close']);
    const validating = team.validate(team.owner, theo, R3);
    let sent: ReturnType<typeof post> | undefined;
    try {
      await team.until(async () => (await team.waiting()) === 1);
      sent = post('/payroll/bonus-tiers', team.owner, tiers(R3));
      await team.until(async () => (await team.waiting()) === 2);
    } finally {
      await lock.release();
    }
    const [validated, refusal] = await Promise.all([validating, sent]);
    expect(validated.statusCode, validated.body).toBe(200);
    expect(team.refusal(refusal)).toEqual(
      expect.objectContaining({ code: 'pay_period_closed_conflict', details: { period: R3 } }),
    );
  });

  it('makes a validation wait for tiers, then refuses the statement it no longer matches', async () => {
    await team.report(theo, R4, 10_000);
    await team.recalculate(R4);
    const lock = await team.holding(['payroll.close']);
    const sent = post('/payroll/bonus-tiers', team.owner, tiers(R4, []));
    let validating: ReturnType<typeof post> | undefined;
    try {
      await team.until(async () => (await team.waiting()) === 1);
      validating = team.validate(team.owner, theo, R4);
      await team.until(async () => (await team.waiting()) === 2);
    } finally {
      await lock.release();
    }
    const [created, refusal] = await Promise.all([sent, validating]);
    expect(created.statusCode, created.body).toBe(201);
    expect(team.refusal(refusal).code).toBe('commission_statement_changed_conflict');
    expect(await team.closingOf(R4)).toBeUndefined();
  });
});
