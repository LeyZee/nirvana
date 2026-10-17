/**
 * When she may offer a script (docs/sessions/tasks/PROPOSED-sales-policy.md, Charles 17/10 22h00): one script per
 * cooldown, only when he sexualizes again, and none once he says he has no money. Pure code: the brain may suggest
 * an offer, only this decides.
 */

interface OfferLimits {
  /** Minimum time between two scripts to one fan; per creator, set in the CRM (persona `strategies.script_launch.cooldown_hours`). */
  readonly cooldownHours: number;
}

const DEFAULT_OFFER_LIMITS: OfferLimits = { cooldownHours: 10 };

export interface OfferContext {
  readonly now: Date;
  /** When the last script was offered to him, bought or not. */
  readonly lastOfferAt: Date | null;
  /** He is flirting or sexting now (the brain's intent or sentiment): a script follows his heat, never opens it. */
  readonly fanSexualizes: boolean;
  /** He asks for paid content himself (« tu as des vidéos ? »): the cooldown and the no-budget stop are lifted. */
  readonly fanAsksForPaid: boolean;
  /** Set by code when he says he cannot pay; lifted only when he comes back to paid content himself. */
  readonly hasNoBudget: boolean;
  readonly risks: readonly string[];
  readonly limits?: OfferLimits;
}

type OfferBlock = 'risk' | 'no_budget' | 'cooldown' | 'not_sexualizing';

export type OfferDecision =
  { readonly allowed: true } | { readonly allowed: false; readonly reason: OfferBlock };

/** A risk where selling is out of the question, whatever else happens. */
const NO_SALE_RISKS = [
  'money_trouble',
  'distress',
  'self_harm',
  'minor_suspected',
  'dangerous_request',
  'real_abuse',
  'harassment',
  'dispute',
];

const HOUR_MS = 3_600_000;

export function offerDecision(context: OfferContext): OfferDecision {
  const limits = context.limits ?? DEFAULT_OFFER_LIMITS;
  if (context.risks.some((risk) => NO_SALE_RISKS.includes(risk))) return { allowed: false, reason: 'risk' };
  // He came back to paid content himself: no waiting on the cooldown or on his budget.
  if (context.fanAsksForPaid) return { allowed: true };
  if (context.hasNoBudget) return { allowed: false, reason: 'no_budget' };
  if (
    context.lastOfferAt !== null &&
    context.now.getTime() - context.lastOfferAt.getTime() < limits.cooldownHours * HOUR_MS
  ) {
    return { allowed: false, reason: 'cooldown' };
  }
  if (!context.fanSexualizes) return { allowed: false, reason: 'not_sexualizing' };
  return { allowed: true };
}
