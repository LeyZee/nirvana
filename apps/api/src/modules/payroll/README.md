# Module `payroll`

**Rôle.** Équipe › Paie (EQ-04, ADR 0023 § Les règles d'Imperium, § Paie) : le relevé de commissions de chaque membre pour chaque quinzaine, avec les règles d'Imperium sans en changer une, au centime et en entiers, explicable ligne par ligne et reproductible.

**Peut dépendre de.** aucun module métier (feuille).

**État.** Le calcul pur (`domain/commission-statements.ts`), les contrats (`packages/contracts/src/payroll.ts`) et les tables (migration 0028). Viennent ensuite le recalcul d'un brouillon par job, la validation sous le verrou (membre, quinzaine) partagé avec les rapports, « payé » par le propriétaire seul, les routes `/v1/payroll` et les taux de change.

**Tables possédées** (migration 0028, `data-model.md` § Paie). `pay_periods`, `exchange_rates`, `payroll_settings`, `bonus_tier_sets`, `collective_goals`, `bonuses`, `penalties`, `commission_statements`, `commission_statement_lines`, `pay_adjustments`, `carry_overs`. Hors RLS des créatrices : un membre lit ses lignes, la portée `owner` | `agency` lit tout. Les relevés, leurs lignes, les quinzaines et les taux sont écrits par les jobs (`withAdmin`). Des déclencheurs gardent le passé pour tous les rôles : un relevé validé ne change plus que vers « payé », les quinzaines se ferment dans l'ordre, et rien n'arrive sur une quinzaine fermée.

**Le calcul** (`computeCommissionStatements`, testé par des cas de référence écrits à la main et par des propriétés) : une fonction pure de toute la quinzaine, sans horloge ni base, qui rend un relevé par membre qui a quelque chose dedans, et la version du moteur (`ENGINE_VERSION`) qui l'a fait. Toute la quinzaine, parce que l'objectif collectif et la part d'équipe d'un manager dépendent des autres membres : un relevé ne se recalcule jamais seul.

- compte par compte, sur le total du compte pour la quinzaine, jamais vente par vente : brut → euros (taux en millionièmes) → hors TVA → net de la commission de la plateforme → commission du membre. Chaque étape est arrondie au centime, demi qui s'éloigne de zéro, négatifs compris (`mulDivRound`, produit en `bigint`), et nulle part ailleurs. Une devise sans taux n'est jamais devinée (`exchange_rate_missing_conflict`) ;
- palier : le plus haut que le net du membre atteint, seuil atteint au centime compris, jamais pour un manager. Deux paliers au même seuil : la plus grosse prime, pour que l'ordre ne compte jamais ;
- objectif collectif : sur le net de toute l'équipe, ventes des managers comprises, comparé exactement ; sa prime va à chaque chatteur qu'il couvre, ventes ou pas, jamais à un manager ;
- primes manuelles : à tout membre, managers compris ;
- malus fixes et en pourcentage du net du membre, plafonnés à sa part (commission et part d'équipe) plus ses primes : un relevé n'est jamais négatif à cause d'un malus ;
- part d'équipe d'un manager : son taux sur le net des autres membres, son propre net étant déjà payé par sa commission ;
- ce qui vient d'avant (reports, ajustements) s'ajoute au total ; un total sous le minimum de versement, ou sous zéro (un ajustement plus grand que la quinzaine), est reporté sur la suivante et rien n'est versé. Le relevé final d'un membre qui part verse tout, sous le minimum aussi ;
- une vente tardive (un rapport validé après la validation de sa quinzaine pour le membre) entre dans le total de son compte sur la quinzaine où elle est portée, comme Imperium la redatait.

**Ce qui diffère du code d'Imperium**, comme l'ADR et la fiche le décident : tout est entier et chaque arrondi est écrit (Imperium calculait en flottants) ; un malus est plafonné à la part plus les primes, jamais au net plus les primes ; la part d'équipe d'un manager ne compte pas son propre net une seconde fois.
