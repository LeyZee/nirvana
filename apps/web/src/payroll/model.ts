import {
  PAY_TARGET_MAX_MINOR,
  payPeriodLastDay,
  payPeriodOfDay,
  PayPeriodSchema,
  penaltyApplies,
  type BonusTier,
  type CollectiveGoal,
  type CollectiveTier,
  type CommissionStatement,
  type CommissionStatementLine,
  type Currency,
  type ExchangeRate,
  type PaymentMethod,
  type PayPeriod,
  type PayPeriodSummary,
  type PayPeriodWindow,
  type PayrollEntries,
  type PayrollPeriod,
  type Platform,
  type TeamMember,
} from '@nirvana/contracts';

import type { PayRefusal, PayRefusalCode } from './api';

import {
  amountText,
  followingPeriod,
  parseAmount,
  percentText,
  periodLine,
  signedAmountText,
} from '@/reports/model';
import { platformName } from '@/scheduling/model';
import { clockAt, dayMonth, dayOf, daysFrom, longDay } from '@/scheduling/time';

/**
 * Pay without React (EQ-05): what a statement and a period say, how the money runs from the sales to what is paid,
 * the forecast of a period, and what each refusal of the server means. The server computes; this only says it.
 */

const NBSP = '\u00a0';
const DAY_MS = 86_400_000;

/** How a statement was paid, in the screens' words (a closed list, `PAYMENT_METHODS`). */
export const PAYMENT_METHOD_LABELS: Readonly<Record<PaymentMethod, string>> = {
  bank_transfer: 'Virement',
  wise: 'Wise',
  paypal: 'PayPal',
  other: 'Autre',
};

/** A rate in basis points with its sign always said, attached: « +12 % », « −10 % ». */
export const signedPercentText = (bps: number): string =>
  `${bps > 0 ? '+' : bps < 0 ? '−' : ''}${percentText(Math.abs(bps))}`;

const RATE = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const CURRENCY_UNITS: Readonly<Record<Currency, string>> = { EUR: '€', USD: '$' };

/** The euros one unit of `currency` was worth: « 1 $ = 0,9217 € ». */
export const rateText = (rateMicros: number, currency: Currency): string =>
  `1${NBSP}${CURRENCY_UNITS[currency]} = ${RATE.format(rateMicros / 1_000_000)}${NBSP}€`;

/** The change from `before` to `now`, in basis points; `null` when there is nothing to compare with. */
export function changeBps(now: number, before: number | null): number | null {
  if (before === null || before <= 0) return null;
  return Math.round(((now - before) * 10_000) / before);
}

/** A statement's marks: what stage it is at, and a carry-over, the one amber mark. */
export type PayTone = 'neutral' | 'wait' | 'ok' | 'warn';
export interface PayChip {
  readonly label: string;
  readonly tone: PayTone;
}

export function statementChips(statement: CommissionStatement, ended: boolean): PayChip[] {
  const carried: PayChip[] = statement.carryOverOutMinor === 0 ? [] : [{ label: 'Reporté', tone: 'warn' }];
  if (!ended) return [{ label: 'En cours', tone: 'neutral' }];
  if (statement.status === 'paid') return [{ label: 'Payé', tone: 'ok' }];
  if (statement.status === 'validated') return [{ label: 'Validé', tone: 'ok' }, ...carried];
  return carried.length === 0 ? [{ label: 'Brouillon', tone: 'neutral' }] : carried;
}

/** A period as the list of periods sums it, read from the period itself. */
export function summaryOf(period: PayrollPeriod): Omit<PayPeriodSummary, 'window'> {
  const count = (keep: (statement: CommissionStatement) => boolean): number =>
    period.statements.filter(keep).length;
  const sum = (pick: (statement: CommissionStatement) => number): number =>
    period.statements.reduce((total, statement) => total + pick(statement), 0);
  return {
    ended: period.ended,
    closedAt: period.closing?.closedAt ?? null,
    closedBy: period.closing?.closedBy ?? null,
    statements: {
      draft: count((one) => one.status === 'draft'),
      validated: count((one) => one.status === 'validated'),
      paid: count((one) => one.status === 'paid'),
      carried: count((one) => one.carryOverOutMinor !== 0),
    },
    netMinor: sum((one) => one.netMinor),
    payableMinor: sum((one) => one.payableMinor),
    paidMinor: sum((one) => one.payment?.sentMinor ?? 0),
  };
}

/** Where a period is: running, to validate, validated with money still to send, or paid. */
export type PeriodPhase = 'running' | 'to_validate' | 'to_pay' | 'paid';

export function phaseOf(summary: Omit<PayPeriodSummary, 'window'>): PeriodPhase {
  if (!summary.ended) return 'running';
  if (summary.statements.draft > 0) return 'to_validate';
  return summary.payableMinor > summary.paidMinor ? 'to_pay' : 'paid';
}

