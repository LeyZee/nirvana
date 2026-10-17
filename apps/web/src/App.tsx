import type { CurrentUser } from '@nirvana/contracts';
import { useCallback, useEffect, useState, type JSX } from 'react';

import { SignInPage } from './auth/SignInPage';
import { fetchCurrentUser, signOut } from './auth/session';

type Session = { status: 'loading' } | { status: 'signed_out' } | { status: 'signed_in'; user: CurrentUser };

const ROLE_LABELS: Record<CurrentUser['role'], string> = {
  owner: 'Propriétaire',
  operator: 'Opérateur',
  creator: 'Créatrice',
};

/** Route guard: nothing of the dashboard renders without a session (P0-07a). The screens come later (D-01, P3). */
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
  return (
    <main className="nv-aura grid min-h-dvh place-items-center px-4">
      <div className="nv-glass nv-glass--pad flex flex-col items-center gap-4 text-center">
        <h1 className="font-serif text-4xl italic">Nirvana</h1>
        <p>
          {session.user.name} · {ROLE_LABELS[session.user.role]}
        </p>
        <button className="nv-btn nv-btn--plain" type="button" onClick={() => void signOut().then(refresh)}>
          Se déconnecter
        </button>
      </div>
    </main>
  );
}
