# 2026-10-29 — Liste des quinzaines : ce qui est dû et reporté, compté sur les relevés validés — done
Fait : `PayPeriodSummary` (`GET /v1/payroll/periods`) ne donnait que des sommes sur tous les relevés, ceux à valider compris. Historique et Quinzaine affichaient donc deux montants différents pour une même quinzaine en cours de validation, et `carried` comptait comme « reporté » un relevé à valider sous le minimum. Le contrat ajoute `validatedPayableMinor` (somme à verser des relevés validés ou payés) et `carriedMinor` (somme qu'ils ont reportée). `carried` ne compte plus que les relevés validés ou payés, et `payableMinor` reste la somme de tous les relevés. Les sommes sont calculées en SQL dans `read-store.ts`. Côté web, `summaryOf` et la fausse API reproduisent le serveur ; les écrans ne lisent pas encore les nouveaux champs.
Pas fait : faire lire `validatedPayableMinor` et `carriedMinor` par Historique et Commissions (apps/web, #294 ou à sa suite).
Décisions : « reste à envoyer » = `validatedPayableMinor − paidMinor` partout ; rien n'est dû ni reporté avant une validation.
Découvertes : aucune (relevé par Équipe en relisant #294).
Candidats à suppression : aucun.
Vérifié : `payroll-periods.integration.test.ts` ✓ (4), unitaires payroll ✓ (109), web ✓ (747), typecheck api/web/contracts ✓.
