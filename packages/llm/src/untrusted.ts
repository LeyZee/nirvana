/**
 * `brief` is the brain's output: the fan can steer it, so the voice reads it as data too.
 * Media descriptions carry text read in the media (a photo can hold a written instruction).
 */
export type UntrustedKind =
  | 'fan_message'
  | 'fan_media_description'
  | 'creator_media_description'
  | 'media_transcript'
  | 'fan_notes'
  | 'brief';

// Invisible and bidirectional control characters: used to hide or reorder text the model would still read.
const CONTROL_CHARACTERS = /[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;

/**
 * Wraps content written by a fan (or derived from it) in a typed block that every system prompt
 * declares as data, never instructions (CLAUDE.md rule 4). Angle brackets inside the content are
 * replaced so the content cannot close the block or open a fake one, and invisible characters are dropped.
 */
export function wrapUntrusted(kind: UntrustedKind, content: string): string {
  const neutralised = content.replace(CONTROL_CHARACTERS, '').replaceAll('<', '‹').replaceAll('>', '›');
  return `<${kind}>\n${neutralised}\n</${kind}>`;
}
