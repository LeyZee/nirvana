import { describe, expect, it } from 'vitest';

import { parseTelegramSearch, searchOfTab, TAB_OF_TOPIC, tabOfSearch } from './search';

describe('the tab of Réglages › Telegram in the address', () => {
  it('lands on the tab a link or a reload names, and on the alerts otherwise', () => {
    expect(tabOfSearch(parseTelegramSearch({ onglet: 'ventes' }))).toBe('sales');
    expect(tabOfSearch(parseTelegramSearch({ onglet: 'bots' }))).toBe('bots');
    expect(tabOfSearch(parseTelegramSearch({ onglet: 'n-importe' }))).toBe('alerts');
    expect(tabOfSearch(parseTelegramSearch({ onglet: 'toString' }))).toBe('alerts');
    expect(tabOfSearch(parseTelegramSearch({}))).toBe('alerts');
  });

  it('leaves the first tab out of the address, and writes the others back as they are read', () => {
    expect(searchOfTab('alerts')).toEqual({});
    expect(parseTelegramSearch({ onglet: 'alertes' })).toEqual({});
    for (const tab of ['sales', 'keywords', 'validations', 'bots'] as const) {
      expect(tabOfSearch(parseTelegramSearch({ ...searchOfTab(tab) }))).toBe(tab);
    }
  });

  it('leads each topic to the tab that routes it', () => {
    expect(TAB_OF_TOPIC.keyword).toBe('keywords');
    expect(TAB_OF_TOPIC.important).toBe('alerts');
    expect(TAB_OF_TOPIC.custom).toBe('alerts');
  });
});
