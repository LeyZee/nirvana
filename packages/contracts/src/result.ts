/** Expected outcomes (validation, refusals) are values, not exceptions (docs/conventions/coding.md). */
export type Result<T, E> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is { readonly ok: true; readonly value: T } {
  return result.ok;
}

export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback;
}

/** Base of the errors a module throws for the unexpected; each module subclasses it (`ConversationNotFound`). */
export class DomainError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: { readonly cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}
