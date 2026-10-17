import { Writable } from 'node:stream';

import { z } from 'zod';

const LogLineSchema = z.looseObject({ msg: z.string() });
export type LogLine = z.infer<typeof LogLineSchema>;

/** Collects the JSON lines a pino logger writes, so a test can wait for and inspect them. */
export class LogSink extends Writable {
  readonly lines: LogLine[] = [];

  override _write(chunk: Buffer, _encoding: BufferEncoding, done: () => void): void {
    this.collect(chunk.toString());
    done();
  }

  collect(text: string): void {
    for (const raw of text.split('\n')) {
      if (raw.trim() === '') continue;
      const parsed = LogLineSchema.safeParse(JSON.parse(raw));
      if (parsed.success) this.lines.push(parsed.data);
    }
  }

  withMessage(msg: string): LogLine[] {
    return this.lines.filter((line) => line.msg === msg);
  }

  /** Resolves once `count` lines carry `msg`; rejects after `timeoutMs`. */
  async waitFor(msg: string, count = 1, timeoutMs = 15_000): Promise<LogLine[]> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = this.withMessage(msg);
      if (found.length >= count) return found;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(
      `Timed out waiting for ${String(count)} × "${msg}" (got ${String(this.withMessage(msg).length)})`,
    );
  }
}
