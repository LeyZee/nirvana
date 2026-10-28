import {
  CommissionStatementLineSchema,
  CommissionStatementSchema,
  PayrollPeriodSchema,
  TeamMemberSchema,
  type CommissionStatement,
  type CommissionStatementLine,
  type Me,
  type PayPeriodSummary,
  type PayrollPeriod,
  type TeamMember,
} from '@nirvana/contracts';

/*
 * Pay's fakes, shared by Paie's and Commissions' tests (EQ-05): an invented team (ADR 0010) — Théo, Basile and Lou
 * chat, Iris manages — on Nora Vidal's Reveal account in euros and Léa's OnlyFans account in dollars. Each fake is
 * parsed with its contract, so a test never feeds a screen what the server could not send.
 */

export const payId = (n: number): string => `0199f2a0-0000-7000-8000-${String(n).padStart(12, '0')}`;

export const OWNER_USER = payId(1);

const me = { email: 'compte@example.test', creatorIds: [], routedCreatorIds: [] };
export const OWNER: Me = {
  ...me,
  id: OWNER_USER,
  name: 'Charles',
  role: 'owner',
  team: null,
  teamScope: 'owner',
};
export const IRIS_ME: Me = {
  ...me,
  id: payId(34),
  name: 'Iris',
  role: 'operator',
  team: { role: 'manager', status: 'active' },
  teamScope: 'agency',
};
export const THEO_ME: Me = {
  ...me,
  id: payId(31),
  name: 'Théo',
  role: 'operator',
  team: { role: 'chatter', status: 'active' },
  teamScope: 'self',
};

function member(n: number, displayName: string, teamRole: 'chatter' | 'manager', color: string): TeamMember {
  return TeamMemberSchema.parse({
    id: payId(20 + n),
    userId: payId(30 + n),
    email: `membre${String(n)}@example.test`,
    firstName: displayName,
    lastName: 'Exemple',
    displayName,
    teamRole,
    status: 'active',
    country: 'FR',
    timeZone: 'Europe/Paris',
    color,
    joinedOn: '2026-09-01',
    creatorIds: [payId(2)],
    commission: null,
    invitationPending: false,
    invitationExpiresAt: null,
  });
}

export const THEO = member(1, 'Théo', 'chatter', '#5b8def');
export const BASILE = member(2, 'Basile', 'chatter', '#e0a142');
export const LOU = member(3, 'Lou', 'chatter', '#8bc34a');
export const IRIS = member(4, 'Iris', 'manager', '#c86dd7');
export const MEMBERS = [THEO, BASILE, LOU, IRIS];

export const NORA_REVEAL = {
  id: payId(11),
  creatorId: payId(2),
  creatorName: 'Nora Vidal',
  platform: 'reveal',
  handle: 'nora',
} as const;
export const LEA_ONLYFANS = {
  id: payId(12),
  creatorId: payId(3),
  creatorName: 'Léa',
  platform: 'onlyfans',
  handle: 'lea',
} as const;

/** The pay rules' list as `/v1/team/pay-rules` gives it: the accounts, no rules needed by pay's screens. */
export const PAY_RULES = {
  currentPeriod: '2026-11-01',
  accounts: [
    { account: NORA_REVEAL, rules: [] },
    { account: LEA_ONLYFANS, rules: [] },
  ],
};

export const OCT1 = '2026-10-01';
export const OCT2 = '2026-10-16';
export const NOV1 = '2026-11-01';

const WINDOWS: Readonly<Record<string, { startsAt: string; endsAt: string }>> = {
  [OCT1]: { startsAt: '2026-09-30T22:00:00.000Z', endsAt: '2026-10-15T22:00:00.000Z' },
  [OCT2]: { startsAt: '2026-10-15T22:00:00.000Z', endsAt: '2026-10-31T23:00:00.000Z' },
  [NOV1]: { startsAt: '2026-10-31T23:00:00.000Z', endsAt: '2026-11-15T23:00:00.000Z' },
};

const windowOf = (period: string): { period: string; startsAt: string; endsAt: string; timeZone: string } => {
  const bounds = WINDOWS[period];
  if (bounds === undefined) throw new Error(`No window for ${period}`);
  return { period, ...bounds, timeZone: 'Europe/Paris' };
};

/** An account's line in euros on Nora's Reveal: 120 € of sales, 20 % VAT, 15 % fee, 25 % commission. */
export function euroLine(
  patch: Partial<Record<keyof CommissionStatementLine, unknown>> = {},
): CommissionStatementLine {
  return CommissionStatementLineSchema.parse({
    platformAccountId: NORA_REVEAL.id,
    currency: 'EUR',
    vatBps: 2_000,
    platformFeeBps: 1_500,
    rateMicros: 1_000_000,
    grossMinor: 12_000,
    grossEurMinor: 12_000,
    exclVatMinor: 10_000,
    netMinor: 8_500,
    commissionMinor: 2_125,
    shiftReportIds: [payId(301), payId(302)],
    lateReports: [],
    ...patch,
  });
}

/** A draft of `whose` for `period`, one euro line, nothing else: `patch` says the rest. */
export function statementOf(
  whose: TeamMember,
  period: string,
  patch: Partial<Record<keyof CommissionStatement, unknown>> = {},
): CommissionStatement {
  return CommissionStatementSchema.parse({
    id: payId(400 + (Number(whose.id.slice(-2)) - 20) * 10 + [OCT1, OCT2, NOV1].indexOf(period)),
    memberId: whose.id,
    window: windowOf(period),
    status: 'draft',
    revision: 3,
    engineVersion: 'nirvana-1',
    inputsHash: '3f9c'.padEnd(60, '0') + 'a41e',
    lines: [euroLine()],
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
}

/** A period as `/v1/payroll/periods/:period` gives it. */
export function periodOf(
  period: string,
  statements: readonly CommissionStatement[],
  patch: Partial<Record<keyof PayrollPeriod, unknown>> = {},
): PayrollPeriod {
  return PayrollPeriodSchema.parse({
    period,
    window: windowOf(period),
    ended: period !== NOV1,
    closing: null,
    statements,
    bonusTiers: null,
    collectiveGoal: null,
    settings: { minimumPayoutMinor: 1_500 },
    ...patch,
  });
}

/** A line of `/v1/payroll/periods`, summed from the period as the server sums it. */
export function summaryFor(period: PayrollPeriod): PayPeriodSummary {
  const count = (status: string) => period.statements.filter((one) => one.status === status).length;
  const sum = (pick: (one: CommissionStatement) => number) =>
    period.statements.reduce((total, one) => total + pick(one), 0);
  if (period.window === null) throw new Error(`${period.period} has no window`);
  return {
    window: period.window,
    ended: period.ended,
    closedAt: period.closing?.closedAt ?? null,
    closedBy: period.closing?.closedBy ?? null,
    statements: {
      draft: count('draft'),
      validated: count('validated'),
      paid: count('paid'),
      carried: period.statements.filter((one) => one.carryOverOutMinor !== 0).length,
    },
    netMinor: sum((one) => one.netMinor),
    payableMinor: sum((one) => one.payableMinor),
    paidMinor: sum((one) => one.payment?.sentMinor ?? 0),
  };
}

export const SCHEDULING_SETTINGS = {
  timeZone: 'Europe/Paris',
  slotStartMinute: 0,
  slotLengthMinutes: 360,
  accessMarginMinutes: 15,
};
