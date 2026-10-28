import { PayPeriodSchema } from '@nirvana/contracts';
import { describe, expect, it } from 'vitest';

import {
  creditNoteLines,
  creditNoteMention,
  invoiceDueOn,
  invoiceLines,
  invoiceNumber,
  invoiceTotals,
  isInvoicePrefix,
  longDay,
  periodWords,
  type InvoiceLine,
  type InvoiceSource,
} from '../invoices';

const period = (day: string) => PayPeriodSchema.parse(day);
/** The spaces French sets that never break, as plain spaces, to read an amount in a test. */
const plain = (text: string | null): string | null => text?.replace(/[\u00a0\u202f]/gu, ' ') ?? null;

/**
 * Nora's second half of October: two accounts at 20 %, the tier bonus, a manual bonus, a fixed penalty and two
 * percent ones, an adjustment of the first half, and a carry-over from September that the invoice does not repeat.
 */
const source = (patch: Partial<InvoiceSource> = {}): InvoiceSource => ({
  period: period('2026-10-16'),
  statement: {
    lines: [
      { platformAccountId: 'acc-reveal', netMinor: 120_000, commissionMinor: 24_000 },
      { platformAccountId: 'acc-desirely', netMinor: 45_050, commissionMinor: 9_010 },
    ],
    netMinor: 165_050,
    commissionRateBps: 2_000,
    teamShare: null,
    tierBonus: { thresholdMinor: 150_000, bonusMinor: 5_000 },
    collectiveBonusMinor: 0,
    manualBonusesMinor: 2_000,
    penaltiesRequestedMinor: 7_689,
    penaltiesMinor: 7_689,
    carryOversInMinor: 1_234,
    adjustmentsMinor: -3_000,
    totalMinor: 30_555,
  },
  accounts: new Map([
    ['acc-reveal', { handle: 'noravidal', platform: 'Reveal' }],
    ['acc-desirely', { handle: 'nora.v', platform: 'Desirely' }],
  ]),
  bonuses: [{ amountMinor: 2_000, reason: 'Nuit du samedi tenue seule ' }],
  penalties: [
    { kind: 'fixed', amountMinor: 1_500, reason: 'Retard au shift' },
    { kind: 'percent', bps: 250, reason: 'Script envoyé deux fois' },
    { kind: 'percent', bps: 125, reason: 'Note du fan oubliée' },
  ],
  adjustments: [{ amountMinor: -3_000, reason: 'PPV remboursé', correctsPeriod: period('2026-10-01') }],
  ...patch,
});

const total = (lines: readonly InvoiceLine[]): number =>
  lines.reduce((sum, line) => sum + line.amountMinor, 0);

describe('the words of an invoice (EQ-06)', () => {
  it('writes days and periods as French invoices do', () => {
    expect(longDay('2026-11-01')).toBe('1er novembre 2026');
    expect(longDay('2026-10-16')).toBe('16 octobre 2026');
    expect(() => longDay('2026-13-01')).toThrow(RangeError);
    expect(periodWords(period('2026-10-01'))).toBe('du 1er au 15 octobre 2026');
    expect(periodWords(period('2026-02-16'))).toBe('du 16 au 28 février 2026');
  });
});

