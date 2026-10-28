import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
import { createPortal } from 'react-dom';

/**
 * « Annulable quelques secondes » (EQ-03), as a sale was in Imperium: a report or a validation waits here before it is
 * sent, and « Annuler » takes it back with nothing to undo at the server. What is held is sent when its time is up,
 * when another is held, when the page goes away (the request is `keepalive`) or when the screen is left.
 */

export const HOLD_MS = 5_000;

/** What a held write answers once sent: said in the island, which stays on a refusal until it is closed. */
export type HoldResult =
  | { readonly ok: true; readonly title: string; readonly text: string }
  | {
      readonly ok: false;
      readonly title: string;
      readonly text: string;
      /** What to do about it from the island: « Rouvrir » the form with what was typed, say. */
      readonly action?: HoldAction;
    };

export interface HoldAction {
  readonly label: string;
  readonly run: () => void;
}

type Phase =
  | {
      readonly kind: 'held';
      readonly key: number;
      readonly title: string;
      readonly text: string;
      readonly endsAt: number;
    }
  | { readonly kind: 'sending'; readonly key: number; readonly title: string; readonly text: string }
  | { readonly kind: 'done'; readonly key: number; readonly title: string; readonly text: string }
  | {
      readonly kind: 'failed';
      readonly key: number;
      readonly title: string;
      readonly text: string;
      readonly action: HoldAction | null;
    };

interface Held {
  readonly key: number;
  readonly run: () => Promise<HoldResult>;
  readonly onCancel: (() => void) | undefined;
  readonly timer: number;
}

export interface Hold {
  readonly phase: Phase | null;
  /** Holds `run` for `HOLD_MS`, said by `title` (« Envoi du rapport », then « dans 5 s ») and `text` (what it sends). */
  readonly hold: (
    what: { readonly title: string; readonly text: string; readonly onCancel?: () => void },
    run: () => Promise<HoldResult>,
  ) => void;
  readonly cancel: () => void;
  readonly dismiss: () => void;
}

const DONE_SHOWN_MS = 3_200;

export function useHold(): Hold {
  const [phase, setPhase] = useState<Phase | null>(null);
  const held = useRef<Held | null>(null);
  const keys = useRef(0);
  const live = useRef(true);
  const fade = useRef<number | null>(null);

  const settle = useCallback((key: number, result: HoldResult): void => {
    if (!live.current) return;
    const next: Phase = result.ok
      ? { kind: 'done', key, title: result.title, text: result.text }
      : { kind: 'failed', key, title: result.title, text: result.text, action: result.action ?? null };
    setPhase((now) => (now?.key === key ? next : now));
    if (result.ok) {
      if (fade.current !== null) window.clearTimeout(fade.current);
      fade.current = window.setTimeout(() => {
        setPhase((now) => (now?.key === key && now.kind === 'done' ? null : now));
      }, DONE_SHOWN_MS);
    }
  }, []);

  /** Sends what is held now: its time is up, another comes, or the screen goes away. */
  const flush = useCallback(
    (quiet: boolean): void => {
      const now = held.current;
      if (now === null) return;
      held.current = null;
      window.clearTimeout(now.timer);
      if (!quiet) setPhase((before) => (before?.key === now.key ? { ...before, kind: 'sending' } : before));
      void now.run().then(
        (result) => {
          settle(now.key, result);
        },
        () => {
          settle(now.key, {
            ok: false,
            title: 'Rien n’a été envoyé',
            text: 'Le serveur ne répond pas. Réessaie dans un instant.',
          });
        },
      );
    },
    [settle],
  );

  const hold = useCallback<Hold['hold']>(
    (what, run) => {
      flush(true);
      if (fade.current !== null) window.clearTimeout(fade.current);
      keys.current += 1;
      const key = keys.current;
      const timer = window.setTimeout(() => {
        flush(false);
      }, HOLD_MS);
      held.current = { key, run, onCancel: what.onCancel, timer };
      setPhase({ kind: 'held', key, title: what.title, text: what.text, endsAt: Date.now() + HOLD_MS });
    },
    [flush],
  );

  const cancel = useCallback((): void => {
    const now = held.current;
    if (now === null) return;
    held.current = null;
    window.clearTimeout(now.timer);
    setPhase(null);
    now.onCancel?.();
  }, []);

  const dismiss = useCallback((): void => {
    setPhase((now) => (now === null || now.kind === 'held' ? now : null));
  }, []);

  useEffect(() => {
    live.current = true;
    const leave = (): void => {
      flush(true);
    };
    window.addEventListener('pagehide', leave);
    return () => {
      window.removeEventListener('pagehide', leave);
      live.current = false;
      if (fade.current !== null) window.clearTimeout(fade.current);
      flush(true);
    };
  }, [flush]);

  return { phase, hold, cancel, dismiss };
}

