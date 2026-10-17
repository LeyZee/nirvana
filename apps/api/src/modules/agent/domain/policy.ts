/**
 * The offer rules of the sales corpus (docs/sessions/tasks/PROPOSED-sales-policy.md): few offers, made well, and
 * none once he says he has no money. Pure code: the brain may suggest an offer, only this decides.
 */

interface OfferLimits {
  /** Offers on one of her days; the corpus sells within one warm session, then stops. */
  readonly maxPerDay: number;
  /** Offers since his last purchase (or ever); beyond, nothing until he comes back to paid content himself. */
  readonly maxWithoutPurchase: number;
}

/** Corpus defaults, to calibrate in the playground; the persona will carry them (fields asked of the plumbing). */
const DEFAULT_OFFER_LIMITS: OfferLimits = { maxPerDay: 3, maxWithoutPurchase: 5 };

export interface PastOffer {
  readonly at: Date;
  readonly outcome: 'purchased' | 'refused' | 'pending';
}

export interface OfferContext {
  readonly now: Date;
  /** Her clock: « today » is her day. */
  readonly timeZone: string;
  /** Oldest first. */
  readonly offers: readonly PastOffer[];
  /** Set by code when he says he cannot pay; lifted only when he comes back to paid content himself. */
  readonly hasNoBudget: boolean;
  readonly risks: readonly string[];
  /** He asks for paid content himself (« tu as des vidéos ? »): the stops that wait for him are lifted. */
  readonly fanAsksForPaid: boolean;
  readonly limits?: OfferLimits;
}

type OfferBlock = 'risk' | 'no_budget' | 'refused_today' | 'daily_limit' | 'too_many_without_purchase';

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
];

function localDay(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function offerDecision(context: OfferContext): OfferDecision {
  const limits = context.limits ?? DEFAULT_OFFER_LIMITS;
  if (context.risks.some((risk) => NO_SALE_RISKS.includes(risk))) return { allowed: false, reason: 'risk' };
  const offers = [...context.offers].sort((a, b) => a.at.getTime() - b.at.getTime());
  const today = localDay(context.now, context.timeZone);
  const offersToday = offers.filter((o) => localDay(o.at, context.timeZone) === today);
  // The day's ceiling holds even when he asks: the corpus sells within one warm session, then stops.
  if (offersToday.length >= limits.maxPerDay) return { allowed: false, reason: 'daily_limit' };
  // He came back to paid content himself: no budget, a refusal or a long run without purchase no longer stop her.
  if (context.fanAsksForPaid) return { allowed: true };
  if (context.hasNoBudget) return { allowed: false, reason: 'no_budget' };
  // A refusal ends the day's selling, unless he bought afterwards.
  if (offersToday.at(-1)?.outcome === 'refused') return { allowed: false, reason: 'refused_today' };
  const lastPurchase = offers.findLastIndex((o) => o.outcome === 'purchased');
  if (offers.length - (lastPurchase + 1) >= limits.maxWithoutPurchase) {
    return { allowed: false, reason: 'too_many_without_purchase' };
  }
  return { allowed: true };
}
