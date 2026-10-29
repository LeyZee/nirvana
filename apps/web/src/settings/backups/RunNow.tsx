import type { BackupStatus } from '@nirvana/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type JSX } from 'react';

import { PasswordStep, SignInAgain } from './PasswordStep';
import { requestBackupRun, type RunOutcome } from './api';
import { runNowOf } from './model';

import { backupStatusQuery } from '@/screens/dashboard/backups';

/** Why nothing was asked, each answer in its own words. */
const NOT_ASKED: Record<Exclude<RunOutcome['kind'], 'ok' | 'reauth'>, string> = {
  in_progress: 'Une sauvegarde est déjà en cours : son résultat s’affichera ici.',
  failed: 'La relance n’a pas été demandée : le serveur ne répond pas. Réessaie dans un instant.',
  rate_limited: 'La relance n’a pas été demandée : trop de requêtes d’un coup. Réessaie dans une minute.',
  session_expired: 'La relance n’a pas été demandée : ta session a expiré. Reconnecte-toi.',
};

/**
 * « Relancer la sauvegarde maintenant » (REG-24), under the strip of the nightly export. The API only records the
 * request; the `backup` service runs the same export as each night (ADR 0028 § 1). The request's id is made on the
 * press and kept through the password step: a retry is the same request.
 */
export function RunNow({ status }: { status: BackupStatus }): JSX.Element | null {
  const client = useQueryClient();
  const [requestId, setRequestId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [failure, setFailure] = useState<Exclude<RunOutcome['kind'], 'ok' | 'reauth'> | null>(null);
  const view = runNowOf(status);

  const send = async (id: string): Promise<void> => {
    setBusy(true);
    setFailure(null);
    const outcome = await requestBackupRun(id);
    setBusy(false);
    if (outcome.kind === 'reauth') {
      setNeedsPassword(true);
      return;
    }
    setNeedsPassword(false);
    if (outcome.kind === 'ok') {
      setRequestId(null);
      await client.invalidateQueries({ queryKey: backupStatusQuery.queryKey });
      return;
    }
    setFailure(outcome.kind);
    if (outcome.kind === 'in_progress') {
      setRequestId(null);
      await client.invalidateQueries({ queryKey: backupStatusQuery.queryKey });
    }
  };

  if (view.kind === 'running') return null;
  if (view.kind === 'asked') {
    return (
      <p className="bk-meta nv-swap" role="status">
        {view.text}
      </p>
    );
  }

  return (
    <div className="bk-run">
      {needsPassword && requestId !== null ? (
        <PasswordStep
          hint="Pour relancer la sauvegarde, confirme ton mot de passe."
          onConfirmed={() => {
            void send(requestId);
          }}
          onCancel={() => {
            setNeedsPassword(false);
          }}
        />
      ) : (
        <button
          type="button"
          className="nv-btn nv-btn--soft nv-btn--sm bk-self-start"
          disabled={busy}
          aria-busy={busy}
          onClick={() => {
            const id = requestId ?? crypto.randomUUID();
            setRequestId(id);
            void send(id);
          }}
        >
          Relancer la sauvegarde maintenant
        </button>
      )}
      {failure === null ? null : (
        <p className="bk-warn nv-swap" role="alert">
          {NOT_ASKED[failure]}
        </p>
      )}
      {failure === 'session_expired' ? <SignInAgain /> : null}
    </div>
  );
}
