import { describe, expect, it } from 'vitest';

import { dayPart, describeSituation, localTime } from '../situation';

describe('situation', () => {
  it('reads her time in her own time zone', () => {
    const now = new Date('2026-10-17T21:30:00Z');
    expect(localTime(now, 'Europe/Paris').hour).toBe(23);
    expect(localTime(now, 'America/Montreal').hour).toBe(17);
  });

  it('calls night from 22:00 to 06:59', () => {
    expect(dayPart(22)).toBe('night');
    expect(dayPart(3)).toBe('night');
    expect(dayPart(7)).toBe('day');
    expect(dayPart(21)).toBe('day');
  });

  it('writes the moment as facts: time, day or night, how long, what he spent', () => {
    const text = describeSituation({
      now: new Date('2026-10-17T21:30:00Z'),
      timeZone: 'Europe/Paris',
      relationshipStartedAt: new Date('2026-10-14T21:30:00Z'),
      spentCents: 4_500,
    });
    expect(text).toContain('samedi 23 h 30 (nuit)');
    expect(text).toContain('depuis 3 jours');
    expect(text).toContain('45,00 $');
  });
});
