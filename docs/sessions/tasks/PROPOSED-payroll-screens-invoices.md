# Paie : écrans et factures automatiques (ID à proposer)
Statut : proposed (lot 3 de l'ADR 0023, ID à valider par Charles)
Phase : équipe (ADR 0023)
Dépend de : fiche Moteur de paie (`PROPOSED-payroll-engine.md`)
Branche : task/<id>-payroll-screens-invoices

## Objectif
Valider et payer les paies depuis Équipe > Paie, laisser chaque chatteur voir et télécharger sa fiche et sa facture, et produire les factures automatiquement à la validation.

## Contexte à lire
`docs/adr/0023-team-management.md` (§ Paie, § Factures, § Navigation), `docs/design/README.md`, `packages/design-system/README.md`, `docs/conventions/api.md`.

## À faire
- [ ] Routes : périodes, fiches d'une période, détail d'une fiche (chaque ligne explique d'où elle vient), valider (manager ou propriétaire), marquer payée (propriétaire), malus et primes manuels avec motif.
- [ ] Factures : numérotation sans trou dans une transaction, PDF produit une fois à la validation puis gardé tel quel ; mentions légales et coordonnées de l'agence en réglages. Dépendance PDF à décider dans la fiche. Le mode (autofacturation, numérotation par membre ou commune) attend la réponse du comptable de l'agence : la fiche s'arrête là-dessus avant la première facture réelle.
- [ ] Écrans : Équipe > Paie (période en cours, statut par membre, écarts avec la période précédente, validation en lot, verrou visible), Ma paie pour le chatteur (« parcours de ton argent » : du brut à ce que tu touches, ligne par ligne), téléchargement de la fiche et de la facture.
- [ ] Export comptable de la période (CSV) pour le propriétaire.

## Critères d'acceptation
- Une facture n'a jamais deux numéros, un numéro n'est jamais sauté, même avec deux validations simultanées (test d'intégration).
- Le PDF d'une fiche payée est identique au téléchargement suivant.
- Un chatteur ne voit que ses fiches ; « Le serveur ne répond pas » plutôt qu'un faux état vide.

## Hors périmètre
Facturation des créatrices et pénalités de retard, rapprochement bancaire (plus tard selon l'ADR).

## Notes de session
