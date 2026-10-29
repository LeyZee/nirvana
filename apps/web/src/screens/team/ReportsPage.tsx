import {
  newId,
  ShiftReportIdSchema,
  type PayPeriod,
  type PlanningAccount,
  type PlanningMember,
  type ShiftReport,
  type ShiftReportList,
} from '@nirvana/contracts';
import { useEffect, useId, useRef, useState, type JSX } from 'react';

import { TeamNav } from './TeamNav';

import { useAppHold, type HoldResult } from '@/reports/Hold';
import { ReportPanel } from '@/reports/ReportPanel';
import {
  rejectReport,
  useRefreshReports,
  useReports,
  useSchedulingSettings,
  validateInBatches,
  type ReportRefusal,
} from '@/reports/api';
import {
  AGENCY_STATUS,
  amountText,
  linesOf,
  periodAt,
  periodSums,
  periodTitle,
  previousPeriod,
  READ_AGAIN,
  REPORT_ERRORS,
  signedAmountText,
  STATUS_TONES,
  followingPeriod,
  type ShiftLine,
} from '@/reports/model';
import { useReopening, type ReportDraft } from '@/reports/reopen';
import '@/reports/reports.css';
import { accountLine, swapShiftLine } from '@/scheduling/model';
import '@/scheduling/scheduling.css';
import { readerZone } from '@/scheduling/time';
import { useNow } from '@/scheduling/useNow';
import { Page, PageHeader, Panel } from '@/shell/layout';

/** The correction panel the agency opens on a validated report, for its shift. */
interface Correcting {
  readonly shiftId: string;
  readonly memberName: string;
  readonly draft: ReportDraft;
}

const emptyCorrection = (): ReportDraft => ({
  id: newId(ShiftReportIdSchema),
  correcting: true,
  amount: '',
  comment: '',
  incidentOn: false,
  incident: '',
});

/**
 * Équipe › Rapports (EQ-03, ADR 0024): what waits for the agency first, validated in one gesture and held five seconds,
 * or sent back with a word; then a period member by member, its shifts without a report in amber, a validated report
 * corrected from there (a refund the member did not declare). The server says who may review what (`canReview`).
 */
