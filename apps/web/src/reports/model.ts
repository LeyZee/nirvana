import {
  payPeriodLastDay,
  payPeriodOfDay,
  SHIFT_REPORT_MAX_MINOR,
  type Currency,
  type EarningsSource,
  type PayPeriod,
  type Shift,
  type ShiftReport,
  type ShiftReportList,
  type ShiftReportStatus,
} from '@nirvana/contracts';

import type { ReportRefusalCode } from './api';

import { dayOf } from '@/scheduling/time';

/**
 * The end-of-shift reports without React (EQ-03): how an amount is typed and read, how a period and a status read,
 * what is left to do, and what each refusal of the server says. The server decides; this only says it.
 */

const NBSP = '\u00a0';

/**
 * A typed amount in minor units: « 1 234,56 », « 1234.5 », « 12 € »; a sign only where it is allowed (a correction).
 * `null` for anything else: letters, three decimals, more than the slip guard.
 */
export function parseAmount(text: string, signed = false): number | null {
  const bare = text.replace(/[\s\u00a0\u202f€$]/gu, '').replace(/^(EUR|USD)|(EUR|USD)$/giu, '');
  const match = /^([+\-−]?)(\d+)(?:[.,](\d{1,2}))?$/u.exec(bare);
  if (match === null) return null;
  const [, sign = '', units = '0', cents = ''] = match;
  if (sign !== '' && !signed) return null;
  if (units.length > 9) return null;
  const minor = Number(units) * 100 + Number(cents.padEnd(2, '0'));
  if (minor > SHIFT_REPORT_MAX_MINOR) return null;
  return sign === '-' || sign === '−' ? -minor : minor;
}

const MONEY = new Map<Currency, Intl.NumberFormat>();

/** An amount as French reads it, with its currency: « 1 234,56 € », « 80,00 $US ». */
export function amountText(minor: number, currency: Currency): string {
  let format = MONEY.get(currency);
  if (format === undefined) {
    format = new Intl.NumberFormat('fr-FR', { style: 'currency', currency });
    MONEY.set(currency, format);
  }
  return format.format(minor / 100).replace('-', '−');
}

/** A correction's amount, its sign always said: « + 5,00 € », « − 30,00 € ». */
export const signedAmountText = (minor: number, currency: Currency): string =>
  `${minor < 0 ? '−' : '+'}${NBSP}${amountText(Math.abs(minor), currency)}`;

/** The figure an amount field shows back, without its currency: « 1234,56 ». */
export const amountInput = (minor: number): string =>
  `${minor < 0 ? '-' : ''}${String(Math.trunc(Math.abs(minor) / 100))},${String(Math.abs(minor) % 100).padStart(2, '0')}`;

/** The symbol beside an amount field. */
export const CURRENCY_SIGNS: Readonly<Record<Currency, string>> = { EUR: '€', USD: '$' };

const MONTH = new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'UTC' });
const MONTH_YEAR = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

const dayNumber = (day: string): string => {
  const date = Number(day.slice(8, 10));
  return date === 1 ? '1er' : String(date);
};

/** « du 1er au 15 octobre », « du 16 au 31 octobre »: a period in a sentence. */
export function periodLine(period: PayPeriod): string {
  const last = payPeriodLastDay(period);
  return `du ${dayNumber(period)} au ${dayNumber(last)} ${MONTH.format(new Date(`${period}T12:00:00Z`))}`;
}

/** « 1er – 15 octobre 2026 »: a period as a title. */
export function periodTitle(period: PayPeriod): string {
  const last = payPeriodLastDay(period);
  return `${dayNumber(period)} – ${dayNumber(last)} ${MONTH_YEAR.format(new Date(`${period}T12:00:00Z`))}`;
}

/** The period running at `now` in the agency's zone, which the periods follow (ADR 0023). */
export const periodAt = (now: Date, agencyZone: string): PayPeriod => payPeriodOfDay(dayOf(now, agencyZone));

/** A status as its member reads it, and as the agency does. */
export const MEMBER_STATUS: Readonly<Record<ShiftReportStatus, string>> = {
  submitted: 'Envoyé',
  validated: 'Validé',
  rejected: 'Renvoyé',
};
export const AGENCY_STATUS: Readonly<Record<ShiftReportStatus, string>> = {
  submitted: 'À valider',
  validated: 'Validé',
  rejected: 'Renvoyé au membre',
};

/** Quiet while it waits, green once validated, amber when it came back. Red stays for urgencies. */
export type ReportTone = 'wait' | 'ok' | 'warn';
export const STATUS_TONES: Readonly<Record<ShiftReportStatus, ReportTone>> = {
  submitted: 'wait',
  validated: 'ok',
  rejected: 'warn',
};

