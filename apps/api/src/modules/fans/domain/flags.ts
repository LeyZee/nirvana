import { FanFlagsSchema, type FanFlagName, type FanFlags } from '@nirvana/contracts';

/** Who may change a fan's limits: a human or the policy, never a model alone (P3-02). */
export type FlagAuthor = 'system' | `human:${string}`;

/** One limit to set, with its value (`true` for the switches). */
export type FlagChange = {
  readonly [K in FanFlagName]: { readonly flag: K; readonly value: NonNullable<FanFlags[K]> };
}[FanFlagName];

/** His limits with this one set, or `null` when it already had this value (nothing to write, no event). */
export function withFlag(flags: FanFlags, change: FlagChange): FanFlags | null {
  if (JSON.stringify(flags[change.flag]) === JSON.stringify(change.value)) return null;
  return FanFlagsSchema.parse({ ...flags, [change.flag]: change.value });
}

/** His limits without this one, or `null` when it was not set. */
export function withoutFlag(flags: FanFlags, flag: FanFlagName): FanFlags | null {
  if (flags[flag] === undefined) return null;
  return FanFlagsSchema.parse(Object.fromEntries(Object.entries(flags).filter(([name]) => name !== flag)));
}
