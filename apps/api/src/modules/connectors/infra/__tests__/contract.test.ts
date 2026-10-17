import { describe, expect, it } from 'vitest';

import { ConnectorError, type PlatformConnector } from '../../domain/platform-connector';
import { FakeConnector } from '../fake/FakeConnector';

/** What a contract case needs: a connector, and a way to make the platform do what a scenario says. */
interface ContractSubject {
  readonly connector: PlatformConnector;
  fanWrites(conversationId: string, text: string): Promise<void>;
  failNextSend(code: 'rate_limited' | 'transient'): Promise<void>;
  expireSession(): Promise<void>;
}

/**
 * The port's contract (connectors.md), one suite for every adapter: `FakeConnector` now, `RevealApiConnector`
 * against FakeReveal in phase 1. A new adapter is added to `SUBJECTS` and must pass unchanged.
 */
const SUBJECTS: Record<string, () => ContractSubject> = {
  FakeConnector: () => {
    const fake = new FakeConnector();
    return {
      connector: fake,
      fanWrites: (conversationId, text) => {
        fake.enqueueInbound({
          conversationId,
          fanId: `fan-${conversationId}`,
          fanDisplayName: 'Julien',
          text,
        });
        return Promise.resolve();
      },
      failNextSend: (code) => {
        fake.failNext('sendText', code);
        return Promise.resolve();
      },
      expireSession: () => {
        fake.expireSession();
        return Promise.resolve();
      },
    };
  },
};

async function rejection(promise: Promise<unknown>): Promise<ConnectorError> {
  const error: unknown = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  if (!(error instanceof ConnectorError)) throw new Error(`expected a ConnectorError, got ${String(error)}`);
  return error;
}

describe.each(Object.entries(SUBJECTS))('PlatformConnector contract: %s', (_name, make) => {
  it('reports a valid session and lists conversations, most recent first, with their fan', async () => {
    const subject = make();
    await subject.fanWrites('c-1', 'Salut');
    await subject.fanWrites('c-2', 'Coucou');
    expect(await subject.connector.health()).toBe('valid');
    const conversations = await subject.connector.listConversations({});
    expect(conversations.map((c) => c.ref.id)).toEqual(['c-2', 'c-1']);
    expect(conversations[0]).toMatchObject({ fanRef: { id: 'fan-c-2' }, fanDisplayName: 'Julien' });
  });

  it('fetches messages incrementally with `since`', async () => {
    const subject = make();
    await subject.fanWrites('c-1', 'Un');
    const ref = { platform: subject.connector.platform, id: 'c-1' };
    const first = await subject.connector.fetchMessages(ref, {});
    expect(first.map((m) => m.text)).toEqual(['Un']);
    await subject.fanWrites('c-1', 'Deux');
    const since = new Date(first.at(-1)?.createdAt ?? 0);
    const next = await subject.connector.fetchMessages(ref, { since });
    expect(next.map((m) => m.text)).toEqual(['Deux']);
    expect((await subject.connector.listConversations({ since })).map((c) => c.ref.id)).toEqual(['c-1']);
  });

  it('sends idempotently: two calls with one key are one message', async () => {
    const subject = make();
    await subject.fanWrites('c-1', 'Salut');
    const ref = { platform: subject.connector.platform, id: 'c-1' };
    const once = await subject.connector.sendText(ref, 'Coucou toi', 'key-1');
    const twice = await subject.connector.sendText(ref, 'Coucou toi', 'key-1');
    expect(twice.messageRef).toEqual(once.messageRef);
    const outbound = (await subject.connector.fetchMessages(ref, {})).filter(
      (m) => m.direction === 'outbound',
    );
    expect(outbound.map((m) => m.text)).toEqual(['Coucou toi']);
  });

  it('verifies a send by its key', async () => {
    const subject = make();
    await subject.fanWrites('c-1', 'Salut');
    const ref = { platform: subject.connector.platform, id: 'c-1' };
    expect(await subject.connector.verifySent(ref, 'key-1')).toEqual({ status: 'not_found' });
    const sent = await subject.connector.sendText(ref, 'Coucou', 'key-1');
    expect(await subject.connector.verifySent(ref, 'key-1')).toEqual({
      status: 'sent',
      messageRef: sent.messageRef,
    });
  });

  it('fails with typed errors only', async () => {
    const subject = make();
    await subject.fanWrites('c-1', 'Salut');
    const ref = { platform: subject.connector.platform, id: 'c-1' };
    await subject.failNextSend('rate_limited');
    const limited = await rejection(subject.connector.sendText(ref, 'Coucou', 'key-1'));
    expect(limited.code).toBe('rate_limited');
    // The failed call sent nothing: the same key goes through afterwards.
    expect(await subject.connector.verifySent(ref, 'key-1')).toEqual({ status: 'not_found' });
    await subject.connector.sendText(ref, 'Coucou', 'key-1');
    const missing = await rejection(
      subject.connector.fetchMessages({ platform: subject.connector.platform, id: 'nope' }, {}),
    );
    expect(missing.code).toBe('not_found');
  });

  it('reports an expired session, and every call then fails with `session_expired`', async () => {
    const subject = make();
    await subject.fanWrites('c-1', 'Salut');
    await subject.expireSession();
    expect(await subject.connector.health()).toBe('expired');
    expect((await rejection(subject.connector.listConversations({}))).code).toBe('session_expired');
  });
});
