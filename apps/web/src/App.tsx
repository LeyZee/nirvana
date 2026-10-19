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
  | { status: 'unreachable' }
  | { status: 'signed_out' }
  | { status: 'signed_in'; user: CurrentUser };

/** How often the app asks again while the server does not answer, as the Dashboard does. */
const RETRY_MS = 30_000;

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
        setSession({ status: 'unreachable' });
      },
    );
  }, []);

  useEffect(refresh, [refresh]);
  useEffect(() => {
    if (session.status !== 'unreachable') return undefined;
    const timer = setInterval(refresh, RETRY_MS);
    return () => {
      clearInterval(timer);
    };
  }, [session.status, refresh]);

  if (session.status === 'loading') {
    return <main className="nv-aura min-h-dvh" aria-busy="true" />;
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