export function phaseChip(summary: Omit<PayPeriodSummary, 'window'>): PayChip {
  switch (phaseOf(summary)) {
    case 'running':
      return { label: 'En cours', tone: 'neutral' };
    case 'to_validate':
      return { label: summary.closedAt === null ? 'Finie : à valider' : 'Close : à valider', tone: 'wait' };
    case 'to_pay':
      return { label: 'Close : à verser', tone: 'wait' };
    case 'paid':
      return { label: 'Payée', tone: 'ok' };
  }
}

/** The one amount a period shows in the list: what is paid, or what is left to pay. */
export function periodAmount(summary: Omit<PayPeriodSummary, 'window'>): { minor: number; what: string } {
  switch (phaseOf(summary)) {
    case 'running':
      return { minor: summary.payableMinor, what: 'à verser à ce jour' };
    case 'to_validate':
    case 'to_pay':
      return { minor: summary.payableMinor - summary.paidMinor, what: 'à verser' };
    case 'paid':
      return { minor: summary.paidMinor, what: 'versé' };
  }
}

const plural = (count: number, one: string, many: string): string =>
  `${String(count)} ${count > 1 ? many : one}`;

/** « 3 payés, 1 validé · 1 reporté »: a period's statements, counted. */
export function countsLine(statements: PayPeriodSummary['statements']): string {
  const parts = [
    statements.paid > 0 ? plural(statements.paid, 'payé', 'payés') : null,
    statements.validated > 0 ? plural(statements.validated, 'validé', 'validés') : null,
    statements.draft > 0 ? `${String(statements.draft)} à valider` : null,
  ].filter((part) => part !== null);
  const carried = statements.carried > 0 ? ` · ${plural(statements.carried, 'reporté', 'reportés')}` : '';
  return `${parts.join(', ')}${carried}`;
}

/** The day a period's validation opens: its end, the first day of the next one, in the agency's zone. */
export const opensOn = (window: PayPeriodWindow): string => dayOf(window.endsAt, window.timeZone);

/** « lun. 2 nov. », the day of an instant in the agency's zone, short. */
export const dayAt = (instant: string, timeZone: string): string => dayMonth(dayOf(instant, timeZone));

/** « lundi 2 novembre à 10 h 41 ». */
export const momentAt = (instant: string, timeZone: string): string =>
  `${longDay(dayOf(instant, timeZone))} à ${clockAt(instant, timeZone)}`;

/** Who did something on pay, by account: oneself, a member of the team, or else the owner, the one account out of it. */
export function whoName(
  userId: string,
  me: { readonly id: string; readonly name: string },
  members: readonly Pick<TeamMember, 'userId' | 'displayName'>[],
): string {
  if (userId === me.id) return me.name;
  return members.find((member) => member.userId === userId)?.displayName ?? 'le propriétaire';
}

/**
 * The net a statement counts from reports of an earlier period, closed when they came (EQ-04): each line's share of
 * its gross that is late, of its net. They are not the period's own pace.
 */
export function lateNetOf(statements: readonly CommissionStatement[]): number {
  let late = 0;
  for (const line of statements.flatMap((statement) => statement.lines)) {
    const lateGross = line.lateReports.reduce((total, report) => total + report.grossMinor, 0);
    if (lateGross !== 0 && line.grossMinor !== 0)
      late += Math.round((line.netMinor * lateGross) / line.grossMinor);
  }
  return late;
}

/**
 * The team's net at the end of the period, at the pace of the time gone by in the agency's zone: what late reports
 * brought is counted once, not as pace. The net itself once the period has ended; `null` before a first full day,
 * when there is no pace to speak of.
 */
export function forecastNet(
  netMinor: number,
  lateNetMinor: number,
  window: Pick<PayPeriodWindow, 'startsAt' | 'endsAt'>,
  now: Date,
): number | null {
  const starts = new Date(window.startsAt).getTime();
  const ends = new Date(window.endsAt).getTime();
  const gone = now.getTime() - starts;
  if (now.getTime() >= ends) return netMinor;
  if (gone < DAY_MS) return null;
  return Math.round(((netMinor - lateNetMinor) * (ends - starts)) / gone) + lateNetMinor;
}

/** Days left in a period, today included: « encore 3 jours ». */
export const daysLeft = (window: PayPeriodWindow, now: Date): number =>
  daysFrom(dayOf(now, window.timeZone), opensOn(window));

/** One step of the money of an account: what it is, how it was reached, and how much. */
export interface FlowStep {
  readonly label: string;
  readonly op: string;
  readonly amount: string;
}

