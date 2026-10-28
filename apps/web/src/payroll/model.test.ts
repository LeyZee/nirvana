import {
  CommissionStatementIdSchema,
  newId,
  PayPeriodSchema,
  PenaltyIdSchema,
  PlatformAccountIdSchema,
  ShiftReportIdSchema,
  TeamMemberIdSchema,
  UserIdSchema,
  type CommissionStatement,
  type CommissionStatementLine,
  type PayPeriodSummary,
  type PayrollPeriod,
} from '@nirvana/contracts';
import { describe, expect, it } from 'vitest';

import {
  carryLine,
  changeBps,
  countsLine,
  flowOf,
  forecastNet,
  gaugePercent,
  goalSpanBps,
  lateNetOf,
  memberFacts,
  parsePaySearch,
  payRefusalText,
  periodAmount,
  periodToOpen,
  phaseChip,
  rateMissing,
  rateText,
  reachedBpsOf,
  salesSplit,
  signedPercentText,
  statementChips,
  statementsCsv,
  stopsThePeriod,
  summaryOf,
  tierAt,
  totalsOf,
  validatable,
  whoName,
} from './model';

const NBSP = '\u00a0';
const NNBSP = '\u202f';
const plain = (text: string): string => text.replaceAll(NBSP, ' ').replaceAll(NNBSP, ' ');

const PERIOD = PayPeriodSchema.parse('2026-11-01');
const WINDOW = {
  period: PERIOD,
  startsAt: '2026-10-31T23:00:00.000Z',
  endsAt: '2026-11-15T23:00:00.000Z',
  timeZone: 'Europe/Paris',
};
const ACCOUNT = newId(PlatformAccountIdSchema);

const line = (patch: Partial<CommissionStatementLine> = {}): CommissionStatementLine => ({
  platformAccountId: ACCOUNT,
  currency: 'EUR',
  vatBps: 2_000,
  platformFeeBps: 1_500,
  rateMicros: 1_000_000,
  grossMinor: 12_000,
  grossEurMinor: 12_000,
  exclVatMinor: 10_000,
  netMinor: 8_500,
  commissionMinor: 2_125,
  shiftReportIds: [newId(ShiftReportIdSchema), newId(ShiftReportIdSchema)],
  lateReports: [],
  ...patch,
});

const statement = (patch: Partial<CommissionStatement> = {}): CommissionStatement => ({
  id: newId(CommissionStatementIdSchema),
  memberId: newId(TeamMemberIdSchema),
  window: WINDOW,
  status: 'draft',
  revision: 1,
  engineVersion: 'nirvana-1',
  inputsHash: 'a'.repeat(64),
  lines: [line()],
  netMinor: 8_500,
  commissionMinor: 2_125,
  teamShare: null,
  tierBonus: null,
  collectiveBonusMinor: 0,
  bonuses: [],
  penalties: [],
  carryOversIn: [],
  adjustments: [],
  bonusesMinor: 0,
  penaltiesRequestedMinor: 0,
  penaltiesMinor: 0,
  carryOversInMinor: 0,
  adjustmentsMinor: 0,
  totalMinor: 2_125,
  carryOverOutMinor: 0,
  payableMinor: 2_125,
  team: null,
  rules: {
    commissionRateBps: 2_500,
    teamShareBps: null,
    bonusTiers: [],
    collectiveGoal: null,
    minimumPayoutMinor: 1_500,
    exchangeRates: [],
    final: false,
  },
  canValidate: true,
  computedAt: '2026-11-02T09:07:00.000Z',
  validatedAt: null,
  validatedBy: null,
  paidAt: null,
  paidBy: null,
  payment: null,
  ...patch,
});

const summary = (
  patch: Partial<Omit<PayPeriodSummary, 'window'>> = {},
): Omit<PayPeriodSummary, 'window'> => ({
  ended: true,
  closedAt: null,
  closedBy: null,
  statements: { draft: 0, validated: 0, paid: 0, carried: 0 },
  netMinor: 100_000,
  payableMinor: 30_000,
  paidMinor: 0,
  ...patch,
});

