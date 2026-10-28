import type { FanFlags, SetFanFlagBody } from '@nirvana/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type JSX } from 'react';

import { FanFlagsRefused, fetchFanFlags, setFanFlag } from './api';
import {
  ageLine,
  ceilingProblem,
  centsOf,
  euros,
  flagsSummary,
  isBlocking,
  isOn,
  SWITCHES,
  switchDetail,
  type SwitchFlag,
} from './flags-model';

/**
 * The fan's limits (P3-02), read by the policy before any offer: folded to one line, amber when one stops the agent
 * from writing or selling. Owners and chatters set or lift them; a creator reads them. Confirming his age takes two
 * clicks, since it opens explicit content.
 */
export function FanLimits({
  creatorId,
  fanId,
  canDecide,
}: {
  creatorId: string;
  fanId: string;
  canDecide: boolean;
}): JSX.Element {
  const key = ['fan-flags', creatorId, fanId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchFanFlags(creatorId, fanId),
    retry: (count, failure) => !(failure instanceof FanFlagsRefused) && count < 3,
  });
  const client = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Opened at first sight when a limit blocks, then left to the user: lifting the last one must not fold it away. */
  const [open, setOpen] = useState<boolean | null>(null);

  const change = async (body: SetFanFlagBody): Promise<boolean> => {
    setPending(true);
    setError(null);
    const result = await setFanFlag(creatorId, fanId, body);
    if (result.ok) client.setQueryData(key, result.flags);
    else setError(result.message);
    setPending(false);
    return result.ok;
  };

  const flags = query.data;
  const blocking = flags !== undefined && isBlocking(flags);
  if (open === null && flags !== undefined) setOpen(blocking);
  return (
    <details
      className="tr-limits"
      open={open ?? false}
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
      }}
    >
      <summary>
        <span className="tr-limits__title">Limites du fan</span>
        <span className={`tr-limits__sum${blocking ? ' tr-warn' : ''}`}>
          {flags !== undefined
            ? flagsSummary(flags)
            : query.error instanceof FanFlagsRefused
              ? 'Tu ne peux pas voir ses limites'
              : query.isError
                ? 'Le serveur ne répond pas'
                : '…'}
        </span>
      </summary>
      {flags === undefined ? null : (
        <div className="tr-limits__body">
          {SWITCHES.map((s) => (
            <Switch
              key={s.flag}
              flag={s.flag}
              label={s.label}
              meaning={switchDetail(flags, s.flag) ?? s.meaning}
              on={isOn(flags, s.flag)}
              warn={(s.flag === 'doNotContact' || s.flag === 'salesFrozen') && isOn(flags, s.flag)}
              disabled={!canDecide || pending}
              onChange={(set) => void change(switchBody(s.flag, set))}
            />
          ))}
          <Age flags={flags} canDecide={canDecide} pending={pending} change={change} />
          <Ceiling flags={flags} canDecide={canDecide} pending={pending} change={change} />
          {error === null ? null : (
            <p className="tr-warn tr-line" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </details>
  );
}

/** A freeze set by hand is a human's call; lifting needs no reason. */
const switchBody = (flag: SwitchFlag, set: boolean): SetFanFlagBody =>
  !set
    ? { flag, set: false }
    : flag === 'salesFrozen'
      ? { flag, set: true, freezeReason: 'operator' }
      : { flag, set: true };

function Switch({
  flag,
  label,
  meaning,
  on,
  warn,
  disabled,
  onChange,
}: {
  flag: SwitchFlag;
  label: string;
  meaning: string;
  on: boolean;
  warn: boolean;
  disabled: boolean;
  onChange: (set: boolean) => void;
}): JSX.Element {
  const id = `tr-flag-${flag}`;
  return (
    <div className="tr-limit">
      <label htmlFor={id} className="tr-limit__text">
        <span className={`tr-limit__label${warn ? ' tr-warn' : ''}`}>{label}</span>
        <span className="tr-limit__hint">{meaning}</span>
      </label>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="nv-switch"
        checked={on}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
      />
    </div>
  );
}

interface RowProps {
  flags: FanFlags;
  canDecide: boolean;
  pending: boolean;
  change: (body: SetFanFlagBody) => Promise<boolean>;
}

/** Confirming opens explicit content: a first click asks, a second one confirms. Withdrawing is one click. */
function Age({ flags, canDecide, pending, change }: RowProps): JSX.Element {
  const [asking, setAsking] = useState(false);
  const confirmed = flags.ageConfirmedAt !== undefined;
  return (
    <div className="tr-limit">
      <span className="tr-limit__text">
        <span className="tr-limit__label">Âge confirmé</span>
        <span className="tr-limit__hint">
          {asking ? 'Tu as vérifié qu’il est majeur ? L’agent pourra devenir explicite.' : ageLine(flags)}
        </span>
      </span>
      {!canDecide ? null : confirmed ? (
        <button
          type="button"
          className="nv-btn nv-btn--plain nv-btn--sm"
          disabled={pending}
          onClick={() => void change({ flag: 'ageConfirmedAt', set: false })}
        >
          Retirer
        </button>
      ) : asking ? (
        <span className="tr-limit__actions">
          <button
            type="button"
            className="nv-btn nv-btn--soft nv-btn--sm"
            disabled={pending}
            onClick={() =>
              void change({ flag: 'ageConfirmedAt', set: true }).then((ok) => {
                if (ok) setAsking(false);
              })
            }
          >
            Oui, il est majeur
          </button>
          <button
            type="button"
            className="nv-btn nv-btn--plain nv-btn--sm"
            disabled={pending}
            onClick={() => {
              setAsking(false);
            }}
          >
            Annuler
          </button>
        </span>
      ) : (
        <button
          type="button"
          className="nv-btn nv-btn--soft nv-btn--sm"
          disabled={pending}
          onClick={() => {
            setAsking(true);
          }}
        >
          Confirmer son âge
        </button>
      )}
    </div>
  );
}

/** The ceiling he set himself, typed in euros, stored in cents. */
function Ceiling({ flags, canDecide, pending, change }: RowProps): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const problem = ceilingProblem(text);
  const cents = problem === null ? centsOf(text) : null;
  const limit = flags.spendingLimitMinor;
  return (
    <div className="tr-limit">
      <span className="tr-limit__text">
        <span className="tr-limit__label">Plafond de dépenses</span>
        <span className="tr-limit__hint">
          {limit === undefined
            ? 'Aucun plafond.'
            : `Il a fixé ${euros(limit)} : l’agent ne propose rien au-delà.`}
        </span>
        {editing && problem !== null ? (
          <span className="tr-limit__hint tr-warn" role="status">
            {problem}
          </span>
        ) : null}
      </span>
      {!canDecide ? null : editing ? (
        <span className="tr-limit__actions">
          <input
            className="nv-field__control tr-limit__amount"
            inputMode="decimal"
            aria-label="Plafond en euros"
            placeholder="50 €"
            value={text}
            disabled={pending}
            onChange={(event) => {
              setText(event.target.value);
            }}
          />
          <button
            type="button"
            className="nv-btn nv-btn--soft nv-btn--sm"
            disabled={pending || cents === null}
            onClick={() => {
              if (cents === null) return;
              void change({ flag: 'spendingLimitMinor', set: true, limitMinor: cents }).then((ok) => {
                if (ok) {
                  setEditing(false);
                  setText('');
                }
              });
            }}
          >
            Enregistrer
          </button>
          <button
            type="button"
            className="nv-btn nv-btn--plain nv-btn--sm"
            disabled={pending}
            onClick={() => {
              setEditing(false);
              setText('');
            }}
          >
            Annuler
          </button>
        </span>
      ) : limit === undefined ? (
        <button
          type="button"
          className="nv-btn nv-btn--soft nv-btn--sm"
          disabled={pending}
          onClick={() => {
            setEditing(true);
          }}
        >
          Fixer un plafond
        </button>
      ) : (
        <button
          type="button"
          className="nv-btn nv-btn--plain nv-btn--sm"
          disabled={pending}
          onClick={() => void change({ flag: 'spendingLimitMinor', set: false })}
        >
          Lever
        </button>
      )}
    </div>
  );
}
