import { DomainError, type ConversationState, type DraftStatus } from '@nirvana/contracts';

import type { ConversationCommand } from './state-machine';

/** Error codes of the module (api.md § Erreurs): the suffix gives the HTTP status. */

export class ConversationNotFound extends DomainError {
  constructor() {
    super('conversation_not_found', 'Conversation introuvable');
  }
}

export class DraftNotFound extends DomainError {
  constructor() {
    super('draft_not_found', 'Brouillon introuvable');
  }
}

/** A command the conversation's state does not allow (approving while a human holds it, for instance). */
export class TransitionConflict extends DomainError {
  constructor(state: ConversationState, command: ConversationCommand) {
    super('transition_conflict', `Action « ${command} » impossible dans l'état « ${state} »`);
  }
}

/** A draft that already left the status the action needs (approving a rejected draft, for instance). */
export class DraftConflict extends DomainError {
  constructor(from: DraftStatus, to: DraftStatus) {
    super('draft_conflict', `Brouillon « ${from} » : passage à « ${to} » impossible`);
  }
}
