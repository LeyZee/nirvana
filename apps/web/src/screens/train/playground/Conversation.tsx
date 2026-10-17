import { useEffect, useRef, useState, type JSX } from 'react';

import { MEDIA_KINDS } from './SetupPanel';
import { bubblesOf } from './logic';
import {
  DESTINATION_HINTS,
  DESTINATION_LABELS,
  DestinationSchema,
  type Answer,
  type Comparison,
  type Destination,
  type Media,
  type MediaKind,
  type PlaygroundState,
  type Turn,
} from './model';

const KIND_LABELS: Readonly<Record<MediaKind, string>> = { image: 'Photo', video: 'Vidéo', audio: 'Vocal' };

export type LocalMode = 'idle' | 'edit' | 'reject' | 'lesson' | 'compare';

export interface ConversationProps {
  readonly state: PlaygroundState;
  readonly mode: LocalMode;
  readonly busy: boolean;
  readonly writing: boolean;
  readonly error: string | undefined;
  readonly comparison: Comparison | undefined;
  readonly onValidate: () => void;
  readonly onEdit: () => void;
  readonly onKeep: (text: string) => void;
  readonly onReject: () => void;
  readonly onReason: (code: string) => void;
  readonly onCancel: () => void;
  readonly onRegenerate: () => void;
  readonly onHandoff: (wasRight: boolean) => void;
  readonly onPick: (side: 'a' | 'b') => void;
  readonly onReplay: (fanMessageNumber: number) => void;
  readonly onSend: (text: string, media: Media[]) => void;
}

/** Index in the history of her answer still waiting for a rating (the engine keeps an answer that passed). */
function pendingIndex(history: readonly Turn[], pending: Answer | undefined): number {
  if (pending === undefined || pending.isBlocked) return -1;
  const lastFan = history.findLastIndex((t) => t.from === 'fan');
  return history.findIndex((t, i) => i > lastFan && t.from === 'creator' && t.media === undefined);
}

