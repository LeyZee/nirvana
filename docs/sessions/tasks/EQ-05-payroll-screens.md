# EQ-05 Paie : écrans de validation, de paiement et commissions du chatteur
Statut : todo (lot 3 de l'ADR 0023, ID validé par Charles le 27/10/2026)
Phase : équipe (ADR 0023)
Dépend de : EQ-04 ; pour l'écran, EQ-11
Branche : task/eq-05-payroll-screens

## Objectif
Valider et payer les paies depuis l'écran de paie, à la place que fixe l'ADR 0024, et laisser chaque chatteur suivre ses commissions, période par période, ligne par ligne.

## Contexte à lire
`docs/adr/0023-team-management.md` (§ Paie), `docs/adr/0024-roles-and-navigation.md`, `docs/design/README.md`, `packages/design-system/README.md`, `docs/conventions/api.md`.

## À faire
- [ ] Routes : périodes, relevés d'une période, détail d'un relevé (chaque ligne explique d'où elle vient), valider (manager ou propriétaire), marquer payé (propriétaire : date, moyen, référence du transfert, montant envoyé), malus et primes manuels avec motif.
- [ ] Écrans (avec le fil propriétaire d'`apps/web`, à la place que fixe l'ADR 0024) : la paie de l'équipe (période en cours, statut par membre, écarts avec la période précédente, validation en lot, verrou visible, avertissements ambre d'EQ-06 quand elle existe) ; les commissions du chatteur (« parcours de ton argent » : du brut à ce que tu touches, ligne par ligne, report et versement attendu).
- [ ] Vocabulaire du glossaire : relevé de commissions, commission, malus ; jamais « fiche de paie » ni « salaire » dans ce que voit un chatteur.

## Critères d'acceptation
- Un chatteur ne voit que ses relevés ; « Le serveur ne répond pas » plutôt qu'un faux état vide.
- Valider deux fois le même relevé ne fait rien de plus ; un brouillon modifié entre l'affichage et la validation donne le message du 409, pas une erreur brute.
- « Payé » est absent pour un manager (masqué et refusé par l'API).

## Hors périmètre
Factures, avoirs et export comptable (EQ-06), facturation des créatrices et pénalités de retard, rapprochement bancaire (plus tard selon l'ADR).

## Notes de session
