import type { JSX, ReactNode } from 'react';

import { needsAttention, usd } from './logic';
import type { Answer, PlaygroundState } from './model';

type Level = 'none' | 'ok' | 'warn' | 'bad';

function levelOf(answer: Answer | undefined): Level {
  if (answer === undefined) return 'none';
  if (answer.isBlocked || (answer.handoff?.length ?? 0) > 0) return 'bad';
  return needsAttention(answer) ? 'warn' : 'ok';
}

const TITLES: Readonly<Record<Level, string>> = {
  none: 'Pourquoi',
  ok: 'Toutes les règles passent',
  warn: 'À regarder',
  bad: 'Bloquée ou relayée',
};

/**
 * Why the agent answered that. Folded by default: it opens by itself only when something was blocked or flagged,
 * and the trainer can open or fold it at any time. No JSON, no tokens: the technical details stay folded.
 */
export function WhyPanel({
  state,
  open,
  onToggle,
}: {
  state: PlaygroundState;
  open: boolean;
  onToggle: () => void;
}): JSX.Element {
  const answer = state.pending;
  const level = levelOf(answer);

  if (!open) {
    return (
      <aside className="pg-why nv-glass" data-open="false">
        <button
          type="button"
          className="pg-why__rail"
          aria-expanded="false"
          title="Pourquoi l’agent a répondu ça"
          onClick={onToggle}
        >
          <span>Pourquoi</span>
          <i className={`pg-why__dot is-${level}`} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="pg-why nv-glass" data-open="true" aria-label="Pourquoi">
      <div className="pg-why__h">
        <span className={`pg-why__dot is-${level}`} />
        <span className="pg-why__t">
          <b>{TITLES[level]}</b>
          <span>Pourquoi l’agent a répondu ça</span>
        </span>
        <button type="button" className="pg-why__x" aria-expanded="true" title="Replier" onClick={onToggle}>
          ×
        </button>
      </div>
      {answer === undefined ? (
        <p className="pg-why__empty">Le raisonnement de la prochaine réponse s’affichera ici.</p>
      ) : (
        <div className="nv-scroll">
          <Sec label="Ce qu’elle a compris">{answer.brief?.understood}</Sec>
          <Sec label="Décision">{answer.brief?.decision}</Sec>
          {(answer.brief?.risks.length ?? 0) > 0 || (answer.handoff?.length ?? 0) > 0 ? (
            <Sec label="Risques">
              <ul className="pg-list">
                {[...new Set([...(answer.handoff ?? []), ...(answer.brief?.risks ?? [])])].map((r) => (
                  <li key={r} className="is-warn">
                    {r}
                  </li>
                ))}
              </ul>
            </Sec>
          ) : null}
          {(answer.trap?.length ?? 0) > 0 ? (
            <Sec label="Piège">
              <ul className="pg-list">
                {answer.trap?.map((t) => (
                  <li key={t.code} className="is-warn">
                    {t.label}
                  </li>
                ))}
              </ul>
            </Sec>
          ) : null}
          {(answer.vision?.length ?? 0) > 0 ? (
            <Sec label="Ce que la Vision a vu">
              {answer.vision?.map((v) => (
                <p key={v}>{v}</p>
              ))}
            </Sec>
          ) : null}
          {(answer.brief?.kycMissing.length ?? 0) > 0 ? (
            <Sec label="Encore à découvrir">{answer.brief?.kycMissing.join(', ')}</Sec>
          ) : null}
          <Sec label="Relecture avant envoi">
            <ul className="pg-list">
              {answer.violations.length === 0 ? (
                <li className="is-ok">Mots interdits, longueur, langue, rien qui ressemble à une IA</li>
              ) : (
                answer.violations.map((v) => (
                  <li key={v.code} className={v.blocking ? 'is-bad' : 'is-warn'}>
                    {v.label}
                  </li>
                ))
              )}
            </ul>
          </Sec>
          <div className="pg-why__sec">
            <details className="pg-tech">
              <summary>Détails techniques</summary>
              <dl>
                <dt>Modèle</dt>
                <dd className="pg-mono">
                  {answer.model ?? '—'}
                  {answer.isFallback ? ' (repli)' : ''}
                </dd>
                <dt>Voix</dt>
                <dd className="pg-mono">{state.version.voicePrompt}</dd>
                <dt>Latence</dt>
                <dd>{(answer.latencyMs / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s</dd>
                <dt>Coût</dt>
                <dd>{usd(answer.costUsd)}</dd>
              </dl>
              {answer.failure === undefined ? null : <p className="pg-why__fail">{answer.failure}</p>}
            </details>
          </div>
        </div>
      )}
    </aside>
  );
}

function Sec({ label, children }: { label: string; children: ReactNode }): JSX.Element | null {
  if (children === undefined || children === null || children === '') return null;
  return (
    <div className="pg-why__sec">
      <p className="nv-eyebrow">{label}</p>
      <div className="pg-why__b">{children}</div>
    </div>
  );
}
