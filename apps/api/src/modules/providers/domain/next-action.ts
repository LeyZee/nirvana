import type { ProviderNextAction, ProviderStatus } from '@nirvana/contracts';

import { profileOf } from './catalog';

/** The one thing the top of the Services section asks for (contract: `ProviderNextAction`). */
export type NextAction = ProviderNextAction;

/**
 * Priority (fiche P3-03): a refused key first, then low credit, then the next service not connected, in the order
 * of the list (Grok first: without it the agent is stopped).
 */
export function nextAction(statuses: readonly ProviderStatus[]): NextAction {
  const refused = statuses.find((s) => s.state === 'needs_reconnect');
  if (refused !== undefined) {
    return {
      kind: 'replace_key',
      provider: refused.provider,
      lead: profileOf(refused.provider).revoked,
      detail: 'Remplace la clé pour revenir à la normale.',
    };
  }
  const low = statuses.find((s) => s.state === 'low_credit');
  if (low !== undefined) {
    return {
      kind: 'top_up',
      provider: low.provider,
      lead: `Crédits ${profileOf(low.provider).vendor} presque épuisés`,
      detail: low.message,
    };
  }
  const missing = statuses.filter((s) => s.state === 'not_connected');
  const first = missing[0];
  if (first !== undefined) {
    const profile = profileOf(first.provider);
    const detail = profile.isRequired
      ? 'Indispensable : l’agent est à l’arrêt tant qu’il n’est pas connecté.'
      : missing.length === 1
        ? 'C’est le dernier. Tu peux aussi le faire plus tard.'
        : `${profile.role}.`;
    return { kind: 'connect', provider: first.provider, lead: `Connecte ${profile.service}`, detail };
  }
  return {
    kind: 'all_set',
    lead: 'Tout est connecté',
    detail: 'Nirvana revérifie les clés toutes les 15 minutes et te prévient au moindre souci.',
  };
}
