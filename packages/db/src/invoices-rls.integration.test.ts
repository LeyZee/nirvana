import { createHash } from 'node:crypto';

import {
  BillingRegimeIdSchema,
  CommissionStatementIdSchema,
  ContractAcceptanceIdSchema,
  ContractorDocumentIdSchema,
  ContractorRegimeIdSchema,
  ContractTextIdSchema,
  InvoiceEventIdSchema,
  InvoiceIdSchema,
  newId,
  nextPayPeriod,
  PayAdjustmentIdSchema,
  PayPeriodSchema,
  TeamMemberIdSchema,
  UserIdSchema,
} from '@nirvana/contracts';
import { and, desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { withAdmin, withMember } from './client';
import * as s from './schema';
import { createTestDb, type TestDb } from './test/test-db';

/** The Postgres message behind a failed query (Drizzle wraps it as `cause`). */
async function failure(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
    return cause instanceof Error ? cause.message : String(cause);
  }
  return 'no error';
}

/** The migration's triggers (0041): every refusal names EQ-06 or ADR 0036. */
const KEPT = /\((EQ-06|ADR 0036)\)/u;
const RLS = /row-level security/u;
const DENIED = /permission denied/u;
const HASH = 'a'.repeat(64);
const DAY = 86_400_000;
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

const today = new Date().toISOString().slice(0, 10);
const year = Number(today.slice(0, 4));

/** Invented parties only (ADR 0010): no real name, address nor identifier. */
const AGENCY = {
  legalName: 'Agence Exemple SAS',
  address: '1 place Fictive, 69000 Lyon',
  siren: '123456789',
  vatNumber: 'FR12123456789',
};
const CONTRACTOR = {
  legalName: 'Kofi Exemple',
  address: '12 rue Inventée, Cotonou',
  country: 'BJ',
  taxId: null,
};

