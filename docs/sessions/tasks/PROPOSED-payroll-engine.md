# Moteur de paie : calcul pur, périodes, verrou (ID à proposer)
Statut : proposed (lot 3 de l'ADR 0023, ID à valider par Charles)
Phase : équipe (ADR 0023)
Dépend de : fiches Équipe et Rapports de fin de shift
Branche : task/<id>-payroll-engine

## Objectif
Calculer la paie de chaque membre par quinzaine de façon exacte, explicable et reproductible au centime, avec un cycle brouillon → validée → payée qui ne laisse rien modifier en arrière.

## Contexte à lire
`docs/adr/0023-team-management.md` (§ Paie, en entier), ADR 0011, `docs/conventions/testing.md`, `docs/conventions/security.md`. Concept d'origine : la chaîne de calcul d'Imperium (brut → euros → hors TVA → net de commission plateforme → part du chatteur, paliers, objectif collectif, primes, malus plafonnés, part d'équipe des managers, report des petits montants).

## À faire
- [ ] Contrats : `PayPeriod`, `PayRules` (taux du membre, TVA et commission par plateforme, paliers individuels, objectif collectif et ses paliers, minimum de versement), `PayslipInput`, `Payslip` (lignes par compte, primes, malus, report, ajustements, total, taux de change avec sa source et sa date, copie des règles).
- [ ] Domaine pur `computePayslip(input, rules)` : aucune horloge, aucune I/O. Ordre et arrondis exactement comme l'ADR ; malus fixes et en pourcentage plafonnés à la part plus les primes ; palier le plus haut atteint ; heures × taux horaire en mode `hourly` ou `both` ; part du net de l'équipe pour un manager (sans compter sa propre part deux fois) ; report sous le minimum de versement.
- [ ] Machine d'états `draft` → `validated` → `paid` ; `paid` immuable, ajustement sur la prochaine période ouverte.
- [ ] Application : recalcul d'un brouillon à chaque changement de ses entrées (rapport validé, malus, prime, taux à partir d'une date) par un job rejouable ; validation en transaction (copie des règles et du taux, verrou de la période pour ce membre) ; « payée » réservé au propriétaire ; `audit_log` partout.
- [ ] Taux de change : une source, rafraîchie par un job, valeur et date gardées ; la fiche copie le taux du jour de validation ; jamais de taux codé en dur.
- [ ] Base (via le propriétaire de `packages/db`) : `pay_periods`, `payslips`, `payslip_lines`, `pay_adjustments`, `bonuses`, `penalties`, `carry_overs`, `bonus_tiers`, `exchange_rates`, politique par utilisateur.

## Critères d'acceptation
- Cas de référence écrits à la main avec des montants inventés, recalculés au centime : compte en euros avec TVA, compte en dollars sans TVA, palier atteint pile au seuil, malus supérieur à la part (plafonné), manager avec part d'équipe, report puis versement, ajustement après « payée ».
- Tests par propriétés (dépendance à décider dans la fiche) : total jamais négatif, recalculer une fiche validée donne la même fiche, l'ordre des ventes ne change rien, un rejeu du job n'écrit rien de plus.
- Test d'intégration : deux recalculs concurrents ne produisent qu'un brouillon ; une période payée refuse toute écriture.

## Hors périmètre
Écrans et factures PDF (fiche suivante), ventes détectées et attribution (lot hybride).

## Notes de session
