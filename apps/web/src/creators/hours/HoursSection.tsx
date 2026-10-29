import {
  DEFAULT_AGENT_HOURS,
  type AgentHours,
  type AgentHoursView,
  type AgentSlot,
  type MinuteRange,
} from '@nirvana/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useState, type JSX } from 'react';

import { ZoneEditor } from '../ZoneEditor';
import { Segment } from '../persona/fields';

import { HOURS_ERRORS, hoursErrorKind, hoursQueryKey, saveAgentHours, useAgentHours } from './api';
import {
  barsOf,
  canAddSlot,
  clockHeader,
  DAY_NAMES,
  DAY_SHORT,
  isDefaultHours,
  issuesOf,
  newSlot,
  noFollowUpEver,
  orderedSlots,
  rangeIssue,
  rangeOf,
  sameHours,
  slotIssue,
  slotsToOffer,
  slotWords,
} from './model';
import './hours.css';

import { TimeField } from '@/scheduling/TimeField';
import { MINUTES_PER_DAY } from '@/scheduling/time';
import { PasswordPrompt, SignInAgain } from '@/settings/services/PasswordPrompt';
import { ReauthRequired } from '@/settings/services/api';

/**
 * Créatrices › Heures (P3-14), the owner's alone: when the agent may answer her fans, when it never follows up, and
 * when her Nuit scripts apply, all on her clock. Out of her slots the agent writes nothing; the messages wait and are
 * answered at the opening. Built like the persona: a head with the state and the one action, then the work.
 */
export function HoursSection({
  creatorId,
  creatorName,
  onDirty = ignore,
}: {
  creatorId: string;
  creatorName: string;
  /** Told whether her hours hold changes not saved, so that leaving the page can ask first. Must be stable. */
  onDirty?: (dirty: boolean) => void;
}): JSX.Element {
  const query = useAgentHours(creatorId);

  if (query.data === undefined) {
    if (query.isError) {
      const kind = hoursErrorKind(query.error);
      return (
        <section className="ps-page">
          <div className="nv-plate ps-head">
            <p className="ps-title">Ses heures ne se chargent pas</p>
            <p className="ps-muted">{HOURS_ERRORS[kind]}</p>
            {kind === 'session_expired' ? (
              <SignInAgain />
            ) : kind === 'unavailable' ? (
              <button
                type="button"
                className="nv-btn nv-btn--soft ps-self-start"
                onClick={() => void query.refetch()}
              >
                Réessayer
              </button>
            ) : null}
          </div>
        </section>
      );
    }
    return (
      <section className="ps-page" aria-busy="true" aria-label="Heures d’activité">
        <div className="nv-plate ps-head ps-skeleton" />
        <div className="nv-plate ps-panel ps-skeleton ps-skeleton--tall" />
      </section>
    );
  }
  return (
    <HoursForm
      key={creatorId}
      creatorId={creatorId}
      creatorName={creatorName}
      view={query.data}
      onDirty={onDirty}
    />
  );
}

const ignore = (): void => undefined;

interface Problem {
  readonly text: string;
  readonly expired: boolean;
}

