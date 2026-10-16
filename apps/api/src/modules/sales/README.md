# Module `sales`

**Rôle.** Phase 6. Offres à prix codés, remises planchers, ventes détectées, règles de prix.

**Peut dépendre de.** conversations, media

**Règles propres.** Propriétaire de `offers`, `sales`. Montants en centimes entiers + devise.

## Structure

- `domain/` : types, règles pures, machines d'état. Zéro I/O, zéro import de framework.
- `application/` : cas d'usage (commandes, requêtes, handlers de jobs). Orchestrent le domaine et les ports.
- `infra/` : implémentations (Drizzle, HTTP Fastify, jobs Graphile, clients externes).
- `index.ts` : **seule** porte d'entrée publique du module. Tout ce qui n'y est pas exporté est privé.

Voir `docs/architecture/modules.md` pour les règles communes et `docs/playbooks/add-a-module.md` pour en créer un.
