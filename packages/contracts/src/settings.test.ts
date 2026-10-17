import { describe, expect, it } from 'vitest';

import { CreatorSettingsSchema } from './settings';

describe('CreatorSettings', () => {
  it('fills every default from an empty object', () => {
    expect(CreatorSettingsSchema.parse({})).toEqual({
      identityPolicy: 'stay_in_character',
      llm: { roles: {}, contextBudgetTokens: 12_000 },
      autoApproveCategories: [],
      retention: { factMonthsAfterLastContact: 12, fanMediaDays: 30 },
    });
  });

  it('keeps an override and refuses an unknown policy', () => {
    const settings = CreatorSettingsSchema.parse({
      llm: { roles: { voice: { provider: 'mistral', model: 'm' } } },
    });
    expect(settings.llm.roles.voice).toEqual({ provider: 'mistral', model: 'm' });
    expect(settings.llm.contextBudgetTokens).toBe(12_000);
    expect(CreatorSettingsSchema.safeParse({ identityPolicy: 'lie' }).success).toBe(false);
  });
});
