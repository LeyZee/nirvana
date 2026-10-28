import {
  CommissionRateSchema,
  DomainError,
  TeamMemberIdSchema,
  UserIdSchema,
  type PayPeriod,
} from '@nirvana/contracts';
import { describe, expect, it } from 'vitest';

import type { TeamStore } from '../../domain/ports';
import { createTeamService } from '../team';

/** Invented ids only (ADR 0010). */
const MEMBER = TeamMemberIdSchema.parse('0199f2a0-0000-7000-8000-0000000000a1');
const OWNER = { userId: UserIdSchema.parse('0199f2a0-0000-7000-8000-0000000000e1'), ip: null };

const unused = (): never => {
  throw new Error('not used here');
};

/** A store that keeps the period each new rate asks pay to compute again. */
function storeKeeping(asked: (PayPeriod | null)[]): TeamStore {
  return {
    members: unused,
    member: unused,
    create: unused,
    update: unused,
    changeStatus: unused,
    addRate: (_actor, _id, rate, recalculate) => {
      asked.push(recalculate);
      return Promise.resolve(CommissionRateSchema.parse(rate));
    },
    rates: unused,
    presets: unused,
    addPreset: unused,
    notes: unused,
    addNote: unused,
  };
}

const serviceAt = (instant: string, asked: (PayPeriod | null)[]) =>
  createTeamService(
    storeKeeping(asked),
    { existing: unused },
    { live: unused },
    { agencyTimeZone: 'Europe/Paris', now: () => new Date(instant) },
  );

describe('a member’s new rate', () => {
  it('starts the 1st or the 16th, and has pay compute the running period when it starts today', async () => {
    const asked: (PayPeriod | null)[] = [];
    const onTheFirst = serviceAt('2026-11-01T10:00:00Z', asked);
    await onTheFirst.setCommission(OWNER, MEMBER, {
      commission: { rateBps: 1500 },
      teamShareBps: null,
      effectiveFrom: '2026-11-01',
    });
    await onTheFirst.setCommission(OWNER, MEMBER, {
      commission: { rateBps: 1600 },
      teamShareBps: null,
      effectiveFrom: '2026-11-16',
    });
    expect(asked).toEqual(['2026-11-01', null]);

    const midPeriod = serviceAt('2026-10-28T10:00:00Z', asked).setCommission(OWNER, MEMBER, {
      commission: { rateBps: 1500 },
      teamShareBps: null,
      effectiveFrom: '2026-10-29',
    });
    await expect(midPeriod).rejects.toBeInstanceOf(DomainError);
    await expect(midPeriod).rejects.toMatchObject({ code: 'commission_date_invalid' });
    expect(asked).toHaveLength(2);
  });
});
