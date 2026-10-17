import { useState, type JSX, type SyntheticEvent } from 'react';

import { signIn, type SignInResult } from './session';

const MESSAGES: Record<Exclude<SignInResult, 'ok'>, string> = {
  wrong_credentials: 'Email ou mot de passe incorrect.',
  too_many_attempts: 'Trop de tentatives. Réessaie dans une minute.',
  unavailable: 'Le serveur ne répond pas. Réessaie dans un instant.',
};

/** The only public screen: email and password, one action, the error said plainly. */
export function SignInPage({ onSignedIn }: { onSignedIn: () => void }): JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const field = (name: string): string => {
      const value = form.get(name);
      return typeof value === 'string' ? value : '';
    };
    setIsSubmitting(true);
    setError(null);
    const result = await signIn(field('email'), field('password')).catch((): SignInResult => 'unavailable');
    setIsSubmitting(false);
    if (result === 'ok') onSignedIn();
    else setError(MESSAGES[result]);
  }

  return (
    <main className="nv-aura grid min-h-dvh place-items-center px-4">
      <form
        className="nv-glass nv-glass--pad flex w-full max-w-sm flex-col gap-5"
        onSubmit={(event) => void submit(event)}
      >
        <h1 className="font-serif text-4xl italic">Nirvana</h1>
        <label className="nv-field">
          <span className="nv-field__label">Email</span>
          <input
            className="nv-field__control nv-glass"
            name="email"
            type="email"
            autoComplete="username"
            required
            autoFocus
          />
        </label>
        <label className="nv-field">
          <span className="nv-field__label">Mot de passe</span>
          <input
            className="nv-field__control nv-glass"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        {error === null ? null : (
          <p role="alert" className="text-sm text-[var(--nv-neon)]">
            {error}
          </p>
        )}
        <button className="nv-btn nv-btn--neon" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </main>
  );
}