/** From the sales of an account to the commission, step by step, as the engine computed them. */
export function flowOf(
  line: CommissionStatementLine,
  commissionBps: number,
  platform: Platform | null,
  you: boolean,
): FlowStep[] {
  const reports = plural(line.shiftReportIds.length, 'rapport', 'rapports');
  const steps: FlowStep[] = [
    { label: 'Ventes', op: reports, amount: amountText(line.grossMinor, line.currency) },
  ];
  if (line.currency !== 'EUR')
    steps.push({
      label: 'En euros',
      op: rateText(line.rateMicros, line.currency),
      amount: amountText(line.grossEurMinor, 'EUR'),
    });
  steps.push({
    label: 'Hors TVA',
    op: line.vatBps === 0 ? 'sans TVA' : `TVA ${percentText(line.vatBps)}`,
    amount: amountText(line.exclVatMinor, 'EUR'),
  });
  const where = platform === null ? 'la plateforme' : platformName(platform);
  steps.push({
    label: `Net ${/^[AEIOUY]/iu.test(where) ? 'd’' : 'de '}${where}`,
    op: `${where} ${percentText(line.platformFeeBps)}`,
    amount: amountText(line.netMinor, 'EUR'),
  });
  steps.push({
    label: you ? 'Ta commission' : 'Sa commission',
    op: percentText(commissionBps),
    amount: amountText(line.commissionMinor, 'EUR'),
  });
  return steps;
}

/** One row of a statement's totals. */
export interface TotalRow {
  readonly label: string;
  readonly note: string | null;
  readonly amount: string;
  readonly kind: 'line' | 'minus' | 'total' | 'carry' | 'pay';
}

/**
 * What a statement adds up to after the commissions: team share, tier, goal, bonuses, penalties (asked and kept),
 * carry-overs, adjustments, the total, what is carried to the next period, and what is paid. `you` speaks to the
 * member; a paid statement speaks in the past.
 */
export function totalsOf(statement: CommissionStatement, you: boolean): TotalRow[] {
  const rows: TotalRow[] = [
    { label: 'Commission', note: null, amount: amountText(statement.commissionMinor, 'EUR'), kind: 'line' },
  ];
  const signed = (minor: number): string => signedAmountText(minor, 'EUR');
  if (statement.teamShare !== null)
    rows.push({
      label: 'Part d’équipe',
      note: `${percentText(statement.teamShare.bps)} du net des autres membres (${amountText(statement.teamShare.baseNetMinor, 'EUR')})`,
      amount: signed(statement.teamShare.amountMinor),
      kind: 'line',
    });
  if (statement.tierBonus !== null)
    rows.push({
      label: `Palier ${statement.tierBonus.label}`,
      note: `${amountText(statement.tierBonus.thresholdMinor, 'EUR')} de net atteints`,
      amount: signed(statement.tierBonus.bonusMinor),
      kind: 'line',
    });
  if (statement.collectiveBonusMinor > 0) {
    const reached = statement.team?.collective?.reachedBps ?? null;
    rows.push({
      label: 'Objectif collectif',
      note:
        reached === null
          ? null
          : `l’équipe a atteint ${String(Math.floor(reached / 100))}${NBSP}% de l’objectif`,
      amount: signed(statement.collectiveBonusMinor),
      kind: 'line',
    });
  }
  for (const bonus of statement.bonuses)
    rows.push({
      label: 'Prime',
      note: `« ${bonus.reason} »`,
      amount: signed(bonus.amountMinor),
      kind: 'line',
    });
  if (statement.penaltiesMinor > 0 || statement.penaltiesRequestedMinor > 0) {
    const reasons = statement.penalties.map((penalty) => `« ${penalty.reason} »`).join(' · ');
    const capped =
      statement.penaltiesMinor < statement.penaltiesRequestedMinor
        ? `${amountText(statement.penaltiesRequestedMinor, 'EUR')} demandés, plafonnés à ${you ? 'ta' : 'sa'} part plus ${you ? 'tes' : 'ses'} primes`
        : null;
    const note = [reasons, capped].filter((part) => part !== null && part !== '').join(' · ');
    rows.push({
      label: 'Malus',
      note: note === '' ? null : note,
      amount: signed(-statement.penaltiesMinor),
      kind: 'minus',
    });
  }
  if (statement.carryOversInMinor !== 0)
    rows.push({
      label: 'Report de la quinzaine d’avant',
      note: 'reporté ici, sans avoir été versé',
      amount: signed(statement.carryOversInMinor),
      kind: 'line',
    });
  for (const adjustment of statement.adjustments)
    rows.push({
      label: 'Ajustement',
      note: `« ${adjustment.reason} »`,
      amount: signed(adjustment.amountMinor),
      kind: adjustment.amountMinor < 0 ? 'minus' : 'line',
    });

  const paid = statement.status === 'paid';
  const payLabel = you ? (paid ? 'Ce que tu as touché' : 'Ce que tu touches') : paid ? 'Versé' : 'À verser';
  if (statement.carryOverOutMinor === 0) {
    rows.push({
      label: payLabel,
      note: null,
      amount: amountText(statement.payableMinor, 'EUR'),
      kind: 'total',
    });
    return rows;
  }
  rows.push({ label: 'Total', note: null, amount: amountText(statement.totalMinor, 'EUR'), kind: 'total' });
  rows.push({
    label: 'Reporté sur la quinzaine suivante',
    note:
      statement.totalMinor < 0
        ? 'un total sous zéro se reporte'
        : `sous le minimum de versement de ${amountText(statement.rules.minimumPayoutMinor, 'EUR')}`,
    amount: signed(-statement.carryOverOutMinor),
    kind: 'carry',
  });
  rows.push({ label: payLabel, note: null, amount: amountText(statement.payableMinor, 'EUR'), kind: 'pay' });
  return rows;
}

