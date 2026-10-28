import { payPeriodLastDay, type PayPeriod } from '@nirvana/contracts';

import { addDays, type RegimeVat } from './billing';
import { CreditNoteExceedsInvoice } from './errors';
import { BPS, mulDivRound } from './rounding';

/**
 * A contractor's invoice and its credit notes (EQ-06, ADR 0023 § Factures), the pure rules: its number, its lines from
 * a validated statement, its totals under the regime, its due date, and the lines of a credit note. The invoice is
 * frozen at its issue: every text here is computed once and copied, never recomputed for an issued invoice.
 */

type InvoiceLineKind =
  | 'commission'
  | 'team_share'
  | 'tier_bonus'
  | 'collective_bonus'
  | 'bonus'
  | 'penalty'
  | 'penalty_cap'
  | 'adjustment'
  | 'reduction';

/** A line as the invoice prints it: what it is, its detail, its amount excluding VAT (negative for a deduction). */
export interface InvoiceLine {
  readonly kind: InvoiceLineKind;
  readonly label: string;
  readonly detail: string | null;
  readonly amountMinor: number;
}

/** What the invoice reads of the validated statement, with the commission rate of its rules. */
interface StatementForInvoice {
  readonly lines: readonly {
    readonly platformAccountId: string;
    readonly netMinor: number;
    readonly commissionMinor: number;
  }[];
  readonly netMinor: number;
  readonly commissionRateBps: number;
  readonly teamShare: {
    readonly baseNetMinor: number;
    readonly bps: number;
    readonly amountMinor: number;
  } | null;
  readonly tierBonus: { readonly thresholdMinor: number; readonly bonusMinor: number } | null;
  readonly collectiveBonusMinor: number;
  readonly manualBonusesMinor: number;
  readonly penaltiesRequestedMinor: number;
  readonly penaltiesMinor: number;
  readonly carryOversInMinor: number;
  readonly adjustmentsMinor: number;
  readonly totalMinor: number;
}

type PenaltyForInvoice = { readonly reason: string } & (
  | { readonly kind: 'fixed'; readonly amountMinor: number }
  | { readonly kind: 'percent'; readonly bps: number }
);

/** A statement and the entries it counted, each with its reason, penalties in the order they were written. */
export interface InvoiceSource {
  readonly period: PayPeriod;
  readonly statement: StatementForInvoice;
  /** The accounts of the statement's lines: a platform and a handle, never a fan. */
  readonly accounts: ReadonlyMap<string, { readonly handle: string; readonly platform: string }>;
  readonly bonuses: readonly { readonly amountMinor: number; readonly reason: string }[];
  readonly penalties: readonly PenaltyForInvoice[];
  readonly adjustments: readonly {
    readonly amountMinor: number;
    readonly reason: string;
    /** The period whose statement the adjustment corrects, when it is known. */
    readonly correctsPeriod: PayPeriod | null;
  }[];
}

const EUROS = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const PERCENT = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 2 });
const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
] as const;

const euros = (minor: number): string => EUROS.format(minor / 100);
const percent = (bps: number): string => PERCENT.format(bps / BPS);
const quoted = (text: string): string => `«\u00a0${text.trim()}\u00a0»`;
/** « : » as French sets it, after a space that never breaks. */
const COLON = '\u00a0: ';
const sum = (amounts: readonly number[]): number => amounts.reduce((total, one) => total + one, 0);
/** A deduction of `minor`, never `-0`, which a test or a comparison tells from 0. */
const minus = (minor: number): number => 0 - minor;

/** A day as an invoice writes it: « 1er novembre 2026 », « 16 octobre 2026 ». */
export function longDay(day: string): string {
  const date = Number(day.slice(8, 10));
  const month = MONTHS[Number(day.slice(5, 7)) - 1];
  if (month === undefined) throw new RangeError(`Not a calendar day: ${day}`);
  return `${date === 1 ? '1er' : String(date)} ${month} ${day.slice(0, 4)}`;
}

/** A pay period as an invoice writes it: « du 1er au 15 octobre 2026 », « du 16 au 31 octobre 2026 ». */
export function periodWords(period: PayPeriod): string {
  const first = Number(period.slice(8, 10));
  return `du ${first === 1 ? '1er' : String(first)} au ${longDay(payPeriodLastDay(period))}`;
}

