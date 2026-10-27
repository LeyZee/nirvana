import type { CommissionPreset, CreatorSummary, TeamMember } from '@nirvana/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type JSX } from 'react';

import { ShareLink } from './ShareLink';
import { addNote, useNotes } from './api';
import {
  creatorNames,
  deadline,
  ERROR_MESSAGES,
  formatRate,
  invitationState,
  longDay,
  ROLE_LABELS,
} from './model';
import { Avatar, StatusPill } from './parts';

import { localTime } from '@/creators/persona/model';
import { countryFlag, countryName } from '@/lib/country';

/** Arrived less than this many days ago: the « Nouveau » badge of Imperium. */
const NEW_DAYS = 30;
const DAY_MS = 86_400_000;

/**
 * One member, read on the right of the list: who he is and where (his own hour), his creators, his rate, his first
 * access, and the internal notes the member himself never reads.
 */
export function MemberSheet({
  member,
  presets,
  creators,
  canManage,
  isSelf,
  onClose,
}: {
  member: TeamMember;
  presets: readonly CommissionPreset[];
  creators: readonly CreatorSummary[];
  canManage: boolean;
  /** His own record: the notes about him are never his to read (the server answers 403). */
  isSelf: boolean;
  onClose: () => void;
}): JSX.Element {
  const now = new Date();
  const theirs = creatorNames(member, creators);
  const arrivedDays = (now.getTime() - new Date(`${member.joinedOn}T12:00:00`).getTime()) / DAY_MS;
  const preset = presets.find((p) => p.id === member.commission?.presetId);
  const access = invitationState(member, now);
  const gone = member.status === 'left';
  const share = member.commission?.teamShareBps ?? null;

  return (
    <section className="nv-plate tm-sheet nv-enter" aria-label={member.displayName}>
      <button type="button" className="nv-btn nv-btn--plain nv-btn--sm tm-back" onClick={onClose}>
        Équipe
      </button>
      <header className="tm-sheet__head">
        <Avatar member={member} large />
        <div className="tm-sheet__who">
          <h2>{member.displayName}</h2>
          <p>
            {member.firstName} {member.lastName} · {ROLE_LABELS[member.teamRole]}
            {arrivedDays >= 0 && arrivedDays < NEW_DAYS ? <span className="tm-new">Nouveau</span> : null}
          </p>
          <StatusPill member={member} />
        </div>
        <button type="button" className="tm-close" aria-label="Fermer la fiche" onClick={onClose}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="m4 4 8 8M12 4l-8 8" />
          </svg>
        </button>
      </header>

      <div className="tm-figures">
        <div className="tm-figure nv-enter" style={{ '--nv-i': 1 }}>
          <span className="nv-figure__label">Commission</span>
          <span className="tm-figure__value">
            {member.commission === null ? '—' : formatRate(member.commission.rateBps)}
          </span>
          <span className="tm-figure__note">
            {member.commission === null
              ? 'Pas encore de taux'
              : `${preset === undefined ? 'Taux à la main' : preset.name} · depuis le ${longDay(member.commission.effectiveFrom)}`}
          </span>
        </div>
        <div className="tm-figure nv-enter" style={{ '--nv-i': 2 }}>
          <span className="nv-figure__label">Chez lui</span>
          <span className="tm-figure__value">{localTime(member.timeZone, now)}</span>
          <span className="tm-figure__note">
            <span aria-hidden="true">{countryFlag(member.country)} </span>
            {countryName(member.country)}
          </span>
        </div>
        {share === null ? null : (
          <div className="tm-figure nv-enter" style={{ '--nv-i': 3 }}>
            <span className="nv-figure__label">Part de l’équipe</span>
            <span className="tm-figure__value">{formatRate(share)}</span>
            <span className="tm-figure__note">du net de l’équipe</span>
          </div>
        )}
      </div>

      <dl className="tm-facts nv-enter" style={{ '--nv-i': 3 }}>
        <div>
          <dt>Créatrices</dt>
          <dd>
            {theirs.length === 0 ? (
              <span className="tm-muted">Aucune créatrice confiée</span>
            ) : (
              <span className="nv-tags">
                {theirs.map((creator) => (
                  <span key={creator} className="nv-tag nv-tag--declared">
                    {creator}
                  </span>
                ))}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt>E-mail</dt>
          <dd className="tm-mail">{member.email}</dd>
        </div>
        <div>
          <dt>Fuseau</dt>
          <dd>{member.timeZone.replaceAll('_', ' ')}</dd>
        </div>
        <div>
          <dt>Arrivé le</dt>
          <dd>{longDay(member.joinedOn)}</dd>
        </div>
      </dl>

      {gone ? null : (
        <section className="tm-block nv-enter" style={{ '--nv-i': 4 }} aria-label="Accès">
          <h3>Accès</h3>
          <p className="tm-hint">
            {access.kind === 'signed-in'
              ? 'Son mot de passe est choisi. S’il l’oublie, envoie-lui un lien pour en choisir un nouveau.'
              : access.kind === 'reset-sent'
                ? `Son mot de passe est choisi. Un lien pour en choisir un nouveau lui a été envoyé : il marche jusqu’à ${deadline(access.until)}.`
                : access.kind === 'valid'
                  ? `Invitation envoyée, pas encore ouverte. Le lien marche jusqu’à ${deadline(access.until)}.`
                  : access.kind === 'expired'
                    ? 'Son lien d’invitation a expiré sans être ouvert. Crée-lui un nouveau lien.'
                    : 'Il n’a pas encore de lien pour choisir son mot de passe.'}
          </p>
          {canManage ? (
            <ShareLink
              // The member alone: re-reading the list after a link changes `access.kind`, and the link made must stay.
              key={member.id}
              memberId={member.id}
              name={member.displayName}
              purpose={access.kind === 'signed-in' || access.kind === 'reset-sent' ? 'reset' : 'invitation'}
              label={
                access.kind === 'signed-in'
                  ? 'Lien de nouveau mot de passe'
                  : access.kind === 'no-link'
                    ? 'Créer son lien'
                    : access.kind === 'expired'
                      ? 'Nouveau lien'
                      : 'Remplacer le lien'
              }
            />
          ) : null}
        </section>
      )}

      {isSelf ? null : <Notes memberId={member.id} name={member.displayName} />}
    </section>
  );
}

const NOTE_DAY = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

/** The internal notes: newest first, written by the owner and the active managers, never shown to the member. */
function Notes({ memberId, name }: { memberId: string; name: string }): JSX.Element {
  const client = useQueryClient();
  const notes = useNotes(memberId);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const save = async (): Promise<void> => {
    const body = draft.trim();
    if (body === '' || busy) return;
    setBusy(true);
    setProblem(null);
    const outcome = await addNote(memberId, body);
    setBusy(false);
    if (outcome.kind === 'ok') {
      setDraft('');
      await client.invalidateQueries({ queryKey: ['team', 'notes', memberId] });
    } else {
      setProblem(
        outcome.kind === 'refused'
          ? ERROR_MESSAGES[outcome.code]
          : 'La note n’a pas été enregistrée : le serveur ne répond pas.',
      );
    }
  };

  const list = notes.data ?? [];
  return (
    <section className="tm-block nv-enter" style={{ '--nv-i': 5 }} aria-label="Notes internes">
      <h3>Notes internes</h3>
      <p className="tm-hint">Lues par toi et les managers, jamais par {name}.</p>
      {notes.isError ? (
        <p className="tm-warn">Les notes n’ont pas pu être lues.</p>
      ) : list.length === 0 ? null : (
        <ul className="tm-notes">
          {list.map((note, i) => (
            <li key={note.id} className="nv-enter" style={{ '--nv-i': i + 1 }}>
              <p>{note.body}</p>
              <span className="tm-note__by">
                {note.authorName} · {NOTE_DAY.format(new Date(note.createdAt))}
              </span>
            </li>
          ))}
        </ul>
      )}
      <form
        className="tm-note-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <textarea
          className="nv-field__control nv-glass tm-note-input"
          value={draft}
          rows={2}
          maxLength={2000}
          placeholder="Une note pour l’équipe de direction"
          aria-label="Nouvelle note"
          onChange={(event) => {
            setDraft(event.target.value);
          }}
        />
        <button
          type="submit"
          className="nv-btn nv-btn--soft nv-btn--sm tm-self-end"
          disabled={draft.trim() === '' || busy}
          aria-busy={busy}
        >
          {busy ? 'Enregistrement…' : 'Ajouter la note'}
        </button>
      </form>
      {problem === null ? null : (
        <p className="tm-warn nv-swap" role="alert">
          {problem}
        </p>
      )}
    </section>
  );
}
