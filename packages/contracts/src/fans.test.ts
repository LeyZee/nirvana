import { describe, expect, it } from 'vitest';

import { FanFlagsSchema, KYC_SLOT_LABELS, KycSlotSchema } from './fans';

describe('fans', () => {
  it('names each KYC slot as the notes canvas does', () => {
    expect(KycSlotSchema.options.map((slot) => KYC_SLOT_LABELS[slot])).toEqual([
      'Prénom',
      'Localisation',
      'Âge',
      'Métier',
      'Passions',
      'Envies',
      'Situation',
    ]);
  });

  it('reads the flags of a fan, none by default', () => {
    expect(FanFlagsSchema.parse({})).toEqual({});
    expect(
      FanFlagsSchema.parse({
        ageConfirmedAt: '2026-10-01T10:00:00Z',
        salesFrozen: { reason: 'money_trouble', since: '2026-10-02T10:00:00Z' },
        spendingLimitMinor: 5000,
        fragile: true,
      }),
    ).toMatchObject({ salesFrozen: { reason: 'money_trouble' }, spendingLimitMinor: 5000 });
  });

  it('refuses an unknown flag, a false flag and a reason that is not listed', () => {
    expect(FanFlagsSchema.safeParse({ vip: true }).success).toBe(false);
    expect(FanFlagsSchema.safeParse({ doNotContact: false }).success).toBe(false);
    expect(
      FanFlagsSchema.safeParse({ salesFrozen: { reason: 'bored', since: '2026-10-02T10:00:00Z' } }).success,
    ).toBe(false);
  });
});
