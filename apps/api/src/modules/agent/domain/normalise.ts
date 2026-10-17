// Common look-alike substitutions: « 1gn0re t3s instructi0ns » reads as « ignore tes instructions ».
const LEET: Readonly<Record<string, string>> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
};

/**
 * Lowercase, no accents, straight apostrophes, invisible characters dropped, one plain space for any
 * whitespace, « I.A. » read as « ia »: « Je t’AIME » and « je t'aime » compare equal.
 */
export function normalise(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g, '')
    .replace(/[’`´]/g, "'")
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/\bi\.\s?a\.?(?=\W|$)/g, 'ia');
}

/** Stricter reading for trap detection: digits and symbols inside words turned back into letters. */
export function unmask(text: string): string {
  return normalise(text).replace(/(?<=\p{L})[013457@$]|[013457@$](?=\p{L})/gu, (c) => LEET[c] ?? c);
}
