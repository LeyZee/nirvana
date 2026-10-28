import { useId, useState, type JSX } from 'react';

import { setPayrollSettings, usePayrollSettings, useRefreshPayroll, type PayRefusal } from '@/payroll/api';
import { payRefusalText } from '@/payroll/model';
import '@/payroll/pay.css';
import { amountInput, amountText, parseAmount } from '@/reports/model';
import { Dialog } from '@/screens/team/Dialog';

const STEPS = ['Remplir', 'Relire'] as const;

/**
 * The payout minimum in Réglages › Règles de paie (EQ-05, owner): below it a statement pays nothing and carries its
 * total over. A change applies to the statements not validated yet; a member's final statement has none.
 */
export function MinimumPayout(): JSX.Element {
  const settings = usePayrollSettings();
  const [open, setOpen] = useState(false);
  const minimum = settings.data?.minimumPayoutMinor;

  return (
    <div className="nv-plate rp-account nv-enter">
      <div className="rp-account__head">
        <div className="rp-account__who">
          <p className="rp-account__name">Minimum de versement</p>
          <p className="rp-account__handle">pour toute l’équipe</p>
        </div>
        {minimum === undefined ? null : (
          <button
            type="button"
            className="nv-btn nv-btn--soft nv-btn--sm"
            onClick={() => {
              setOpen(true);
            }}
          >
            Changer
          </button>
        )}
      </div>
      {minimum === undefined ? (
        settings.isError ? (
          <div className="rp-account__now">
            <p className="tm-warn">Le serveur ne répond pas : le minimum n’a pas pu être lu.</p>
            <button
              type="button"
              className="nv-btn nv-btn--soft nv-btn--sm tm-self-start"
              onClick={() => {
                void settings.refetch();
              }}
            >
              Réessayer
            </button>
          </div>
        ) : (
          <div className="sc-skeleton" aria-hidden="true">
            <i />
          </div>
        )
      ) : (
        <div className="rp-account__now">
          <span className="rp-chip rp-chip--ok">En vigueur</span>
          <p className="rp-account__rules nv-num">
            {minimum === 0 ? 'Aucun minimum' : amountText(minimum, 'EUR')}
          </p>
          <p className="rp-account__since">
            Sous ce total, un relevé ne verse rien et reporte tout sur la quinzaine suivante. Un changement
            s’applique aux relevés pas encore validés ; le relevé final d’un membre qui part verse tout.
          </p>
        </div>
      )}
      {open && minimum !== undefined ? (
        <MinimumDialog
          minimum={minimum}
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function MinimumDialog({ minimum, onClose }: { minimum: number; onClose: () => void }): JSX.Element {
  const id = useId();
  const refresh = useRefreshPayroll();
  const [amount, setAmount] = useState(amountInput(minimum));
  const [touched, setTouched] = useState(false);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<PayRefusal | null>(null);
  const minor = parseAmount(amount);
  const step = checking ? 1 : 0;

  const send = async (): Promise<void> => {
    if (minor === null || busy) return;
    setBusy(true);
    setRefusal(null);
    const outcome = await setPayrollSettings({ minimumPayoutMinor: minor });
    setBusy(false);
    await refresh();
    if (outcome.kind === 'ok') {
      onClose();
      return;
    }
    setRefusal(outcome);
    setChecking(false);
  };

  return (
    <Dialog title="Minimum de versement" lead="Pour toute l’équipe" busy={busy} onClose={onClose}>
      <div className="tm-dialog__body">
        <ol className="tm-steps" aria-label="Étapes">
          {STEPS.map((title, index) => (
            <li
              key={title}
              data-state={index < step ? 'done' : index === step ? 'now' : 'later'}
              aria-current={index === step ? 'step' : undefined}
            >
              <span className="tm-steps__num">{String(index + 1)}</span>
              {title}
            </li>
          ))}
        </ol>
        {checking && minor !== null ? (
          <>
            <p className="py-recap nv-enter">
              {minor === 0 ? (
                <>
                  <b>Aucun minimum</b> : chaque relevé verse son total, même petit.
                </>
              ) : (
                <>
                  Sous <b className="nv-num">{amountText(minor, 'EUR')}</b>, un relevé ne verse rien et
                  reporte son total sur la quinzaine suivante.
                </>
              )}
            </p>
            <p className="tm-hint">
              {`Les relevés pas encore validés sont recalculés ; ceux déjà validés gardent le minimum d’avant, ${amountText(minimum, 'EUR')}.`}
            </p>
            <div className="tm-dialog__foot">
              <button
                type="button"
                className="nv-btn nv-btn--plain"
                disabled={busy}
                onClick={() => {
                  setChecking(false);
                }}
              >
                Modifier
              </button>
              <button
                type="button"
                className="nv-btn nv-btn--neon"
                data-autofocus
                disabled={busy}
                aria-busy={busy}
                onClick={() => {
                  void send();
                }}
              >
                {busy ? 'Enregistrement…' : 'Enregistrer le minimum'}
              </button>
            </div>
          </>
        ) : (
          <form
            className="tm-dialog__body"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              setTouched(true);
              if (minor !== null) setChecking(true);
            }}
          >
            <div className="nv-field rp-amount" data-invalid={touched && minor === null ? 'true' : undefined}>
              <label className="nv-field__label" htmlFor={`${id}-minimum`}>
                Minimum
              </label>
              <div className="rp-amount__box">
                <input
                  id={`${id}-minimum`}
                  className="nv-field__control nv-glass rp-amount__input nv-num"
                  inputMode="decimal"
                  autoComplete="off"
                  value={amount}
                  data-autofocus
                  aria-invalid={touched && minor === null}
                  onChange={(event) => {
                    setAmount(event.target.value);
                  }}
                />
                <span className="rp-amount__sign" aria-hidden="true">
                  €
                </span>
              </div>
              <p className={touched && minor === null ? 'tm-hint tm-hint--error' : 'tm-hint'}>
                {touched && minor === null
                  ? 'Un montant en euros, deux décimales au plus.'
                  : 'À 0, chaque relevé verse son total, même petit.'}
              </p>
            </div>
            {refusal === null ? null : (
              <p className="tm-warn sc-refusal nv-swap" role="alert">
                {payRefusalText(refusal, { memberName: () => 'Un membre' })}
              </p>
            )}
            <div className="tm-dialog__foot">
              <button type="button" className="nv-btn nv-btn--plain" onClick={onClose}>
                Annuler
              </button>
              <button type="submit" className="nv-btn nv-btn--neon">
                Vérifier
              </button>
            </div>
          </form>
        )}
      </div>
    </Dialog>
  );
}