/** What a refusal may need: a member's name by their id, and the statement the gesture was on, when there is one. */
export interface RefusalNames {
  readonly memberName: (memberId: string) => string | null;
  readonly statement?: Pick<CommissionStatement, 'memberId' | 'window'>;
}

const lowerFirst = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1);

/** What a refusal of pay says, in the screens' words (EQ-05, « Refus de l'API »). */
export function payRefusalText(refusal: PayRefusal, names: RefusalNames): string {
  if (refusal.kind === 'failed') return 'Le serveur ne répond pas : rien n’a été enregistré.';
  const { details } = refusal;
  const named = PayPeriodSchema.safeParse(details.period);
  const period = named.success ? periodLine(named.data) : null;
  const memberId = details.memberId ?? names.statement?.memberId;
  const member = memberId === undefined ? null : names.memberName(memberId);
  switch (refusal.code) {
    case 'commission_statement_changed_conflict':
      return 'Ce relevé a changé depuis que tu l’as ouvert. Relis la nouvelle version avant de valider.';
    case 'commission_statement_status_conflict':
      return 'Ce relevé n’est pas encore validé.';
    case 'commission_statement_open_conflict':
      return names.statement === undefined
        ? 'La quinzaine n’est pas finie : elle se valide le lendemain de son dernier jour.'
        : `La quinzaine n’est pas finie : elle se valide à partir du ${longDay(opensOn(names.statement.window))}.`;
    case 'commission_statement_order_conflict':
      return period === null
        ? `Un relevé plus ancien ${member === null ? 'de ce membre' : `de ${member}`} attend sa validation.`
        : `Valide d’abord le relevé ${member === null ? '' : `de ${member} `}${period}.`;
    case 'pay_period_order_conflict':
      return period === null
        ? 'Une quinzaine plus ancienne attend sa validation.'
        : `Valide d’abord la quinzaine ${period}.`;
    case 'pay_period_reports_pending_conflict':
      return `${countOf(details.count, 'rapport de la quinzaine attend', 'rapports de la quinzaine attendent')} leur relecture.`;
    case 'pay_period_reports_unread_conflict':
      return `${countOf(details.count, 'rapport est', 'rapports sont')} sur des créatrices que tu ne suis pas : le propriétaire valide cette quinzaine.`;
    case 'pay_period_closed_conflict':
      return period === null
        ? 'Cette quinzaine est déjà validée.'
        : `La quinzaine ${period} est déjà validée.`;
    case 'penalty_cancel_conflict':
      return 'Ce malus porte sur des quinzaines toutes validées : passe par un ajustement.';
    case 'exchange_rate_missing_conflict':
      return 'Le taux du dollar de la BCE manque pour la fin de la quinzaine. Il arrive chaque jour ouvré vers 16 h.';
    case 'commission_rate_missing_conflict':
      return `${member ?? 'Un membre'} n’a pas de taux de commission en vigueur.`;
    case 'payroll_own_forbidden':
      return 'Personne ne décide de sa propre paie : un autre s’en charge.';
    case 'payroll_forbidden':
      return 'Seul le propriétaire peut le faire.';
    case 'bonus_conflict':
    case 'penalty_conflict':
    case 'pay_adjustment_conflict':
    case 'bonus_tier_set_conflict':
    case 'collective_goal_conflict':
      return 'Cette saisie existe déjà avec d’autres valeurs : recharge la page.';
    case 'payment_in_future_unprocessable':
      return 'Le paiement ne peut pas être daté après aujourd’hui.';
    case 'payment_amount_unprocessable':
      return details.payableMinor === undefined
        ? 'Le montant envoyé doit être celui à verser.'
        : `Le montant envoyé doit être celui à verser : ${amountText(details.payableMinor, 'EUR')}.`;
    case 'payroll_entries_too_many_unprocessable':
      return 'Trop de saisies sur cette quinzaine pour les lister ici.';
    case 'team_member_not_found':
      return 'Ce membre n’est plus dans l’équipe : la page est relue.';
    case 'commission_statement_not_found':
      return 'Ce relevé n’existe plus : la page est relue.';
    case 'bonus_not_found':
    case 'penalty_not_found':
      return 'Cette saisie n’existe plus : la page est relue.';
    case 'cursor_invalid':
      return 'La liste a changé : elle est relue depuis le début.';
    case 'role_forbidden':
      return 'Ton rôle ne permet pas ce geste.';
    case 'request_invalid':
      return 'Ces valeurs ne conviennent pas : vérifie le montant et le motif.';
  }
}

