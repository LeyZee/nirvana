import type { MyShift } from '@nirvana/contracts';
import { Link } from '@tanstack/react-router';
import type { ComponentProps, JSX } from 'react';

import { TrackingPage } from './TrackingPage';

import { useMyShifts } from '@/scheduling/api';
import { accessOpen } from '@/scheduling/model';
import '@/scheduling/scheduling.css';
import { addDays, clockAt, dayOf, longDay, rangeAt, readerZone } from '@/scheduling/time';
import { useNow } from '@/scheduling/useNow';
import { Panel } from '@/shell/layout';

/**
 * Suivi of a chatter (EQ-13, ADR 0025): the server opens a creator's conversations from the start margin of his shift
 * to its end margin. Outside, Suivi says so plainly, with his next shift, instead of an empty list; the handovers sent
 * to him stay readable under it.
 */
export function ChatterTrackingPage(
  props: Omit<ComponentProps<typeof TrackingPage>, 'offShift'>,
): JSX.Element {
  const mine = useMyShifts();
  const now = useNow();
  const off = mine.data !== undefined && !accessOpen(mine.data, now);
  return (
    <TrackingPage
      {...props}
      offShift={off ? <OffShift next={mine.data.next} now={now} zone={readerZone()} /> : undefined}
    />
  );
}

function OffShift({ next, now, zone }: { next: MyShift | null; now: Date; zone: string }): JSX.Element {
  const today = dayOf(now, zone);
  const day = next === null ? null : dayOf(next.startsAt, zone);
  const when =
    day === null
      ? ''
      : day === today
        ? 'aujourd’hui'
        : day === addDays(today, 1)
          ? 'demain'
          : `le ${longDay(day)}`;
  return (
    <Panel className="sc-off nv-swap">
      <div className="sc-off__in" role="status">
        <span className="sc-off__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7.5V12l3 2" />
          </svg>
        </span>
        <div className="sc-off__text">
          <h2 className="sc-off__title">Tu n’es pas en poste</h2>
          <p className="sc-off__lead">
            {next === null
              ? 'Aucun shift prévu pour l’instant. Les passations qu’on t’adresse restent lisibles ici.'
              : `Prochain shift ${when}, ${rangeAt(next.startsAt, next.endsAt, zone)} sur ${next.creatorName}. Ses conversations s’ouvrent ici à ${clockAt(next.accessStartsAt, zone)}.`}
          </p>
        </div>
        <Link to="/planning" className="nv-btn nv-btn--soft nv-btn--sm sc-off__go">
          Mon planning
        </Link>
      </div>
    </Panel>
  );
}
