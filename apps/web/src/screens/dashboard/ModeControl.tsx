import { placeSegmentThumb } from '@nirvana/design-system';
import { useEffect, useLayoutEffect, useRef, useState, type JSX } from 'react';
import { createPortal } from 'react-dom';

import type { AgentMode } from './model';
import type { FloatingTip } from './parts';

const ORDER: readonly AgentMode[] = ['auto', 'copilot', 'stop'];

/**
 * The single control of the agent (revue 08, maquette v6): Automatique, locked under the target of the
 * Taux en réel; Copilote; Arrêt, confirmed in a dialog that says what stops and what stays.
 */
export function ModeControl({
  mode,
  liveRate,
  creatorName,
  tip,
  onChange,
}: {
  mode: AgentMode;
  liveRate: { rate: number; target: number };
  creatorName: string;
  tip: FloatingTip;
  onChange: (mode: AgentMode) => void;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);
  const [confirming, setConfirming] = useState(false);
  const locked = liveRate.rate < liveRate.target;
  const index = ORDER.indexOf(mode);

  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;
    placeSegmentThumb(
      element,
      index,
      ORDER.length,
      placed.current ? (thumbRef.current ?? undefined) : undefined,
    );
    placed.current = true;
  }, [index]);

  return (
    <>
      <div
        className="nv-seg nv-glass nv-glass--thin db-mode"
        role="radiogroup"
        aria-label="Mode de l’agent"
        data-tone={mode === 'stop' ? 'danger' : undefined}
        ref={ref}
      >
        <span className="nv-seg__thumb nv-glass nv-glass--thin" ref={thumbRef} aria-hidden="true" />
        <button
          type="button"
          role="radio"
          className="nv-seg__opt"
          aria-checked={mode === 'auto'}
          aria-disabled={locked}
          {...tip.bind({
            title: locked ? 'Automatique : verrouillé' : 'Automatique',
            text: locked
              ? `L’agent enverrait seul, sans validation. Il s’ouvre quand le taux en réel atteint ${String(liveRate.target)}\u00a0% des réponses approuvées sans retouche par les chatteurs. Aujourd’hui\u00a0: ${String(liveRate.rate)}\u00a0%.`
              : 'L’agent envoie seul, sans validation, dans les limites réglées.',
          })}
          onClick={() => {
            if (!locked) onChange('auto');
          }}
        >
          {locked ? (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
          ) : null}
          Automatique
        </button>
        <button
          type="button"
          role="radio"
          className="nv-seg__opt"
          aria-checked={mode === 'copilot'}
          {...tip.bind({
            title: 'Copilote',
            text: 'L’agent écrit, un chatteur valide chaque message dans Reveal avant qu’il parte.',
          })}
          onClick={() => {
            onChange('copilot');
          }}
        >
          <span
            className={`nv-dot nv-tone--ok${mode === 'copilot' ? ' nv-dot--live' : ''} db-mode__dot`}
            aria-hidden="true"
          />
          Copilote
        </button>
        <button
          type="button"
          role="radio"
          className="nv-seg__opt"
          aria-checked={mode === 'stop'}
          {...tip.bind({
            title: 'Arrêt',
            text: 'L’agent n’écrit plus rien. Les chatteurs reprennent comme avant.',
          })}
          onClick={() => {
            if (mode !== 'stop') setConfirming(true);
          }}
        >
          <span className="nv-dot nv-tone--bad db-mode__dot" aria-hidden="true" />
          Arrêt
        </button>
      </div>
      <StopDialog
        open={confirming}
        creatorName={creatorName}
        onCancel={() => {
          setConfirming(false);
        }}
        onConfirm={() => {
          setConfirming(false);
          onChange('stop');
        }}
      />
    </>
  );
}

function StopDialog({
  open,
  creatorName,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  creatorName: string;
  onCancel: () => void;
  onConfirm: () => void;
}): JSX.Element {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    cancelRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onCancel();
    };
    addEventListener('keydown', onKey);
    return () => {
      removeEventListener('keydown', onKey);
    };
  }, [open, onCancel]);

  // On the body: a transformed ancestor (the entering header, the stage) would capture `position: fixed`.
  return createPortal(
    <>
      <div className={`db-scrim${open ? ' is-on' : ''}`} onClick={onCancel} aria-hidden="true" />
      <div
        className={`db-dialog nv-glass nv-glass--thick${open ? ' is-on' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="db-stop-title"
        aria-hidden={!open}
        inert={!open}
      >
        <h3 id="db-stop-title">Arrêter l’agent ?</h3>
        <p>Plus aucun message ne part au nom de {creatorName}, ni proposé ni envoyé.</p>
        <ul>
          <li>Les conversations restent lues et notées.</li>
          <li>Les chatteurs reprennent dans Reveal comme avant.</li>
          <li>Tu relances d’un clic sur Copilote.</li>
        </ul>
        <div className="db-dialog__actions">
          <button type="button" className="nv-btn nv-btn--soft" ref={cancelRef} onClick={onCancel}>
            Annuler
          </button>
          <button type="button" className="nv-btn nv-btn--soft nv-btn--destructive" onClick={onConfirm}>
            Arrêter l’agent
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
