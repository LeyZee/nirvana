import { Link } from '@tanstack/react-router';
import type { JSX } from 'react';

import { heroState, gaugeClass, litParts } from './logic';
import type { AgentState, Todo } from './model';
import { CheckIcon, Chevron, TONE_COLOR } from './parts';

import { MODE_LABEL, type AgentMode } from '@/agent/mode';

/**
 * Level 1: what state the agent is in and what waits for a human, before any money. The most serious todo
 * first; the agent's health folded under one summary line.
 */
export function AgentHero({
  agent,
  mode,
  todos: waiting,
  onOpen,
  onDone,
  onResume,
  forCreator = false,
  opensSettings = false,
}: {
  agent: AgentState;
  mode: AgentMode;
  todos: readonly Todo[];
  onOpen: (todo: Todo) => void;
  /** Marks a todo as handled; absent when the list is the server's (it leaves the list when handled). */
  onDone: ((id: string) => void) | undefined;
  /** The action of a stopped agent: back to Copilote; absent while the screen cannot switch the mode. */
  onResume: (() => void) | undefined;
  /** A creator's Dashboard: the agent's state, never the list of conversations waiting for a human (ADR 0023). */
  forCreator?: boolean;
  /** The account holds Réglages, the owner alone: an action that leads there is offered to no one else. */
  opensSettings?: boolean;
}): JSX.Element {
  const stopped = mode === 'stop';
  // A stopped agent keeps the grave lines only (minor, consent, distress: choix de Charles, 28/10); the server sends
  // no other, and the filter holds while the mode has just changed and the list is not read again yet.
  const todos = forCreator ? [] : stopped ? waiting.filter((todo) => todo.tone === 'bad') : waiting;
  const state = heroState(agent, todos, mode, forCreator);
  const hero =
    state.actionTo === undefined || opensSettings
      ? state
      : { ...state, action: undefined, actionTo: undefined, lead: state.leadWithoutAction ?? state.lead };
  const first = todos[0];
  return (
    <section
      className="db-hero nv-enter"
      data-tone={hero.tone}
      style={{ '--_c': TONE_COLOR[hero.tone], '--nv-i': 1 }}
      aria-live="polite"
    >
      <span className="db-hero__glow" aria-hidden="true" />
      <div className="db-hero__top">
        <span className={`nv-orb nv-tone--${hero.tone}`} aria-hidden="true" />
        <div className="nv-swap" key={hero.headline}>
          <p className="nv-eyebrow">
            {MODE_LABEL[mode]} · {agent.eyebrow}
          </p>
          <h1>
            {litParts(hero.headline).map((part) =>
              part.lit ? <em key={part.text}>{part.text}</em> : part.text,
            )}
          </h1>
          {hero.lead === '' ? null : <p className="db-hero__lead">{hero.lead}</p>}
        </div>
        {hero.action !== undefined && hero.actionTo !== undefined && !stopped ? (
          <Link to={hero.actionTo} className="nv-btn nv-btn--soft nv-swap">
            {hero.action}
          </Link>
        ) : hero.action === undefined || (stopped ? onResume === undefined : first === undefined) ? null : (
          <button
            type="button"
            className={`nv-btn ${stopped ? 'nv-btn--soft' : 'nv-btn--neon'} nv-swap`}
            onClick={() => {
              if (stopped) onResume?.();
              else if (first !== undefined) onOpen(first);
            }}
          >
            {hero.action}
          </button>
        )}
      </div>

      {forCreator || (stopped && todos.length === 0) ? null : todos.length === 0 ? (
        <div className="nv-calm nv-swap">
          <span className="nv-dot nv-tone--ok" aria-hidden="true" />
          Rien à traiter pour l’instant.
        </div>
      ) : (
        <div className="nv-todos">
          {todos.map((todo, i) => (
            <div
              key={todo.id}
              className={`nv-todo nv-swap nv-tone--${todo.tone}`}
              style={{ '--nv-i': i }}
              role="button"
              tabIndex={0}
              aria-label={`${todo.kind} : ${todo.title}`}
              onClick={() => {
                onOpen(todo);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onOpen(todo);
                }
              }}
            >
              <span className="nv-todo__bar" />
              <div className="nv-todo__body">
                <div className="nv-todo__head">
                  <span className="nv-todo__kind">{todo.kind}</span>
                  <span className="nv-todo__title">{todo.title}</span>
                </div>
                <span className="nv-todo__why">{todo.why}</span>
              </div>
              <div className="nv-todo__side">
                <span className="nv-todo__time">{todo.at}</span>
                {onDone === undefined ? null : (
                  <button
                    type="button"
                    className="nv-todo__done"
                    aria-label="Marquer comme traité"
                    title="Traité"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDone(todo.id);
                    }}
                  >
                    <CheckIcon />
                  </button>
                )}
                <Chevron className="nv-todo__go" />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="db-fold">
        <details className="nv-disclosure">
          <summary>
            <span
              className={`nv-dot nv-tone--${agent.tone === 'warn' && agent.stalled !== true ? 'ok' : agent.tone}${agent.tone === 'bad' ? ' nv-dot--live' : ''}`}
              aria-hidden="true"
            />
            <span className="nv-disclosure__title">
              {stopped && (agent.tone === 'ok' || agent.tone === 'warn') && agent.stalled !== true
                ? 'Le reste fonctionne normalement'
                : agent.foldTitle}
            </span>
            <span className="nv-disclosure__sum">{agent.foldSummary}</span>
          </summary>
          <div className="nv-disclosure__body nv-tiles">
            {agent.cards.map((card) => (
              <div key={card.id} className={`nv-tile nv-tone--${card.tone}`}>
                <span className="nv-tile__label">
                  <span className={`nv-dot nv-tone--${card.tone}`} aria-hidden="true" />
                  {card.title}
                </span>
                <span className="nv-tile__value">{card.value}</span>
                {card.gauge === undefined ? null : (
                  <span
                    className={`nv-gauge ${gaugeClass(card.gauge.kind, card.gauge.value, card.tone)}`}
                    style={{
                      '--nv-gauge-value': `${String(card.gauge.value)}%`,
                      '--nv-gauge-mark': `${String(card.gauge.mark)}%`,
                    }}
                    role="img"
                    aria-label={`${String(card.gauge.value)} %, repère à ${String(card.gauge.mark)} %`}
                  >
                    <span className="nv-gauge__fill" />
                    <span className="nv-gauge__mark" />
                  </span>
                )}
                <span className="nv-tile__sub">
                  {card.rows.map(([label, value]) => `${label} : ${value}`).join(' · ')}
                </span>
              </div>
            ))}
          </div>
        </details>
      </div>
    </section>
  );
}
