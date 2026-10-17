import { useEffect, useRef, useState, type JSX } from 'react';

import { confirmPassword, type ConfirmResult } from './api';

const MESSAGES: Record<Exclude<ConfirmResult, 'ok'>, string> = {
  wrong_credentials: 'Ce n’est pas le bon mot de passe.',
  too_many_attempts: 'Trop d’essais. Attends une minute avant de réessayer.',
  unavailable: 'Nirvana ne répond pas. Réessaie dans un instant.',
  session_expired: 'Ta session a expiré. Reconnecte-toi.',
};

/** The way out of an expired session: reloading the page lands on the sign-in. */
export function SignInAgain(): JSX.Element {
  return (
    <button
      type="button"
      className="nv-btn nv-btn--soft nv-btn--sm sv-self-start"
      onClick={() => {
        window.location.reload();
      }}
    >
      Se reconnecter
    </button>
  );
}

/**
 * Asks for the password again before a key is connected, replaced or removed (ADR 0016: the sign-in is more than
 * 10 minutes old). Confirmed, it signs in afresh and lets the caller run its action again; « Annuler » or Escape
 * gives up the action, except while the password is being checked. The page shows one prompt at a time: the
 * Services section closes a row's prompt before it opens a sheet.
 */
export function PasswordPrompt({
  onConfirmed,
  onCancel,
}: {
  onConfirmed: () => void;
  onCancel: () => void;
}): JSX.Element {
  const input = useRef<HTMLInputElement>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [failure, setFailure] = useState<Exclude<ConfirmResult, 'ok'> | null>(null);

  useEffect(() => {
    input.current?.focus();
  }, []);

  async function confirm(password: string): Promise<void> {
    if (password === '') return;
    setIsBusy(true);
    const result = await confirmPassword(password).catch(() => 'unavailable' as const);
    setIsBusy(false);
    if (result === 'ok') {
      onConfirmed();
      return;
    }
    if (input.current !== null) input.current.value = '';
    setFailure(result);
  }

  const isExpired = failure === 'session_expired';
  return (
    <div
      className="sv-reauth"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        // Handled here so that Escape leaves the prompt only, not the sheet around it.
        event.stopPropagation();
        if (!isBusy) onCancel();
      }}
    >
      <p className="sv-muted">Pour toucher à une clé, confirme ton mot de passe.</p>
      <form
        className="sv-key"
        data-error={failure !== null}
        onSubmit={(event) => {
          event.preventDefault();
          void confirm(input.current?.value ?? '');
        }}
      >
        <input
          ref={input}
          type="password"
          autoComplete="current-password"
          aria-label="Mot de passe"
          aria-invalid={failure !== null}
          aria-describedby="sv-reauth-msg"
          disabled={isBusy || isExpired}
        />
        <button type="submit" className="nv-btn nv-btn--soft nv-btn--sm" disabled={isBusy || isExpired}>
          Confirmer
        </button>
        <button
          type="button"
          className="nv-btn nv-btn--plain nv-btn--sm"
          disabled={isBusy}
          onClick={onCancel}
        >
          Annuler
        </button>
      </form>
      <p
        id="sv-reauth-msg"
        className="sv-msg"
        data-kind={failure === null ? 'none' : 'error'}
        aria-live="polite"
      >
        {failure === null ? null : MESSAGES[failure]}
      </p>
      {isExpired ? <SignInAgain /> : null}
    </div>
  );
}
