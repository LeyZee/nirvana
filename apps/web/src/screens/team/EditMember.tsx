import {
  SetCommissionRateBodySchema,
  TEAM_MEMBER_STATUSES,
  UpdateTeamMemberBodySchema,
  type CommissionPreset,
  type CreatorSummary,
  type TeamMember,
  type TeamMemberStatus,
} from '@nirvana/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useId, useState, type JSX } from 'react';

import { Dialog } from './Dialog';
import { changeStatus, MEMBERS_KEY, setCommission, updateMember, type Outcome } from './api';
import {
  ERROR_MESSAGES,
  formatRate,
  longDay,
  parseRate,
  periodStartsFrom,
  STATUS_LABELS,
  today,
} from './model';

/**
 * Changing a member once added (EQ-10, owner only): their team name, colour and creators; their rate from a 1st or a
 * 16th; their status, « Parti » after a confirmation. Each panel writes one thing and the server checks it.
 */

/** A write that reads the team again when it lands, and words a refusal. */
function useWrite(): {
  busy: boolean;
  problem: string | null;
  run: <T>(write: () => Promise<Outcome<T>>) => Promise<boolean>;
} {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const run = async <T,>(write: () => Promise<Outcome<T>>): Promise<boolean> => {
    setBusy(true);
    setProblem(null);
    const outcome = await write();
    setBusy(false);
    if (outcome.kind === 'ok') {
      await client.invalidateQueries({ queryKey: MEMBERS_KEY });
      return true;
    }
    setProblem(
      outcome.kind === 'refused'
        ? ERROR_MESSAGES[outcome.code]
        : 'Rien n’a changé : le serveur ne répond pas. Réessaie dans un instant.',
    );
    return false;
  };
  return { busy, problem, run };
}

function Foot({
  busy,
  problem,
  ready,
  label,
  destructive = false,
  onClose,
}: {
  busy: boolean;
  problem: string | null;
  ready: boolean;
  label: string;
  destructive?: boolean;
  onClose: () => void;
}): JSX.Element {
  return (
    <>
      {problem === null ? null : (
        <p className="tm-warn nv-swap" role="alert">
          {problem}
        </p>
      )}
      <div className="tm-dialog__foot">
        <button type="button" className="nv-btn nv-btn--plain" disabled={busy} onClick={onClose}>
          Annuler
        </button>
        <button
          type="submit"
          className={`nv-btn ${destructive ? 'nv-btn--destructive' : 'nv-btn--neon'}`}
          disabled={!ready || busy}
          aria-busy={busy}
        >
          {busy ? 'Enregistrement…' : label}
        </button>
      </div>
    </>
  );
}

/** « Modifier »: the team name, the planning colour and the creators. Only what changed is sent. */
export function EditMemberPanel({
  member,
  creators,
  onClose,
}: {
  member: TeamMember;
  creators: readonly CreatorSummary[];
  onClose: () => void;
}): JSX.Element {
  const id = useId();
  const { busy, problem, run } = useWrite();
  const [displayName, setDisplayName] = useState(member.displayName);
  const [color, setColor] = useState(member.color);
  const [creatorIds, setCreatorIds] = useState<readonly string[]>(member.creatorIds);
  const name = displayName.trim();
  const sameCreators =
    creatorIds.length === member.creatorIds.length &&
    creatorIds.every((one) => member.creatorIds.some((theirs) => theirs === one));
  // Only what changed, read by the contract: an empty change sends nothing.
  const body = UpdateTeamMemberBodySchema.safeParse({
    ...(name === member.displayName ? {} : { displayName: name }),
    ...(color === member.color ? {} : { color }),
    ...(sameCreators ? {} : { creatorIds }),
  });
  const ready = name !== '' && body.success;

  return (
    <Dialog title={`Modifier ${member.displayName}`} busy={busy} onClose={onClose}>
      <form
        className="tm-dialog__body"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!ready) return;
          const change = body.data;
          void run(() => updateMember(member.id, change)).then((done) => {
            if (done) onClose();
          });
        }}
      >
        <div className="nv-field tm-field" data-invalid={name === '' ? 'true' : undefined}>
          <label className="nv-field__label" htmlFor={`${id}-name`}>
            Nom dans l’équipe
          </label>
          <input
            id={`${id}-name`}
            className="nv-field__control nv-glass"
            value={displayName}
            maxLength={80}
            autoComplete="off"
            data-autofocus
            aria-invalid={name === ''}
            onChange={(event) => {
              setDisplayName(event.target.value);
            }}
          />
          <span className={name === '' ? 'tm-hint tm-hint--error' : 'tm-hint'}>
            {name === '' ? 'Indique le nom que voit l’équipe.' : 'Celui du planning et des passations.'}
          </span>
        </div>
        <div className="nv-field tm-field">
          <label className="nv-field__label" htmlFor={`${id}-color`}>
            Couleur du planning
          </label>
          <span className="tm-color">
            <input
              id={`${id}-color`}
              type="color"
              className="tm-color__well"
              value={color ?? '#8a8a8a'}
              onChange={(event) => {
                setColor(event.target.value.toLowerCase());
              }}
            />
            <span className="tm-hint">{color ?? 'Aucune pour l’instant.'}</span>
          </span>
        </div>
        <div className="nv-field tm-field">
          <span className="nv-field__label">Créatrices</span>
          {creators.length === 0 ? (
            <span className="tm-hint">Aucune créatrice pour l’instant.</span>
          ) : (
            <div className="tm-choices" role="group" aria-label="Créatrices">
              {creators.map((creator) => {
                const on = creatorIds.includes(creator.id);
                return (
                  <button
                    key={creator.id}
                    type="button"
                    className="nv-chip"
                    aria-pressed={on}
                    onClick={() => {
                      setCreatorIds(
                        on ? creatorIds.filter((one) => one !== creator.id) : [...creatorIds, creator.id],
                      );
                    }}
                  >
                    {creator.displayName}
                  </button>
                );
              })}
            </div>
          )}
          <span className="tm-hint">Celles de son travail, à partir de maintenant.</span>
        </div>
        <Foot busy={busy} problem={problem} ready={ready} label="Enregistrer" onClose={onClose} />
      </form>
    </Dialog>
  );
}