function HoursForm({
  creatorId,
  creatorName,
  view,
  onDirty,
}: {
  creatorId: string;
  creatorName: string;
  view: AgentHoursView;
  onDirty: (dirty: boolean) => void;
}): JSX.Element {
  const queryClient = useQueryClient();
  const [stored, setStored] = useState(view);
  const [draft, setDraft] = useState<AgentHours>(view.hours);
  /** The slots she had, kept while « À toute heure » is picked, so that coming back does not lose them. */
  const [keptSlots, setKeptSlots] = useState<readonly AgentSlot[] | null>(
    view.hours.reply.mode === 'slots' ? view.hours.reply.slots : null,
  );
  const [saving, setSaving] = useState(false);
  const [reauth, setReauth] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const issues = issuesOf(draft);
  // A stored setting that no longer reads is replaced by saving, even unchanged: the defaults then go in its place.
  const changed = !sameHours(draft, stored.hours) || stored.invalidStored;
  const blocked = issues.size > 0;
  const dirty = !sameHours(draft, stored.hours);
  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);
  useEffect(
    () => () => {
      onDirty(false);
    },
    [onDirty],
  );
  const noFollowUp = noFollowUpEver(draft, stored.timeZone, new Date());

  const edit = (next: AgentHours): void => {
    setDraft(next);
    setNotice(null);
    setProblem(null);
  };
  const editSlots = (slots: AgentSlot[]): void => {
    setKeptSlots(slots);
    edit({ ...draft, reply: { mode: 'slots', slots } });
  };

  async function save(): Promise<void> {
    setSaving(true);
    setProblem(null);
    try {
      // The defaults are stored as none: she then follows them as they are, today and after.
      const saved = await saveAgentHours(creatorId, isDefaultHours(draft) ? null : draft);
      queryClient.setQueryData(hoursQueryKey(creatorId), saved);
      setStored(saved);
      setDraft(saved.hours);
      setNotice('Enregistré : l’agent suit ces heures dès maintenant.');
    } catch (error) {
      if (error instanceof ReauthRequired) setReauth(true);
      else {
        const kind = hoursErrorKind(error);
        setProblem({ text: HOURS_ERRORS[kind], expired: kind === 'session_expired' });
      }
    } finally {
      setSaving(false);
    }
  }

  const state =
    problem !== null
      ? { dot: 'warn', text: problem.text }
      : blocked
        ? {
            dot: 'warn',
            text: issues.size > 1 ? `${String(issues.size)} lignes à corriger` : 'Une ligne à corriger',
          }
        : stored.invalidStored && sameHours(draft, stored.hours)
          ? {
              dot: 'warn',
              text: 'Son réglage enregistré ne se lit plus : l’agent suit les réglages d’origine. Enregistre pour le remplacer.',
            }
          : changed
            ? { dot: 'ok', text: 'Modifié, prêt à enregistrer' }
            : notice !== null
              ? { dot: 'ok', text: notice }
              : stored.isDefault
                ? { dot: 'idle', text: 'Réglages d’origine : l’agent répond à toute heure' }
                : { dot: 'idle', text: 'Aucune modification' };

  const slots = draft.reply.mode === 'slots' ? draft.reply.slots : null;
  /** What « Ajouter un créneau » would add: a free stretch of her week, or nothing when none is left. */
  const added = slots === null ? null : newSlot(slots);

  return (
    <section className="ps-page">
      <div className="nv-plate ps-head">
        <div className="ps-head__top">
          <div className="ps-head__who">
            <p className="nv-eyebrow hr-clock">{clockHeader(creatorName, stored.timeZone)}</p>
            <h2 className="ps-title">Heures d’activité</h2>
          </div>
          <div className="ps-head__actions">
            {changed && !saving && !sameHours(draft, stored.hours) ? (
              <button
                type="button"
                className="nv-btn nv-btn--plain nv-btn--sm ps-pop"
                onClick={() => {
                  edit(stored.hours);
                  setKeptSlots(stored.hours.reply.mode === 'slots' ? stored.hours.reply.slots : null);
                }}
              >
                Tout annuler
              </button>
            ) : null}
            {!isDefaultHours(draft) && !saving ? (
              <button
                type="button"
                className="nv-btn nv-btn--plain nv-btn--sm ps-pop"
                title="À toute heure, aucune relance de 23 h à 9 h, la nuit de 22 h à 7 h."
                onClick={() => {
                  edit(DEFAULT_AGENT_HOURS);
                }}
              >
                Revenir aux réglages d’origine
              </button>
            ) : null}
            <button
              type="button"
              className="nv-btn nv-btn--neon"
              disabled={!changed || blocked || saving}
              aria-busy={saving}
              onClick={() => void save()}
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
        <div className="ps-head__state" aria-live="polite">
          <span className="ps-dot" data-dot={state.dot} />
          <span className="ps-head__text" key={state.text}>
            {state.text}
          </span>
        </div>
        <ZoneEditor
          creatorId={creatorId}
          timeZone={stored.timeZone}
          onMoved={(creator) => {
            // Her hours stay as they are, read on her new clock: the header and the warnings follow it.
            setStored((before) => ({ ...before, timeZone: creator.timezone }));
            queryClient.setQueryData<AgentHoursView>(hoursQueryKey(creatorId), (before) =>
              before === undefined ? before : { ...before, timeZone: creator.timezone },
            );
          }}
        />
        {problem?.expired === true ? <SignInAgain /> : null}
        {reauth ? (
          <PasswordPrompt
            lead="Pour changer ses heures, confirme ton mot de passe."
            onConfirmed={() => {
              setReauth(false);
              void save();
            }}
            onCancel={() => {
              setReauth(false);
            }}
          />
        ) : null}
        <p className="ps-muted">
          Hors de ses créneaux, l’agent n’écrit rien : les messages attendent, et il y répond à l’ouverture,
          le plus ancien d’abord. Un chatteur en poste répond dans Reveal, à toute heure.
        </p>
      </div>

      <div className="nv-plate ps-panel">
        <section className="ps-block" aria-labelledby="hr-reply">
          <p className="nv-eyebrow" id="hr-reply">
            Réponses
          </p>
          <Segment
            label="Quand l’agent répond"
            options={[
              { value: 'always', label: 'À toute heure' },
              { value: 'slots', label: 'Par créneaux' },
            ]}
            value={draft.reply.mode}
            onChange={(mode) => {
              if (mode === draft.reply.mode) return;
              if (mode === 'always') edit({ ...draft, reply: { mode: 'always' } });
              else editSlots(slotsToOffer(keptSlots));
            }}
          />
          {slots === null ? (
            <p className="ps-lead">L’agent répond à toute heure, de jour comme de nuit.</p>
          ) : (
            <div className="ps-stack ps-reveal">
              <Week slots={slots} quiet={draft.followUpQuiet} />
              <ul className="hr-slots" aria-label="Créneaux">
                {orderedSlots(slots).map(({ slot, index }) => (
                  <SlotLine
                    key={index}
                    slot={slot}
                    issue={slotIssue(issues, index)}
                    onChange={(next) => {
                      editSlots(slots.map((one, i) => (i === index ? next : one)));
                    }}
                    onRemove={
                      slots.length > 1
                        ? () => {
                            editSlots(slots.filter((_, i) => i !== index));
                          }
                        : null
                    }
                  />
                ))}
              </ul>
              {issues.get('reply.slots') === undefined ? null : (
                <p className="ps-error" role="alert">
                  {issues.get('reply.slots')}
                </p>
              )}
              {!canAddSlot(slots) ? (
                <p className="ps-hint">28 créneaux au plus.</p>
              ) : added === null ? (
                <p className="ps-hint">
                  Plus une heure de libre dans la semaine : raccourcis un créneau d’abord.
                </p>
              ) : (
                <button
                  type="button"
                  className="nv-btn nv-btn--soft nv-btn--sm ps-self-start"
                  onClick={() => {
                    editSlots([...slots, added]);
                  }}
                >
                  Ajouter un créneau
                </button>
              )}
            </div>
          )}
        </section>

        <section className="ps-block" aria-labelledby="hr-quiet">
          <p className="nv-eyebrow" id="hr-quiet">
            Relances
          </p>
          <p className="ps-lead">
            Pendant ses heures calmes, personne ne reçoit de relance qu’il n’a pas demandée, même dans un
            créneau ouvert. Un fan qui écrit reçoit sa réponse ; une relance attend la première minute
            permise.
          </p>
          <RangeLine
            label="Heures calmes"
            range={draft.followUpQuiet}
            issue={rangeIssue(issues, 'followUpQuiet')}
            onChange={(followUpQuiet) => {
              edit({ ...draft, followUpQuiet });
            }}
          />
          {noFollowUp ? (
            <p className="hr-warning" role="status">
              Aucune relance ne pourra partir : chaque créneau tombe dans ses heures calmes.
            </p>
          ) : null}
        </section>

        <section className="ps-block" aria-labelledby="hr-night">
          <p className="nv-eyebrow" id="hr-night">
            Nuit
          </p>
          <p className="ps-lead">
            Ses scripts Nuit s’appliquent dans cette plage, ses scripts Jour le reste du temps.
          </p>
          <RangeLine
            label="Nuit"
            range={draft.night}
            issue={rangeIssue(issues, 'night')}
            onChange={(night) => {
              edit({ ...draft, night });
            }}
          />
        </section>
      </div>
    </section>
  );
}

