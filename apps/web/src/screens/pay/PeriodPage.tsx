import {
  payPeriodLastDay,
  PayPeriodSchema,
  type CommissionStatement,
  type Me,
  type PayPeriod,
  type PayPeriodSummary,
  type PayrollPeriod,
} from '@nirvana/contracts';
import { Link } from '@tanstack/react-router';
import { useId, useState, type JSX, type ReactNode } from 'react';

import { CloseDialog } from './CloseDialog';
import { PayNav } from './PayNav';
import { StatementDialog } from './StatementDialog';
import {
  useCurrentPeriod,
  usePayNames,
  usePeriodBlock,
  usePeriodToOpen,
  type PayMember,
  type PayNames,
  type PeriodBlock,
} from './data';
import { Chip, Delta, Empty, Gauge, Loading, LockIcon, PeriodArrows, Swatch, Unreachable } from './parts';

import { usePayPeriod, useRefreshPayroll, validateStatement, type PayRefusal } from '@/payroll/api';
import {
  carryLine,
  changeBps,
  daysLeft,
  forecastNet,
  gaugePercent,
  goalReachedBps,
  goalSpanBps,
  lateNetOf,
  memberFacts,
  momentAt,
  opensOn,
  payRefusalText,
  periodAmount,
  phaseChip,
  phaseOf,
  reachedBpsOf,
  salesSplit,
  signedPercentText,
  statementChips,
  statementsCsv,
  stopsThePeriod,
  summaryOf,
  teamNetOf,
  tierAt,
  validatable,
  whoName,
  type RefusalNames,
  type Share,
} from '@/payroll/model';
import { useAppHold, type HoldResult } from '@/reports/Hold';
import '@/payroll/pay.css';
import '@/reports/reports.css';
import {
  amountText,
  followingPeriod,
  percentText,
  periodLine,
  periodTitle,
  previousPeriod,
  signedAmountText,
} from '@/reports/model';
import { accountLine, platformName } from '@/scheduling/model';
import '@/scheduling/scheduling.css';
import { clockAt, dayMonth, dayOf, longDay } from '@/scheduling/time';
import { useNow } from '@/scheduling/useNow';
import '@/screens/team/team.css';
import { Page, PageHeader, Panel } from '@/shell/layout';

/**
 * Paie › Quinzaine (EQ-05, ADR 0024): one period, the money first — what to pay once it has ended, the team's net and
 * its forecast while it runs — then a row per member. The drafts are checked by default and validated one by one in
 * the members' order; the first validation closes the period for the team (ADR 0032) and says so before. What blocks
 * a period is said above its rows, with what lifts it, and nothing can be validated meanwhile.
 */
export function PeriodPage({
  user,
  chosen,
  onPeriod,
}: {
  user: Me;
  chosen: PayPeriod | null;
  onPeriod: (period: PayPeriod | null) => void;
}): JSX.Element {
  const toOpen = usePeriodToOpen(user.role === 'owner');
  const period = chosen ?? toOpen;
  return <PeriodView key={period ?? 'none'} user={user} period={period} onPeriod={onPeriod} />;
}

/** A validation that stopped on a refusal of the whole period, while the period reads the same. */
interface Stopped {
  readonly refusal: PayRefusal;
  readonly seen: string;
}

/** What a period's statements are: a refusal said about them holds until one of them changes. */
const stateOf = (period: PayrollPeriod): string =>
  `${period.closing?.closedAt ?? ''}|${period.statements.map((one) => `${one.id}:${String(one.revision)}:${one.status}`).join(',')}`;

