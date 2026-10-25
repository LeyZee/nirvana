import { useState, type JSX } from 'react';

import { readAppearance, setAppearance, type Appearance } from '@/shell/appearance';
import { Panel, PanelSection } from '@/shell/layout';

import './appearance.css';

const CHOICES: readonly { value: Appearance; label: string }[] = [
  { value: 'night', label: 'Nuit' },
  { value: 'day', label: 'Jour' },
  { value: 'device', label: 'Appareil' },
];

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
  return (
    <Panel title="Apparence" className="ap">
      <PanelSection>
        <div className="ap-choices" role="radiogroup" aria-label="Apparence">
          {CHOICES.map((choice) => (
            <button
              key={choice.value}
              type="button"
              role="radio"
              className="ap-choice"
              aria-checked={choice.value === appearance}
              onClick={() => {
                setAppearance(choice.value);
                setChoice(choice.value);
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
