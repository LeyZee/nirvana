import { describe, expect, it } from 'vitest';

import { alertTriggerReason, AlertTriggerQuerySchema } from './alert-history';
import { AlertTriggerSchema } from './alerts';

const CREATOR = '01900000-0000-7000-8000-000000000010';
const ALERT = '01900000-0000-7000-8000-000000000030';

describe('history of her alerts (P4-01)', () => {
  it('writes its line from the alert and the word she declared, never from the fan', () => {
    const custom = (matchedBy: 'keyword' | 'model', keyword?: string) =>
      AlertTriggerSchema.parse({ alert: { kind: 'custom', id: ALERT }, matchedBy, keyword });
    expect(alertTriggerReason(custom('keyword', 'appel'), 'Appel')).toBe(
      'Le fan a écrit « appel », un mot de l’alerte « Appel ».',
    );
    expect(alertTriggerReason(custom('model'), 'Appel')).toBe(
      'Le message du fan correspond à l’alerte « Appel ».',
    );
    const system = AlertTriggerSchema.parse({
      alert: { kind: 'system', code: 'keyword' },
      matchedBy: 'keyword',
      keyword: 'snap',
    });
    expect(alertTriggerReason(system, 'Mot-clé de sa persona')).toBe(
      'Le fan a écrit « snap », un mot surveillé de sa persona.',
    );
  });

  it('reads its filters from the query string', () => {
    expect(AlertTriggerQuerySchema.parse({ creatorId: CREATOR, seen: 'false' })).toMatchObject({
      seen: false,
      limit: 50,
    });
    expect(AlertTriggerQuerySchema.parse({ creatorId: CREATOR, alert: 'service_request' }).alert).toBe(
      'service_request',
    );
    expect(AlertTriggerQuerySchema.safeParse({ creatorId: CREATOR, alert: 'other' }).success).toBe(false);
    expect(AlertTriggerQuerySchema.safeParse({ seen: 'true' }).success).toBe(false);
  });
});
