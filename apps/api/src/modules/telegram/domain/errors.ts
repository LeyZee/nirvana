import { DomainError } from '@nirvana/contracts';

/** Refusals of `/v1/settings/telegram` in the common error body (api.md § Erreurs): the suffix gives the HTTP status. */

/** No bot has this id (404). */
export class TelegramBotNotFound extends DomainError {
  constructor() {
    super('telegram_bot_not_found', 'Bot Telegram introuvable');
  }
}

/** No group has this id (404). */
export class TelegramChatNotFound extends DomainError {
  constructor() {
    super('telegram_chat_not_found', 'Groupe Telegram introuvable');
  }
}

/** A route names a group no bot sees any more (400): nothing is saved. */
export class TelegramChatInvalid extends DomainError {
  constructor() {
    super('telegram_chat_invalid', 'Un groupe choisi n’existe plus : recharge la page');
  }
}
