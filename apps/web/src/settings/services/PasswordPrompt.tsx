import { useEffect, useRef, useState, type JSX } from 'react';

import { confirmPassword } from './api';

const MESSAGES = {
  wrong_credentials: 'Ce n’est pas le bon mot de passe.',
  too_many_attempts: 'Trop d’essais. Attends une minute.',
  unavailable: 'Nirvana ne répond pas. Réessaie dans un instant.',
} as const;

/**
 * Asks for the password again before a key is connected, replaced or removed (ADR 0016: the sign-in is more than
 * 10 minutes old). Confirmed, it signs in afresh and lets the caller run its action again; « Annuler » or Escape
 * gives up the action.
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
  const [error, setError] = useState<string | null>(null);

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
    setError(MESSAGES[result]);
  }

  return (
    <div
      className="sv-reauth"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        // Handled here so that Escape leaves the prompt only, not the sheet around it.
        event.stopPropagation();
        onCancel();
      }}
    >
      <p className="sv-muted">Pour toucher à une clé, confirme ton mot de passe.</p>
      <form
        className="sv-key"
        data-error={error !== null}
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
          aria-invalid={error !== null}
          aria-describedby="sv-reauth-msg"
          disabled={isBusy}
        />
        <button type="submit" className="nv-btn nv-btn--soft nv-btn--sm" disabled={isBusy}>
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
        data-kind={error === null ? 'none' : 'error'}
        aria-live="polite"
      >
        {error}
      </p>
    </div>
  );
}