/** The seconds left, counted down while something is held. */
function useSecondsLeft(endsAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (endsAt === null) return undefined;
    setNow(Date.now());
    const tick = window.setInterval(() => {
      setNow(Date.now());
    }, 200);
    return () => {
      window.clearInterval(tick);
    };
  }, [endsAt]);
  return endsAt === null ? 0 : Math.max(0, Math.ceil((endsAt - now) / 1000));
}

/**
 * The island at the foot of the screen: the countdown and « Annuler » while held, then what the server said. Above the
 * phone's tab bar; announced politely, and at once on a refusal.
 */
export function HoldIsland({ hold }: { hold: Hold }): JSX.Element | null {
  const { phase } = hold;
  const left = useSecondsLeft(phase?.kind === 'held' ? phase.endsAt : null);
  if (phase === null) return null;
  return createPortal(
    <div
      key={phase.key}
      className="rp-island nv-glass nv-glass--float"
      data-phase={phase.kind}
      role={phase.kind === 'failed' ? 'alert' : 'status'}
      aria-live={phase.kind === 'failed' ? 'assertive' : 'polite'}
    >
      <span className="rp-island__mark" aria-hidden="true">
        {phase.kind === 'held' ? (
          <>
            <svg viewBox="0 0 36 36" className="rp-island__ring">
              <circle cx="18" cy="18" r="16" pathLength={1} className="rp-island__track" />
              <circle
                cx="18"
                cy="18"
                r="16"
                pathLength={1}
                className="rp-island__left"
                style={{ animationDuration: `${String(HOLD_MS)}ms` }}
              />
            </svg>
            <span className="rp-island__count nv-num">{left}</span>
          </>
        ) : phase.kind === 'sending' ? (
          <span className="rp-island__spin" />
        ) : phase.kind === 'done' ? (
          <svg viewBox="0 0 20 20" className="rp-island__glyph">
            <path d="m5 10.5 3.2 3.2L15 7" />
          </svg>
        ) : (
          <svg viewBox="0 0 20 20" className="rp-island__glyph">
            <path d="M10 5.5v5.5M10 14.2v.1" />
          </svg>
        )}
      </span>
      <span className="rp-island__body">
        <span className="rp-island__title">
          {phase.kind === 'held' ? `${phase.title} dans ${String(left)} s` : phase.title}
        </span>
        <span className="rp-island__text">{phase.text}</span>
      </span>
      {phase.kind === 'held' ? (
        <button type="button" className="nv-btn nv-btn--soft nv-btn--sm rp-island__act" onClick={hold.cancel}>
          Annuler
        </button>
      ) : phase.kind === 'sending' ? null : (
        <span className="rp-island__acts">
          {phase.kind === 'failed' && phase.action !== null ? (
            <button
              type="button"
              className="nv-btn nv-btn--soft nv-btn--sm"
              onClick={() => {
                hold.dismiss();
                phase.action?.run();
              }}
            >
              {phase.action.label}
            </button>
          ) : null}
          <button
            type="button"
            className="nv-iconbtn rp-island__close"
            aria-label="Fermer"
            onClick={hold.dismiss}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="m4 4 8 8M12 4l-8 8" />
            </svg>
          </button>
        </span>
      )}
    </div>,
    document.body,
  );
}
