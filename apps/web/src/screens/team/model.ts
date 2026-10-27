import type {
  CommissionPreset,
  CreatorSummary,
  TeamMember,
  TeamMemberErrorCode,
  TeamMemberStatus,
  TeamRole,
} from '@nirvana/contracts';

/**
 * Équipe › Membres, without React (EQ-01): who shows in which tab, how a status, a rate, a country and an invitation
 * read, and what each refusal of the server says. The server decides; this only says it.
 */

/** The glossary's words (« Membre de l'équipe »), as a pill. */
export const STATUS_LABELS: Readonly<Record<TeamMemberStatus, string>> = {
  active: 'Actif',
  on_leave: 'En congé',
  sick: 'Malade',
  travelling: 'En déplacement',
  suspended: 'Suspendu',
  left: 'Parti',
};

/** A status's tone: green at work, quiet while away, amber when suspended. Red stays for urgencies. */
export type StatusTone = 'ok' | 'away' | 'warn' | 'gone';
export const STATUS_TONES: Readonly<Record<TeamMemberStatus, StatusTone>> = {
  active: 'ok',
  on_leave: 'away',
  sick: 'away',
  travelling: 'away',
  suspended: 'warn',
  left: 'gone',
};

export const ROLE_LABELS: Readonly<Record<TeamRole, string>> = { chatter: 'Chatteur', manager: 'Manager' };

/** The two tabs of the list, in the plural. */
export const TAB_LABELS: Readonly<Record<TeamRole, string>> = { chatter: 'Chatteurs', manager: 'Managers' };

const fold = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

/** Whether a member answers a search: his names, his e-mail or his country, accents and case aside. */
export function matches(member: TeamMember, query: string): boolean {
  const wanted = fold(query);
  if (wanted === '') return true;
  const haystack = [
    member.displayName,
    member.firstName,
    member.lastName,
    member.email,
    countryName(member.country),
  ];
  return haystack.some((text) => fold(text).includes(wanted));
}

export interface MemberLists {
  /** The members of the tab who answer the search and have not left, in the order below. */
  readonly current: readonly TeamMember[];
  /** Those who left, folded at the foot of the list: never deleted (EQ-14). */
  readonly gone: readonly TeamMember[];
  /** How many have not left, per tab, search aside: the counts on the tabs. */
  readonly counts: Readonly<Record<TeamRole, number>>;
}

const ORDER: readonly TeamMemberStatus[] = ['active', 'travelling', 'on_leave', 'sick', 'suspended', 'left'];

/** Split and order: at work first, then away, then suspended; by name inside each. */
export function listMembers(members: readonly TeamMember[], tab: TeamRole, query: string): MemberLists {
  const counts: Record<TeamRole, number> = { chatter: 0, manager: 0 };
  for (const member of members) if (member.status !== 'left') counts[member.teamRole] += 1;
  const shown = members
    .filter((member) => member.teamRole === tab && matches(member, query))
    .toSorted(
      (a, b) =>
        ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || a.displayName.localeCompare(b.displayName, 'fr'),
    );
  return {
    current: shown.filter((member) => member.status !== 'left'),
    gone: shown.filter((member) => member.status === 'left'),
    counts,
  };
}

/** The sentence under the title: how many are at work, away, and still to sign in. */
export function teamSummary(members: readonly TeamMember[]): string | null {
  const here = members.filter((member) => member.status !== 'left');
  if (here.length === 0) return null;
  const active = here.filter((member) => member.status === 'active').length;
  const away = here.filter((member) => STATUS_TONES[member.status] === 'away').length;
  const pending = here.filter((member) => member.invitationPending).length;
  const parts = [`${String(active)} actif${active > 1 ? 's' : ''}`];
  if (away > 0) parts.push(`${String(away)} absent${away > 1 ? 's' : ''}`);
  if (pending > 0) parts.push(`${String(pending)} invitation${pending > 1 ? 's' : ''} en attente`);
  return parts.join(' · ');
}

const PERCENT = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 2 });

