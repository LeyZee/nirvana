import type { CreatorSummary } from '@nirvana/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useId, useState, type SyntheticEvent, type JSX } from 'react';

import { createCreator } from './api';
import { Field } from './persona/fields';

const DEFAULT_ZONE = 'Europe/Paris';

/** Every zone the browser knows, for the suggestions under the field; the server checks the one typed. */
const ZONES: readonly string[] = Intl.supportedValuesOf('timeZone');

/**
 * Adds a creator (owner only): her name as fans see it and the zone her day and night follow. Her persona is
 * written next, starting from the example.
 */
export function NewCreatorForm({
  onCreated,
  onCancel,
}: {
  onCreated: (creator: CreatorSummary) => void;
  /** Null when there is nothing to go back to (no creator yet). */
  onCancel: (() => void) | null;
}): JSX.Element {
  const id = useId();
  const client = useQueryClient();
  const [name, setName] = useState('');
  const [zone, setZone] = useState(DEFAULT_ZONE);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const submit = async (event: SyntheticEvent): Promise<void> => {
    event.preventDefault();
    if (name.trim() === '' || busy) return;
    setBusy(true);
    setProblem(null);
    const result = await createCreator(name.trim(), zone.trim()).catch(() => ({ kind: 'failed' as const }));
    setBusy(false);
    if (result.kind === 'created') {
      await client.invalidateQueries({ queryKey: ['creators'] });
      onCreated(result.creator);
    } else {
      setProblem(
        result.kind === 'invalid'
          ? 'Ce fuseau n’existe pas. Choisis-en un dans la liste, par exemple Europe/Paris.'
          : 'Rien n’a été créé : Nirvana ne répond pas. Réessaie dans un instant.',
      );
    }
  };

  return (
    <form
      className="nv-plate ps-head"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <p className="ps-title">Nouvelle créatrice</p>
      <Field label="Prénom ou pseudo" id={`${id}-name`} hint="Celui que voient ses fans.">
        <input
          id={`${id}-name`}
          className="nv-glass nv-field__control ps-input"
          value={name}
          maxLength={80}
          autoFocus
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
      </Field>
      <Field label="Fuseau horaire" id={`${id}-zone`} hint="Sa journée et sa nuit suivent ce fuseau.">
        <input
          id={`${id}-zone`}
          className="nv-glass nv-field__control ps-input"
          value={zone}
          list={`${id}-zones`}
          onChange={(event) => {
            setZone(event.target.value);
          }}
        />
        <datalist id={`${id}-zones`}>
          {ZONES.map((z) => (
            <option key={z} value={z} />
          ))}
        </datalist>
      </Field>
      {problem === null ? null : (
        <p className="ps-error" role="alert">
          {problem}
        </p>
      )}
      <div className="ps-head__actions">
        {onCancel === null ? null : (
          <button type="button" className="nv-btn nv-btn--plain nv-btn--sm" onClick={onCancel}>
            Annuler
          </button>
        )}
        <button
          type="submit"
          className="nv-btn nv-btn--neon"
          disabled={name.trim() === '' || busy}
          aria-busy={busy}
        >
          {busy ? 'Création…' : 'Créer'}
        </button>
      </div>
    </form>
  );
}