/**
 * Each percent penalty's share of the one rounding the engine made on their sum: the rounded running total less the
 * one before, so that the lines add up to the engine's amount to the cent, each within a cent of its own share.
 */
function penaltyAmounts(penalties: readonly PenaltyForInvoice[], netMinor: number): number[] {
  const base = Math.max(0, netMinor);
  let runningBps = 0;
  let runningMinor = 0;
  return penalties.map((one) => {
    if (one.kind === 'fixed') return one.amountMinor;
    runningBps += one.bps;
    const upTo = mulDivRound(base, runningBps, BPS);
    const amount = upTo - runningMinor;
    runningMinor = upTo;
    return amount;
  });
}

/**
 * The lines of a statement's invoice: a commission per account, the team share, the tier and collective bonuses, each
 * manual bonus, each penalty as a deduction the contract provides for, the cap of penalties when it applied, and each
 * adjustment with the period it corrects. What comes in from earlier periods (carry-overs) is never invoiced again: it
 * was in its own period's invoice. The lines add up to the statement's own amount for the period, or the source is a
 * bug of the caller.
 */
export function invoiceLines(source: InvoiceSource): InvoiceLine[] {
  const { statement } = source;
  if (sum(source.bonuses.map((one) => one.amountMinor)) !== statement.manualBonusesMinor) {
    throw new RangeError('The bonuses are not those the statement counted');
  }
  if (sum(source.adjustments.map((one) => one.amountMinor)) !== statement.adjustmentsMinor) {
    throw new RangeError('The adjustments are not those the statement counted');
  }
  const penalties = penaltyAmounts(source.penalties, statement.netMinor);
  if (sum(penalties) !== statement.penaltiesRequestedMinor) {
    throw new RangeError('The penalties are not those the statement counted');
  }

  const lines: InvoiceLine[] = statement.lines.map((line) => {
    const account = source.accounts.get(line.platformAccountId);
    if (account === undefined) throw new RangeError(`Account ${line.platformAccountId} has no name`);
    return {
      kind: 'commission',
      label: `Commission, compte ${account.handle} sur ${account.platform}`,
      detail: `${percent(statement.commissionRateBps)} de ${euros(line.netMinor)} de net`,
      amountMinor: line.commissionMinor,
    };
  });
  if (statement.teamShare !== null) {
    lines.push({
      kind: 'team_share',
      label: 'Part d’équipe',
      detail: `${percent(statement.teamShare.bps)} de ${euros(statement.teamShare.baseNetMinor)} de net de l’équipe`,
      amountMinor: statement.teamShare.amountMinor,
    });
  }
  if (statement.tierBonus !== null) {
    lines.push({
      kind: 'tier_bonus',
      label: 'Prime de palier',
      detail: `${euros(statement.tierBonus.thresholdMinor)} de net atteints`,
      amountMinor: statement.tierBonus.bonusMinor,
    });
  }
  if (statement.collectiveBonusMinor !== 0) {
    lines.push({
      kind: 'collective_bonus',
      label: 'Prime d’objectif collectif',
      detail: 'Objectif de l’équipe atteint',
      amountMinor: statement.collectiveBonusMinor,
    });
  }
  for (const bonus of source.bonuses) {
    lines.push({
      kind: 'bonus',
      label: 'Prime',
      detail: quoted(bonus.reason),
      amountMinor: bonus.amountMinor,
    });
  }
  source.penalties.forEach((penalty, index) => {
    lines.push({
      kind: 'penalty',
      label: 'Réfaction prévue au contrat',
      detail:
        penalty.kind === 'percent'
          ? `${percent(penalty.bps)} du net${COLON}${quoted(penalty.reason)}`
          : quoted(penalty.reason),
      amountMinor: minus(penalties[index] ?? 0),
    });
  });
  const capMinor = statement.penaltiesRequestedMinor - statement.penaltiesMinor;
  if (capMinor !== 0) {
    lines.push({
      kind: 'penalty_cap',
      label: 'Plafond des réfactions',
      detail: 'Les réfactions ne dépassent pas la part et les primes de la période',
      amountMinor: capMinor,
    });
  }
  for (const adjustment of source.adjustments) {
    lines.push({
      kind: 'adjustment',
      label: 'Régularisation',
      detail:
        adjustment.correctsPeriod === null
          ? quoted(adjustment.reason)
          : `Période ${periodWords(adjustment.correctsPeriod)}${COLON}${quoted(adjustment.reason)}`,
      amountMinor: adjustment.amountMinor,
    });
  }
  if (sum(lines.map((line) => line.amountMinor)) !== statement.totalMinor - statement.carryOversInMinor) {
    throw new RangeError('The lines do not add up to the statement');
  }
  return lines;
}

