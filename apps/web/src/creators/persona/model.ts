import {
  PERSONA_BLOCK_LABELS,
  KycSlotSchema,
  PERSONA_OPTIONS,
  personaCompletion,
  PersonaSchema,
  type Persona,
  type PersonaCompletion,
  type KycSlot,
  type PersonaDetails,
  type PersonaSampleReplyFault,
} from '@nirvana/contracts';
import type { z } from 'zod';

import { GUARD_LABELS } from '@/agent/guards';

/**
 * Rules of the persona screen, without React: its tabs (OnlyChat's, in OnlyChat's order, with the P5-01 blocks after
 * « Détails » and `limits` last), the validation by `PersonaSchema` with French messages, the one-line summaries of
 * folded blocks and the completion of what is written.
 */

export type TabId = Exclude<keyof Persona, 'meta'>;

export const TABS: readonly { readonly id: TabId; readonly label: string }[] = [
  { id: 'details', label: PERSONA_BLOCK_LABELS.details },
  { id: 'lifestyle', label: PERSONA_BLOCK_LABELS.lifestyle },
  { id: 'tastes', label: PERSONA_BLOCK_LABELS.tastes },
  { id: 'intimate', label: PERSONA_BLOCK_LABELS.intimate },
  { id: 'writing_style', label: PERSONA_BLOCK_LABELS.writing_style },
  { id: 'sample_replies', label: PERSONA_BLOCK_LABELS.sample_replies },
  { id: 'additional_info', label: 'Infos en plus' },
  { id: 'behavior', label: 'Comportement' },
  { id: 'strategies', label: 'Stratégies' },
  { id: 'follow_ups', label: 'Relances' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'limits', label: PERSONA_BLOCK_LABELS.limits },
];

/** One problem with the draft: the field it belongs to (`strategies.kyc.max_messages`) and what to fix. */
export interface FieldIssue {
  readonly field: string;
  readonly message: string;
}

const isTab = (key: string): key is TabId => TABS.some((tab) => tab.id === key);

/** Validates a draft; an empty list means it can be saved as a new version. */
export function validate(draft: Persona): FieldIssue[] {
  const result = PersonaSchema.safeParse(withoutPlaceholders(draft));
  if (result.success) return [];
  return result.error.issues.map((issue) => ({
    field: issue.path.map(String).join('.'),
    message: frenchMessage(issue),
  }));
}

/** The issues of a field, its list items included (`details.hobbies.2` belongs to `details.hobbies`). */
export function issuesOf(issues: readonly FieldIssue[], field: string): FieldIssue[] {
  return issues.filter((issue) => issue.field === field || issue.field.startsWith(`${field}.`));
}

/** How many issues each tab holds, for the badges of the tab bar. */
export function issueCountByTab(issues: readonly FieldIssue[]): Record<TabId, number> {
  const counts: Record<TabId, number> = {
    details: 0,
    lifestyle: 0,
    tastes: 0,
    intimate: 0,
    writing_style: 0,
    sample_replies: 0,
    additional_info: 0,
    behavior: 0,
    strategies: 0,
    follow_ups: 0,
    notifications: 0,
    limits: 0,
  };
  for (const issue of issues) {
    const tab = issue.field.split('.')[0] ?? '';
    if (isTab(tab)) counts[tab] += 1;
  }
  return counts;
}

const plural = (n: number, one: string, many: string): string => `${String(n)} ${n > 1 ? many : one}`;

/** Zod speaks English; the dashboard speaks French. Messages written in the schema are already French. */
function frenchMessage(issue: z.core.$ZodIssue): string {
  switch (issue.code) {
    case 'too_small': {
      const min = Number(issue.minimum);
      if (issue.origin === 'string')
        return min <= 1 ? 'À remplir' : `Au moins ${plural(min, 'caractère', 'caractères')}`;
      if (issue.origin === 'array') return `Au moins ${plural(min, 'entrée', 'entrées')}`;
      return `Au moins ${String(min)}`;
    }
    case 'too_big': {
      const max = Number(issue.maximum);
      if (issue.origin === 'string') return `${plural(max, 'caractère', 'caractères')} au plus`;
      if (issue.origin === 'array') return `${plural(max, 'entrée', 'entrées')} au plus`;
      return `${String(max)} au plus`;
    }
    case 'invalid_type':
      return issue.expected === 'number' || issue.expected === 'int' ? 'Nombre entier attendu' : 'À remplir';
    case 'invalid_format':
      return 'Format invalide';
    case 'invalid_value':
      return 'Choix hors liste';
    case 'custom':
    case 'invalid_element':
    case 'invalid_key':
    case 'invalid_union':
    case 'not_multiple_of':
    case 'unrecognized_keys':
      return issue.message;
  }
}

