# Module `scheduling`

**Rôle.** Équipe › Planning et Aujourd'hui (EQ-02, ADR 0023, ADR 0024, ADR 0025) : qui chatte sur quel compte de quelle créatrice et quand, les modèles de shift de chaque semaine, et « qui est en poste » à un instant donné.

**Peut dépendre de.** aucun module métier (feuille). Un port, branché par le composition root : les créatrices qui existent et leurs noms, venus du module `persona` (`CreatorDirectory`).

**Tables possédées.** `scheduling_settings`, `shift_templates`, `shifts` (migration 0021), `leave_requests` et `shift_swap_requests` (migration 0023, ADR 0031). Elles passent par `withMember` et `withTenantMember` : la base décide de ce que lit chaque scope (`owner`, `agency` pour un manager `active`, `self` pour les autres). Un lecteur de plusieurs créatrices les parcourt dans une seule transaction, en changeant `app.creator_id` (`enterCreator`, `SET LOCAL`, contre la liste des créatrices qui existent). Lus sous les mêmes politiques : `platform_accounts` (le compte est bien celui de la créatrice), `team_members` et `user` (statut et créatrices d'un membre).

**Connexion admin, pour ce qui traverse les créatrices seulement** (`*Unscoped`) : les shifts d'un membre sur toutes ses créatrices (Aujourd'hui), la créatrice d'un shift ou d'un modèle avant d'y entrer, le shift qui barre la route dans un conflit (il peut être chez une autre créatrice), `onShift` et le job des modèles.

**Congés et échanges** (ADR 0031, routes à venir avec la PR du module) : deux lectures `*Unscoped`, bornées, que les politiques ne peuvent pas porter sans ouvrir plus qu'il ne faut :
- les noms des collègues : `team_members` ne laisse lire au chatteur que sa propre ligne, et une politique ouvrirait toute la ligne d'un collègue (taux, pays, statut), puisque la RLS choisit des lignes et pas des colonnes. Le service lit d'abord les échanges sous les politiques (le lecteur en est l'un des deux membres, ou planifie), puis l'identifiant, le nom affiché et la couleur, rien d'autre, des membres que nomment ces échanges ;
- les candidats d'un échange (`GET /scheduling/swap-candidates`) : le service vérifie sous les politiques que le shift est celui du lecteur et n'a pas commencé, puis lit les membres actifs qui travaillent sur sa créatrice, sauf ceux qu'un congé couvre à ces heures (le congé n'est jamais rendu, seulement son effet), avec leurs shifts à venir dans l'horizon des modèles sur les créatrices du lecteur, et les comptes de ces shifts.
Ces routes viennent avec un test d'intégration chacune : un chatteur lit le nom et la couleur d'un collègue de sa créatrice, et rien d'autre de sa ligne.

**Règles propres** (`domain/`, testées) :
- un shift est l'intervalle [début, fin) en UTC, à la minute pile, de 24 h au plus, et finit après maintenant ;
- un membre n'est jamais sur deux shifts à la fois, un compte n'a jamais deux membres à la fois : la base le décide (contraintes d'exclusion), le module répond 409 avec le shift qui barre la route ;
- aucun shift ne se pose sur un membre pendant son congé validé (ADR 0031) : ni à la main, ni en déplaçant un shift, ni par un modèle (409 `member_on_leave_conflict` avec le congé) ; un congé annulé couvre jusqu'à son annulation, rien s'il n'avait pas commencé. Chaque chemin qui pose un shift sur un membre prend d'abord son verrou (`pg_advisory_xact_lock` sur `scheduling.member:<id>`), avant toute ligne, et lit ses congés sous ce verrou : un congé validé au même moment ne passe pas à côté ;
- un shift fini ne change plus ; un shift en cours ne fait que finir plus tôt, s'arrêter à la minute de la demande (`stoppedAt`, sans marge de fin) ou s'annuler ; la base tient la même règle pour tous les rôles ;
- un modèle parle en heures murales du fuseau de la grille : un créneau garde ses heures au changement d'heure (5 ou 7 h cette nuit-là) ; une heure du trou de printemps devient le premier instant après, une heure vécue deux fois en automne devient la première ;
- un modèle fait ses shifts quatre semaines à l'avance, une seule fois chacun (clé `(template_id, template_starts_at)`, annulés compris) ; une occurrence qui chevaucherait un autre shift n'est pas faite (sautée dans son propre point de sauvegarde : l'exclusion du membre est reportable depuis la migration 0023 et n'arbitre plus un `ON CONFLICT`), et le planning la montre dans `conflicts` ; une occurrence pendant le congé de son membre n'est pas faite non plus, et le planning la montre comme un shift à pourvoir (`member_on_leave`) ;
- un modèle ne fait plus de shift pour un membre qui n'est pas `active` ou qui ne travaille plus sur sa créatrice ;
- finir un modèle annule ses shifts pas encore commencés ; un modèle qui n'a pas commencé finit la veille de son premier jour.

**Routes** (`routes(requireRole)`, montées sous `/v1`, contrat `packages/contracts/src/scheduling.ts`), jamais pour une créatrice :
- tout membre : `GET /scheduling/settings`, `GET /scheduling/planning` (les siens seulement pour un chatteur), `GET /scheduling/my-shifts` ;
- propriétaire et managers actifs : `GET /scheduling/on-duty`, `POST /scheduling/shifts`, `PATCH /scheduling/shifts/:shiftId` (204 quand l'arrêt tombe dans la première minute et annule le shift), `DELETE /scheduling/shifts/:shiftId`, `GET /scheduling/shift-templates`, `POST /scheduling/shift-templates`, `DELETE /scheduling/shift-templates/:templateId` ;
- propriétaire seul : `PUT /scheduling/settings`.

**Job.** `scheduling.make_shifts`, chaque heure (`crontab.ts`) : les modèles en cours font leurs shifts à l'avance ; rejoué, il ne fait rien deux fois. Une transaction par modèle : un modèle en échec ne fait rien cette heure-là (un `warn` avec son id), les autres sont faits, et l'heure suivante le retente. Le modèle est verrouillé comme le verrouille sa fin (`endTemplate`) : un modèle qu'on termine pendant le job est lu terminé, et ne fait aucun shift après sa fin.

**Pour les autres modules.** `onShift(creatorId, at)` : les membres actifs dont un shift couvre `at` sur un compte de la créatrice, sans la marge (le routage d'une passation « sale », EQ-13). La liste des créatrices d'ADR 0025 (`shiftCreatorIds`, avec la marge) viendra avec EQ-13, en une lecture `*Unscoped`.

Chaque écriture entre au journal (`audit_log`) sans nom.

## Structure

- `domain/` : règles pures (fuseau, changement d'heure, conflits, arrêt, « mes shifts »), erreurs, ports. Zéro I/O.
- `application/` : le service du planning.
- `infra/` : le magasin Drizzle (`withMember`, `withTenantMember`, `withAdmin` pour les `*Unscoped`) et les routes Fastify.
- `index.ts` : **seule** porte d'entrée publique du module.

Voir `docs/architecture/modules.md` pour les règles communes.
