# 2026-10-19 · Interrupteur global hors d'atteinte des créatrices (revue 09, G16)

Fait :
- Avant, la politique de `kill_switches` laissait une créatrice, dans `withTenant`, écrire une ligne globale (`creator_id` nul), et aussi modifier ou supprimer les lignes globales existantes : `USING` et `WITH CHECK` acceptaient `creator_id IS NULL`.
- Maintenant, `tenant_isolation` est la politique commune (sa créatrice seulement), et `global_read` ajoute la lecture des lignes globales, rien d'autre. Seul `withAdmin` (`pnpm ops:kill-switch`) pose un interrupteur global.
- Migration 0010 générée par drizzle-kit, additive : `CREATE POLICY` et `ALTER POLICY`, aucune donnée touchée.
- Test RLS : insertion globale refusée, mise à jour et suppression sans effet, la ligne reste intacte.
- `data-model.md` est à jour.

Pas fait : le reste de G16 (ID des fiches déjà codées, ADR 0015 et 0018 à passer en `accepted`, `identity_policy` lu ou retiré) relève de la coordination et des décisions de Charles.

Décisions : deux politiques permissives plutôt qu'une politique par commande. Postgres les combine en OU pour la lecture, et seule `tenant_isolation` s'applique à l'écriture.

Relectures : aucune (packages/db, zone Bilan).

Découvertes : aucune.

Candidats à suppression : aucun.

Vérifié : `pnpm check` (dont la dérive du schéma) ; intégration `packages/db` (34 tests) et `apps/api`.
