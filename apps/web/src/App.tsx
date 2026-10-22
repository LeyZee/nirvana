import type { CurrentUser } from '@nirvana/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { useCallback, useEffect, useState, type JSX } from 'react';

import { SignInPage } from './auth/SignInPage';
import { Unreachable } from './auth/Unreachable';
import { fetchCurrentUser, signOut } from './auth/session';
import { createAppRouter, type RouterContext } from './router';

type Session =
  | { status: 'loading' }
  /** `attempt` counts the failed reads in a row, so the next one waits a little longer. */
  | { status: 'unreachable'; attempt: number }
  | { status: 'signed_out' }
  | { status: 'signed_in'; user: CurrentUser };

/**
 * When the app asks again while the server does not answer: quickly at first (a local server still starting), then
 * every 30 s, as the Dashboard does.
 */
const RETRY_MS = [3_000, 10_000, 30_000] as const;

/**
 * Route guard: nothing of the dashboard renders without a session (P0-07a). Only a 401 means « no session »: a server
 * that does not answer says so, and is asked again, instead of sending a signed-in user to the sign-in form.
 */
export function App(): JSX.Element {
  const [session, setSession] = useState<Session>({ status: 'loading' });

  const refresh = useCallback(() => {
    fetchCurrentUser().then(
      (user) => {
        setSession(user === null ? { status: 'signed_out' } : { status: 'signed_in', user });
      },
      () => {
        setSession((before) => ({
          status: 'unreachable',
          attempt: before.status === 'unreachable' ? before.attempt + 1 : 0,
        }));
      },
    );
  }, []);

  useEffect(refresh, [refresh]);
  useEffect(() => {
    if (session.status !== 'unreachable') return undefined;
    const timer = setTimeout(refresh, RETRY_MS[Math.min(session.attempt, RETRY_MS.length - 1)]);
    return () => {
      clearTimeout(timer);
    };
  }, [session, refresh]);

  if (session.status === 'loading') {
    // A breathing dot while the session is read: the page is not blank, and says nothing it does not know yet.
    return (
      <main className="nv-aura grid min-h-dvh place-items-center" aria-busy="true">
        <span className="nv-dot nv-dot--live" role="status" aria-label="Chargement de Nirvana" />
      </main>
    );
  }
  if (session.status === 'unreachable') return <Unreachable />;
  if (session.status === 'signed_out') {
    return <SignInPage onSignedIn={refresh} />;
  }
  return <SignedIn user={session.user} onSignOut={() => void signOut().then(refresh)} />;
}

/** The dashboard itself: one router per signed-in user, so a new session starts on a clean state. */
function SignedIn({ user, onSignOut }: RouterContext): JSX.Element {
  const [router] = useState(() => createAppRouter({ user, onSignOut }));
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} context={{ user, onSignOut }} />
    </QueryClientProvider>
  );
}
