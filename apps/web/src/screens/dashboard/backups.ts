import { BackupStatusSchema, type BackupStatus } from '@nirvana/contracts';
import { useQuery } from '@tanstack/react-query';

/** The export is daily: reading its state again every five minutes is plenty. */
const REFRESH_MS = 300_000;

/** `GET /v1/backups/status`, owner only (ADR 0028, OPS-02), parsed with the contract. */
async function fetchBackupStatus(): Promise<BackupStatus> {
  const response = await fetch('/v1/backups/status', { credentials: 'include' });
  if (!response.ok) throw new Error(`GET /v1/backups/status: ${String(response.status)}`);
  return BackupStatusSchema.parse(await response.json());
}

/** The state of the daily export, read for the owner only; undefined until it answers, or while it fails. */
export function useBackupStatus(enabled: boolean): BackupStatus | undefined {
  return useQuery({
    queryKey: ['backups', 'status'],
    queryFn: fetchBackupStatus,
    enabled,
    refetchInterval: REFRESH_MS,
    retry: 1,
  }).data;
}

export interface BackupBanner {
  readonly title: string;
  readonly text: string;
}

/** « 26 octobre à 03:12 », in the reader's time zone. */
function when(iso: string, timeZone: string | undefined): string {
  const at = new Date(iso);
  const day = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone }).format(at);
  const clock = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone }).format(at);
  return `${day} à ${clock}`;
}

/**
 * Nothing while the export is on time (zero noise). Otherwise one amber sentence: a copy is missing, not an urgency of
 * a fan (the red stays the urgencies'). Nothing in the app fixes it, so the banner has no action.
 */
export function backupBannerOf(status: BackupStatus, timeZone?: string): BackupBanner | null {
  if (status.state === 'ok') return null;
  const running = status.lastRun?.status === 'running' ? ' Une sauvegarde est en cours.' : '';
  const failed = status.lastRun?.status === 'failed' ? 'La dernière tentative a échoué. ' : '';
  if (status.state === 'never' || status.lastSucceededAt === null) {
    return {
      title: 'Aucune sauvegarde encore',
      text: `${failed}La sauvegarde chiffrée de chaque nuit n’a jamais réussi : rien n’est copié hors de la base.${running}`,
    };
  }
  return {
    title: `Aucune sauvegarde réussie depuis le ${when(status.lastSucceededAt, timeZone)}`,
    text: `${failed}Elle doit réussir au moins toutes les ${String(status.overdueAfterHours)} h : d’ici là, rien de récent n’est copié hors de la base.${running}`,
  };
}