function PeriodView({
  user,
  period,
  onPeriod,
}: {
  user: Me;
  period: PayPeriod | null;
  onPeriod: (period: PayPeriod | null) => void;
}): JSX.Element {
  const owner = user.role === 'owner';
  const me = { id: user.id, name: user.name };
  const now = useNow();
  const current = useCurrentPeriod();
  const read = usePayPeriod(period);
  const before = usePayPeriod(period === null ? null : previousPeriod(period));
  const names = usePayNames(period, true);
  const data = read.data?.period === period ? read.data : undefined;
  const previous =
    before.data?.period === (period === null ? null : previousPeriod(period)) ? before.data : undefined;
  const block = usePeriodBlock(data);
  const hold = useAppHold();
  const refresh = useRefreshPayroll();
  const [unchecked, setUnchecked] = useState<ReadonlySet<string>>(new Set());
  const [sending, setSending] = useState<ReadonlySet<string>>(new Set());
  const [refusals, setRefusals] = useState<ReadonlyMap<string, PayRefusal>>(new Map());
  const [stopped, setStopped] = useState<Stopped | null>(null);
  const [closing, setClosing] = useState<readonly CommissionStatement[] | null>(null);
  const [closingBusy, setClosingBusy] = useState(false);
  const [opened, setOpened] = useState<{ readonly id: string; readonly paying: boolean } | null>(null);

  const rows =
    data?.statements.toSorted((a, b) =>
      names.member(a.memberId).name.localeCompare(names.member(b.memberId).name, 'fr'),
    ) ?? [];
  const stop =
    stopped !== null && data !== undefined && stopped.seen === stateOf(data) ? stopped.refusal : null;
  const blocked = block !== null || stop !== null;
  const pickable = data === undefined || blocked ? [] : validatable({ ended: data.ended, statements: rows });
  const chosen = pickable.filter((one) => !unchecked.has(one.id) && !sending.has(one.id));
  const reread = rows.find((one) => {
    const refusal = refusals.get(one.id);
    return refusal?.kind === 'refused' && refusal.code === 'commission_statement_changed_conflict';
  });
  const refusalNames = (statement?: CommissionStatement): RefusalNames => ({
    memberName: (memberId) => names.member(memberId).name,
    ...(statement === undefined ? {} : { statement }),
  });

  /** Validates `batch` one by one, in order: each refusal stays on its row, one of the period's stops the rest. */
  const run = async (batch: readonly CommissionStatement[]) => {
    const ids: ReadonlySet<string> = new Set(batch.map((one) => one.id));
    setRefusals((was) => new Map([...was].filter(([id]) => !ids.has(id))));
    let done = 0;
    const refused: [CommissionStatement, PayRefusal][] = [];
    let halted: PayRefusal | null = null;
    for (const one of batch) {
      const outcome = await validateStatement(one.id, one.revision);
      if (outcome.kind === 'ok') {
        done += 1;
        continue;
      }
      // Already validated by someone else: validating twice does nothing more, the period reads again.
      if (outcome.kind === 'refused' && outcome.code === 'commission_statement_status_conflict') continue;
      if (stopsThePeriod(outcome)) {
        halted = outcome;
        break;
      }
      refused.push([one, outcome]);
    }
    await refresh();
    setRefusals(
      (was) => new Map([...was, ...refused.map(([one, refusal]): [string, PayRefusal] => [one.id, refusal])]),
    );
    if (halted !== null && data !== undefined) setStopped({ refusal: halted, seen: stateOf(data) });
    setSending(new Set());
    return { done, refused, halted };
  };

  const validate = (batch: readonly CommissionStatement[]): void => {
    if (batch.length === 0 || data === undefined) return;
    if (data.closing === null) {
      setClosing(batch);
      return;
    }
    const count = batch.length;
    const sum = amountText(
      batch.reduce((total, one) => total + one.payableMinor, 0),
      'EUR',
    );
    const [only] = batch;
    setSending(new Set(batch.map((one) => one.id)));
    hold.hold(
      {
        title:
          count === 1 && only !== undefined
            ? `Validation du relevé de ${names.member(only.memberId).name}`
            : `Validation de ${String(count)} relevés`,
        text: `${sum} à verser`,
        onCancel: () => {
          setSending(new Set());
        },
      },
      async (): Promise<HoldResult> => {
        const { done, refused, halted } = await run(batch);
        const [first] = refused;
        if (first === undefined && halted === null)
          return {
            ok: true,
            title: done === 1 ? 'Relevé validé' : `${String(done)} relevés validés`,
            text: sum,
          };
        const left = count - done;
        return {
          ok: false,
          title:
            done === 0
              ? 'Rien n’a été validé'
              : `${String(done)} validé${done > 1 ? 's' : ''}, ${String(left)} non validé${left > 1 ? 's' : ''}`,
          text:
            halted !== null
              ? payRefusalText(halted, refusalNames())
              : first === undefined
                ? ''
                : `${names.member(first[0].memberId).name} : ${payRefusalText(first[1], refusalNames(first[0]))}`,
        };
      },
    );
  };

  const openedStatement = opened === null ? undefined : rows.find((one) => one.id === opened.id);
  const previousNet = (memberId: string): number | null =>
    previous?.statements.find((one) => one.memberId === memberId)?.netMinor ?? null;

  const head = (
    <PageHeader
      eyebrow="Quinzaine"
      title="Paie"
      lead={leadOf(data, block !== null || stop !== null, owner)}
      actions={
        <>
          <PayNav />
          {reread !== undefined ? (
            <button
              type="button"
              className="nv-btn nv-btn--neon"
              onClick={() => {
                setOpened({ id: reread.id, paying: false });
              }}
            >
              Relire le relevé de {names.member(reread.memberId).name}
            </button>
          ) : pickable.length > 0 ? (
            <button
              type="button"
              className="nv-btn nv-btn--neon py-validate--head"
              disabled={chosen.length === 0}
              onClick={() => {
                validate(chosen);
              }}
            >
              {chosen.length === 0 ? 'Valider' : `Valider (${String(chosen.length)})`}
            </button>
          ) : null}
        </>
      }
    />
  );

  if (period === null || (data === undefined && !read.isError)) {
    return (
      <Page>
        {head}
        <div className="py-board">
          <Panel className="py-sum">
            <Loading rows={1} />
          </Panel>
          <Panel>
            <Loading />
          </Panel>
        </div>
      </Page>
    );
  }
  if (data === undefined) {
    return (
      <Page>
        {head}
        <div className="py-board">
          <Panel
            eyebrow="Quinzaine"
            actions={<PeriodArrows period={period} current={current} onPeriod={onPeriod} />}
          >
            <Unreachable
              what="la quinzaine"
              onRetry={() => {
                void read.refetch();
              }}
            />
          </Panel>
        </div>
      </Page>
    );
  }

  const ended = data.ended;
  const allChecked =
    pickable.length > 0 && chosen.length === pickable.filter((one) => !sending.has(one.id)).length;

  return (
    <Page>
      {head}
      <div className="py-board">
        <Summary
          data={data}
          previous={previous}
          names={names}
          me={me}
          now={now}
          current={current}
          onPeriod={onPeriod}
        />
        <Panel
          className="nv-enter"
          eyebrow={ended ? 'Relevés de commissions' : 'À ce jour, membre par membre'}
          actions={
            rows.length === 0 ? undefined : (
              <button
                type="button"
                className="nv-btn nv-btn--plain nv-btn--sm"
                onClick={() => {
                  downloadCsv(data, names);
                }}
              >
                Exporter (CSV)
              </button>
            )
          }
        >
          <div className="rp-sec">
            {block !== null ? (
              <BlockNotice block={block} zone={data.window?.timeZone ?? null} />
            ) : stop !== null ? (
              <StopNotice
                refusal={stop}
                text={payRefusalText(stop, refusalNames())}
                onPeriod={onPeriod}
                onRetry={() => {
                  setStopped(null);
                }}
              />
            ) : ended && data.closing === null && pickable.length > 0 ? (
              <div className="rp-notice">
                <p className="rp-notice__text">
                  Le premier relevé validé clôt la quinzaine pour toute l’équipe. Un rapport validé ensuite
                  ira sur la quinzaine {periodLine(followingPeriod(data.period))}.
                </p>
              </div>
            ) : null}
            {pickable.length === 0 ? null : (
              <SelectAll
                all={allChecked}
                chosen={chosen.length}
                of={pickable.length}
                onAll={() => {
                  setUnchecked(allChecked ? new Set(pickable.map((one) => one.id)) : new Set());
                }}
                onValidate={() => {
                  validate(chosen);
                }}
              />
            )}
            {rows.length === 0 ? (
              <Empty
                whisper="Pas encore de relevé sur cette quinzaine."
                text="Un relevé se calcule dès qu’un rapport de fin de shift d’un membre est validé."
              />
            ) : (
              <ul className="py-rows">
                {rows.map((statement, index) => {
                  const member = names.member(statement.memberId);
                  const pick = pickable.some((one) => one.id === statement.id);
                  const refusal = refusals.get(statement.id) ?? null;
                  return (
                    <MemberRow
                      key={statement.id}
                      index={index}
                      statement={statement}
                      member={member}
                      ended={ended}
                      own={member.userId === me.id}
                      column={pickable.length > 0}
                      pick={pick}
                      checked={pick && !unchecked.has(statement.id)}
                      sending={sending.has(statement.id)}
                      previousNet={
                        ended && previous !== undefined ? previousNet(statement.memberId) : undefined
                      }
                      who={(userId) => whoName(userId, me, names.members)}
                      refusal={
                        refusal === null
                          ? null
                          : { refusal, text: payRefusalText(refusal, refusalNames(statement)) }
                      }
                      canPay={owner && statement.status === 'validated' && statement.payableMinor > 0}
                      onCheck={(on) => {
                        setUnchecked((was) => {
                          const next = new Set(was);
                          if (on) next.delete(statement.id);
                          else next.add(statement.id);
                          return next;
                        });
                      }}
                      onOpen={(paying) => {
                        setOpened({ id: statement.id, paying });
                      }}
                    />
                  );
                })}
              </ul>
            )}
            {rows.length === 0 ? null : <p className="py-quiet">{quietOf(data)}</p>}
          </div>
        </Panel>
      </div>
      {openedStatement === undefined || opened === null ? null : (
        <StatementDialog
          key={`${openedStatement.id}:${String(openedStatement.revision)}`}
          statement={openedStatement}
          period={data}
          names={names}
          previousNet={previous === undefined ? null : previousNet(openedStatement.memberId)}
          me={me}
          owner={owner}
          canValidateNow={ended && !blocked}
          paying={opened.paying}
          onValidate={(statement) => {
            setOpened(null);
            validate([statement]);
          }}
          onClose={() => {
            setOpened(null);
          }}
        />
      )}
      {closing === null ? null : (
        <CloseDialog
          period={data}
          batch={closing}
          busy={closingBusy}
          onConfirm={() => {
            setClosingBusy(true);
            setSending(new Set(closing.map((one) => one.id)));
            void run(closing).then(() => {
              setClosingBusy(false);
              setClosing(null);
            });
          }}
          onClose={() => {
            setClosing(null);
          }}
        />
      )}
    </Page>
  );
}

