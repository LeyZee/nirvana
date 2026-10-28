import { useRef, useState, type JSX, type KeyboardEvent as ReactKeyboardEvent } from 'react';

import { readAppearance, setAppearance, type Appearance } from '@/shell/appearance';
import { Panel, PanelSection } from '@/shell/layout';

import './appearance.css';

const CHOICES: readonly { value: Appearance; label: string }[] = [
  { value: 'night', label: 'Nuit' },
  { value: 'day', label: 'Jour' },
  { value: 'device', label: 'Appareil' },
];

/** Arrow keys of the radio group and the way they move (as the Dashboard's mode control). */
const STEPS: Readonly<Record<string, 1 | -1>> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/** A miniature of the CRM drawn with the real tokens of a theme: a rail, two plates, the one neon. */
function Miniature({ theme }: { theme: 'dark' | 'light' }): JSX.Element {
  return (
    <span className="ap-mini" data-theme={theme}>
      <span className="ap-mini__rail" />
      <span className="ap-mini__plate">
        <span className="ap-mini__line" />
        <span className="ap-mini__neon" />
      </span>
      <span className="ap-mini__plate ap-mini__plate--low" />
    </span>
  );
}

/** Réglages › Apparence: Nuit, Jour, or as the device is set. Applies at once, kept by this browser. */
export function AppearancePage(): JSX.Element {
  const [appearance, setChoice] = useState(readAppearance);
  const group = useRef<HTMLDivElement>(null);
  const pick = (value: Appearance): void => {
    setAppearance(value);
    setChoice(value);
  };
  // A radio group: one stop in the Tab order (the checked choice), the arrows move and pick.
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const step = STEPS[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const at = CHOICES.findIndex((choice) => choice.value === appearance);
    const next = CHOICES[(at + step + CHOICES.length) % CHOICES.length];
    if (next === undefined) return;
    group.current?.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`)?.focus();
    pick(next.value);
  };
  return (
    <Panel title="Apparence" className="ap">
      <PanelSection>
        <div
          ref={group}
          className="ap-choices"
          role="radiogroup"
          aria-label="Apparence"
          onKeyDown={onKeyDown}
        >
          {CHOICES.map((choice) => (
            <button
              key={choice.value}
              type="button"
              role="radio"
              className="ap-choice"
              data-value={choice.value}
              aria-checked={choice.value === appearance}
              tabIndex={choice.value === appearance ? 0 : -1}
              onClick={() => {
                pick(choice.value);
              }}
            >
              <span className="ap-choice__frame">
                {choice.value === 'device' ? (
                  <span className="ap-split">
                    <Miniature theme="dark" />
                    <Miniature theme="light" />
                  </span>
                ) : (
                  <Miniature theme={choice.value === 'day' ? 'light' : 'dark'} />
                )}
              </span>
              <span className="ap-choice__label">{choice.label}</span>
            </button>
          ))}
        </div>
        <p className="ap-note">
          Appareil suit le réglage clair ou sombre de l’ordinateur ou du téléphone. Le choix vaut pour ce
          navigateur ; sans choix, c’est la nuit.
        </p>
      </PanelSection>
    </Panel>
  );
}
