/**
 * One read-only GET for a verifier. No retry: verification is driven by Charles pasting a key or by the 15-minute
 * job, and an unreachable provider is reported as such (`unreachable`) without touching the saved key.
 */
const VERIFY_TIMEOUT_MS = 10_000;

export type FetchLike = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<{
  readonly status: number;
  text(): Promise<string>;
}>;

export type HttpReply =
  | { readonly kind: 'reply'; readonly status: number; readonly body: unknown }
  | { readonly kind: 'unreachable' };

export async function getJson(
  fetchImpl: FetchLike,
  url: string,
  headers: Record<string, string>,
  timeoutMs = VERIFY_TIMEOUT_MS,
): Promise<HttpReply> {
  try {
    const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    const text = await response.text();
    return { kind: 'reply', status: response.status, body: parseBody(text) };
  } catch {
    return { kind: 'unreachable' };
  }
}

function parseBody(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Server-side trouble or a body we cannot read says nothing about the key. */
export function isProviderTrouble(status: number): boolean {
  return status >= 500 || status === 408;
}
