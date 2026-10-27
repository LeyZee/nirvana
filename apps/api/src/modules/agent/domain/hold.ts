/**
 * When the bot steps back and a chatter takes over (methode-chatting.md): a possible minor, distress, self-harm,
 * and from the sales corpus a dangerous request or a story of real sexual abuse (L05, L28).
 * Decided here from the brain's risks, whatever action it suggested; the brain only reports.
 */
const HANDOFF_RISKS = [
  'minor_suspected',
  'distress',
  'self_harm',
  'dangerous_request',
  'real_abuse',
] as const;

const isHandoffRisk = (risk: string): boolean => HANDOFF_RISKS.some((r) => r === risk);

export type HoldDecision =
  | { readonly kind: 'answer' }
  | { readonly kind: 'handoff'; readonly detail: readonly string[] }
  | { readonly kind: 'no_reply'; readonly detail: readonly string[] };

/** What the brain's reading of the moment means for the draft, before the voice writes anything. */
export function holdDecision(brief: {
  readonly risks: readonly string[];
  readonly action: string;
}): HoldDecision {
  const risks = brief.risks.filter(isHandoffRisk);
  if (risks.length > 0) return { kind: 'handoff', detail: risks };
  if (brief.action === 'handoff')
    return { kind: 'handoff', detail: brief.risks.length > 0 ? [...brief.risks] : ['brain'] };
  // He has nothing to answer yet (« attends, je reviens ») : she stays quiet, the follow-up comes later.
  if (brief.action === 'wait') return { kind: 'no_reply', detail: ['wait'] };
  return { kind: 'answer' };
}

/** What a detected risk changes in his limits by itself, until a human decides (P3-02). */
export interface Protection {
  /** A possible minor: whatever was confirmed before, his age is not anymore. */
  readonly unconfirmAge: boolean;
  /** Distress or a threat: nothing more is written to him. */
  readonly stopContact: boolean;
  /** He said he cannot pay: no sale until he comes back to paid content himself (méthode, « budget nul »). */
  readonly freezeSales: boolean;
  /** The risks and media flags behind it, for the event's reason. */
  readonly because: readonly string[];
}

const MINOR_SIGNS: readonly string[] = ['minor_suspected', 'possible_minor'];
// Distress (his, or a story of real abuse) and threats (harassment, a dangerous request, a weapon shown).
const STOP_SIGNS: readonly string[] = [
  'distress',
  'self_harm',
  'real_abuse',
  'harassment',
  'dangerous_request',
  'weapon',
];

const MONEY_SIGNS: readonly string[] = ['money_trouble'];
const PROTECTED_SIGNS: readonly string[] = [...MINOR_SIGNS, ...STOP_SIGNS, ...MONEY_SIGNS];

/** The limits the policy sets itself from the brain's risks and the media flags; code decides, the brain reports. */
export function protectionFor(signs: readonly string[]): Protection {
  const because = [...new Set(signs.filter((s) => PROTECTED_SIGNS.includes(s)))];
  return {
    unconfirmAge: because.some((s) => MINOR_SIGNS.includes(s)),
    stopContact: because.some((s) => STOP_SIGNS.includes(s)),
    freezeSales: because.some((s) => MONEY_SIGNS.includes(s)),
    because,
  };
}

/** What she keeps while still answering him: only that he cannot pay; his other limits come with a handoff. */
export function protectionWhileAnswering(signs: readonly string[]): Protection {
  return protectionFor(signs.filter((s) => MONEY_SIGNS.includes(s)));
}