describe('the lines of a statement’s invoice (EQ-06)', () => {
  it('prints each account, bonus, penalty and adjustment, and adds up to the period without the carry-over', () => {
    const lines = invoiceLines(source());
    expect(lines.map((line) => ({ ...line, detail: plain(line.detail) }))).toEqual([
      {
        kind: 'commission',
        label: 'Commission, compte noravidal sur Reveal',
        detail: '20 % de 1 200,00 € de net',
        amountMinor: 24_000,
      },
      {
        kind: 'commission',
        label: 'Commission, compte nora.v sur Desirely',
        detail: '20 % de 450,50 € de net',
        amountMinor: 9_010,
      },
      {
        kind: 'tier_bonus',
        label: 'Prime de palier',
        detail: '1 500,00 € de net atteints',
        amountMinor: 5_000,
      },
      { kind: 'bonus', label: 'Prime', detail: '« Nuit du samedi tenue seule »', amountMinor: 2_000 },
      {
        kind: 'penalty',
        label: 'Réfaction prévue au contrat',
        detail: '« Retard au shift »',
        amountMinor: -1_500,
      },
      // 2,5 % and 1,25 % of 1 650,50 €: 61,89 € rounded once as the engine did, 41,26 € then 20,63 €.
      {
        kind: 'penalty',
        label: 'Réfaction prévue au contrat',
        detail: '2,5 % du net : « Script envoyé deux fois »',
        amountMinor: -4_126,
      },
      {
        kind: 'penalty',
        label: 'Réfaction prévue au contrat',
        detail: '1,25 % du net : « Note du fan oubliée »',
        amountMinor: -2_063,
      },
      {
        kind: 'adjustment',
        label: 'Régularisation',
        detail: 'Période du 1er au 15 octobre 2026 : « PPV remboursé »',
        amountMinor: -3_000,
      },
    ]);
    expect(total(lines)).toBe(30_555 - 1_234);
    // The spaces around a quotation and before a colon never break.
    expect(lines[3]?.detail).toBe('«\u00a0Nuit du samedi tenue seule\u00a0»');
    expect(lines[5]?.detail).toContain('net\u00a0: «');
  });

  it('prints the team share of a manager, the collective bonus, and an adjustment of an unknown period', () => {
    const lines = invoiceLines(
      source({
        statement: {
          ...source().statement,
          teamShare: { baseNetMinor: 812_345, bps: 500, amountMinor: 40_617 },
          tierBonus: null,
          collectiveBonusMinor: 10_000,
          manualBonusesMinor: 0,
          penaltiesRequestedMinor: 0,
          penaltiesMinor: 0,
          carryOversInMinor: 0,
          totalMinor: 33_010 + 40_617 + 10_000 - 3_000,
        },
        bonuses: [],
        penalties: [],
        adjustments: [{ amountMinor: -3_000, reason: 'PPV remboursé', correctsPeriod: null }],
      }),
    );
    expect(
      lines.slice(2).map((line) => [line.kind, line.label, plain(line.detail), line.amountMinor]),
    ).toEqual([
      ['team_share', 'Part d’équipe', '5 % de 8 123,45 € de net de l’équipe', 40_617],
      ['collective_bonus', 'Prime d’objectif collectif', 'Objectif de l’équipe atteint', 10_000],
      ['adjustment', 'Régularisation', '« PPV remboursé »', -3_000],
    ]);
  });

  it('gives back what the cap of penalties held back, in a line of its own', () => {
    const lines = invoiceLines(
      source({
        statement: {
          ...source().statement,
          lines: [{ platformAccountId: 'acc-reveal', netMinor: 10_000, commissionMinor: 2_000 }],
          netMinor: 10_000,
          tierBonus: null,
          manualBonusesMinor: 0,
          penaltiesRequestedMinor: 5_000,
          penaltiesMinor: 2_000,
          carryOversInMinor: 0,
          adjustmentsMinor: 0,
          totalMinor: 0,
        },
        bonuses: [],
        penalties: [{ kind: 'fixed', amountMinor: 5_000, reason: 'Absence non prévenue' }],
        adjustments: [],
      }),
    );
    expect(lines.map((line) => [line.kind, line.amountMinor])).toEqual([
      ['commission', 2_000],
      ['penalty', -5_000],
      ['penalty_cap', 3_000],
    ]);
    expect(lines[2]?.label).toBe('Plafond des réfactions');
  });

  it('prints a percent penalty at zero when refunds took the net below zero, never minus zero', () => {
    const lines = invoiceLines(
      source({
        statement: {
          ...source().statement,
          lines: [{ platformAccountId: 'acc-reveal', netMinor: -500, commissionMinor: -100 }],
          netMinor: -500,
          tierBonus: null,
          manualBonusesMinor: 2_000,
          penaltiesRequestedMinor: 0,
          penaltiesMinor: 0,
          carryOversInMinor: 0,
          adjustmentsMinor: 0,
          totalMinor: 1_900,
        },
        penalties: [{ kind: 'percent', bps: 250, reason: 'Script envoyé deux fois' }],
        adjustments: [],
      }),
    );
    expect(Object.is(lines[2]?.amountMinor, 0)).toBe(true);
    expect(total(lines)).toBe(1_900);
  });

  it('refuses entries that are not those the statement counted, and lines that do not add up', () => {
    expect(() => invoiceLines(source({ bonuses: [] }))).toThrow('bonuses');
    expect(() => invoiceLines(source({ adjustments: [] }))).toThrow('adjustments');
    expect(() => invoiceLines(source({ penalties: source().penalties.slice(1) }))).toThrow('penalties');
    expect(() => invoiceLines(source({ accounts: new Map() }))).toThrow('acc-reveal');
    expect(() => invoiceLines(source({ statement: { ...source().statement, totalMinor: 30_556 } }))).toThrow(
      'add up',
    );
  });
});

