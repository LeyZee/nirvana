import { placeSegmentThumb } from '@nirvana/design-system';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';

import type { FloatingTip } from './parts';

import { MODES, missingLines, nextMode, type AgentMode, type AutomaticGate } from '@/agent/mode';

/** Arrow keys of the radio group and the way they move. */
const STEPS: Readonly<Record<string, 1 | -1>> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/**
 * The single control of the agent (revue 08, maquette v6): Automatique, open only when the server says so
 * (ADR 0019) and otherwise saying what is missing; Copilote; Arrêt, confirmed in a dialog that says what stops
 * and what stays. A radio group: the arrow keys move between the options that can be picked.
 */
export function ModeControl({
  mode,
  automatic,
  creatorName,
  tip,
  onChange,
}: {
  mode: AgentMode;
  automatic: AutomaticGate;
  creatorName: string;
  tip: FloatingTip;
  onChange: (mode: AgentMode) => void;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);
  const [confirming, setConfirming] = useState(false);
  const locked = !automatic.open;
  const index = MODES.indexOf(mode);

  const pick = (next: AgentMode): void => {
    if (next === mode) return;
    if (next === 'stop') setConfirming(true);
    else onChange(next);
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const step = STEPS[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = nextMode(mode, step, automatic);
    ref.current?.querySelector<HTMLButtonElement>(`[data-mode="${next}"]`)?.focus();
    pick(next);
  };

  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;
    placeSegmentThumb(
      element,
      index,
      MODES.length,
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
        onKeyDown={onKeyDown}
      >
        <span className="nv-seg__thumb nv-glass nv-glass--thin" ref={thumbRef} aria-hidden="true" />
        <button
          type="button"
          role="radio"
          className="nv-seg__opt"
          data-mode="auto"
          tabIndex={mode === 'auto' ? 0 : -1}
          aria-checked={mode === 'auto'}
          aria-disabled={locked}
          {...tip.bind({
            title: locked ? 'Automatique : verrouillé' : 'Automatique',
            text: locked
              ? `L’agent enverrait seul, sans validation. Il manque encore : ${missingLines(automatic).join(' ')}`
              : 'L’agent envoie seul, sans validation, dans les limites réglées.',
          })}
          onClick={() => {
            if (!locked) pick('auto');
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
          data-mode="copilot"
          tabIndex={mode === 'copilot' ? 0 : -1}
          aria-checked={mode === 'copilot'}
          {...tip.bind({
            title: 'Copilote',
            text: 'L’agent écrit, un chatteur valide chaque message dans Reveal avant qu’il parte.',
          })}
          onClick={() => {
            pick('copilot');
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
          data-mode="stop"
          tabIndex={mode === 'stop' ? 0 : -1}
          aria-checked={mode === 'stop'}
          {...tip.bind({
            title: 'Arrêt',
            text: 'L’agent n’écrit plus rien. Les chatteurs reprennent comme avant.',
          })}
          onClick={() => {
            pick('stop');
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