describe('contractors’ invoices (EQ-06): who reads and writes, and an issued invoice that never changes', () => {
  let test: TestDb;
  const owner = newId(UserIdSchema);
  const manager = newId(UserIdSchema);
  const kofi = newId(UserIdSchema);
  const ama = newId(UserIdSchema);
  const memberOf = new Map<string, string>();
  const prefixOf = new Map<string, string>([
    [kofi, 'KOFI'],
    [ama, 'AMA'],
  ]);
  const benin = {
    id: newId(BillingRegimeIdSchema),
    name: 'Bénin et Madagascar',
    countries: ['BJ', 'MG'],
    vatTreatment: 'reverse_charge',
    vatRateBps: 2_000,
    withholding: 'treaty_exempt',
    mentions: ['Autoliquidation'],
    documents: ['tax_residence'],
    taxIdRequired: false,
    validatedOn: '2026-10-30',
    validatedBy: owner,
    createdBy: owner,
  };
  /** A regime the accountant has not validated. */
  const unvalidated = {
    ...benin,
    id: newId(BillingRegimeIdSchema),
    name: 'Autre pays',
    countries: ['CI'],
    validatedOn: null,
    validatedBy: null,
  };
  const regimeCopy = (regime: typeof benin | typeof unvalidated) => ({
    id: regime.id,
    name: regime.name,
    vat: { treatment: regime.vatTreatment, rateBps: regime.vatRateBps },
    withholding: regime.withholding,
    mentions: regime.mentions,
    documents: regime.documents,
    taxIdRequired: regime.taxIdRequired,
    validatedOn: regime.validatedOn,
  });

  const member = (userId: string): string => {
    const memberId = memberOf.get(userId);
    if (memberId === undefined) throw new Error('no member');
    return memberId;
  };
  const prefix = (userId: string): string => {
    const value = prefixOf.get(userId);
    if (value === undefined) throw new Error('no prefix');
    return value;
  };

  const admin = <T>(fn: Parameters<typeof withAdmin<T>>[1]): Promise<T> => withAdmin(test.admin.db, fn);
  const as = <T>(userId: string, fn: Parameters<typeof withMember<T>>[2]): Promise<T> =>
    withMember(test.app.db, userId, fn);

  const periods = ['2026-08-01', '2026-08-16', '2026-09-01', '2026-09-16', '2026-10-01'];

  /** A draft statement of `userId` for `period`, as the job writes it. */
  const draft = async (userId: string, period: string): Promise<string> => {
    const id = newId(CommissionStatementIdSchema);
    await admin((tx) =>
      tx.insert(s.commissionStatements).values({
        id,
        memberId: member(userId),
        period,
        status: 'draft',
        revision: 1,
        engineVersion: 'nirvana-1',
        inputsHash: HASH,
        netMinor: 60_000,
        commissionMinor: 12_000,
        collectiveBonusMinor: 0,
        bonusesMinor: 0,
        penaltiesRequestedMinor: 0,
        penaltiesMinor: 0,
        carryOversInMinor: 0,
        adjustmentsMinor: 0,
        totalMinor: 12_000,
        carryOverOutMinor: 0,
        payableMinor: 12_000,
        teamNetMinor: 60_000,
        rules: { exchangeRates: [] },
        counted: {},
        computedAt: new Date(),
      }),
    );
    return id;
  };

  /** Closes the team's periods up to `period`, one by one (`payroll-closing.integration.test.ts` tests it). */
  const closeUpTo = (period: string) =>
    admin(async (tx) => {
      const [last] = await tx
        .select({ period: s.payPeriodClosings.period })
        .from(s.payPeriodClosings)
        .orderBy(desc(s.payPeriodClosings.period))
        .limit(1);
      let next = last === undefined ? period : nextPayPeriod(PayPeriodSchema.parse(last.period));
      for (; next <= period; next = nextPayPeriod(PayPeriodSchema.parse(next))) {
        await tx
          .insert(s.payPeriodClosings)
          .values({ period: next, teamNetMinor: 60_000, exchangeRates: [], closedBy: owner });
      }
    });

  /** A statement of `userId` for `period`, validated by the owner. */
  const validated = async (userId: string, period: string): Promise<string> => {
    const id = await draft(userId, period);
    await closeUpTo(period);
    await as(owner, (tx) =>
      tx
        .update(s.commissionStatements)
        .set({ status: 'validated', validatedAt: new Date(), validatedBy: owner })
        .where(eq(s.commissionStatements.id, id)),
    );
    return id;
  };

  interface Issue {
    readonly by: string;
    readonly userId: string;
    readonly statementId: string | null;
    readonly period: string;
    /** Excluding VAT: positive for an invoice, negative for a credit note. */
    readonly amountMinor: number;
    readonly creditedInvoiceId?: string;
    /** The lines' amounts; one line of the whole amount by default. */
    readonly lines?: readonly number[];
    /** Takes the number after the counter's: a hole. */
    readonly skip?: boolean;
    readonly invoice?: Partial<typeof s.invoices.$inferInsert>;
  }

  /**
   * Issues an invoice or a credit note as lot 3 will, in one transaction: the counter locked `FOR UPDATE` and moved
   * by one, the invoice with its number, its lines, its event `issued`.
   */
  const issue = (o: Issue): Promise<{ id: string; number: string }> =>
    as(o.by, async (tx) => {
      const memberId = member(o.userId);
      const where = and(eq(s.invoiceCounters.memberId, memberId), eq(s.invoiceCounters.year, year));
      const [counter] = await tx.select().from(s.invoiceCounters).where(where).for('update');
      const next = (counter?.lastSequence ?? 0) + 1;
      if (counter === undefined) {
        await tx.insert(s.invoiceCounters).values({ memberId, year, lastSequence: next });
      } else {
        await tx.update(s.invoiceCounters).set({ lastSequence: next }).where(where);
      }
      const sequence = o.skip === true ? next + 1 : next;
      const own = o.invoice?.prefix ?? prefix(o.userId);
      const number = `${own}-${String(year)}-${String(sequence).padStart(4, '0')}`;
      const id = newId(InvoiceIdSchema);
      await tx.insert(s.invoices).values({
        id,
        kind: o.creditedInvoiceId === undefined ? 'invoice' : 'credit_note',
        memberId,
        statementId: o.statementId,
        creditedInvoiceId: o.creditedInvoiceId ?? null,
        period: o.period,
        prefix: own,
        year,
        sequence,
        number,
        idempotencyKey: `test:${id}`,
        issuedOn: today,
        issuedBy: o.by,
        dueOn: today,
        contractor: CONTRACTOR,
        agency: AGENCY,
        regimeId: benin.id,
        regime: regimeCopy(benin),
        mentions: ['Autofacturation', 'Autoliquidation'],
        exclVatMinor: o.amountMinor,
        vatMinor: 0,
        inclVatMinor: o.amountMinor,
        selfAssessedVatMinor: Math.trunc(o.amountMinor / 5),
        acceptanceDeadline: new Date(Date.now() + 7 * DAY),
        ...o.invoice,
      });
      const amounts = o.lines ?? [o.amountMinor];
      if (amounts.length > 0) {
        await tx.insert(s.invoiceLines).values(
          amounts.map((amountMinor, index) => ({
            invoiceId: id,
            position: index + 1,
            kind: amountMinor < 0 ? 'reduction' : 'commission',
            label: amountMinor < 0 ? 'Réduction' : 'Commission',
            detail: null,
            amountMinor,
          })),
        );
      }
      await tx
        .insert(s.invoiceEvents)
        .values({ id: newId(InvoiceEventIdSchema), invoiceId: id, kind: 'issued', by: o.by });
      return { id, number };
    });

  const event = (
    by: string,
    invoiceId: string,
    kind: string,
    values: Partial<typeof s.invoiceEvents.$inferInsert> = {},
  ) =>
    as(by, (tx) =>
      tx.insert(s.invoiceEvents).values({ id: newId(InvoiceEventIdSchema), invoiceId, kind, by, ...values }),
    );

  /** Moves invoice `id` to `state` as `by`, with the answer the state carries. */
  const answer = (by: string, id: string, state: string, reason: string | null = null) =>
    as(by, (tx) =>
      tx
        .update(s.invoices)
        .set({ acceptanceState: state, acceptanceReason: reason, answeredAt: new Date(), answeredBy: by })
        .where(eq(s.invoices.id, id))
        .returning({ id: s.invoices.id }),
    );

  beforeAll(async () => {
    test = await createTestDb(inject('pgSuperuserUrl'));
    await admin(async (tx) => {
      const people = [
        [owner, 'owner', null],
        [manager, 'operator', 'manager'],
        [kofi, 'operator', 'chatter'],
        [ama, 'operator', 'chatter'],
      ] as const;
      for (const [userId, role, teamRole] of people) {
        await tx
          .insert(s.user)
          .values({ id: userId, name: `Compte ${role}`, email: `${userId}@example.test`, role });
        if (teamRole === null) continue;
        const memberId = newId(TeamMemberIdSchema);
        memberOf.set(userId, memberId);
        await tx.insert(s.teamMembers).values({
          id: memberId,
          userId,
          teamRole,
          firstName: 'Prénom',
          lastName: 'Inventé',
          displayName: `Membre ${teamRole}`,
          country: 'BJ',
          timeZone: 'Africa/Porto-Novo',
          joinedOn: '2026-07-01',
        });
      }
      for (const period of periods) {
        const startsAt = new Date(`${period}T00:00:00+02:00`);
        await tx.insert(s.payPeriods).values({
          period,
          startsAt,
          endsAt: new Date(startsAt.getTime() + 15 * DAY),
          timeZone: 'Europe/Paris',
        });
      }
      await tx.insert(s.billingRegimes).values([benin, unvalidated]);
    });
  });

  afterAll(async () => {
    await test.close();
  });

  describe('settings and regimes', () => {
    it('the owner writes the settings, a single row; the agency reads them, a chatter does not', async () => {
      const settings = {
        id: 1,
        agency: AGENCY,
        dueDays: 15,
        documentReminderDays: 30,
        accounts: { expense: '622', supplierPrefix: '401', vatDeductible: '44566', vatSelfAssessed: '4452' },
        updatedBy: owner,
      };
      expect(
        await failure(
          as(manager, (tx) => tx.insert(s.billingSettings).values({ ...settings, updatedBy: manager })),
        ),
      ).toMatch(RLS);
      await as(owner, (tx) => tx.insert(s.billingSettings).values(settings));
      expect(
        await failure(as(owner, (tx) => tx.insert(s.billingSettings).values({ ...settings, id: 2 }))),
      ).toMatch(/billing_settings_single_check/u);
      expect(
        await as(manager, (tx) =>
          tx
            .update(s.billingSettings)
            .set({ dueDays: 30, updatedBy: manager })
            .returning({ id: s.billingSettings.id }),
        ),
      ).toEqual([]);
      expect(await as(manager, (tx) => tx.select().from(s.billingSettings))).toHaveLength(1);
      expect(await as(kofi, (tx) => tx.select().from(s.billingSettings))).toHaveLength(0);
      await as(owner, (tx) => tx.update(s.billingSettings).set({ dueDays: 30, updatedBy: owner }));
      expect(await failure(admin((tx) => tx.delete(s.billingSettings)))).toMatch(KEPT);
    });

    it('a regime is the owner’s, read by every member; its text never changes, its validation is recorded once', async () => {
      const franchise = {
        id: newId(BillingRegimeIdSchema),
        name: 'France, franchise',
        countries: ['FR'],
        vatTreatment: 'exempt',
        vatRateBps: null,
        withholding: 'none',
        mentions: ['TVA non applicable, art. 293 B du CGI'],
        documents: ['urssaf_vigilance'],
        taxIdRequired: true,
        createdBy: owner,
      };
      expect(
        await failure(
          as(manager, (tx) => tx.insert(s.billingRegimes).values({ ...franchise, createdBy: manager })),
        ),
      ).toMatch(RLS);
      expect(
        await failure(as(owner, (tx) => tx.insert(s.billingRegimes).values({ ...franchise, vatRateBps: 0 }))),
      ).toMatch(/billing_regimes_vat_check/u);
      await as(owner, (tx) => tx.insert(s.billingRegimes).values(franchise));
      const validate = () =>
        as(owner, (tx) =>
          tx
            .update(s.billingRegimes)
            .set({ validatedOn: '2026-10-31', validatedBy: owner })
            .where(eq(s.billingRegimes.id, franchise.id))
            .returning({ id: s.billingRegimes.id }),
        );
      // The application changes nothing of its text: the grants leave it the validation.
      expect(
        await failure(
          as(owner, (tx) =>
            tx.update(s.billingRegimes).set({ name: 'Autre' }).where(eq(s.billingRegimes.id, franchise.id)),
          ),
        ),
      ).toMatch(DENIED);
      expect(await validate()).toEqual([{ id: franchise.id }]);
      expect(await validate()).toEqual([]);
      const change = (values: Partial<typeof s.billingRegimes.$inferInsert>) =>
        admin((tx) => tx.update(s.billingRegimes).set(values).where(eq(s.billingRegimes.id, franchise.id)));
      expect(await failure(change({ validatedOn: '2026-11-02' }))).toMatch(KEPT);
      expect(await failure(change({ mentions: [] }))).toMatch(KEPT);
      expect(await failure(admin((tx) => tx.delete(s.billingRegimes)))).toMatch(KEPT);
      expect(await as(kofi, (tx) => tx.select().from(s.billingRegimes))).toHaveLength(3);
    });
  });

  describe('a contractor’s regime, file, documents and contracts', () => {
    it('the owner assigns a regime from a day after the last, never backwards; a member reads his own', async () => {
      const assign = (by: string, effectiveFrom: string, regimeId = benin.id) =>
        as(by, (tx) =>
          tx.insert(s.contractorRegimes).values({
            id: newId(ContractorRegimeIdSchema),
            memberId: member(kofi),
            regimeId,
            effectiveFrom,
            createdBy: by,
          }),
        );
      expect(await failure(assign(manager, '2026-09-01'))).toMatch(RLS);
      await assign(owner, '2026-09-01');
      expect(await failure(assign(owner, '2026-09-01'))).toMatch(KEPT);
      expect(await failure(assign(owner, '2026-08-01'))).toMatch(KEPT);
      await assign(owner, '2026-10-01', unvalidated.id);
      expect(await as(kofi, (tx) => tx.select().from(s.contractorRegimes))).toHaveLength(2);
      expect(await as(ama, (tx) => tx.select().from(s.contractorRegimes))).toHaveLength(0);
      expect(await as(manager, (tx) => tx.select().from(s.contractorRegimes))).toHaveLength(2);
      expect(
        await failure(admin((tx) => tx.update(s.contractorRegimes).set({ effectiveFrom: '2026-07-01' }))),
      ).toMatch(KEPT);
    });

    it('a contractor writes his file; the owner alone checks it and sets the prefix; a new identity clears the check', async () => {
      const file = {
        memberId: member(kofi),
        legalName: 'Kofi Exemple',
        address: '12 rue Inventée, Cotonou',
        taxId: null,
        email: 'kofi@example.test',
        updatedBy: kofi,
      };
      // Checked after it is written, by the owner: the trigger refuses it before the policy does.
      expect(
        await failure(
          as(kofi, (tx) =>
            tx.insert(s.contractorProfiles).values({ ...file, verifiedAt: new Date(), verifiedBy: kofi }),
          ),
        ),
      ).toMatch(KEPT);
      expect(
        await failure(as(ama, (tx) => tx.insert(s.contractorProfiles).values({ ...file, updatedBy: ama }))),
      ).toMatch(RLS);
      expect(
        await failure(
          as(kofi, (tx) => tx.insert(s.contractorProfiles).values({ ...file, invoicePrefix: 'KOFI' })),
        ),
      ).toMatch(KEPT);
      await as(kofi, (tx) => tx.insert(s.contractorProfiles).values(file));
      const update = (by: string, values: Partial<typeof s.contractorProfiles.$inferInsert>) =>
        as(by, (tx) =>
          tx
            .update(s.contractorProfiles)
            .set({ updatedBy: by, ...values })
            .where(eq(s.contractorProfiles.memberId, member(kofi)))
            .returning({ verifiedAt: s.contractorProfiles.verifiedAt }),
        );
      expect(await failure(update(kofi, { invoicePrefix: 'KOFI' }))).toMatch(KEPT);
      expect(await failure(update(kofi, { verifiedAt: new Date(), verifiedBy: kofi }))).toMatch(KEPT);
      expect(await update(manager, { address: '1 rue Autre, Cotonou' })).toEqual([]);
      expect(await failure(update(owner, { verifiedAt: new Date(), verifiedBy: kofi }))).toMatch(KEPT);
      expect(await failure(update(owner, { invoicePrefix: 'kofi' }))).toMatch(
        /contractor_profiles_prefix_check/u,
      );
      const [checked] = await update(owner, {
        invoicePrefix: 'KOFI',
        verifiedAt: new Date(),
        verifiedBy: owner,
      });
      expect(checked?.verifiedAt).not.toBeNull();
      // He moves: the owner checks the new address again.
      const [moved] = await update(kofi, { address: '14 rue Inventée, Cotonou' });
      expect(moved?.verifiedAt).toBeNull();
      await update(owner, { verifiedAt: new Date(), verifiedBy: owner });
      expect(await failure(update(kofi, { verifiedAt: null, verifiedBy: null }))).toMatch(KEPT);
      // The owner opens Ama's file with her prefix.
      await as(owner, (tx) =>
        tx.insert(s.contractorProfiles).values({
          ...file,
          memberId: member(ama),
          legalName: 'Ama Exemple',
          email: 'ama@example.test',
          invoicePrefix: 'AMA',
          updatedBy: owner,
        }),
      );
      expect(await as(ama, (tx) => tx.select().from(s.contractorProfiles))).toHaveLength(1);
      expect(await as(manager, (tx) => tx.select().from(s.contractorProfiles))).toHaveLength(2);
      expect(await failure(admin((tx) => tx.delete(s.contractorProfiles)))).toMatch(KEPT);
    });

    it('documents are added only, read by their contractor and the agency', async () => {
      const document = (by: string, values: Partial<typeof s.contractorDocuments.$inferInsert> = {}) => ({
        id: newId(ContractorDocumentIdSchema),
        memberId: member(kofi),
        kind: 'tax_residence',
        issuedOn: '2026-09-15',
        validUntil: null,
        fileKey: `contractors/${member(kofi)}/tax-residence-2026.pdf`,
        fileSha256: HASH,
        createdBy: by,
        ...values,
      });
      expect(await failure(as(ama, (tx) => tx.insert(s.contractorDocuments).values(document(ama))))).toMatch(
        RLS,
      );
      expect(
        await failure(
          as(kofi, (tx) =>
            tx.insert(s.contractorDocuments).values(document(kofi, { validUntil: '2026-09-15' })),
          ),
        ),
      ).toMatch(/contractor_documents_dates_check/u);
      await as(kofi, (tx) => tx.insert(s.contractorDocuments).values(document(kofi)));
      await as(owner, (tx) =>
        tx
          .insert(s.contractorDocuments)
          .values(document(owner, { issuedOn: '2026-10-15', validUntil: '2027-10-14' })),
      );
      expect(await as(kofi, (tx) => tx.select().from(s.contractorDocuments))).toHaveLength(2);
      expect(await as(ama, (tx) => tx.select().from(s.contractorDocuments))).toHaveLength(0);
      expect(
        await failure(admin((tx) => tx.update(s.contractorDocuments).set({ fileSha256: 'b'.repeat(64) }))),
      ).toMatch(KEPT);
      expect(await failure(admin((tx) => tx.delete(s.contractorDocuments)))).toMatch(KEPT);
    });

    it('a contract text is the next version and carries its SHA-256; the contractor accepts it himself, with it', async () => {
      const body = 'Mandat de facturation (texte inventé pour le test). Délai de contestation : sept jours.';
      const text = (values: Partial<typeof s.contractTexts.$inferInsert> = {}) => ({
        id: newId(ContractTextIdSchema),
        kind: 'billing_mandate',
        version: 1,
        body,
        sha256: sha256(body),
        contestDelayDays: 7,
        createdBy: owner,
        ...values,
      });
      expect(
        await failure(as(manager, (tx) => tx.insert(s.contractTexts).values(text({ createdBy: manager })))),
      ).toMatch(RLS);
      expect(
        await failure(as(owner, (tx) => tx.insert(s.contractTexts).values(text({ sha256: HASH })))),
      ).toMatch(KEPT);
      expect(
        await failure(as(owner, (tx) => tx.insert(s.contractTexts).values(text({ version: 2 })))),
      ).toMatch(KEPT);
      expect(
        await failure(
          as(owner, (tx) => tx.insert(s.contractTexts).values(text({ kind: 'service_contract' }))),
        ),
      ).toMatch(/contract_texts_delay_check/u);
      const mandate = text();
      await as(owner, (tx) => tx.insert(s.contractTexts).values(mandate));
      const accept = (by: string, values: Partial<typeof s.contractAcceptances.$inferInsert> = {}) =>
        as(by, (tx) =>
          tx.insert(s.contractAcceptances).values({
            id: newId(ContractAcceptanceIdSchema),
            memberId: member(kofi),
            textId: mandate.id,
            textSha256: mandate.sha256,
            acceptedBy: by,
            ...values,
          }),
        );
      expect(await failure(accept(owner))).toMatch(RLS);
      expect(await failure(accept(ama))).toMatch(RLS);
      expect(await failure(accept(kofi, { textSha256: HASH }))).toMatch(KEPT);
      await accept(kofi);
      expect(await failure(accept(kofi))).toMatch(/contract_acceptances_member_text_unique/u);
      expect(await as(ama, (tx) => tx.select().from(s.contractAcceptances))).toHaveLength(0);
      expect(await as(ama, (tx) => tx.select().from(s.contractTexts))).toHaveLength(1);
      expect(await failure(admin((tx) => tx.update(s.contractTexts).set({ body: 'Autre' })))).toMatch(KEPT);
    });
  });

  describe('invoices and credit notes', () => {
    const statements = new Map<string, string>();
    const statement = (userId: string, period: string): string => {
      const id = statements.get(`${userId}:${period}`);
      if (id === undefined) throw new Error('no statement');
      return id;
    };
    const invoices = new Map<string, { id: string; number: string }>();
    const invoice = (name: string): string => {
      const one = invoices.get(name);
      if (one === undefined) throw new Error('no invoice');
      return one.id;
    };

    beforeAll(async () => {
      for (const period of ['2026-08-01', '2026-08-16', '2026-09-01']) {
        statements.set(`${kofi}:${period}`, await validated(kofi, period));
      }
      statements.set(`${kofi}:2026-09-16`, await draft(kofi, '2026-09-16'));
      statements.set(`${ama}:2026-08-01`, await validated(ama, '2026-08-01'));
    });

    it('the agency issues for a validated statement, in the contractor’s sequence without hole; he reads his own', async () => {
      const first = await issue({
        by: manager,
        userId: kofi,
        statementId: statement(kofi, '2026-08-01'),
        period: '2026-08-01',
        amountMinor: 12_000,
      });
      expect(first.number).toBe(`KOFI-${String(year)}-0001`);
      invoices.set('kofi-aug1', first);
      const second = await issue({
        by: owner,
        userId: kofi,
        statementId: statement(kofi, '2026-08-16'),
        period: '2026-08-16',
        amountMinor: 12_000,
        lines: [13_000, -1_000],
      });
      expect(second.number).toBe(`KOFI-${String(year)}-0002`);
      invoices.set('kofi-aug16', second);
      const amas = await issue({
        by: owner,
        userId: ama,
        statementId: statement(ama, '2026-08-01'),
        period: '2026-08-01',
        amountMinor: 12_000,
        invoice: { contractor: { ...CONTRACTOR, legalName: 'Ama Exemple' } },
      });
      expect(amas.number).toBe(`AMA-${String(year)}-0001`);
      invoices.set('ama-aug1', amas);

      const read = (by: string) => as(by, (tx) => tx.select({ id: s.invoices.id }).from(s.invoices));
      expect(await read(kofi)).toHaveLength(2);
      expect(await read(ama)).toEqual([{ id: amas.id }]);
      expect(await read(manager)).toHaveLength(3);
      expect(await as(kofi, (tx) => tx.select().from(s.invoiceLines))).toHaveLength(3);
      expect(await as(ama, (tx) => tx.select().from(s.invoiceLines))).toHaveLength(1);
      expect(await as(ama, (tx) => tx.select().from(s.invoiceEvents))).toHaveLength(1);
      // The counters are the agency's: a contractor reads his number on his invoices.
      expect(await as(kofi, (tx) => tx.select().from(s.invoiceCounters))).toHaveLength(0);
    });

    it('refuses what the counter, the statement, the regime or the issuer does not allow', async () => {
      const sep1 = {
        by: owner,
        userId: kofi,
        statementId: statement(kofi, '2026-09-01'),
        period: '2026-09-01',
      };
      const refused = (values: Partial<Issue>) => failure(issue({ ...sep1, amountMinor: 12_000, ...values }));
      // A hole in the sequence.
      expect(await refused({ skip: true })).toMatch(KEPT);
      // A draft, a statement of another period, another contractor's.
      expect(await refused({ statementId: statement(kofi, '2026-09-16'), period: '2026-09-16' })).toMatch(
        KEPT,
      );
      expect(await refused({ period: '2026-09-16' })).toMatch(KEPT);
      expect(await refused({ statementId: statement(ama, '2026-08-01'), period: '2026-08-01' })).toMatch(
        KEPT,
      );
      // A regime the accountant has not validated.
      expect(
        await refused({ invoice: { regimeId: unvalidated.id, regime: regimeCopy(unvalidated) } }),
      ).toMatch(KEPT);
      // Another contractor's prefix.
      expect(await refused({ invoice: { prefix: 'AMA' } })).toMatch(KEPT);
      // Never two invoices for one statement.
      expect(await refused({ statementId: statement(kofi, '2026-08-01'), period: '2026-08-01' })).toMatch(
        /invoices_statement_unique/u,
      );
      // The agency never issues its own, a chatter none.
      expect(await failure(issue({ ...sep1, by: manager, userId: manager, amountMinor: 12_000 }))).toMatch(
        RLS,
      );
      expect(await failure(issue({ ...sep1, by: ama, amountMinor: 12_000 }))).toMatch(RLS);
      // Nothing was taken: the next number is still the third.
      expect(
        await admin((tx) =>
          tx
            .select({ last: s.invoiceCounters.lastSequence })
            .from(s.invoiceCounters)
            .where(eq(s.invoiceCounters.memberId, member(kofi))),
        ),
      ).toEqual([{ last: 2 }]);
    });

    it('at its commit, an invoice has lines that add up to its total; none is added afterwards', async () => {
      const sep1 = {
        by: owner,
        userId: kofi,
        statementId: statement(kofi, '2026-09-01'),
        period: '2026-09-01',
      };
      expect(await failure(issue({ ...sep1, amountMinor: 12_000, lines: [10_000, 1_000] }))).toMatch(KEPT);
      expect(await failure(issue({ ...sep1, amountMinor: 12_000, lines: [] }))).toMatch(KEPT);
      expect(
        await failure(
          as(owner, (tx) =>
            tx.insert(s.invoiceLines).values({
              invoiceId: invoice('kofi-aug1'),
              position: 2,
              kind: 'bonus',
              label: 'Prime',
              detail: null,
              amountMinor: 500,
            }),
          ),
        ),
      ).toMatch(KEPT);
      expect(await failure(event(owner, invoice('kofi-aug1'), 'issued'))).toMatch(KEPT);
    });

    it('an issued invoice keeps what it was issued with, for every role; its PDF is recorded once', async () => {
      const id = invoice('kofi-aug1');
      const change = (values: Partial<typeof s.invoices.$inferInsert>) =>
        admin((tx) => tx.update(s.invoices).set(values).where(eq(s.invoices.id, id)));
      expect(
        await failure(
          as(owner, (tx) => tx.update(s.invoices).set({ exclVatMinor: 1 }).where(eq(s.invoices.id, id))),
        ),
      ).toMatch(DENIED);
      expect(await failure(change({ exclVatMinor: 1, inclVatMinor: 1 }))).toMatch(KEPT);
      expect(await failure(change({ contractor: { ...CONTRACTOR, address: 'Ailleurs' } }))).toMatch(KEPT);
      expect(await failure(admin((tx) => tx.delete(s.invoices).where(eq(s.invoices.id, id))))).toMatch(KEPT);
      expect(await failure(admin((tx) => tx.update(s.invoiceLines).set({ amountMinor: 1 })))).toMatch(KEPT);
      expect(await failure(admin((tx) => tx.delete(s.invoiceEvents)))).toMatch(KEPT);
      // The counter starts at 1 and moves by one, the job's writes included.
      expect(await failure(admin((tx) => tx.update(s.invoiceCounters).set({ lastSequence: 9 })))).toMatch(
        KEPT,
      );
      expect(
        await failure(
          admin((tx) =>
            tx.insert(s.invoiceCounters).values({ memberId: member(manager), year, lastSequence: 4 }),
          ),
        ),
      ).toMatch(KEPT);
      expect(await failure(admin((tx) => tx.delete(s.invoiceCounters)))).toMatch(KEPT);
      // The prefix is frozen by the first invoice.
      expect(
        await failure(
          as(owner, (tx) =>
            tx
              .update(s.contractorProfiles)
              .set({ invoicePrefix: 'KOFIB', updatedBy: owner })
              .where(eq(s.contractorProfiles.memberId, member(kofi))),
          ),
        ),
      ).toMatch(KEPT);
      expect(
        await failure(
          as(owner, (tx) =>
            tx
              .update(s.invoices)
              .set({ pdfKey: 'invoices/x.pdf', pdfSha256: HASH })
              .where(eq(s.invoices.id, id)),
          ),
        ),
      ).toMatch(DENIED);
      await change({ pdfKey: `invoices/${id}.pdf`, pdfSha256: HASH });
      expect(await failure(change({ pdfKey: `invoices/${id}-2.pdf`, pdfSha256: HASH }))).toMatch(KEPT);
    });

    it('the contractor accepts or contests before the delay; the job accepts tacitly after it', async () => {
      const id = invoice('kofi-aug1');
      expect(await answer(ama, id, 'accepted')).toEqual([]);
      expect(await answer(manager, id, 'accepted')).toEqual([]);
      expect(await failure(event(kofi, id, 'accepted'))).toMatch(KEPT);
      expect(await answer(kofi, id, 'accepted')).toEqual([{ id }]);
      await event(kofi, id, 'accepted');
      expect(await failure(event(kofi, id, 'contested', { reason: 'Montant faux' }))).toMatch(KEPT);
      // Answered once: an accepted invoice is no longer his to contest.
      expect(await answer(kofi, id, 'contested', 'Montant faux')).toEqual([]);

      // An invoice whose delay is over: only the job accepts it, tacitly.
      const late = await issue({
        by: owner,
        userId: kofi,
        statementId: statement(kofi, '2026-09-01'),
        period: '2026-09-01',
        amountMinor: 12_000,
        invoice: {
          issuedAt: new Date(Date.now() - 10 * DAY),
          acceptanceDeadline: new Date(Date.now() - 3 * DAY),
        },
      });
      invoices.set('kofi-sep1', late);
      expect(await failure(answer(kofi, late.id, 'accepted'))).toMatch(KEPT);
      const tacit = (invoiceId: string) =>
        admin((tx) =>
          tx
            .update(s.invoices)
            .set({ acceptanceState: 'tacitly_accepted' })
            .where(eq(s.invoices.id, invoiceId)),
        );
      expect(await failure(tacit(invoice('kofi-aug16')))).toMatch(KEPT);
      await tacit(late.id);
      await admin((tx) =>
        tx
          .insert(s.invoiceEvents)
          .values({ id: newId(InvoiceEventIdSchema), invoiceId: late.id, kind: 'lapsed' }),
      );
    });

    it('a contest ends in a credit note that keeps the invoice’s period and regime, never above what is left', async () => {
      const id = invoice('kofi-aug16');
      expect(await failure(answer(kofi, id, 'contested'))).toMatch(/invoices_acceptance_check/u);
      expect(await answer(kofi, id, 'contested', 'Une vente comptée deux fois')).toEqual([{ id }]);
      expect(await failure(event(kofi, id, 'contested'))).toMatch(/invoice_events_values_check/u);
      expect(await failure(event(ama, id, 'contested', { reason: 'Pas la mienne' }))).toMatch(RLS);
      await event(kofi, id, 'contested', { reason: 'Une vente comptée deux fois' });
      // Credited only by a credit note that cites it.
      expect(await failure(answer(manager, id, 'credited'))).toMatch(KEPT);

      const note = {
        by: manager,
        userId: kofi,
        statementId: null,
        period: '2026-08-16',
        creditedInvoiceId: id,
      };
      expect(await failure(issue({ ...note, amountMinor: -12_001 }))).toMatch(KEPT);
      expect(await failure(issue({ ...note, period: '2026-08-01', amountMinor: -2_000 }))).toMatch(KEPT);
      expect(
        await failure(issue({ ...note, creditedInvoiceId: invoice('ama-aug1'), amountMinor: -2_000 })),
      ).toMatch(KEPT);
      expect(
        await failure(
          issue({
            ...note,
            amountMinor: -2_000,
            invoice: { regime: { ...regimeCopy(benin), mentions: [] } },
          }),
        ),
      ).toMatch(KEPT);
      // Its statement, when it has one, is a later one: never the period's own.
      expect(
        await failure(issue({ ...note, statementId: statement(kofi, '2026-08-16'), amountMinor: -2_000 })),
      ).toMatch(KEPT);
      const partial = await issue({ ...note, amountMinor: -2_000 });
      expect(partial.number).toBe(`KOFI-${String(year)}-0004`);
      await issue({ ...note, amountMinor: -10_000 });
      expect(await failure(issue({ ...note, amountMinor: -1 }))).toMatch(KEPT);
      expect(await answer(kofi, id, 'credited')).toEqual([]);
      expect(await answer(manager, id, 'credited')).toEqual([{ id }]);
      await event(manager, id, 'credited');

      // What a later period owes goes on an earlier invoice, accepted or not (ADR 0036): it changes nothing of it.
      await issue({
        by: owner,
        userId: kofi,
        statementId: statement(kofi, '2026-09-01'),
        period: '2026-08-01',
        creditedInvoiceId: invoice('kofi-aug1'),
        amountMinor: -3_000,
        lines: [-3_000],
      });
      const [aug1] = await admin((tx) =>
        tx
          .select({ state: s.invoices.acceptanceState })
          .from(s.invoices)
          .where(eq(s.invoices.id, invoice('kofi-aug1'))),
      );
      expect(aug1?.state).toBe('accepted');
    });

    it('a contest may be refused with a reason, once', async () => {
      const id = invoice('ama-aug1');
      expect(await answer(ama, id, 'contested', 'Prime oubliée')).toEqual([{ id }]);
      expect(await failure(answer(owner, id, 'contest_refused'))).toMatch(/invoices_acceptance_check/u);
      expect(await answer(owner, id, 'contest_refused', 'La prime est sur la quinzaine suivante')).toEqual([
        { id },
      ]);
      await event(owner, id, 'contest_refused', { reason: 'La prime est sur la quinzaine suivante' });
      expect(await answer(owner, id, 'credited')).toEqual([]);
    });

    it('a payment names a paid statement of the contractor', async () => {
      const paid = statement(kofi, '2026-08-01');
      await as(owner, (tx) =>
        tx
          .update(s.commissionStatements)
          .set({
            status: 'paid',
            paidAt: new Date(),
            paidBy: owner,
            paidOn: '2026-08-20',
            paymentMethod: 'worldremit',
            paymentReference: 'WR-0001',
            sentMinor: 12_000,
          })
          .where(eq(s.commissionStatements.id, paid)),
      );
      expect(await failure(event(owner, invoice('kofi-aug1'), 'paid'))).toMatch(KEPT);
      expect(
        await failure(
          event(owner, invoice('kofi-aug16'), 'paid', { statementId: statement(kofi, '2026-08-16') }),
        ),
      ).toMatch(KEPT);
      expect(await failure(event(owner, invoice('ama-aug1'), 'paid', { statementId: paid }))).toMatch(KEPT);
      expect(await failure(event(kofi, invoice('kofi-aug1'), 'paid', { statementId: paid }))).toMatch(RLS);
      await event(owner, invoice('kofi-aug1'), 'paid', { statementId: paid });
      // Issued, accepted, paid; issued, contested, credited; issued, lapsed; and the three credit notes issued.
      expect(await as(kofi, (tx) => tx.select().from(s.invoiceEvents))).toHaveLength(11);
    });

    it('an adjustment corrects a validated statement of its member, of an earlier period', async () => {
      const adjustment = (correctsStatementId: string) =>
        as(manager, (tx) =>
          tx.insert(s.payAdjustments).values({
            id: newId(PayAdjustmentIdSchema),
            memberId: member(kofi),
            period: '2026-09-16',
            amountMinor: -1_000,
            reason: 'Vente remboursée après la paie',
            correctsStatementId,
            createdBy: manager,
          }),
        );
      expect(await failure(adjustment(statement(ama, '2026-08-01')))).toMatch(KEPT);
      expect(await failure(adjustment(statement(kofi, '2026-09-16')))).toMatch(KEPT);
      await adjustment(statement(kofi, '2026-08-16'));
    });
  });
});