describe('the totals of an invoice (EQ-06)', () => {
  const lines = invoiceLines(source());

  it('charges nothing more under reverse charge, and gives the VAT the agency self-assesses', () => {
    expect(invoiceTotals(lines, { treatment: 'reverse_charge', rateBps: 2_000 })).toEqual({
      exclVatMinor: 29_321,
      vatMinor: 0,
      inclVatMinor: 29_321,
      selfAssessedVatMinor: 5_864,
    });
  });

  it('charges nothing more under the franchise, and the VAT at the rate for a contractor who charges it', () => {
    expect(invoiceTotals(lines, { treatment: 'exempt' })).toEqual({
      exclVatMinor: 29_321,
      vatMinor: 0,
      inclVatMinor: 29_321,
      selfAssessedVatMinor: 0,
    });
    expect(invoiceTotals(lines, { treatment: 'charged', rateBps: 2_000 })).toEqual({
      exclVatMinor: 29_321,
      vatMinor: 5_864,
      inclVatMinor: 35_185,
      selfAssessedVatMinor: 0,
    });
  });
});

describe('the number and the due date of an invoice (EQ-06)', () => {
  it('numbers by the contractor’s prefix, the year and a sequence of four digits at least', () => {
    expect(invoiceNumber('NORA', 2026, 7)).toBe('NORA-2026-0007');
    expect(invoiceNumber('T2', 2027, 12_345)).toBe('T2-2027-12345');
    for (const prefix of ['nora', 'N', 'NORAVIDAL', 'NÉO', 'NO-RA'])
      expect(isInvoicePrefix(prefix)).toBe(false);
    expect(() => invoiceNumber('nora', 2026, 1)).toThrow(RangeError);
    expect(() => invoiceNumber('NORA', 2026, 0)).toThrow(RangeError);
    expect(() => invoiceNumber('NORA', 2026, 1.5)).toThrow(RangeError);
  });

  it('falls due the agency’s delay after the issue', () => {
    expect(invoiceDueOn('2026-10-31', 15)).toBe('2026-11-15');
    expect(invoiceDueOn('2026-12-20', 15)).toBe('2027-01-04');
    expect(invoiceDueOn('2026-11-01', 0)).toBe('2026-11-01');
    expect(() => invoiceDueOn('2026-11-01', -1)).toThrow(RangeError);
  });
});

describe('a credit note (EQ-06)', () => {
  const lines = invoiceLines(source());
  const invoice = { lines, exclVatMinor: 29_321, creditedMinor: 0 };

  it('cites the invoice it credits', () => {
    expect(creditNoteMention('NORA-2026-0007', '2026-11-01')).toBe(
      'Avoir sur la facture NORA-2026-0007 du 1er novembre 2026',
    );
  });

  it('cancels a whole invoice line by line, once and only when nothing was credited on it', () => {
    const credit = creditNoteLines(invoice, { kind: 'full' });
    expect(credit).toHaveLength(lines.length);
    expect(total(credit)).toBe(-29_321);
    expect(credit[0]).toEqual({
      ...lines[0],
      label: 'Annulation\u00a0: Commission, compte noravidal sur Reveal',
      amountMinor: -24_000,
    });
    expect(credit[4]?.amountMinor).toBe(1_500);
    expect(() => creditNoteLines({ ...invoice, creditedMinor: 1 }, { kind: 'full' })).toThrow(
      expect.objectContaining({ code: 'credit_note_amount_unprocessable', details: { leftMinor: 29_320 } }),
    );
  });

  it('reduces by an amount with its reason, up to what is left of the invoice', () => {
    expect(
      creditNoteLines(
        { ...invoice, creditedMinor: 9_321 },
        { kind: 'partial', amountMinor: 20_000, reason: 'Vente comptée deux fois' },
      ),
    ).toEqual([
      {
        kind: 'reduction',
        label: 'Réduction',
        detail: '«\u00a0Vente comptée deux fois\u00a0»',
        amountMinor: -20_000,
      },
    ]);
    for (const amountMinor of [20_001, 0, -5, 0.5]) {
      expect(() =>
        creditNoteLines(
          { ...invoice, creditedMinor: 9_321 },
          { kind: 'partial', amountMinor, reason: 'Erreur' },
        ),
      ).toThrow(expect.objectContaining({ code: 'credit_note_amount_unprocessable' }));
    }
    expect(() => creditNoteLines(invoice, { kind: 'partial', amountMinor: 100, reason: '  ' })).toThrow(
      RangeError,
    );
  });
});
