import {
  ApiErrorSchema,
  BACKUP_ERROR_CODES,
  BackupStatusSchema,
  REAUTHENTICATION_ERROR_CODE,
  RestoreTestSchema,
  type BackupStatus,
  type RecordRestoreTestBody,
  type RestoreTest,
} from '@nirvana/contracts';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { REFUSALS } from './model';

/**
 * `/v1/backups` as Réglages › Sauvegardes reads and writes it (ADR 0028, EQ-17), parsed with the contract. The status
 * shares its cache with the Dashboard's banner: a test entered here clears the banner there.
 */

export const BACKUP_STATUS_KEY = ['backups', 'status'] as const;

async function fetchStatus(): Promise<BackupStatus> {
  const response = await fetch('/v1/backups/status', { credentials: 'include' });
  if (!response.ok) throw new Error(`GET /v1/backups/status: ${String(response.status)}`);
  return BackupStatusSchema.parse(await response.json());
}

export function useBackupStatusQuery(): UseQueryResult<BackupStatus> {
  return useQuery({ queryKey: BACKUP_STATUS_KEY, queryFn: fetchStatus, retry: 1 });
}

export type RefusalCode = keyof typeof REFUSALS;

export type Outcome =
  | { readonly kind: 'ok'; readonly value: RestoreTest }
  | { readonly kind: 'refused'; readonly code: RefusalCode }
  | { readonly kind: 'reauth' }
  | { readonly kind: 'failed' };

const isRefusal = (code: string): code is RefusalCode =>
  code === 'request_invalid' ||
  code === 'role_forbidden' ||
  BACKUP_ERROR_CODES.some((known) => known === code && known !== REAUTHENTICATION_ERROR_CODE);

/**
 * `POST /v1/backups/restore-tests` (owner, sign-in under 10 minutes). The same `id` sent twice is recorded once: a
 * retry after a lost answer is safe.
 */
export async function recordRestoreTest(body: RecordRestoreTestBody): Promise<Outcome> {
  try {
    const response = await fetch('/v1/backups/restore-tests', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (response.ok) return { kind: 'ok', value: RestoreTestSchema.parse(await response.json()) };
    const parsed = ApiErrorSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) return { kind: 'failed' };
    const { code } = parsed.data.error;
    if (code === REAUTHENTICATION_ERROR_CODE) return { kind: 'reauth' };
    return isRefusal(code) ? { kind: 'refused', code } : { kind: 'failed' };
  } catch {
    return { kind: 'failed' };
  }
}