/** A placeholder of the repository's example persona (`<à remplir>`): shown as such, never as a real value. */
export function isPlaceholder(value: string): boolean {
  return /^<[^>]*>$/.test(value.trim());
}

/**
 * The persona as it is stored: a placeholder of the example is dropped from a list and emptied in a text, so that
 * the agent never reads `<à remplir>` and a required field left as such is refused.
 */
export function withoutPlaceholders(value: unknown): unknown {
  if (typeof value === 'string') return isPlaceholder(value) ? '' : value;
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item !== 'string' || !isPlaceholder(item)).map(withoutPlaceholders);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, withoutPlaceholders(item)]));
  }
  return value;
}

function labelOf<V extends string | number>(
  options: readonly { readonly value: V; readonly label: string }[],
  value: V,
): string {
  return options.find((option) => option.value === value)?.label ?? String(value);
}

export const hoursLabel = (h: number): string => `${String(h)} h`;

export function minutesLabel(m: number): string {
  if (m < 60) return `${String(m)} min`;
  const rest = m % 60;
  return rest === 0
    ? `${String(m / 60)} h`
    : `${String(Math.floor(m / 60))} h ${String(rest).padStart(2, '0')}`;
}

/** « 165 cm · cheveux noirs · yeux verts · 75C », or what to do when nothing is filled in. */
export function physiqueSummary(d: PersonaDetails): string {
  const parts = [
    d.height_cm === null ? null : `${String(d.height_cm)} cm`,
    d.weight_kg === null ? null : `${String(d.weight_kg)} kg`,
    d.shoe_size_eu === null ? null : `pointure ${String(d.shoe_size_eu)}`,
    d.hair === null ? null : `cheveux ${labelOf(PERSONA_OPTIONS.hair, d.hair).toLocaleLowerCase('fr')}`,
    d.eyes === null ? null : `yeux ${labelOf(PERSONA_OPTIONS.eyes, d.eyes).toLocaleLowerCase('fr')}`,
    d.bra === null ? null : `${String(d.bra.band)}${d.bra.cup}`,
  ].filter((part): part is string => part !== null);
  return parts.length === 0 ? 'Rien de renseigné' : parts.join(' · ');
}

const styleOf = (style: string): string =>
  style === 'custom' ? 'Personnalisé' : style === 'normal' ? 'Normal' : 'Par défaut';

/** The line each strategy shows while folded: its style, then the numbers the policy enforces. */
export function strategySummaries(s: Persona['strategies']): Record<keyof Persona['strategies'], string> {
  return {
    kyc: `${styleOf(s.kyc.style)} · ${String(s.kyc.max_messages)} messages, ${minutesLabel(s.kyc.max_duration_minutes)} au plus · le suit s’il chauffe après ${hoursLabel(s.kyc.min_hours_before_following)}${
      s.kyc.collect === undefined
        ? ''
        : ` · ${String(s.kyc.collect.length)} ligne${s.kyc.collect.length > 1 ? 's' : ''} du canevas sur ${String(KycSlotSchema.options.length)}`
    }`,
    sexualization: `${styleOf(s.sexualization.style)} · ouvre après ${hoursLabel(s.sexualization.initiate_after_hours)}`,
    script_launch: `${styleOf(s.script_launch.style)} · au moins ${hoursLabel(s.script_launch.cooldown_hours)} entre deux scripts`,
    post_offer: `${styleOf(s.post_offer.style)} · relance après ${plural(s.post_offer.delay_days, 'jour', 'jours')}`,
  };
}

export function followUpsSummary(f: Persona['follow_ups']): string {
  if (!f.enabled) return 'Désactivées';
  if (f.delays_hours.length === 0) return 'Aucun délai';
  return `${f.delays_hours.map(hoursLabel).join(', ')} après son dernier message`;
}

