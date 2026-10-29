/**
 * A word for the next screen: the route guard sends an address outside the account's rail to its first tab, and the
 * shell says why once (NAV-21), instead of a silent jump that reads as a broken link.
 */
let pending: string | null = null;

export function leaveNotice(text: string): void {
  pending = text;
}

/** The word left for this screen, once: read, it is gone. */
export function takeNotice(): string | null {
  const text = pending;
  pending = null;
  return text;
}