export const SOURCE_LABELS: Readonly<Record<EarningsSource, string>> = {
  declared: 'Rapports de fin de shift',
  detected: 'Ventes relevées par le connecteur',
};

/** The report of a shift, the one that is not a correction. */
export const reportOf = (reports: readonly ShiftReport[], shiftId: string): ShiftReport | null =>
  reports.find((one) => one.shiftId === shiftId && one.correctsId === null) ?? null;

/** What a shift's validated report and corrections add up to, in minor units. */
export const validatedTotal = (reports: readonly ShiftReport[], shiftId: string): number =>
  reports
    .filter((one) => one.shiftId === shiftId && one.status === 'validated')
    .reduce((total, one) => total + one.amount.amountMinor, 0);

/** A line the member has to act on: a shift without its report, or a report sent back. */
export interface ToDo {
  readonly shift: Shift;
  readonly report: ShiftReport | null;
}

/** What is left to do in a period's list: the reports to make, then those sent back, oldest shift first. */
export function toDoOf(list: ShiftReportList): ToDo[] {
  return list.shifts
    .map((shift) => ({ shift, report: reportOf(list.reports, shift.id) }))
    .filter(({ report }) => report === null || report.status === 'rejected')
    .toSorted((a, b) => a.shift.startsAt.localeCompare(b.shift.startsAt));
}