/** The header's one sentence: what the period asks of the reader now. */
function leadOf(data: PayrollPeriod | undefined, blocked: boolean, owner: boolean): string | undefined {
  if (data === undefined) return undefined;
  if (!data.ended)
    return data.window === null
      ? 'Les relevés se calculent dès qu’un rapport est validé.'
      : `Les relevés se calculent à chaque rapport validé. La quinzaine se valide à partir du ${longDay(opensOn(data.window))}.`;
  if (blocked) return 'Lève d’abord ce qui bloque : la quinzaine se valide ensuite.';
  const phase = phaseOf(summaryOf(data));
  if (phase === 'to_validate')
    return data.closing === null
      ? 'La quinzaine est finie : relis chaque relevé, puis valide-les.'
      : 'Close : il reste des relevés à valider, puis les paiements.';
  if (phase === 'to_pay')
    return owner
      ? 'Validée : marque chaque relevé payé une fois le transfert fait.'
      : 'Validée : le propriétaire verse les relevés.';
  return data.statements.length === 0 ? 'Aucun relevé sur cette quinzaine.' : 'Payée : tout est versé.';
}

/** The quiet line under the rows: when the statements were computed, and what a click does. */
function quietOf(data: PayrollPeriod): string {
  const zone = data.window?.timeZone ?? null;
  const computed = data.statements.reduce<string | null>(
    (latest, one) => (latest === null || one.computedAt > latest ? one.computedAt : latest),
    null,
  );
  const at = computed === null || zone === null ? '' : `Calculé à ${clockAt(computed, zone)}. `;
  if (!data.ended) return `${at}Rien ne se valide avant la fin de la quinzaine.`;
  if (data.closing !== null)
    return `${at}Close : un rapport validé maintenant va sur la quinzaine ${periodLine(followingPeriod(data.period))}.`;
  return `${at}Un relevé s’ouvre d’un clic : le parcours de l’argent, ligne par ligne.`;
}

