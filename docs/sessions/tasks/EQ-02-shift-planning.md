# EQ-02 Planning des shifts et « qui est en poste »
Statut : in-progress (lot 2 de l'ADR 0023, ID validé par Charles le 27/10/2026)
Phase : équipe (ADR 0023)
Dépend de : EQ-01 ; pour l'écran, EQ-11
Branche : task/eq-02-shift-planning

## Objectif
Planifier qui chatte sur quelle créatrice et quand, et répondre partout à « qui est en poste sur cette créatrice maintenant ? ».

## Contexte à lire
`docs/adr/0023-team-management.md`, `docs/architecture/data-model.md`, ADR 0011 (temps en UTC, affichage dans le fuseau), `docs/design/README.md`. Concept d'origine : grille d'Imperium à 4 créneaux de 6 h, affichée dans le fuseau de chaque membre.

## À faire
- [x] Contrats : `Shift` (créatrice, compte plateforme, membre, début et fin en UTC), `ShiftTemplate` (jour de semaine, créneau, membre), `LeaveRequest`, `ShiftSwapRequest` avec leurs états (les deux derniers selon l'ADR 0031, `proposed`).
- [ ] Domaine pur : créneaux de l'agence (`ShiftSlot`, 4 × 6 h par défaut, réglables ; jamais `slot` seul, pris par `KycSlot`), conversion dans le fuseau d'un membre, conflits (un membre sur deux shifts qui se chevauchent ; deux membres sur le même compte et le même créneau), génération des shifts depuis les modèles récurrents (idempotente), « en poste » à un instant donné.
- [ ] Base (via le propriétaire de `packages/db`) : `shifts`, `shift_templates` (fait, migration 0021), `leave_requests` avec `member_id` seul et la politique des tables de l'équipe (ADR 0031 : un congé n'a pas de créatrice), `shift_swap_requests` avec les deux créatrices et les deux membres et la RLS de l'ADR 0023 (la créatrice **et** le membre lui-même ou le scope `agency`). Vue « en poste » pour la créatrice : nom affiché et créneau seulement, jamais `team_members`.
- [ ] Module `scheduling` : CRUD, matérialisation des modèles par un job Graphile rejouable, congés (le propriétaire ou un manager actif valide, jamais le sien) et échanges entre chatteurs sans manager, que le propriétaire ou un manager actif peut annuler (Charles, 27/10 20h39 ; ADR 0031), `onShift(creatorId, at)` exporté par `index.ts`.
- [ ] Écrans, à la place que fixe l'ADR 0024 : le planning de l'équipe (semaine, par créatrice, fuseau au choix, conflits signalés) et celui d'un chatteur (le sien, celui de l'équipe, congés et échanges).
- [ ] Rappel de shift et « shift sans rapport » dans l'application (À traiter du membre), pas sur Telegram ; sur le téléphone, la prise de poste et le shift non pris viennent avec EQ-12.

## Critères d'acceptation
- Tests du domaine : créneau de nuit à cheval sur minuit, changement d'heure été/hiver, conflit détecté, modèle récurrent rejoué sans doublon.
- Tests d'intégration : un chatteur ne voit que les shifts de ses créatrices et ne lit pas les congés d'un autre chatteur de la même créatrice ; la créatrice ne lit ni taux ni pays par la vue « en poste ».
- Congés et échanges (ADR 0031) : un congé validé et un shift posé au même moment ne réussissent pas tous les deux ; la validation refuse tant qu'un shift du membre couvre le congé ; un échange accepté suit les règles d'un shift posé à la main, et les autres propositions sur ces shifts tombent ; un chatteur ne lit d'un collègue que son nom affiché et ses shifts à venir, par la liste des candidats.
- Finition (Charles, 27/10, 15h22 : « que ce soit vraiment très joli… des hovers partout… une belle hiérarchie des informations ») : chaque écran passe la barre de `docs/design/README.md` § Finition d'un écran, preuves comprises (captures Nuit et Jour, bureau et téléphone, mouvement réduit).

## Hors périmètre
Rapports de fin de shift (fiche suivante), paie, routage hybride.

## Notes de session
- 2026-10-27 (fil Équipe) : contrat posé, `packages/contracts/src/scheduling.ts` : réglages du planning (fuseau de la grille, créneaux, marge d'accès), shifts sur [début, fin) en UTC, modèles de shift, lecture du planning avec ses conflits, « en poste » et « mes shifts ». Un membre n'est jamais sur deux shifts à la fois, un compte n'a jamais deux membres à la fois. Suite : migration 0021 (accord de Bilan), module `scheduling` et son job, écrans ; congés et échanges dans un second contrat.
- 2026-10-27 (fil Extension) : écrans côté `apps/web` sur le contrat #197 : Équipe › Planning (semaine par compte et par jour, fuseau de l'agence ou le sien, filtre par créatrice, « En poste maintenant », modèles non posés en ambre, ajout d'un shift ou d'un modèle, fiche d'un shift : changer, raccourcir, arrêter, annuler, arrêter le modèle), Aujourd'hui et Planning du chatteur. Ils lisent `/v1/scheduling/*` : tant que le module `scheduling` n'est pas dans `main`, ils disent « Le serveur ne répond pas ». Reste : congés et échanges (second contrat).
- 2026-10-27 (fil Équipe) : tables (migration 0021, #203) et module `scheduling` : domaine pur (fuseau de la grille, trou de printemps et heure doublée d'automne, créneau de nuit à cheval sur minuit, conflits, arrêt d'un shift en cours, « mes shifts »), magasin sous `withMember` / `withTenantMember`, routes `/v1/scheduling`, job horaire `scheduling.make_shifts` (rejoué sans doublon), `onShift(creatorId, at)` exporté par `index.ts`. Reste : congés et échanges (second contrat, tables, routes), rappel de shift.
- 2026-10-27 (fil Équipe) : second contrat, congés et échanges (`LeaveRequest`, `ShiftSwapRequest`, routes `/v1/scheduling/leave-requests` et `/v1/scheduling/swap-requests`, liste des candidats d'un échange), et l'ADR 0031 `proposed` : un congé appartient au membre et n'a pas de créatrice (remplace ce point de l'ADR 0023 § Données et RLS) ; les échanges se font entre chatteurs, sans manager (carte de Charles, 27/10 20h39). `PlanningConflict` prend la raison `member_on_leave`. Le contrat du `PATCH` dit enfin le 204 d'un shift annulé. Suite : acceptation de l'ADR 0031 par Charles, puis migration (numéro donné par Bilan), module et écrans.
