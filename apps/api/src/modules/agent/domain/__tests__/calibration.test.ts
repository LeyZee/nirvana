import { describe, expect, it } from 'vitest';

import {
  parseRejection,
  parseRejectReason,
  rateReport,
  suggestDestination,
  validationRate,
  type RatedAnswer,
  type Verdict,
} from '../calibration';

const V13 = { voicePrompt: '1.3.0', voiceModel: 'grok-4.7' };
const V14 = { voicePrompt: '1.4.0', voiceModel: 'grok-4.7' };
const OK: Verdict = { kind: 'validated' };
const NO: Verdict = { kind: 'rejected', reason: 'sounds_ai' };

function rated(version: typeof V13, verdicts: readonly Verdict[]): RatedAnswer[] {
  return verdicts.map((verdict, i) => ({ at: String(i), version, verdict }));
}

describe('validationRate', () => {
  it('counts only answers kept as written, over the last 50', () => {
    const corrected: Verdict = { kind: 'corrected', text: 'Okidoki' };
    expect(validationRate(rated(V13, [OK, OK, OK, corrected]))).toMatchObject({
      rate: 0.75,
      rated: 4,
      meetsTarget: false,
    });
    const old = rated(V13, Array<Verdict>(10).fill(NO));
    const recent = rated(V13, Array<Verdict>(50).fill(OK));
    expect(validationRate([...old, ...recent])).toMatchObject({ rate: 1, rated: 50, meetsTarget: true });
    expect(validationRate([]).rate).toBeUndefined();
  });
});

describe('rateReport', () => {
  it('reads the version in use and its trend on the previous one', () => {
    const report = rateReport([...rated(V13, [OK, NO, NO, OK]), ...rated(V14, [OK, OK, OK, NO])]);
    expect(report.current).toMatchObject({ rate: 0.75, version: V14 });
    expect(report.previousVersion).toEqual(V13);
    expect(report.trendPoints).toBe(25);
  });

  it('has no trend for a first version', () => {
    expect(rateReport(rated(V13, [OK])).trendPoints).toBeUndefined();
    expect(rateReport([]).current.rate).toBeUndefined();
  });
});

describe('destinations and reasons', () => {
  it('sends style to the voice examples, what code must enforce to a rule, the rest to a test', () => {
    expect(suggestDestination(OK)).toBeUndefined();
    expect(suggestDestination({ kind: 'corrected', text: 'Miiiii' })).toBe('voice_example');
    expect(suggestDestination({ kind: 'rejected', reason: 'too_early_sexual' })).toBe('rule');
    expect(suggestDestination({ kind: 'rejected', reason: 'forgot_fact' })).toBe('rule');
    expect(suggestDestination(NO)).toBe('test');
  });

  it('understands the short words and the labels typed in the terminal', () => {
    expect(parseRejectReason('ia')).toBe('sounds_ai');
    expect(parseRejectReason('Tôt')).toBe('too_early_sexual');
    expect(parseRejectReason('hors personnage')).toBe('out_of_character');
    expect(parseRejectReason('bof')).toBeUndefined();
  });

  it('reads multi-word labels and keeps the rest as the note', () => {
    expect(parseRejection('trop long c’est un roman')).toEqual({
      reason: 'too_long',
      note: 'c’est un roman',
    });
    expect(parseRejection('sonne IA')).toEqual({ reason: 'sounds_ai' });
    expect(parseRejection('a oublié un fait son prénom')).toEqual({
      reason: 'forgot_fact',
      note: 'son prénom',
    });
    expect(parseRejection('ia trop scolaire')).toEqual({ reason: 'sounds_ai', note: 'trop scolaire' });
    expect(parseRejection('bof')).toBeUndefined();
    expect(parseRejection('')).toBeUndefined();
  });
});
