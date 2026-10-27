import type { FanFlags } from '@nirvana/contracts';

import { localTime, nextLocalTime } from './situation';

/** A follow-up the worker asks for (P3-10): which delay of the persona, after which silence of his. */
export interface FollowUpMoment {
  /** The index of the delay in `follow_ups.delays_hours`, from 0. */
  readonly step: number;
  /** How many delays the persona has. */
  readonly steps: number;
  readonly flags: FanFlags;
  readonly now: Date;
  /** Her time zone: her quiet hours are on her clock. */
  readonly timeZone: string;
}

export type FollowUpDecision =
  | { readonly kind: 'write' }
  | {
      readonly kind: 'skip';
      readonly reason: 'follow_up_do_not_contact' | 'follow_up_distress' | 'follow_up_plan_over';
    }
  | { readonly kind: 'later'; readonly reason: 'follow_up_quiet_hours'; readonly at: Date };

// Her quiet hours, from 23:00 to 08:59 on her clock: a message out of nowhere at night reads as a machine's.
const QUIET_FROM_HOUR = 23;
const QUIET_UNTIL_HOUR = 9;

const isQuiet = (hour: number): boolean => hour >= QUIET_FROM_HOUR || hour < QUIET_UNTIL_HOUR;

/**
 * Whether she follows up on his silence now (P3-10). Never to a fan nobody may write to, nor to one in distress;
 * never past her last delay; in her quiet hours, at 9:00 her time. A follow-up never sells: it keeps the link, and
 * a sales follow-up after a refused offer waits for Reveal's script history (P6-01), so none of the two the method
 * allows is written yet.
 */
export function followUpDecision(context: FollowUpMoment): FollowUpDecision {
  const { flags } = context;
  if (flags.doNotContact === true) return { kind: 'skip', reason: 'follow_up_do_not_contact' };
  if (flags.salesFrozen?.reason === 'distress') return { kind: 'skip', reason: 'follow_up_distress' };
  if (context.step < 0 || context.step >= context.steps)
    return { kind: 'skip', reason: 'follow_up_plan_over' };
  if (isQuiet(localTime(context.now, context.timeZone).hour)) {
    return {
      kind: 'later',
      reason: 'follow_up_quiet_hours',
      at: nextLocalTime(context.now, context.timeZone, QUIET_UNTIL_HOUR, 0),
    };
  }
  return { kind: 'write' };
}
