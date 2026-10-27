# EQ-01 Équipe : membres, pays, commission, paramètres de paie des plateformes
Statut : todo (lot 1 de l'ADR 0023, ID validé par Charles le 27/10/2026 ; la carte de navigation est validée avant la première PR d'écran)
Phase : équipe (ADR 0023)
Dépend de : ADR 0023 ; carte de navigation validée pour l'écran
Branche : task/eq-01-team-members

## Objectif
Ajouter un chatteur ou un manager avec tout ce qu'Imperium savait de lui (pays, commission, statut, notes…), lui donner ses créatrices, et retrouver toute l'équipe dans Équipe > Membres, en plus clair et plus beau qu'Imperium.

## Contexte à lire
`docs/adr/0023-team-management.md`, `docs/architecture/data-model.md` (§ RLS, tables Better Auth), `docs/architecture/modules.md`, `docs/conventions/security.md`, `docs/design/README.md`, ADR 0011. Concept d'origine : la gestion des chatteurs d'Imperium (`docs/reference/legacy-projects.md`) : Charles (27/10) veut garder tout ce qui y était utile et laisser le reste.

## À faire
- [ ] Contrats : `TeamMemberSchema`, avec les champs utiles d'Imperium :
  - identité : prénom, nom, nom affiché dans l'équipe, e-mail (identifiant et invitation), photo ;
  - rôle d'équipe `chatter` | `manager` ;
  - **pays** obligatoire (code ISO 3166, liste complète avec Bénin, Madagascar et France en tête) ; il décide du fuseau proposé (modifiable) et, en EQ-06, du régime de facturation ;
  - taux de commission en points de base, choisi parmi des **préréglages nommés** (`commission_preset`, réglés par le propriétaire, valeurs jamais dans le code) ou saisi à la main ; part du net de l'équipe pour un manager ;
  - statut d'Imperium : `active` | `on_leave` | `sick` | `travelling` | `suspended` | `left` ;
  - couleur (planning), badge « nouveau » et date d'arrivée ;
  - notes internes datées, lues par le propriétaire et les managers seulement.
  Rémunération à la commission seulement, comme dans Imperium : pas de taux horaire (ADR 0023).
- [ ] Rôle manager : pas de nouveau rôle d'accès (ADR 0023 § Rôles et Alternatives rejetées) ; un manager est un `operator` dont le rôle d'équipe est `manager`, et c'est ce rôle d'équipe, actif, qui donne au serveur le scope `agency`. Ce qu'il peut en plus d'un chatteur, écrit dans le code et testé :
  - lire toute l'équipe (fiches, statuts, notes internes) ;
  - faire le planning de l'équipe, accepter ou refuser congés et échanges (EQ-02) ;
  - valider ou renvoyer un rapport de fin de shift (EQ-03) ;
  - mener une paie jusqu'à « validée » et poser primes et malus avec motif (EQ-05) ;
  - publier une annonce à l'équipe.
  Ce qu'il ne peut pas : changer un taux ou un préréglage de commission, marquer une paie « payée », émettre ou annuler une facture, ouvrir Entraîner, la persona, les clés ou les Réglages de l'agence.
- [ ] Laissés d'Imperium : taux horaire, identifiant Telegram, mot de passe saisi par l'admin (l'invitation Better Auth le remplace), matrice de permissions par page, rôles `va`, `admin` et `directeur` (le directeur est le propriétaire).
- [ ] Base (via le propriétaire de `packages/db`, migration à partir de 0015, une par PR) : table `team_members` liée à `user` ; `withMember` qui fixe `app.user_id` et `app.team_scope` (`self` | `agency`) calculé par le serveur dans la même transaction, jamais lu dans la requête ; politiques fermées par défaut (réglage absent ou nul = aucune ligne). Paramètres de paie d'une plateforme (TVA, commission, devise) et part de l'agence par créatrice : colonnes ou réglages validés par Zod, avec historique daté (un changement s'applique à partir d'une date, jamais en arrière).
- [ ] Module `team` : créer un membre (envoie l'invitation Better Auth), modifier, changer de statut, marquer parti (jamais supprimé ; `creator_ids` vidé et sessions révoquées dans la même transaction), `creator_ids` mis à jour dans la même transaction, `audit_log` pour chaque écriture.
- [ ] Routes sous `/v1/team/members` : propriétaire et manager lisent tout, un chatteur lit sa fiche ; seul le propriétaire change un taux.
- [ ] Écrans (avec le fil propriétaire d'`apps/web`, à la place que fixe la carte de navigation) : liste avec recherche, onglets chatteurs et managers, statut en pastille, préréglage de commission visible ; fiche détaillée (progression des paliers et ventes par créatrice et par plateforme quand EQ-03 et EQ-04 existent, notes internes) ; ajout en un panneau (pays en liste avec drapeau, préréglage de commission en un geste, aperçu du fuseau) ; état vide honnête. Design system, animations de ses jetons, aucune durée en dur.

## Critères d'acceptation
- Tests du domaine : un taux hors bornes est refusé, un changement de taux ne touche pas une date passée, un membre parti ne reçoit plus de shift, un pays inconnu est refusé, le fuseau proposé suit le pays.
- Tests d'intégration RLS : un chatteur ne lit ni la fiche ni les taux d'un autre ; un manager lit l'équipe mais un changement de taux par un manager est refusé ; sans `withMember`, aucune ligne ; un manager mis en pause repasse en scope `self` ; un membre marqué parti ne peut plus rien lire avec sa session d'avant.
- Aucun vrai prénom ni coordonnée bancaire dans les tests (ADR 0010) ; coordonnées bancaires hors de ce lot.

## Hors périmètre
Planning, rapports, paie, dossier prestataire et factures, import d'Imperium.

## Notes de session