/** An invoice's totals: what it charges, and the VAT the agency self-assesses for the purchase journal. */
export interface InvoiceTotals {
  readonly exclVatMinor: number;
  /** The VAT the invoice charges: only a contractor who charges VAT does. */
  readonly vatMinor: number;
  readonly inclVatMinor: number;
  /** Under reverse charge, the VAT the agency both owes and deducts; nothing is invoiced. */
  readonly selfAssessedVatMinor: number;
}

/** The totals of `lines` under the regime's VAT, rounded once on the total, as all of pay. */
export function invoiceTotals(lines: readonly InvoiceLine[], vat: RegimeVat): InvoiceTotals {
  const exclVatMinor = sum(lines.map((line) => line.amountMinor));
  const vatMinor = vat.treatment === 'charged' ? mulDivRound(exclVatMinor, vat.rateBps, BPS) : 0;
  const selfAssessedVatMinor =
    vat.treatment === 'reverse_charge' ? mulDivRound(exclVatMinor, vat.rateBps, BPS) : 0;
  return { exclVatMinor, vatMinor, inclVatMinor: exclVatMinor + vatMinor, selfAssessedVatMinor };
}

const PREFIX = /^[A-Z0-9]{2,8}$/u;

/** The contractor's own prefix: two to eight capitals or digits, frozen with the first invoice. */
export function isInvoicePrefix(prefix: string): boolean {
  return PREFIX.test(prefix);
}

/**
 * The number of an invoice or a credit note: the contractor's prefix, the year, the sequence of that contractor and
 * year (`NORA-2026-0007`). The sequence comes from the counter row locked in the transaction that issues.
 */
export function invoiceNumber(prefix: string, year: number, sequence: number): string {
  if (!isInvoicePrefix(prefix)) throw new RangeError(`Not an invoice prefix: ${prefix}`);
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new RangeError('A sequence starts at 1');
  return `${prefix}-${String(year)}-${String(sequence).padStart(4, '0')}`;
}

/** The day an invoice falls due: its issue plus the agency's delay. */
export function invoiceDueOn(issuedOn: string, delayDays: number): string {
  if (!Number.isSafeInteger(delayDays) || delayDays < 0) throw new RangeError('A delay is whole days');
  return addDays(issuedOn, delayDays);
}

/** What a credit note cites of its invoice, printed as a mention of the credit note. */
export function creditNoteMention(invoiceNumber: string, issuedOn: string): string {
  return `Avoir sur la facture ${invoiceNumber} du ${longDay(issuedOn)}`;
}

export type CreditRequest =
  | { readonly kind: 'full' }
  | { readonly kind: 'partial'; readonly amountMinor: number; readonly reason: string };

/** An issued invoice, with what its credit notes already took off. */
export interface CreditableInvoice {
  readonly lines: readonly InvoiceLine[];
  readonly exclVatMinor: number;
  readonly creditedMinor: number;
}

/**
 * The lines of a credit note: the whole invoice cancelled line by line, or one reduction with its reason. Never more
 * than what is left of the invoice: a whole cancellation only of an invoice nothing was credited on yet.
 */
export function creditNoteLines(invoice: CreditableInvoice, request: CreditRequest): InvoiceLine[] {
  const leftMinor = invoice.exclVatMinor - invoice.creditedMinor;
  if (request.kind === 'full') {
    if (invoice.creditedMinor !== 0 || leftMinor <= 0) throw new CreditNoteExceedsInvoice(leftMinor);
    return invoice.lines.map((line) => ({
      ...line,
      label: `Annulation${COLON}${line.label}`,
      amountMinor: minus(line.amountMinor),
    }));
  }
  if (
    !Number.isSafeInteger(request.amountMinor) ||
    request.amountMinor <= 0 ||
    request.amountMinor > leftMinor
  ) {
    throw new CreditNoteExceedsInvoice(leftMinor);
  }
  if (request.reason.trim() === '') throw new RangeError('A reduction gives its reason');
  return [
    {
      kind: 'reduction',
      label: 'Réduction',
      detail: quoted(request.reason),
      amountMinor: minus(request.amountMinor),
    },
  ];
}
