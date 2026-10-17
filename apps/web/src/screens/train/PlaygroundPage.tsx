import { useEffect, useRef, useState, type JSX } from 'react';

import { Composer, Conversation, LessonCard, type LocalMode } from './playground/Conversation';
import { RateBar } from './playground/RateBar';
import { SetupPanel } from './playground/SetupPanel';
import { WhyPanel } from './playground/WhyPanel';
import type { PlaygroundErrorCode } from './playground/client';
import { destinationFor, fanMessageCount, needsAttention, stepOf } from './playground/logic';
import type { Comparison, Destination, Media, Verdict } from './playground/model';
import { usePlayground } from './playground/usePlayground';

const ERRORS: Readonly<Record<PlaygroundErrorCode, string>> = {
  llm_unavailable: 'Grok ne répond pas : ajoute ou vérifie sa clé dans Réglages, Modèles IA.',
  not_deployed: 'Le playground n’est pas encore en ligne sur ce serveur.',
  failed: 'Le serveur n’a pas répondu. Réessaie dans un instant.',
};

/**
 * Entraîner > Playground (spec moteur-ia/playground-entrainement.md): the same path as production with no
 * connection, one number on top, three gestures under each answer, every correction becomes a lesson.
 */
export function PlaygroundPage(): JSX.Element {
  const pg = usePlayground();
  const { state } = pg;
  const [mode, setMode] = useState<LocalMode>('idle');
  const [lesson, setLesson] = useState<{ verdict: Verdict; destination: Destination } | undefined>(undefined);
  const [comparison, setComparison] = useState<Comparison | undefined>(undefined);
  const [writing, setWriting] = useState(false);
  const [whyManual, setWhyManual] = useState<boolean | undefined>(undefined);
  const mainRef = useRef<HTMLElement>(null);

  const pending = state?.pending;
  const step = stepOf(state, mode, pg.busy);
  const whyOpen = whyManual ?? needsAttention(pending);

  // A new answer resets the panel to its default: folded unless something needs a look.
  useEffect(() => {
    setWhyManual(undefined);
  }, [pending]);

  const reset = (): void => {
    setMode('idle');
    setLesson(undefined);
    setComparison(undefined);
  };

  const rate = async (verdict: Verdict, destination?: Destination): Promise<void> => {
    if (!(await pg.run((c) => c.rate(verdict, destination)))) return;
    reset();
    // A rejected answer gets a new draw for the same moment, as a trainer would ask « again ».
    if (verdict.kind === 'rejected' && state !== undefined && state.pending?.handoff === undefined) {
      replay(fanMessageCount(state));
    }
  };

  const startLesson = (verdict: Verdict): void => {
    if (state === undefined) return;
    setLesson({ verdict, destination: destinationFor(verdict, state.reasons) ?? 'test' });
    setMode('lesson');
  };

  const answerTo = async (call: () => Promise<boolean>): Promise<void> => {
    setWriting(true);
    reset();
    await call();
    setWriting(false);
  };

  const send = (text: string, media: Media[]): void => {
    void answerTo(() => pg.run((c) => c.send(text, media)));
  };
  const replay = (n: number): void => {
    void answerTo(() => pg.run((c) => c.branch(n)));
  };

  const compare = async (): Promise<void> => {
    setWriting(true);
    try {
      setComparison(await pg.client.compare());
      setMode('compare');
    } catch {
      pg.fail('failed');
    } finally {
      setWriting(false);
    }
  };

  // Same keys as the copilot: A validate, E correct, R reject (docs/design/README.md).
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target;
      if (target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (event.key === 'Escape' && mode !== 'idle') reset();
      else if (step === 'rate' && key === 'a') void rate({ kind: 'validated' });
      else if ((step === 'rate' || step === 'blocked') && key === 'e') {
        event.preventDefault();
        setMode('edit');
      } else if (step === 'rate' && key === 'r') setMode('reject');
    };
    addEventListener('keydown', onKey);
    return () => {
      removeEventListener('keydown', onKey);
    };
  });

  if (state === undefined) {
    return (
      <div className="pg-loading nv-glass" aria-busy={pg.isLoading}>
        {pg.isLoading ? null : (
          <div className="pg-loading__in">
            <p>{ERRORS[pg.error ?? 'failed']}</p>
            <button type="button" className="nv-btn nv-btn--soft nv-btn--sm" onClick={pg.switchToDemo}>
              Essayer avec des réponses écrites à l’avance
            </button>
          </div>
        )}
      </div>
    );
  }

  const preset = state.presets.find((p) => p.id === state.presetId);
  const name =
    state.fanNotes
      .find((n) => /^prénom\s*:/i.test(n))
      ?.split(':')[1]
      ?.trim() ??
    preset?.label ??
    'Le fan';
  const fans = fanMessageCount(state);

  const onAction = (): void => {
    if (step === 'blocked') setMode('edit');
    else if (step === 'write') mainRef.current?.querySelector('textarea')?.focus();
    else if (step === 'lesson' && lesson !== undefined) void rate(lesson.verdict, lesson.destination);
    else
      mainRef.current
        ?.querySelector('.pg-gest, .pg-lesson, .pg-rej, .pg-edit')
        ?.scrollIntoView({ block: 'center' });
  };

  return (
    <div className="pg">
      <RateBar state={state} step={step} isDemo={pg.client.isDemo} onAction={onAction} />
      <SetupPanel state={state} pg={pg} />
      <main className="pg-main nv-glass" ref={mainRef} aria-label="Conversation">
        <div className="pg-top">
          <span className="nv-avatar nv-avatar--sm">{name.slice(0, 1).toUpperCase()}</span>
          <span className="pg-top__t">
            <b>{name}</b>
            <span>Fan fictif · {preset?.label.toLowerCase() ?? 'libre'}</span>
          </span>
          <button
            type="button"
            className="nv-btn nv-btn--soft nv-btn--sm"
            title="La même réponse par un autre modèle, côte à côte"
            disabled={step !== 'rate'}
            onClick={() => void compare()}
          >
            Comparer
          </button>
          <button
            type="button"
            className="nv-btn nv-btn--soft nv-btn--sm"
            title="Même fan, conversation remise à zéro"
            disabled={pg.busy || state.presetId === undefined}
            onClick={() => {
              reset();
              void pg.run((c) => c.choosePreset(state.presetId ?? ''));
            }}
          >
            Recommencer
          </button>
        </div>
        <Conversation
          state={state}
          mode={mode}
          busy={pg.busy}
          writing={writing}
          error={pg.error === undefined ? undefined : ERRORS[pg.error]}
          comparison={comparison}
          onValidate={() => void rate({ kind: 'validated' })}
          onEdit={() => {
            setMode('edit');
          }}
          onKeep={(text) => {
            startLesson({ kind: 'corrected', text });
          }}
          onReject={() => {
            setMode('reject');
          }}
          onReason={(reason) => {
            startLesson({ kind: 'rejected', reason });
          }}
          onCancel={reset}
          onRegenerate={() => {
            replay(fans);
          }}
          onHandoff={(wasRight) => {
            if (wasRight) void rate({ kind: 'validated' });
            else startLesson({ kind: 'rejected', reason: 'other', note: 'relais humain inutile' });
          }}
          onPick={(side) => {
            if (side === 'a') void rate({ kind: 'validated' });
            else startLesson({ kind: 'corrected', text: comparison?.bubbles.join('\n') ?? '' });
          }}
          onReplay={replay}
          onSend={send}
        />
        <div className="pg-dock">
          {mode === 'lesson' && lesson !== undefined ? (
            <LessonCard
              destination={lesson.destination}
              busy={pg.busy}
              onDestination={(destination) => {
                setLesson({ ...lesson, destination });
              }}
              onConfirm={() => void rate(lesson.verdict, lesson.destination)}
              onCancel={reset}
            />
          ) : null}
          <Composer
            disabled={pg.busy || pending !== undefined}
            placeholder={
              pending === undefined ? `Écris comme ${name} le ferait…` : 'Note d’abord la réponse de l’agent'
            }
            onSend={send}
          />
        </div>
      </main>
      <WhyPanel
        state={state}
        open={whyOpen}
        onToggle={() => {
          setWhyManual(!whyOpen);
        }}
      />
    </div>
  );
}