const countOf = (count: number | undefined, one: string, many: string): string =>
  count === undefined ? `Des ${lowerFirst(many)}` : `${String(count)} ${count > 1 ? many : one}`;

/** The rows of a period's statements as a spreadsheet reads them, `;` between cells, as French spreadsheets expect. */
export function statementsCsv(
  period: PayrollPeriod,
  memberName: (memberId: string) => string,
  accountName: (platformAccountId: string) => string,
): string {
  const euros = (minor: number): string => (minor / 100).toFixed(2).replace('.', ',');
  const cell = (text: string): string => (/[";\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text);
  const rows: string[][] = [
    [
      'Membre',
      'Compte',
      'Devise',
      'Ventes',
      'Ventes en euros',
      'Hors TVA',
      'Net',
      'Commission',
      'Primes',
      'Malus',
      'Reports reçus',
      'Ajustements',
      'Total',
      'Reporté',
      'À verser',
      'Statut',
    ],
  ];
  const STATUS = { draft: 'Brouillon', validated: 'Validé', paid: 'Payé' } as const;
  for (const statement of period.statements) {
    const name = memberName(statement.memberId);
    for (const line of statement.lines)
      rows.push([
        name,
        accountName(line.platformAccountId),
        line.currency,
        euros(line.grossMinor),
        euros(line.grossEurMinor),
        euros(line.exclVatMinor),
        euros(line.netMinor),
        euros(line.commissionMinor),
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
      ]);
    rows.push([
      name,
      'Total du relevé',
      'EUR',
      '',
      '',
      '',
      euros(statement.netMinor),
      euros(statement.commissionMinor),
      euros(statement.bonusesMinor),
      euros(-statement.penaltiesMinor),
      euros(statement.carryOversInMinor),
      euros(statement.adjustmentsMinor),
      euros(statement.totalMinor),
      euros(statement.carryOverOutMinor),
      euros(statement.payableMinor),
      STATUS[statement.status],
    ]);
  }
  return `${rows.map((row) => row.map(cell).join(';')).join('\r\n')}\r\n`;
}

/** Paie's address: the period Quinzaine shows when one was chosen, from Relevés or its arrows. */
export interface PaySearch {
  readonly quinzaine?: PayPeriod;
}

/** Anything else in the address is ignored: a broken link opens the period to validate, or the one under way. */
export function parsePaySearch(search: Record<string, unknown>): PaySearch {
  const { quinzaine } = search;
  const parsed = PayPeriodSchema.safeParse(quinzaine);
  return parsed.success ? { quinzaine: parsed.data } : {};
}

/**
 * The period Quinzaine opens on: the oldest of the first page that has ended with something left to do — a statement
 * to validate, or for the owner money still to send — since periods close in order (ADR 0032); otherwise the one
 * under way.
 */
export function periodToOpen(
  summaries: readonly Pick<
    PayPeriodSummary,
    'window' | 'ended' | 'statements' | 'payableMinor' | 'paidMinor'
  >[],
  current: PayPeriod,
  paying: boolean,
): PayPeriod {
  const waiting = summaries.filter(
    (summary) =>
      summary.ended && (summary.statements.draft > 0 || (paying && summary.payableMinor > summary.paidMinor)),
  );
  return waiting.at(-1)?.window.period ?? current;
}

/**
 * How old a rate may be on a period's last day for its closing to freeze it, as the server checks it
 * (`assertFreshRates`): a hint for the notice, the server's refusal stays the rule.
 */
const RATE_MAX_AGE_DAYS = 4;

/**
 * Whether the dollar's rate is missing to close `period`: it has ended, is not closed yet, counts sales in dollars,
 * and no rate read on its last day or the four before is known, from its drafts or from the latest the job read.
 */
export function rateMissing(period: PayrollPeriod, latest: ExchangeRate | null): boolean {
  if (!period.ended || period.closing !== null) return false;
  if (!period.statements.some((statement) => statement.lines.some((line) => line.currency !== 'EUR')))
    return false;
  const lastDay = payPeriodLastDay(period.period);
  const known = [
    ...period.statements.flatMap((statement) => statement.rules.exchangeRates),
    ...(latest === null ? [] : [latest]),
  ].filter((rate) => rate.day <= lastDay);
  const freshest = known.reduce<string | null>(
    (day, rate) => (day === null || rate.day > day ? rate.day : day),
    null,
  );
  return freshest === null || daysFrom(freshest, lastDay) > RATE_MAX_AGE_DAYS;
}

/** The refusals that concern the whole period: the validation of the others stops there, the notice says it. */
const PERIOD_REFUSALS: ReadonlySet<PayRefusalCode> = new Set<PayRefusalCode>([
  'pay_period_reports_pending_conflict',
  'pay_period_reports_unread_conflict',
  'pay_period_order_conflict',
  'pay_period_closed_conflict',
  'exchange_rate_missing_conflict',
  'commission_statement_open_conflict',
  'payroll_forbidden',
  'role_forbidden',
]);

/** Whether a refusal stops a batch of validations: one of the period's, or a server that does not answer. */
export const stopsThePeriod = (refusal: PayRefusal): boolean =>
  refusal.kind === 'failed' || PERIOD_REFUSALS.has(refusal.code);

/** The statements a reader may validate now, in the order given: drafts of an ended period, never their own. */
export const validatable = (period: Pick<PayrollPeriod, 'ended' | 'statements'>): CommissionStatement[] =>
  period.ended
    ? period.statements.filter((statement) => statement.status === 'draft' && statement.canValidate)
    : [];

/** What a member's row says after their net: their rate or team share, their tier, their penalty. */
export function memberFacts(statement: CommissionStatement): string[] {
  const facts = [
    statement.teamShare === null
      ? `commission ${percentText(statement.rules.commissionRateBps)}`
      : `part d’équipe ${percentText(statement.teamShare.bps)}`,
  ];
  if (statement.tierBonus !== null) facts.push(`palier ${statement.tierBonus.label}`);
  if (statement.penaltiesMinor > 0) facts.push(`malus ${signedAmountText(-statement.penaltiesMinor, 'EUR')}`);
  return facts;
}

/** The sentence of a statement that carries its total over, or `null`. */
export function carryLine(statement: CommissionStatement): string | null {
  if (statement.carryOverOutMinor === 0) return null;
  if (statement.totalMinor < 0)
    return `Total sous zéro : ${signedAmountText(statement.carryOverOutMinor, 'EUR')} reportés sur la quinzaine suivante.`;
  return `Sous le minimum de ${amountText(statement.rules.minimumPayoutMinor, 'EUR')} : ${amountText(statement.carryOverOutMinor, 'EUR')} reportés sur la quinzaine suivante.`;
}

/** One part of a split: a name, its net, and its share of the whole in basis points. */
export interface Share {
  readonly name: string;
  readonly minor: number;
  readonly bps: number;
}

/** A period's net split by `keyOf` (a creator, a platform), the largest first; nothing when there is no net. */
export function salesSplit(
  statements: readonly CommissionStatement[],
  keyOf: (line: CommissionStatementLine) => string,
): Share[] {
  const sums = new Map<string, number>();
  for (const line of statements.flatMap((statement) => statement.lines))
    sums.set(keyOf(line), (sums.get(keyOf(line)) ?? 0) + line.netMinor);
  const total = [...sums.values()].reduce((sum, minor) => sum + Math.max(minor, 0), 0);
  if (total <= 0) return [];
  return [...sums]
    .filter(([, minor]) => minor > 0)
    .map(([name, minor]) => ({ name, minor, bps: Math.round((minor * 10_000) / total) }))
    .toSorted((a, b) => b.minor - a.minor || a.name.localeCompare(b.name, 'fr'));
}

/** How far the team's net is towards its target, in basis points, floored as the engine floors it. */
export const reachedBpsOf = (netMinor: number, targetMinor: number): number =>
  Math.max(0, Math.floor((netMinor * 10_000) / targetMinor));

/** The highest tier a reached share gives, or `null`. */
export function tierAt(tiers: readonly CollectiveTier[], reachedBps: number): CollectiveTier | null {
  return tiers.reduce<CollectiveTier | null>(
    (best, tier) =>
      tier.reachedBps <= reachedBps && (best === null || tier.reachedBps > best.reachedBps) ? tier : best,
    null,
  );
}

/** The span of a goal's gauge: past its highest tier, so the last tier is never at the very end. */
export const goalSpanBps = (goal: Pick<CollectiveGoal, 'tiers'>): number =>
  Math.max(13_000, ...goal.tiers.map((tier) => tier.reachedBps + 2_000));

/** A share of the gauge's span, in percent for CSS, capped at its end. */
export const gaugePercent = (bps: number, spanBps: number): number =>
  Math.round(Math.min(Math.max(bps / spanBps, 0), 1) * 1_000) / 10;

/** « 3f9c…a41e »: a statement's fingerprint, short. */
export const shortHash = (hash: string): string => `${hash.slice(0, 4)}…${hash.slice(-4)}`;

/** What an entry of Primes et malus is, in the screens' words: never « sanction ». */
export type EntryKind = 'bonus' | 'fixed' | 'percent' | 'adjustment';
export const ENTRY_KIND_LABELS: Readonly<Record<EntryKind, string>> = {
  bonus: 'Prime',
  fixed: 'Malus',
  percent: 'Malus en pourcentage',
  adjustment: 'Ajustement',
};

/** An entry of a period as Primes et malus lists it, whatever its kind. */
export interface EntryRow {
  readonly id: string;
  readonly kind: EntryKind;
  readonly memberId: string;
  /** Its amount with its sign: « +30,00 € », « −15,00 € », « −10 % ». */
  readonly amount: string;
  readonly reason: string;
  readonly createdBy: string | null;
  readonly createdAt: string;
  /** Struck through: it does not count in this period (cancelled, or a penalty cancelled from here or before). */
  readonly struck: boolean;
  readonly cancellation: {
    readonly at: string;
    readonly by: string | null;
    /** A penalty's: the first period it stopped counting in. */
    readonly from: PayPeriod | null;
  } | null;
  /** A penalty over several periods: its first and last. */
  readonly span: { readonly from: PayPeriod; readonly to: PayPeriod } | null;
  /** The statement an adjustment corrects. */
  readonly corrects: string | null;
  /** A bonus or a penalty nobody cancelled: it may be, while a period it counts in is open. */
  readonly cancellable: boolean;
}

/** A period's entries as one list, the newest first, as the server gives each kind. */
export function entryRows(entries: PayrollEntries): EntryRow[] {
  const bonuses = entries.bonuses.map((bonus): EntryRow => ({
    id: bonus.id,
    kind: 'bonus',
    memberId: bonus.memberId,
    amount: signedAmountText(bonus.amountMinor, 'EUR'),
    reason: bonus.reason,
    createdBy: bonus.createdBy,
    createdAt: bonus.createdAt,
    struck: bonus.cancellation !== null,
    cancellation:
      bonus.cancellation === null
        ? null
        : { at: bonus.cancellation.cancelledAt, by: bonus.cancellation.cancelledBy, from: null },
    span: null,
    corrects: null,
    cancellable: bonus.cancellation === null,
  }));
  const penalties = entries.penalties.map((penalty): EntryRow => ({
    id: penalty.id,
    kind: penalty.amount.kind,
    memberId: penalty.memberId,
    amount:
      penalty.amount.kind === 'fixed'
        ? signedAmountText(-penalty.amount.amountMinor, 'EUR')
        : signedPercentText(-penalty.amount.bps),
    reason: penalty.reason,
    createdBy: penalty.createdBy,
    createdAt: penalty.createdAt,
    struck: !penaltyApplies(penalty, entries.period),
    cancellation:
      penalty.cancellation === null
        ? null
        : {
            at: penalty.cancellation.cancelledAt,
            by: penalty.cancellation.cancelledBy,
            from: penalty.cancellation.cancelledFrom,
          },
    span: penalty.fromPeriod === penalty.toPeriod ? null : { from: penalty.fromPeriod, to: penalty.toPeriod },
    corrects: null,
    cancellable: penalty.cancellation === null,
  }));
  const adjustments = entries.adjustments.map((adjustment): EntryRow => ({
    id: adjustment.id,
    kind: 'adjustment',
    memberId: adjustment.memberId,
    amount: signedAmountText(adjustment.amountMinor, 'EUR'),
    reason: adjustment.reason,
    createdBy: adjustment.createdBy,
    createdAt: adjustment.createdAt,
    struck: false,
    cancellation: null,
    span: null,
    corrects: adjustment.correctsStatementId,
    cancellable: false,
  }));
  return [...bonuses, ...penalties, ...adjustments].toSorted((a, b) =>
    a.createdAt === b.createdAt ? b.id.localeCompare(a.id) : b.createdAt.localeCompare(a.createdAt),
  );
}

const DAY_SHORT_MONTH = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** « 1er nov. », « 15 déc. »: a day of a span of periods. */
const dayShortMonth = (day: string): string => {
  const text = DAY_SHORT_MONTH.format(new Date(`${day}T12:00:00Z`));
  return day.endsWith('-01') ? text.replace(/^1(?=\s)/u, '1er') : text;
};

/** The periods from `from` to `to`, both included. */
export function periodsBetween(from: PayPeriod, to: PayPeriod): PayPeriod[] {
  const periods: PayPeriod[] = [];
  for (let period = from; period <= to; period = followingPeriod(period)) periods.push(period);
  return periods;
}

/** « sur 3 quinzaines, du 1er nov. au 15 déc. »: a penalty over several periods. */
export const spanText = (span: { readonly from: PayPeriod; readonly to: PayPeriod }): string =>
  `sur ${String(periodsBetween(span.from, span.to).length)} quinzaines, du ${dayShortMonth(span.from)} au ${dayShortMonth(payPeriodLastDay(span.to))}`;

/** Who made an entry and when, or who cancelled it: « par Charles le lun. 9 nov. », « annulé par Charles le … ». */
export function entryByText(
  row: Pick<EntryRow, 'createdBy' | 'createdAt' | 'cancellation'>,
  period: PayPeriod,
  who: (userId: string) => string,
  timeZone: string,
): string {
  const by = (userId: string | null): string => (userId === null ? '' : ` par ${who(userId)}`);
  const made = `${by(row.createdBy).trim()} le ${dayAt(row.createdAt, timeZone)}`;
  const { cancellation } = row;
  if (cancellation === null) return made;
  const cancelled = `annulé${by(cancellation.by)} le ${dayAt(cancellation.at, timeZone)}`;
  if (cancellation.from !== null && cancellation.from > period)
    return `${made} · ${cancelled}, à partir de la quinzaine ${periodLine(cancellation.from)} : il compte encore ici`;
  return cancelled;
}

/**
 * The periods `GET /v1/payroll/periods` says hold drafts before the team's first open one: where a member's next
 * statement to validate may be. The rest of the first page is enough: periods close in order (ADR 0032).
 */
export function draftPeriodsBefore(
  summaries: readonly Pick<PayPeriodSummary, 'window' | 'closedAt' | 'statements'>[],
  current: PayPeriod,
): { readonly teamFirstOpen: PayPeriod; readonly drafts: readonly PayPeriod[] } {
  const lastClosed = summaries.find((summary) => summary.closedAt !== null)?.window.period ?? null;
  const teamFirstOpen = lastClosed === null ? current : followingPeriod(lastClosed);
  const drafts = summaries
    .filter((summary) => summary.statements.draft > 0 && summary.window.period < teamFirstOpen)
    .map((summary) => summary.window.period)
    .toSorted();
  return { teamFirstOpen, drafts };
}

/**
 * The member's first period open to an entry, as the server chooses it for an adjustment (`adjustmentPeriod`): their
 * earliest draft before the team's first open period, or else that one; never before they joined, nor at or before
 * `after` (a statement of theirs already validated). `undefined` while a period it needs is still being read.
 */
export function firstOpenPeriod({
  memberId,
  joinedOn,
  after,
  teamFirstOpen,
  drafts,
  read,
}: {
  memberId: string;
  joinedOn: string;
  after: PayPeriod | null;
  teamFirstOpen: PayPeriod;
  drafts: readonly PayPeriod[];
  read: (period: PayPeriod) => Pick<PayrollPeriod, 'statements'> | undefined;
}): PayPeriod | undefined {
  let found = teamFirstOpen;
  for (const period of drafts) {
    if (after !== null && period <= after) continue;
    const data = read(period);
    if (data === undefined) return undefined;
    if (data.statements.some((one) => one.memberId === memberId && one.status === 'draft')) {
      found = period;
      break;
    }
  }
  const floors = [payPeriodOfDay(joinedOn), ...(after === null ? [] : [followingPeriod(after)])];
  return floors.reduce((latest, floor) => (floor > latest ? floor : latest), found);
}

/** A target typed in euros: up to the ceiling of a goal or a tier, not the slip guard of an entry. */
export const parseTarget = (text: string): number | null => parseAmount(text, false, PAY_TARGET_MAX_MINOR);

/** A goal's tiers in their order, the lowest first. */
export const goalTiersInOrder = (tiers: readonly CollectiveTier[]): CollectiveTier[] =>
  tiers.toSorted((a, b) => a.reachedBps - b.reachedBps);

/** Individual tiers in their order, the lowest threshold first. */
export const bonusTiersInOrder = (tiers: readonly BonusTier[]): BonusTier[] =>
  tiers.toSorted((a, b) => a.thresholdMinor - b.thresholdMinor);

/** The team's net in a period: the sum of its members' nets, managers' sales included. */
export const teamNetOf = (statements: readonly Pick<CommissionStatement, 'netMinor'>[]): number =>
  statements.reduce((sum, one) => sum + one.netMinor, 0);

/**
 * How far the team is towards the period's goal, in basis points: as the engine saw it in the statements (frozen once
 * the period is closed), else from the team's net.
 */
export function goalReachedBps(
  period: Pick<PayrollPeriod, 'statements'>,
  goal: Pick<CollectiveGoal, 'targetMinor'>,
): number {
  const seen = period.statements.map((one) => one.team?.collective ?? null).find((one) => one !== null);
  return seen?.reachedBps ?? reachedBpsOf(teamNetOf(period.statements), goal.targetMinor);
}

const WHOLE_EUROS = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  signDisplay: 'exceptZero',
  maximumFractionDigits: 0,
});

/** « +10 € », « +12,50 € »: a tier's bonus under the gauge, without cents when it has none. */
export const tickAmountText = (minor: number): string =>
  minor % 100 === 0 ? WHOLE_EUROS.format(minor / 100).replace('-', '−') : signedAmountText(minor, 'EUR');
