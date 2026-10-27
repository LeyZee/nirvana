import {
  ConversationEventViewSchema,
  DashboardTodoSchema,
  MessageViewSchema,
  type ConversationEventView,
  type MessageView,
} from '@nirvana/contracts';
import { describe, expect, it } from 'vitest';

import { decisionError, lastHandoff, threadOf, todoLabel } from './reader-model';

/* Invented messages: no real fan. */
const CONVERSATION = '0192f3a0-0000-7000-8000-000000000001';

function message(n: number, patch: Partial<MessageView> = {}): MessageView {
  return MessageViewSchema.parse({
    id: `0192f3a0-0000-7000-8000-0000000001${String(n).padStart(2, '0')}`,
    direction: 'inbound',
    author: 'fan',
    text: `Message ${String(n)}`,
    priceMinor: null,
    currency: null,
    isPaid: false,
    draftId: null,
    platformCreatedAt: `2026-10-19T12:${String(n).padStart(2, '0')}:00Z`,
    ...patch,
  });
}

function event(seq: number, minute: number, body: Record<string, unknown>): ConversationEventView {
  return ConversationEventViewSchema.parse({
    seq,
    actor: 'system',
    createdAt: `2026-10-19T12:${String(minute).padStart(2, '0')}:30Z`,
    ...body,
  });
}

const apiError = (code: string, details: Record<string, unknown> = {}) => ({
  error: { code, message: 'x', details, requestId: 'r' },
});

describe('threadOf', () => {
  it('reads oldest first, and notes where the agent stepped back or a draft was refused', () => {
    const items = threadOf({
      // The API pages newest first.
      messages: [
        message(3, { direction: 'outbound', author: 'human', text: 'Je suis là' }),
        message(1, { priceMinor: 1500, currency: 'EUR', isPaid: true }),
      ],
      events: [
        event(3, 2, {
          type: 'handoff_requested',
          payload: { conversationId: CONVERSATION, cause: 'distress', reason: 'Il parle de tout arrêter' },
        }),
        event(2, 1, {
          type: 'draft_rejected',
          payload: {
            draftId: '0192f3a0-0000-7000-8000-0000000000d1',
            status: 'rejected',
            reason: 'Trop froid',
          },
        }),
        event(1, 1, {
          type: 'draft_created',
          payload: { draftId: '0192f3a0-0000-7000-8000-0000000000d1', status: 'pending' },
        }),
      ],
    });
    expect(items.map((i) => (i.kind === 'note' ? `note: ${i.text}` : `${i.from}: ${i.text}`))).toEqual([
      'fan: Message 1',
      'note: Brouillon refusé : Trop froid',
      'note: L’agent passe la main (Détresse) : Il parle de tout arrêter',
      'creator: Je suis là',
    ]);
    expect(items[0]).toMatchObject({ ppv: { price: '15 €', isPaid: true } });
    expect(items[3]).toMatchObject({ byHuman: true });
  });

  it('gives the latest handoff, for the line above the thread', () => {
    const events = [
      event(5, 9, { type: 'handoff_requested', payload: { conversationId: CONVERSATION, cause: 'meeting' } }),
      event(1, 1, { type: 'handoff_requested', payload: { conversationId: CONVERSATION, cause: 'minor' } }),
    ];
    expect(lastHandoff({ events })).toBe('L’agent passe la main (Demande de rencontre)');
    expect(lastHandoff({ events: [] })).toBeNull();
  });
});

describe('decisionError', () => {
  it('says which guard blocks a draft, in words', () => {
    expect(
      decisionError(422, apiError('draft_unprocessable', { guards: ['meeting_promise', 'contact_info'] })),
    ).toBe(
      'Ce message ne peut pas partir : une promesse de rencontre, des coordonnées. Retouche-le ou refuse-le.',
    );
    expect(decisionError(422, apiError('draft_unprocessable', { guards: ['discount'] }))).toBe(
      'Ce message ne peut pas partir : une remise ou une négociation. Retouche-le ou refuse-le.',
    );
    expect(decisionError(422, apiError('draft_unprocessable', { guards: ['explicit_before_age'] }))).toBe(
      'Ce message ne peut pas partir : du contenu explicite avant l’âge confirmé. Retouche-le ou refuse-le.',
    );
    expect(
      decisionError(422, apiError('draft_unprocessable', { guards: ['stage_direction', 'media_not_sent'] })),
    ).toBe(
      'Ce message ne peut pas partir : une didascalie (« *sourit* », « (rires) »), un média annoncé qui n’est pas joint. Retouche-le ou refuse-le.',
    );
    expect(
      decisionError(
        422,
        apiError('draft_unprocessable', {
          guards: ['platform_meeting_word', 'fake_emergency', 'not_a_guard'],
        }),
      ),
    ).toBe(
      'Ce message ne peut pas partir : un mot de rencontre que Reveal repère, une maladie, une dette ou une urgence pour vendre. Retouche-le ou refuse-le.',
    );
    expect(decisionError(422, apiError('draft_unprocessable'))).toBe(
      'Ce message ne peut pas partir : une garde le bloque. Retouche-le ou refuse-le.',
    );
  });

  it('says why nothing may leave, and blames the server only when it does not answer', () => {
    expect(decisionError(409, apiError('kill_switch_conflict'))).toContain('L’arrêt est actif');
    expect(decisionError(409, apiError('session_expired_conflict'))).toContain('La session Reveal a expiré');
    expect(decisionError(409, apiError('draft_conflict'))).toContain('a changé entre-temps');
    expect(decisionError(403, apiError('forbidden'))).toContain('Seuls le propriétaire et les chatteurs');
    expect(decisionError(400, apiError('draft_invalid'))).toBe(
      'Ce message ne peut pas partir tel quel : une bulle est vide ou trop longue (2 000 caractères au plus, 10 bulles au plus).',
    );
    expect(decisionError(401, apiError('unauthorized'))).toBe('Ta session a expiré : reconnecte-toi.');
    expect(decisionError(503, null)).toBe(
      'Le serveur ne répond pas : rien n’a changé. Réessaie dans un instant.',
    );
    expect(decisionError(0, null)).toBe(
      'Le serveur ne répond pas : rien n’a changé. Réessaie dans un instant.',
    );
  });
});

describe('todoLabel', () => {
  it('names each line of « À traiter », a send that failed for good included', () => {
    const todo = (kind: string) =>
      DashboardTodoSchema.parse({
        id: `${kind}-1`,
        tone: 'warn',
        kind,
        title: 'Fan',
        why: 'Pourquoi.',
        at: '2026-10-19T12:00:00Z',
        waitingMinutes: 3,
        conversationId: CONVERSATION,
        fanId: '0192f3a0-0000-7000-8000-000000000002',
      });
    expect(todoLabel(todo('send_failed'))).toBe('Envoi échoué');
    expect(todoLabel(todo('awaiting_approval'))).toBe('Brouillon à valider');
    expect(todoLabel(todo('unanswered'))).toBe('Sans réponse');
  });
});
