import type { AlertTestBody, AlertTestResult } from '@nirvana/contracts';
import { brainAlertId, type LlmGateway } from '@nirvana/llm';

import { alertKeywordsIn } from '../domain/alerts';

export interface AlertTesterDeps {
  readonly gateway: Pick<LlmGateway, 'brain' | 'health'>;
  readonly persona: { readonly creatorName: string; readonly personaSheet: string };
}

/** Réglages › Alertes: an alert being written, tried on an example message (`POST /v1/alerts/test`, P4-01). */
export interface AlertTester {
  test(body: AlertTestBody): Promise<AlertTestResult>;
}

const NO_BRAIN =
  'Aucun modèle n’est joignable pour lire la phrase : ajoute la clé Grok dans Réglages › Modèles IA.';
const BRAIN_FAILED = 'Le modèle n’a pas pu lire la phrase cette fois : réessaie.';
const BUDGET_REACHED = 'Le budget IA du jour est atteint : la phrase sera lisible après minuit.';

/**
 * The same reading as on a real message: her words in code, without a model; her phrase by the brain, given as her
 * only alert, on that message alone. Unlike a real message, the phrase is asked even when a word matched, so that she
 * sees both. Nothing is stored and nothing is sent.
 */
export function createAlertTester(deps: AlertTesterDeps): AlertTester {
  const brainReachable = (): boolean => {
    const brain = deps.gateway.health().roles.find((r) => r.role === 'brain');
    return brain !== undefined && (brain.hasKey || brain.fallback?.hasKey === true);
  };

  return {
    async test({ alert, message }) {
      const keywords = alertKeywordsIn(message, alert.keywords);
      if (alert.phrase === null) return { keywords, phraseMatched: null, reason: null };
      if (!brainReachable()) return { keywords, phraseMatched: null, reason: NO_BRAIN };
      const id = brainAlertId(0);
      const result = await deps.gateway.brain({
        creatorName: deps.persona.creatorName,
        personaSheet: deps.persona.personaSheet,
        fanNotes: '',
        history: [{ from: 'fan', text: message }],
        alerts: [{ id, phrase: alert.phrase }],
      });
      if (!result.ok) {
        const reason = result.error.code === 'budget_reached' ? BUDGET_REACHED : BRAIN_FAILED;
        return { keywords, phraseMatched: null, reason };
      }
      return { keywords, phraseMatched: (result.value.output.alertsSeen ?? []).includes(id), reason: null };
    },
  };
}
