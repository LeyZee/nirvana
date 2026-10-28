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
 * Shows the waiting draft, else the end of the thread. When the thread scrolls on its own (from 900 px), only the thread moves, never
 * the page; on a phone, where the reader is the whole screen, the page scrolls as before.
 */
export function bringIntoView(
  body: HTMLElement | null,
  draft: HTMLElement | null,
  end: HTMLElement | null,
): void {
  const target = draft ?? end;
  if (body === null || target === null) return;
  if (body.scrollHeight <= body.clientHeight) {
    target.scrollIntoView({ block: 'nearest' });
    return;
  }
  // A draft shows from its top; without one, the thread sits on its last message.
  body.scrollTop =
    draft === null
      ? body.scrollHeight
      : body.scrollTop + draft.getBoundingClientRect().top - body.getBoundingClientRect().top;
}
