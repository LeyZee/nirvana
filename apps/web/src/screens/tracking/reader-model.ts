import {
  ApiErrorSchema,
  GuardCodeSchema,
  type ConversationEventView,
  type DashboardTodo,
  type MessageView,
} from '@nirvana/contracts';
import { z } from 'zod';

import { CAUSE_LABELS } from '@/agent/causes';
import { GUARD_LABELS } from '@/agent/guards';

/*
 * The reader of Suivi in words: the thread in reading order, the agent's notes where it stopped or a human stepped
 * in, and why a decision on a draft did not go through. Pure functions: the screen only lays them out.
 */

/** A line of « À traiter », in the words of the todo the server computed. */
export function todoLabel(todo: DashboardTodo): string {
  if (todo.kind === 'awaiting_approval') return 'Brouillon à valider';
  if (todo.kind === 'send_failed') return 'Envoi échoué';
  if (todo.kind === 'unanswered') return 'Sans réponse';
  return CAUSE_LABELS[todo.kind];
}

export type ThreadItem =
  | {
      readonly kind: 'message';
      readonly id: string;
      readonly from: 'fan' | 'creator';
      /** Outbound only: written by a person (in Reveal), not by the agent. */
      readonly byHuman: boolean;
      readonly text: string;
      /** A paid media: its price, and whether he bought it. */
      readonly ppv: { readonly price: string; readonly isPaid: boolean } | null;
    }
  | { readonly kind: 'note'; readonly id: string; readonly text: string };

const euros = (minor: number): string =>
  `${(minor / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}\u00a0€`;

const withReason = (text: string, reason: string | undefined): string =>
  reason === undefined ? text : `${text} : ${reason}`;

/** The note an event leaves in the thread, or null for the events the messages already show. */
function noteOf(event: ConversationEventView): string | null {
  if (event.type === 'handoff_requested')
    return withReason(`L’agent passe la main (${CAUSE_LABELS[event.payload.cause]})`, event.payload.reason);
  if (event.type === 'takeover_started') return withReason('Un humain reprend la main', event.payload.reason);
  if (event.type === 'takeover_ended') return 'La main revient à l’agent';
  if (event.type === 'draft_rejected') return withReason('Brouillon refusé', event.payload.reason);
  if (event.type === 'draft_expired') return withReason('Brouillon abandonné', event.payload.reason);
  if (event.type === 'send_failed' && event.payload.isFinal === true)
    return 'L’envoi a échoué, rien n’est parti';
  if (event.type === 'reply_skipped')
    return event.payload.reason === 'llm_unavailable'
      ? 'Aucune IA n’a répondu : pas de brouillon pour ce message'
      : 'L’agent n’a rien à répondre à ce message';
  return null;
}

/** Messages and notes in reading order, oldest first; the API pages both newest first. */
export function threadOf(read: {
  readonly messages: readonly MessageView[];
  readonly events: readonly ConversationEventView[];
}): ThreadItem[] {
  const timed: { readonly at: number; readonly item: ThreadItem }[] = [];
  for (const message of read.messages) {
    timed.push({
      at: Date.parse(message.platformCreatedAt),
      item: {
        kind: 'message',
        id: message.id,
        from: message.direction === 'inbound' ? 'fan' : 'creator',
        byHuman: message.direction === 'outbound' && message.author === 'human',
        text: message.text,
        ppv:
          message.priceMinor === null ? null : { price: euros(message.priceMinor), isPaid: message.isPaid },
      },
    });
  }
  for (const event of read.events) {
    const text = noteOf(event);
    if (text !== null)
      timed.push({
        at: Date.parse(event.createdAt),
        item: { kind: 'note', id: `e${String(event.seq)}`, text },
      });
  }
  // Stable: a message and a note at the same instant keep the message first.
  return timed.sort((a, b) => a.at - b.at).map((t) => t.item);
}

/** The latest handoff, when the conversation is a human's because the agent stepped back. */
export function lastHandoff(read: { readonly events: readonly ConversationEventView[] }): string | null {
  const event = read.events.find((e) => e.type === 'handoff_requested');
  return event === undefined ? null : noteOf(event);
}

/** What a hard guard found in a draft, in the words of the person deciding. */
/** The codes a refusal names; one this screen does not know yet is left out, never shown raw. */
const GuardsSchema = z.object({ guards: z.array(z.string()) });

/** Why an approval, a refusal or a takeover did not go through: the draft stays as it was, the sentence says why. */
export function decisionError(status: number, body: unknown): string {
  const error = ApiErrorSchema.safeParse(body);
  const code = error.success ? error.data.error.code : null;
  if (code === 'draft_unprocessable') {
    const guards = GuardsSchema.safeParse(error.success ? error.data.error.details : null);
    const found = guards.success
      ? guards.data.guards.flatMap((g) => {
          const code = GuardCodeSchema.safeParse(g);
          return code.success ? [GUARD_LABELS[code.data]] : [];
        })
      : [];
    return found.length === 0
      ? 'Ce message ne peut pas partir : une garde le bloque. Retouche-le ou refuse-le.'
      : `Ce message ne peut pas partir : ${[...new Set(found)].join(', ')}. Retouche-le ou refuse-le.`;
  }
  if (code === 'kill_switch_conflict')
    return 'L’arrêt est actif : rien ne part tant qu’il n’est pas levé sur le Dashboard.';
  if (code === 'session_expired_conflict')
    return 'La session Reveal a expiré : rien ne part tant qu’elle n’est pas reconnectée depuis l’extension.';
  if (code === 'draft_conflict' || code === 'transition_conflict')
    return 'La conversation a changé entre-temps : ce brouillon n’attend plus de décision.';
  if (status === 400)
    return 'Ce message ne peut pas partir tel quel : une bulle est vide ou trop longue (2 000 caractères au plus, 10 bulles au plus).';
  if (status === 401) return 'Ta session a expiré : reconnecte-toi.';
  if (status === 403) return 'Seuls le propriétaire et les chatteurs décident des brouillons.';
  if (status === 404) return 'Cette conversation ou ce brouillon n’existe plus.';
  return 'Le serveur ne répond pas : rien n’a changé. Réessaie dans un instant.';
}
