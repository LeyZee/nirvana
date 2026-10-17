export type UntrustedKind = 'fan_message' | 'fan_media_description' | 'fan_notes';

/**
 * Wraps content written by a fan (or derived from it) in a typed block that every system prompt
 * declares as data, never instructions (CLAUDE.md rule 4). Angle brackets inside the content are
 * replaced so the content cannot close the block or open a fake one.
 */
export function wrapUntrusted(kind: UntrustedKind, content: string): string {
  const neutralised = content.replaceAll('<', '‹').replaceAll('>', '›');
  return `<${kind}>\n${neutralised}\n</${kind}>`;
}
