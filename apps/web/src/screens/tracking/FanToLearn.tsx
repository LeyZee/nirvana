import { KYC_SLOT_LABELS, type KycSlot } from '@nirvana/contracts';
import { useQuery } from '@tanstack/react-query';
import type { JSX } from 'react';

import { fetchFanKyc } from './api';

/** A fact the agent learns comes with one of his messages: read again now and then, like the reader. */
const REFRESH_MS = 30_000;

/** « Localisation, Métier »: the canvas lines left, in her persona's order, word for word. */
export const toLearnLine = (slots: readonly KycSlot[]): string =>
  slots.map((slot) => KYC_SLOT_LABELS[slot]).join(', ');

/**
 * What she has still to learn about him (P5-01), among the canvas lines her persona collects: one quiet line next to
 * his limits. Nothing once every line is learnt, and nothing while it loads or when the server does not answer: the
 * reader already says so, and this line never stops the agent.
 */
export function FanToLearn({ creatorId, fanId }: { creatorId: string; fanId: string }): JSX.Element | null {
  const query = useQuery({
    queryKey: ['fan-kyc', creatorId, fanId],
    queryFn: () => fetchFanKyc(creatorId, fanId),
    refetchInterval: REFRESH_MS,
  });
  const slots = query.data;
  if (slots === undefined || slots.length === 0) return null;
  return (
    <p className="tr-learn">
      <span className="tr-learn__title">À apprendre</span>
      <span className="tr-learn__slots">{toLearnLine(slots)}</span>
    </p>
  );
}