const pct = (minute: number): string => `${String((minute / MINUTES_PER_DAY) * 100)}%`;

/** Her week at a glance: a line a day, her slots on it, her quiet hours shaded. The list below says it in words. */
function Week({ slots, quiet }: { slots: readonly AgentSlot[]; quiet: MinuteRange }): JSX.Element {
  const bars = barsOf(slots);
  const quietParts =
    quiet.startMinute < quiet.endMinute
      ? [{ from: quiet.startMinute, to: quiet.endMinute }]
      : [
          { from: quiet.startMinute, to: MINUTES_PER_DAY },
          { from: 0, to: quiet.endMinute },
        ];
  return (
    <div className="hr-week" aria-hidden="true">
      {DAY_SHORT.map((name, dayIndex) => (
        <div className="hr-week__row" key={name}>
          <span className="hr-week__day">{name}</span>
          <span className="hr-week__track">
            {quietParts.map((part) => (
              <span
                key={part.from}
                className="hr-week__quiet"
                style={{ left: pct(part.from), width: pct(part.to - part.from) }}
              />
            ))}
            {bars
              .filter((bar) => bar.day === dayIndex + 1)
              .map((bar) => (
                <span
                  key={`${String(bar.index)}-${String(bar.continued)}`}
                  className="hr-week__bar"
                  data-off={bar.enabled ? undefined : 'true'}
                  data-continued={bar.continued ? 'true' : undefined}
                  style={{ left: pct(bar.from), width: pct(bar.to - bar.from) }}
                />
              ))}
          </span>
        </div>
      ))}
      <div className="hr-week__row hr-week__axis">
        <span className="hr-week__day" />
        <span className="hr-week__ticks nv-num">
          {[0, 6, 12, 18, 24].map((hour) => (
            <span key={hour} style={{ left: pct(hour * 60) }}>
              {`${String(hour)}\u00a0h`}
            </span>
          ))}
        </span>
      </div>
      <div className="nv-legend hr-week__legend">
        <span className="nv-legend__item">
          <span className="hr-week__key" />
          Créneau
        </span>
        <span className="nv-legend__item">
          <span className="hr-week__key" data-off="true" />
          Coupé
        </span>
        <span className="nv-legend__item">
          <span className="hr-week__key hr-week__key--quiet" />
          Heures calmes
        </span>
      </div>
    </div>
  );
}