/** A rate in basis points as people read it: 1250 → « 12,5 % ». */
export const formatRate = (bps: number): string => PERCENT.format(bps / 10_000);

/**
 * A rate typed by hand, « 12,5 » or « 12.5 » (in %), in basis points; `null` when it is not one (empty, over 100 %,
 * finer than a hundredth of a point).
 */
export function parseRate(text: string): number | null {
  const trimmed = text.trim().replace(',', '.').replace(/\s*%$/u, '');
  if (!/^\d{1,3}(\.\d{1,2})?$/u.test(trimmed)) return null;
  const bps = Math.round(Number(trimmed) * 100);
  return bps <= 10_000 ? bps : null;
}

/** The line of a rate: the preset's name when it comes from one, then the figure. */
export function rateLine(
  commission: { readonly rateBps: number; readonly presetId: string | null } | null,
  presets: readonly CommissionPreset[],
): string {
  if (commission === null) return 'Pas encore de taux';
  const preset = presets.find((p) => p.id === commission.presetId);
  return preset === undefined
    ? formatRate(commission.rateBps)
    : `${preset.name} · ${formatRate(commission.rateBps)}`;
}

/** Every ISO 3166-1 country, for the list of the add panel. */
const CODES =
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW';

/** Where the agency's chatters live (Charles, 27/10): first in the list. */
export const FIRST_COUNTRIES: readonly string[] = ['BJ', 'MG', 'FR'];

const NAMES = new Intl.DisplayNames(['fr'], { type: 'region' });

/** A country's name in French, or its code when the browser does not know it. */
export const countryName = (code: string): string => NAMES.of(code) ?? code;

/** The flag emoji, from the two regional letters. Windows draws the letters instead, which still reads. */
export const flagOf = (code: string): string =>
  String.fromCodePoint(
    ...code
      .toUpperCase()
      .split('')
      .map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65),
  );

export interface Country {
  readonly code: string;
  readonly name: string;
}

/** The other countries, by their French name. */
export const OTHER_COUNTRIES: readonly Country[] = CODES.split(' ')
  .filter((code) => !FIRST_COUNTRIES.includes(code))
  .map((code) => ({ code, name: countryName(code) }))
  .toSorted((a, b) => a.name.localeCompare(b.name, 'fr'));

/**
 * The zone the panel proposes for a country (editable): the main one where a country has several. Unlisted countries
 * propose nothing, and the zone is picked by hand.
 */
const ZONES: Readonly<Record<string, string>> = {
  BJ: 'Africa/Porto-Novo',
  MG: 'Indian/Antananarivo',
  FR: 'Europe/Paris',
  BE: 'Europe/Brussels',
  BF: 'Africa/Ouagadougou',
  BI: 'Africa/Bujumbura',
  CA: 'America/Toronto',
  CD: 'Africa/Kinshasa',
  CF: 'Africa/Bangui',
  CG: 'Africa/Brazzaville',
  CH: 'Europe/Zurich',
  CI: 'Africa/Abidjan',
  CM: 'Africa/Douala',
  DE: 'Europe/Berlin',
  DJ: 'Africa/Djibouti',
  DZ: 'Africa/Algiers',
  ES: 'Europe/Madrid',
  GA: 'Africa/Libreville',
  GB: 'Europe/London',
  GF: 'America/Cayenne',
  GH: 'Africa/Accra',
  GN: 'Africa/Conakry',
  GP: 'America/Guadeloupe',
  HT: 'America/Port-au-Prince',
  IT: 'Europe/Rome',
  KM: 'Indian/Comoro',
  LU: 'Europe/Luxembourg',
  MA: 'Africa/Casablanca',
  MC: 'Europe/Monaco',
  ML: 'Africa/Bamako',
  MQ: 'America/Martinique',
  MU: 'Indian/Mauritius',
  NE: 'Africa/Niamey',
  NG: 'Africa/Lagos',
  PH: 'Asia/Manila',
  PT: 'Europe/Lisbon',
  RE: 'Indian/Reunion',
  RW: 'Africa/Kigali',
  SN: 'Africa/Dakar',
  TD: 'Africa/Ndjamena',
  TG: 'Africa/Lome',
  TN: 'Africa/Tunis',
  US: 'America/New_York',
  YT: 'Indian/Mayotte',
};

