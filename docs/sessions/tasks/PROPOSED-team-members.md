# Équipe : membres, rôles d'équipe, paramètres de paie des plateformes (ID à proposer)
Statut : proposed (lot 1 de l'ADR 0023, ID à valider par Charles)
Phase : équipe (ADR 0023)
Dépend de : ADR 0023 acceptée
Branche : task/<id>-team-members

## Objectif
Pouvoir inviter un nouveau chatteur ou un manager, lui donner ses créatrices et son taux de commission, et le voir dans l'onglet Équipe > Membres.

## Contexte à lire
`docs/adr/0023-team-management.md`, `docs/architecture/data-model.md` (§ RLS, tables Better Auth), `docs/architecture/modules.md`, `docs/conventions/security.md`, `docs/design/README.md`, ADR 0011. Concept d'origine : fiches chatteurs d'Imperium (`docs/reference/legacy-projects.md`).

## À faire
- [ ] Contrats : `TeamMemberSchema` (rôle d'équipe `chatter` | `manager`, pays, fuseau, statut `active` | `paused` | `left`, taux de commission en points de base, part du net de l'équipe pour un manager). Rémunération à la commission seulement, comme dans Imperium : pas de taux horaire (ADR 0023).
- [ ] Base (via le propriétaire de `packages/db`, migration à partir de 0015, une par PR) : table `team_members` liée à `user` ; `withMember` qui fixe `app.user_id` et `app.team_scope` (`self` | `agency`) calculé par le serveur dans la même transaction, jamais lu dans la requête ; politiques fermées par défaut (réglage absent ou nul = aucune ligne). Paramètres de paie d'une plateforme (TVA, commission, devise) et part de l'agence par créatrice : colonnes ou réglages validés par Zod, avec historique daté (un changement s'applique à partir d'une date, jamais en arrière).
- [ ] Module `team` : créer un membre (envoie l'invitation Better Auth), modifier, mettre en pause, marquer parti (jamais supprimé ; `creator_ids` vidé et sessions révoquées dans la même transaction), `creator_ids` mis à jour dans la même transaction, `audit_log` pour chaque écriture.
- [ ] Routes sous `/v1/team/members` : propriétaire et manager lisent tout, un chatteur lit sa fiche ; seul le propriétaire change un taux.
- [ ] Écran Équipe > Membres (avec le fil propriétaire d'`apps/web`) : liste, fiche, invitation, état vide honnête ; design system, aucune durée en dur.

## Critères d'acceptation
- Tests du domaine : un taux hors bornes est refusé, un changement de taux ne touche pas une date passée, un membre parti ne reçoit plus de shift.
- Tests d'intégration RLS : un chatteur ne lit ni la fiche ni les taux d'un autre ; sans `withMember`, aucune ligne ; un manager mis en pause repasse en scope `self` ; un membre marqué parti ne peut plus rien lire avec sa session d'avant.
- Aucun vrai prénom ni coordonnée bancaire dans les tests (ADR 0010) ; coordonnées bancaires hors de ce lot.

## Hors périmètre
Planning, rapports, paie, dossier prestataire et factures, import d'Imperium.

## Notes de session
