/**
 * The moment of the conversation, written by code for the brain and the voice: her local time, day or
 * night, how long they have known each other, what he has spent. Facts only; what they allow (a night
 * script, the sexualisation delay) is decided by the policy, not by the model (CLAUDE.md rule 3).
 */
export interface Situation {
  readonly now: Date;
  /** Her time zone, IANA name: the day and night scripts follow her clock, not the fan's. */
  readonly timeZone: string;
  readonly relationshipStartedAt: Date;
  readonly spentCents: number;
}

export type DayPart = 'day' | 'night';

// Night from 22:00 to 06:59, her time: when the Nuit 🌙 scripts apply (chatting/methode-chatting.md).
const NIGHT_FROM_HOUR = 22;
const DAY_FROM_HOUR = 7;

export function localTime(
  now: Date,
  timeZone: string,
): { readonly hour: number; readonly minute: number; readonly label: string } {
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'long',
    hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  return {
    hour: Number(part('hour')),
    minute: Number(part('minute')),
    label: `${part('weekday')} ${part('hour')} h ${part('minute')}`,
  };
}

/** An IANA zone the runtime knows (« Europe/Paris »): checked before it reaches a clock. */
export function isTimeZone(name: string): boolean {
  try {
    new Intl.DateTimeFormat('fr-FR', { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

const DAY_MINUTES = 1_440;

/** The next moment her clock shows hour:minute (for « /heure 23:30 »), across a change of daylight saving time. */
export function nextLocalTime(now: Date, timeZone: string, hour: number, minute: number): Date {
  const at = (date: Date): number => {
    const t = localTime(date, timeZone);
    return t.hour * 60 + t.minute;
  };
  const target = hour * 60 + minute;
  const ahead = (from: Date): number => (((target - at(from)) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const first = new Date(now.getTime() + ahead(now) * 60_000);
  // A clock change on the way shifts the landing by its offset: one correction puts it back on her clock.
  const drift = ahead(first);
  if (drift === 0) return first;
  return new Date(first.getTime() + (drift > DAY_MINUTES / 2 ? drift - DAY_MINUTES : drift) * 60_000);
}

export function dayPart(hour: number): DayPart {
  return hour >= NIGHT_FROM_HOUR || hour < DAY_FROM_HOUR ? 'night' : 'day';
}

function duration(ms: number): string {
  const hours = Math.max(0, Math.floor(ms / 3_600_000));
  if (hours < 1) return 'moins d’une heure';
  if (hours < 48) return `${String(hours)} h`;
  return `${String(Math.floor(hours / 24))} jours`;
}

/** Night is when the Nuit scripts apply, on her clock. */
export function isNight(situation: Situation): boolean {
  return dayPart(localTime(situation.now, situation.timeZone).hour) === 'night';
}

export function describeSituation(situation: Situation): string {
  const time = localTime(situation.now, situation.timeZone);
  const spent = situation.spentCents / 100;
  return [
    `Chez elle, on est ${time.label} (${dayPart(time.hour) === 'night' ? 'nuit' : 'jour'}).`,
    `Ils se parlent depuis ${duration(situation.now.getTime() - situation.relationshipStartedAt.getTime())}.`,
    spent > 0
      ? `Il a déjà dépensé ${spent.toFixed(2).replace('.', ',')} € chez elle.`
      : 'Il n’a encore rien acheté.',
  ].join('\n');
}
