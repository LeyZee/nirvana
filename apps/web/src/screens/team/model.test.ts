import {
  CommissionPresetSchema,
  TeamMemberSchema,
  TimezoneSchema,
  type TeamMember,
} from '@nirvana/contracts';
import { describe, expect, it } from 'vitest';

import {
  FIRST_COUNTRIES,
  formatRate,
  invitationState,
  listMembers,
  matches,
  OTHER_COUNTRIES,
  parseRate,
  parseTeamSearch,
  rateLine,
  suggestedZone,
  teamSummary,
} from './model';

import { countryName } from '@/lib/country';

/* Invented members: no real data (ADR 0010). */
let next = 0;
function member(patch: Partial<TeamMember> = {}): TeamMember {
  next += 1;
  return TeamMemberSchema.parse({
    id: `0199f2a0-0000-7000-8000-0000000000${String(10 + next)}`,
    userId: `0199f2a0-0000-7000-8000-0000000001${String(10 + next)}`,
    email: 'theo@example.test',
    firstName: 'Théo',
    lastName: 'Martin',
    displayName: 'Théo',
    teamRole: 'chatter',
    status: 'active',
    country: 'BJ',
    timeZone: 'Africa/Porto-Novo',
    color: null,
    joinedOn: '2026-10-01',
    creatorIds: [],
    commission: null,
    invitationPending: false,
    invitationExpiresAt: null,
    ...patch,
  });
}

const PRESET = '0199f2a0-0000-7000-8000-0000000000b1';
const presets = [
  CommissionPresetSchema.parse({ id: PRESET, name: 'Confirmé', rateBps: 1500, effectiveFrom: '2026-10-01' }),
];

describe('the list', () => {
  const team = [
    member({ displayName: 'Basile', status: 'on_leave' }),
    member({ displayName: 'Théo' }),
    member({ displayName: 'Aïcha', status: 'suspended' }),
    member({ displayName: 'Jules', status: 'left' }),
    member({ displayName: 'Inès', teamRole: 'manager' }),
  ];

  it('puts those at work first, then away, then suspended, and folds those who left apart', () => {
    const lists = listMembers(team, 'chatter', '');
    expect(lists.current.map((m) => m.displayName)).toEqual(['Théo', 'Basile', 'Aïcha']);
    expect(lists.gone.map((m) => m.displayName)).toEqual(['Jules']);
  });

  it('counts each tab without those who left, whatever the search', () => {
    expect(listMembers(team, 'manager', 'zzz').counts).toEqual({ chatter: 3, manager: 1 });
  });

  it('finds a member by name, e-mail or country, accents and case aside', () => {
    const aicha = member({ displayName: 'Aïcha', firstName: 'Aïcha', lastName: 'Kpadé', country: 'MG' });
    expect(matches(aicha, 'aicha')).toBe(true);
    expect(matches(aicha, 'KPADE')).toBe(true);
    expect(matches(aicha, 'madag')).toBe(true);
    expect(matches(aicha, 'benin')).toBe(false);
    expect(matches(aicha, '  ')).toBe(true);
  });

  it('says how many work, are away and still have to sign in', () => {
    expect(teamSummary(team)).toBe('2 actifs · 1 absent');
    expect(teamSummary([member({ invitationPending: true })])).toBe('1 actif · 1 invitation en attente');
    expect(teamSummary([member({ status: 'left' })])).toBeNull();
  });
});

describe('rates', () => {
  it('reads basis points as people do', () => {
    expect(formatRate(1250)).toMatch(/^12,5\s%$/u);
    expect(formatRate(1500)).toMatch(/^15\s%$/u);
  });

  it('takes a rate typed with a comma or a dot, and nothing over 100 % or finer than a hundredth', () => {
    expect(parseRate('12,5')).toBe(1250);
    expect(parseRate('12.5 %')).toBe(1250);
    expect(parseRate('100')).toBe(10_000);
    expect(parseRate('100,01')).toBeNull();
    expect(parseRate('1,255')).toBeNull();
    expect(parseRate('')).toBeNull();
    expect(parseRate('douze')).toBeNull();
  });

  it('names the preset a rate comes from', () => {
    const from = { rateBps: 1500, presetId: PRESET };
    expect(rateLine(from, presets)).toMatch(/^Confirmé · 15\s%$/u);
    expect(rateLine({ rateBps: 1250, presetId: null }, presets)).toMatch(/^12,5\s%$/u);
    expect(rateLine(null, presets)).toBe('Pas encore de taux');
  });
});

describe('countries and zones', () => {
  it('lists every country once, Bénin, Madagascar and France first', () => {
    const codes = [...FIRST_COUNTRIES, ...OTHER_COUNTRIES.map((c) => c.code)];
    expect(codes).toHaveLength(249);
    expect(new Set(codes).size).toBe(249);
    expect(FIRST_COUNTRIES.map(countryName)).toEqual(['Bénin', 'Madagascar', 'France']);
  });

  it('proposes the zone of the country, and a real one each time', () => {
    expect(suggestedZone('BJ')).toBe('Africa/Porto-Novo');
    expect(suggestedZone('MG')).toBe('Indian/Antananarivo');
    expect(suggestedZone('FR')).toBe('Europe/Paris');
    expect(suggestedZone('AQ')).toBeNull();
    for (const country of OTHER_COUNTRIES) {
      const zone = suggestedZone(country.code);
      if (zone !== null) expect(TimezoneSchema.safeParse(zone).success, country.code).toBe(true);
    }
  });
});

describe('the first access', () => {
  const now = new Date('2026-10-27T12:00:00Z');

  it('tells a member who signed in from one still invited, with or without a live link', () => {
    expect(invitationState(member(), now).kind).toBe('signed-in');
    // A reset link out for one who signed in: said, so that a second one does not cancel it unawares.
    expect(invitationState(member({ invitationExpiresAt: '2026-10-28T12:00:00.000Z' }), now)).toEqual({
      kind: 'reset-sent',
      until: new Date('2026-10-28T12:00:00.000Z'),
    });
    expect(invitationState(member({ invitationExpiresAt: '2026-10-26T12:00:00.000Z' }), now).kind).toBe(
      'signed-in',
    );
    expect(invitationState(member({ invitationPending: true }), now).kind).toBe('no-link');
    expect(
      invitationState(
        member({ invitationPending: true, invitationExpiresAt: '2026-10-30T12:00:00.000Z' }),
        now,
      ),
    ).toEqual({ kind: 'valid', until: new Date('2026-10-30T12:00:00.000Z') });
    expect(
      invitationState(
        member({ invitationPending: true, invitationExpiresAt: '2026-10-26T12:00:00.000Z' }),
        now,
      ).kind,
    ).toBe('expired');
  });
});

describe('the address', () => {
  it('keeps the managers tab and a member id, and drops anything else', () => {
    const id = '0199f2a0-0000-7000-8000-0000000000a1';
    expect(parseTeamSearch({ onglet: 'managers', membre: id })).toEqual({ onglet: 'managers', membre: id });
    expect(parseTeamSearch({ onglet: 'chatteurs', membre: 'x', autre: 1 })).toEqual({});
  });
});
