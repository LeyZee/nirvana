import { describe, expect, it } from 'vitest';

import { isSelectable, missingLines, nextMode, pillOf, type AutomaticGate } from './mode';

const closed: AutomaticGate = {
  open: false,
  missing: [
    { kind: 'live_rate', value: 64, target: 80 },
    { kind: 'decided_drafts', value: 37, target: 100 },
    { kind: 'blind_test' },
  ],
};
const open: AutomaticGate = { open: true, missing: [] };

describe('missingLines', () => {
  it('says each missing condition of ADR 0019 with the figures the server measured', () => {
    expect(missingLines(closed)).toEqual([
      'Taux en réel : 64 %, il faut 80 %.',
      'Brouillons validés ou refusés par les chatteurs : 37 sur 100.',
      'Test à l’aveugle avec la créatrice : pas encore validé.',
    ]);
  });

  it('says when the live rate has not been measured yet', () => {
    expect(missingLines({ open: false, missing: [{ kind: 'live_rate', value: null, target: 80 }] })).toEqual([
      'Taux en réel : pas encore mesuré, il faut 80 %.',
    ]);
  });

  it('has nothing to say when Automatique is open', () => {
    expect(missingLines(open)).toEqual([]);
  });
});

describe('isSelectable', () => {
  it('offers Automatique only when the server opened it, the others always', () => {
    expect(isSelectable('auto', closed)).toBe(false);
    expect(isSelectable('auto', open)).toBe(true);
    expect(isSelectable('copilot', closed)).toBe(true);
    expect(isSelectable('stop', closed)).toBe(true);
  });
});

describe('nextMode', () => {
  it('moves with the arrows and wraps around', () => {
    expect(nextMode('copilot', 1, open)).toBe('stop');
    expect(nextMode('stop', 1, open)).toBe('auto');
    expect(nextMode('auto', -1, open)).toBe('stop');
  });

  it('skips a closed Automatique', () => {
    expect(nextMode('stop', 1, closed)).toBe('copilot');
    expect(nextMode('copilot', -1, closed)).toBe('stop');
  });
});

describe('pillOf', () => {
  it('says in a word what the agent does, red only when it is stopped', () => {
    expect(pillOf('copilot')).toEqual({ label: 'Copilote', tone: 'ok', live: true });
    expect(pillOf('auto')).toEqual({ label: 'Automatique', tone: 'ok', live: true });
    expect(pillOf('stop')).toEqual({ label: 'Arrêté', tone: 'bad', live: false });
  });
});
