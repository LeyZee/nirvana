import {
  SHIFT_TEMPLATE_MAX_MINUTES,
  shiftSlotsOf,
  templateLengthMinutes,
  type Planning,
  type ShiftSlot,
  type TeamMember,
} from '@nirvana/contracts';
import { useId, useState, type JSX } from 'react';

import { Dialog } from './Dialog';

import { createShift, createTemplate, useRefreshPlanning, type Refusal } from '@/scheduling/api';
import { accountLine, ERROR_MESSAGES, type Fill } from '@/scheduling/model';
import {
  addDays,
  cityOf,
  clockOf,
  inputOf,
  lengthOf,
  longDay,
  minuteOfInput,
  weekdayOf,
  zonedInstant,
} from '@/scheduling/time';

/** The day and slot the panel opens on: the first slot that starts after now, on `day` or else the day after. */
function firstSlotOf(
  day: string,
  today: string,
  slots: readonly ShiftSlot[],
  zone: string,
): { day: string; slot: number } {
  if (day !== today) return { day, slot: 0 };
  const at = Date.now();
  const slot = slots.findIndex((one) => zonedInstant(day, one.startMinute, zone).getTime() > at);
  return slot === -1 ? { day: addDays(day, 1), slot: 0 } : { day, slot };
}

/**
 * Where the panel opens: from « Ajouter un shift », from the + of one day on one account, or from « Pourvoir » on a
 * shift a template could not place because its member is on leave (its hours, and someone else than that member).
 */
export interface ShiftStart {
  readonly accountId: string | null;
  readonly day: string;
  readonly fill?: Fill;
}

/**
 * A new shift, or one that comes back every week (EQ-02): an account, a member who works on its creator, a day and
 * hours. The hours are the agency's (the grid's zone), as the templates are; the slots of Réglages come first, other
 * hours a tap away.
 */
