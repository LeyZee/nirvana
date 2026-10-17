import type { HandoffCause } from '@nirvana/contracts';

import type { Outcome, Signal } from './signals';

/**
 * The classification table (ADR 0020 §2, CLAUDE.md rule 3): which event becomes which message, in code. An event
 * missing from here produces nothing.
 */

/**
 * The event types the module reads. Mirrored by the trigger of migration 0006 (a test compares them); types that
 * do not exist yet in the contract are listed so that their producers light their tab up without a new migration.
 */
export const SCANNED_EVENT_TYPES = [
  'handoff_requested',
  'budget_threshold_crossed',
  'session_state_changed',
  'kill_switch_toggled',
  'takeover_started',
  'sale_detected',
  'keyword_matched',
  'validation_requested',
  'validation_resolved',
] as const;

const URGENT_CAUSES: ReadonlySet<HandoffCause> = new Set([
  'minor',
  'non_consent',
  'distress',
  'meeting',
  'manipulation',
]);

/** `keyword` joins the contract's causes with #56; listed already so its text is ready. */
const CAUSE_TEXT: Readonly<Record<HandoffCause | 'keyword', string>> = {
  minor: 'Possible mineur dans la conversation.',
  non_consent: 'Possible contenu sans consentement.',
  distress: 'Le fan semble en détresse.',
  meeting: 'Le fan insiste pour une rencontre.',
  manipulation: 'Le fan tente de manipuler l’agent.',
  guard: 'Une réponse a été bloquée par une garde.',
  budget: 'Le plafond IA du jour est atteint.',
  keyword: 'Un mot surveillé a été écrit.',
  llm_unavailable: 'Le modèle ne répond plus.',
  other: 'L’agent ne sait pas répondre.',
};

const KILL_REASON_MAX = 200;

const euros = (minor: number): string =>
  `${(minor / 100).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;

const conversationLink = (conversationId: string | null): { label: string; path: string } => ({
  label: 'Ouvrir la conversation',
  path: conversationId === null ? '/suivi' : `/suivi?conversation=${conversationId}`,
});

function scopeLabel(scope: Signal & { kind: 'kill_switch' }): string {
  switch (scope.scope) {
    case 'global':
      return 'pour toutes les créatrices';
    case 'creator':
      return 'pour cette créatrice';
    case 'conversation':
      return 'pour une conversation';
  }
}

export function classify(signal: Signal): Outcome | null {
  switch (signal.kind) {
    case 'handoff': {
      const isUrgent = signal.cause !== null && URGENT_CAUSES.has(signal.cause);
      return {
        kind: 'notice',
        topic: isUrgent ? 'urgent' : 'important',
        threadKey: signal.conversationId === null ? null : `conversation:${signal.conversationId}`,
        title: isUrgent ? 'URGENT' : 'Important',
        body: `${signal.cause === null ? 'L’agent passe la main.' : CAUSE_TEXT[signal.cause]} Il n’écrit plus à ce fan et attend un humain.`,
        link: conversationLink(signal.conversationId),
      };
    }
    case 'takeover':
      return signal.conversationId === null
        ? null
        : {
            kind: 'closure',
            threadKey: `conversation:${signal.conversationId}`,
            mode: 'edit',
            text: 'Pris en main',
            userId: signal.userId,
          };
    case 'budget':
      return {
        kind: 'notice',
        topic: 'important',
        threadKey: null,
        title: 'Important',
        body:
          signal.threshold === 'reached'
            ? `Plafond IA atteint (${euros(signal.capMinor)}) : plus de génération jusqu’à minuit, les chatteurs reprennent.`
            : `Plafond IA : ${euros(signal.spentMinor)} sur ${euros(signal.capMinor)} aujourd’hui.`,
        link: { label: 'Voir les modèles IA', path: '/reglages/modeles-ia' },
      };
    case 'session_expired':
      return {
        kind: 'notice',
        topic: 'important',
        threadKey: `session:${signal.platformAccountId}`,
        title: 'Important',
        body: 'La session Reveal a expiré : l’agent ne lit plus les messages.',
        link: { label: 'Reconnecter la session', path: '/reglages' },
      };
    case 'session_back':
      return {
        kind: 'closure',
        threadKey: `session:${signal.platformAccountId}`,
        mode: 'reply',
        text: 'Résolu : la session est revenue.',
        userId: null,
      };
    case 'kill_switch': {
      const threadKey = `kill:${signal.scope}:${signal.scopeId ?? 'global'}`;
      if (!signal.active) {
        return {
          kind: 'closure',
          threadKey,
          mode: 'reply',
          text: 'Résolu : l’agent est relancé.',
          userId: null,
        };
      }
      const reason = signal.reason.trim().slice(0, KILL_REASON_MAX);
      return {
        kind: 'notice',
        topic: 'important',
        threadKey,
        title: 'Important',
        body: `Agent arrêté ${scopeLabel(signal)}${reason === '' ? '.' : ` : ${reason}`}`,
        link: { label: 'Ouvrir le CRM', path: '/' },
      };
    }
  }
}
