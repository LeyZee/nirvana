# EQ-02 Planning des shifts et « qui est en poste »
Statut : todo (lot 2 de l'ADR 0023, ID validé par Charles le 27/10/2026)
Phase : équipe (ADR 0023)
Dépend de : EQ-01 ; pour l'écran, EQ-11
Branche : task/eq-02-shift-planning

## Objectif
Planifier qui chatte sur quelle créatrice et quand, et répondre partout à « qui est en poste sur cette créatrice maintenant ? ».

## Contexte à lire
`docs/adr/0023-team-management.md`, `docs/architecture/data-model.md`, ADR 0011 (temps en UTC, affichage dans le fuseau), `docs/design/README.md`. Concept d'origine : grille d'Imperium à 4 créneaux de 6 h, affichée dans le fuseau de chaque membre.

## À faire
- [ ] Contrats : `Shift` (créatrice, compte plateforme, membre, début et fin en UTC), `ShiftTemplate` (jour de semaine, créneau, membre), `LeaveRequest`, `ShiftSwapRequest` avec leurs états.
- [ ] Domaine pur : créneaux de l'agence (`ShiftSlot`, 4 × 6 h par défaut, réglables ; jamais `slot` seul, pris par `KycSlot`), conversion dans le fuseau d'un membre, conflits (un membre sur deux shifts qui se chevauchent ; deux membres sur le même compte et le même créneau), génération des shifts depuis les modèles récurrents (idempotente), « en poste » à un instant donné.
- [ ] Base (via le propriétaire de `packages/db`) : `shifts`, `shift_templates`, `leave_requests`, `shift_swap_requests`, avec `creator_id` et `member_id` ; RLS sur les deux pour les congés et les échanges (la créatrice **et** le membre lui-même ou le scope `agency`). Vue « en poste » pour la créatrice : nom affiché et créneau seulement, jamais `team_members`.
- [ ] Module `scheduling` : CRUD, matérialisation des modèles par un job Graphile rejouable, demandes de congé et d'échange (manager ou propriétaire valident), `onShift(creatorId, at)` exporté par `index.ts`.
- [ ] Écrans, à la place que fixe l'ADR 0024 : le planning de l'équipe (semaine, par créatrice, fuseau au choix, conflits signalés) et celui d'un chatteur (le sien, celui de l'équipe, congés et échanges).
- [ ] Rappel de shift et « shift sans rapport » dans l'application (À traiter du membre), pas sur Telegram.

## Critères d'acceptation
- Tests du domaine : créneau de nuit à cheval sur minuit, changement d'heure été/hiver, conflit détecté, modèle récurrent rejoué sans doublon.
- Tests d'intégration : un chatteur ne voit que les shifts de ses créatrices et ne lit pas les congés d'un autre chatteur de la même créatrice ; la créatrice ne lit ni taux ni pays par la vue « en poste ».

## Hors périmètre
Rapports de fin de shift (fiche suivante), paie, routage hybride.

## Notes de session