export function ReportsPage({ owner }: { owner: boolean }): JSX.Element {
  const now = useNow();
  const zone = readerZone();
  const hold = useAppHold();
  const settings = useSchedulingSettings();
  const open = useReports(null);
  const current = settings.data === undefined ? null : periodAt(now, settings.data.timeZone);
  const [picked, setPicked] = useState<PayPeriod | null>(null);
  const period = picked ?? current;
  const ofPeriod = useReports(period, period !== null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [held, setHeld] = useState<ReadonlySet<string>>(new Set());
  const [correcting, setCorrecting] = useState<Correcting | null>(null);
  useReopening('/equipe/rapports', (what) => {
    // A correction always names its member: the panel opens here for nothing else.
    if (what.memberName !== null) {
      setCorrecting({ shiftId: what.shiftId, memberName: what.memberName, draft: what.draft });
    }
  });
  const refresh = useRefreshReports();

  const waiting = (open.data?.reports ?? []).filter((one) => one.status === 'submitted');
  const chosen = waiting.filter((one) => selected.has(one.id) && one.canReview && !held.has(one.id));

  const validate = (): void => {
    if (chosen.length === 0) return;
    const batch = chosen.map((one) => ({ id: one.id, version: one.version }));
    const ids: ReadonlySet<string> = new Set(batch.map((one) => one.id));
    const count = batch.length;
    const sums = periodSums(chosen)
      .map((sum) => amountText(sum.waitingMinor, sum.currency))
      .join(' · ');
    const whose = whoseOf(chosen, namesOf(open.data), zone);
    // Held with any validation still held or on its way; released alone, whatever the others do.
    setHeld((before) => new Set([...before, ...ids]));
    setSelected(new Set());
    const release = (): void => {
      setHeld((before) => new Set([...before].filter((one) => !ids.has(one))));
    };
    hold.hold(
      {
        title: count === 1 ? 'Validation du rapport' : `Validation de ${String(count)} rapports`,
        text: sums,
        onCancel: () => {
          release();
          setSelected(ids);
        },
      },
      async (): Promise<HoldResult> => {
        const { results, stopped } = await validateInBatches(batch);
        await refresh();
        release();
        const done = results.filter((one) => one.outcome === 'validated').length;
        const [first] = results.flatMap((one) => (one.outcome === 'refused' ? [one] : []));
        if (first === undefined && stopped === null) {
          return {
            ok: true,
            title: done === 1 ? 'Rapport validé' : `${String(done)} rapports validés`,
            text: sums,
          };
        }
        if (first === undefined && done === 0 && stopped !== null) {
          return refusedResult(stopped, 'Rien n’a été validé');
        }
        const left = count - done;
        const plural = left > 1 ? 's' : '';
        // The batches the server never answered were not refused: they were not sent.
        const what = stopped === null ? `refusé${plural}` : `non validé${plural}`;
        const more = left - 1;
        return {
          ok: false,
          title:
            done === 0
              ? 'Rien n’a été validé'
              : `${String(done)} validé${done > 1 ? 's' : ''}, ${String(left)} ${what}`,
          text:
            first === undefined
              ? stopped?.kind === 'refused'
                ? REPORT_ERRORS[stopped.code]
                : 'Le serveur ne répond pas : les rapports restants n’ont pas été envoyés.'
              : `${whose(first.id)} : ${lowerFirst(REPORT_ERRORS[first.code])}${
                  more === 0 ? '' : ` Et ${String(more)} autre${more > 1 ? 's' : ''}.`
                }`,
        };
      },
    );
  };

  return (
    <Page>
      <PageHeader
        title="Équipe"
        lead="Les rapports de fin de shift : valide-les en lot, renvoie-en un avec un mot."
        actions={
          <>
            <TeamNav />
            <button
              type="button"
              className="nv-btn nv-btn--neon"
              disabled={chosen.length === 0}
              onClick={validate}
            >
              {chosen.length === 0 ? 'Valider' : `Valider (${String(chosen.length)})`}
            </button>
          </>
        }
      />
      <div className="rp-board">
        <ToValidate
          list={open.data}
          isError={open.isError}
          onRetry={() => {
            void open.refetch();
          }}
          waiting={waiting}
          held={held}
          selected={selected}
          zone={zone}
          onSelect={setSelected}
        />
        <PeriodPanel
          period={period}
          current={current}
          list={ofPeriod.data}
          isError={ofPeriod.isError || settings.isError}
          onRetry={() => {
            void settings.refetch();
            void ofPeriod.refetch();
          }}
          zone={zone}
          onPeriod={setPicked}
          onCorrect={(line, memberName) => {
            setCorrecting({ shiftId: line.shift.id, memberName, draft: emptyCorrection() });
          }}
        />
      </div>
      {correcting === null ? null : (
        <ReportPanel
          key={correcting.draft.id}
          shiftId={correcting.shiftId}
          draft={correcting.draft}
          memberName={correcting.memberName}
          canSetRules={owner}
          from="/equipe/rapports"
          onClose={() => {
            setCorrecting(null);
          }}
        />
      )}
    </Page>
  );
}

const refusedResult = (refusal: ReportRefusal, title: string): HoldResult => ({
  ok: false,
  title,
  text:
    refusal.kind === 'failed'
      ? 'Le serveur ne répond pas : rien n’a été envoyé.'
      : REPORT_ERRORS[refusal.code],
});

/** A refusal's words after a colon: « … : ce rapport a changé… ». */
const lowerFirst = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1);

/** Who a refused report is from, and on what shift: « Le rapport de Théo (lun. 26 oct. · 17 h – 23 h) ». */
function whoseOf(
  reports: readonly ShiftReport[],
  names: ReturnType<typeof namesOf>,
  zone: string,
): (reportId: string) => string {
  return (reportId) => {
    const report = reports.find((one) => one.id === reportId);
    if (report === undefined) return 'Un rapport';
    const what = report.correctsId === null ? 'Le rapport' : 'La correction';
    const who = names.members.get(report.memberId)?.displayName;
    const shift = names.shifts.get(report.shiftId);
    const when = shift === undefined ? null : swapShiftLine(shift.startsAt, shift.endsAt, undefined, zone);
    return `${what}${who === undefined ? '' : ` de ${who}`}${when === null ? '' : ` (${when})`}`;
  };
}

/** A member's colour on their swatch, or the swatch's own grey. */
function swatchOf(member: PlanningMember | undefined): { '--sc-color': string } | undefined {
  const color = member?.color ?? null;
  return color === null ? undefined : { '--sc-color': color };
}

