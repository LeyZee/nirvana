import type { JSX } from 'react';

/**
 * The server does not answer before any session is known: not a sign-in matter, so no sign-in form. Amber, as on the
 * Dashboard: a warning, the red stays the urgencies'. The app asks again on its own.
 */
export function Unreachable(): JSX.Element {
  return (
    <main className="nv-aura grid min-h-dvh place-items-center px-4">
      <section className="nv-glass nv-glass--pad flex w-full max-w-sm items-start gap-4" role="status">
        <span className="nv-orb nv-tone--warn shrink-0" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">
            Le serveur <em className="text-[var(--nv-warning)] not-italic">ne répond pas</em>
          </h1>
          <p className="text-sm text-[var(--nv-ink-muted)]">
            Nirvana réessaie tout seul et revient dès qu’il répond.
          </p>
        </div>
      </section>
    </main>
  );
}
