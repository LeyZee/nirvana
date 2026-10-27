import type { BackupStatus } from '@nirvana/contracts';
import { describe, expect, it } from 'vitest';

import { backupBannerOf } from './backups';

const status = (patch: Partial<BackupStatus>): BackupStatus => ({
  state: 'ok',
  lastSucceededAt: '2026-10-26T02:12:00.000Z',
  overdueAfterHours: 26,
  lastRun: null,
  ...patch,
});

describe('the backup banner', () => {
  it('says nothing while the export is on time', () => {
    expect(backupBannerOf(status({}))).toBeNull();
  });

  it('says since when no export succeeded, in the reader’s time', () => {
    expect(backupBannerOf(status({ state: 'overdue' }), 'Europe/Paris')).toEqual({
      title: 'Aucune sauvegarde réussie depuis le 26 octobre à 03:12',
      text: 'Elle doit réussir au moins toutes les 26 h : d’ici là, rien de récent n’est copié hors de la base.',
    });
  });

  it('says when none ever succeeded, and that the last try failed', () => {
    const banner = backupBannerOf(
      status({
        state: 'never',
        lastSucceededAt: null,
        lastRun: {
          status: 'failed',
          startedAt: '2026-10-27T02:00:00.000Z',
          finishedAt: '2026-10-27T02:01:00.000Z',
          sizeBytes: null,
          error: 'upload',
        },
      }),
    );
    expect(banner?.title).toBe('Aucune sauvegarde encore');
    expect(banner?.text).toMatch(/^La dernière tentative a échoué\. /u);
    // The service's step stays out of the banner: nothing of the server's internals on screen.
    expect(banner?.text).not.toContain('upload');
  });

  it('says when one is running', () => {
    const lastRun = {
      status: 'running',
      startedAt: '2026-10-27T02:00:00.000Z',
      finishedAt: null,
      sizeBytes: null,
      error: null,
    } as const;
    expect(backupBannerOf(status({ state: 'overdue', lastRun }))?.text).toMatch(
      /Une sauvegarde est en cours\.$/u,
    );
  });
});
