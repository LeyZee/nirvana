/**
 * When the bot steps back and a chatter takes over (methode-chatting.md): a possible minor, distress, self-harm.
 * Decided here from the brain's risks, whatever action it suggested; the brain only reports.
 */
const HANDOFF_RISKS = ['minor_suspected', 'distress', 'self_harm'] as const;

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