describe('the forecast of a period', () => {
  const day = (n: number, hours = 0) =>
    new Date(new Date(WINDOW.startsAt).getTime() + (n * 24 + hours) * 3_600_000);

  it('says nothing before a first full day, then follows the pace of the time gone by', () => {
    expect(forecastNet(5_000, 0, WINDOW, day(0, 20))).toBeNull();
    // Five days of fifteen gone: three times what is made.
    expect(forecastNet(100_000, 0, WINDOW, day(5))).toBe(300_000);
  });

  it('forecasts nothing for an empty period', () => {
    expect(forecastNet(0, 0, WINDOW, day(7))).toBe(0);
  });

  it('is the net itself once the period has ended', () => {
    expect(forecastNet(123_456, 20_000, WINDOW, day(15))).toBe(123_456);
    expect(forecastNet(123_456, 0, WINDOW, day(20))).toBe(123_456);
  });

  it('counts a report validated late once, never as pace', () => {
    // 100 € of the period's own after five days, and 30 € that came from an earlier, closed period.
    expect(forecastNet(13_000, 3_000, WINDOW, day(5))).toBe(33_000);
  });

  it('reads the late share of each line from its gross, onto its net', () => {
    const late = line({
      grossMinor: 10_000,
      netMinor: 8_000,
      lateReports: [
        {
          shiftReportId: newId(ShiftReportIdSchema),
          period: PayPeriodSchema.parse('2026-10-16'),
          grossMinor: 2_500,
        },
      ],
    });
    expect(lateNetOf([statement({ lines: [late, line()] })])).toBe(2_000);
    expect(lateNetOf([])).toBe(0);
  });
});

describe('a statement’s marks', () => {
  it('says its stage, and a carry-over as the one amber mark', () => {
    expect(statementChips(statement(), false)).toEqual([{ label: 'En cours', tone: 'neutral' }]);
    expect(statementChips(statement(), true)).toEqual([{ label: 'Brouillon', tone: 'neutral' }]);
    expect(statementChips(statement({ carryOverOutMinor: 1_200 }), true)).toEqual([
      { label: 'Reporté', tone: 'warn' },
    ]);
    expect(statementChips(statement({ status: 'validated', carryOverOutMinor: 1_200 }), true)).toEqual([
      { label: 'Validé', tone: 'ok' },
      { label: 'Reporté', tone: 'warn' },
    ]);
    expect(statementChips(statement({ status: 'paid' }), true)).toEqual([{ label: 'Payé', tone: 'ok' }]);
  });
});

describe('a period in the list', () => {
  it('shows where it is, and one amount: what is paid or what is left to pay', () => {
    const running = summary({ ended: false, statements: { draft: 4, validated: 0, paid: 0, carried: 0 } });
    expect([phaseChip(running).label, periodAmount(running)]).toEqual([
      'En cours',
      { minor: 30_000, what: 'à verser à ce jour' },
    ]);
    const ended = summary({ statements: { draft: 4, validated: 0, paid: 0, carried: 1 } });
    expect(phaseChip(ended)).toEqual({ label: 'Finie : à valider', tone: 'wait' });
    const closed = summary({
      closedAt: '2026-11-02T09:41:00.000Z',
      statements: { draft: 1, validated: 2, paid: 1, carried: 1 },
      paidMinor: 10_000,
    });
    expect([phaseChip(closed).label, periodAmount(closed)]).toEqual([
      'Close : à valider',
      { minor: 20_000, what: 'à verser' },
    ]);
    const paid = summary({ statements: { draft: 0, validated: 1, paid: 3, carried: 1 }, paidMinor: 30_000 });
    expect([phaseChip(paid), periodAmount(paid)]).toEqual([
      { label: 'Payée', tone: 'ok' },
      { minor: 30_000, what: 'versé' },
    ]);
    expect(countsLine(paid.statements)).toBe('3 payés, 1 validé · 1 reporté');
  });

  it('sums a period read whole as the list does', () => {
    const period: PayrollPeriod = {
      period: PERIOD,
      window: WINDOW,
      ended: true,
      closing: null,
      statements: [
        statement({
          status: 'paid',
          payment: { paidOn: '2026-11-02', method: 'wise', reference: null, sentMinor: 2_125 },
        }),
        statement({ carryOverOutMinor: 900, payableMinor: 0 }),
      ],
      bonusTiers: null,
      collectiveGoal: null,
      settings: { minimumPayoutMinor: 1_500 },
    };
    expect(summaryOf(period)).toMatchObject({
      statements: { draft: 1, validated: 0, paid: 1, carried: 1 },
      netMinor: 17_000,
      payableMinor: 2_125,
      paidMinor: 2_125,
    });
  });
});

