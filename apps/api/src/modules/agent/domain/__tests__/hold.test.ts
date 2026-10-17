import { describe, expect, it } from 'vitest';

import { holdDecision } from '../hold';

describe('holdDecision', () => {
  it('hands a possible minor, distress or self-harm to a chatter, whatever the brain suggests', () => {
    expect(holdDecision({ risks: ['minor_suspected'], action: 'offer' })).toEqual({
      kind: 'handoff',
      detail: ['minor_suspected'],
    });
    expect(holdDecision({ risks: ['money_trouble', 'distress'], action: 'reply' })).toEqual({
      kind: 'handoff',
      detail: ['distress'],
    });
  });

  it('hands a dangerous request or a story of real abuse to a chatter, never to the voice', () => {
    expect(holdDecision({ risks: ['dangerous_request'], action: 'reply' })).toEqual({
      kind: 'handoff',
      detail: ['dangerous_request'],
    });
    expect(holdDecision({ risks: ['real_abuse'], action: 'offer' })).toEqual({
      kind: 'handoff',
      detail: ['real_abuse'],
    });
  });

  it('follows the brain when it asks for a human, and stays quiet when there is nothing to answer', () => {
    expect(holdDecision({ risks: ['meet_request'], action: 'handoff' })).toEqual({
      kind: 'handoff',
      detail: ['meet_request'],
    });
    expect(holdDecision({ risks: [], action: 'wait' })).toEqual({ kind: 'no_reply', detail: ['wait'] });
  });

  it('answers otherwise, a meeting request included (the voice declines it)', () => {
    expect(holdDecision({ risks: ['meet_request'], action: 'reply' })).toEqual({ kind: 'answer' });
  });
});
