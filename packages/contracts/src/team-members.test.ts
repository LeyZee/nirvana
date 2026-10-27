import { describe, expect, it } from 'vitest';

import {
  CommissionChoiceSchema,
  CreateTeamMemberBodySchema,
  SetCommissionRateBodySchema,
  TeamMemberSchema,
  UpdateTeamMemberBodySchema,
} from './team-members';

const CREATOR = '0199f2a0-0000-7000-8000-0000000000c1';
const PRESET = '0199f2a0-0000-7000-8000-0000000000b1';

const created = {
  email: 'theo@example.test',
  firstName: 'Théo',
  lastName: 'Martin',
  displayName: 'Théo',
  teamRole: 'chatter',
  country: 'BJ',
  timeZone: 'Africa/Porto-Novo',
  joinedOn: '2026-10-27',
  commission: { presetId: PRESET },
};

describe('team members', () => {
  it('adds a member with a preset in one gesture, no creator and no colour yet', () => {
    const body = CreateTeamMemberBodySchema.parse(created);
    expect(body.creatorIds).toEqual([]);
    expect(body.color).toBeNull();
    expect(body.teamShareBps).toBeNull();
  });

  it('refuses an unknown time zone, a lower-case country and a rate over 100 %', () => {
    expect(CreateTeamMemberBodySchema.safeParse({ ...created, timeZone: 'Mars/Olympus' }).success).toBe(
      false,
    );
    expect(CreateTeamMemberBodySchema.safeParse({ ...created, country: 'bj' }).success).toBe(false);
    expect(CommissionChoiceSchema.safeParse({ rateBps: 10_001 }).success).toBe(false);
    expect(CommissionChoiceSchema.safeParse({ rateBps: 1250 }).success).toBe(true);
  });

  it('has no hourly rate anywhere: a member is paid by commission only (ADR 0023)', () => {
    const shapes = [CreateTeamMemberBodySchema, SetCommissionRateBodySchema];
    for (const shape of shapes) expect(JSON.stringify(Object.keys(shape.shape))).not.toMatch(/hour/iu);
  });

  it('changes only what is sent, and refuses an empty change', () => {
    expect(UpdateTeamMemberBodySchema.parse({ color: '#e8a33d' })).toEqual({ color: '#e8a33d' });
    expect(UpdateTeamMemberBodySchema.safeParse({}).success).toBe(false);
    expect(UpdateTeamMemberBodySchema.safeParse({ color: '#E8A33D' }).success).toBe(false);
  });

  it('reads a member whose invitation is still waiting and who has no rate yet', () => {
    const member = TeamMemberSchema.parse({
      ...created,
      id: '0199f2a0-0000-7000-8000-0000000000a1',
      userId: '0199f2a0-0000-7000-8000-0000000000e1',
      status: 'active',
      color: null,
      creatorIds: [CREATOR],
      commission: null,
      invitationPending: true,
    });
    expect(member.invitationPending).toBe(true);
  });
});
