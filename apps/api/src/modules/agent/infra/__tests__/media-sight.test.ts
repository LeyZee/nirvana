import { err, ok, type MediaDescription } from '@nirvana/contracts';
import { describe, expect, it } from 'vitest';

import type { MediaDescriber } from '../../../media';
import { createMediaSight } from '../media-sight';

const MEDIA = { creatorId: 'c', conversationId: 'v', platformMediaId: 'm-1', kind: 'image' } as const;
const DESCRIPTION: MediaDescription = {
  vocabularyVersion: '1.0.0',
  kind: 'image',
  factualDescription: 'Un chat roux sur un canapé.',
  durationS: null,
  segments: [],
  intensity: 'soft',
  anatomyVisible: [],
  castMode: 'solo',
  mood: [],
  setting: null,
  audio: null,
  textVisible: null,
  quality: 'good',
  confidenceLow: false,
  notVisible: false,
  flags: [],
};

function describer(result: Awaited<ReturnType<MediaDescriber['describe']>>) {
  const files: unknown[] = [];
  const value: MediaDescriber = {
    describe: (file) => {
      files.push(file);
      return Promise.resolve(result);
    },
  };
  return { value, files };
}

describe('createMediaSight', () => {
  it('fetches his file and describes it as a fan media', async () => {
    const data = new Uint8Array([1, 2, 3]);
    const { value, files } = describer(ok(DESCRIPTION));
    const sight = createMediaSight({
      fetchMedia: () => Promise.resolve({ mediaType: 'image/jpeg', data }),
      describer: value,
    });
    expect(await sight.see(MEDIA)).toEqual(ok(DESCRIPTION));
    expect(files).toEqual([{ origin: 'fan', mediaType: 'image/jpeg', data }]);
  });

  it('says why it saw nothing: not fetched, fetch failed, description failed or crashed', async () => {
    const { value } = describer(err({ code: 'sense_failed' }));
    const gone = createMediaSight({ fetchMedia: () => Promise.resolve(undefined), describer: value });
    const broken = createMediaSight({ fetchMedia: () => Promise.reject(new Error('503')), describer: value });
    const blind = createMediaSight({
      fetchMedia: () => Promise.resolve({ mediaType: 'image/png', data: new Uint8Array() }),
      describer: value,
    });
    expect(await gone.see(MEDIA)).toEqual(err('not_fetched'));
    expect(await broken.see(MEDIA)).toEqual(err('fetch_failed'));
    expect(await blind.see(MEDIA)).toEqual(err('sense_failed'));
    const crashing = createMediaSight({
      fetchMedia: () => Promise.resolve({ mediaType: 'image/png', data: new Uint8Array() }),
      describer: { describe: () => Promise.reject(new Error('store down')) },
    });
    expect(await crashing.see(MEDIA)).toEqual(err('describe_failed'));
  });
});
