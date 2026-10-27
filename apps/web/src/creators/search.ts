/** The tab of Créatrices in the address (`?onglet=heures`), so that a link or a reload lands on it (lesson of #217). */
export interface CreatorsSearch {
  readonly onglet?: 'heures';
}

/** Anything but a known tab reads as the persona. */
export function parseCreatorsSearch(search: Record<string, unknown>): CreatorsSearch {
  return search['onglet'] === 'heures' ? { onglet: 'heures' } : {};
}
