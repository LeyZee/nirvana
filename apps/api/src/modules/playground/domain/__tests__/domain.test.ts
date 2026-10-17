import { describe, expect, it } from 'vitest';

import { guardLabel, trapLabel } from '../labels';
import { completeMedia } from '../media';

describe('playground domain', () => {
  it('writes guards and traps in French, falling back to the code', () => {
    expect(guardLabel('ai_disclosure')).toBe('Elle dit ou laisse entendre qu’elle est une IA');
    expect(guardLabel('new_guard')).toBe('new_guard');
    expect(trapLabel('off_topic_task', 'media')).toBe(
      'Il lui demande une tâche hors sujet (recette, code, devoir), dans son média',
    );
  });

  it('claims nothing beyond the trainer’s words, and keeps the flags', () => {
    const media = completeMedia({ kind: 'video', factualDescription: 'Une vidéo floue.', flags: ['weapon'] });
    expect(media).toMatchObject({
      kind: 'video',
      intensity: 'not_visible',
      anatomyVisible: [],
      confidenceLow: true,
      flags: ['weapon'],
    });
    expect(completeMedia({ kind: 'image', factualDescription: 'Un chat.' }).flags).toEqual([]);
  });
});
