import { describe, expect, it } from 'vitest';

import { ApiErrorSchema, DomainError, ErrorCodeSchema, HTTP_ERROR_CODES } from './errors';

describe('DomainError', () => {
  it('gives a domain error its code and subclass name', () => {
    class ConversationNotFound extends DomainError {}
    const error = new ConversationNotFound('conversation_not_found', 'no such conversation', { cause: 'x' });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ConversationNotFound');
    expect(error.code).toBe('conversation_not_found');
    expect(error.cause).toBe('x');
  });
});

describe('error codes', () => {
  it('accepts snake_case codes only', () => {
    for (const code of HTTP_ERROR_CODES) expect(ErrorCodeSchema.safeParse(code).success).toBe(true);
    expect(ErrorCodeSchema.safeParse('NotFound').success).toBe(false);
    expect(ErrorCodeSchema.safeParse('not-found').success).toBe(false);
  });

  it('describes the single error body', () => {
    const body = {
      error: { code: 'route_not_found', message: 'Route introuvable', details: {}, requestId: 'r1' },
    };
    expect(ApiErrorSchema.parse(body)).toEqual(body);
    expect(ApiErrorSchema.safeParse({ error: { code: 'x' } }).success).toBe(false);
  });
});
