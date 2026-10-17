import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { z } from 'zod';

import type { ExtractedFrame, MediaTools } from '../application/describe-media';

const run = promisify(execFile);

/** Enough for a vision model, far cheaper in tokens than a full-size image. */
const MAX_SIDE = 1_024;
const SCALE = `scale='min(${String(MAX_SIDE)},iw)':-2`;
const FFMPEG_BUFFER = 32 * 1024 * 1024;

const ProbeSchema = z.object({
  format: z.object({ duration: z.coerce.number() }),
  streams: z.array(z.object({ codec_type: z.string().optional() })).default([]),
});

async function inTempDir<T>(input: Uint8Array, use: (dir: string, path: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'nirvana-media-'));
  try {
    const path = join(dir, 'input');
    await writeFile(path, input);
    return await use(dir, path);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** ffmpeg and ffprobe come with the Docker image (operations.md); files never leave a private temp folder. */
export function createFfmpegMediaTools(binaries = { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' }): MediaTools {
  const ffmpeg = (args: readonly string[]) =>
    run(binaries.ffmpeg, ['-v', 'error', '-y', ...args], { maxBuffer: FFMPEG_BUFFER });

  return {
    probe: (video) =>
      inTempDir(video, async (_, path) => {
        const { stdout } = await run(binaries.ffprobe, [
          '-v',
          'error',
          '-show_entries',
          'format=duration:stream=codec_type',
          '-of',
          'json',
          path,
        ]);
        const info = ProbeSchema.parse(JSON.parse(stdout));
        if (!Number.isFinite(info.format.duration)) throw new Error('ffprobe gave no duration');
        return {
          durationS: info.format.duration,
          hasAudio: info.streams.some((s) => s.codec_type === 'audio'),
        };
      }),

    keyframes: (video) =>
      inTempDir(video, async (dir, path) => {
        // One frame a second, near-duplicates dropped (mpdecimate); showinfo prints each kept frame's time.
        const { stderr } = await run(
          binaries.ffmpeg,
          [
            '-hide_banner',
            '-y',
            '-i',
            path,
            '-vf',
            `fps=1,mpdecimate,${SCALE},showinfo`,
            '-fps_mode',
            'vfr',
            '-q:v',
            '4',
            join(dir, 'frame-%04d.jpg'),
          ],
          { maxBuffer: FFMPEG_BUFFER },
        );
        const times = [...stderr.matchAll(/pts_time:([\d.]+)/g)].map((m) => Number.parseFloat(m[1] ?? '0'));
        const files = (await readdir(dir)).filter((f) => f.startsWith('frame-')).sort();
        const frames: ExtractedFrame[] = [];
        for (const [index, file] of files.entries()) {
          frames.push({
            atS: Math.round(times[index] ?? index),
            mediaType: 'image/jpeg',
            data: new Uint8Array(await readFile(join(dir, file))),
          });
        }
        return frames;
      }),

    audioTrack: (video) =>
      inTempDir(video, async (dir, path) => {
        const out = join(dir, 'audio.mp3');
        await ffmpeg(['-i', path, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '48k', out]);
        return new Uint8Array(await readFile(out));
      }),

    toJpeg: (image) =>
      inTempDir(image, async (dir, path) => {
        const out = join(dir, 'image.jpg');
        await ffmpeg(['-i', path, '-vf', SCALE, '-frames:v', '1', '-q:v', '3', out]);
        return new Uint8Array(await readFile(out));
      }),
  };
}