export function Conversation(props: ConversationProps): JSX.Element {
  const { state, busy, writing } = props;
  const pending = state.pending;
  const draftAt = pendingIndex(state.history, pending);
  const endRef = useRef<HTMLDivElement>(null);
  let fanCount = 0;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [state.history.length, pending, props.mode, writing]);

  return (
    <div className="pg-thread nv-scroll">
      <div className="nv-thread">
        {state.history.length === 0 && pending === undefined && !writing ? (
          <Empty
            opening={state.presets.find((p) => p.id === state.presetId)?.opening}
            onSend={props.onSend}
          />
        ) : null}
        {state.history.map((turn, index) => {
          if (turn.from === 'fan') fanCount += 1;
          const n = fanCount;
          if (index === draftAt) return <Draft key={index} answer={pending} text={turn.text} {...props} />;
          return (
            <TurnView
              key={index}
              turn={turn}
              canReplay={turn.from === 'fan' && !busy}
              onReplay={() => {
                props.onReplay(n);
              }}
            />
          );
        })}
        {pending !== undefined && draftAt === -1 ? (
          <Draft answer={pending} text={pending.bubbles.join('\n')} {...props} />
        ) : null}
        {writing ? (
          <span className="pg-writing">
            <span className="nv-typing" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            L’agent rédige
          </span>
        ) : null}
        {props.error === undefined ? null : (
          <p role="alert" className="pg-error">
            {props.error}
          </p>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}

/** An empty conversation says what to do and offers the first message of this fan type. */
function Empty({
  opening,
  onSend,
}: {
  opening: string | undefined;
  onSend: (text: string, media: Media[]) => void;
}): JSX.Element {
  return (
    <div className="pg-empty">
      <p className="pg-empty__t">À toi de jouer le fan</p>
      <p className="pg-empty__s">Rien ne part : c’est le même chemin que la production, sans connexion.</p>
      {opening === undefined ? null : (
        <button
          type="button"
          className="pg-empty__go nv-tap"
          title="Envoyer ce premier message"
          onClick={() => {
            onSend(opening, []);
          }}
        >
          <span>Commencer par</span>« {opening} »
        </button>
      )}
    </div>
  );
}

function TurnView({
  turn,
  canReplay,
  onReplay,
}: {
  turn: Turn;
  canReplay: boolean;
  onReplay: () => void;
}): JSX.Element {
  return (
    <div className={`pg-m pg-m--${turn.from}`}>
      {canReplay ? (
        <button
          type="button"
          className="pg-m__re"
          title="La conversation repart de ce message : une nouvelle réponse au même moment"
          onClick={onReplay}
        >
          Rejouer d’ici
        </button>
      ) : null}
      {(turn.media ?? []).map((m, i) => (
        <MediaCard key={i} media={m} from={turn.from} />
      ))}
      {bubblesOf(turn.text).map((line, i) => (
        <div key={i} className={`nv-bubble nv-bubble--${turn.from}`}>
          {line}
        </div>
      ))}
    </div>
  );
}

function MediaCard({ media, from }: { media: Media; from: Turn['from'] }): JSX.Element {
  return (
    <div className={`pg-media ${media.isLocked === true ? 'is-locked' : ''}`}>
      <span className="pg-media__k">
        {KIND_LABELS[media.kind]}{' '}
        {from === 'fan' ? 'du fan' : media.isLocked === true ? 'payante, floutée' : 'offerte'}
      </span>
      <span className="pg-media__d">{media.factualDescription}</span>
    </div>
  );
}

function Draft({
  answer,
  text,
  ...props
}: ConversationProps & { answer: Answer | undefined; text: string }): JSX.Element | null {
  const [edit, setEdit] = useState(text);
  useEffect(() => {
    setEdit(text);
  }, [text, props.mode]);
  if (answer === undefined) return null;

  if ((answer.handoff?.length ?? 0) > 0) {
    return (
      <div className="pg-relay" role="group" aria-label="Relais humain">
        <p className="pg-relay__t">
          <b>Relais à un humain : {answer.handoff?.join(', ')}</b>
          {answer.brief?.understood} L’agent ne répond plus à ce fan et toute vente est bloquée.
        </p>
        <div className="pg-gest">
          <button
            type="button"
            className="nv-btn nv-btn--soft nv-btn--sm"
            disabled={props.busy}
            onClick={() => {
              props.onHandoff(false);
            }}
          >
            Pas nécessaire
          </button>
          <button
            type="button"
            className="nv-btn nv-btn--neon nv-btn--sm"
            disabled={props.busy}
            onClick={() => {
              props.onHandoff(true);
            }}
          >
            Bon réflexe
          </button>
        </div>
      </div>
    );
  }

  if (props.mode === 'compare' && props.comparison !== undefined) {
    return (
      <div className="pg-duo-wrap">
        <span className="nv-draft-label">La même réponse par deux modèles : garde la meilleure</span>
        <div className="pg-duo">
          {(
            [
              ['a', answer.model ?? 'A', bubblesOf(text)],
              ['b', props.comparison.model ?? 'B', props.comparison.bubbles],
            ] as const
          ).map(([side, model, lines]) => (
            <div key={side} className="pg-duo__c">
              <p className="nv-eyebrow">
                {side.toUpperCase()} · {model}
              </p>
              {lines.map((line, i) => (
                <div key={i} className="nv-bubble nv-bubble--draft">
                  {line}
                </div>
              ))}
              <button
                type="button"
                className="nv-btn nv-btn--soft nv-btn--sm"
                disabled={props.busy}
                onClick={() => {
                  props.onPick(side);
                }}
              >
                Garder celle-ci
              </button>
            </div>
          ))}
        </div>
        <div className="pg-gest">
          <button type="button" className="nv-btn nv-btn--plain nv-btn--sm" onClick={props.onCancel}>
            Annuler
          </button>
        </div>
      </div>
    );
  }

  if (props.mode === 'edit') {
    return (
      <div className="pg-edit">
        <textarea
          aria-label="Ce qu’elle aurait écrit, une ligne par bulle"
          rows={Math.max(2, bubblesOf(edit).length + 1)}
          value={edit}
          autoFocus
          onFocus={(event) => {
            event.currentTarget.select();
          }}
          onChange={(event) => {
            setEdit(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              if (edit.trim() !== '') props.onKeep(bubblesOf(edit).join('\n'));
            }
            if (event.key === 'Escape') props.onCancel();
          }}
        />
        <small>Une ligne par bulle · Entrée pour garder, Échap pour annuler</small>
        <div className="pg-gest">
          <button type="button" className="nv-btn nv-btn--plain nv-btn--sm" onClick={props.onCancel}>
            Annuler
          </button>
          <button
            type="button"
            className="nv-btn nv-btn--neon nv-btn--sm"
            disabled={edit.trim() === ''}
            onClick={() => {
              props.onKeep(bubblesOf(edit).join('\n'));
            }}
          >
            Garder
          </button>
        </div>
      </div>
    );
  }

  const lines = answer.isBlocked ? answer.bubbles : bubblesOf(text);
  const blocking = answer.violations.filter((v) => v.blocking);
  return (
    <div className="pg-draft">
      <span className="nv-draft-label">{answer.isBlocked ? 'Bloquée avant envoi' : 'Proposée, à noter'}</span>
      {lines.map((line, i) => (
        <div key={i} className={`nv-bubble nv-bubble--draft ${answer.isBlocked ? 'is-blocked' : ''}`}>
          {line}
        </div>
      ))}
      {answer.isBlocked ? (
        <>
          <span className="pg-blockr">
            Bloquée :{' '}
            {blocking.length > 0 ? blocking.map((v) => v.label).join(', ') : (answer.failure ?? 'relecture')}
          </span>
          <div className="pg-gest">
            <button
              type="button"
              className="nv-btn nv-btn--soft nv-btn--sm"
              disabled={props.busy}
              onClick={props.onRegenerate}
            >
              Régénérer
            </button>
            <button
              type="button"
              className="nv-btn nv-btn--neon nv-btn--sm"
              disabled={props.busy}
              onClick={props.onEdit}
            >
              Corriger <span className="nv-kbd">E</span>
            </button>
          </div>
        </>
      ) : props.mode === 'reject' ? (
        <div className="pg-rej">
          <p className="nv-eyebrow">Pourquoi ?</p>
          <div className="pg-chips">
            {props.state.reasons.map((r) => (
              <button
                key={r.code}
                type="button"
                className="nv-chip"
                onClick={() => {
                  props.onReason(r.code);
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button type="button" className="nv-btn nv-btn--plain nv-btn--sm" onClick={props.onCancel}>
            Annuler
          </button>
        </div>
      ) : props.mode === 'lesson' ? null : (
        <div className="pg-gest">
          <button
            type="button"
            className="nv-btn nv-btn--soft nv-btn--sm"
            disabled={props.busy}
            onClick={props.onReject}
          >
            Rejeter <span className="nv-kbd">R</span>
          </button>
          <button
            type="button"
            className="nv-btn nv-btn--soft nv-btn--sm"
            disabled={props.busy}
            onClick={props.onEdit}
          >
            Corriger <span className="nv-kbd">E</span>
          </button>
          <button
            type="button"
            className="nv-btn nv-btn--neon nv-btn--sm"
            disabled={props.busy}
            onClick={props.onValidate}
          >
            Valider <span className="nv-kbd">A</span>
          </button>
        </div>
      )}
    </div>
  );
}

/** After a correction or a rejection: where the lesson goes. One destination is proposed. */
export function LessonCard({
  destination,
  busy,
  onDestination,
  onConfirm,
  onCancel,
}: {
  destination: Destination;
  busy: boolean;
  onDestination: (d: Destination) => void;
  onConfirm: () => void;
  onCancel: () => void;
}): JSX.Element {
  return (
    <div className="pg-lesson nv-glass nv-glass--thin" role="group" aria-label="Ranger la leçon">
      <span className="pg-lesson__q">
        Cette leçon devient
        <small>{DESTINATION_HINTS[destination]}</small>
      </span>
      <div className="pg-chips" role="radiogroup" aria-label="Destination">
        {DestinationSchema.options.map((d) => (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={d === destination}
            className="nv-chip"
            onClick={() => {
              onDestination(d);
            }}
          >
            {DESTINATION_LABELS[d]}
          </button>
        ))}
      </div>
      <button type="button" className="nv-btn nv-btn--plain nv-btn--sm" onClick={onCancel}>
        Annuler
      </button>
      <button type="button" className="nv-btn nv-btn--neon nv-btn--sm" disabled={busy} onClick={onConfirm}>
        Confirmer
      </button>
    </div>
  );
}

/** His message, and a media described in words (Vision reads the real file once the import exists). */
export function Composer({
  disabled,
  placeholder,
  onSend,
}: {
  disabled: boolean;
  placeholder: string;
  onSend: (text: string, media: Media[]) => void;
}): JSX.Element {
  const [text, setText] = useState('');
  const [attachOpen, setAttachOpen] = useState(false);
  const [kind, setKind] = useState<MediaKind>('image');
  const [described, setDescribed] = useState('');
  const media: Media[] =
    attachOpen && described.trim() !== '' ? [{ kind, factualDescription: described.trim() }] : [];

  const ready = !disabled && (text.trim() !== '' || media.length > 0);

  const send = (): void => {
    if (!ready) return;
    onSend(text.trim(), media);
    setText('');
    setDescribed('');
    setAttachOpen(false);
  };

  return (
    <div className="pg-composer">
      {attachOpen ? (
        <div className="pg-attach">
          <div className="pg-kinds" role="radiogroup" aria-label="Type de média du fan">
            {MEDIA_KINDS.map((k) => (
              <button
                key={k.kind}
                type="button"
                role="radio"
                aria-checked={k.kind === kind}
                className="nv-chip"
                onClick={() => {
                  setKind(k.kind);
                }}
              >
                {k.label}
              </button>
            ))}
          </div>
          <input
            className="pg-input"
            value={described}
            autoFocus
            placeholder="Ce qu’on y voit, comme la Vision le décrirait"
            aria-label="Ce qu’on voit dans le média du fan"
            onChange={(event) => {
              setDescribed(event.target.value);
            }}
          />
        </div>
      ) : null}
      <form
        className="nv-composer nv-glass"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <button
          type="button"
          className="nv-iconbtn pg-attach__btn"
          aria-expanded={attachOpen}
          title="Joindre un média comme le fan"
          disabled={disabled}
          onClick={() => {
            setAttachOpen(!attachOpen);
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <circle cx="9" cy="9" r="2" />
            <path d="m21 15-5-5L5 21" />
          </svg>
        </button>
        <textarea
          className="nv-composer__input"
          rows={1}
          value={text}
          aria-label="Message du fan"
          placeholder={placeholder}
          disabled={disabled}
          onChange={(event) => {
            setText(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
        />
        {/* Neon only once there is something to send: until then the answer to rate is the one action. */}
        <button
          type="submit"
          className={`nv-btn nv-btn--sm ${ready ? 'nv-btn--neon' : 'nv-btn--soft'}`}
          disabled={!ready}
        >
          Envoyer
        </button>
      </form>
    </div>
  );
}
