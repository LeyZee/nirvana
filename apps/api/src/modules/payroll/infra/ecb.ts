import { CalendarDaySchema } from '@nirvana/contracts';
import { z } from 'zod';

import type { EcbRate, RateSource } from '../domain/ports';

/**
 * The ECB adapter (ADR 0033): its last 90 days of reference rates, one public file, no key, nothing sent but the
 * request. Every value is checked before pay sees it; a file out of format is refused whole, never half read.
 */

/** The part of `fetch` the adapter uses, so that a test gives a fake ECB. */
export type GetLike = (
  url: string,
  init: { readonly signal: AbortSignal; readonly headers: Record<string, string> },
) => Promise<Response>;

export interface EcbSourceOptions {
  readonly fetch: GetLike;
  /** The ECB's file unless a test points elsewhere. */
  readonly url?: string;
  readonly timeoutMs?: number;
  readonly maxBytes?: number;
}

const ECB_HISTORY_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml';
const TIMEOUT_MS = 10_000;
// The file is about 30 kB; a megabyte is room for every currency and a change of layout, not for anything else.
const MAX_BYTES = 1_000_000;

const EcbRateSchema = z.strictObject({
  day: CalendarDaySchema,
  currency: z.string().regex(/^[A-Z]{3}$/),
  perEuro: z.string().regex(/^\d{1,6}(\.\d{1,8})?$/),
});

const DAY_OPENING = /<Cube\s+time\s*=\s*/;
const DAY_VALUE = /^(['"])([^'"]*)\1\s*>/;
const RATE_ELEMENT = /<Cube\s+([^>]*?)\/>/g;
const ATTRIBUTE = /([A-Za-z]+)\s*=\s*(['"])(.*?)\2/g;

/**
 * The rates of the ECB's file: each `<Cube time='…'>` and the `<Cube currency='…' rate='…'/>` inside it, quotes
 * single or double, attributes in any order. Throws on a day or a rate out of format, and on a file without any.
 */
export function readEcbHistory(xml: string): EcbRate[] {
  const rates: EcbRate[] = [];
  for (const chunk of xml.split(DAY_OPENING).slice(1)) {
    const opening = DAY_VALUE.exec(chunk);
    if (opening === null) throw new Error('ECB file: a day without its date');
    const day = opening[2];
    for (const element of chunk.matchAll(RATE_ELEMENT)) {
      const attributes = new Map(
        [...(element[1] ?? '').matchAll(ATTRIBUTE)].map((match) => [match[1], match[3]] as const),
      );
      rates.push(
        EcbRateSchema.parse({ day, currency: attributes.get('currency'), perEuro: attributes.get('rate') }),
      );
    }
  }
  if (rates.length === 0) throw new Error('ECB file: no rate in it');
  return rates;
}

/** The body as text, refused past `maxBytes` (declared or read): the ECB's file is small, anything else is not it. */
async function textUpTo(response: Response, maxBytes: number): Promise<string> {
  if (Number(response.headers.get('content-length') ?? 0) > maxBytes) throw new Error('ECB answer too large');
  if (response.body === null) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const read = await reader.read();
    if (read.done) break;
    const chunk: unknown = read.value;
    if (!(chunk instanceof Uint8Array)) throw new Error('ECB answer: not bytes');
    size += chunk.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error('ECB answer too large');
    }
    chunks.push(chunk);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export function createEcbSource(options: EcbSourceOptions): RateSource {
  const url = options.url ?? ECB_HISTORY_URL;
  return {
    async history() {
      const response = await options.fetch(url, {
        signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS),
        headers: { accept: 'application/xml' },
      });
      if (response.status !== 200) {
        await response.body?.cancel();
        throw new Error(`ECB answered ${String(response.status)}`);
      }
      return readEcbHistory(await textUpTo(response, options.maxBytes ?? MAX_BYTES));
    },
  };
}
