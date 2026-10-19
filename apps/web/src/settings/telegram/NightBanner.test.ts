import { describe, expect, it } from 'vitest';

import { nightBannerOf, telegramNightOf } from './NightBanner';

describe('the Dashboard’s night banner', () => {
  it('stays silent when her urgent alerts reach a group, or before the data arrives', () => {
    expect(nightBannerOf({ coverage: { urgentReachable: true } }, 'Démo')).toBeNull();
    expect(nightBannerOf(undefined, 'Démo')).toBeNull();
  });

  it('says nobody is warned at night, naming her', () => {
    const banner = nightBannerOf({ coverage: { urgentReachable: false } }, 'Démo');
    expect(banner).toMatchObject({ state: 'uncovered', title: 'Personne n’est prévenu la nuit' });
    expect(banner?.text).toContain('les urgences de Démo');
  });

  it('never reads Telegram off as « no group »: it says Telegram is off', () => {
    expect(nightBannerOf({ coverage: null }, 'Démo')).toMatchObject({
      state: 'off',
      title: 'Les alertes Telegram ne tournent pas',
      // Nothing she can do from Réglages: no button.
      action: null,
    });
  });

  it('reads the coverage from the route’s answer', () => {
    expect(telegramNightOf({ telegramCoverage: null })).toEqual({ coverage: null });
    expect(telegramNightOf({ telegramCoverage: { urgentReachable: false } })).toEqual({
      coverage: { urgentReachable: false },
    });
  });
});
