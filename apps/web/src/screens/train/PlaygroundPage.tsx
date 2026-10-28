import type { Destination, PlaygroundComparison, PlaygroundMedia, Verdict } from '@nirvana/contracts';
import { useEffect, useState, type JSX } from 'react';

import { Composer, Conversation, LessonCard, type LocalMode } from './playground/Conversation';
import { RateBar } from './playground/RateBar';
import { SetupPanel } from './playground/SetupPanel';
import { WhyPanel } from './playground/WhyPanel';
import { COMPARE_MODEL, PlaygroundError, type PlaygroundErrorCode } from './playground/client';
import { fanMessageCount, needsAttention, stepOf } from './playground/logic';
import { isHandoff, suggestedDestination } from './playground/model';
import { usePlayground } from './playground/usePlayground';

import { initialOf } from '@/lib/utils';

/** The fan's name while the scenario gives none. */
const FALLBACK_NAME = 'Le fan';

const ERRORS: Readonly<Record<PlaygroundErrorCode, string>> = {
  llm_unavailable: 'Grok ne répond pas : ajoute ou vérifie sa clé dans Réglages, Modèles IA.',
  not_deployed: 'Le playground n’est pas encore en ligne sur ce serveur.',
  still_writing: 'L’agent rédige encore la réponse précédente.',
  forbidden: 'Le Playground est réservé au propriétaire pour l’instant.',
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
  const [comparison, setComparison] = useState<PlaygroundComparison | undefined>(undefined);
  const [writing, setWriting] = useState(false);
  const [whyManual, setWhyManual] = useState<boolean | undefined>(undefined);

  const pending = state?.pending ?? null;
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
    if (verdict.kind === 'rejected' && state !== undefined && !isHandoff(state.pending)) {
      replay(fanMessageCount(state));
    }
  };

  const startLesson = (verdict: Verdict): void => {
    setLesson({ verdict, destination: suggestedDestination(verdict) ?? 'test' });
    setMode('lesson');
  };

  const answerTo = async (call: () => Promise<boolean>): Promise<boolean> => {
    setWriting(true);
    reset();
    const done = await call();
    setWriting(false);
    return done;
  };

  const send = (text: string, media: PlaygroundMedia[]): Promise<boolean> =>
    answerTo(() => pg.run((c) => c.send(text, media)));
  const replay = (n: number): void => {
    void answerTo(() => pg.run((c) => c.branch(n)));
  };

  const compare = async (): Promise<void> => {
    setWriting(true);
    try {
      setComparison(await pg.client.compare(COMPARE_MODEL));
      setMode('compare');
    } catch (error) {
      pg.fail(error instanceof PlaygroundError ? error.code : 'failed');
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
      <div className="pg-loading nv-plate" aria-busy={pg.isLoading}>
        {pg.isLoading ? null : (
          <div className="pg-loading__in">
            <p>{ERRORS[pg.error ?? 'failed']}</p>
            {/* Refused, the demo would only hide the reason: nothing to try. */}
            {pg.error === 'forbidden' ? null : (
              <button type="button" className="nv-btn nv-btn--soft nv-btn--sm" onClick={pg.switchToDemo}>
                Essayer avec des réponses écrites à l’avance
              </button>
            )}
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
    FALLBACK_NAME;
  const fans = fanMessageCount(state);

  return (
    <div className="pg">
      <RateBar state={state} isDemo={pg.client.isDemo} />
      <SetupPanel state={state} pg={pg} />
      {/* A section, not a <main>: the shell already holds the page's one landmark (recette R-C5). */}
      <section className="pg-main nv-plate" aria-label="Conversation">
        <div className="pg-top">
          <span className="nv-avatar nv-avatar--sm">{initialOf(name)}</span>
          <span className="pg-top__t">
            <b>{name}</b>
            <span>Fan fictif · {preset?.label.toLowerCase() ?? 'libre'}</span>
          </span>
          <button
            type="button"
            className="nv-btn nv-btn--sm"
            title="La même réponse par un autre modèle, côte à côte"
            disabled={step !== 'rate'}
            onClick={() => void compare()}
          >
            Comparer
          </button>
          <button
            type="button"
            className="nv-btn nv-btn--sm"
            title="Même fan, conversation remise à zéro"
            disabled={pg.busy}
            onClick={() => {
              reset();
              void pg.run((c) => c.reset());
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
            disabled={pg.busy || pending !== null}
            placeholder={
              pending === null
                ? `Écris comme ${name === FALLBACK_NAME ? 'le fan' : name}…`
                : 'Note d’abord la réponse'
            }
            onSend={send}
          />
        </div>
      </section>
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