describe('the money of a statement', () => {
  it('runs from the sales to the commission, through the euros for a dollar account', () => {
    const dollars = line({
      currency: 'USD',
      vatBps: 0,
      platformFeeBps: 2_000,
      rateMicros: 921_659,
      grossMinor: 20_000,
      grossEurMinor: 18_433,
      exclVatMinor: 18_433,
      netMinor: 14_746,
      commissionMinor: 3_687,
    });
    expect(
      flowOf(dollars, 2_500, 'onlyfans', true).map((step) =>
        plain(`${step.label} | ${step.op} | ${step.amount}`),
      ),
    ).toEqual([
      'Ventes | 2 rapports | 200,00 $US',
      'En euros | 1 $ = 0,9217 € | 184,33 €',
      'Hors TVA | sans TVA | 184,33 €',
      'Net d’OnlyFans | OnlyFans 20 % | 147,46 €',
      'Ta commission | 25 % | 36,87 €',
    ]);
  });

  it('adds up to what is paid, a carry-over said before it, a capped penalty with what it asked', () => {
    const carried = statement({
      penalties: [
        {
          id: newId(PenaltyIdSchema),
          memberId: newId(TeamMemberIdSchema),
          fromPeriod: PERIOD,
          toPeriod: PERIOD,
          amount: { kind: 'fixed', amountMinor: 3_000 },
          reason: 'Retard.',
          createdBy: null,
          createdAt: '2026-11-03T10:00:00.000Z',
          cancellation: null,
        },
      ],
      penaltiesRequestedMinor: 3_000,
      penaltiesMinor: 2_125,
      totalMinor: 0,
      carryOverOutMinor: 0,
      payableMinor: 0,
    });
    expect(
      totalsOf(carried, true).map((row) => plain(`${row.label} | ${row.note ?? ''} | ${row.amount}`)),
    ).toEqual([
      'Commission |  | 21,25 €',
      'Malus | « Retard. » · 30,00 € demandés, plafonnés à ta part plus tes primes | −21,25 €',
      'Ce que tu touches |  | 0,00 €',
    ]);

    const under = statement({
      status: 'validated',
      totalMinor: 1_200,
      carryOverOutMinor: 1_200,
      payableMinor: 0,
    });
    expect(
      totalsOf(under, false).map((row) => plain(`${row.label} | ${row.note ?? ''} | ${row.kind}`)),
    ).toEqual([
      'Commission |  | line',
      'Total |  | total',
      'Reporté sur la quinzaine suivante | sous le minimum de versement de 15,00 € | carry',
      'À verser |  | pay',
    ]);
    expect(totalsOf(statement({ status: 'paid' }), true).at(-1)?.label).toBe('Ce que tu as touché');
  });
});

describe('words', () => {
  it('signs a percentage and a rate as French writes them', () => {
    expect(plain(signedPercentText(1_200))).toBe('+12 %');
    expect(plain(signedPercentText(-1_000))).toBe('−10 %');
    expect(plain(rateText(920_000, 'USD'))).toBe('1 $ = 0,9200 €');
    expect([changeBps(112, 100), changeBps(90, 100), changeBps(5, 0), changeBps(5, null)]).toEqual([
      1_200,
      -1_000,
      null,
      null,
    ]);
  });

  it('names who did something: oneself, a member, or else the owner', () => {
    const me = { id: newId(UserIdSchema), name: 'Charles' };
    const iris = { userId: newId(UserIdSchema), displayName: 'Iris' };
    expect(whoName(me.id, me, [iris])).toBe('Charles');
    expect(whoName(iris.userId, me, [iris])).toBe('Iris');
    expect(whoName(newId(UserIdSchema), me, [])).toBe('le propriétaire');
  });

  it('says each refusal with what it carries', () => {
    const names = { memberName: () => 'Basile' };
    expect(
      payRefusalText(
        { kind: 'refused', code: 'pay_period_order_conflict', details: { period: '2026-10-16' } },
        names,
      ),
    ).toBe('Valide d’abord la quinzaine du 16 au 31 octobre.');
    const theirs = { ...names, statement: { memberId: newId(TeamMemberIdSchema), window: WINDOW } };
    expect(
      payRefusalText(
        { kind: 'refused', code: 'commission_statement_order_conflict', details: { period: '2026-10-16' } },
        theirs,
      ),
    ).toBe('Valide d’abord le relevé de Basile du 16 au 31 octobre.');
    expect(
      payRefusalText({ kind: 'refused', code: 'commission_statement_open_conflict', details: {} }, theirs),
    ).toBe('La quinzaine n’est pas finie : elle se valide à partir du lundi 16 novembre.');
    expect(
      plain(
        payRefusalText(
          { kind: 'refused', code: 'payment_amount_unprocessable', details: { payableMinor: 28_840 } },
          names,
        ),
      ),
    ).toBe('Le montant envoyé doit être celui à verser : 288,40 €.');
    expect(
      payRefusalText(
        { kind: 'refused', code: 'commission_rate_missing_conflict', details: { memberId: 'x' } },
        names,
      ),
    ).toBe('Basile n’a pas de taux de commission en vigueur.');
    expect(
      payRefusalText(
        { kind: 'refused', code: 'pay_period_reports_pending_conflict', details: { count: 2 } },
        names,
      ),
    ).toBe('2 rapports de la quinzaine attendent leur relecture.');
    expect(payRefusalText({ kind: 'failed' }, names)).toBe(
      'Le serveur ne répond pas : rien n’a été enregistré.',
    );
  });
});

