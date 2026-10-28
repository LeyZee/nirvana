import { Link } from '@tanstack/react-router';
import { useEffect, useRef, type JSX } from 'react';
import { createPortal } from 'react-dom';

import type { Fan } from './model';
import { lightUp } from './parts';

import { initialOf } from '@/lib/utils';
import { keepTabInside } from '@/shell/focus';

/**
 * The conversation of one fan, read only (revue 08): what she knows about him, the thread, and the agent's
 * notes where it stopped. Writing happens in Reveal. While Corrections does not exist, the way on is his conversation
 * in Suivi, offered only to an account whose rail holds Suivi and when the fan comes from the server's data.
 */
export function Reader({
  fan,
  creatorId,
  onClose,
  opensTracking,
}: {
  fan: Fan | null;
  /** Hers, for Suivi to open his conversation even outside her latest ones; null on the sample. */
  creatorId: string | null;
  onClose: () => void;
  opensTracking: boolean;
}): JSX.Element {
  const closeRef = useRef<HTMLButtonElement>(null);
  const open = fan !== null;

  useEffect(() => {
    if (!open) return undefined;
    const before = document.activeElement;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    addEventListener('keydown', onKey);
    return () => {
      removeEventListener('keydown', onKey);
      if (before instanceof HTMLElement) before.focus();
    };
  }, [open, onClose]);

  // On the body: a transformed ancestor (the entering header, the stage) would capture `position: fixed`.
  return createPortal(
    <>
      <div className={`db-scrim${open ? ' is-on' : ''}`} onClick={onClose} aria-hidden="true" />
      {/* A modal dialog over the page: Tab stays inside until it closes (recette 28/10, M5). */}
      <div
        className={`db-reader nv-glass nv-glass--thick${open ? ' is-on' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Conversation"
        aria-hidden={!open}
        inert={!open}
        ref={lightUp}
        onKeyDown={keepTabInside}
      >
        {fan === null ? null : (
          <>
            <div className="db-reader__head">
              <span className="nv-avatar" aria-hidden="true">
                {initialOf(fan.name)}
              </span>
              <span className="db-fan__who">
                <span className="db-fan__name">{fan.name}</span>
                <span className="db-fan__line">{fan.line}</span>
              </span>
              <button
                type="button"
                className="nv-iconbtn"
                aria-label="Fermer"
                ref={closeRef}
                onClick={onClose}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <div className="db-reader__notes" aria-label="Ce qu’elle sait de lui">
              {fan.alert === undefined ? null : <span className="nv-tag db-reader__alert">{fan.alert}</span>}
              {fan.notes.map((note, i) => (
                <span key={note} className="nv-tag" style={{ '--nv-i': i + 1 }}>
                  {note}
                </span>
              ))}
            </div>
            <div className="db-reader__body">
              <div className="nv-thread">
                {fan.thread.map((bubble, i) =>
                  bubble.from === 'flag' ? (
                    <div key={i} className="db-flag">
                      <b>Nirvana · </b>
                      {bubble.text}
                    </div>
                  ) : (
                    <div key={i} className={`nv-bubble nv-bubble--${bubble.from}`}>
                      {bubble.text}
                    </div>
                  ),
                )}
              </div>
            </div>
            <div className="db-reader__foot">
              <p>Lecture seule. Pour écrire, reprends la main dans Reveal.</p>
              {opensTracking && fan.conversationId !== undefined ? (
                <Link
                  to="/suivi"
                  search={{
                    conversation: fan.conversationId,
                    ...(creatorId === null ? {} : { creatrice: creatorId }),
                  }}
                  className="nv-btn nv-btn--soft nv-btn--sm"
                >
                  Ouvrir dans Suivi
                </Link>
              ) : null}
            </div>
          </>
        )}
      </div>
    </>,
    document.body,
  );
}
