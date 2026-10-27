import type { OnDuty, Planning, ShiftTemplate, TeamMember } from '@nirvana/contracts';
import { useState, type JSX } from 'react';

import { ShiftPanel, type ShiftStart } from './ShiftPanel';
import { ShiftSheet } from './ShiftSheet';
import { TeamNav } from './TeamNav';
import { useMembers } from './api';
import './team.css';

import { WeekNav } from '@/scheduling/WeekNav';
import { usePlanning, useOnDuty, useTemplates } from '@/scheduling/api';
import { accountLine, conflictLines, gridOf, phaseOf, type Chip, type GridRow } from '@/scheduling/model';
import '@/scheduling/scheduling.css';
import {
  addDays,
  cityOf,
  clockAt,
  dayOf,
  lengthOf,
  longDay,
  mondayOf,
  rangeAt,
  readerZone,
  shortDay,
  weekOf,
  zonedInstant,
} from '@/scheduling/time';
import { useNow } from '@/scheduling/useNow';
import { Page, PageHeader, Panel } from '@/shell/layout';

type Open =
  { readonly kind: 'add'; readonly start: ShiftStart } | { readonly kind: 'shift'; readonly id: string };

/**
 * Équipe › Planning (EQ-02, ADR 0024): the week as rows of accounts and columns of days, each shift on its member's
 * colour; who is on shift right now above it, and the weekly shifts the server could not place in amber. Read at the
 * agency's hour, the one the team speaks in, or at the reader's own. The owner and an active manager place, move and
 * stop shifts; the server checks every write.
 */
export function PlanningPage(): JSX.Element {
  const now = useNow();
  const mine = readerZone();
  const [own, setOwn] = useState(false);
  const [creatorId, setCreatorId] = useState<string | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [open, setOpen] = useState<Open | null>(null);
  // The agency's zone comes with the first planning read; until then the week is the reader's own.
  const [agency, setAgency] = useState<string | null>(null);
  const zone = own || agency === null ? mine : agency;
  const today = dayOf(now, zone);
  const thisMonday = mondayOf(today);
  const [monday, setMonday] = useState(thisMonday);
  const days = weekOf(monday);
  const shown = usePlanning(rangeOf(monday, zone));
  const members = useMembers();
  const templates = useTemplates(true);
  const onDuty = useOnDuty(true);
  const data = shown.data;
  if (data !== undefined && data.settings.timeZone !== agency) setAgency(data.settings.timeZone);
  const pickedIndex = picked ?? Math.max(0, days.indexOf(today));

  const add = (
    <button
      type="button"
      className="nv-btn nv-btn--neon"
      disabled={data === undefined || data.accounts.length === 0}
      onClick={() => {
        setOpen({ kind: 'add', start: { accountId: null, day: days[pickedIndex] ?? today } });
      }}
    >
      Ajouter un shift
    </button>
  );

  return (
    <Page>
      <PageHeader
        eyebrow="Planning"
        title="Équipe"
        lead={
          agency === null
            ? 'Qui chatte sur quel compte, et quand.'
            : `Qui chatte sur quel compte, et quand. À l’heure ${zone === agency ? `de l’agence (${cityOf(agency)})` : `de ${cityOf(zone)}`}.`
        }
        actions={
          <>
            <TeamNav />
            {add}
          </>
        }
      />
      {shown.isError && data === undefined ? (
        <Panel className="nv-coming">
          <div className="nv-coming__in sc-notice">
            <h2>Le serveur ne répond pas</h2>
            <p>Le planning n’a pas pu être lu. Réessaie dans un instant.</p>
            <button
              type="button"
              className="nv-btn nv-btn--soft nv-btn--sm"
              onClick={() => {
                void shown.refetch();
              }}
            >
              Réessayer
            </button>
          </div>
        </Panel>
      ) : data === undefined ? (
        <Panel>
          <div className="sc-skeleton sc-skeleton--grid" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </div>
        </Panel>
      ) : (
        <div className="sc-board">
          <div className="sc-toolbar">
            <WeekNav
              monday={monday}
              thisMonday={thisMonday}
              onMonday={(next) => {
                setMonday(next);
                setPicked(next === thisMonday ? null : 0);
              }}
            />
            <Filters
              planning={data}
              creatorId={creatorId}
              onCreator={setCreatorId}
              agency={data.settings.timeZone}
              mine={mine}
              own={own}
              onOwn={setOwn}
            />
          </div>
          <OnDutyStrip
            list={onDuty.data ?? null}
            planning={data}
            zone={zone}
            onShow={(id) => {
              setOpen({ kind: 'shift', id });
            }}
          />
          <Conflicts
            planning={data}
            templates={templates.data ?? []}
            zone={zone}
            onShow={(id) => {
              setOpen({ kind: 'shift', id });
            }}
          />
          <Grid
            planning={data}
            rows={gridOf(data, days, zone).filter(
              (row) => creatorId === null || row.account.creatorId === creatorId,
            )}
            days={days}
            today={today}
            picked={pickedIndex}
            onPick={setPicked}
            now={now}
            zone={zone}
            loading={shown.isFetching && shown.isPlaceholderData}
            onAdd={(start) => {
              setOpen({ kind: 'add', start });
            }}
            onShow={(id) => {
              setOpen({ kind: 'shift', id });
            }}
          />
        </div>
      )}
      {data === undefined || open === null ? null : (
        <Opened
          open={open}
          planning={data}
          members={members.data ?? null}
          templates={templates.data ?? []}
          zone={zone}
          now={now}
          onOpen={setOpen}
        />
      )}
    </Page>
  );
}