export const suggestedZone = (country: string): string | null => ZONES[country] ?? null;

/** Where a member's first access stands, read from his record and the clock. */
export type InvitationState =
  | { readonly kind: 'signed-in' }
  /** His password is chosen and a link to choose a new one is out: a second one would cancel it. */
  | { readonly kind: 'reset-sent'; readonly until: Date }
  | { readonly kind: 'no-link' }
  | { readonly kind: 'valid'; readonly until: Date }
  | { readonly kind: 'expired' };

export function invitationState(member: TeamMember, now: Date): InvitationState {
  const until = member.invitationExpiresAt === null ? null : new Date(member.invitationExpiresAt);
  const live = until !== null && until.getTime() > now.getTime();
  if (!member.invitationPending) {
    // An expired reset link changes nothing for him: he still signs in with his password.
    return live ? { kind: 'reset-sent', until } : { kind: 'signed-in' };
  }
  if (until === null) return { kind: 'no-link' };
  return live ? { kind: 'valid', until } : { kind: 'expired' };
}

const DAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', hour: 'numeric', minute: '2-digit' });

/** « jeudi 15 h 00 », in the reader's own zone. */
export const deadline = (at: Date): string => DAY.format(at).replace(':', ' h ');

/** A refusal the screen words: the module's codes, and the role guard when a manager's access changed meanwhile. */
export type TeamRefusalCode = TeamMemberErrorCode | 'role_forbidden';

/** What each refusal says, in the words of the screen (contracts `TEAM_MEMBER_ERROR_CODES`). */
export const ERROR_MESSAGES: Readonly<Record<TeamRefusalCode, string>> = {
  role_forbidden: 'Ton accès à l’équipe a changé. Recharge la page.',
  member_not_found: 'Ce membre n’existe plus. Recharge la page.',
  member_conflict: 'Un compte utilise déjà cet e-mail.',
  member_left_conflict: 'Ce membre est parti : sa fiche ne change plus.',
  commission_preset_not_found: 'Ce préréglage n’existe plus. Choisis-en un autre.',
  commission_preset_conflict: 'Ce préréglage a déjà un taux à partir de ce jour.',
  commission_rate_conflict: 'Ce membre a déjà un taux à partir de ce jour.',
  commission_date_invalid: 'Un taux commence aujourd’hui ou plus tard, jamais avant.',
  team_share_invalid: 'Seul un manager a une part du net de l’équipe.',
  creator_not_found: 'Une des créatrices n’existe plus. Recharge la page.',
};

/** A calendar day, `YYYY-MM-DD`, in the reader's own zone: today's date for « Arrivé le ». */
export const today = (now: Date = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

const LONG_DAY = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

/** « 27 octobre 2026 », from a calendar day. */
export const longDay = (day: string): string => LONG_DAY.format(new Date(`${day}T12:00:00`));

/** The initial of a name, for the avatar. */
export const initialOf = (name: string): string => name.trim().slice(0, 1).toUpperCase() || '?';

/** The creators of a member, by name, in the order of the list. */
export const creatorNames = (member: TeamMember, creators: readonly CreatorSummary[]): string[] =>
  creators.filter((creator) => member.creatorIds.includes(creator.id)).map((creator) => creator.displayName);

/** `/equipe?onglet=managers&membre=<id>`: the tab and the open member survive a reload and a back. */
export interface TeamSearch {
  readonly onglet?: 'managers' | undefined;
  readonly membre?: string | undefined;
}

/** Anything else in the address is ignored: a broken link opens the list, never an error. */
export function parseTeamSearch(search: Record<string, unknown>): TeamSearch {
  const { onglet, membre } = search;
  return {
    ...(onglet === 'managers' ? { onglet } : {}),
    ...(typeof membre === 'string' && /^[0-9a-f-]{36}$/iu.test(membre) ? { membre } : {}),
  };
}
