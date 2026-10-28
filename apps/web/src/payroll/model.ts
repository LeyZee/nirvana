import {
  PayPeriodSchema,
  type CommissionStatement,
  type CommissionStatementLine,
  type Currency,
  type PaymentMethod,
  type PayPeriodSummary,
  type PayPeriodWindow,
  type PayrollPeriod,
  type Platform,
  type TeamMember,
} from '@nirvana/contracts';

import type { PayRefusal } from './api';

import { amountText, percentText, periodLine, signedAmountText } from '@/reports/model';
import { platformName } from '@/scheduling/model';
import { clockAt, dayMonth, dayOf, daysFrom, longDay } from '@/scheduling/time';

/**
 * Pay without React (EQ-05): what a statement and a period say, how the money runs from the sales to what is paid,
 * the forecast of a period, and what each refusal of the server means. The server computes; this only says it.
 */

const NBSP = ' ';
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
      carried: count((one) => one.carryOverOutMinor > 0),
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

/** « le 2 nov. », the day of an instant in the agency's zone, short. */
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

/** The names a refusal may need: a member's, by their id. */
export interface RefusalNames {
  readonly memberName: (memberId: string) => string | null;
}

const lowerFirst = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1);

/** What a refusal of pay says, in the screens' words (EQ-05, « Refus de l'API »). */
export function payRefusalText(refusal: PayRefusal, names: RefusalNames): string {
  if (refusal.kind === 'failed') return 'Le serveur ne répond pas : rien n’a été enregistré.';
  const { details } = refusal;
  const named = PayPeriodSchema.safeParse(details.period);
  const period = named.success ? periodLine(named.data) : null;
  const member = details.memberId === undefined ? null : names.memberName(details.memberId);
  switch (refusal.code) {
    case 'commission_statement_changed_conflict':
      return 'Ce relevé a changé depuis que tu l’as ouvert. Relis la nouvelle version avant de valider.';
    case 'commission_statement_status_conflict':
      return 'Ce relevé n’est pas encore validé.';
    case 'commission_statement_open_conflict':
      return 'La quinzaine n’est pas finie : elle se valide le lendemain de son dernier jour.';
    case 'commission_statement_order_conflict':
      return period === null
        ? 'Un relevé plus ancien de ce membre attend sa validation.'
        : `Valide d’abord le relevé de la quinzaine ${period}.`;
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