describe('the export of a period', () => {
  it('writes each account and each statement’s total, decimals with a comma, quoted where needed', () => {
    const period: PayrollPeriod = {
      period: PERIOD,
      window: WINDOW,
      ended: true,
      closing: null,
      statements: [statement()],
      bonusTiers: null,
      collectiveGoal: null,
      settings: { minimumPayoutMinor: 1_500 },
    };
    const csv = statementsCsv(
      period,
      () => 'Théo',
      () => 'Nora Vidal; @nora',
    );
    const [head, account, total] = csv.trimEnd().split('\r\n');
    expect(head?.split(';').slice(0, 3)).toEqual(['Membre', 'Compte', 'Devise']);
    expect(account).toBe('Théo;"Nora Vidal; @nora";EUR;120,00;120,00;100,00;85,00;21,25;;;;;;;;');
    expect(total).toBe(
      'Théo;Total du relevé;EUR;;;;85,00;21,25;0,00;0,00;0,00;0,00;21,25;0,00;21,25;Brouillon',
    );
  });
});

describe('what Quinzaine opens on, and what it lets validate', () => {
  const at = (period: string, ended: boolean, draft: number, payableMinor = 0) => ({
    window: { ...WINDOW, period: PayPeriodSchema.parse(period) },
    ended,
    statements: { draft, validated: 0, paid: 0, carried: 0 },
    payableMinor,
    paidMinor: 0,
  });

  it('opens the oldest ended period with something left to do, else the one under way', () => {
    const current = PayPeriodSchema.parse('2026-11-16');
    const list = [at('2026-11-16', false, 3), at('2026-11-01', true, 2), at('2026-10-16', true, 1)];
    expect(periodToOpen(list, current, false)).toBe('2026-10-16');
    expect(periodToOpen([at('2026-11-16', false, 3), at('2026-11-01', true, 0)], current, true)).toBe(
      current,
    );
    // Validated, money still to send: the owner's to do, not a manager's.
    const unpaid = [at('2026-11-16', false, 3), at('2026-11-01', true, 0, 30_000)];
    expect(periodToOpen(unpaid, current, true)).toBe('2026-11-01');
    expect(periodToOpen(unpaid, current, false)).toBe(current);
    expect(parsePaySearch({ quinzaine: '2026-10-16', autre: 1 })).toEqual({ quinzaine: '2026-10-16' });
    expect(parsePaySearch({ quinzaine: '2026-10-17' })).toEqual({});
  });

  it('lets the reader validate the drafts of an ended period that are not theirs', () => {
    const mine = statement({ canValidate: false });
    const theirs = statement();
    const done = statement({ status: 'validated', canValidate: false });
    expect(validatable({ ended: true, statements: [mine, theirs, done] })).toEqual([theirs]);
    expect(validatable({ ended: false, statements: [theirs] })).toEqual([]);
  });

  it('stops a batch on a refusal of the whole period, or a server that does not answer', () => {
    expect(stopsThePeriod({ kind: 'failed' })).toBe(true);
    expect(
      stopsThePeriod({ kind: 'refused', code: 'pay_period_reports_pending_conflict', details: {} }),
    ).toBe(true);
    expect(
      stopsThePeriod({ kind: 'refused', code: 'commission_statement_changed_conflict', details: {} }),
    ).toBe(false);
    expect(stopsThePeriod({ kind: 'refused', code: 'commission_rate_missing_conflict', details: {} })).toBe(
      false,
    );
  });
});

