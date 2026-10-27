import type { Planning, PlanningAccount, Shift } from '@nirvana/contracts';
import { useState, type JSX } from 'react';

import { WeekNav } from '@/scheduling/WeekNav';
import { usePlanning } from '@/scheduling/api';
import { accountLine, phaseOf, type Phase } from '@/scheduling/model';
import '@/scheduling/scheduling.css';
import {
  addDays,
  cityOf,
  dayOf,
  lengthOf,
  longDay,
  mondayOf,
  rangeAt,
  readerZone,
  weekOf,
  zonedInstant,
} from '@/scheduling/time';
import { useNow } from '@/scheduling/useNow';
import { Page, PageHeader, Panel } from '@/shell/layout';

const PHASE_LABELS: Readonly<Record<Phase, string>> = { later: 'À venir', live: 'En poste', past: 'Fini' };

/**
 * Planning of a chatter (ADR 0024, EQ-02): their own shifts, week by week, in their own time; the agency's hour
 * beside it when it differs, since that is the hour the team speaks in. The server sends their shifts alone.
 */
export function MyPlanningPage(): JSX.Element {
  const now = useNow();
  const zone = readerZone();
  const today = dayOf(now, zone);
  const [monday, setMonday] = useState(() => mondayOf(today));
  const days = weekOf(monday);
  const planning = usePlanning({
    from: zonedInstant(monday, 0, zone).toISOString(),
    to: zonedInstant(addDays(monday, 7), 0, zone).toISOString(),
    creatorId: null,
  });

  return (
    <Page>
      <PageHeader
        title="Planning"
        lead={`Tes shifts, à ton heure (${cityOf(zone)}).`}
        actions={<WeekNav monday={monday} thisMonday={mondayOf(today)} onMonday={setMonday} />}
      />
      {planning.isError ? (
        <Panel className="nv-coming">
          <div className="nv-coming__in sc-notice">
            <h2>Le serveur ne répond pas</h2>
            <p>Ton planning n’a pas pu être lu. Réessaie dans un instant.</p>
            <button
              type="button"
              className="nv-btn nv-btn--soft nv-btn--sm"
              onClick={() => {
                void planning.refetch();
              }}
            >
              Réessayer
            </button>
          </div>
        </Panel>
      ) : planning.data === undefined ? (
        <Panel>
          <div className="sc-skeleton" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
        </Panel>
      ) : (
        <Week planning={planning.data} days={days} zone={zone} today={today} now={now} />
      )}
    </Page>
  );
}

function Week({
  planning,
  days,
  zone,
  today,
  now,
}: {
  planning: Planning;
  days: readonly string[];
  zone: string;
  today: string;
  now: Date;
}): JSX.Element {
  const accounts = new Map(planning.accounts.map((account) => [account.id, account]));
  const agency = planning.settings.timeZone;
  const byDay = days
    .map((day) => ({
      day,
      shifts: planning.shifts
        .filter((shift) => dayOf(shift.startsAt, zone) === day)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    }))
    .filter(({ shifts }) => shifts.length > 0);
  const total = planning.shifts.reduce(
    (sum, shift) => sum + new Date(shift.endsAt).getTime() - new Date(shift.startsAt).getTime(),
    0,
  );

  if (byDay.length === 0) {
    return (
      <Panel className="nv-coming nv-swap" key={days[0]}>
        <div className="nv-coming__in sc-notice">
          <h2>Aucun shift cette semaine</h2>
          <p>
            Ton responsable te place sur le planning : tes shifts s’afficheront ici dès qu’ils sont posés.
          </p>
        </div>
      </Panel>
    );
  }

  return (
    <div className="sc-mine nv-swap" key={days[0]}>
      <p className="sc-mine__sum nv-num">
        {planning.shifts.length === 1 ? '1 shift' : `${String(planning.shifts.length)} shifts`} ·{' '}
        {lengthOf(total)}
      </p>
      {byDay.map(({ day, shifts }, index) => (
        <section
          key={day}
          className="sc-mine__day nv-enter"
          style={{ '--nv-i': index }}
          aria-labelledby={`sc-day-${day}`}
          data-today={day === today ? 'true' : undefined}
        >
          <h2 id={`sc-day-${day}`} className="sc-mine__date">
            {day === today ? 'Aujourd’hui' : longDay(day).replace(/^./u, (letter) => letter.toUpperCase())}
          </h2>
          <ul className="sc-mine__list">
            {shifts.map((shift) => (
              <MyShiftRow
                key={shift.id}
                shift={shift}
                account={accounts.get(shift.platformAccountId) ?? null}
                zone={zone}
                agency={agency}
                phase={phaseOf(shift, now)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function MyShiftRow({
  shift,
  account,
  zone,
  agency,
  phase,
}: {
  shift: Shift;
  account: PlanningAccount | null;
  zone: string;
  agency: string;
  phase: Phase;
}): JSX.Element {
  const length = new Date(shift.endsAt).getTime() - new Date(shift.startsAt).getTime();
  const sameHours =
    rangeAt(shift.startsAt, shift.endsAt, zone) === rangeAt(shift.startsAt, shift.endsAt, agency);
  return (
    <li className="nv-plate sc-mine__shift" data-phase={phase}>
      <div className="sc-mine__hours">
        <p className="sc-mine__range nv-num">{rangeAt(shift.startsAt, shift.endsAt, zone)}</p>
        <p className="sc-mine__length">{lengthOf(length)}</p>
      </div>
      <div className="sc-mine__main">
        <p className="sc-mine__who">{account?.creatorName ?? 'Une créatrice'}</p>
        <p className="sc-mine__where">
          {account === null ? null : accountLine(account)}
          {sameHours ? null : (
            <span className="sc-mine__agency">
              {' '}
              · {rangeAt(shift.startsAt, shift.endsAt, agency)} à {cityOf(agency)}
            </span>
          )}
        </p>
      </div>
      <span className={`nv-status sc-phase sc-phase--${phase}`}>
        <span className={`nv-dot${phase === 'live' ? ' nv-tone--ok nv-dot--live' : ''}`} />
        {PHASE_LABELS[phase]}
      </span>
    </li>
  );
}
