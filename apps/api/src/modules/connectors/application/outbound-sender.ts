import type { ExternalRef } from '@nirvana/contracts';

import type { OutboundSender } from '../../conversations';
import { ConnectorFailed, ConnectorUnavailable, PlatformAccountNotFound } from '../domain/errors';
import { ConnectorError, type PlatformConnector } from '../domain/platform-connector';
import type { AccountStore, Clock } from '../domain/ports';

import type { ConnectorResolver } from './resolver';

type ConversationKey = Parameters<OutboundSender['sendText']>[0];

/**
 * The `OutboundSender` port of `conversations` (modules.md, inversion): resolves the conversation's account and
 * connector, and turns a `ConnectorError` into a `DomainError` (`connector_rate_limited`…) the send job records.
 * An expired session also stops the account, as a poll would.
 */
export function createOutboundSender(deps: {
  readonly accounts: AccountStore;
  readonly resolver: ConnectorResolver;
  readonly clock: Clock;
}): OutboundSender {
  async function run<T>(
    conversation: ConversationKey,
    action: (connector: PlatformConnector, ref: ExternalRef) => Promise<T>,
  ): Promise<T> {
    const account = await deps.accounts.get(conversation.creatorId, conversation.platformAccountId);
    if (account === null) throw new PlatformAccountNotFound();
    const connector = await deps.resolver.forAccount(account);
    if (connector === null) throw new ConnectorUnavailable();
    try {
      return await action(connector, { platform: account.platform, id: conversation.platformConversationId });
    } catch (error) {
      if (!(error instanceof ConnectorError)) throw error;
      if (error.code === 'session_expired') {
        await deps.accounts.setSessionState(account.creatorId, account.id, 'expired', {
          correlationId: `send:${conversation.id}`,
          at: deps.clock.now(),
        });
      }
      throw new ConnectorFailed(error.code, { cause: error });
    }
  }

  return {
    sendText: (conversation, text, key) => run(conversation, (c, ref) => c.sendText(ref, text, key)),
    sendMedia: (conversation, media, key) => run(conversation, (c, ref) => c.sendMedia(ref, media, key)),
    verifySent: (conversation, key) => run(conversation, (c, ref) => c.verifySent(ref, key)),
  };
}
