# Module `team`

**Rôle.** Équipe › Membres (EQ-01, ADR 0023, ADR 0024) : les chatteurs et les managers, leur pays, leur statut, leurs créatrices, leur commission datée, les préréglages de commission et les notes internes.

**Peut dépendre de.** aucun module métier (feuille). Deux ports, branchés par le composition root : les créatrices qui existent, venues du module `persona` (`CreatorRoster`), et le lien en cours de chaque membre, lu dans la table des liens d'EQ-10 (`InvitationLinkDirectory`).

**Tables possédées.** `team_members`, `team_member_notes`, `commission_presets`, `member_commission_rates`. Toutes passent par `withMember` : la base décide de ce que lit chaque scope (`owner`, `agency` pour un manager `active`, `self` pour les autres). Hors RLS, et dans la même transaction que la fiche : il écrit dans `user` le compte d'un nouveau membre (sans mot de passe, rôle `operator`), son nom et ses créatrices ; il lit `account` pour savoir si le mot de passe est choisi ; il supprime les lignes de `session` d'un membre qui part. Ces tables restent celles de Better Auth (`auth.ts`).

**Règles propres** (`domain/members.ts`, testées) :

- un taux ou un préréglage commence aujourd'hui au plus tôt, dans le fuseau de l'agence (Europe/Paris tant que l'agence n'a pas son réglage), sauf le premier taux d'un membre, qui commence le jour de son arrivée ;
- un taux n'est jamais modifié : un nouveau taux est une nouvelle ligne, une par membre et par jour ;
- seul un manager a une part du net de l'équipe ;
- un membre parti ne change plus ; partir vide ses créatrices et ferme ses sessions dans la même transaction (le reste du départ est EQ-14) ;
- les notes internes et les préréglages se lisent par le propriétaire et les managers actifs, jamais par le membre dont parle la note : refusé (403) plutôt qu'une liste vide.

**Routes** (`routes(requireRole)`, montées sous `/v1`, contrats `packages/contracts/src/team-members.ts`) :

- lecture pour le propriétaire et les comptes de l'équipe, jamais pour une créatrice : `GET /team/members`, `GET /team/members/:memberId`, `GET /team/members/:memberId/commission`, `GET /team/commission-presets`, `GET /team/members/:memberId/notes` ;
- écriture par le propriétaire seul : `POST /team/members`, `PATCH /team/members/:memberId`, `PUT /team/members/:memberId/status`, `POST /team/members/:memberId/commission`, `POST /team/commission-presets` ;
- notes : `POST /team/members/:memberId/notes` par le propriétaire et les managers actifs.

Chaque écriture entre au journal (`audit_log`) sans nom, e-mail ni texte de note. Le lien d'invitation d'un membre (EQ-10) a son propre serveur (`apps/api/src/invitation-links.ts`) : le module ne touche pas à sa table. Il en reçoit seulement, par `InvitationLinkDirectory`, la date où le lien en cours cesse de marcher (`invitationExpiresAt`, même passée, pour « Lien expiré ») ; `null` quand aucun lien n'est en cours (jamais créé, ou déjà utilisé). Un lien de nouveau mot de passe compte aussi : le propriétaire le voit en cours au lieu d'en créer un second qui l'annulerait.

## Structure

- `domain/` : règles pures, erreurs, ports. Zéro I/O.
- `application/` : le service de l'équipe (lectures, écritures, résolution d'un préréglage en taux).
- `infra/` : le magasin Drizzle (`withMember`) et les routes Fastify.
- `index.ts` : **seule** porte d'entrée publique du module.

Voir `docs/architecture/modules.md` pour les règles communes.
