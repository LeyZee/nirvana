import { err, ok } from '@nirvana/contracts';

import type { MediaDescriber } from '../../media';

import type { MediaSight, MediaToSee } from './draft-composer';

/** The file of one of his media, as the platform serves it; undefined when it cannot be had (gone, refused). */
export type FetchMedia = (
  media: MediaToSee,
) => Promise<{ readonly mediaType: string; readonly data: Uint8Array } | undefined>;

/** Fetches his media from the platform, then has the `media` module describe it (cached by content). */
export function createMediaSight(deps: {
  readonly fetchMedia: FetchMedia;
  readonly describer: MediaDescriber;
}): MediaSight {
  return {
    async see(media) {
      let file: Awaited<ReturnType<FetchMedia>>;
      try {
        file = await deps.fetchMedia(media);
      } catch {
        return err('fetch_failed');
      }
      if (file === undefined) return err('not_fetched');
      const described = await deps.describer.describe({ origin: 'fan', ...file });
      return described.ok ? ok(described.value) : err(described.error.code);
    },
  };
}