function SlotLine({
  slot,
  issue,
  onChange,
  onRemove,
}: {
  slot: AgentSlot;
  issue: string | null;
  onChange: (slot: AgentSlot) => void;
  /** Null for the last slot: « À toute heure » or the Arrêt say « never », not an empty list. */
  onRemove: (() => void) | null;
}): JSX.Element {
  const id = useId();
  const day = DAY_NAMES[slot.day - 1] ?? '';
  const name = `le créneau du ${day}, ${slotWords(slot)}`;
  return (
    <li
      className="hr-slot"
      data-off={slot.enabled ? undefined : 'true'}
      data-invalid={issue === null ? undefined : 'true'}
    >
      <div className="hr-slot__fields">
        <select
          className="nv-field__control nv-glass hr-slot__day"
          value={slot.day}
          aria-label="Jour"
          onChange={(event) => {
            onChange({ ...slot, day: Number(event.target.value) });
          }}
        >
          {DAY_NAMES.map((dayName, index) => (
            <option key={dayName} value={index + 1}>
              {dayName}
            </option>
          ))}
        </select>
        <span className="hr-slot__hours">
          <TimeField
            className="hr-time"
            value={slot.startMinute}
            label={`Début du créneau du ${day}`}
            onChange={(startMinute) => {
              onChange({ ...slot, startMinute });
            }}
          />
          <span className="ps-hint">à</span>
          <TimeField
            className="hr-time"
            value={slot.endMinute}
            label={`Fin du créneau du ${day}`}
            onChange={(endMinute) => {
              onChange({ ...slot, endMinute });
            }}
          />
        </span>
        <span className="ps-hint hr-slot__words">{slotWords(slot)}</span>
        <span className="hr-slot__end">
          <label className="hr-slot__switch" htmlFor={id}>
            <span className="ps-hint">{slot.enabled ? 'Actif' : 'Coupé'}</span>
            <input
              id={id}
              type="checkbox"
              role="switch"
              className="nv-switch"
              checked={slot.enabled}
              aria-label={`Activer ${name}`}
              onChange={(event) => {
                onChange({ ...slot, enabled: event.target.checked });
              }}
            />
          </label>
          {onRemove === null ? null : (
            <button
              type="button"
              className="ps-entry__remove"
              aria-label={`Retirer ${name}`}
              onClick={onRemove}
            >
              ×
            </button>
          )}
        </span>
      </div>
      {issue === null ? null : <p className="ps-error">{issue}</p>}
    </li>
  );
}

function RangeLine({
  label,
  range,
  issue,
  onChange,
}: {
  label: string;
  range: MinuteRange;
  issue: string | null;
  onChange: (range: MinuteRange) => void;
}): JSX.Element {
  const overnight = range.endMinute < range.startMinute;
  return (
    <div className="hr-range" data-invalid={issue === null ? undefined : 'true'}>
      <div className="hr-slot__fields">
        <span className="hr-range__label">{label}</span>
        <span className="hr-slot__hours">
          <span className="ps-hint">de</span>
          <TimeField
            className="hr-time"
            value={range.startMinute}
            label={`${label} : début`}
            onChange={(startMinute) => {
              onChange({ ...range, startMinute });
            }}
          />
          <span className="ps-hint">à</span>
          <TimeField
            className="hr-time"
            value={range.endMinute}
            label={`${label} : fin`}
            onChange={(endMinute) => {
              onChange({ ...range, endMinute });
            }}
          />
        </span>
        {issue === null ? (
          <span className="ps-hint hr-slot__words">
            {rangeOf(range)}
            {overnight ? ', jusqu’au lendemain' : ''}
          </span>
        ) : null}
      </div>
      {issue === null ? null : <p className="ps-error">{issue}</p>}
    </div>
  );
}
