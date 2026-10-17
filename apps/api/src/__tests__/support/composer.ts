import type { DraftComposer } from '../../modules/conversations';

/** The draft every test conversation gets: fixed bubbles, no model, so a test never depends on a key. */
export const FIXED_BUBBLES = ['Coucou toi ✨', 'Tu fais quoi ce soir ?'] as const;

export const fixedComposer: DraftComposer = {
  compose: () => Promise.resolve({ kind: 'draft', bubbles: FIXED_BUBBLES, softViolations: [], costUsd: 0 }),
};