export function nudgesSummary(n: Persona['follow_ups']['nudges']): string {
  return n.enabled
    ? `${plural(n.max_per_day, 'rappel', 'rappels')} par jour au plus, ${minutesLabel(n.delay_minutes)} après`
    : 'Désactivés';
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The fields a draft changed, as paths (`strategies.kyc.max_messages`); a list counts as one field. */
export function changedFields(saved: unknown, draft: unknown, path = ''): string[] {
  if (isRecord(saved) && isRecord(draft)) {
    const keys = new Set([...Object.keys(saved), ...Object.keys(draft)]);
    return [...keys].flatMap((key) =>
      changedFields(saved[key], draft[key], path === '' ? key : `${path}.${key}`),
    );
  }
  return JSON.stringify(saved) === JSON.stringify(draft) ? [] : [path];
}

/** Whether a field, or anything under it, changed. */
export function hasChange(changed: readonly string[], field: string): boolean {
  return changed.some((path) => path === field || path.startsWith(`${field}.`));
}

type Options<V> = readonly { readonly value: V; readonly label: string }[];

const folded = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('fr');

/** The options whose label holds what was typed, accents and case aside (« neer » finds Néerlandais). */
export const matchOptions = <V>(options: Options<V>, text: string): Options<V> =>
  options.filter((option) => folded(option.label).includes(folded(text.trim())));

/** Picks or unpicks one option; picks keep the list's order, so the same choice always reads the same way. */
export const togglePick = <V>(options: Options<V>, values: readonly V[], value: V): V[] =>
  values.includes(value)
    ? values.filter((v) => v !== value)
    : options.map((o) => o.value).filter((v) => v === value || values.includes(v));

/** The time it is in a zone, « 22 h 25 », or nothing for a zone the browser does not know. */
export const localTime = (zone: string, at: Date = new Date()): string => {
  try {
    return new Intl.DateTimeFormat('fr-FR', { timeZone: zone, hour: 'numeric', minute: '2-digit' })
      .format(at)
      .replace(':', ' h ');
  } catch {
    return '';
  }
};

const semver = (version: string): [number, number, number] => {
  const [major = 0, minor = 0, patch = 0] = version.split('.').map(Number);
  return [major, minor, patch];
};

/** The number of the next version: one patch above the highest taken (« 0.1.3 » after 0.1.2 and 0.0.9). */
export function nextVersion(taken: readonly string[]): string {
  const [major, minor, patch] = taken
    .map(semver)
    .reduce<[number, number, number]>(
      (top, v) => ((v[0] - top[0] || v[1] - top[1] || v[2] - top[2]) > 0 ? v : top),
      [0, 0, 0],
    );
  return `${String(major)}.${String(minor)}.${String(patch + 1)}`;
}

const real = (list: readonly string[]): string[] => list.filter((entry) => !isPlaceholder(entry));

/**
 * How complete the draft is (`personaCompletion`), read without the placeholders of the example: « <à remplir> » in
 * a list is not something she wrote.
 */
export function draftCompletion(draft: Persona): PersonaCompletion {
  const { details, limits } = draft;
  return personaCompletion({
    ...draft,
    details: { ...details, hobbies: real(details.hobbies), personality: real(details.personality) },
    limits: {
      never_do: real(limits.never_do),
      never_show: real(limits.never_show),
      never_say: real(limits.never_say),
      disgusts: real(limits.disgusts),
    },
  });
}

const blank = (value: string | null): boolean => value === null || value.trim() === '';

/** A block whose every field is empty is not written: the version keeps it absent, as before P5-01. */
export function lifestyleOrNone(block: NonNullable<Persona['lifestyle']>): Persona['lifestyle'] {
  return blank(block.occupation) && blank(block.area) && blank(block.routine) && blank(block.goals)
    ? undefined
    : block;
}

export function tastesOrNone(block: NonNullable<Persona['tastes']>): Persona['tastes'] {
  return block.likes.length === 0 && block.dislikes.length === 0 ? undefined : block;
}

export function intimateOrNone(block: NonNullable<Persona['intimate']>): Persona['intimate'] {
  return block.turn_ons.length === 0 && block.fantasies.length === 0 && blank(block.sexting_style)
    ? undefined
    : block;
}

export const repliesOrNone = (list: NonNullable<Persona['sample_replies']>): Persona['sample_replies'] =>
  list.length === 0 ? undefined : list;

/** An emoji as two lists compare it: without the variation selector some keyboards add (« ❤ » and « ❤️ »). */
export const emojiKey = (entry: string): string => entry.replace(/\uFE0F/gu, '');

/**
 * What the server refused at saving (422 `persona_sample_reply_unprocessable`), on the reply it refused: one line per
 * reply, every guard it trips named, as the agent's own refusals say them.
 */
export function refusedReplyIssues(faults: readonly PersonaSampleReplyFault[]): FieldIssue[] {
  const byReply = new Map<number, string[]>();
  for (const { index, code } of faults) {
    const labels = byReply.get(index) ?? [];
    if (!labels.includes(GUARD_LABELS[code])) labels.push(GUARD_LABELS[code]);
    byReply.set(index, labels);
  }
  return [...byReply]
    .sort(([a], [b]) => a - b)
    .map(([index, labels]) => ({
      field: `sample_replies.${String(index)}.reply`,
      message: `L’agent ne l’enverrait pas : ${labels.join(', ')}.`,
    }));
}

/** The canvas lines she collects: every line, in order, is « all » and leaves `collect` absent, as the schema reads it. */
export const collectOrAll = (slots: KycSlot[]): KycSlot[] | undefined =>
  slots.length === KycSlotSchema.options.length ? undefined : slots;