/** The period's head: its state, the one figure that leads, at most three beside it, and the split of its sales. */
function Summary({
  data,
  previous,
  names,
  me,
  now,
  current,
  onPeriod,
}: {
  data: PayrollPeriod;
  previous: PayrollPeriod | undefined;
  names: PayNames;
  me: { readonly id: string; readonly name: string };
  now: Date;
  current: PayPeriod | null;
  onPeriod: (period: PayPeriod | null) => void;
}): JSX.Element {
  const { window, statements } = data;
  const summary = summaryOf(data);
  const phase = phaseOf(summary);
  const net = teamNetOf(statements);
  const lastDay = payPeriodLastDay(data.period);
  const forecast = window === null ? null : forecastNet(net, lateNetOf(statements), window, now);
  const previousNet =
    previous === undefined || previous.statements.length === 0 ? null : teamNetOf(previous.statements);
  const previousName = periodTitle(previousPeriod(data.period));
  const goal = data.collectiveGoal;
  const reached = goal === null ? 0 : goalReachedBps(data, goal);
  const amount = periodAmount(summary);
  const zone = window?.timeZone ?? null;

  const state: ReactNode =
    data.closing !== null ? (
      <>
        <span className="py-lock">
          <LockIcon />
          <span>
            Close le {zone === null ? '' : momentAt(data.closing.closedAt, zone)}
            {data.closing.closedBy === null
              ? ''
              : ` par ${whoName(data.closing.closedBy, me, names.members)}`}
          </span>
        </span>
        {phase === 'paid' || phase === 'to_pay' ? <Chip chip={phaseChip(summary)} /> : null}
      </>
    ) : !data.ended ? (
      <>
        <Chip chip={phaseChip(summary)} />
        {window === null ? null : <span>{daysLeftText(daysLeft(window, now))}</span>}
      </>
    ) : (
      <>
        <Chip chip={phaseChip(summary)} />
        <span>depuis le {longDay(lastDay)} à minuit</span>
      </>
    );

  const figures: JSX.Element[] = [];
  if (data.ended)
    figures.push(
      <Figure
        key="net"
        label="Net de l’équipe"
        value={
          <>
            {amountText(net, 'EUR')}
            {previous === undefined ? null : (
              <Delta bps={changeBps(net, previousNet)} title={`Net comparé au ${previousName}`} />
            )}
          </>
        }
        note={previousNet === null ? 'pas de quinzaine avant pour comparer' : `comparé au ${previousName}`}
      />,
    );
  else if (forecast !== null && previousNet !== null) {
    const change = changeBps(forecast, previousNet);
    if (change !== null)
      figures.push(
        <Figure
          key="gap"
          label="Fin prévue"
          value={signedPercentText(Math.round(change / 100) * 100)}
          note={`comparée au ${previousName} (${amountText(previousNet, 'EUR')})`}
        />,
      );
  }
  if (goal !== null) {
    const span = goalSpanBps(goal);
    const forecastBps = !data.ended && forecast !== null ? reachedBpsOf(forecast, goal.targetMinor) : null;
    const tier = tierAt(goal.tiers, forecastBps ?? reached);
    const bonus = tier === null ? '' : `${signedAmountText(tier.bonusMinor, 'EUR')} par chatteur`;
    figures.push(
      <Figure
        key="goal"
        label="Objectif collectif"
        value={percentText(Math.floor(reached / 100) * 100)}
        extra={
          <Gauge
            value={gaugePercent(reached, span)}
            mark={forecastBps === null ? null : gaugePercent(forecastBps, span)}
          />
        }
        note={
          forecastBps === null
            ? tier === null
              ? `aucun palier atteint, sur ${amountText(goal.targetMinor, 'EUR')}`
              : `palier ${percentText(tier.reachedBps)} atteint : ${bonus}`
            : `prévu ${percentText(Math.floor(forecastBps / 100) * 100)} : ${
                tier === null ? 'aucun palier' : `palier ${percentText(tier.reachedBps)}, ${bonus}`
              }`
        }
      />,
    );
  }

  const creators = salesSplit(
    statements,
    (line) => names.account(line.platformAccountId)?.creatorName ?? 'Autre',
  );
  const platforms = salesSplit(statements, (line) => {
    const account = names.account(line.platformAccountId);
    return account === null ? 'Autre' : platformName(account.platform);
  });

  return (
    <section className="nv-plate nv-panel py-sum nv-enter">
      <div className="py-sum__head">
        <p className="py-sum__state">{state}</p>
        <PeriodArrows period={data.period} current={current} onPeriod={onPeriod} />
      </div>
      <div className="py-sum__body">
        {data.ended ? (
          <div className="py-hero">
            <p className="py-hero__label">
              {phase === 'paid' ? 'Versé pour la quinzaine' : 'À verser pour la quinzaine'}
            </p>
            <p className="py-hero__value nv-num">{amountText(amount.minor, 'EUR')}</p>
            <p className="py-hero__note">{countsNote(summary.statements)}</p>
          </div>
        ) : (
          <div className="py-hero">
            <p className="py-hero__label">Net de l’équipe à ce jour</p>
            <p className="py-hero__value nv-num">{amountText(net, 'EUR')}</p>
            <p className="py-hero__note">
              {forecast === null ? (
                'La prévision vient après un premier jour entier.'
              ) : (
                <>
                  À ce rythme, <b className="nv-num">{amountText(forecast, 'EUR')}</b> le {longDay(lastDay)}.
                </>
              )}
            </p>
          </div>
        )}
        {figures.length === 0 ? null : <div className="py-figs">{figures}</div>}
      </div>
      {creators.length === 0 ? null : (
        <details className="nv-disclosure py-fold">
          <summary>
            <span className="nv-disclosure__title">Ventes par créatrice et par plateforme</span>
            <span className="nv-disclosure__sum">
              {[...creators, ...platforms]
                .map((share) => `${share.name} ${percentText(roundedPercent(share))}`)
                .join(' · ')}
            </span>
          </summary>
          <div className="nv-disclosure__body py-salesfold">
            <Split label="Par créatrice" shares={creators} />
            <Split label="Par plateforme" shares={platforms} />
          </div>
        </details>
      )}
    </section>
  );
}

