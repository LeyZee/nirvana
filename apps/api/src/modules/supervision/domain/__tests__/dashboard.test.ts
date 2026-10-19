import { CreatorIdSchema, DashboardSchema, type AutomaticGate } from '@nirvana/contracts';
import { describe, expect, it } from 'vitest';

import { assembleDashboard, todos } from '../dashboard';
import type { DashboardFacts, TelegramReading } from '../dashboard-ports';

const NOW = new Date('2026-10-17T21:30:00.000Z');
const CONVERSATION = '9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d';
const FAN = '5d2e8c1a-7b3f-4a9e-8c6d-1e2f3a4b5c6d';
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

const FACTS: DashboardFacts = {
  creator: { name: 'Lina', timezone: 'Europe/Paris' },
  switches: { global: false, creator: false },
  autoConversations: 0,
  decided: Array.from({ length: 10 }, (_, i) => ({ asIs: i < 8 })),
  decidedThreeWeeksAgo: [],
  reveal: { connected: true, lastReadAt: minutesAgo(1), conversations: 4 },
  voice: { medianWriteMs: 1412.5, outageHoursLast7d: 0 },
  replies: { medianReplyMinutes: 3.25, fansWaitingOver10Min: 1, conversationsOpen: 2 },
  handoffsToday: [{ cause: 'meeting', count: 2 }],
  waiting: [],
  fans: [
    {
      id: FAN,
      name: 'Julien',
      firstSeenAt: minutesAgo(600),
      spentMinor: 4_500,
      byAgentMinor: 3_000,
      notes: ['Habite à Nantes'],
      alert: undefined,
    },
  ],
};

const assemble = (
  facts: Partial<DashboardFacts> = {},
  telegram: TelegramReading | 'off' = { alertsTonight: 3, urgentReachable: false },
  automatic: AutomaticGate = { open: false, missing: [{ kind: 'blind_test' }] },
) =>
  assembleDashboard({
    creatorId: CreatorIdSchema.parse('0b9d4b7e-2f7a-4c1e-9a55-3d1f0c2b8e41'),
    period: 'day',
    facts: { ...FACTS, ...facts },
    window: {
      now: NOW,
      dayStart: minutesAgo(23 * 60),
      periodStart: minutesAgo(23 * 60),
      voice: { voicePrompt: '1.5.0', voiceModel: 'grok-4.7' },
    },
    budget: { spentEur: 3.204, capEur: 20, alertAtEur: 16 },
    isVoiceOk: true,
    telegram: telegram === 'off' ? undefined : telegram,
    automatic,
  });

describe('dashboard', () => {
  it('fits the contract, in euros and %', () => {
    const dashboard = DashboardSchema.parse(assemble());
    expect(dashboard.liveRate).toEqual({ rate: 80, target: 80, decided: 10, threeWeeksAgo: null });
    expect(dashboard.fans[0]).toMatchObject({ spent: 45, byAgent: 30 });
    expect(dashboard.budget.spentToday).toBe(3.2);
    expect(dashboard.guards.today.meeting).toBe(2);
    expect(dashboard.guards.today.minor).toBe(0);
    expect(dashboard.guards.telegramAlertsTonight).toBe(3);
    expect(dashboard.telegramCoverage).toEqual({ urgentReachable: false });
  });

  it('says Telegram is off rather than that no alert gets through', () => {
    const dashboard = DashboardSchema.parse(assemble({}, 'off'));
    expect(dashboard.guards.telegramAlertsTonight).toBeNull();
    expect(dashboard.telegramCoverage).toBeNull();
  });

  it('shows the lock as conversations reads it, never recomputed from the live rate', () => {
    const full = { decided: Array.from({ length: 150 }, () => ({ asIs: true })) };
    expect(assemble(full).automatic).toEqual({ open: false, missing: [{ kind: 'blind_test' }] });
    expect(assemble(full, 'off', { open: true, missing: [] }).automatic).toEqual({ open: true, missing: [] });
  });

  it('says Arrêt over everything, and Automatique when a conversation runs on its own', () => {
    const hers = assemble({ switches: { global: false, creator: true }, autoConversations: 3 });
    expect(hers).toMatchObject({ mode: 'stop', globalStop: false });
    const everyone = assemble({ switches: { global: true, creator: false } });
    expect(everyone).toMatchObject({ mode: 'stop', globalStop: true });
    expect(assemble({ autoConversations: 1 }).mode).toBe('auto');
    expect(assemble().mode).toBe('copilot');
  });
});

describe('à traiter', () => {
  it('puts a possible minor first, then the longest waiting', () => {
    const list = todos(
      [
        {
          conversationId: CONVERSATION,
          fanId: FAN,
          fanName: 'A',
          kind: 'awaiting_approval',
          since: minutesAgo(40),
        },
        { conversationId: CONVERSATION, fanId: FAN, fanName: 'B', kind: 'meeting', since: minutesAgo(15) },
        { conversationId: CONVERSATION, fanId: FAN, fanName: 'C', kind: 'minor', since: minutesAgo(5) },
      ],
      NOW,
    );
    expect(list.map((t) => [t.title, t.tone, t.waitingMinutes])).toEqual([
      ['C', 'bad', 5],
      ['A', 'warn', 40],
      ['B', 'warn', 15],
    ]);
  });
});