/**
 * « Changer le taux »: a preset or a rate by hand, and the first day of a period ahead it starts on (Charles, 28/10:
 * a period is paid at one rate, nothing is recomputed backwards). A manager keeps or changes his share of the team.
 */
export function RatePanel({
  member,
  presets,
  onClose,
}: {
  member: TeamMember;
  presets: readonly CommissionPreset[];
  onClose: () => void;
}): JSX.Element {
  const id = useId();
  const { busy, problem, run } = useWrite();
  const starts = periodStartsFrom(today(), 4);
  const [from, setFrom] = useState(starts[0] ?? today());
  // Nothing chosen at first: a rate is never changed by a stray tap.
  const [presetId, setPresetId] = useState<string | null>(null);
  const [byHand, setByHand] = useState(presets.length === 0);
  const [rate, setRate] = useState('');
  const manager = member.teamRole === 'manager';
  const kept = manager ? (member.commission?.teamShareBps ?? null) : null;
  const [share, setShare] = useState(kept === null ? '' : String(kept / 100).replace('.', ','));
  const typed = parseRate(rate);
  const shareBps = share.trim() === '' ? null : parseRate(share);
  const rateOk = byHand ? typed !== null : presetId !== null;
  const shareOk = !manager || share.trim() === '' || shareBps !== null;
  const body = SetCommissionRateBodySchema.safeParse({
    commission: byHand ? { rateBps: typed } : { presetId },
    teamShareBps: manager ? shareBps : null,
    effectiveFrom: from,
  });
  const ready = rateOk && shareOk && body.success;

  return (
    <Dialog
      title="Changer le taux"
      lead={
        member.commission === null
          ? `${member.displayName} n’a pas encore de taux.`
          : `Aujourd’hui ${formatRate(member.commission.rateBps)}, depuis le ${longDay(member.commission.effectiveFrom)}.`
      }
      busy={busy}
      onClose={onClose}
    >
      <form
        className="tm-dialog__body"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!ready) return;
          const rateFrom = body.data;
          void run(() => setCommission(member.id, rateFrom)).then((done) => {
            if (done) onClose();
          });
        }}
      >
        <div className="nv-field tm-field">
          <span className="nv-field__label">Nouveau taux</span>
          <div className="tm-presets" role="radiogroup" aria-label="Préréglage de commission">
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                role="radio"
                className="tm-preset"
                aria-checked={!byHand && presetId === preset.id}
                onClick={() => {
                  setPresetId(preset.id);
                  setByHand(false);
                }}
              >
                <span className="tm-preset__name">{preset.name}</span>
                <span className="tm-preset__rate">{formatRate(preset.rateBps)}</span>
              </button>
            ))}
            <button
              type="button"
              role="radio"
              className="tm-preset"
              aria-checked={byHand}
              onClick={() => {
                setByHand(true);
              }}
            >
              <span className="tm-preset__name">Autre</span>
              <span className="tm-preset__rate tm-preset__rate--word">À la main</span>
            </button>
          </div>
          {byHand ? (
            <span className="tm-percent nv-swap">
              <input
                className="nv-field__control nv-glass"
                inputMode="decimal"
                placeholder="12,5"
                aria-label="Taux à la main"
                aria-invalid={rate.trim() !== '' && typed === null}
                value={rate}
                onChange={(event) => {
                  setRate(event.target.value);
                }}
              />
              <span aria-hidden="true">%</span>
            </span>
          ) : null}
          {byHand && rate.trim() !== '' && typed === null ? (
            <span className="tm-hint tm-hint--error">Un taux entre 0 et 100 %, par exemple 12,5.</span>
          ) : null}
        </div>
        {manager ? (
          <div className="nv-field tm-field" data-invalid={shareOk ? undefined : 'true'}>
            <label className="nv-field__label" htmlFor={`${id}-share`}>
              Part du net de l’équipe
            </label>
            <span className="tm-percent">
              <input
                id={`${id}-share`}
                className="nv-field__control nv-glass"
                inputMode="decimal"
                placeholder="5"
                aria-invalid={!shareOk}
                value={share}
                onChange={(event) => {
                  setShare(event.target.value);
                }}
              />
              <span aria-hidden="true">%</span>
            </span>
            <span className={shareOk ? 'tm-hint' : 'tm-hint tm-hint--error'}>
              {shareOk ? 'Vide : pas de part.' : 'Une part entre 0 et 100 %, ou rien.'}
            </span>
          </div>
        ) : null}
        <div className="nv-field tm-field">
          <span className="nv-field__label">À partir du</span>
          <div className="tm-choices" role="radiogroup" aria-label="À partir du">
            {starts.map((day) => (
              <button
                key={day}
                type="button"
                role="radio"
                className="nv-chip"
                aria-checked={from === day}
                onClick={() => {
                  setFrom(day);
                }}
              >
                {longDay(day)}
              </button>
            ))}
          </div>
          <span className="tm-hint">
            Une quinzaine se paie à un seul taux : le nouveau part d’un 1er ou d’un 16, rien n’est recalculé
            avant.
          </span>
        </div>
        <Foot busy={busy} problem={problem} ready={ready} label="Enregistrer le taux" onClose={onClose} />
      </form>
    </Dialog>
  );
}

