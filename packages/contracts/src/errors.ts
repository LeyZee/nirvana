import { z } from 'zod';

/**
 * Error codes and the single error body of the HTTP API (docs/conventions/api.md § Erreurs). A code is stable
 * snake_case; its suffix decides the HTTP status: `*_not_found` 404, `*_invalid` 400, `*_unauthenticated` 401,
 * `*_forbidden` 403, `*_conflict` 409, `*_limited` 429, anything else 500.
 */

/** Codes produced by the HTTP layer itself; each module documents its own next to its `DomainError` subclasses. */
export const HTTP_ERROR_CODES = [
  'request_invalid',
  'route_not_found',
  'session_unauthenticated',
  'role_forbidden',
  'origin_forbidden',
  'payload_too_large',
  'rate_limited',
  'internal_error',
] as const;
export type HttpErrorCode = (typeof HTTP_ERROR_CODES)[number];

export const ErrorCodeSchema = z.string().regex(/^[a-z][a-z0-9_]*$/);

export const ApiErrorSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    /** French, for the operator; never a stack or a query. */
    message: z.string(),
    details: z.record(z.string(), z.unknown()),
    requestId: z.string(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

/** Base of the errors a module throws for the unexpected; each module subclasses it (`ConversationNotFound`). */
export class DomainError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: { readonly cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}