/** Who a report is from, and on what: the names the list sends with it. */
function namesOf(list: ShiftReportList | undefined): {
  readonly members: ReadonlyMap<string, PlanningMember>;
  readonly accounts: ReadonlyMap<string, PlanningAccount>;
  readonly shifts: ReadonlyMap<string, ShiftReportList['shifts'][number]>;
} {
  return {
    members: new Map((list?.members ?? []).map((member) => [member.id, member])),
    accounts: new Map((list?.accounts ?? []).map((account) => [account.id, account])),
    shifts: new Map((list?.shifts ?? []).map((shift) => [shift.id, shift])),
  };
}

function ToValidate({
  list,
  isError,
  onRetry,
  waiting,
  held,
  selected,
  zone,
  onSelect,
}: {
  list: ShiftReportList | undefined;
  isError: boolean;
  onRetry: () => void;
  waiting: readonly ShiftReport[];
  /** Reports whose validation is held: shown dimmed, out of the selection, until it is sent or taken back. */
  held: ReadonlySet<string>;
  selected: ReadonlySet<string>;
  zone: string;
  onSelect: (next: ReadonlySet<string>) => void;
}): JSX.Element {
  const id = useId();
  if (isError) {
    return (
      <Panel className="rp-validate" eyebrow="À valider">
        <div className="rp-sec">
          <div className="sc-empty">
            <p className="tm-warn">Le serveur ne répond pas : les rapports n’ont pas pu être lus.</p>
            <button type="button" className="nv-btn nv-btn--soft nv-btn--sm" onClick={onRetry}>
              Réessayer
            </button>
          </div>
        </div>
      </Panel>
    );
  }
  if (list === undefined) {
    return (
      <Panel className="rp-validate">
        <div className="sc-skeleton" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
      </Panel>
    );
  }
  const names = namesOf(list);
  const reviewable = waiting.filter((one) => one.canReview && !held.has(one.id));
  const all = reviewable.length > 0 && reviewable.every((one) => selected.has(one.id));
  const sums = periodSums(waiting);
  const sentBack = list.reports.filter((one) => one.status === 'rejected');
  const ordered = waiting.toSorted((a, b) =>
    (names.shifts.get(a.shiftId)?.startsAt ?? '').localeCompare(names.shifts.get(b.shiftId)?.startsAt ?? ''),
  );

  return (
    <Panel className="rp-validate nv-enter" eyebrow="À valider">
      <div className="rp-sec">
        <div className="rp-validate__top">
          <p className="rp-validate__count">
            <span className="rp-validate__num nv-num">{waiting.length}</span>
            <span className="rp-validate__what">
              {waiting.length === 0
                ? 'Rien à valider'
                : waiting.length === 1
                  ? 'rapport attend'
                  : 'rapports attendent'}
            </span>
          </p>
          {sums.length === 0 ? null : (
            <p className="rp-validate__sum nv-num">
              {sums.map((sum) => amountText(sum.waitingMinor, sum.currency)).join(' · ')}
            </p>
          )}
        </div>

        {waiting.length === 0 ? (
          <p className="rp-mine__empty">
            Tout est validé. Un rapport arrive ici dès qu’un membre le fait, à la fin de son shift.
          </p>
        ) : (
          <>
            {reviewable.length === 0 ? null : (
              <label className="rp-all" htmlFor={`${id}-all`}>
                <input
                  id={`${id}-all`}
                  type="checkbox"
                  className="rp-check"
                  checked={all}
                  onChange={() => {
                    onSelect(all ? new Set() : new Set(reviewable.map((one) => one.id)));
                  }}
                />
                Tout sélectionner
                <span className="rp-all__count nv-num">
                  {selected.size === 0
                    ? ''
                    : `${String(reviewable.filter((one) => selected.has(one.id)).length)} sur ${String(reviewable.length)}`}
                </span>
              </label>
            )}
            <ul className="rp-reviews">
              {ordered.map((report, index) => (
                <Review
                  key={report.id}
                  report={report}
                  index={index}
                  names={names}
                  zone={zone}
                  held={held.has(report.id)}
                  checked={selected.has(report.id)}
                  onCheck={(on) => {
                    const next = new Set(selected);
                    if (on) next.add(report.id);
                    else next.delete(report.id);
                    onSelect(next);
                  }}
                />
              ))}
            </ul>
          </>
        )}

        {sentBack.length === 0 ? null : (
          <details className="nv-disclosure rp-mine__all">
            <summary>
              <span className="nv-disclosure__title">Renvoyés aux membres</span>
              <span className="nv-disclosure__sum">{sentBack.length} en attente d’un nouvel envoi</span>
            </summary>
            <ul className="nv-disclosure__body rp-lines">
              {sentBack.map((report) => {
                const shift = names.shifts.get(report.shiftId);
                return (
                  <li key={report.id} className="rp-sent">
                    <span className="rp-sent__who">
                      {names.members.get(report.memberId)?.displayName ?? 'Un membre'}
                    </span>
                    <span className="rp-sent__when nv-num">
                      {shift === undefined
                        ? ''
                        : swapShiftLine(
                            shift.startsAt,
                            shift.endsAt,
                            names.accounts.get(report.platformAccountId)?.creatorName,
                            zone,
                          )}
                    </span>
                    {report.reviewNote === null ? null : (
                      <span className="rp-sent__note">« {report.reviewNote} »</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </details>
        )}
      </div>
    </Panel>
  );
}

/** One report to validate: who, on what and when; what it says; its amount; and « Renvoyer » with a word. */
function Review({
  report,
  index,
  names,
  zone,
  held,
  checked,
  onCheck,
}: {
  report: ShiftReport;
  index: number;
  names: ReturnType<typeof namesOf>;
  zone: string;
  held: boolean;
  checked: boolean;
  onCheck: (on: boolean) => void;
}): JSX.Element {
  const id = useId();
  const [refusing, setRefusing] = useState(false);
  const member = names.members.get(report.memberId);
  const account = names.accounts.get(report.platformAccountId);
  const shift = names.shifts.get(report.shiftId);
  const correction = report.correctsId !== null;

  return (
    <li
      className="rp-review nv-enter"
      style={{ '--nv-i': Math.min(index, 8) }}
      data-checked={checked ? 'true' : undefined}
      data-held={held ? 'true' : undefined}
      aria-busy={held}
      data-locked={report.canReview ? undefined : 'true'}
    >
      <label className="rp-review__pick" htmlFor={`${id}-pick`}>
        <input
          id={`${id}-pick`}
          type="checkbox"
          className="rp-check"
          checked={checked || held}
          disabled={!report.canReview || held}
          aria-label={`Sélectionner le rapport de ${member?.displayName ?? 'ce membre'}`}
          onChange={(event) => {
            onCheck(event.target.checked);
          }}
        />
      </label>
      <div className="rp-review__main">
        <p className="rp-review__who">
          <span className="sc-swatch" style={swatchOf(member)} aria-hidden="true" />
          {member?.displayName ?? 'Un membre'}
          {correction ? (
            <span className="rp-chip rp-chip--neutral">
              {report.byAgency ? 'Correction de l’agence' : 'Correction'}
            </span>
          ) : null}
        </p>
        <p className="rp-review__where nv-num">
          {account === undefined ? null : `${account.creatorName} · ${accountLine(account)} · `}
          {shift === undefined ? null : swapShiftLine(shift.startsAt, shift.endsAt, undefined, zone)}
        </p>
        {report.comment === null ? null : <p className="rp-review__quote">« {report.comment} »</p>}
        {report.incident === null ? null : (
          <p className="rp-review__incident">
            <span className="rp-review__flag">Incident</span> {report.incident}
          </p>
        )}
        {report.canReview ? null : (
          <p className="rp-review__locked">
            {correction && report.byAgency
              ? 'Ta correction : un autre membre de l’agence la valide.'
              : 'Ton propre shift : un autre membre de l’agence le valide.'}
          </p>
        )}
      </div>
      <div className="rp-review__side">
        <span className="rp-review__amount nv-num">
          {correction
            ? signedAmountText(report.amount.amountMinor, report.amount.currency)
            : amountText(report.amount.amountMinor, report.amount.currency)}
        </span>
        {held ? (
          <span className="rp-review__held">En validation</span>
        ) : report.canReview && !refusing ? (
          <button
            type="button"
            className="nv-btn nv-btn--plain nv-btn--sm"
            onClick={() => {
              setRefusing(true);
            }}
          >
            Renvoyer
          </button>
        ) : null}
      </div>
      {refusing ? (
        <RefuseForm
          report={report}
          memberName={member?.displayName}
          onDone={() => {
            setRefusing(false);
          }}
        />
      ) : null}
    </li>
  );
}

/** « Renvoyer » opened under a report: the word for its member, sent at once (the member sends it again). */
function RefuseForm({
  report,
  memberName,
  onDone,
}: {
  report: ShiftReport;
  memberName: string | undefined;
  onDone: () => void;
}): JSX.Element {
  const id = useId();
  const refresh = useRefreshReports();
  const field = useRef<HTMLTextAreaElement>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<ReportRefusal | null>(null);

  useEffect(() => {
    field.current?.focus();
  }, []);

  const sendBack = async (): Promise<void> => {
    if (note.trim() === '' || busy) return;
    setBusy(true);
    setRefusal(null);
    const outcome = await rejectReport(report.id, { version: report.version, note: note.trim() });
    setBusy(false);
    if (outcome.kind === 'ok') {
      await refresh();
      onDone();
      return;
    }
    if (outcome.kind === 'refused' && READ_AGAIN.has(outcome.code)) await refresh();
    setRefusal(outcome);
  };

  return (
    <form
      className="rp-review__refuse nv-enter"
      onSubmit={(event) => {
        event.preventDefault();
        void sendBack();
      }}
    >
      <label className="nv-field__label" htmlFor={`${id}-note`}>
        Ce que {memberName ?? 'le membre'} doit revoir
      </label>
      <textarea
        ref={field}
        id={`${id}-note`}
        className="nv-field__control nv-glass sc-note"
        rows={2}
        maxLength={500}
        value={note}
        placeholder="Le montant ne correspond pas à Reveal, il manque un pourboire…"
        onChange={(event) => {
          setNote(event.target.value);
        }}
      />
      {refusal === null ? null : (
        <p className="tm-warn" role="alert">
          {refusal.kind === 'failed'
            ? 'Le serveur ne répond pas : rien n’a été envoyé.'
            : REPORT_ERRORS[refusal.code]}
        </p>
      )}
      <div className="rp-review__acts">
        <button type="button" className="nv-btn nv-btn--plain nv-btn--sm" disabled={busy} onClick={onDone}>
          Annuler
        </button>
        <button
          type="submit"
          className="nv-btn nv-btn--soft nv-btn--sm"
          disabled={note.trim() === '' || busy}
          aria-busy={busy}
        >
          {busy ? 'Envoi…' : 'Renvoyer avec ce mot'}
        </button>
      </div>
    </form>
  );
}

/** A period member by member: what each made, validated or not, and the shifts still without a report. */
function PeriodPanel({
  period,
  current,
  list,
  isError,
  onRetry,
  zone,
  onPeriod,
  onCorrect,
}: {
  period: PayPeriod | null;
  current: PayPeriod | null;
  list: ShiftReportList | undefined;
  isError: boolean;
  onRetry: () => void;
  zone: string;
  onPeriod: (period: PayPeriod | null) => void;
  onCorrect: (line: ShiftLine, memberName: string) => void;
}): JSX.Element {
  const nav =
    period === null ? null : (
      <div className="sc-week" role="group" aria-label="Quinzaine">
        <button
          type="button"
          className="sc-arrow"
          aria-label="Quinzaine précédente"
          onClick={() => {
            onPeriod(previousPeriod(period));
          }}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="m10 3.5-4.5 4.5 4.5 4.5" />
          </svg>
        </button>
        <p className="sc-week__label nv-swap" key={period} aria-live="polite">
          {periodTitle(period)}
        </p>
        <button
          type="button"
          className="sc-arrow"
          aria-label="Quinzaine suivante"
          disabled={current !== null && period >= current}
          onClick={() => {
            onPeriod(followingPeriod(period));
          }}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="m6 3.5 4.5 4.5-4.5 4.5" />
          </svg>
        </button>
        {current !== null && period !== current ? (
          <button
            type="button"
            className="nv-btn nv-btn--plain nv-btn--sm sc-week__back nv-swap"
            onClick={() => {
              onPeriod(null);
            }}
          >
            Cette quinzaine
          </button>
        ) : null}
      </div>
    );

  if (isError) {
    return (
      <Panel className="rp-period" eyebrow="Quinzaine" actions={nav}>
        <div className="rp-sec">
          <div className="sc-empty">
            <p className="tm-warn">Le serveur ne répond pas : la quinzaine n’a pas pu être lue.</p>
            <button type="button" className="nv-btn nv-btn--soft nv-btn--sm" onClick={onRetry}>
              Réessayer
            </button>
          </div>
        </div>
      </Panel>
    );
  }
  if (list === undefined || period === null) {
    return (
      <Panel className="rp-period" eyebrow="Quinzaine" actions={nav}>
        <div className="rp-sec">
          <div className="sc-skeleton sc-skeleton--short" aria-hidden="true">
            <i />
            <i />
          </div>
        </div>
      </Panel>
    );
  }

  const names = namesOf(list);
  const lines = linesOf(list);
  const byMember = new Map<string, ShiftLine[]>();
  for (const line of lines)
    byMember.set(line.shift.memberId, [...(byMember.get(line.shift.memberId) ?? []), line]);
  const members = [...byMember.keys()].toSorted((a, b) =>
    (names.members.get(a)?.displayName ?? '').localeCompare(names.members.get(b)?.displayName ?? '', 'fr'),
  );

  return (
    <Panel className="rp-period nv-enter" eyebrow="Quinzaine" actions={nav}>
      <div className="rp-sec">
        {members.length === 0 ? (
          <p className="rp-mine__empty">Aucun shift fini sur cette quinzaine pour l’instant.</p>
        ) : (
          <div className="rp-members">
            {members.map((memberId, index) => (
              <MemberPeriod
                key={memberId}
                index={index}
                member={names.members.get(memberId)}
                lines={byMember.get(memberId) ?? []}
                reports={list.reports.filter((one) => one.memberId === memberId)}
                accounts={names.accounts}
                zone={zone}
                onCorrect={onCorrect}
              />
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}

function MemberPeriod({
  index,
  member,
  lines,
  reports,
  accounts,
  zone,
  onCorrect,
}: {
  index: number;
  member: PlanningMember | undefined;
  lines: readonly ShiftLine[];
  reports: readonly ShiftReport[];
  accounts: ReadonlyMap<string, PlanningAccount>;
  zone: string;
  onCorrect: (line: ShiftLine, memberName: string) => void;
}): JSX.Element {
  const name = member?.displayName ?? 'Un membre';
  const missing = lines.filter((line) => line.report === null).length;
  const sums = periodSums(reports);
  const waiting = reports.filter((one) => one.status === 'submitted').length;
  const sentBack = reports.filter((one) => one.status === 'rejected').length;
  // What the member's period holds, said only where there is something: « 210,00 € validés · 1 à valider ».
  const summary = [
    ...sums
      .filter((sum) => sum.validatedMinor !== 0)
      .map((sum) => `${amountText(sum.validatedMinor, sum.currency)} validés`),
    waiting === 0 ? null : `${String(waiting)} à valider`,
    sentBack === 0 ? null : `${String(sentBack)} renvoyé${sentBack > 1 ? 's' : ''}`,
    missing === 0 ? null : `${String(missing)} sans rapport`,
  ]
    .filter((part) => part !== null)
    .join(' · ');
  return (
    <details className="nv-disclosure rp-member nv-enter" style={{ '--nv-i': Math.min(index, 8) }}>
      <summary>
        <span className="sc-swatch" style={swatchOf(member)} aria-hidden="true" />
        <span className="nv-disclosure__title">{name}</span>
        <span className="nv-disclosure__sum" data-warn={missing > 0 ? 'true' : undefined}>
          {summary}
        </span>
      </summary>
      <ul className="nv-disclosure__body rp-lines">
        {lines.map((line) => {
          const { report } = line;
          const account = accounts.get(line.shift.platformAccountId);
          return (
            <li key={line.shift.id} className="rp-pline" data-missing={report === null ? 'true' : undefined}>
              <span className="rp-pline__when nv-num">
                {swapShiftLine(line.shift.startsAt, line.shift.endsAt, account?.creatorName, zone)}
              </span>
              {report === null ? (
                <span className="rp-chip rp-chip--warn">Sans rapport</span>
              ) : (
                <>
                  <span className="rp-pline__amount nv-num">
                    {amountText(
                      report.status === 'validated' ? line.validatedMinor : report.amount.amountMinor,
                      report.amount.currency,
                    )}
                    {line.corrections.length === 0 ? null : (
                      <span className="rp-pline__fix">
                        {' '}
                        dont {line.corrections.length} correction{line.corrections.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </span>
                  <span className={`rp-chip rp-chip--${STATUS_TONES[report.status]}`}>
                    {AGENCY_STATUS[report.status]}
                  </span>
                  {report.status === 'validated' ? (
                    <button
                      type="button"
                      className="nv-btn nv-btn--plain nv-btn--sm rp-pline__fix-btn"
                      onClick={() => {
                        onCorrect(line, name);
                      }}
                    >
                      Corriger
                    </button>
                  ) : null}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