/** What « Parti » does, said before it is done: it cannot be undone from Nirvana. */
const LEAVING = (name: string): string =>
  `${name} n’aura plus accès à Nirvana : ses créatrices lui sont retirées et ses sessions fermées. Sa fiche, ses rapports et ses relevés restent. Ce changement est définitif.`;

/** « Changer le statut »: at work, away (leave, sick, travelling), suspended, or gone for good after a confirmation. */
export function StatusPanel({ member, onClose }: { member: TeamMember; onClose: () => void }): JSX.Element {
  const { busy, problem, run } = useWrite();
  const [status, setStatus] = useState<TeamMemberStatus>(member.status);
  const [sure, setSure] = useState(false);
  const leaving = status === 'left';
  const ready = status !== member.status && (!leaving || sure);

  return (
    <Dialog title={`Statut de ${member.displayName}`} busy={busy} onClose={onClose}>
      <form
        className="tm-dialog__body"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!ready) return;
          void run(() => changeStatus(member.id, status)).then((done) => {
            if (done) onClose();
          });
        }}
      >
        <div className="tm-choices" role="radiogroup" aria-label="Statut">
          {TEAM_MEMBER_STATUSES.map((one) => (
            <button
              key={one}
              type="button"
              role="radio"
              className="nv-chip"
              aria-checked={status === one}
              onClick={() => {
                setStatus(one);
                setSure(false);
              }}
            >
              {STATUS_LABELS[one]}
            </button>
          ))}
        </div>
        {status === 'suspended' ? (
          <p className="tm-hint nv-swap">Suspendu : un accès restreint reste ouvert, rien n’est retiré.</p>
        ) : null}
        {leaving ? (
          <div className="nv-confirm nv-swap" role="alertdialog" aria-label="Confirmer le départ">
            <p className="sc-confirm__text">{LEAVING(member.displayName)}</p>
            <label className="tm-sure">
              <input
                type="checkbox"
                checked={sure}
                onChange={(event) => {
                  setSure(event.target.checked);
                }}
              />
              {member.displayName} quitte l’équipe
            </label>
          </div>
        ) : null}
        <Foot
          busy={busy}
          problem={problem}
          ready={ready}
          label={leaving ? 'Confirmer le départ' : 'Enregistrer'}
          destructive={leaving}
          onClose={onClose}
        />
      </form>
    </Dialog>
  );
}
