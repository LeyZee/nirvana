import type { LlmCallLog } from './call-log';
import type { DailyBudget } from './config';

export type BudgetState = 'ok' | 'alert' | 'reached';

/** Today's spend against the hard daily cap (Charles, 17/10: 20 € a day, alert at 80 %, day in Paris). */
export interface BudgetStatus {
  /** Her calendar day in the budget's time zone, YYYY-MM-DD. */
  readonly day: string;
  readonly spentEur: number;
  readonly capEur: number;
  readonly alertAtEur: number;
  readonly state: BudgetState;
}

/** Sent once per day and kind: the CRM warns Charles; on `reached` the chatters take over. */
export interface BudgetEvent {
  readonly kind: 'alert' | 'reached';
  readonly status: BudgetStatus;
}

function wallClock(now: Date, timeZone: string): { day: string; minutes: number; seconds: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type: string): string => parts.find((p) => p.type === type)?.value ?? '0';
  return {
    day: `${part('year')}-${part('month')}-${part('day')}`,
    minutes: Number(part('hour')) * 60 + Number(part('minute')),
    seconds: Number(part('second')),
  };
}

/** Local midnight in that zone, including on the days the clocks change. */
export function startOfLocalDay(now: Date, timeZone: string): Date {
  const local = wallClock(now, timeZone);
  const elapsedMs = (local.minutes * 60 + local.seconds) * 1_000 + now.getMilliseconds();
  const candidate = new Date(now.getTime() - elapsedMs);
  // A clock change since midnight shifts the candidate by its offset: one correction lands on 00:00.
  const drift = wallClock(candidate, timeZone);
  if (drift.minutes === 0 && drift.seconds === 0) return candidate;
  const driftMinutes = drift.minutes > 12 * 60 ? drift.minutes - 24 * 60 : drift.minutes;
  return new Date(candidate.getTime() - driftMinutes * 60_000);
}

/** Costs are journaled in USD (provider prices); the cap is in euros, converted with a conservative rate. */
export function budgetStatus(budget: DailyBudget, capEur: number, log: LlmCallLog, now: Date): BudgetStatus {
  const spentUsd = log
    .since(startOfLocalDay(now, budget.timeZone))
    .reduce((sum, r) => sum + (r.costUsd ?? 0), 0);
  const spentEur = spentUsd / budget.usdPerEur;
  const alertAtEur = capEur * budget.alertRatio;
  return {
    day: wallClock(now, budget.timeZone).day,
    spentEur,
    capEur,
    alertAtEur,
    state: spentEur >= capEur ? 'reached' : spentEur >= alertAtEur ? 'alert' : 'ok',
  };
}
