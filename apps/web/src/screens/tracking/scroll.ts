import { useEffect, useRef, type RefObject } from 'react';

/**
 * Whether the end of the thread is in view, kept up to date as the person scrolls. Without IntersectionObserver
 * (jsdom), the end counts as in view, as the reader opens there.
 */
export function useEndInView(endRef: RefObject<HTMLDivElement | null>): RefObject<boolean> {
  const inView = useRef(true);
  useEffect(() => {
    const end = endRef.current;
    if (end === null || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) inView.current = entry.isIntersecting;
    });
    observer.observe(end);
    return () => {
      observer.disconnect();
    };
  }, [endRef]);
  return inView;
}

/**
 * Shows the waiting draft, else the end of the thread. From 900 px the thread has its own scroll (`tracking.css`): only
 * the thread moves, never the page, even when the thread is shorter than its box. On a phone, where the reader is the
 * whole screen, the page scrolls as before. The choice follows the thread's computed overflow, so it follows the CSS.
 */
export function bringIntoView(
  body: HTMLElement | null,
  draft: HTMLElement | null,
  end: HTMLElement | null,
): void {
  const target = draft ?? end;
  if (body === null || target === null) return;
  if (getComputedStyle(body).overflowY !== 'auto') {
    target.scrollIntoView({ block: 'nearest' });
    return;
  }
  // A draft shows from its top; without one, the thread sits on its last message.
  body.scrollTop =
    draft === null
      ? body.scrollHeight
      : body.scrollTop + draft.getBoundingClientRect().top - body.getBoundingClientRect().top;
}