export function ShiftPanel({
  planning,
  members,
  start,
  today,
  onClose,
  onShowShift,
}: {
  planning: Planning;
  /** `null` while the team is not read, or could not be. */
  members: readonly TeamMember[] | null;
  start: ShiftStart;
  today: string;
  onClose: () => void;
  /** A 409 names the shift in the way: the panel closes on it. */
  onShowShift: (shiftId: string) => void;
}): JSX.Element {
  const id = useId();
  const refresh = useRefreshPlanning();
  const zone = planning.settings.timeZone;
  const slots = shiftSlotsOf(planning.settings);
  const accounts = [...planning.accounts].sort(
    (a, b) => a.creatorName.localeCompare(b.creatorName, 'fr') || a.handle.localeCompare(b.handle, 'fr'),
  );
  const [accountId, setAccountId] = useState(start.accountId ?? accounts[0]?.id ?? '');
  const account = accounts.find((one) => one.id === accountId) ?? null;
  const fill = start.fill;
  const eligible = (members ?? [])
    .filter(
      (member) =>
        member.status === 'active' &&
        member.id !== fill?.awayMemberId &&
        account !== null &&
        member.creatorIds.includes(account.creatorId),
    )
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'fr'));
  const [memberId, setMemberId] = useState('');
  const chosen = eligible.find((member) => member.id === memberId) ?? eligible[0] ?? null;
  // The first slot still ahead: today's evening rather than a night already gone, else tomorrow's first. A shift to
  // fill keeps its own day and hours: one of the slots when they match, else the hours typed in.
  const [first] = useState(() =>
    fill === undefined
      ? firstSlotOf(start.day < today ? today : start.day, today, slots, zone)
      : {
          day: fill.day,
          slot: slots.findIndex(
            (one) => one.startMinute === fill.startMinute && one.endMinute === fill.endMinute,
          ),
        },
  );
  const [day, setDay] = useState(first.day);
  const [slot, setSlot] = useState<number | 'other'>(first.slot === -1 ? 'other' : first.slot);
  const [from, setFrom] = useState(inputOf(fill?.startMinute ?? slots[first.slot]?.startMinute ?? 0));
  const [to, setTo] = useState(inputOf(fill?.endMinute ?? slots[first.slot]?.endMinute ?? 360));
  const [weekly, setWeekly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);

  const picked = slot === 'other' ? null : (slots[slot] ?? null);
  const startMinute = picked === null ? minuteOfInput(from) : picked.startMinute;
  const endMinute = picked === null ? minuteOfInput(to) : picked.endMinute;
  const hoursOk = startMinute !== null && endMinute !== null && startMinute !== endMinute;
  const crosses = hoursOk && endMinute <= startMinute;
  const minutes = hoursOk ? templateLengthMinutes({ startMinute, endMinute }) : 0;
  // A template keeps an hour aside, so a change of time never stretches its shifts past a day (contracts).
  const tooLong = weekly && minutes > SHIFT_TEMPLATE_MAX_MINUTES;
  const hoursFit = hoursOk && !tooLong;
  const dayOk = /^\d{4}-\d{2}-\d{2}$/u.test(day) && day >= today;
  // A single shift lasts what its two instants span: 5 h for 0 h – 6 h the night the clocks go forward. A template
  // keeps its wall-clock hours, whatever the week.
  const lasts =
    hoursOk && dayOk && !weekly
      ? zonedInstant(crosses ? addDays(day, 1) : day, endMinute, zone).getTime() -
        zonedInstant(day, startMinute, zone).getTime()
      : minutes * 60_000;
  const ready = account !== null && chosen !== null && hoursFit && dayOk && !busy;

  const submit = async (): Promise<void> => {
    if (!ready) return;
    setBusy(true);
    setRefusal(null);
    const outcome = weekly
      ? await createTemplate({
          creatorId: account.creatorId,
          platformAccountId: account.id,
          memberId: chosen.id,
          weekday: weekdayOf(day),
          startMinute,
          endMinute,
          validFrom: day,
        })
      : await createShift({
          creatorId: account.creatorId,
          platformAccountId: account.id,
          memberId: chosen.id,
          startsAt: zonedInstant(day, startMinute, zone).toISOString(),
          endsAt: zonedInstant(crosses ? addDays(day, 1) : day, endMinute, zone).toISOString(),
        });
    setBusy(false);
    if (outcome.kind === 'ok') {
      await refresh();
      onClose();
      return;
    }
    setRefusal(outcome);
  };

  return (
    <Dialog
      title={fill !== undefined ? 'Pourvoir un shift' : weekly ? 'Nouveau modèle de shift' : 'Nouveau shift'}
      lead={
        fill === undefined
          ? `À l’heure de l’agence (${cityOf(zone)}).`
          : `${fill.awayName} est en congé : choisis qui prend ce shift. À l’heure de l’agence (${cityOf(zone)}).`
      }
      busy={busy}
      onClose={onClose}
    >
      <form
        className="tm-dialog__body"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="nv-field tm-field">
          <label className="nv-field__label" htmlFor={`${id}-account`}>
            Compte
          </label>
          <select
            id={`${id}-account`}
            className="nv-field__control nv-glass tm-select"
            value={accountId}
            data-autofocus
            onChange={(event) => {
              setAccountId(event.target.value);
              setMemberId('');
            }}
          >
            {accounts.map((one) => (
              <option key={one.id} value={one.id}>
                {one.creatorName} · {accountLine(one)}
              </option>
            ))}
          </select>
        </div>

        <div className="nv-field tm-field" data-invalid={eligible.length === 0 ? 'true' : undefined}>
          <label className="nv-field__label" htmlFor={`${id}-member`}>
            Membre
          </label>
          <select
            id={`${id}-member`}
            className="nv-field__control nv-glass tm-select"
            value={chosen?.id ?? ''}
            disabled={eligible.length === 0}
            onChange={(event) => {
              setMemberId(event.target.value);
            }}
          >
            {eligible.map((member) => (
              <option key={member.id} value={member.id}>
                {member.displayName}
              </option>
            ))}
          </select>
          {members === null ? (
            <span className="tm-hint tm-hint--error">
              L’équipe n’a pas pu être lue. Réessaie dans un instant.
            </span>
          ) : eligible.length === 0 ? (
            <span className="tm-hint tm-hint--error">
              {fill === undefined ? 'Aucun membre actif' : 'Aucun autre membre actif'} ne travaille sur{' '}
              {account?.creatorName ?? 'cette créatrice'} : ajoute-la à sa fiche dans Membres.
            </span>
          ) : null}
        </div>

        <div className="nv-field tm-field" data-invalid={dayOk ? undefined : 'true'}>
          <label className="nv-field__label" htmlFor={`${id}-day`}>
            {weekly ? 'À partir du' : 'Jour'}
          </label>
          <input
            id={`${id}-day`}
            type="date"
            className="nv-field__control nv-glass tm-date"
            value={day}
            min={today}
            aria-invalid={!dayOk}
            onChange={(event) => {
              setDay(event.target.value);
            }}
          />
          <span className={dayOk ? 'tm-hint' : 'tm-hint tm-hint--error'}>
            {dayOk
              ? longDay(day).replace(/^./u, (letter) => letter.toUpperCase())
              : 'Un jour, aujourd’hui au plus tôt.'}
          </span>
        </div>

        <fieldset className="sc-fieldset">
          <legend className="nv-field__label">Heures</legend>
          <div className="tm-choices" role="radiogroup" aria-label="Créneau">
            {slots.map((one, index) => (
              <button
                key={one.startMinute}
                type="button"
                role="radio"
                className="nv-chip nv-num"
                aria-checked={slot === index}
                onClick={() => {
                  setSlot(index);
                }}
              >
                {clockOf(one.startMinute)} – {clockOf(one.endMinute)}
              </button>
            ))}
            <button
              type="button"
              role="radio"
              className="nv-chip"
              aria-checked={slot === 'other'}
              onClick={() => {
                setSlot('other');
              }}
            >
              Autres heures
            </button>
          </div>
          {slot === 'other' ? (
            <div className="sc-hours nv-swap">
              <label className="sc-hours__one">
                <span className="tm-hint">De</span>
                <input
                  type="time"
                  step={900}
                  className="nv-field__control nv-glass nv-num"
                  value={from}
                  aria-label="Début"
                  onChange={(event) => {
                    setFrom(event.target.value);
                  }}
                />
              </label>
              <label className="sc-hours__one">
                <span className="tm-hint">à</span>
                <input
                  type="time"
                  step={900}
                  className="nv-field__control nv-glass nv-num"
                  value={to}
                  aria-label="Fin"
                  onChange={(event) => {
                    setTo(event.target.value);
                  }}
                />
              </label>
            </div>
          ) : null}
          <span className={hoursFit ? 'tm-hint' : 'tm-hint tm-hint--error'}>
            {!hoursOk
              ? 'Un début et une fin différents.'
              : tooLong
                ? 'Un modèle de shift dure 23 heures au plus.'
                : `${lengthOf(lasts)}${crosses ? ', jusqu’au lendemain' : ''}.`}
          </span>
        </fieldset>

        {/* A shift filled for someone on leave is that one occurrence: their template stays theirs. */}
        {fill === undefined ? (
          <div className="sc-repeat">
            <label className="sc-repeat__text" htmlFor={`${id}-weekly`}>
              <span className="sc-repeat__title">Chaque semaine</span>
              <span className="tm-hint">
                {weekly
                  ? `Chaque ${longDay(day).split(' ')[0] ?? ''} à partir de ce jour, posé quatre semaines à l’avance.`
                  : 'Un seul shift, ce jour-là.'}
              </span>
            </label>
            <input
              id={`${id}-weekly`}
              type="checkbox"
              role="switch"
              className="nv-switch"
              checked={weekly}
              onChange={(event) => {
                setWeekly(event.target.checked);
              }}
            />
          </div>
        ) : null}

        {refusal === null ? null : (
          <div className="tm-warn sc-refusal nv-swap" role="alert">
            <p>
              {refusal.kind === 'failed'
                ? 'Le serveur ne répond pas : rien n’a changé. Réessaie dans un instant.'
                : ERROR_MESSAGES[refusal.code]}
            </p>
            {refusal.kind === 'refused' && refusal.shiftId !== null ? (
              <button
                type="button"
                className="nv-btn nv-btn--plain nv-btn--sm"
                onClick={() => {
                  if (refusal.shiftId !== null) onShowShift(refusal.shiftId);
                }}
              >
                Voir le shift gênant
              </button>
            ) : null}
          </div>
        )}

        <div className="tm-dialog__foot">
          <button type="button" className="nv-btn nv-btn--plain" disabled={busy} onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="nv-btn nv-btn--neon" disabled={!ready} aria-busy={busy}>
            {busy ? 'Ajout…' : chosen === null ? 'Ajouter' : `Placer ${chosen.displayName}`}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
