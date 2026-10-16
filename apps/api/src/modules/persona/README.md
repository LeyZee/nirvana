# Module `persona`

**Rôle.** Chargement, validation (Zod) et versionnage des personas depuis `personas/*.yaml` vers `persona_versions`.

**Peut dépendre de.** aucun

**Règles propres.** Propriétaire de `persona_versions`. Expose `getActivePersona(creatorId)`. Jamais de logique de génération ici.

## Structure

- `domain/` : types, règles pures, machines d'état. Zéro I/O, zéro import de framework.
- `application/` : cas d'usage (commandes, requêtes, handlers de jobs). Orchestrent le domaine et les ports.
- `infra/` : implémentations (Drizzle, HTTP Fastify, jobs Graphile, clients externes).
- `index.ts` : **seule** porte d'entrée publique du module. Tout ce qui n'y est pas exporté est privé.

Voir `docs/architecture/modules.md` pour les règles communes et `docs/playbooks/add-a-module.md` pour en créer un.