/** Monday 0 h to the next Monday 0 h, in `zone`. */
function rangeOf(monday: string, zone: string): { from: string; to: string; creatorId: null } {
  return {
    from: zonedInstant(monday, 0, zone).toISOString(),
    to: zonedInstant(addDays(monday, 7), 0, zone).toISOString(),
    creatorId: null,
  };
}

function Opened({
  open,
  planning,
  members,
  templates,
  zone,
  now,
  onOpen,
}: {
  open: Open;
  planning: Planning;
  /** `null` while the team is not read, or could not be. */
  members: readonly TeamMember[] | null;
  templates: readonly ShiftTemplate[];
  zone: string;
  now: Date;
  onOpen: (open: Open | null) => void;
}): JSX.Element | null {
  const close = (): void => {
    onOpen(null);
  };
  if (open.kind === 'add') {
    return (
      <ShiftPanel
        planning={planning}
        members={members}
        start={open.start}
        today={dayOf(now, planning.settings.timeZone)}
        onClose={close}
        onShowShift={(id) => {
          onOpen({ kind: 'shift', id });
        }}
      />
    );
  }
  const shift = planning.shifts.find((one) => one.id === open.id);
  if (shift === undefined) return null;
  return (
    <ShiftSheet
      key={shift.id}
      shift={shift}
      planning={planning}
      members={members ?? []}
      templates={templates}
      zone={zone}
      now={now}
      onClose={close}
    />
  );
}

