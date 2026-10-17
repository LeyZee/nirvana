import type { JSX } from 'react';

import { percent, rateTone, STEP_ACTIONS, usd, type Step } from './logic';
import type { PlaygroundState } from './model';

/**
 * One line: the number that matters (answers kept as written), what wrote them, and one proposed action.
 * The automatic mode opens at the target on the reference scenarios.
 */
export function RateBar({
  state,
  step,
  isDemo,
  onAction,
}: {
  state: PlaygroundState;
  step: Step;
  isDemo: boolean;
  onAction: () => void;
}): JSX.Element {
  const { rate, target, rated, trend } = state.rate;
  const tone = rateTone(rate, target);
  return (
    <div className="pg-bar nv-glass">
      <div
        className={`pg-rate pg-rate--${tone}`}
        title={`Réponses gardées telles quelles sur les ${String(rated)} dernières notées de cette version.`}
      >
        <span className="pg-rate__v">{percent(rate)}</span>
        <span className="pg-rate__t">
          <span className="pg-rate__n">Validées sans retouche</span>
          <span className="pg-meter">
            <i style={{ width: `${String((rate ?? 0) * 100)}%` }} />
            <b style={{ left: `${String(target * 100)}%` }} />
          </span>
          <span className="pg-rate__d">
            Objectif {percent(target)}
            {trend === undefined ? null : (
              <>
                {' · '}
                <b className={trend.points < 0 ? 'is-down' : undefined}>
                  {trend.points >= 0 ? '+' : ''}
                  {trend.points} pts
                </b>{' '}
                depuis {trend.since}
              </>
            )}
          </span>
        </span>
      </div>
      <span className="pg-bar__sep" />
      <span className="pg-bar__k">
        <span>Voix</span>
        <span className="pg-mono">
          {state.version.voicePrompt} · {state.version.voiceModel}
        </span>
      </span>
      <span className="pg-bar__k">
        <span>Session</span>
        {usd(state.sessionCostUsd)}
      </span>
      {isDemo ? (
        <span
          className="pg-demo"
          title="Les routes du playground ne sont pas encore en ligne : les réponses sont écrites à l’avance."
        >
          Démo
        </span>
      ) : null}
      <span className="pg-bar__sp" />
      <button
        type="button"
        className="nv-btn nv-btn--neon nv-btn--sm"
        disabled={step === 'busy'}
        onClick={onAction}
      >
        {STEP_ACTIONS[step]}
      </button>
    </div>
  );
}
