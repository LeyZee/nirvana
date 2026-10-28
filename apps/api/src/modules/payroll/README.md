# Module `payroll`

**Rôle.** Équipe › Paie (EQ-04, ADR 0023 § Les règles d'Imperium, § Paie) : le relevé de commissions de chaque membre pour chaque quinzaine, avec les règles d'Imperium sans en changer une, au centime et en entiers, explicable ligne par ligne et reproductible.

**Peut dépendre de.** aucun module métier (feuille). Un port, branché par le composition root (`PayInputReads`) : les rapports validés et le fuseau de l'agence, venus du module `scheduling`, les membres et leurs taux, venus du module `team`, lus dans la transaction de la paie, jamais par leurs tables.

**État.** Le calcul pur (`domain/commission-statements.ts`), les contrats (`packages/contracts/src/payroll.ts`), les tables (migration 0028), la clôture de la quinzaine pour toute l'équipe (ADR 0032, migration 0029), le recalcul des brouillons par job et la lecture d'une quinzaine. Viennent ensuite la validation qui clôture sous les verrous `payroll.close` puis (membre, quinzaine), « payé » par le propriétaire seul, les entrées (primes, malus, ajustements, paliers, objectifs) et les taux de change.

**Le recalcul** (`domain/recalculation.ts`, pur ; `application/recalculation.ts` ; `infra/job-store.ts`, connexion admin) :
- `payroll.recalculate {period}` recalcule toute la quinzaine sous le verrou `payroll.close`, puis, si elle est clôturée, la première quinzaine non clôturée de l'équipe, où vont les rapports tardifs. `payroll.recalculate_open`, chaque heure, recalcule chaque quinzaine ouverte jusqu'à la quinzaine en cours ;
- les rapports d'une quinzaine se décident par le registre (ADR 0032) : une quinzaine clôturée compte exactement ce que sa clôture a inscrit ; une quinzaine ouverte compte ses rapports qu'aucune clôture n'a inscrits, et la première ouverte compte en plus les tardifs, qui gardent les règles de leur quinzaine d'origine et le disent (`lateReports`). Une quinzaine d'avant la première clôture n'est plus jamais calculée ;
- taux : ceux de la clôture une fois la quinzaine clôturée, sinon le dernier lu le dernier jour de la quinzaine ou avant, pour chaque devise payée, dans un seul ordre (`canonicalExchangeRates`). Une devise sans taux, ou un membre à payer sans taux de commission en vigueur, laisse la quinzaine sans calcul et le job le dit (`warn`) : rien n'est deviné ;
- un brouillon prend la révision suivante seulement si son contenu change (`inputs_hash`, SHA-256 du texte canonique de tout le relevé) : un rejeu n'écrit rien. Un brouillon qui ne compte plus rien prend une révision à zéro ; un relevé validé n'est jamais réécrit, et un écart est journalisé (`error`) ;
- une quinzaine clôturée doit redonner le net d'équipe et l'objectif de sa clôture, sinon rien n'est écrit.

**La lecture** (`GET /v1/payroll/periods/:period`, `withMember`) : tous les relevés pour le propriétaire et un manager actif, le sien pour un membre, la clôture, les paliers et l'objectif en vigueur. Un membre ne voit le net de l'équipe dans son relevé que si la quinzaine a un objectif collectif (défaut posé tant que Charles n'a pas tranché).

**Tables possédées** (migrations 0028 et 0029, `data-model.md` § Paie). `pay_periods`, `exchange_rates`, `payroll_settings`, `bonus_tier_sets`, `collective_goals`, `bonuses`, `penalties`, `commission_statements`, `commission_statement_lines`, `pay_adjustments`, `carry_overs`, `pay_period_closings`, `pay_period_reports`. Hors RLS des créatrices : un membre lit ses lignes, la portée `owner` | `agency` lit tout. Les relevés, leurs lignes, les quinzaines et les taux sont écrits par les jobs (`withAdmin`). Des déclencheurs gardent le passé pour tous les rôles : un relevé validé ne change plus que vers « payé », les quinzaines se ferment dans l'ordre, et rien n'arrive sur une quinzaine fermée.

**Le calcul** (`computeCommissionStatements`, testé par des cas de référence écrits à la main et par des propriétés) : une fonction pure de toute la quinzaine, sans horloge ni base, qui rend un relevé par membre qui a quelque chose dedans, et la version du moteur (`ENGINE_VERSION`) qui l'a fait. Toute la quinzaine, parce que l'objectif collectif et la part d'équipe d'un manager dépendent des autres membres : un relevé ne se recalcule jamais seul.

- compte par compte, sur le total du compte pour la quinzaine, jamais vente par vente : brut → euros (taux en millionièmes) → hors TVA → net de la commission de la plateforme → commission du membre. Chaque étape est arrondie au centime, demi qui s'éloigne de zéro, négatifs compris (`mulDivRound`, produit en `bigint`), et nulle part ailleurs. Une devise sans taux n'est jamais devinée (`exchange_rate_missing_conflict`) ;
- palier : le plus haut que le net du membre atteint, seuil atteint au centime compris, jamais pour un manager. Deux paliers au même seuil : la plus grosse prime, pour que l'ordre ne compte jamais ;
- objectif collectif : sur le net de toute l'équipe, ventes des managers comprises, comparé exactement ; sa prime va à chaque chatteur qu'il couvre, ventes ou pas, jamais à un manager ;
- primes manuelles : à tout membre, managers compris ;
- malus fixes et en pourcentage du net du membre, plafonnés à sa part (commission et part d'équipe) plus ses primes : un relevé n'est jamais négatif à cause d'un malus ;
- part d'équipe d'un manager : son taux sur le net des autres membres, son propre net étant déjà payé par sa commission ;
- ce qui vient d'avant (reports, ajustements) s'ajoute au total ; un total sous le minimum de versement, ou sous zéro (un ajustement plus grand que la quinzaine), est reporté sur la suivante et rien n'est versé. Le relevé final d'un membre qui part verse tout, sous le minimum aussi ;
- une vente tardive (un rapport validé après la clôture de sa quinzaine, ADR 0032) entre dans le total de son compte sur la quinzaine où elle est portée, la première non clôturée de l'équipe, comme Imperium la redatait.

**Ce qui diffère du code d'Imperium**, comme l'ADR et la fiche le décident : tout est entier et chaque arrondi est écrit (Imperium calculait en flottants) ; un malus est plafonné à la part plus les primes, jamais au net plus les primes ; la part d'équipe d'un manager ne compte pas son propre net une seconde fois.
