import { useState, type JSX } from 'react';

import { inputOf, minuteOfInput } from './time';

/**
 * An hour on 24 hours, typed as text (« 09:00 », « 21h30 »): never `<input type="time">`, which Chromium writes in the
 * system's language (« 09:00 AM ») whatever the page's `lang` (recette 28/10). While it is typed, the field keeps what
 * is written; a full hour goes to the form at once, and leaving the field writes it back as `HH:MM`. Créatrices' hours
 * and Équipe's shifts use it alike.
 */
export function TimeField({
  value,
  label,
  className,
  onChange,
}: {
  /** Minutes from midnight. */
  value: number;
  label: string;
  className?: string;
  onChange: (minute: number) => void;
}): JSX.Element {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      spellCheck={false}
      maxLength={6}
      placeholder="HH:MM"
      className={`nv-field__control nv-glass nv-num${className === undefined ? '' : ` ${className}`}`}
      value={draft ?? inputOf(value)}
      aria-label={label}
      aria-invalid={draft !== null && minuteOfInput(draft) === null ? true : undefined}
      onChange={(event) => {
        setDraft(event.target.value);
        // Empty or half typed: the form keeps its last full hour.
        const minute = minuteOfInput(event.target.value);
        if (minute !== null) onChange(minute);
      }}
      onBlur={() => {
        setDraft(null);
      }}
    />
  );
}
