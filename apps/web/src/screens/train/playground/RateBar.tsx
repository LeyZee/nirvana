import type { PlaygroundState } from '@nirvana/contracts';
import { countUp } from '@nirvana/design-system';
import { useEffect, useRef, type JSX } from 'react';

import { percent, rateTone, usd } from './logic';

/**
 * The one number of the screen, and nothing that competes with it: what wrote the answers and what the
 * session cost sit in retreat on the right. The action lives under the answer, not here.
 * This is the playground rate (ADR 0019): it calibrates a voice version and never opens the automatic mode.
 */
export function RateBar({ state, isDemo }: { state: PlaygroundState; isDemo: boolean }): JSX.Element {
  const { rate, target, rated, trendPoints, previousVersion } = state.rate;
  const tone = rateTone(rate, target);
  const valueRef = useRef<HTMLSpanElement>(null);
  const shown = useRef(0);

  // The rate counts up to its new value from the one on screen, never from zero.
  useEffect(() => {
    const element = valueRef.current;
    if (element === null) return;
    if (rate === null) {
      element.textContent = percent(null);
      return;
    }
    const from = shown.current;
    shown.current = rate;
    return countUp(element, rate, (value) => percent(value), { from, durationMs: 900 });
  }, [rate]);

  return (
    <div className="pg-bar nv-glass">
      <div
        className={`pg-rate pg-rate--${tone}`}
        title={`Réponses gardées telles quelles sur les ${String(rated)} dernières notées de cette version.`}
      >
        {/* Written by the effect only: React never owns this text, so the count is never overwritten. */}
        <span className="pg-rate__v" ref={valueRef} />
        <span className="pg-rate__t">
          <span className="pg-rate__n">Validées sans retouche</span>
          <span
            className="pg-meter"
            role="img"
            aria-label={`${percent(rate)} sur un objectif de ${percent(target)}`}
          >
            <i style={{ width: `${String((rate ?? 0) * 100)}%` }} />
            <b style={{ left: `${String(target * 100)}%` }} />
          </span>
          <span className="pg-rate__d">
            Objectif {percent(target)}
            {trendPoints === null || previousVersion === null ? null : (
              <>
                {' · '}
                <b className={trendPoints < 0 ? 'is-down' : undefined}>
                  {trendPoints >= 0 ? '+' : ''}
                  {Math.round(trendPoints)} pts
                </b>{' '}
                depuis la voix {previousVersion.voicePrompt}
              </>
            )}
          </span>
        </span>
      </div>
      <span className="pg-bar__sp" />
      {isDemo ? (
        <span
          className="pg-demo"
          title="Les routes du playground ne sont pas encore en ligne : les réponses sont écrites à l’avance."
        >
          Démo
        </span>
      ) : null}
      <span className="pg-bar__meta" title="La voix qui écrit, et ce que cette session a coûté">
        <span className="pg-mono">
          Voix {state.version.voicePrompt} · {state.version.voiceModel}
        </span>
        <span>{usd(state.sessionCostUsd)} cette session</span>
      </span>
    </div>
  );
}