const roundedPercent = (share: Share): number => Math.round(share.bps / 100) * 100;

const daysLeftText = (days: number): string => (days <= 1 ? 'dernier jour' : `encore ${String(days)} jours`);

/** « 4 relevés à valider · 1 sous le minimum, reporté ». */
function countsNote(counts: PayPeriodSummary['statements']): ReactNode {
  const total = counts.draft + counts.validated + counts.paid;
  const done = counts.validated + counts.paid;
  const first =
    total === 0
      ? 'Aucun relevé'
      : counts.draft > 0
        ? `${String(counts.draft)} relevé${counts.draft > 1 ? 's' : ''} à valider`
        : `${String(done)} relevé${done > 1 ? 's' : ''} validé${done > 1 ? 's' : ''} sur ${String(total)}`;
  if (counts.carried === 0) return first;
  return (
    <>
      {first} · <b>{counts.carried} sous le minimum</b>, reporté{counts.carried > 1 ? 's' : ''}
    </>
  );
}

function Figure({
  label,
  value,
  note,
  extra,
}: {
  label: string;
  value: ReactNode;
  note: string;
  extra?: ReactNode;
}): JSX.Element {
  return (
    <div className="py-fig">
      <p className="py-fig__label">{label}</p>
      <p className="py-fig__value nv-num">{value}</p>
      {extra}
      <p className="py-fig__note">{note}</p>
    </div>
  );
}

