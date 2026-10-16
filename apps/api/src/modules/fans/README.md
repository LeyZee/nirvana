# Module `fans`

**Rôle.** CRM : faits mémorisés (déclaré / déduit, source, confiance, rétention), résumé opérationnel, slots KYC.

**Peut dépendre de.** aucun module métier (feuille)

**Règles propres.** Propriétaire de `fans`, `fan_facts`, `fan_summaries`. Ne connaît pas les plateformes au-delà de `platform_account_id` ; `fans.platform_meta` garde les métadonnées brutes de la plateforme. Expose `upsertFanByPlatformId` (utilisé par `conversations.ingestMessage`, créé en P0-05) et `getFan`.

## Structure

- `domain/` : types, règles pures, machines d'état. Zéro I/O, zéro import de framework.
- `application/` : cas d'usage (commandes, requêtes, handlers de jobs). Orchestrent le domaine et les ports.
- `infra/` : implémentations (Drizzle, HTTP Fastify, jobs Graphile, clients externes).
- `index.ts` : **seule** porte d'entrée publique du module. Tout ce qui n'y est pas exporté est privé.

Voir `docs/architecture/modules.md` pour les règles communes et `docs/playbooks/add-a-module.md` pour en créer un.
