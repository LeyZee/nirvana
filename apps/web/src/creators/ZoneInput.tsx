import { type JSX } from 'react';

/** Where a new creator lives unless the owner says otherwise. */
export const DEFAULT_ZONE = 'Europe/Paris';

/** What a zone the server does not know reads as, at her creation and when she moves. */
export const UNKNOWN_ZONE = 'Ce fuseau n’existe pas. Choisis une ville dans la liste.';

/** The cities the agency works with, first and in French; the zone behind each is what the server keeps. */
const FIRST: readonly { readonly zone: string; readonly city: string }[] = [
  { zone: 'Europe/Paris', city: 'Paris' },
  { zone: 'Europe/Brussels', city: 'Bruxelles' },
  { zone: 'Europe/Zurich', city: 'Genève' },
  { zone: 'America/Toronto', city: 'Montréal' },
  { zone: 'Africa/Porto-Novo', city: 'Porto-Novo' },
  { zone: 'Africa/Abidjan', city: 'Abidjan' },
  { zone: 'Africa/Dakar', city: 'Dakar' },
  { zone: 'Africa/Lome', city: 'Lomé' },
  { zone: 'Indian/Antananarivo', city: 'Antananarivo' },
];
const FIRST_ZONES: ReadonlySet<string> = new Set(FIRST.map((one) => one.zone));

/** « Tokyo · Asia »: a city read as one, its region beside it, for every other zone the browser knows. */
const OTHERS: readonly { readonly zone: string; readonly city: string }[] = Intl.supportedValuesOf('timeZone')
  .filter((zone) => !FIRST_ZONES.has(zone))
  .map((zone) => {
    const parts = zone.split('/');
    const city = (parts.at(-1) ?? zone).replaceAll('_', ' ');
    return { zone, city: parts.length > 1 ? `${city} · ${parts[0] ?? ''}` : city };
  })
  .toSorted((a, b) => a.city.localeCompare(b.city, 'fr'));

/**
 * A creator's zone, chosen by city (« Paris », « Montréal ») with the zone kept behind it (CREA-27): never an
 * identifier to type. A zone she already has outside the list stays offered as it is. Used at creation and to move her.
 */
export function ZoneInput({
  id,
  value,
  onChange,
  invalid = false,
}: {
  id: string;
  value: string;
  onChange: (zone: string) => void;
  invalid?: boolean;
}): JSX.Element {
  const known = value === '' || FIRST_ZONES.has(value) || OTHERS.some((one) => one.zone === value);
  return (
    <select
      id={id}
      className="nv-glass nv-field__control ps-input ps-select"
      value={value}
      aria-invalid={invalid}
      onChange={(event) => {
        onChange(event.target.value);
      }}
    >
      {known ? null : <option value={value}>{value}</option>}
      <optgroup label="Les plus courantes">
        {FIRST.map((one) => (
          <option key={one.zone} value={one.zone}>
            {one.city}
          </option>
        ))}
      </optgroup>
      <optgroup label="Toutes les villes">
        {OTHERS.map((one) => (
          <option key={one.zone} value={one.zone}>
            {one.city}
          </option>
        ))}
      </optgroup>
    </select>
  );
}
