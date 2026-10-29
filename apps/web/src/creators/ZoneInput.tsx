import { type JSX } from 'react';

/** Where a new creator lives unless the owner says otherwise. */
export const DEFAULT_ZONE = 'Europe/Paris';

/** What a zone the server does not know reads as, at her creation and when she moves. */
export const UNKNOWN_ZONE = 'Ce fuseau n’existe pas. Choisis-en un dans la liste, par exemple Europe/Paris.';

/** Every zone the browser knows, for the suggestions under the field; the server checks the one typed. */
const ZONES: readonly string[] = Intl.supportedValuesOf('timeZone');

/** A creator's zone: typed freely, with every zone the browser knows as suggestions. Used at creation and to move her. */
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
  return (
    <>
      <input
        id={id}
        className="nv-glass nv-field__control ps-input"
        value={value}
        list={`${id}-zones`}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={invalid}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      <datalist id={`${id}-zones`}>
        {ZONES.map((z) => (
          <option key={z} value={z} />
        ))}
      </datalist>
    </>
  );
}
