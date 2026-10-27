import { FanFlagsSchema, type FanFlagName, type FanFlags, type SetFanFlagBody } from '@nirvana/contracts';

/** Who may change a fan's limits: a human or the policy, never a model alone (P3-02). */
export type FlagAuthor = 'system' | `human:${string}`;

/** One limit to set, with its value (`true` for the switches). */
export type FlagChange = {
  readonly [K in FanFlagName]: { readonly flag: K; readonly value: NonNullable<FanFlags[K]> };
}[FanFlagName];

/** Already true as asked: a confirmation keeps its first date, a freeze for the same reason keeps its start. */
function alreadySet(flags: FanFlags, change: FlagChange): boolean {
  if (change.flag === 'ageConfirmedAt') return flags.ageConfirmedAt !== undefined;
  if (change.flag === 'salesFrozen') return flags.salesFrozen?.reason === change.value.reason;
  return JSON.stringify(flags[change.flag]) === JSON.stringify(change.value);
}

/** His limits with this one set, or `null` when it already was (nothing to write, no event). */
export function withFlag(flags: FanFlags, change: FlagChange): FanFlags | null {
  if (alreadySet(flags, change)) return null;
  return FanFlagsSchema.parse({ ...flags, [change.flag]: change.value });
}

/**
 * His limits with this one set only where it was not set at all, or `null`: a freeze a human set keeps its reason
 * when the policy would add its own. Read under the row lock, so nothing can slip in between.
 */
export function withFlagIfUnset(flags: FanFlags, change: FlagChange): FanFlags | null {
  return flags[change.flag] === undefined ? withFlag(flags, change) : null;
}

/** His limits without this one, or `null` when it was not set. */
export function withoutFlag(flags: FanFlags, flag: FanFlagName): FanFlags | null {
  if (flags[flag] === undefined) return null;
  return FanFlagsSchema.parse(Object.fromEntries(Object.entries(flags).filter(([name]) => name !== flag)));
}

/** A human's request (`PUT /v1/fans/:id/flags`) to set a limit: the server dates the confirmation and the freeze. */
export function requestedChange(body: Extract<SetFanFlagBody, { set: true }>, now: Date): FlagChange {
  switch (body.flag) {
    case 'ageConfirmedAt':
      return { flag: 'ageConfirmedAt', value: now.toISOString() };
    case 'salesFrozen':
      return { flag: 'salesFrozen', value: { reason: body.freezeReason, since: now.toISOString() } };
    case 'spendingLimitMinor':
      return { flag: 'spendingLimitMinor', value: body.limitMinor };
    case 'fragile':
    case 'noExplicit':
    case 'doNotContact':
      return { flag: body.flag, value: true };
  }
}
