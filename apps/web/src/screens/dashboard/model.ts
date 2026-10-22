import type { TelegramNight } from '@/settings/telegram/NightBanner';

/**
 * What the Dashboard shows, in the shape the screen needs: `GET /v1/dashboard` written in French (`live.ts`), or
 * the sample of this shape when the server does not answer, and the screen says « Exemple ».
 * Money is in euros, durations in minutes, rates in % (0 to 100).
 */

/** `idle`: nothing wrong, nothing running yet (Reveal never linked): neutral, no colour. */
export type Tone = 'ok' | 'warn' | 'bad' | 'idle';
export type Period = 'day' | 'week' | 'month';

export const PERIODS: readonly { readonly id: Period; readonly label: string }[] = [
  { id: 'day', label: 'Aujourd’hui' },
  { id: 'week', label: '7 jours' },
  { id: 'month', label: '30 jours' },
];

/**
 * One line of « À traiter ». `conversationId` opens it in Suivi (a draft to validate), else `fanId` opens the reader;
 * without either, `where` says what to open instead.
 */
export interface Todo {
  readonly id: string;
  readonly tone: Tone;
  /** The kind, in the trade's words: « Mineur possible », « Demande de rencontre », « À valider dans Suivi ». */
  readonly kind: string;
  readonly title: string;
  /** One sentence: why it waits for a human, and what the agent does meanwhile. */
  readonly why: string;
  /** « 23:41 », creator's time. */
  readonly at: string;
  readonly fanId?: string;
  readonly conversationId?: string;
  readonly where?: string;
}

/** One card of the « L'agent » fold. `rows` feed the tip; `gauge` is a spend or a rate against a mark. */
interface AgentCard {
  readonly id: string;
  readonly tone: Tone;
  readonly title: string;
  readonly value: string;
  readonly rows: readonly (readonly [label: string, value: string])[];
  /** A spend against its budget (neutral, amber from 70 %, neon from 90 %) or a rate against its target (tone). */
  readonly gauge?: { readonly kind: 'spend' | 'rate'; readonly value: number; readonly mark: number };
}

export interface AgentState {
  readonly tone: Tone;
  /** The eyebrow over the sentence, after the mode: how many conversations it follows. */
  readonly eyebrow: string;
  /** The state sentence; the part between ** is lit in the tone. */
  readonly headline: string;
  readonly lead: string;
  /** The one action of the screen, when there is one (« Voir l'urgence »). */
  readonly action?: string;
  /** Nothing is written, in a tone that is not red (its key is missing): its sentence still leads the hero. */
  readonly stalled?: true;
  /** Where the action leads, when it is a page and not the first todo (« Poser la clé » › Réglages). */
  readonly actionTo?: '/reglages/modeles-ia';
  /** The fold's title (« L'agent fonctionne normalement ») and its one-line summary. */
  readonly foldTitle: string;
  readonly foldSummary: string;
  readonly cards: readonly AgentCard[];
}

/** A figure the corpus says moves sales, against the period before. */
export interface Lever {
  readonly id: 'first-offer-bought' | 'time-to-first-offer' | 'blocked-at-payment';
  readonly label: string;
  readonly current: number;
  readonly previous: number;
  readonly tip: readonly [title: string, text: string];
}

export interface SalesSeries {
  /** One label per point: hours (« 14 h ») for a day, dates (« 12 oct. ») otherwise. */
  readonly labels: readonly string[];
  readonly agent: readonly number[];
  readonly chatters: readonly number[];
  /** Yesterday, same hours, agent only: shown dotted on the day view. */
  readonly past?: readonly number[];
}

export interface Sales {
  readonly agent: number;
  readonly chatters: number;
  /** What the agent sold over the period before, for the delta. */
  readonly agentBefore: number;
  readonly series: SalesSeries;
  readonly levers: readonly Lever[];
  /** Head counts per funnel step, this period and the one before. */
  readonly funnel: { readonly counts: readonly number[]; readonly before: readonly number[] };
}

interface Bubble {
  readonly from: 'fan' | 'creator' | 'flag';
  readonly text: string;
}

export interface Fan {
  readonly id: string;
  readonly name: string;
  /** « abonné depuis 3 semaines · Nantes » */
  readonly line: string;
  readonly spent: number;
  readonly byAgent: number;
  /** What she knows about him (notes), and the alert that froze him, if any. */
  readonly notes: readonly string[];
  readonly alert?: string;
  readonly thread: readonly Bubble[];
}

export interface Dashboard {
  readonly creator: { readonly name: string; readonly platform: string; readonly now: string };
  readonly agent: AgentState;
  readonly todos: readonly Todo[];
  /** Null on the server's data until the Reveal connector observes purchases: nothing stands in for them. */
  readonly sales: Readonly<Record<Period, Sales>> | null;
  /** Best fans first. */
  readonly fans: readonly Fan[];
  /** Telegram's coverage of her night (`telegramNightOf`); absent on sample data. */
  readonly telegram?: TelegramNight;
}
