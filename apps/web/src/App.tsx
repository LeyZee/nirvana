import type { CurrentUser } from '@nirvana/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { useCallback, useEffect, useState, type JSX } from 'react';

import { SignInPage } from './auth/SignInPage';
import { fetchCurrentUser, signOut } from './auth/session';
import { createAppRouter, type RouterContext } from './router';

type Session = { status: 'loading' } | { status: 'signed_out' } | { status: 'signed_in'; user: CurrentUser };

/** Route guard: nothing of the dashboard renders without a session (P0-07a). */
export function App(): JSX.Element {
  const [session, setSession] = useState<Session>({ status: 'loading' });

  const refresh = useCallback(() => {
    fetchCurrentUser().then(
      (user) => {
        setSession(user === null ? { status: 'signed_out' } : { status: 'signed_in', user });
      },
      () => {
        setSession({ status: 'signed_out' });
      },
    );
  }, []);

  useEffect(refresh, [refresh]);

  if (session.status === 'loading') {
    return <main className="nv-aura min-h-dvh" aria-busy="true" />;
  }
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