function Filters({
  planning,
  creatorId,
  onCreator,
  agency,
  mine,
  own,
  onOwn,
}: {
  planning: Planning;
  creatorId: string | null;
  onCreator: (creatorId: string | null) => void;
  agency: string;
  mine: string;
  own: boolean;
  onOwn: (own: boolean) => void;
}): JSX.Element | null {
  const creators = [
    ...new Map(planning.accounts.map((account) => [account.creatorId, account.creatorName])),
  ].sort(([, a], [, b]) => a.localeCompare(b, 'fr'));
  const zones = mine !== agency;
  if (creators.length < 2 && !zones) return null;
  return (
    <div className="sc-filters">
      {creators.length < 2 ? null : (
        <div className="tm-choices" role="radiogroup" aria-label="Créatrice">
          <button
            type="button"
            role="radio"
            className="nv-chip"
            aria-checked={creatorId === null}
            onClick={() => {
              onCreator(null);
            }}
          >
            Toutes
          </button>
          {creators.map(([id, name]) => (
            <button
              key={id}
              type="button"
              role="radio"
              className="nv-chip"
              aria-checked={creatorId === id}
              onClick={() => {
                onCreator(id);
              }}
            >
              {name}
            </button>
          ))}
        </div>
      )}
      {zones ? (
        <div className="tm-choices" role="radiogroup" aria-label="Heure affichée">
          <button
            type="button"
            role="radio"
            className="nv-chip"
            aria-checked={!own}
            onClick={() => {
              onOwn(false);
            }}
          >
            {cityOf(agency)}
          </button>
          <button
            type="button"
            role="radio"
            className="nv-chip"
            aria-checked={own}
            onClick={() => {
              onOwn(true);
            }}
          >
            Mon heure ({cityOf(mine)})
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** « En poste maintenant »: who chats on what, until when. Empty, it says so in one line. */
function OnDutyStrip({
  list,
  planning,
  zone,
  onShow,
}: {
  list: readonly OnDuty[] | null;
  planning: Planning;
  zone: string;
  onShow: (shiftId: string) => void;
}): JSX.Element | null {
  if (list === null) return null;
  const accounts = new Map(planning.accounts.map((account) => [account.id, account]));
  const known = new Set<string>(planning.shifts.map((shift) => shift.id));
  return (
    <section className="sc-duty" aria-labelledby="sc-duty-title">
      <h2 id="sc-duty-title" className="sc-duty__title">
        <span className={`nv-dot${list.length === 0 ? '' : ' nv-tone--ok nv-dot--live'}`} />
        En poste maintenant
      </h2>
      {list.length === 0 ? (
        <p className="sc-duty__none">Personne pour l’instant.</p>
      ) : (
        <ul className="sc-duty__list">
          {list.map((one) => {
            const account = accounts.get(one.platformAccountId);
            const body = (
              <>
                <span
                  className="sc-swatch"
                  style={one.member.color === null ? undefined : { '--sc-color': one.member.color }}
                  aria-hidden="true"
                />
                <span className="sc-duty__who">{one.member.displayName}</span>
                <span className="sc-duty__where">{account?.creatorName ?? 'Une créatrice'}</span>
                <span className="sc-duty__until nv-num">jusqu’à {clockAt(one.endsAt, zone)}</span>
              </>
            );
            return (
              <li key={one.shiftId}>
                {known.has(one.shiftId) ? (
                  <button
                    type="button"
                    className="sc-duty__one"
                    onClick={() => {
                      onShow(one.shiftId);
                    }}
                  >
                    {body}
                  </button>
                ) : (
                  <span className="sc-duty__one">{body}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** The weekly shifts the server could not place this week, in amber, each with the shift in its way. */
function Conflicts({
  planning,
  templates,
  zone,
  onShow,
}: {
  planning: Planning;
  templates: readonly ShiftTemplate[];
  zone: string;
  onShow: (shiftId: string) => void;
}): JSX.Element | null {
  const lines = conflictLines(planning.conflicts, templates, planning, zone);
  if (lines.length === 0) return null;
  const known = new Set<string>(planning.shifts.map((shift) => shift.id));
  return (
    <section className="nv-plate sc-conflicts nv-swap" role="status" aria-labelledby="sc-conflicts-title">
      <h2 id="sc-conflicts-title" className="sc-conflicts__title">
        {lines.length === 1
          ? 'Un modèle de shift n’a pas pu poser son shift'
          : `${String(lines.length)} modèles de shift n’ont pas pu poser leur shift`}
      </h2>
      <ul className="sc-conflicts__list">
        {lines.map((line) => (
          <li key={line.key} className="sc-conflicts__one">
            <div className="sc-conflicts__text">
              <p className="sc-conflicts__when nv-num">{line.when}</p>
              <p className="sc-conflicts__what">{line.what}.</p>
            </div>
            {known.has(line.shiftId) ? (
              <button
                type="button"
                className="nv-btn nv-btn--plain nv-btn--sm"
                onClick={() => {
                  onShow(line.shiftId);
                }}
              >
                Voir le shift
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Grid({
  planning,
  rows,
  days,
  today,
  picked,
  onPick,
  now,
  zone,
  loading,
  onAdd,
  onShow,
}: {
  planning: Planning;
  rows: readonly GridRow[];
  days: readonly string[];
  today: string;
  /** On a phone, the one day shown. */
  picked: number;
  onPick: (index: number) => void;
  now: Date;
  zone: string;
  loading: boolean;
  onAdd: (start: ShiftStart) => void;
  onShow: (shiftId: string) => void;
}): JSX.Element {
  if (planning.accounts.length === 0) {
    return (
      <Panel className="nv-coming">
        <div className="nv-coming__in sc-notice">
          <h2>Aucun compte à planifier</h2>
          <p>
            Une ligne apparaît ici pour chaque compte de créatrice : ajoute la créatrice et son compte Reveal
            d’abord.
          </p>
        </div>
      </Panel>
    );
  }
  const week = planning.shifts.filter((shift) =>
    rows.some((row) => row.account.id === shift.platformAccountId),
  );
  const total = week.reduce(
    (sum, shift) => sum + new Date(shift.endsAt).getTime() - new Date(shift.startsAt).getTime(),
    0,
  );
  return (
    <Panel className="sc-grid-panel">
      <div className="sc-days" role="radiogroup" aria-label="Jour affiché">
        {days.map((day, index) => (
          <button
            key={day}
            type="button"
            role="radio"
            className="sc-days__one"
            aria-checked={index === picked}
            data-today={day === today ? 'true' : undefined}
            onClick={() => {
              onPick(index);
            }}
          >
            <span className="sc-days__name">{shortDay(day).split(' ')[0]}</span>
            <span className="sc-days__num nv-num">{shortDay(day).split(' ')[1]}</span>
          </button>
        ))}
      </div>
      <div
        className="sc-grid nv-swap"
        key={days[0]}
        role="table"
        aria-label={`Planning de la semaine du ${longDay(days[0] ?? today)}`}
        aria-busy={loading}
        data-loading={loading ? 'true' : undefined}
      >
        <div className="sc-grid__row sc-grid__row--head" role="row">
          <span className="sc-grid__corner" role="columnheader">
            <span className="nv-num">
              {week.length === 1 ? '1 shift' : `${String(week.length)} shifts`}
              {week.length === 0 ? '' : ` · ${lengthOf(total)}`}
            </span>
          </span>
          {days.map((day, index) => (
            <span
              key={day}
              role="columnheader"
              className="sc-grid__day"
              data-today={day === today ? 'true' : undefined}
              data-picked={index === picked ? 'true' : undefined}
              data-past={day < today ? 'true' : undefined}
            >
              <span className="sc-grid__dayname">{shortDay(day).split(' ')[0]}</span>
              <span className="sc-grid__daynum nv-num">{shortDay(day).split(' ')[1]}</span>
            </span>
          ))}
        </div>
        {rows.map((row, rowIndex) => (
          <div
            key={row.account.id}
            className="sc-grid__row nv-enter"
            style={{ '--nv-i': rowIndex }}
            role="row"
          >
            <span className="sc-grid__account" role="rowheader">
              <span className="sc-grid__creator">{row.account.creatorName}</span>
              <span className="sc-grid__handle">{accountLine(row.account)}</span>
            </span>
            {days.map((day, index) => (
              <Cell
                key={day}
                day={day}
                chips={row.days.get(day) ?? []}
                accountId={row.account.id}
                creatorName={row.account.creatorName}
                today={day === today}
                picked={index === picked}
                past={day < today}
                now={now}
                zone={zone}
                onAdd={onAdd}
                onShow={onShow}
              />
            ))}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Cell({
  day,
  chips,
  accountId,
  creatorName,
  today,
  picked,
  past,
  now,
  zone,
  onAdd,
  onShow,
}: {
  day: string;
  chips: readonly Chip[];
  accountId: string;
  creatorName: string;
  today: boolean;
  picked: boolean;
  past: boolean;
  now: Date;
  zone: string;
  onAdd: (start: ShiftStart) => void;
  onShow: (shiftId: string) => void;
}): JSX.Element {
  return (
    <div
      className="sc-grid__cell"
      role="cell"
      data-today={today ? 'true' : undefined}
      data-picked={picked ? 'true' : undefined}
      data-past={past ? 'true' : undefined}
    >
      {chips.map((chip) => (
        <ShiftChip key={chip.shift.id} chip={chip} now={now} zone={zone} onShow={onShow} />
      ))}
      {past ? null : (
        <button
          type="button"
          className="sc-add"
          aria-label={`Ajouter un shift le ${longDay(day)} sur ${creatorName}`}
          onClick={() => {
            onAdd({ accountId, day });
          }}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 3.5v9M3.5 8h9" />
          </svg>
        </button>
      )}
    </div>
  );
}

function ShiftChip({
  chip,
  now,
  zone,
  onShow,
}: {
  chip: Chip;
  now: Date;
  zone: string;
  onShow: (shiftId: string) => void;
}): JSX.Element {
  const { shift, member } = chip;
  const phase = phaseOf(shift, now);
  const name = member?.displayName ?? 'Un membre';
  return (
    <button
      type="button"
      className="sc-chip"
      data-phase={phase}
      data-color={member?.color === null || member === null ? undefined : 'true'}
      style={member?.color === null || member === null ? undefined : { '--sc-color': member.color }}
      aria-label={`${name}, ${rangeAt(shift.startsAt, shift.endsAt, zone)}${chip.continued ? ', commencé la veille' : ''}${chip.overnight ? ', jusqu’au lendemain' : ''}${phase === 'live' ? ', en poste' : ''}`}
      onClick={() => {
        onShow(shift.id);
      }}
    >
      <span className="sc-chip__who">
        {phase === 'live' ? <span className="nv-dot nv-tone--ok nv-dot--live" /> : null}
        {name}
      </span>
      <span className="sc-chip__hours nv-num">
        {chip.continued ? '… ' : ''}
        {rangeAt(shift.startsAt, shift.endsAt, zone)}
        {chip.overnight ? <span className="sc-chip__night"> +1</span> : null}
      </span>
      {shift.templateId === null ? null : (
        <svg className="sc-chip__repeat" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 7a5 5 0 0 1 8.5-3.5L13 5M13 2v3h-3M13 9a5 5 0 0 1-8.5 3.5L3 11M3 14v-3h3" />
        </svg>
      )}
    </button>
  );
}
