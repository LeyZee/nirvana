# Module `scripts`

**Rôle.** Phase 6. Structures, étapes, cartons, runs de script par conversation (machine d'état explicite).

**Peut dépendre de.** sales, media, conversations

**Règles propres.** Propriétaire de `scripts`, `script_steps`, `script_runs`, `cards`.

## Structure

- `domain/` : types, règles pures, machines d'état. Zéro I/O, zéro import de framework.
- `application/` : cas d'usage (commandes, requêtes, handlers de jobs). Orchestrent le domaine et les ports.
- `infra/` : implémentations (Drizzle, HTTP Fastify, jobs Graphile, clients externes).
- `index.ts` : **seule** porte d'entrée publique du module. Tout ce qui n'y est pas exporté est privé.

Voir `docs/architecture/modules.md` pour les règles communes et `docs/playbooks/add-a-module.md` pour en créer un.
