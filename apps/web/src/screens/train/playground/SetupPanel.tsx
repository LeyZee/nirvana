import { useEffect, useState, type JSX } from 'react';

import { clockAt, duration, money } from './logic';
import type { Media, MediaKind, PlaygroundState } from './model';
import type { Playground } from './usePlayground';

export const MEDIA_KINDS: readonly { kind: MediaKind; label: string }[] = [
  { kind: 'image', label: 'Photo' },
  { kind: 'video', label: 'Vidéo' },
  { kind: 'audio', label: 'Vocal' },
];

/** Who the fan is, what we know of him, what time it is for her, and what she can send. */
export function SetupPanel({ state, pg }: { state: PlaygroundState; pg: Playground }): JSX.Element {
  const { situation } = state;
  const preset = state.presets.find((p) => p.id === state.presetId);
  const age = new Date(situation.now).getTime() - new Date(situation.relationshipStartedAt).getTime();
  const wait = situation.sexualizationInHours ?? 0;

  return (
    <aside className="pg-setup nv-glass" aria-label="Mise en situation">
      <div className="nv-scroll">
        <section className="pg-sec">
          <p className="nv-eyebrow">Le fan</p>
          <div className="pg-presets" role="radiogroup" aria-label="Fan type">
            {state.presets.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={p.id === state.presetId}
                className="pg-preset"
                title={`Teste ${p.tests}`}
                disabled={pg.busy}
                onClick={() => void pg.run((c) => c.choosePreset(p.id))}
              >
                <span className="pg-preset__n">{p.label}</span>
                {p.id === state.presetId ? <span className="pg-preset__s">Teste {p.tests}</span> : null}
              </button>
            ))}
          </div>
        </section>

        <section className="pg-sec">
          <p className="nv-eyebrow">Ce qu’on sait de lui</p>
          <Notes
            key={state.presetId}
            notes={state.fanNotes}
            onSave={(notes) => void pg.run((c) => c.setNotes(notes))}
          />
          <Spent
            key={`${state.presetId ?? ''}-spent`}
            cents={situation.spentCents}
            onSave={(cents) => void pg.run((c) => c.setSpent(cents))}
          />
        </section>

        <section className="pg-sec">
          <p className="nv-eyebrow">Le temps</p>
          <div className="pg-clock">
            <span className="pg-clock__c">
              <span>Chez elle</span>
              <b>
                {clockAt(situation.now, situation.timeZone)}
                <span className="pg-moon">{situation.isNight ? '🌙 Nuit' : '☀️ Jour'}</span>
              </b>
            </span>
            <span className="pg-clock__c">
              <span>Relation</span>
              <b>{duration(age)}</b>
            </span>
          </div>
          <p className="pg-hint">
            {wait > 0 ? (
              <>
                Elle ne sexualise pas d’elle-même avant <b>{duration(wait * 3_600_000)}</b>.
              </>
            ) : (
              'Elle peut sexualiser d’elle-même.'
            )}{' '}
            Scripts <b>{situation.isNight ? 'Nuit' : 'Jour'}</b> seulement.
          </p>
          <div className="pg-row2">
            <button
              type="button"
              className="nv-btn nv-btn--soft nv-btn--sm"
              disabled={pg.busy}
              onClick={() => void pg.run((c) => c.advance(1))}
            >
              +1 h
            </button>
            <button
              type="button"
              className="nv-btn nv-btn--soft nv-btn--sm"
              disabled={pg.busy}
              onClick={() => void pg.run((c) => c.advance(24))}
            >
              +1 jour
            </button>
          </div>
        </section>

        <section className="pg-sec">
          <p className="nv-eyebrow">Elle envoie un média</p>
          <CreatorMedia
            disabled={pg.busy}
            onSend={(media) => void pg.run((c) => c.sendCreatorMedia(media))}
          />
        </section>

        {preset === undefined ? null : (
          <p className="pg-hint pg-sec">Idée de premier message : « {preset.opening} »</p>
        )}
      </div>
    </aside>
  );
}

/** One fact per line, saved when the field loses focus (canevas: Prénom, Localisation, Âge, Métier…). */
function Notes({
  notes,
  onSave,
}: {
  notes: readonly string[];
  onSave: (notes: string[]) => void;
}): JSX.Element {
  const [text, setText] = useState(notes.join('\n'));
  useEffect(() => {
    setText(notes.join('\n'));
  }, [notes]);
  return (
    <label className="pg-field">
      <span className="sr-only">Notes du fan, une par ligne</span>
      <textarea
        className="pg-notes"
        rows={Math.max(3, notes.length + 1)}
        value={text}
        placeholder={'Prénom : …\nMétier : …\nLocalisation : …'}
        onChange={(event) => {
          setText(event.target.value);
        }}
        onBlur={() => {
          const next = text
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line !== '');
          if (next.join('\n') !== notes.join('\n')) onSave(next);
        }}
      />
    </label>
  );
}

function Spent({ cents, onSave }: { cents: number; onSave: (cents: number) => void }): JSX.Element {
  const [value, setValue] = useState(String(cents / 100));
  return (
    <label className="pg-spent">
      <span>Déjà dépensé</span>
      <span className="pg-spent__in">
        <input
          inputMode="decimal"
          value={value}
          aria-label="Montant déjà dépensé, en dollars"
          onChange={(event) => {
            setValue(event.target.value);
          }}
          onBlur={() => {
            const next = Math.round(Number(value.replace(',', '.')) * 100);
            if (Number.isFinite(next) && next >= 0 && next !== cents) onSave(next);
            else setValue(String(cents / 100));
          }}
        />
        $
      </span>
      <span className="pg-spent__v">{cents === 0 ? 'jamais acheté' : money(cents)}</span>
    </label>
  );
}

function CreatorMedia({
  disabled,
  onSend,
}: {
  disabled: boolean;
  onSend: (media: Media) => void;
}): JSX.Element {
  const [kind, setKind] = useState<MediaKind>('image');
  const [text, setText] = useState('');
  const [isLocked, setLocked] = useState(true);
  return (
    <form
      className="pg-cmedia"
      onSubmit={(event) => {
        event.preventDefault();
        if (text.trim() === '') return;
        onSend({ kind, factualDescription: text.trim(), isLocked });
        setText('');
      }}
    >
      <div className="pg-kinds" role="radiogroup" aria-label="Type de média">
        {MEDIA_KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            role="radio"
            aria-checked={k.kind === kind}
            className="pg-chip"
            onClick={() => {
              setKind(k.kind);
            }}
          >
            {k.label}
          </button>
        ))}
      </div>
      <input
        className="pg-input"
        value={text}
        placeholder="Ce qu’on y voit : tenue, lieu, action"
        aria-label="Ce qu’on voit dans son média"
        onChange={(event) => {
          setText(event.target.value);
        }}
      />
      <label className="pg-switch">
        <input
          type="checkbox"
          className="nv-switch"
          checked={isLocked}
          onChange={(event) => {
            setLocked(event.target.checked);
          }}
        />
        Payant, flouté
      </label>
      <button
        type="submit"
        className="nv-btn nv-btn--soft nv-btn--sm"
        disabled={disabled || text.trim() === ''}
      >
        Faire envoyer par elle
      </button>
    </form>
  );
}
