import { describe, expect, it } from 'vitest';

import { accountQueueNameFor, JOB_NAMES, JOB_PAYLOADS, jobKeyFor, queueNameFor } from './jobs';

describe('jobs', () => {
  it('has one payload schema per job name', () => {
    expect(Object.keys(JOB_PAYLOADS).sort()).toEqual([...JOB_NAMES].sort());
  });

  it('names the serial queues and the debounce keys', () => {
    expect(queueNameFor('c1')).toBe('conv:c1');
    expect(accountQueueNameFor('a1')).toBe('account:a1');
    expect(jobKeyFor('conversation.respond', 'c1')).toBe('conversation.respond:c1');
  });
});
