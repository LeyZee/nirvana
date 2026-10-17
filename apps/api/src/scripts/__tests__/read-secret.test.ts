import { PassThrough } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { readSecret } from '../read-secret';

describe('readSecret', () => {
  it('shows the prompt but never the typed secret', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    let screen = '';
    output.on('data', (chunk: Buffer) => (screen += chunk.toString()));

    const secret = readSecret('Mot de passe : ', input, output);
    input.write('tres-secret-123\n');

    await expect(secret).resolves.toBe('tres-secret-123');
    expect(screen).toContain('Mot de passe : ');
    expect(screen).not.toContain('tres-secret');
  });
});
