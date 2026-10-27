# EQ-04 Moteur de paie : calcul pur, périodes, verrou
Statut : todo (lot 3 de l'ADR 0023, ID validé par Charles le 27/10/2026)
Phase : équipe (ADR 0023)
Dépend de : EQ-01, EQ-03
Branche : task/eq-04-payroll-engine

## Objectif
Calculer la paie de chaque membre par quinzaine avec **les règles d'Imperium, sans en changer une**, de façon exacte, explicable et reproductible au centime, avec un cycle brouillon → validé → payé qui ne laisse rien modifier en arrière.

## Contexte à lire
`docs/adr/0023-team-management.md` (§ Les règles d'Imperium, § Paie, en entier), ADR 0011, `docs/conventions/testing.md`, `docs/conventions/security.md`. Concept d'origine : la chaîne de calcul d'Imperium (brut → euros → hors TVA → net de commission plateforme → part du chatteur, paliers, objectif collectif, primes, malus plafonnés, part d'équipe des managers, report des petits montants, vente tardive sur la période suivante). Une différence de résultat avec Imperium est un bogue, sauf l'arrondi : Imperium calculait en flottants, ici tout est entier et chaque arrondi est écrit.

## À faire
- [ ] Contrats : `PayPeriod`, `PayRules` (taux de commission du membre, TVA et commission par plateforme, paliers individuels, objectif collectif et ses paliers, minimum de versement), `CommissionStatementInput`, `CommissionStatement` (lignes par compte, primes, malus, report, ajustements, total, taux de change avec sa source et sa date, copie des règles).
- [ ] Domaine pur `computeCommissionStatement(input, rules)` : aucune horloge, aucune I/O, entiers seulement (unités mineures, points de base, `rate_micros`). Calcul sur le total du compte pour la période, jamais vente par vente ; arrondi demi qui s'éloigne de zéro, négatifs compris, après chaque étape de l'ADR et nulle part ailleurs ; `engine_version` dans la sortie ; rémunération à la commission seulement ; malus fixes et en pourcentage plafonnés à la part plus les primes ; palier le plus haut atteint ; objectif collectif sans les managers ; part du net de l'équipe pour un manager (sans compter sa propre part deux fois) ; report sous le minimum de versement ; vente arrivée après validation portée sur la période suivante avec sa période d'origine.
- [ ] Machine d'états `draft` → `validated` → `paid` ; `paid` immuable, ajustement sur la prochaine période ouverte.
- [ ] Application : recalcul d'un brouillon à chaque changement de ses entrées (rapport validé, malus, prime, taux à partir d'une date) par un job de `jobKey` (membre, période) ; lecture des rapports de plusieurs créatrices par une boucle `withTenant` par créatrice (ou une lecture `withAdmin` bornée à ce job), jamais une politique élargie ; validation en transaction sous le verrou consultatif (membre, période) partagé avec les rapports, avec copie des règles, du taux et d'`engine_version`, et `inputs_hash` comparé au brouillon affiché (409 s'il diffère) ; « payé » réservé au propriétaire ; `audit_log` partout. La validation expose un point d'accroche dans sa transaction où EQ-06 créera la facture.
- [ ] Taux de change : une source, rafraîchie par un job, valeur et date gardées ; le relevé copie le taux du jour de validation ; jamais de taux codé en dur.
- [ ] Base (via le propriétaire de `packages/db`) : `pay_periods`, `commission_statements` (unique par membre et période, `inputs_hash`, `engine_version`), `commission_statement_lines`, `pay_adjustments`, `bonuses`, `penalties`, `carry_overs` (unique par membre et période d'origine), `bonus_tiers`, `exchange_rates` (`rate_micros bigint`), politique par utilisateur. Trigger qui refuse `UPDATE` et `DELETE` d'un relevé `validated` ou `paid` sauf `validated` → `paid` ; lignes, ajustements et reports en ajout seul (`REVOKE UPDATE, DELETE`).

## Critères d'acceptation
- Cas de référence écrits à la main avec des montants inventés, recalculés au centime, **au moins un par règle d'Imperium** listée dans l'ADR : compte en euros avec TVA, compte en dollars sans TVA, palier atteint pile au seuil, objectif collectif atteint (manager exclu), prime manuelle, malus en pourcentage, malus supérieur à la part (plafonné), arrondi d'un demi-centime positif et négatif, manager avec part d'équipe, report puis versement, vente tardive portée sur la période suivante, ajustement après « payé ».
- Tests d'intégration de la base : le trigger refuse la modification d'un relevé validé ou payé ; un rapport arrivé pendant la validation donne un 409, pas un relevé faux.
- Tests par propriétés (dépendance à décider dans la fiche) : total jamais négatif, recalculer un relevé validé donne le même relevé, l'ordre des ventes ne change rien, un rejeu du job n'écrit rien de plus.
- Test d'intégration : deux recalculs concurrents ne produisent qu'un brouillon ; une période payée refuse toute écriture.

## Hors périmètre
Écrans (EQ-05), factures et avoirs (EQ-06), import de l'historique (EQ-07), ventes détectées et attribution (EQ-08).

## Notes de session
