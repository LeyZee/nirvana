import { alertKeywordKey, normalise, unmask } from '@nirvana/contracts';

/**
 * Her alert keywords (`notifications.alert_keywords`, P4-01): read in code, never by a model, on what he wrote since
 * her last answer. A keyword matches as a whole word or phrase once both sides are normalised (« Rendez-vous »
 * matches « rendez vous », « RDV » does not match « rdvs »), and also once the digits inside his words are read as
 * letters (« r0bot »). Gives the keywords that matched, as she wrote them, in her order.
 */
export function alertKeywordsIn(text: string, keywords: readonly string[]): string[] {
  const readings = [normalise(text), unmask(text)].map(spaced);
  return keywords.filter((keyword) => {
    const term = alertKeywordKey(keyword);
    return term !== '' && readings.some((reading) => reading.includes(` ${term} `));
  });
}

/** Words split on anything that is not a letter or a digit, with a space at each end: whole words compare. */
const spaced = (text: string): string => ` ${text.replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;