describe('the dollar’s rate before a closing', () => {
  const OCT2 = PayPeriodSchema.parse('2026-10-16');
  const rate = (day: string) => ({
    currency: 'USD' as const,
    day,
    rateMicros: 920_000,
    source: 'BCE, taux de référence',
    fetchedAt: `${day}T15:05:00.000Z`,
  });
  const period = (
    rates: readonly ReturnType<typeof rate>[],
    patch: Partial<PayrollPeriod> = {},
  ): PayrollPeriod => ({
    period: OCT2,
    window: { ...WINDOW, period: OCT2 },
    ended: true,
    closing: null,
    statements: [
      statement({
        lines: [line({ currency: 'USD' })],
        rules: { ...statement().rules, exchangeRates: [...rates] },
      }),
    ],
    bonusTiers: null,
    collectiveGoal: null,
    settings: { minimumPayoutMinor: 1_500 },
    ...patch,
  });

  it('is missing when no rate of the last day or the four before is known', () => {
    expect(rateMissing(period([rate('2026-10-30')]), null)).toBe(false);
    expect(rateMissing(period([rate('2026-10-27')]), null)).toBe(false);
    expect(rateMissing(period([rate('2026-10-26')]), null)).toBe(true);
    expect(rateMissing(period([]), null)).toBe(true);
    // The latest the job read counts when it is of the period; one read after its end tells nothing of it.
    expect(rateMissing(period([rate('2026-10-20')]), rate('2026-10-30'))).toBe(false);
    expect(rateMissing(period([rate('2026-10-20')]), rate('2026-11-02'))).toBe(true);
  });

  it('is never missing for a period in euros, one under way, or one already closed', () => {
    const euros = period([]);
    expect(rateMissing({ ...euros, statements: [statement()] }, null)).toBe(false);
    expect(rateMissing(period([], { ended: false }), null)).toBe(false);
    expect(
      rateMissing(
        period([], {
          closing: {
            period: OCT2,
            exchangeRates: null,
            closedBy: null,
            closedAt: '2026-11-02T09:41:00.000Z',
          },
        }),
        null,
      ),
    ).toBe(false);
  });
});

describe('a member’s row', () => {
  it('says the rate or the team share, the tier and the penalty, signed', () => {
    expect(
      memberFacts(
        statement({
          tierBonus: { thresholdMinor: 100_000, bonusMinor: 5_000, label: 'Or' },
          penaltiesMinor: 1_500,
        }),
      ).map(plain),
    ).toEqual(['commission 25 %', 'palier Or', 'malus −15,00 €']);
    expect(
      memberFacts(statement({ teamShare: { baseNetMinor: 100_000, bps: 1_000, amountMinor: 10_000 } })).map(
        plain,
      ),
    ).toEqual(['part d’équipe 10 %']);
  });

  it('says a carry-over in one sentence, under the minimum or under zero', () => {
    expect(carryLine(statement())).toBeNull();
    expect(
      plain(carryLine(statement({ totalMinor: 1_200, carryOverOutMinor: 1_200, payableMinor: 0 })) ?? ''),
    ).toBe('Sous le minimum de 15,00 € : 12,00 € reportés sur la quinzaine suivante.');
    expect(
      plain(carryLine(statement({ totalMinor: -800, carryOverOutMinor: -800, payableMinor: 0 })) ?? ''),
    ).toBe('Total sous zéro : −8,00 € reportés sur la quinzaine suivante.');
  });
});

describe('the figures of a period', () => {
  it('splits the net by creator, the largest first, in shares that add up', () => {
    const other = newId(PlatformAccountIdSchema);
    const split = salesSplit(
      [statement({ lines: [line(), line({ platformAccountId: other, netMinor: 25_500 })] })],
      (one) => (one.platformAccountId === other ? 'Léa' : 'Nora'),
    );
    expect(split).toEqual([
      { name: 'Léa', minor: 25_500, bps: 7_500 },
      { name: 'Nora', minor: 8_500, bps: 2_500 },
    ]);
    expect(salesSplit([], () => 'Nora')).toEqual([]);
  });

  it('places the goal: reached share floored, the tier reached, a gauge past the last tier', () => {
    const tiers = [
      { reachedBps: 8_000, bonusMinor: 1_000 },
      { reachedBps: 10_000, bonusMinor: 2_500 },
    ];
    expect(reachedBpsOf(99_999, 100_000)).toBe(9_999);
    expect(tierAt(tiers, 9_999)).toEqual(tiers[0]);
    expect(tierAt(tiers, 7_999)).toBeNull();
    expect(goalSpanBps({ tiers })).toBe(13_000);
    expect(goalSpanBps({ tiers: [{ reachedBps: 15_000, bonusMinor: 1 }] })).toBe(17_000);
    expect([gaugePercent(6_500, 13_000), gaugePercent(20_000, 13_000), gaugePercent(-5, 13_000)]).toEqual([
      50, 100, 0,
    ]);
  });
});
