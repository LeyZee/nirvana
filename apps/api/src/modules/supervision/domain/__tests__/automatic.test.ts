import { describe, expect, it } from 'vitest';

import { automaticGate, liveRate } from '../automatic';

const drafts = (asIs: number, edited: number) => [
  ...Array.from({ length: asIs }, () => ({ asIs: true })),
  ...Array.from({ length: edited }, () => ({ asIs: false })),
];

describe('taux en réel', () => {
  it('counts the last 200 decided drafts only', () => {
    // 200 recent drafts all as-is, then 100 older ones all edited: the older ones are out of the window.
    expect(liveRate(drafts(200, 100))).toEqual({ rate: 1, decided: 200 });
    expect(liveRate([])).toEqual({ rate: undefined, decided: 0 });
  });
});

describe('automatic gate', () => {
  it('opens at 80 % on 100 decided drafts with the blind test, and says what is missing otherwise', () => {
    expect(automaticGate({ reading: liveRate(drafts(80, 20)), blindTestPassed: true })).toEqual({
      open: true,
      missing: [],
    });
    expect(automaticGate({ reading: liveRate(drafts(79, 21)), blindTestPassed: true }).missing).toEqual([
      'live_rate',
    ]);
    expect(automaticGate({ reading: liveRate(drafts(90, 9)), blindTestPassed: false }).missing).toEqual([
      'decided',
      'blind_test',
    ]);
    expect(automaticGate({ reading: liveRate([]), blindTestPassed: false }).missing).toEqual([
      'live_rate',
      'decided',
      'blind_test',
    ]);
  });
});
