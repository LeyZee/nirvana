import { describe, expect, it } from 'vitest';

import { ConversationIdSchema, FanIdSchema, newId } from './ids';

describe('ids', () => {
  it('generates UUID v7 that sort by creation time', () => {
    const first = newId(FanIdSchema);
    const second = newId(FanIdSchema);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(first < second).toBe(true);
  });

  it('accepts any UUID through a brand and refuses anything else', () => {
    const id = newId(ConversationIdSchema);
    expect(ConversationIdSchema.parse(id)).toBe(id);
    expect(ConversationIdSchema.safeParse('fan-42').success).toBe(false);
  });
});