/** The incidents said in reports, shift by shift, in the order they were said: the planning marks those shifts. */
export function incidentsOf(reports: readonly ShiftReport[]): ReadonlyMap<string, readonly string[]> {
  const byShift = new Map<string, readonly string[]>();
  for (const report of reports.toSorted((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (report.incident !== null)
      byShift.set(report.shiftId, [...(byShift.get(report.shiftId) ?? []), report.incident]);
  }
  return byShift;
}

/** Several reads of the list as one: each report, shift, account and member once. */
export function mergeLists(lists: readonly ShiftReportList[]): ShiftReportList {
  const once = <T extends { readonly id: string }>(items: readonly T[]): T[] => [
    ...new Map(items.map((item) => [item.id, item])).values(),
  ];
  return {
    reports: once(lists.flatMap((list) => list.reports)),
    shifts: once(lists.flatMap((list) => list.shifts)),
    accounts: once(lists.flatMap((list) => list.accounts)),
    members: once(lists.flatMap((list) => list.members)),
  };
}

/** One shift of a list with what it was reported: its report, its corrections, and what is validated of it. */
export interface ShiftLine {
  readonly shift: Shift;
  readonly report: ShiftReport | null;
  readonly corrections: readonly ShiftReport[];
  readonly validatedMinor: number;
}

/** The list shift by shift, the latest first: a shift without a report is a « Sans rapport » line. */
export function linesOf(list: ShiftReportList): ShiftLine[] {
  return list.shifts
    .map((shift) => ({
      shift,
      report: reportOf(list.reports, shift.id),
      corrections: list.reports
        .filter((one) => one.shiftId === shift.id && one.correctsId !== null)
        .toSorted((a, b) => a.createdAt.localeCompare(b.createdAt)),
      validatedMinor: validatedTotal(list.reports, shift.id),
    }))
    .toSorted((a, b) => b.shift.startsAt.localeCompare(a.shift.startsAt));
}

/**
 * A period's figures per currency: what is validated, what still waits for the agency (sent, not yet read), and what
 * came back and waits for its member. Corrections count in each, as their amounts do.
 */
export interface PeriodSum {
  readonly currency: Currency;
  readonly validatedMinor: number;
  readonly waitingMinor: number;
  readonly waiting: number;
  readonly sentBackMinor: number;
  readonly sentBack: number;
}

export function periodSums(reports: readonly ShiftReport[]): PeriodSum[] {
  const sums = new Map<Currency, Omit<PeriodSum, 'currency'>>();
  for (const report of reports) {
    const sum = sums.get(report.amount.currency) ?? {
      validatedMinor: 0,
      waitingMinor: 0,
      waiting: 0,
      sentBackMinor: 0,
      sentBack: 0,
    };
    const minor = report.amount.amountMinor;
    sums.set(
      report.amount.currency,
      report.status === 'validated'
        ? { ...sum, validatedMinor: sum.validatedMinor + minor }
        : report.status === 'submitted'
          ? { ...sum, waitingMinor: sum.waitingMinor + minor, waiting: sum.waiting + 1 }
          : { ...sum, sentBackMinor: sum.sentBackMinor + minor, sentBack: sum.sentBack + 1 },
    );
  }
  return [...sums].map(([currency, sum]) => ({ currency, ...sum }));
}

/** A rate in basis points as a percentage: « 20 % », « 5,5 % ». */
export const percentText = (bps: number): string =>
  `${(bps / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}${NBSP}%`;

/** A typed percentage in basis points, 0 to 100 with two decimals at most; `null` otherwise. */
export function parsePercent(text: string): number | null {
  const match = /^(\d{1,3})(?:[.,](\d{1,2}))?$/u.exec(text.replace(/[\s\u00a0%]/gu, ''));
  if (match === null) return null;
  const [, units = '0', decimals = ''] = match;
  const bps = Number(units) * 100 + Number(decimals.padEnd(2, '0'));
  return bps <= 10_000 ? bps : null;
}

/** The periods new rules may start with: the current one for an account's first rules, then the next ones. */
export function startablePeriods(current: PayPeriod, first: boolean, count = 4): PayPeriod[] {
  const periods: PayPeriod[] = first ? [current] : [];
  let next = current;
  while (periods.length < count) {
    next = followingPeriod(next);
    periods.push(next);
  }
  return periods;
}

/** The period before `period`: a report made late still lists its shift there. */
export const previousPeriod = (period: PayPeriod): PayPeriod => {
  const before = new Date(`${period}T12:00:00Z`);
  before.setUTCDate(before.getUTCDate() - 1);
  return payPeriodOfDay(before.toISOString().slice(0, 10));
};

/** The period after `period`. */
export const followingPeriod = (period: PayPeriod): PayPeriod => {
  const last = payPeriodLastDay(period);
  const after = new Date(`${last}T12:00:00Z`);
  after.setUTCDate(after.getUTCDate() + 1);
  return payPeriodOfDay(after.toISOString().slice(0, 10));
};

/** What each refusal says, in the screens' words. */
export const REPORT_ERRORS: Readonly<Record<ReportRefusalCode, string>> = {
  shift_not_found: 'Ce shift n’existe plus ou a été annulé : la liste est relue.',
  shift_report_not_found: 'Ce rapport n’existe plus : la liste est relue.',
  shift_report_conflict: 'Ce rapport a déjà été envoyé avec d’autres valeurs : la liste est relue.',
  shift_report_exists_conflict: 'Ce shift a déjà son rapport : rouvre-le pour le modifier.',
  shift_report_early_conflict: 'Le rapport se fait à la fin du shift, 30 minutes avant au plus tôt.',
  shift_report_changed_conflict:
    'Ce rapport ou son shift a changé depuis qu’il a été lu : la liste est relue.',
  shift_report_validated_conflict: 'Un rapport validé ne change plus : il se corrige.',
  shift_report_total_conflict: 'Cette correction ferait passer le total validé du shift sous zéro.',
  shift_report_detected_conflict:
    'Sur cette quinzaine, la paie de ce compte lit les ventes relevées : pas de montant à déclarer.',
  shift_report_currency_conflict: 'Les règles de ce compte ont changé de devise : le rapport est relu.',
  pay_rules_missing_conflict:
    'Les règles de paie de ce compte ne sont pas posées pour cette quinzaine : préviens l’agence.',
  shift_report_own_review_forbidden:
    'Ce rapport se relit par quelqu’un d’autre : ton propre shift, ou ce que tu as envoyé.',
  shift_report_forbidden: 'Ce rapport est celui d’un autre membre.',
  platform_account_not_found: 'Ce compte n’existe plus : la liste est relue.',
  pay_rules_conflict: 'Ces règles ont déjà été posées avec d’autres valeurs : la liste est relue.',
  pay_rules_period_conflict: 'Ce compte a déjà des règles à partir de cette quinzaine.',
  pay_rules_period_invalid:
    'De nouvelles règles partent d’une quinzaine qui n’a pas commencé ; seules les premières d’un compte partent de celle en cours.',
  pay_rules_source_conflict:
    'Les ventes de ce compte ne sont pas encore relevées : sa paie se lit dans les rapports.',
  role_forbidden: 'Ton rôle ne permet pas ce geste.',
  request_invalid: 'Ces valeurs ne conviennent pas : vérifie le montant et les textes.',
};

/** The refusals after which what the screen shows is stale: read it again. */
export const READ_AGAIN: ReadonlySet<ReportRefusalCode> = new Set<ReportRefusalCode>([
  'shift_not_found',
  'shift_report_not_found',
  'shift_report_conflict',
  'shift_report_exists_conflict',
  'shift_report_changed_conflict',
  'shift_report_validated_conflict',
  'shift_report_currency_conflict',
  'platform_account_not_found',
  'pay_rules_conflict',
  'pay_rules_period_conflict',
]);