function Split({ label, shares }: { label: string; shares: readonly Share[] }): JSX.Element {
  return (
    <div>
      <p className="py-fig__label">{label}</p>
      <div className="py-split" aria-hidden="true">
        {shares.map((share) => (
          <i key={share.name} style={{ '--py-share': share.bps / 10_000 }} title={share.name} />
        ))}
      </div>
      <ul className="py-keys">
        {shares.map((share) => (
          <li key={share.name} title={amountText(share.minor, 'EUR')}>
            {share.name} {percentText(roundedPercent(share))}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** « Tout sélectionner n sur n », and on a phone « Valider » beside it. */
function SelectAll({
  all,
  chosen,
  of,
  onAll,
  onValidate,
}: {
  all: boolean;
  chosen: number;
  of: number;
  onAll: () => void;
  onValidate: () => void;
}): JSX.Element {
  const id = useId();
  return (
    <div className="py-allrow">
      <label className="rp-all" htmlFor={`${id}-all`}>
        <input id={`${id}-all`} type="checkbox" className="rp-check" checked={all} onChange={onAll} />
        Tout sélectionner
        <span className="rp-all__count nv-num">
          {String(chosen)} sur {String(of)}
        </span>
      </label>
      <button
        type="button"
        className="nv-btn nv-btn--neon nv-btn--sm py-validate--row"
        disabled={chosen === 0}
        aria-label={`Valider les ${String(chosen)} relevés`}
        onClick={onValidate}
      >
        Valider
      </button>
    </div>
  );
}

/** One member's statement: who, what they made and earn, its state; checked or not; a refusal under it. */
function MemberRow({
  index,
  statement,
  member,
  ended,
  own,
  column,
  pick,
  checked,
  sending,
  previousNet,
  who,
  refusal,
  canPay,
  onCheck,
  onOpen,
}: {
  index: number;
  statement: CommissionStatement;
  member: PayMember;
  ended: boolean;
  own: boolean;
  /** The list has a column of boxes: a row without one keeps its place. */
  column: boolean;
  pick: boolean;
  checked: boolean;
  sending: boolean;
  /** The member's net the period before; `undefined` when not compared, `null` without a statement then. */
  previousNet: number | null | undefined;
  who: (userId: string) => string;
  refusal: { readonly refusal: PayRefusal; readonly text: string } | null;
  canPay: boolean;
  onCheck: (on: boolean) => void;
  onOpen: (paying: boolean) => void;
}): JSX.Element {
  const id = useId();
  const zone = statement.window.timeZone;
  const carry = carryLine(statement);
  const chips = statementChips(statement, ended);
  const hover = (label: string): string | undefined => {
    if (label === 'Validé' && statement.validatedAt !== null)
      return `Validé le ${momentAt(statement.validatedAt, zone)}${statement.validatedBy === null ? '' : ` par ${who(statement.validatedBy)}`}`;
    if (label === 'Payé' && statement.payment !== null)
      return `Payé le ${longDay(statement.payment.paidOn)}${statement.paidBy === null ? '' : `, marqué par ${who(statement.paidBy)}`}`;
    return undefined;
  };
  const locked = own && statement.status === 'draft' && ended;
  const changed =
    refusal?.refusal.kind === 'refused' && refusal.refusal.code === 'commission_statement_changed_conflict';
  const missingRate =
    refusal?.refusal.kind === 'refused' && refusal.refusal.code === 'commission_rate_missing_conflict';

  return (
    <li
      className="rp-review py-member nv-enter"
      style={{ '--nv-i': Math.min(index, 8) }}
      data-nopick={column ? undefined : 'true'}
      data-checked={checked ? 'true' : undefined}
      data-locked={locked ? 'true' : undefined}
      aria-busy={sending}
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest('input, button, a, label') !== null)
          return;
        onOpen(false);
      }}
    >
      {!column ? null : pick || locked ? (
        <label className="rp-review__pick" htmlFor={`${id}-pick`}>
          <input
            id={`${id}-pick`}
            type="checkbox"
            className="rp-check"
            checked={checked || sending}
            disabled={!pick || sending}
            aria-label={`Sélectionner le relevé de ${member.name}`}
            onChange={(event) => {
              onCheck(event.target.checked);
            }}
          />
        </label>
      ) : (
        <span className="rp-review__pick" aria-hidden="true" />
      )}
      <div className="rp-review__main">
        <p className="rp-review__who">
          <Swatch color={member.color} />
          <button
            type="button"
            className="py-member__open"
            onClick={() => {
              onOpen(false);
            }}
          >
            {member.name}
          </button>
          {member.manager ? <span className="py-member__role">Manager</span> : null}
          {previousNet === undefined ? null : (
            <Delta
              bps={changeBps(statement.netMinor, previousNet)}
              title={
                previousNet === null
                  ? 'Pas de relevé la quinzaine d’avant'
                  : `Net comparé à la quinzaine d’avant (${amountText(previousNet, 'EUR')})`
              }
            />
          )}
        </p>
        <p className="py-member__line nv-num">
          net <b>{amountText(statement.netMinor, 'EUR')}</b>
          {memberFacts(statement).map((fact) => ` · ${fact}`)}
        </p>
        {carry === null ? null : <p className="py-member__line">{carry}</p>}
        {locked ? (
          <p className="rp-review__locked">Ton relevé : un autre membre de l’agence le valide.</p>
        ) : null}
      </div>
      <div className="rp-review__side">
        {statement.carryOverOutMinor === 0 ? (
          <span className="rp-review__amount nv-num">{amountText(statement.payableMinor, 'EUR')}</span>
        ) : (
          <span className="py-member__amount">
            <span className="py-member__was nv-num">{amountText(statement.totalMinor, 'EUR')}</span>
            <span className="rp-review__amount nv-num">{amountText(statement.payableMinor, 'EUR')}</span>
          </span>
        )}
        <div className="py-chips">
          {sending ? (
            <span className="rp-review__held">En validation</span>
          ) : (
            chips.map((chip) => <Chip key={chip.label} chip={chip} title={hover(chip.label)} />)
          )}
        </div>
        {canPay ? (
          <button
            type="button"
            className="nv-btn nv-btn--soft nv-btn--sm"
            onClick={() => {
              onOpen(true);
            }}
          >
            Marquer payé
          </button>
        ) : null}
      </div>
      {refusal === null ? null : (
        <div className="py-member__refused rp-notice" data-tone="warn" role="alert">
          <div className="py-notice-row">
            <p className="rp-notice__text">{refusal.text}</p>
            {changed ? (
              <button
                type="button"
                className="nv-btn nv-btn--soft nv-btn--sm"
                onClick={() => {
                  onOpen(false);
                }}
              >
                Relire
              </button>
            ) : missingRate ? (
              <Link
                to="/equipe/membres"
                search={{ membre: statement.memberId }}
                className="nv-btn nv-btn--soft nv-btn--sm"
              >
                Ouvrir sa fiche
              </Link>
            ) : null}
          </div>
        </div>
      )}
    </li>
  );
}

/** What blocks the period before anyone tries, in amber above the rows, with the gesture that lifts it. */
function BlockNotice({ block, zone }: { block: PeriodBlock; zone: string | null }): JSX.Element {
  if (block.kind === 'rate_missing')
    return (
      <div className="rp-notice" data-tone="warn">
        <p className="rp-notice__title">Le taux du dollar de la BCE manque pour la fin de la quinzaine</p>
        <p className="rp-notice__text">
          Il arrive chaque jour ouvré vers 16 h : la quinzaine se valide dès qu’il est là. Rien à faire de ton
          côté.
        </p>
      </div>
    );
  const count = block.reports.length;
  const named = block.reports.slice(0, 3).map((report) => {
    const { name, startsAt } = block.whose(report);
    return startsAt === null || zone === null ? name : `${name}, ${dayMonth(dayOf(startsAt, zone))}`;
  });
  const more = count - named.length;
  const list =
    more > 0
      ? `${named.join(' ; ')} et ${String(more)} autre${more > 1 ? 's' : ''}.`
      : `${named.slice(0, -1).join(' ; ')}${named.length > 1 ? ' et ' : ''}${named.at(-1) ?? ''}.`;
  return (
    <div className="rp-notice" data-tone="warn">
      <div className="py-notice-row">
        <div>
          <p className="rp-notice__title">
            {count === 1
              ? 'Un rapport de la quinzaine attend sa relecture'
              : `${String(count)} rapports de la quinzaine attendent leur relecture`}
          </p>
          <p className="rp-notice__text">
            {list} Tant {count === 1 ? 'qu’il attend' : 'qu’ils attendent'}, la quinzaine ne se clôt pas :{' '}
            {count === 1 ? 'il compterait' : 'ils compteraient'} sans avoir été relu{count === 1 ? '' : 's'}.
          </p>
        </div>
        <Link to="/equipe/rapports" className="nv-btn nv-btn--neon nv-btn--sm">
          {count === 1 ? 'Relire le rapport' : `Relire les ${String(count)} rapports`}
        </Link>
      </div>
    </div>
  );
}

/** A validation the server stopped for the whole period: what it said, and what to do about it. */
function StopNotice({
  refusal,
  text,
  onPeriod,
  onRetry,
}: {
  refusal: PayRefusal;
  text: string;
  onPeriod: (period: PayPeriod | null) => void;
  onRetry: () => void;
}): JSX.Element {
  const earlier =
    refusal.kind === 'refused' && refusal.code === 'pay_period_order_conflict'
      ? PayPeriodSchema.safeParse(refusal.details.period)
      : null;
  return (
    <div className="rp-notice" data-tone="warn" role="alert">
      <div className="py-notice-row">
        <p className="rp-notice__text">{text}</p>
        {refusal.kind === 'failed' ? (
          <button type="button" className="nv-btn nv-btn--soft nv-btn--sm" onClick={onRetry}>
            Réessayer
          </button>
        ) : refusal.code === 'pay_period_reports_pending_conflict' ? (
          <Link to="/equipe/rapports" className="nv-btn nv-btn--neon nv-btn--sm">
            Relire les rapports
          </Link>
        ) : earlier?.success === true ? (
          <button
            type="button"
            className="nv-btn nv-btn--neon nv-btn--sm"
            onClick={() => {
              onPeriod(earlier.data);
            }}
          >
            Ouvrir cette quinzaine
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** The period's statements as a spreadsheet, made in the browser from what is read: no route, no right of its own. */
function downloadCsv(data: PayrollPeriod, names: PayNames): void {
  const csv = statementsCsv(
    data,
    (memberId) => names.member(memberId).name,
    (accountId) => {
      const account = names.account(accountId);
      return account === null ? 'Compte' : `${account.creatorName} (${accountLine(account)})`;
    },
  );
  // The mark tells a spreadsheet the file is UTF-8: « Théo » stays « Théo ».
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `releves-${data.period}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
